// Isolated PostgreSQL check of migration 20261202000000: the domain allowlist
// refuses addresses that are blank or not of the form one@domain, and a
// signed-in user cannot choose a comment's time. (Its reminder change was
// replaced by 20261202020000; see overdue-reminders-db-check.mjs.) Does not
// connect to hosted data. Runs as part of
// `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/email-and-comment-time-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    // Only the columns the migration's functions read and write.
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create table public.allowed_email_domains (domain text primary key, enabled boolean not null default true);
        create table public.inventory_requests (
          id uuid primary key, status text not null, end_date date not null
        );
        create table public.comments (
          id uuid primary key default gen_random_uuid(),
          inventory_request_id uuid, author_id uuid, author_name text,
          message text not null, created_at timestamptz not null default now()
        );
        grant usage on schema public to authenticated, service_role;
        grant insert, select on public.comments to authenticated, service_role;
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261202000000_email_and_comment_time_hardening.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    const allowed = async (email) =>
        (await db.query('select public.is_email_domain_allowed($1) as ok', [email])).rows[0].ok;

    // An empty allowlist accepts any real address, never a blank or odd one.
    assert.equal(await allowed('someone@example.org'), true, 'open allowlist: real address');
    assert.equal(await allowed(''), false, 'blank address refused');
    assert.equal(await allowed(null), false, 'missing address refused');
    assert.equal(await allowed('no-at-sign'), false, 'address without @ refused');
    assert.equal(await allowed('@example.org'), false, 'address without a local part refused');

    await db.exec(`insert into public.allowed_email_domains values ('Example.org', true)`);
    assert.equal(await allowed('Someone@EXAMPLE.org'), true, 'listed domain, any case');
    assert.equal(await allowed('someone@other.org'), false, 'unlisted domain refused');
    assert.equal(await allowed('a@example.org@other.org'), false, 'two @ refused');
    assert.equal(await allowed('someone@evil-example.org'), false, 'look-alike domain refused');

    // A signed-in user's comment is stamped with the server time.
    const request = uuid(1);
    await db.exec('set role authenticated');
    await db.exec(
        `insert into public.comments (inventory_request_id, author_id, message, created_at)
         values ('${request}', '${uuid(9)}', 'backdated', '2001-01-01')`,
    );
    await db.exec('reset role');
    const stamped = (
        await db.query(
            `select created_at::date = current_date as today from public.comments where message = 'backdated'`,
        )
    ).rows[0].today;
    assert.equal(stamped, true, 'a signed-in user cannot choose created_at');

    // The service role still writes the times it is given.
    await db.exec('set role service_role');
    await db.exec(
        `insert into public.comments (inventory_request_id, author_id, message, created_at)
         values ('${request}', null, 'imported', '2001-01-01')`,
    );
    await db.exec('reset role');
    const kept = (
        await db.query(
            `select created_at::date = date '2001-01-01' as kept from public.comments where message = 'imported'`,
        )
    ).rows[0].kept;
    assert.equal(kept, true, 'service role keeps its created_at');

    console.log('email and comment time check passed');
} finally {
    await db.close();
}
