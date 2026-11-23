// Isolated PostgreSQL regression check; does not connect to hosted data.
// Runs as part of `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/atomic-request-saves-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    // Minimal schema contract used by the migration.
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create type public.inventory_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed');
        create type public.program_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
        create type public.return_condition as enum ('returned', 'damaged', 'missing');
        create table public.profiles (id uuid primary key);
        create table public.departments (id uuid primary key);
        create table public.places (id uuid primary key);
        create table public.inventory_types (id uuid primary key);
        create table public.inventory_type_labels (id uuid primary key);
        create table public.inventory_requests (
            id uuid primary key, name text not null, requester_id uuid not null references profiles(id),
            start_date date not null, end_date date not null,
            status inventory_request_status not null default 'draft',
            image_path text not null default '', department_id uuid references departments(id),
            lead_email text not null default ''
        );
        create table public.inventory_request_participants (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references inventory_requests(id) on delete cascade,
            profile_id uuid references profiles(id), external_email text,
            check (num_nonnulls(profile_id, external_email) = 1)
        );
        create table public.inventory_request_items (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references inventory_requests(id) on delete cascade,
            inventory_type_id uuid not null references inventory_types(id),
            quantity integer not null check (quantity > 0), return_condition return_condition,
            unique (request_id, inventory_type_id)
        );
        create table public.inventory_request_item_labels (
            id uuid primary key default gen_random_uuid(),
            request_item_id uuid not null references inventory_request_items(id) on delete cascade,
            inventory_type_label_id uuid not null references inventory_type_labels(id),
            unique (request_item_id, inventory_type_label_id)
        );
        create table public.program_requests (
            id uuid primary key, name text not null, language text not null, program_type text not null,
            requester_id uuid not null references profiles(id),
            status program_request_status not null default 'draft',
            place_id uuid references places(id), department_id uuid references departments(id),
            lead_email text not null default ''
        );
        create table public.program_request_participants (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references program_requests(id) on delete cascade,
            profile_id uuid references profiles(id), external_email text,
            check (num_nonnulls(profile_id, external_email) = 1)
        );
        create table public.program_sessions (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references program_requests(id) on delete cascade,
            name text not null default '', session_type text not null,
            start_at timestamptz not null, end_at timestamptz not null,
            check (end_at > start_at)
        );
        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
        grant usage on schema public to service_role;
        grant all on all tables in schema public to service_role;
    `);
    await db.exec(
        await readFile(
            new URL(
                '../supabase/migrations/20261124000000_atomic_request_saves.sql',
                import.meta.url,
            ),
            'utf8',
        ),
    );
    for (const table of ['profiles', 'departments', 'places', 'inventory_types']) {
        for (const n of [1, 2, 3]) await db.query(`insert into ${table} values ($1)`, [uuid(n)]);
    }
    for (const n of [1, 2])
        await db.query('insert into inventory_type_labels values ($1)', [uuid(n)]);

    const count = async (sql, params = []) =>
        Number((await db.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n);
    const rejects = (promise, pattern) => assert.rejects(promise, pattern);

    // --- inventory ---------------------------------------------------------
    const inventoryFields = (extra = {}) => ({
        name: 'Cameras',
        requester_id: uuid(1),
        start_date: '2026-12-01',
        end_date: '2026-12-03',
        department_id: uuid(1),
        lead_email: 'lead@example.com',
        ...extra,
    });
    const saveInventory = (mode, id, fields, items, participants, expected = 'draft') =>
        db.query('select public.save_inventory_request_tx($1, $2, $3, $4, $5, $6) as id', [
            mode,
            id,
            JSON.stringify(fields),
            JSON.stringify(items),
            JSON.stringify(participants),
            expected,
        ]);
    const requestId = uuid(100);
    const items = [
        {
            inventory_type_id: uuid(1),
            quantity: 2,
            return_condition: null,
            label_ids: [uuid(1), uuid(2)],
        },
        { inventory_type_id: uuid(2), quantity: 1, return_condition: 'returned', label_ids: [] },
    ];
    const participants = [
        { profile_id: uuid(2), external_email: null },
        { profile_id: null, external_email: 'guest@example.com' },
    ];

    await saveInventory('create', requestId, inventoryFields(), items, participants);
    assert.equal(await count('inventory_request_items'), 2);
    assert.equal(await count('inventory_request_item_labels'), 2);
    assert.equal(await count('inventory_request_participants'), 2);

    // A replayed create (same id, same requester) is a no-op, not a duplicate.
    await saveInventory('create', requestId, inventoryFields(), items, participants);
    assert.equal(await count('inventory_requests'), 1);
    assert.equal(await count('inventory_request_items'), 2);
    // ...but another requester cannot take over the id.
    await rejects(
        saveInventory('create', requestId, inventoryFields({ requester_id: uuid(2) }), items, []),
        /already in use/,
    );

    // A failed update rolls back completely: the old items and participants stay.
    await rejects(
        saveInventory(
            'update',
            requestId,
            inventoryFields({ name: 'Renamed' }),
            [{ inventory_type_id: uuid(3), quantity: 0, label_ids: [] }],
            [],
        ),
        /check/,
    );
    assert.equal(await count('inventory_request_items'), 2);
    assert.equal(await count('inventory_request_participants'), 2);
    assert.equal(
        (await db.query('select name from inventory_requests where id = $1', [requestId])).rows[0]
            .name,
        'Cameras',
    );

    // A successful update replaces children and keeps the image when none is sent.
    await db.query(`update inventory_requests set image_path = 'a.avif' where id = $1`, [
        requestId,
    ]);
    await saveInventory(
        'update',
        requestId,
        inventoryFields({ name: 'Renamed' }),
        [{ inventory_type_id: uuid(3), quantity: 5, label_ids: [] }],
        [],
    );
    assert.equal(await count('inventory_request_items'), 1);
    assert.equal(await count('inventory_request_item_labels'), 0);
    assert.equal(await count('inventory_request_participants'), 0);
    const renamed = (await db.query('select name, image_path from inventory_requests')).rows[0];
    assert.deepEqual(renamed, { name: 'Renamed', image_path: 'a.avif' });

    // The caller authorized against 'draft'; a request that moved on is refused.
    await db.query(`update inventory_requests set status = 'submitted' where id = $1`, [requestId]);
    await rejects(
        saveInventory('update', requestId, inventoryFields(), [], [], 'draft'),
        /changed while you were editing/,
    );
    await rejects(saveInventory('update', uuid(999), inventoryFields(), [], []), /not found/i);

    // --- participants only -------------------------------------------------
    await db.query('select public.save_request_participants_tx($1, $2, $3)', [
        'inventory',
        requestId,
        JSON.stringify(participants),
    ]);
    assert.equal(await count('inventory_request_participants'), 2);
    await rejects(
        db.query('select public.save_request_participants_tx($1, $2, $3)', [
            'inventory',
            uuid(999),
            '[]',
        ]),
        /not found/i,
    );

    // --- program -----------------------------------------------------------
    const programFields = (extra = {}) => ({
        name: 'Satsang',
        language: 'English',
        program_type: 'Other',
        requester_id: uuid(1),
        place_id: uuid(1),
        department_id: uuid(1),
        lead_email: 'lead@example.com',
        ...extra,
    });
    const session = (start, end) => ({
        name: '',
        session_type: 'Talk',
        start_at: start,
        end_at: end,
    });
    const saveProgram = (mode, id, fields, sessions, participants, expected = 'draft') =>
        db.query('select public.save_program_request_tx($1, $2, $3, $4, $5, $6) as id', [
            mode,
            id,
            JSON.stringify(fields),
            JSON.stringify(sessions),
            JSON.stringify(participants),
            expected,
        ]);
    // An approved program holds the place 10:00-12:00.
    const approved = uuid(200);
    await saveProgram(
        'create',
        approved,
        programFields(),
        [session('2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z')],
        [],
    );
    await db.query(`update program_requests set status = 'approved' where id = $1`, [approved]);

    const draft = uuid(201);
    // Within an hour of the approved program: refused, and nothing is written.
    await rejects(
        saveProgram(
            'create',
            draft,
            programFields(),
            [session('2026-12-10T12:30:00Z', '2026-12-10T13:30:00Z')],
            participants.slice(0, 1),
        ),
        /place is unavailable/,
    );
    assert.equal(await count('program_requests where id = $1', [draft]), 0);

    // An hour clear is fine; a different place is fine.
    await saveProgram(
        'create',
        draft,
        programFields(),
        [session('2026-12-10T13:00:00Z', '2026-12-10T14:00:00Z')],
        participants.slice(0, 1),
    );
    assert.equal(await count('program_sessions where request_id = $1', [draft]), 1);
    assert.equal(await count('program_request_participants where request_id = $1', [draft]), 1);

    // Editing sessions into the buffer is refused and the old session survives.
    await rejects(
        saveProgram(
            'update',
            draft,
            programFields(),
            [session('2026-12-10T11:00:00Z', '2026-12-10T11:30:00Z')],
            [],
        ),
        /place is unavailable/,
    );
    const kept = (
        await db.query('select start_at from program_sessions where request_id = $1', [draft])
    ).rows;
    assert.equal(kept.length, 1);
    assert.equal(new Date(kept[0].start_at).toISOString(), '2026-12-10T13:00:00.000Z');
    assert.equal(await count('program_request_participants where request_id = $1', [draft]), 1);

    // A request never conflicts with itself, and moving place resolves the clash.
    await saveProgram(
        'update',
        approved,
        programFields(),
        [session('2026-12-10T10:30:00Z', '2026-12-10T11:30:00Z')],
        [],
        'approved',
    );
    await saveProgram(
        'update',
        draft,
        programFields({ place_id: uuid(2) }),
        [session('2026-12-10T11:00:00Z', '2026-12-10T11:30:00Z')],
        [],
    );

    // Replayed create, stale status and unknown mode.
    await saveProgram('create', draft, programFields({ place_id: uuid(2) }), [], []);
    assert.equal(await count('program_requests where id = $1', [draft]), 1);
    await rejects(
        saveProgram('update', draft, programFields(), [], [], 'approved'),
        /changed while you were editing/,
    );
    await rejects(saveProgram('purge', draft, programFields(), [], []), /Unknown save mode/);

    // Only the service role may call these functions.
    for (const signature of [
        'public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text)',
        'public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text)',
        'public.save_request_participants_tx(text, uuid, jsonb)',
    ]) {
        for (const [role, expected] of [
            ['anon', false],
            ['authenticated', false],
            ['service_role', true],
        ]) {
            const { rows } = await db.query(
                `select has_function_privilege($1, $2::regprocedure, 'execute') as ok`,
                [role, signature],
            );
            assert.equal(rows[0].ok, expected, `${role} ${signature}`);
        }
    }
    console.log('atomic request saves db check passed');
} finally {
    await db.close();
}
