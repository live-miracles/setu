import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBundle, fakeClient } from './test-support.mjs';

const api = await loadBundle(`
            export { fetchAll } from './supabase/functions/api/core';
            export { listProgramRequests } from './supabase/functions/api/programs';
            export { getInventoryRequest, listInventoryRequests } from './supabase/functions/api/inventory';
            export { listRosters, combineDateTime, rosterTimeFields } from './supabase/functions/api/roster';
            export { dashboard } from './supabase/functions/api/dashboard';
            export { profilesFor } from './supabase/functions/api/core';
            export { getAvailablePlaces, getCalendarMonth } from './supabase/functions/api/programs';
            export { listInventoryTypes } from './supabase/functions/api/reference';
        `);

const pad = (n) => String(n).padStart(6, '0');

test('fetchAll returns every row even when the table exceeds the server row cap', async () => {
    const rows = Array.from({ length: 2503 }, (_, i) => ({ id: pad(i) }));
    const client = fakeClient({ things: rows });
    const all = await api.fetchAll((from, to) =>
        client.from('things').select('*').order('id').range(from, to),
    );
    assert.equal(all.length, 2503);
    assert.equal(new Set(all.map((row) => row.id)).size, 2503);
});

// The list endpoints ask Postgres for one page of ids (list_*_requests_page; its
// filtering, search, sorting and paging are covered by
// request-list-pages-db-check.mjs) and then load only those requests.
function withPageRpc(client, found) {
    const rpcCalls = [];
    client.rpc = async (name, args) => {
        rpcCalls.push({ name, args });
        return { data: found, error: null };
    };
    return rpcCalls;
}

