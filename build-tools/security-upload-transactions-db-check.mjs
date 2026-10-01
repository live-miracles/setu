// Isolated PostgreSQL regression check; does not connect to hosted data.
// Install @electric-sql/pglite in a temporary directory, then run:
// node build-tools/security-upload-transactions-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema storage;
        create type public.user_role as enum ('admin', 'approver', 'viewer', 'user');
        create type public.inventory_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed');
        create type public.program_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
        create type public.return_condition as enum ('returned', 'damaged', 'missing');
        create table storage.buckets (id text primary key, file_size_limit bigint, allowed_mime_types text[]);
        create table public.profiles (id uuid primary key, role user_role not null);
        create table public.inventory_types (
            id uuid primary key, brand text not null default '', name text not null,
            total_quantity integer not null
        );
        create table public.inventory_requests (
            id uuid primary key, requester_id uuid not null references profiles(id),
            status inventory_request_status not null
        );
        create table public.inventory_request_participants (
            request_id uuid references inventory_requests(id), profile_id uuid references profiles(id)
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
            status program_request_status not null, place_id uuid references places(id)
        );
        create table public.program_request_participants (
            request_id uuid references program_requests(id), profile_id uuid references profiles(id)
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
            check (num_nonnulls(inventory_request_id, program_request_id) = 1)
        );
        insert into storage.buckets values ('request-images', null, null);
        grant usage on schema public to service_role;
        grant all on all tables in schema public to service_role;
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261001130000_secure_uploads_and_request_actions.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );

    const bucket = (
        await db.query(
            "select file_size_limit, allowed_mime_types from storage.buckets where id = 'request-images'",
        )
    ).rows[0];
    assert.equal(Number(bucket.file_size_limit), 50 * 1024);
    assert.deepEqual(bucket.allowed_mime_types, [
        'image/avif',
        'image/jpeg',
        'image/png',
        'image/webp',
    ]);

    await db.query('insert into profiles values ($1, $2), ($3, $4), ($5, $6)', [
        uuid(1),
        'user',
        uuid(2),
        'approver',
        uuid(3),
        'viewer',
    ]);
    await db.exec('set role service_role');

    const inventoryAction = (requestId, action, actor = uuid(2)) =>
        db.query('select public.perform_inventory_request_action_tx($1, $2, $3, $4) as status', [
            requestId,
            action,
            actor,
            '',
        ]);
    await db.query('insert into inventory_types values ($1, $2, $3, $4)', [
        uuid(10),
        'Test brand',
        'Test item',
        1,
    ]);
    for (const n of [11, 12]) {
        await db.query('insert into inventory_requests values ($1, $2, $3)', [
            uuid(n),
            uuid(1),
            'approved',
        ]);
        await db.query('insert into inventory_request_items values ($1, $2, $3, 1, null)', [
            uuid(n + 10),
            uuid(n),
            uuid(10),
        ]);
    }
    assert.equal((await inventoryAction(uuid(11), 'issue')).rows[0].status, 'issued');
    await assert.rejects(inventoryAction(uuid(12), 'issue'), /insufficient inventory/);
    assert.equal(
        (await db.query('select status from inventory_requests where id = $1', [uuid(12)])).rows[0]
            .status,
        'approved',
    );

    await db.query('insert into inventory_requests values ($1, $2, $3)', [
        uuid(13),
        uuid(1),
        'submitted',
    ]);
    assert.equal((await inventoryAction(uuid(13), 'approve')).rows[0].status, 'approved');
    await assert.rejects(inventoryAction(uuid(13), 'reject'), /Invalid transition/);
    await assert.rejects(inventoryAction(uuid(13), 'cancel', uuid(3)), /Approver access/);
    assert.equal(
        (
            await db.query(
                'select count(*)::integer as count from comments where inventory_request_id = $1',
                [uuid(13)],
            )
        ).rows[0].count,
        1,
    );

    const programAction = (requestId, action, actor = uuid(2)) =>
        db.query('select public.perform_program_request_action_tx($1, $2, $3, $4) as status', [
            requestId,
            action,
            actor,
            '',
        ]);
    await db.query('insert into places values ($1, $2)', [uuid(30), 'Test place']);
    for (const [n, status, start, end] of [
        [31, 'approved', '2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z'],
        [32, 'submitted', '2030-01-01T11:30:00Z', '2030-01-01T12:30:00Z'],
    ]) {
        await db.query('insert into program_requests values ($1, $2, $3, $4)', [
            uuid(n),
            uuid(1),
            status,
            uuid(30),
        ]);
        await db.query('insert into program_sessions values ($1, $2, $3, $4)', [
            uuid(n + 10),
            uuid(n),
            start,
            end,
        ]);
    }
    await assert.rejects(programAction(uuid(32), 'approve'), /within one hour/);
    assert.equal(
        (await db.query('select status from program_requests where id = $1', [uuid(32)])).rows[0]
            .status,
        'submitted',
    );
    await db.query(
        "update program_sessions set start_at = '2030-01-01T13:00:00Z', end_at = '2030-01-01T14:00:00Z' where request_id = $1",
        [uuid(32)],
    );
    assert.equal((await programAction(uuid(32), 'approve')).rows[0].status, 'approved');
    await assert.rejects(programAction(uuid(32), 'reject'), /Invalid transition/);
    assert.equal(
        (
            await db.query(
                'select count(*)::integer as count from comments where program_request_id = $1',
                [uuid(32)],
            )
        ).rows[0].count,
        1,
    );

    for (const role of ['anon', 'authenticated']) {
        await db.exec(`reset role; set role ${role}`);
        await assert.rejects(inventoryAction(uuid(13), 'cancel'), /permission denied/);
    }
    console.log(
        'storage limits, service-only execution, inventory capacity and program scheduling transactions passed',
    );
} finally {
    await db.close();
}
