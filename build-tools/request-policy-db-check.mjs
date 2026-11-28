// Parity check between the shared request policy (the TypeScript rules the app
// offers and authorizes with) and the SQL transition functions that actually
// execute them. Runs the real latest migrations in an isolated PGlite database;
// does not connect to hosted data.
// node build-tools/request-policy-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadBundle } from './test-support.mjs';

const policy = await loadBundle(`export * from './supabase/functions/_shared/request-policy';`);
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = (name) =>
    readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

const STATUSES = {
    inventory: ['draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed'],
    program: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
};
const ACTIONS = [
    'submit',
    'approve',
    'reject',
    'issue',
    'close',
    'cancel',
    'revise',
    'unapprove',
    'reopen',
];
const REQUESTER = uuid(1);
const OUTSIDER = uuid(2);
const APPROVER_PARTICIPANT = uuid(3);
const APPROVER = uuid(4);
// A user who is neither requester nor participant, but is the request's lead, and one
// who is only listed by email on it: both are parties through their profile email.
const LEAD = uuid(5);
const EMAIL_LISTED = uuid(6);
// A Viewer listed on the request: on it, but read-only, so it may do nothing.
const VIEWER_PARTY = uuid(7);
// [actor profile, role, is the actor on the request]
const ACTORS = [
    [REQUESTER, 'user', true],
    [OUTSIDER, 'user', false],
    [APPROVER_PARTICIPANT, 'approver', true],
    [APPROVER, 'approver', false],
    [LEAD, 'user', true],
    [EMAIL_LISTED, 'user', true],
    [VIEWER_PARTY, 'viewer', true],
];

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema storage;
        create type public.user_role as enum ('admin', 'approver', 'viewer', 'user');
        create type public.inventory_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed');
        create type public.program_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
        create type public.return_condition as enum ('returned', 'damaged', 'missing');
        create table storage.buckets (id text primary key, file_size_limit bigint, allowed_mime_types text[]);
        create table public.profiles (id uuid primary key, role user_role not null, email text not null default '');
        create table public.inventory_types (
            id uuid primary key, brand text not null default '', name text not null,
            total_quantity integer not null
        );
        create table public.inventory_requests (
            id uuid primary key, requester_id uuid not null references profiles(id),
            status inventory_request_status not null, lead_email text not null default ''
        );
        create table public.inventory_request_participants (
            request_id uuid references inventory_requests(id), profile_id uuid references profiles(id),
            external_email text
        );
        create table public.inventory_request_items (
            id uuid primary key, request_id uuid not null references inventory_requests(id),
            inventory_type_id uuid not null references inventory_types(id), quantity integer not null,
            return_condition return_condition
        );
        create table public.inventory_type_labels (
            id uuid primary key, inventory_type_id uuid not null references inventory_types(id)
        );
        create table public.inventory_request_item_labels (
            request_item_id uuid not null references inventory_request_items(id),
            inventory_type_label_id uuid not null references inventory_type_labels(id)
        );
        create table public.places (id uuid primary key, name text not null);
        create table public.program_requests (
            id uuid primary key, requester_id uuid not null references profiles(id),
            status program_request_status not null, place_id uuid references places(id),
            lead_email text not null default ''
        );
        create table public.program_request_participants (
            request_id uuid references program_requests(id), profile_id uuid references profiles(id),
            external_email text
        );
        create table public.program_sessions (
            id uuid primary key, request_id uuid not null references program_requests(id),
            start_at timestamptz not null, end_at timestamptz not null
        );
        create table public.blocks (
            id uuid primary key, name text not null, place_id uuid references places(id),
            start_at timestamptz not null, end_at timestamptz not null
        );
        create table public.comments (
            inventory_request_id uuid references inventory_requests(id),
            program_request_id uuid references program_requests(id),
            author_id uuid not null references profiles(id), message text not null,
            kind text not null default 'comment', data jsonb,
            check (num_nonnulls(inventory_request_id, program_request_id) = 1)
        );
        insert into storage.buckets values ('request-images', null, null);
        grant usage on schema public to service_role;
        grant all on all tables in schema public to service_role;
    `);
    await db.exec(await migration('20261001130000_secure_uploads_and_request_actions.sql'));
    await db.exec(await migration('20261112010000_reopen_and_unapprove_requests.sql'));
    await db.exec(await migration('20261112030000_approvers_submit_inventory_requests.sql'));
    await db.exec(await migration('20261115000000_no_cancel_for_drafts.sql'));
    // The latest definition of the workflow functions: lead and email-listed parties.
    await db.exec(await migration('20261201020000_lead_and_cc_are_parties.sql'));
    // ...which also refuse Viewers.
    await db.exec(await migration('20261202040000_viewers_refused_in_request_actions.sql'));

    await db.query(
        'insert into profiles values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9), ($10, $11, $12), ($13, $14, $15), ($16, $17, $18), ($19, $20, $21)',
        [
            REQUESTER,
            'user',
            'requester@example.org',
            OUTSIDER,
            'user',
            'outsider@example.org',
            APPROVER_PARTICIPANT,
            'approver',
            'approver.participant@example.org',
            APPROVER,
            'approver',
            'approver@example.org',
            LEAD,
            'user',
            'Lead@Example.org',
            EMAIL_LISTED,
            'user',
            'listed@example.org',
            VIEWER_PARTY,
            'viewer',
            'viewer@example.org',
        ],
    );
    // Everything the SQL checks beyond the transition itself is satisfied, so
    // each outcome below is decided by who the actor is and the status alone.
    await db.query('insert into inventory_types values ($1, $2, $3, $4)', [
        uuid(10),
        'Brand',
        'Item',
        100,
    ]);
    await db.query('insert into places values ($1, $2)', [uuid(11), 'Hall']);
    const requestId = uuid(20);
    await db.query('insert into inventory_requests values ($1, $2, $3, $4)', [
        requestId,
        REQUESTER,
        'draft',
        'lead@example.org',
    ]);
    await db.query("insert into inventory_request_items values ($1, $2, $3, 1, 'returned')", [
        uuid(21),
        requestId,
        uuid(10),
    ]);
    await db.query('insert into program_requests values ($1, $2, $3, $4, $5)', [
        requestId,
        REQUESTER,
        'draft',
        uuid(11),
        'lead@example.org',
    ]);
    await db.query(
        "insert into program_sessions values ($1, $2, now() + interval '30 days', now() + interval '30 days 1 hour')",
        [uuid(22), requestId],
    );
    await db.query('insert into inventory_request_participants values ($1, $2)', [
        requestId,
        APPROVER_PARTICIPANT,
    ]);
    await db.query('insert into program_request_participants values ($1, $2)', [
        requestId,
        APPROVER_PARTICIPANT,
    ]);
    for (const kind of ['inventory', 'program']) {
        await db.query(
            `insert into ${kind}_request_participants (request_id, external_email) values ($1, $2)`,
            [requestId, 'Listed@example.org'],
        );
        await db.query(`insert into ${kind}_request_participants values ($1, $2)`, [
            requestId,
            VIEWER_PARTY,
        ]);
    }
    await db.exec('set role service_role');

    let compared = 0;
    for (const kind of ['inventory', 'program']) {
        for (const status of STATUSES[kind]) {
            for (const action of ACTIONS) {
                for (const [actor, role, isParty] of ACTORS) {
                    await db.query(`update ${kind}_requests set status = $1 where id = $2`, [
                        status,
                        requestId,
                    ]);
                    let allowedBySql = true;
                    try {
                        await db.query(
                            `select public.perform_${kind}_request_action_tx($1, $2, $3, '')`,
                            [requestId, action, actor],
                        );
                    } catch (error) {
                        allowedBySql = false;
                        assert.match(
                            String(error.message),
                            /Invalid transition|Approver access|Only an accessible|Unsupported action|Viewer access/,
                            `${kind} ${action} on ${status}: unexpected SQL failure`,
                        );
                    }
                    const offered = policy
                        .availableActions(kind, { status, isParty, role })
                        .includes(action);
                    assert.equal(
                        offered,
                        allowedBySql,
                        `${kind}: ${role}${isParty ? ' (on the request)' : ''} ${action} on ${status}: ` +
                            `policy says ${offered}, SQL says ${allowedBySql}`,
                    );
                    compared++;
                }
            }
        }
    }
    console.log(`request policy matches the SQL transition functions (${compared} cases) passed`);
} finally {
    await db.close();
}
