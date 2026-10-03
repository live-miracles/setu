// Isolated PostgreSQL check for viewer-read-only draft inserts and the lead
// email trigger; does not connect to hosted data. Run:
// node build-tools/viewer-lead-email-db-check.mjs /absolute/path/to/pglite/dist/index.js
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
        create role authenticated;
        create schema auth;
        create function auth.uid() returns uuid language sql stable
          as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create table public.profiles (id uuid primary key, role text not null);
        create function public.current_role() returns text language sql stable security definer
          as $$ select role from public.profiles where id = auth.uid() $$;
        grant usage on schema public to authenticated;
        grant execute on function public.current_role() to authenticated;
        grant select on public.profiles to authenticated;
        create table public.inventory_requests (
          id uuid primary key default gen_random_uuid(),
          requester_id uuid not null,
          status text not null default 'draft',
          lead_email text not null default ''
        );
        create table public.program_requests (like public.inventory_requests including all);
        alter table public.inventory_requests enable row level security;
        alter table public.program_requests enable row level security;
        grant insert, update, select on public.inventory_requests, public.program_requests to authenticated;
        create policy "requesters create inventory drafts" on public.inventory_requests
          for insert to authenticated with check (requester_id = auth.uid() and status = 'draft');
        create policy "requesters create program drafts" on public.program_requests
          for insert to authenticated with check (requester_id = auth.uid() and status = 'draft');
        create policy read_all on public.inventory_requests for select to authenticated using (true);
        create policy read_all2 on public.program_requests for select to authenticated using (true);
        insert into public.profiles values ('${uuid(1)}', 'user'), ('${uuid(2)}', 'viewer');
        -- Legacy row written before the trigger existed.
        insert into public.inventory_requests (requester_id, lead_email)
          values ('${uuid(1)}', 'a@x.org,b@y.org');
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261003020000_viewer_read_only_and_lead_email_check.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    await asUser(uuid(1));
    for (const table of ['inventory_requests', 'program_requests']) {
        await db.exec(
            `insert into public.${table} (requester_id, lead_email) values ('${uuid(1)}', 'lead@example.org')`,
        );
        await db.exec(`insert into public.${table} (requester_id) values ('${uuid(1)}')`);
        for (const bad of ['a@x.org,b@y.org', 'a@x.org;b@y.org', 'no-at', 'a b@x.org', 'a@x']) {
            await assert.rejects(
                db.exec(
                    `insert into public.${table} (requester_id, lead_email) values ('${uuid(1)}', '${bad}')`,
                ),
                /single valid email/,
                bad,
            );
        }
    }
    // A status-only update of the legacy row is not blocked.
    await db.exec(`reset role`);
    await db.exec(
        `update public.inventory_requests set status = 'submitted' where lead_email = 'a@x.org,b@y.org'`,
    );
    await assert.rejects(
        db.exec(`update public.inventory_requests set lead_email = 'a@x.org,b@y.org'`),
        /single valid email/,
    );

    await asUser(uuid(2));
    for (const table of ['inventory_requests', 'program_requests']) {
        await assert.rejects(
            db.exec(`insert into public.${table} (requester_id) values ('${uuid(2)}')`),
            /row-level security/,
        );
    }
    console.log('viewer draft inserts and lead email trigger passed');
} finally {
    await db.close();
}
