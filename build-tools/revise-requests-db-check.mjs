// Isolated PostgreSQL regression check; does not connect to hosted data.
// Install @electric-sql/pglite in a temporary directory, then run:
// node build-tools/revise-requests-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
    // Minimal schema contract used by the migration. No remote credentials or fixtures.
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create table public.profiles (id uuid primary key, role text not null);
        create type public.inventory_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed');
        create type public.program_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
        create table public.inventory_requests (id uuid primary key, requester_id uuid not null references profiles(id), status inventory_request_status, name text);
        create table public.program_requests (id uuid primary key, requester_id uuid not null references profiles(id), status program_request_status, name text);
        create table public.inventory_request_participants (request_id uuid references inventory_requests(id), profile_id uuid references profiles(id));
        create table public.program_request_participants (request_id uuid references program_requests(id), profile_id uuid references profiles(id));
        create table public.comments (
            inventory_request_id uuid references inventory_requests(id),
            program_request_id uuid references program_requests(id),
            author_id uuid not null references profiles(id), message text not null,
            check (num_nonnulls(inventory_request_id, program_request_id) = 1)
        );
        grant usage on schema public to service_role;
        grant all on all tables in schema public to service_role;
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20260930000000_revise_rejected_requests.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );
    const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    for (const [n, role] of [
        [1, 'user'],
        [2, 'user'],
        [3, 'approver'],
        [4, 'admin'],
        [5, 'user'],
        [6, 'viewer'],
    ]) {
        await db.query('insert into profiles values ($1, $2)', [uuid(n), role]);
    }
    const requestId = uuid(10);
    for (const kind of ['inventory', 'program']) {
        const table = `${kind}_requests`;
        const target = `${kind}_request_id`;
        await db.query(`insert into ${table} values ($1, $2, 'rejected', 'Original request')`, [
            requestId,
            uuid(1),
        ]);
        await db.query(`insert into ${kind}_request_participants values ($1, $2)`, [
            requestId,
            uuid(2),
        ]);
        await db.query(
            `insert into comments (${target}, author_id, message) values ($1, $2, 'Rejected: please revise')`,
            [requestId, uuid(3)],
        );
        const revise = (actor = 1, id = requestId) =>
            db.query('select public.revise_rejected_request($1, $2, $3) as status', [
                `${kind}_request`,
                id,
                uuid(actor),
            ]);
        const state = async () =>
            (await db.query(`select status, name from ${table} where id = $1`, [requestId]))
                .rows[0];
        const comments = async () =>
            (await db.query(`select * from comments where ${target} = $1`, [requestId])).rows;
        const rejectAgain = () =>
            db.query(`update ${table} set status = 'rejected' where id = $1`, [requestId]);

        // Execute the real SQL as the API's role, not as database owner.
        await db.exec('set role service_role');
        for (const actor of [1, 2, 3, 4]) {
            await rejectAgain();
            const before = await comments();
            assert.equal((await revise(actor)).rows[0].status, 'draft');
            assert.deepEqual(await state(), { status: 'draft', name: 'Original request' });
            const after = await comments();
            assert.deepEqual(after.slice(0, before.length), before);
            assert.equal(after.length, before.length + 1);
            assert.equal(after.at(-1).author_id, uuid(actor));
            assert.equal(
                after.at(-1).message,
                'Returned this rejected request to draft for revision.',
            );
            await assert.rejects(revise(actor), /Only rejected/);
            assert.equal((await comments()).length, after.length);
        }
        await rejectAgain();
        for (const actor of [5, 6, 99]) {
            await assert.rejects(revise(actor), /not allowed/);
            assert.equal((await state()).status, 'rejected');
        }
        await assert.rejects(revise(1, uuid(99)), /not allowed/);
        for (const status of [
            'draft',
            'submitted',
            'approved',
            'cancelled',
            ...(kind === 'inventory' ? ['issued', 'closed'] : []),
        ]) {
            await db.query(`update ${table} set status = $1 where id = $2`, [status, requestId]);
            await assert.rejects(revise(1), /Only rejected/);
            assert.equal((await state()).status, status);
        }
        await rejectAgain();
        // Lost participation while an old page remains open must revoke the action.
        await db.query(`delete from ${kind}_request_participants where request_id = $1`, [
            requestId,
        ]);
        await assert.rejects(revise(2), /not allowed/);

        // Browser roles cannot supply another actor directly to the RPC.
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`reset role; set role ${role}`);
            await assert.rejects(revise(3), /permission denied/);
        }
        await db.exec('reset role; set role service_role');
        const outcomes = await Promise.allSettled([revise(), revise()]);
        assert.equal(outcomes.filter((value) => value.status === 'fulfilled').length, 1);
        assert.equal(outcomes.filter((value) => value.status === 'rejected').length, 1);
        // PGlite serializes connections; this checks duplicate queued calls, not
        // independent PostgreSQL sessions contending for the row lock.
        await rejectAgain();
        await db.exec(`reset role;
            create function public.fail_revision_comment() returns trigger language plpgsql as $$
            begin raise exception 'Simulated activity failure'; end; $$;
            create trigger fail_revision_comment before insert on comments
            for each row execute function public.fail_revision_comment();
            set role service_role;`);
        const beforeFailure = await comments();
        await assert.rejects(revise(), /Simulated activity failure/);
        assert.equal(
            (await state()).status,
            'rejected',
            'comment failure must roll back the status',
        );
        assert.deepEqual(await comments(), beforeFailure);
        await db.exec(
            'reset role; drop trigger fail_revision_comment on comments; drop function public.fail_revision_comment()',
        );
        console.log(
            `${kind}: ownership, roles, illegal transitions, history, repeat calls, stale participation and rollback passed`,
        );
    }
} finally {
    await db.close();
}
