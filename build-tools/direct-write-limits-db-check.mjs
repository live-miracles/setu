// Isolated PostgreSQL check of migration 20261202030000: a signed-in user can
// no longer insert a request directly, and their own profile edits keep the
// API's lengths. Does not connect to hosted data. Runs as part of `npm test`
// (db-checks.test.mjs); to run it alone:
// node build-tools/direct-write-limits-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asUser = (id) =>
    db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}'`);

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create function auth.uid() returns uuid language sql stable
          as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create table public.profiles (
          id uuid primary key, name text not null default '',
          phone text not null default '', whatsapp text not null default ''
        );
        create table public.inventory_requests (
          id uuid primary key default gen_random_uuid(), requester_id uuid not null,
          status text not null default 'draft', name text not null default ''
        );
        create table public.program_requests (like public.inventory_requests including all);
        alter table public.profiles enable row level security;
        alter table public.inventory_requests enable row level security;
        alter table public.program_requests enable row level security;
        grant usage on schema public to authenticated, service_role;
        grant select, update on public.profiles to authenticated;
        grant all on public.profiles to service_role;
        grant insert, select on public.inventory_requests, public.program_requests to authenticated;
        create policy own on public.profiles for all to authenticated
          using (id = auth.uid()) with check (id = auth.uid());
        -- The policies this migration drops (from 20261003020000).
        create policy "requesters create inventory drafts" on public.inventory_requests
          for insert to authenticated with check (requester_id = auth.uid() and status = 'draft');
        create policy "requesters create program drafts" on public.program_requests
          for insert to authenticated with check (requester_id = auth.uid() and status = 'draft');
        insert into public.profiles (id, name) values ('${uuid(1)}', 'Asha'), ('${uuid(2)}', '${'x'.repeat(250)}');
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261202030000_direct_write_limits.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    // No direct request inserts any more.
    await asUser(uuid(1));
    for (const table of ['inventory_requests', 'program_requests']) {
        await assert.rejects(
            db.exec(`insert into public.${table} (requester_id) values ('${uuid(1)}')`),
            /row-level security/,
            table,
        );
    }

    // Own profile edits within the limits pass; longer values are refused.
    await db.exec(
        `update public.profiles set name = 'Asha Rao', phone = '+1 202 555 0100' where id = '${uuid(1)}'`,
    );
    for (const [column, length] of [
        ['name', 201],
        ['phone', 51],
        ['whatsapp', 51],
    ]) {
        await assert.rejects(
            db.exec(
                `update public.profiles set ${column} = '${'9'.repeat(length)}' where id = '${uuid(1)}'`,
            ),
            /at most/,
            column,
        );
    }

    // An older long name does not block changing another field.
    await asUser(uuid(2));
    await db.exec(`update public.profiles set phone = '12345' where id = '${uuid(2)}'`);

    // The service role (administrator edits) is not limited by the trigger.
    await db.exec('reset role; set role service_role');
    await db.exec(`update public.profiles set name = '${'y'.repeat(300)}' where id = '${uuid(1)}'`);
    await db.exec('reset role');

    console.log('direct write limits check passed');
} finally {
    await db.close();
}
