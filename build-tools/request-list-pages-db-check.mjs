// Isolated PostgreSQL regression check; does not connect to hosted data.
// Runs as part of `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/request-list-pages-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
    // Minimal schema contract used by the migration. The can_view_* stubs read the
    // caller from settings, standing in for auth.uid() and current_role().
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create table public.profiles (id uuid primary key, name text not null, email text not null);
        create table public.departments (id uuid primary key, name text not null);
        create table public.places (id uuid primary key, name text not null);
        create table public.inventory_types (id uuid primary key, brand text not null default '', name text not null);
        create table public.inventory_type_labels (id uuid primary key);
        create table public.inventory_requests (
            id uuid primary key default gen_random_uuid(), display_id bigint generated always as identity,
            name text not null, requester_id uuid not null references profiles(id),
            start_date date not null, end_date date not null, status text not null default 'draft',
            department_id uuid references departments(id), lead_email text not null default ''
        );
        create table public.inventory_request_participants (
            request_id uuid references inventory_requests(id), profile_id uuid references profiles(id),
            external_email text
        );
        create table public.inventory_request_items (
            id uuid primary key default gen_random_uuid(), request_id uuid not null references inventory_requests(id),
            inventory_type_id uuid not null references inventory_types(id), quantity integer not null
        );
        create table public.inventory_request_item_labels (
            request_item_id uuid not null references inventory_request_items(id),
            inventory_type_label_id uuid not null references inventory_type_labels(id)
        );
        create table public.program_requests (
            id uuid primary key default gen_random_uuid(), display_id bigint generated always as identity,
            name text not null, language text not null, program_type text not null,
            requester_id uuid not null references profiles(id), status text not null default 'draft',
            place_id uuid references places(id), department_id uuid references departments(id),
            lead_email text not null default ''
        );
        create table public.program_request_participants (
            request_id uuid references program_requests(id), profile_id uuid references profiles(id),
            external_email text
        );
        create table public.program_sessions (
            id uuid primary key default gen_random_uuid(), request_id uuid not null references program_requests(id),
            name text not null default '', session_type text not null,
            start_at timestamptz not null, end_at timestamptz not null
        );
        create table public.comments (
            id uuid primary key default gen_random_uuid(),
            inventory_request_id uuid references inventory_requests(id),
            program_request_id uuid references program_requests(id),
            created_at timestamptz not null default now()
        );
        create function public.viewer_can_see(requester uuid) returns boolean language sql stable as $$
            select coalesce(current_setting('test.role', true), 'user') <> 'user'
                or requester::text = current_setting('test.uid', true)
        $$;
        create function public.can_view_inventory_request(target uuid) returns boolean language sql stable as $$
            select public.viewer_can_see((select requester_id from public.inventory_requests where id = target))
        $$;
        create function public.can_view_program_request(target uuid) returns boolean language sql stable as $$
            select public.viewer_can_see((select requester_id from public.program_requests where id = target))
        $$;
    `);
    // The original functions, then the page-size cap that replaces them: every
    // check below runs against the capped version.
    for (const migration of [
        '20261124020000_request_list_pages.sql',
        '20261202010000_cap_request_list_page_size.sql',
    ]) {
        await db.exec(
            await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
        );
    }
    const asRole = (role, uid = '') =>
        db.exec(
            `select set_config('test.role', '${role}', false), set_config('test.uid', '${uid}', false)`,
        );

    await db.exec(`
        insert into profiles values
          ('${uuid(1)}', 'Asha Rao', 'asha@example.com'), ('${uuid(2)}', 'Bala Iyer', 'bala@example.com');
        insert into departments values ('${uuid(1)}', 'Media'), ('${uuid(2)}', 'Kitchen');
        insert into places values ('${uuid(1)}', 'Main Hall'), ('${uuid(2)}', 'Garden');
        insert into inventory_types values ('${uuid(1)}', 'Sony', 'Camera'), ('${uuid(2)}', '', 'Tripod');
        insert into inventory_type_labels values ('${uuid(1)}'), ('${uuid(2)}');
    `);
    // Inventory: 12 requests alternating requester, statuses cycling.
    const statuses = ['draft', 'submitted', 'approved'];
    for (let n = 1; n <= 12; n++) {
        const id = uuid(100 + n);
        await db.query(
            `insert into inventory_requests (id, name, requester_id, start_date, end_date, status, department_id, lead_email)
             values ($1, $2, $3, $4, $4, $5, $6, 'lead@example.com')`,
            [
                id,
                `Shoot ${n}`,
                uuid(n % 2 ? 1 : 2),
                `2026-12-${String(n).padStart(2, '0')}`,
                statuses[n % 3],
                uuid(n <= 6 ? 1 : 2),
            ],
        );
        await db.query(
            `insert into inventory_request_items (id, request_id, inventory_type_id, quantity) values ($1, $2, $3, 1)`,
            [uuid(200 + n), id, uuid(n % 2 ? 1 : 2)],
        );
        // Comments in reverse order so the newest activity is request 1.
        await db.query(`insert into comments (inventory_request_id, created_at) values ($1, $2)`, [
            id,
            `2026-11-${String(30 - n).padStart(2, '0')}T10:00:00Z`,
        ]);
    }
    await db.query(`insert into inventory_request_item_labels values ($1, $2)`, [
        uuid(201),
        uuid(1),
    ]);
    await db.query(
        `insert into inventory_request_participants (request_id, external_email) values ($1, 'guest@outside.org')`,
        [uuid(103)],
    );

    const page = async (fn, query, pageNumber = 1, size = 5) => {
        const { rows } = await db.query(`select public.${fn}($1::jsonb, $2, $3) as value`, [
            JSON.stringify(query),
            pageNumber,
            size,
        ]);
        return rows[0].value;
    };
    const names = async (value) =>
        (
            await Promise.all(
                value.ids.map((id) =>
                    db.query('select name from inventory_requests where id = $1', [id]),
                ),
            )
        ).map((r) => r.rows[0].name);

    await asRole('approver');
    // Default order is newest activity first, in pages.
    let result = await page('list_inventory_requests_page', {});
    assert.equal(result.total, 12);
    assert.deepEqual(await names(result), ['Shoot 1', 'Shoot 2', 'Shoot 3', 'Shoot 4', 'Shoot 5']);
    result = await page('list_inventory_requests_page', {}, 3);
    assert.deepEqual(await names(result), ['Shoot 11', 'Shoot 12']);
    assert.deepEqual(await page('list_inventory_requests_page', {}, 4).then((v) => v.ids), []);
    // The page size is clamped to 1..100, whatever the caller asks for.
    assert.equal((await page('list_inventory_requests_page', {}, 1, 100000)).ids.length, 12);
    assert.equal((await page('list_inventory_requests_page', {}, 1, 0)).ids.length, 1);
    assert.equal((await page('list_inventory_requests_page', {}, 1, -5)).ids.length, 1);
    assert.equal((await page('list_inventory_requests_page', {}, 1, null)).ids.length, 12);

    // Status counts ignore the status filter; the filter narrows total and ids.
    result = await page('list_inventory_requests_page', { statuses: ['approved'] });
    assert.equal(result.total, 4);
    assert.deepEqual(result.statusCounts, { draft: 4, submitted: 4, approved: 4 });
    result = await page('list_inventory_requests_page', {
        statuses: ['approved'],
        departmentId: uuid(1),
    });
    assert.equal(result.total, 2); // approved are n % 3 = 2 -> 2,5,8,11; department 1 is n <= 6 -> 2,5
    assert.deepEqual(result.statusCounts, { draft: 2, submitted: 2, approved: 2 });

    // Filters: type, label, requester email.
    assert.equal(
        (await page('list_inventory_requests_page', { inventoryTypeId: uuid(1) })).total,
        6,
    );
    assert.deepEqual(
        await names(await page('list_inventory_requests_page', { labelId: uuid(1) })),
        ['Shoot 1'],
    );
    assert.equal(
        (await page('list_inventory_requests_page', { requesterEmail: 'bala@example.com' })).total,
        6,
    );

    // Search: every word must match something (name, requester, item, participant, department, REQ-id).
    const search = async (q) => (await page('list_inventory_requests_page', { q })).total;
    assert.equal(await search('shoot 12'), 1);
    assert.equal(await search('SONY camera'), 6);
    assert.equal(await search('asha kitchen'), 3); // requester Asha (odd n) in department 2 (n > 6): 7, 9, 11
    assert.equal(await search('guest@outside'), 1);
    assert.equal(await search('req-1'), 4); // display ids 1, 10, 11, 12
    assert.equal(await search('nothing like this'), 0);
    assert.equal(await search('100%'), 0); // wildcards are plain characters
    assert.equal(await search('   '), 12);

    // Sorting, both directions; unknown keys fall back to the display id.
    const sorted = async (query) => names(await page('list_inventory_requests_page', query, 1, 3));
    assert.deepEqual(await sorted({ sortBy: 'startDate', sortDirection: 'desc' }), [
        'Shoot 12',
        'Shoot 11',
        'Shoot 10',
    ]);
    assert.deepEqual(await sorted({ sortBy: 'startDate' }), ['Shoot 1', 'Shoot 2', 'Shoot 3']);
    assert.deepEqual(await sorted({ sortBy: 'name', sortDirection: 'asc' }), [
        'Shoot 1',
        'Shoot 10',
        'Shoot 11',
    ]);
    assert.deepEqual(await sorted({ sortBy: 'bogus', sortDirection: 'desc' }), [
        'Shoot 12',
        'Shoot 11',
        'Shoot 10',
    ]);
    assert.deepEqual(
        await sorted({ sortBy: 'requester', sortDirection: 'asc' }).then((r) => r.length),
        3,
    );

    // A plain user sees, counts and searches only their own requests.
    await asRole('user', uuid(1));
    result = await page('list_inventory_requests_page', {});
    assert.equal(result.total, 6);
    assert.deepEqual(result.statusCounts, { draft: 2, submitted: 2, approved: 2 });
    assert.equal((await page('list_inventory_requests_page', { q: 'bala' })).total, 0);

    // --- programs -----------------------------------------------------------
    await asRole('approver');
    const session = (request, start, end, name = '', type = 'Talk') =>
        db.query(
            `insert into program_sessions (request_id, name, session_type, start_at, end_at) values ($1, $2, $3, $4, $5)`,
            [request, name, type, start, end],
        );
    const program = (n, name, requester, status, place, department) =>
        db.query(
            `insert into program_requests (id, name, language, program_type, requester_id, status, place_id, department_id, lead_email)
             values ($1, $2, 'English', 'Other', $3, $4, $5, $6, 'lead@example.com')`,
            [
                uuid(300 + n),
                name,
                uuid(requester),
                status,
                place && uuid(place),
                department && uuid(department),
            ],
        );
    await program(1, 'Yoga morning', 1, 'approved', 1, 1);
    await session(uuid(301), '2020-01-01T06:00:00Z', '2020-01-01T07:00:00Z', 'Asanas', 'Class');
    await program(2, 'Satsang', 2, 'submitted', 2, 2);
    await session(uuid(302), '2020-02-01T06:00:00Z', '2020-02-01T07:00:00Z');
    await session(uuid(302), '2099-01-01T06:00:00Z', '2099-01-01T07:00:00Z');
    await program(3, 'Future talk', 1, 'draft', null, 1);
    await session(uuid(303), '2099-03-01T06:00:00Z', '2099-03-01T07:00:00Z', 'Keynote', 'Talk');
    await program(4, 'Unscheduled idea', 2, 'draft', null, null);
    await db.query(
        `insert into program_request_participants (request_id, external_email) values ($1, 'visitor@outside.org')`,
        [uuid(304)],
    );
    const programNames = async (query, size = 10) => {
        const value = await page('list_program_requests_page', query, 1, size);
        const rows = await Promise.all(
            value.ids.map((id) =>
                db.query('select name from program_requests where id = $1', [id]),
            ),
        );
        return { total: value.total, names: rows.map((r) => r.rows[0].name) };
    };
    assert.equal((await programNames({})).total, 4);
    // Past: scheduled and every session over. Otherwise: ongoing/future or unscheduled.
    assert.deepEqual((await programNames({ dateScope: 'past' })).names, ['Yoga morning']);
    assert.deepEqual((await programNames({ dateScope: 'upcoming', sortBy: 'name' })).names, [
        'Future talk',
        'Satsang',
        'Unscheduled idea',
    ]);
    assert.deepEqual((await programNames({ placeId: uuid(2) })).names, ['Satsang']);
    assert.deepEqual(
        (await programNames({ statuses: ['draft'], sortBy: 'name', sortDirection: 'desc' })).names,
        ['Unscheduled idea', 'Future talk'],
    );
    assert.deepEqual((await programNames({ q: 'asanas' })).names, ['Yoga morning']);
    assert.deepEqual((await programNames({ q: 'main hall asha' })).names, ['Yoga morning']);
    assert.deepEqual((await programNames({ q: 'keynote prg-3' })).names, ['Future talk']);
    assert.deepEqual((await programNames({ q: 'visitor@outside' })).names, ['Unscheduled idea']);
    // The first session decides the session-start sort; unscheduled requests go last.
    assert.deepEqual((await programNames({ sortBy: 'sessionStart' })).names, [
        'Yoga morning',
        'Satsang',
        'Future talk',
        'Unscheduled idea',
    ]);
    await asRole('user', uuid(2));
    assert.deepEqual((await programNames({ sortBy: 'name' })).names, [
        'Satsang',
        'Unscheduled idea',
    ]);

    // Anonymous callers cannot run the functions.
    const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.list_inventory_requests_page(jsonb, integer, integer)', 'execute') as ok`,
    );
    assert.equal(rows[0].ok, false);

    // Last, since it adds rows: no page holds more than 100 requests.
    await db.exec(`
        insert into inventory_requests (name, requester_id, start_date, end_date)
        select 'Bulk ' || n, '${uuid(1)}', current_date, current_date from generate_series(1, 100) n;
    `);
    await asRole('approver');
    assert.equal((await page('list_inventory_requests_page', {}, 1, 100000)).ids.length, 100);
    console.log('request list pages db check passed');
} finally {
    await db.close();
}
