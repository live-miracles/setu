// Isolated PostgreSQL check of who may read a request: the requester, accounts
// listed as participants, and (from submission onward) the request's lead and
// participants added by email before they had an account. Does not connect to
// hosted data. Runs as part of `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/lead-and-cc-view-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asUser = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);

try {
    await db.exec(`
        create schema auth;
        create function auth.uid() returns uuid language sql stable
          as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create table public.profiles (id uuid primary key, email text not null unique, role text not null default 'user');
        create function public.current_role() returns text language sql stable security definer
          as $$ select role from public.profiles where id = auth.uid() $$;
        create table public.inventory_requests (
          id uuid primary key default gen_random_uuid(),
          requester_id uuid not null,
          status text not null default 'draft',
          lead_email text not null default ''
        );
        create table public.program_requests (like public.inventory_requests including all);
        create table public.inventory_request_participants (
          request_id uuid not null references public.inventory_requests(id),
          profile_id uuid, external_email text
        );
        create table public.program_request_participants (
          request_id uuid not null references public.program_requests(id),
          profile_id uuid, external_email text
        );
        insert into public.profiles values
          ('${uuid(1)}', 'requester@example.org', 'user'),
          ('${uuid(2)}', 'Lead@Example.org', 'user'),
          ('${uuid(3)}', 'cc@example.org', 'user'),
          ('${uuid(4)}', 'member@example.org', 'user'),
          ('${uuid(5)}', 'stranger@example.org', 'user'),
          ('${uuid(6)}', 'viewer@example.org', 'viewer'),
          ('${uuid(7)}', 'approver@example.org', 'user');
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261201000000_lead_and_cc_can_view_requests.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    for (const [kind, fn] of [
        ['inventory', 'can_view_inventory_request'],
        ['program', 'can_view_program_request'],
    ]) {
        const table = `${kind}_requests`;
        const participants = `${kind}_request_participants`;
        const make = async (status, lead) => {
            const { rows } = await db.query(
                `insert into public.${table} (requester_id, status, lead_email)
                 values ('${uuid(1)}', '${status}', '${lead}') returning id`,
            );
            const id = rows[0].id;
            await db.exec(`
                insert into public.${participants} values
                  ('${id}', '${uuid(4)}', null),
                  ('${id}', null, 'CC@example.org');
            `);
            return id;
        };
        const canView = async (user, id) => {
            await asUser(user);
            const { rows } = await db.query(`select public.${fn}('${id}') as ok`);
            return rows[0].ok;
        };

        const submitted = await make('submitted', 'lead@example.org');
        assert.equal(await canView(uuid(1), submitted), true, `${kind}: requester`);
        assert.equal(await canView(uuid(4), submitted), true, `${kind}: participant`);
        assert.equal(await canView(uuid(2), submitted), true, `${kind}: lead, any email case`);
        assert.equal(await canView(uuid(3), submitted), true, `${kind}: CC added by email`);
        assert.equal(await canView(uuid(6), submitted), true, `${kind}: viewer role`);
        assert.equal(await canView(uuid(5), submitted), false, `${kind}: stranger`);

        // Parties see drafts: the lead and an email-listed CC are parties too.
        const draft = await make('draft', 'lead@example.org');
        assert.equal(await canView(uuid(4), draft), true, `${kind}: participant sees draft`);
        assert.equal(await canView(uuid(2), draft), true, `${kind}: lead sees draft`);
        assert.equal(await canView(uuid(3), draft), true, `${kind}: external CC sees draft`);
        assert.equal(await canView(uuid(5), draft), false, `${kind}: stranger does not see draft`);

        // An empty lead email never matches anyone, and the lead of another request gets nothing.
        const noLead = await make('submitted', '');
        assert.equal(await canView(uuid(2), noLead), false, `${kind}: lead of another request`);
        assert.equal(await canView(uuid(5), noLead), false, `${kind}: empty lead`);

        // Unknown request ids and a signed-out caller see nothing.
        assert.equal(await canView(uuid(2), uuid(99)), false, `${kind}: unknown request`);
        await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
        const { rows } = await db.query(`select public.${fn}('${submitted}') as ok`);
        assert.notEqual(rows[0].ok, true, `${kind}: no caller`);
    }

    // Commenting through the Data API: the insert policy asks the read rule.
    await db.exec(`
        create role authenticated;
        create table public.comments (
          id uuid primary key default gen_random_uuid(),
          inventory_request_id uuid references public.inventory_requests(id),
          program_request_id uuid references public.program_requests(id),
          author_id uuid, author_name text, kind text not null default 'comment',
          data jsonb, message text not null default ''
        );
        alter table public.comments enable row level security;
        grant usage on schema public, auth to authenticated;
        grant insert, select on public.comments to authenticated;
        grant select on public.profiles to authenticated;
        grant select on public.inventory_requests, public.program_requests to authenticated;
        grant execute on all functions in schema public to authenticated;
        grant execute on function auth.uid() to authenticated;
        update public.profiles set role = 'approver' where id = '${uuid(7)}';
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261201010000_lead_and_cc_can_comment.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );
    for (const kind of ['inventory', 'program']) {
        const { rows } = await db.query(
            `insert into public.${kind}_requests (requester_id, status, lead_email)
             values ('${uuid(1)}', 'submitted', 'lead@example.org') returning id`,
        );
        const request = rows[0].id;
        const column = `${kind}_request_id`;
        const commentAs = async (user, extra = '') => {
            await db.exec('reset role');
            await asUser(user);
            await db.exec('set role authenticated');
            try {
                await db.exec(
                    `insert into public.comments (${column}, author_id, message${extra ? ', ' + extra.split('=')[0] : ''})
                     values ('${request}', '${user}', 'hi'${extra ? ', ' + extra.split('=')[1] : ''})`,
                );
                return true;
            } catch (error) {
                assert.match(error.message, /row-level security/);
                return false;
            } finally {
                await db.exec('reset role');
            }
        };
        assert.equal(await commentAs(uuid(1)), true, `${kind}: requester comments`);
        assert.equal(await commentAs(uuid(2)), true, `${kind}: lead comments`);
        assert.equal(await commentAs(uuid(3)), false, `${kind}: CC not yet a participant row`);
        await db.exec(
            `insert into public.${kind}_request_participants values ('${request}', null, 'cc@example.org')`,
        );
        assert.equal(await commentAs(uuid(3)), true, `${kind}: external CC comments`);
        assert.equal(await commentAs(uuid(5)), false, `${kind}: stranger cannot comment`);
        assert.equal(await commentAs(uuid(6)), false, `${kind}: viewer cannot comment`);
        assert.equal(await commentAs(uuid(7)), true, `${kind}: approver comments`);
        // Still only plain comments, written as oneself.
        assert.equal(await commentAs(uuid(2), "kind='status'"), false, `${kind}: no forged status`);
        await db.exec('reset role');
        await asUser(uuid(2));
        await db.exec('set role authenticated');
        await assert.rejects(
            db.exec(
                `insert into public.comments (${column}, author_id, message)
                 values ('${request}', '${uuid(1)}', 'as someone else')`,
            ),
            /row-level security/,
        );
        await db.exec('reset role');

        // A draft is open to a party, and closed to a stranger.
        const draft = (
            await db.query(
                `insert into public.${kind}_requests (requester_id, status, lead_email)
                 values ('${uuid(1)}', 'draft', 'lead@example.org') returning id`,
            )
        ).rows[0].id;
        await db.exec(
            `insert into public.${kind}_request_participants values ('${draft}', null, 'cc@example.org')`,
        );
        for (const [user, allowed] of [
            [uuid(2), true],
            [uuid(3), true],
            [uuid(5), false],
        ]) {
            await db.exec('reset role');
            await asUser(user);
            await db.exec('set role authenticated');
            const attempt = db.exec(
                `insert into public.comments (${column}, author_id, message)
                 values ('${draft}', '${user}', 'hi')`,
            );
            if (allowed) await attempt;
            else await assert.rejects(attempt, /row-level security/);
            await db.exec('reset role');
        }
    }
    console.log('lead and CC read access passed');
} finally {
    await db.close();
}