test('program list loads the requested page in the database order, with every comment', async () => {
    const requests = Array.from({ length: 1200 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `P${i}`,
        requester_id: 'u1',
        status: 'approved',
        place_id: 'pl1',
    }));
    const sessions = requests.map((r, i) => ({
        id: pad(i),
        request_id: r.id,
        session_type: 'Talk',
        start_at: `2030-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
        end_at: `2030-01-01T${String(i % 24).padStart(2, '0')}:30:00Z`,
    }));
    // Newest comment sorts last: previously dropped once 1000 older ones existed.
    const comments = Array.from({ length: 1100 }, (_, i) => ({
        id: pad(i),
        program_request_id: requests[0].id,
        author_id: 'u1',
        message: `m${i}`,
        created_at: new Date(Date.UTC(2030, 1, 1, 0, 0, i)).toISOString(),
    }));
    const client = fakeClient({
        places: [{ id: 'pl1', name: 'Hall' }],
        departments: [],
        program_requests: requests,
        program_sessions: sessions,
        program_request_participants: [],
        comments,
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    // The database's order wins; an id the caller may not see (or that is gone) is skipped.
    const ids = [requests[5].id, requests[0].id, 'not-visible', requests[3].id];
    const rpcCalls = withPageRpc(client, { ids, total: 1200 });
    const page = await api.listProgramRequests(client, client, 2, { sortBy: 'name' });
    assert.deepEqual(rpcCalls, [
        {
            name: 'list_program_requests_page',
            args: { p_query: { sortBy: 'name' }, p_page: 2, p_page_size: 25 },
        },
    ]);
    assert.deepEqual(
        page.items.map((item) => item.Id),
        [requests[5].id, requests[0].id, requests[3].id],
    );
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 25);
    assert.equal(page.totalCount, 1200);
    const first = page.items[1];
    assert.equal(first.comments.length, 1100);
    assert.equal(first.comments.at(-1).Message, 'm1099');
    assert.equal(first.sessions.length, 1);

    // Page numbers are whole and at least 1; nothing found loads nothing.
    for (const [asked, sent] of [
        [0, 1],
        [Number.NaN, 1],
        [3.9, 3],
    ]) {
        rpcCalls.length = 0;
        await api.listProgramRequests(client, client, asked, {});
        assert.equal(rpcCalls[0].args.p_page, sent);
    }
    const empty = fakeClient({});
    withPageRpc(empty, { ids: [], total: 0 });
    const none = await api.listProgramRequests(empty, empty, 1, {});
    assert.deepEqual(none.items, []);
    assert.equal(none.totalCount, 0);
});

test('inventory list loads items, labels and comments for the page and passes status counts on', async () => {
    const requests = Array.from({ length: 1100 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `R${i}`,
        requester_id: 'u1',
        status: 'draft',
        start_date: '2031-01-01',
        end_date: '2031-01-02',
    }));
    const items = requests.map((request, i) => ({
        id: `i${pad(i)}`,
        request_id: request.id,
        inventory_type_id: 't1',
        quantity: 1,
    }));
    const lastItem = items.at(-1);
    const client = fakeClient({
        inventory_types: [{ id: 't1', name: 'Camera', brand: 'Acme' }],
        departments: [],
        inventory_requests: requests,
        inventory_request_items: items,
        inventory_request_item_labels: [
            { id: 'a1', request_item_id: lastItem.id, inventory_type_label_id: 'l1' },
        ],
        inventory_type_labels: [
            { id: 'l1', display_id: 1, inventory_type_id: 't1', name: 'CAM-1' },
        ],
        inventory_request_participants: [],
        comments: requests.map((request, i) => ({
            id: pad(i),
            inventory_request_id: request.id,
            author_id: 'u1',
            kind: 'comment',
            message: `c${i}`,
            created_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
        })),
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    // 25 ids on a page are loaded together, in the given order.
    const ids = requests
        .slice(-25)
        .map((request) => request.id)
        .reverse();
    const rpcCalls = withPageRpc(client, { ids, total: 1100, statusCounts: { draft: 1100 } });
    const query = { statuses: ['closed'], search: 'cam' };
    const page = await api.listInventoryRequests(client, client, 1, query);
    assert.equal(rpcCalls[0].name, 'list_inventory_requests_page');
    assert.deepEqual(rpcCalls[0].args, { p_query: query, p_page: 1, p_page_size: 25 });
    assert.equal(page.totalCount, 1100);
    assert.deepEqual(page.statusCounts, { draft: 1100 });
    assert.deepEqual(
        page.items.map((item) => item.Id),
        ids,
    );
    assert.equal(page.items[0].Id, requests.at(-1).id);
    assert.equal(page.items[0].items.length, 1);
    assert.deepEqual(
        page.items[0].items[0].labels.map((label) => label.Name),
        ['CAM-1'],
    );
    assert.equal(page.items[0].comments[0].userName, 'U1');
});

test('roster history and the inventory catalog are not truncated at the row cap', async () => {
    const rosters = Array.from({ length: 1300 }, (_, i) => ({
        id: pad(i),
        shift_type_id: 's1',
        user_id: 'u1',
        start_at: new Date(Date.UTC(2031, 0, 1, 0, i)).toISOString(),
        end_at: new Date(Date.UTC(2031, 0, 1, 1, i)).toISOString(),
    }));
    const client = fakeClient({
        rosters,
        shift_types: [{ id: 's1', name: 'Morning' }],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const page = await api.listRosters(client, client, 1);
    assert.equal(page.totalCount, 1300);
    // Newest first across the whole history, not just the first 1000 rows.
    assert.equal(page.items[0].Id, rosters.at(-1).id);

    const labels = Array.from({ length: 1200 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        inventory_type_id: 't1',
        name: `L${pad(i)}`,
    }));
    const catalog = fakeClient({
        inventory_types: [{ id: 't1', name: 'Camera', total_quantity: 5 }],
        inventory_type_labels: labels,
    });
    catalog.rpc = async () => ({ data: [], error: null });
    const types = await api.listInventoryTypes(catalog);
    assert.equal(types[0].labels.length, 1200);
});

test('calendar keeps sessions that only fall in this month in the viewer local time zone', async () => {
    // 00:30-01:30 on 1 Feb in UTC+05:30 is 19:00-20:00 UTC on 31 Jan.
    const client = fakeClient({
        places: [{ id: 'pl1', name: 'Hall' }],
        departments: [],
        program_requests: [
            {
                id: 'p1',
                display_id: 1,
                name: 'Early',
                requester_id: 'u1',
                status: 'approved',
                place_id: 'pl1',
            },
        ],
        program_sessions: [
            {
                id: 's1',
                request_id: 'p1',
                session_type: 'Talk',
                start_at: '2031-01-31T19:00:00Z',
                end_at: '2031-01-31T20:00:00Z',
            },
        ],
        program_request_participants: [],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const february = await api.getCalendarMonth(client, 2031, 2);
    assert.deepEqual(
        february.programs.map((program) => program.Id),
        ['p1'],
    );
    const april = await api.getCalendarMonth(client, 2031, 4);
    assert.equal(april.programs.length, 0);
});

test('calendar and available places work with hundreds of approved programs', async () => {
    const requests = Array.from({ length: 1100 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `P${i}`,
        requester_id: 'u1',
        status: 'approved',
        place_id: 'pl1',
    }));
    // One session per program, on distinct days of 2031-2034, plus a probe slot for request 0.
    const sessions = requests.map((request, i) => {
        const day = new Date(Date.UTC(2031, 0, 1 + i));
        const date = day.toISOString().slice(0, 10);
        return {
            id: pad(i),
            request_id: request.id,
            session_type: 'Talk',
            start_at: `${date}T10:00:00Z`,
            end_at: `${date}T11:00:00Z`,
        };
    });
    const client = fakeClient({
        places: [
            { id: 'pl1', name: 'Hall' },
            { id: 'pl2', name: 'Room' },
        ],
        departments: [],
        program_requests: requests,
        program_sessions: sessions,
        program_request_participants: [],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const january = await api.getCalendarMonth(client, 2031, 1);
    // 31 days of January plus 1 February, kept by the one-day local-time padding.
    assert.equal(january.programs.length, 32);

    const probe = [{ startDateTime: '2033-01-05T10:30:00Z', endDateTime: '2033-01-05T11:30:00Z' }];
    assert.deepEqual(
        (await api.getAvailablePlaces(client, '', probe)).map((place) => place.Id),
        ['pl2'],
    );
    // Editing the program that holds the slot does not clash with itself.
    const holder = requests[Math.round((Date.UTC(2033, 0, 5) - Date.UTC(2031, 0, 1)) / 86400000)];
    assert.deepEqual(
        (await api.getAvailablePlaces(client, holder.id, probe)).map((place) => place.Id),
        ['pl1', 'pl2'],
    );
});

test('profilesFor handles more users than fit in one request URL', async () => {
    const profiles = Array.from({ length: 480 }, (_, i) => ({ id: pad(i), email: `u${i}@x.org` }));
    const byId = await api.profilesFor(
        fakeClient({ profiles }),
        profiles.map((p) => p.id),
    );
    assert.equal(byId.size, 480);
});

test('inventory detail loads only the labels and types its items use', async () => {
    const labels = Array.from({ length: 1200 }, (_, i) => ({
        id: `l${pad(i)}`,
        display_id: i,
        inventory_type_id: 't1',
        name: `L${pad(i)}`,
    }));
    const client = fakeClient({
        inventory_requests: [
            { id: 'r1', display_id: 1, name: 'Kit', requester_id: 'u1', status: 'issued' },
        ],
        departments: [],
        inventory_request_items: [
            { id: 'i1', request_id: 'r1', inventory_type_id: 't1', quantity: 1 },
        ],
        inventory_request_item_labels: [
            { id: 'a1', request_item_id: 'i1', inventory_type_label_id: labels.at(-1).id },
            { id: 'a2', request_item_id: 'other', inventory_type_label_id: labels[0].id },
        ],
        inventory_types: [{ id: 't1', name: 'Camera', brand: 'Acme' }],
        inventory_type_labels: labels,
        inventory_request_participants: [],
        comments: [],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const request = await api.getInventoryRequest(client, client, 'r1');
    assert.deepEqual(
        request.items.map((item) => [item.itemName, item.labels.map((label) => label.Name)]),
        [['Acme · Camera', [labels.at(-1).name]]],
    );
    await assert.rejects(api.getInventoryRequest(client, client, 'gone'), /Request not found/);
});

test('dashboard bounds each request kind, loads every session past the row cap and keeps the newest comments', async () => {
    // 300 pending programs (past the 250 cap), each with a session, plus
    // programs that are not pending; likewise 300 ongoing inventory requests and a closed one.
    const programs = Array.from({ length: 300 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `P${i}`,
        requester_id: 'u1',
        status: i % 2 ? 'draft' : 'submitted',
        updated_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
    }));
    programs.push({
        id: 'approved-1',
        display_id: 900,
        name: 'Done',
        requester_id: 'u1',
        status: 'approved',
    });
    const inventory = Array.from({ length: 300 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `R${i}`,
        requester_id: 'u1',
        status: 'draft',
        start_date: '2031-01-01',
        end_date: '2031-01-02',
        updated_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
    }));
    inventory.push({
        id: 'closed-1',
        display_id: 901,
        name: 'Back',
        requester_id: 'u1',
        status: 'closed',
    });
    const sessions = programs.map((program, i) => ({
        id: `s${pad(i)}`,
        request_id: program.id,
        session_type: 'Talk',
        start_at: '2031-02-01T10:00:00Z',
        end_at: '2031-02-01T11:00:00Z',
    }));
    // 20 comments of each kind: only the newest 8 of each come back.
    const commentsOf = (column, requestId) =>
        Array.from({ length: 20 }, (_, i) => ({
            id: `${column}-${i}`,
            [column]: requestId,
            author_id: 'u1',
            kind: 'comment',
            message: `${column} ${i}`,
            created_at: new Date(Date.UTC(2031, 1, 1, 0, 0, i)).toISOString(),
        }));
    const client = fakeClient({
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1', role: 'admin' }],
        program_requests: programs,
        inventory_requests: inventory,
        program_sessions: sessions,
        comments: [
            ...commentsOf('program_request_id', programs[0].id),
            ...commentsOf('inventory_request_id', inventory[0].id),
            // The newest rows of all are status and edit events: the home
            // screen's recent comments must not show them.
            ...['program_request_id', 'inventory_request_id'].flatMap((column, n) =>
                ['status', 'edit'].map((kind, k) => ({
                    id: `${kind}-${column}`,
                    [column]: column === 'program_request_id' ? programs[0].id : inventory[0].id,
                    author_id: 'u1',
                    kind,
                    message: `${kind} event`,
                    created_at: new Date(Date.UTC(2032, 0, 1, 0, 0, n * 2 + k)).toISOString(),
                })),
            ),
        ],
        shift_types: [],
        rosters: [],
    });
    const payload = await api.dashboard(client, client, 'u1');
    assert.equal(payload.pendingProgramRequests.length, 250);
    assert.equal(payload.pendingProgramCount, 300);
    assert.equal(payload.ongoingInventoryRequests.length, 250);
    assert.equal(payload.ongoingInventoryCount, 300);
    assert.ok(!payload.pendingProgramRequests.some((x) => x.Id === 'approved-1'));
    assert.ok(!payload.ongoingInventoryRequests.some((x) => x.Id === 'closed-1'));
    // Newest activity first; every listed program has its session (the id list is chunked).
    assert.equal(payload.pendingProgramRequests[0].Id, programs[299].id);
    assert.ok(payload.pendingProgramRequests.every((x) => x.sessionStart));
    assert.equal(payload.recentComments.length, 16);
    for (const kind of ['programs', 'inventory']) {
        const messages = payload.recentComments
            .filter((entry) => entry.kind === kind)
            .map((entry) => entry.comment.Message.split(' ')[1]);
        assert.deepEqual(messages, ['19', '18', '17', '16', '15', '14', '13', '12']);
    }
    assert.ok(payload.recentComments.every((entry) => entry.request.Name));
    assert.ok(
        payload.recentComments.every((entry) => entry.comment.Kind === 'comment'),
        'status and edit events stay out of the recent comments',
    );
});

test('dashboard summaries come from the same DTO builders as the request lists', async () => {
    const tables = {
        profiles: [
            { id: 'u1', email: 'u1@x.org', name: 'U1', role: 'admin' },
            { id: 'u2', email: 'u2@x.org', name: 'U2', role: 'user' },
        ],
        departments: [{ id: 'd1', name: 'Media', short_name: 'MED', lead_email: 'l@x.org' }],
        places: [{ id: 'pl1', name: 'Hall' }],
        inventory_types: [{ id: 't1', name: 'Camera', brand: 'Acme' }],
        inventory_requests: [
            {
                id: 'ir1',
                display_id: 1,
                name: 'Shoot',
                requester_id: 'u2',
                status: 'draft',
                start_date: '2031-01-01',
                end_date: '2031-01-02',
                department_id: 'd1',
                lead_email: 'l@x.org',
            },
        ],
        inventory_request_items: [
            { id: 'i1', request_id: 'ir1', inventory_type_id: 't1', quantity: 2 },
        ],
        inventory_request_item_labels: [],
        inventory_type_labels: [],
        inventory_request_participants: [],
        program_requests: [
            {
                id: 'pr1',
                display_id: 1,
                name: 'Talk',
                language: 'English',
                program_type: 'Other',
                requester_id: 'u2',
                status: 'submitted',
                place_id: 'pl1',
                department_id: 'd1',
                lead_email: 'l@x.org',
            },
        ],
        program_sessions: [
            {
                id: 's1',
                request_id: 'pr1',
                name: 'Day 1',
                session_type: 'Talk',
                start_at: '2031-01-01T10:00:00Z',
                end_at: '2031-01-01T11:00:00Z',
            },
        ],
        program_request_participants: [],
        comments: [],
        rosters: [],
        shift_types: [],
    };
    const client = fakeClient(tables);
    const board = await api.dashboard(client, client, 'u1');
    withPageRpc(client, { ids: ['ir1'], total: 1 });
    const inventory = (await api.listInventoryRequests(client, client, 1, {})).items[0];
    withPageRpc(client, { ids: ['pr1'], total: 1 });
    const program = (await api.listProgramRequests(client, client, 1, {})).items[0];
    const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
    assert.deepEqual(
        board.pendingProgramRequests[0],
        pick(program, [
            'Id',
            'DisplayId',
            'Name',
            'Status',
            'userName',
            'sessionStart',
            'sessionEnd',
        ]),
    );
    assert.deepEqual(
        board.ongoingInventoryRequests[0],
        pick(inventory, ['Id', 'DisplayId', 'Name', 'Status', 'userName', 'StartDate', 'EndDate']),
    );
});

test('request list calls hand the caller query to the database untouched', async () => {
    const client = fakeClient({});
    const rpcCalls = withPageRpc(client, { ids: [], total: 0 });
    const filters = { departmentId: 'd2', requesterEmail: 'u1@x.org', labelId: 'l2' };
    await api.listInventoryRequests(client, client, 1, filters);
    await api.listProgramRequests(client, client, 1, filters);
    assert.deepEqual(
        rpcCalls.map((call) => [call.name, call.args.p_query]),
        [
            ['list_inventory_requests_page', filters],
            ['list_program_requests_page', filters],
        ],
    );
});

test('blank roster times are stored as day bounds and read back as empty', () => {
    // Blank start -> start of day; blank end -> end of day, so a same-day shift
    // with no times is still a valid (end > start) range.
    assert.equal(api.combineDateTime('2031-01-05', ''), '2031-01-05T00:00:00');
    assert.equal(api.combineDateTime('2031-01-05', '', '23:59:59'), '2031-01-05T23:59:59');
    assert.equal(api.combineDateTime('2031-01-05', '09:30'), '2031-01-05T09:30:00');

    const blank = api.rosterTimeFields({
        start_at: '2031-01-05T00:00:00+00:00',
        end_at: '2031-01-05T23:59:59+00:00',
        start_time_set: false,
        end_time_set: false,
    });
    assert.equal(blank.StartTime, '');
    assert.equal(blank.EndTime, '');
    assert.equal(blank.StartDate, '2031-01-05');

    // A genuine midnight time (flag true / absent on legacy rows) is kept.
    const midnight = api.rosterTimeFields({
        start_at: '2031-01-05T00:00:00+00:00',
        end_at: '2031-01-05T10:00:00+00:00',
        start_time_set: true,
    });
    assert.equal(midnight.StartTime, '00:00');
    assert.equal(midnight.EndTime, '10:00');
});

test('calendar programs carry no requester or contact details', async () => {
    const client = fakeClient({
        places: [{ id: 'pl1', name: 'Hall' }],
        departments: [],
        program_requests: [
            {
                id: 'p1',
                display_id: 1,
                name: 'Talk',
                requester_id: 'u1',
                status: 'approved',
                place_id: 'pl1',
                lead_email: 'lead@x.org',
            },
        ],
        program_sessions: [
            {
                id: 's1',
                request_id: 'p1',
                session_type: 'Talk',
                start_at: '2031-02-10T10:00:00Z',
                end_at: '2031-02-10T11:00:00Z',
            },
        ],
        program_request_participants: [{ id: 'x1', request_id: 'p1', external_email: 'a@x.org' }],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const [program] = (await api.getCalendarMonth(client, 2031, 2)).programs;
    assert.equal(program.Name, 'Talk');
    assert.equal(program.placeName, 'Hall');
    assert.equal(program.sessions.length, 1);
    assert.equal(program.UserId, '');
    assert.equal(program.userName, '');
    assert.equal(program.LeadEmail, '');
    assert.deepEqual(program.participants, []);
    assert.equal(JSON.stringify(program).includes('x.org'), false);
});
