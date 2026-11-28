// Isolated PostgreSQL check for the activity events migration (status and edit
// rows in the comments feed); does not connect to hosted data. Runs as part of
// `npm test` (db-checks.test.mjs); to run it alone:
// node build-tools/activity-events-db-check.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = (name) =>
    readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

try {
    // The tables and helper functions the migration reads, with fictional rows.
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create domain public.citext as text;
        create function auth.uid() returns uuid language sql stable
          as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create type public.user_role as enum ('admin', 'approver', 'viewer', 'user');
        create type public.inventory_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed');
        create type public.program_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
        create type public.return_condition as enum ('returned', 'damaged', 'missing');

        create table public.profiles (
            id uuid primary key, name text not null, email text not null, role user_role not null
        );
        create function public.current_role() returns text language sql stable security definer
          as $$ select role::text from public.profiles where id = auth.uid() $$;
        create function public.is_approver() returns boolean language sql stable security definer
          as $$ select role in ('admin', 'approver') from public.profiles where id = auth.uid() $$;
        create table public.departments (id uuid primary key, name text not null);
        create table public.places (id uuid primary key, name text not null);
        create table public.inventory_types (
            id uuid primary key, brand text not null default '', name text not null,
            model text not null default ''
        );
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
            profile_id uuid references profiles(id), external_email text
        );
        create table public.inventory_request_items (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references inventory_requests(id) on delete cascade,
            inventory_type_id uuid not null references inventory_types(id),
            quantity integer not null, return_condition return_condition
        );
        create table public.inventory_request_item_labels (
            id uuid primary key default gen_random_uuid(),
            request_item_id uuid not null references inventory_request_items(id) on delete cascade,
            inventory_type_label_id uuid not null references inventory_type_labels(id)
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
            profile_id uuid references profiles(id), external_email text
        );
        create table public.program_sessions (
            id uuid primary key default gen_random_uuid(),
            request_id uuid not null references program_requests(id) on delete cascade,
            name text not null default '', session_type text not null,
            start_at timestamptz not null, end_at timestamptz not null
        );
        create table public.blocks (
            id uuid primary key, name text not null, place_id uuid,
            start_at timestamptz not null, end_at timestamptz not null
        );
        create table public.comments (
            id uuid primary key default gen_random_uuid(),
            inventory_request_id uuid references inventory_requests(id) on delete cascade,
            program_request_id uuid references program_requests(id) on delete cascade,
            author_id uuid references profiles(id), author_name text,
            message text not null, created_at timestamptz not null default now(),
            check (num_nonnulls(inventory_request_id, program_request_id) = 1)
        );
        alter table public.comments enable row level security;
        create table public.email_outbox (
            id uuid primary key default gen_random_uuid(),
            idempotency_key text not null unique, template text not null,
            comment_id uuid, recipient text not null, payload jsonb not null
        );
        create function public.enqueue_comment_emails() returns trigger language plpgsql as $$
          begin return new; end $$;
        create trigger comments_email_trigger after insert on public.comments
          for each row execute function public.enqueue_comment_emails();

        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
        grant usage on schema public, auth to authenticated, service_role;
        grant execute on function auth.uid() to authenticated, service_role;
        grant select on all tables in schema public to authenticated;
        grant insert on public.comments to authenticated;
        grant all on all tables in schema public to service_role;
    `);
    for (const [n, role] of [
        [1, 'user'],
        [2, 'approver'],
        [3, 'user'],
        [4, 'viewer'],
    ]) {
        await db.query('insert into profiles values ($1, $2, $3, $4)', [
            uuid(n),
            `Person ${n}`,
            `person${n}@example.test`,
            role,
        ]);
    }
    for (const n of [1, 2]) {
        await db.query('insert into departments values ($1, $2)', [uuid(n), `Department ${n}`]);
        await db.query('insert into places values ($1, $2)', [uuid(n), `Place ${n}`]);
        await db.query('insert into inventory_types values ($1, $2, $3)', [
            uuid(n),
            'Brand',
            `Camera ${n}`,
        ]);
    }
    await db.query('insert into inventory_types values ($1, $2, $3)', [uuid(3), '', 'Tripod']);
    await db.query('insert into inventory_type_labels values ($1)', [uuid(1)]);
    await db.exec(`insert into program_requests (id, name, language, program_type, requester_id)
        select '${uuid(300)}', 'Retreat', 'English', 'Retreat', '${uuid(1)}'`);

    // Apply the real migrations, in order: the older action/save/trigger
    // definitions first, then the activity events migration over them.
    for (const name of [
        '20261115000000_no_cancel_for_drafts.sql',
        '20261124000000_atomic_request_saves.sql',
    ]) {
        await db.exec(await migration(name));
    }
    await db.exec(await migration('20261128000000_activity_events.sql'));
    // The latest comment email trigger: the same, without the reminder flag.
    await db.exec(await migration('20261202050000_drop_automated_reminder_flag.sql'));

    const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
    const one = async (sql, params = []) => (await rows(sql, params))[0];
    const comments = (requestId) =>
        rows(
            `select kind, message, data, author_id from comments
              where inventory_request_id = $1 or program_request_id = $1 order by created_at, id`,
            [requestId],
        );
    const asUser = (id) =>
        db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}'`);
    const asService = () => db.exec('reset role; set role service_role');

    // --- the Data API cannot forge audit rows --------------------------------
    await db.exec(`
        insert into inventory_requests (id, name, requester_id, start_date, end_date, status, department_id, lead_email)
        values ('${uuid(100)}', 'Cameras', '${uuid(1)}', '2026-12-01', '2026-12-03', 'submitted', '${uuid(1)}', 'lead@example.test');
        insert into inventory_request_participants (request_id, profile_id) values ('${uuid(100)}', '${uuid(3)}');
    `);
    await asUser(uuid(1));
    await db.query(
        'insert into comments (inventory_request_id, author_id, message) values ($1, $2, $3)',
        [uuid(100), uuid(1), 'A normal comment'],
    );
    for (const [kind, data] of [
        ['status', null],
        ['edit', null],
        ['comment', '{"from":"a"}'],
    ]) {
        await assert.rejects(
            db.query(
                'insert into comments (inventory_request_id, author_id, message, kind, data) values ($1, $2, $3, $4, $5)',
                [uuid(100), uuid(1), 'forged', kind, data],
            ),
            /row-level security/,
            `forged ${kind} row`,
        );
    }
    await asService();
    assert.deepEqual(
        (await comments(uuid(100))).map((row) => row.kind),
        ['comment'],
    );

    // --- status events -------------------------------------------------------
    const act = (fn, id, action, actor, note = '') =>
        db.query(`select public.${fn}($1, $2, $3, $4) as status`, [id, action, actor, note]);
    assert.equal(
        (await act('perform_inventory_request_action_tx', uuid(100), 'approve', uuid(2))).rows[0]
            .status,
        'approved',
    );
    let events = await comments(uuid(100));
    assert.equal(events.length, 2);
    assert.equal(events[1].kind, 'status');
    assert.equal(events[1].message, 'Approved this request.');
    assert.deepEqual(events[1].data, {
        from: 'submitted',
        to: 'approved',
        action: 'approve',
        note: null,
    });
    await act(
        'perform_inventory_request_action_tx',
        uuid(100),
        'unapprove',
        uuid(2),
        'Wrong dates',
    );
    events = await comments(uuid(100));
    assert.equal(
        events[2].message,
        'Withdrew the approval of this request and returned it to submitted. Wrong dates',
    );
    assert.deepEqual(events[2].data, {
        from: 'approved',
        to: 'submitted',
        action: 'unapprove',
        note: 'Wrong dates',
    });

    await db.exec(`update program_requests set status = 'submitted' where id = '${uuid(300)}'`);
    await act('perform_program_request_action_tx', uuid(300), 'reject', uuid(2), 'No hall free');
    const programEvents = await comments(uuid(300));
    assert.equal(programEvents.length, 1);
    assert.equal(programEvents[0].kind, 'status');
    assert.deepEqual(programEvents[0].data, {
        from: 'submitted',
        to: 'rejected',
        action: 'reject',
        note: 'No hall free',
    });
    await assert.rejects(
        act('perform_program_request_action_tx', uuid(300), 'approve', uuid(2)),
        /Invalid transition/,
    );
    assert.equal(
        (await comments(uuid(300))).length,
        1,
        'a refused transition leaves no activity row',
    );

    // --- edit events: inventory ---------------------------------------------
    const saveInventory = (fields, items, participants, expected, actor = uuid(2)) =>
        db.query('select public.save_inventory_request_tx($1, $2, $3, $4, $5, $6, $7) as id', [
            'update',
            uuid(100),
            JSON.stringify({
                name: 'Cameras',
                requester_id: uuid(1),
                start_date: '2026-12-01',
                end_date: '2026-12-03',
                department_id: uuid(1),
                lead_email: 'lead@example.test',
                ...fields,
            }),
            JSON.stringify(items),
            JSON.stringify(participants),
            expected,
            actor,
        ]);
    const line = (type, quantity, extra = {}) => ({
        inventory_type_id: uuid(type),
        quantity,
        return_condition: null,
        label_ids: [],
        ...extra,
    });
    const memberParticipants = [{ profile_id: uuid(3), external_email: null }];
    const editCount = async () =>
        (await rows(`select count(*)::int as n from comments where kind = 'edit'`))[0].n;

    // Seed the request's items as a draft would have: through a saved edit
    // made while the request was still a draft, which records nothing.
    await db.exec(`update inventory_requests set status = 'draft' where id = '${uuid(100)}'`);
    await saveInventory({}, [line(1, 2), line(2, 1)], memberParticipants, 'draft');
    assert.equal(await editCount(), 0, 'draft edits are not recorded');
    await db.exec(`update inventory_requests set status = 'submitted' where id = '${uuid(100)}'`);

    await saveInventory({}, [line(1, 2), line(2, 1)], memberParticipants, 'submitted');
    assert.equal(await editCount(), 0, 'a save that changes nothing is not recorded');
    await saveInventory({}, [line(1, 2), line(2, 1)], memberParticipants, 'submitted', null);
    assert.equal(await editCount(), 0, 'a save without an actor is not recorded');

    await saveInventory(
        { name: 'Studio cameras', end_date: '2026-12-05', department_id: uuid(2) },
        [line(1, 3), line(3, 1)],
        [...memberParticipants, { profile_id: null, external_email: 'Guest@Example.test' }],
        'submitted',
    );
    const edit = await one(`select message, data, author_id from comments where kind = 'edit'`);
    assert.equal(edit.author_id, uuid(2));
    assert.equal(edit.data.truncated, false);
    const byField = Object.fromEntries(edit.data.changes.map((change) => [change.field, change]));
    assert.deepEqual(byField['Name'], { field: 'Name', from: 'Cameras', to: 'Studio cameras' });
    assert.deepEqual(byField['End date'], {
        field: 'End date',
        from: '3 Dec 2026',
        to: '5 Dec 2026',
    });
    assert.deepEqual(byField['Department'], {
        field: 'Department',
        from: 'Department 1',
        to: 'Department 2',
    });
    assert.deepEqual(byField['Brand · Camera 1 quantity'], {
        field: 'Brand · Camera 1 quantity',
        from: '2',
        to: '3',
    });
    assert.deepEqual(byField['Items'], {
        field: 'Items',
        added: [{ label: 'Tripod × 1' }],
        removed: [{ label: 'Brand · Camera 2 × 1' }],
    });
    assert.deepEqual(byField['Participants'], {
        field: 'Participants',
        added: [{ label: 'guest@example.test' }],
    });
    assert.equal(byField['Start date'], undefined, 'unchanged fields are not listed');
    assert.match(
        edit.message,
        /^Edited Brand · Camera 1 quantity, Department, End date, Items, Name, Participants$/,
    );

    // Label scans and return conditions are recorded too.
    await saveInventory(
        { name: 'Studio cameras', end_date: '2026-12-05', department_id: uuid(2) },
        [line(1, 3, { label_ids: [uuid(1)], return_condition: 'returned' }), line(3, 1)],
        [...memberParticipants, { profile_id: null, external_email: 'guest@example.test' }],
        'submitted',
    );
    const lastEdit = (
        await rows(
            `select data from comments where kind = 'edit' order by created_at desc, id desc limit 1`,
        )
    )[0];
    assert.deepEqual(
        lastEdit.data.changes.map((change) => [change.field, change.from, change.to]),
        [
            ['Brand · Camera 1 condition', null, 'returned'],
            ['Brand · Camera 1 labels', '0', '1'],
        ],
    );

    // --- participants-only edits --------------------------------------------
    const saveParticipants = (kind, id, participants, actor = uuid(1)) =>
        db.query('select public.save_request_participants_tx($1, $2, $3, $4)', [
            kind,
            id,
            JSON.stringify(participants),
            actor,
        ]);
    const before = await editCount();
    await saveParticipants('inventory', uuid(100), []);
    assert.equal(await editCount(), before + 1);
    const removal = await one(
        `select data from comments where kind = 'edit' order by created_at desc, id desc limit 1`,
    );
    assert.deepEqual(removal.data.changes, [
        {
            field: 'Participants',
            removed: [{ label: 'guest@example.test' }, { label: 'person3@example.test' }],
        },
    ]);
    await saveParticipants('inventory', uuid(100), []);
    assert.equal(await editCount(), before + 1, 'unchanged participants are not recorded');

    // A long participant list keeps ten entries and counts the rest.
    const many = Array.from({ length: 13 }, (_, n) => ({
        profile_id: null,
        external_email: `guest${String(n).padStart(2, '0')}@example.test`,
    }));
    await saveParticipants('inventory', uuid(100), many);
    const long = await one(
        `select data from comments where kind = 'edit' order by created_at desc, id desc limit 1`,
    );
    assert.equal(long.data.changes[0].added.length, 10);
    assert.equal(long.data.changes[0].moreAdded, 3);

    // --- edit events: programs ----------------------------------------------
    await db.exec(`update program_requests set status = 'submitted' where id = '${uuid(300)}'`);
    const sessions = (rowsIn) =>
        JSON.stringify(
            rowsIn.map(([name, start, end]) => ({
                name,
                session_type: 'Talk',
                start_at: start,
                end_at: end,
            })),
        );
    const saveProgram = (fields, sessionRows, participants = [], expected = 'submitted') =>
        db.query('select public.save_program_request_tx($1, $2, $3, $4, $5, $6, $7)', [
            'update',
            uuid(300),
            JSON.stringify({
                name: 'Retreat',
                language: 'English',
                program_type: 'Retreat',
                requester_id: uuid(1),
                place_id: uuid(1),
                department_id: uuid(1),
                lead_email: 'lead@example.test',
                ...fields,
            }),
            sessions(sessionRows),
            JSON.stringify(participants),
            expected,
            uuid(1),
        ]);
    const programEditCount = async () =>
        (
            await rows(
                `select count(*)::int as n from comments where kind = 'edit' and program_request_id = $1`,
                [uuid(300)],
            )
        )[0].n;
    await saveProgram({}, [['Opening', '2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z']]);
    const firstProgramEdits = await programEditCount();
    assert.equal(firstProgramEdits, 1, 'place and sessions were set for the first time');
    await saveProgram({}, [['Opening', '2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z']]);
    assert.equal(await programEditCount(), 1, 'an identical program save records nothing');
    await saveProgram({ place_id: uuid(2), language: 'Tamil' }, [
        ['Opening', '2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z'],
        ['Closing', '2026-12-11T10:00:00Z', '2026-12-11T12:00:00Z'],
    ]);
    const programEdit = await one(
        `select data from comments where kind = 'edit' and program_request_id = $1 order by created_at desc, id desc limit 1`,
        [uuid(300)],
    );
    assert.deepEqual(programEdit.data.changes, [
        { field: 'Language', from: 'English', to: 'Tamil' },
        { field: 'Place', from: 'Place 1', to: 'Place 2' },
        {
            field: 'Sessions',
            added: [
                {
                    label: 'Closing · Talk',
                    startAt: '2026-12-11T10:00:00Z',
                    endAt: '2026-12-11T12:00:00Z',
                },
            ],
        },
    ]);

    // --- email ---------------------------------------------------------------
    // The migration replaced the stub trigger function with the real one.
    await db.exec('delete from email_outbox');
    const outbox = () => rows(`select payload from email_outbox order by id`);
    await db.exec(`update inventory_requests set status = 'submitted' where id = '${uuid(100)}'`);
    await act(
        'perform_inventory_request_action_tx',
        uuid(100),
        'reject',
        uuid(2),
        'Not enough stock',
    );
    await saveInventory({ name: 'Renamed again' }, [line(1, 3)], [], 'rejected');
    await db.query(
        'insert into comments (inventory_request_id, author_id, message) values ($1, $2, $3)',
        [uuid(100), uuid(1), 'Thanks'],
    );
    const sent = (await outbox()).map((row) => row.payload);
    assert.equal(sent.length, 2, 'the edit event sends no email');
    const statusMail = sent.find((payload) => payload.kind === 'status');
    assert.equal(statusMail.statusFrom, 'submitted');
    assert.equal(statusMail.statusTo, 'rejected');
    assert.equal(statusMail.statusNote, 'Not enough stock');
    assert.equal(statusMail.authorName, 'Person 2');
    const commentMail = sent.find((payload) => payload.kind === 'comment');
    assert.equal(commentMail.message, 'Thanks');
    assert.ok(!commentMail.statusFrom, 'comments carry no status change');
    assert.ok(
        sent.every((payload) => !('automatedReminder' in payload)),
        'comment emails carry no reminder flag',
    );

    // --- grants --------------------------------------------------------------
    for (const signature of [
        'public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text, uuid)',
        'public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text, uuid)',
        'public.save_request_participants_tx(text, uuid, jsonb, uuid)',
        'public.record_request_edit(text, uuid, uuid, jsonb)',
    ]) {
        for (const [role, expected] of [
            ['anon', false],
            ['authenticated', false],
            ['service_role', true],
        ]) {
            assert.equal(
                (
                    await one(
                        `select has_function_privilege($1, $2::regprocedure, 'execute') as ok`,
                        [role, signature],
                    )
                ).ok,
                expected,
                `${role} ${signature}`,
            );
        }
    }
    const oldSignatures = await rows(
        `select proname from pg_proc where proname like 'save\\_%\\_tx' and pronargs = 6`,
    );
    assert.deepEqual(oldSignatures, [], 'the old save signatures are gone');

    console.log('activity events checks passed');
} finally {
    await db.close();
}
