import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBundle, fakeClient } from './test-support.mjs';

const api = await loadBundle(`
            export { fetchAll } from './supabase/functions/api/core';
            export { listProgramRequests } from './supabase/functions/api/programs';
            export { getInventoryRequest, listInventoryRequests } from './supabase/functions/api/inventory';
            export { listRosters } from './supabase/functions/api/roster';
            export { dashboard } from './supabase/functions/api/dashboard';
            export { profilesFor } from './supabase/functions/api/core';
            export { getAvailablePlaces, getCalendarMonth } from './supabase/functions/api/programs';
            export { assertPlaceAvailability } from './supabase/functions/api/scheduling';
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

test('program list keeps every request, session and comment past the row cap', async () => {
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
    const page = await api.listProgramRequests(client, client, 1, { sortBy: 'name' });
    assert.equal(page.totalCount, 1200);
    const first = (await api.listProgramRequests(client, client, 1, {})).items.find(
        (item) => item.Id === requests[0].id,
    );
    assert.equal(first.comments.length, 1100);
    assert.equal(first.comments.at(-1).Message, 'm1099');
});

test('inventory list keeps every request, item, label and comment past the row cap', async () => {
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
            message: `c${i}`,
            created_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
        })),
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    });
    const page = await api.listInventoryRequests(client, client, 1, { sortBy: 'name' });
    assert.equal(page.totalCount, 1100);
    assert.deepEqual(page.statusCounts, { draft: 1100 });
    // Status counts ignore the status filter so every option keeps its badge.
    const closedOnly = await api.listInventoryRequests(client, client, 1, { statuses: ['closed'] });
    assert.equal(closedOnly.totalCount, 0);
    assert.deepEqual(closedOnly.statusCounts, { draft: 1100 });
    // Default ordering is newest activity first, which needs real comment timestamps.
    const recent = await api.listInventoryRequests(client, client, 1, {});
    assert.equal(recent.items[0].Id, requests.at(-1).id);
    assert.equal(recent.items[0].items.length, 1);
    assert.deepEqual(
        recent.items[0].items[0].labels.map((label) => label.Name),
        ['CAM-1'],
    );
    assert.equal(recent.items[0].comments[0].userName, 'U1');
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

test('dashboard loads every dependent row for 250 requests without oversized id lists', async () => {
    const requests = Array.from({ length: 250 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `R${i}`,
        requester_id: 'u1',
        status: 'draft',
        updated_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
    }));
    // 5 items and 6 comments per request: 1250 items and 1500 comments, past the row cap.
    const items = requests.flatMap((request, i) =>
        Array.from({ length: 5 }, (_, j) => ({
            id: `i${pad(i)}${j}`,
            request_id: request.id,
            inventory_type_id: 't1',
            quantity: 1,
        })),
    );
    const comments = requests.flatMap((request, i) =>
        Array.from({ length: 6 }, (_, j) => ({
            id: `c${pad(i)}${j}`,
            inventory_request_id: request.id,
            author_id: 'u1',
            message: `m${j}`,
            created_at: new Date(Date.UTC(2031, 1, 1, 0, 0, i * 6 + j)).toISOString(),
        })),
    );
    const client = fakeClient({
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1', role: 'admin' }],
        departments: [],
        places: [],
        inventory_types: [{ id: 't1', name: 'Camera', brand: 'Acme' }],
        rosters: [],
        inventory_requests: requests,
        inventory_type_labels: [],
        program_requests: [],
        home_content: [{ id: true, guidelines: '' }],
        shift_types: [],
        program_types: [],
        program_languages: [],
        session_types: [],
        blocks: [],
        inventory_request_items: items,
        inventory_request_participants: [],
        program_sessions: [],
        program_request_participants: [],
        comments,
        inventory_request_item_labels: [
            { id: 'a1', request_item_id: items.at(-1).id, inventory_type_label_id: 'l1' },
        ],
    });
    client.rpc = async () => ({ data: [], error: null });
    const payload = await api.dashboard(client, client, 'u1');
    assert.equal(payload.inventoryRequests.length, 250);
    assert.equal(
        payload.inventoryRequests.reduce((total, request) => total + request.items.length, 0),
        1250,
    );
    assert.equal(
        payload.inventoryRequests.reduce((total, request) => total + request.comments.length, 0),
        1500,
    );
});

test('calendar and place checks work with hundreds of approved programs', async () => {
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
    await assert.rejects(
        api.assertPlaceAvailability(client, 'pl1', [
            { start_at: '2033-01-05T11:30:00Z', end_at: '2033-01-05T12:00:00Z' },
        ]),
        /unavailable/,
    );
    await api.assertPlaceAvailability(client, 'pl2', [
        { start_at: '2033-01-05T11:30:00Z', end_at: '2033-01-05T12:00:00Z' },
    ]);
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
});

test('dashboard requests are built by the same DTO builders as the request lists', async () => {
    const tables = {
        profiles: [
            { id: 'u1', email: 'u1@x.org', name: 'U1', role: 'admin' },
            { id: 'u2', email: 'u2@x.org', name: 'U2', role: 'user' },
        ],
        departments: [{ id: 'd1', name: 'Media', short_name: 'MED', lead_email: 'l@x.org' }],
        places: [{ id: 'pl1', name: 'Hall' }],
        inventory_types: [{ id: 't1', name: 'Camera', brand: 'Acme' }],
        inventory_type_labels: [
            { id: 'l1', display_id: 1, inventory_type_id: 't1', name: 'CAM-1' },
        ],
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
        inventory_request_item_labels: [
            { id: 'a1', request_item_id: 'i1', inventory_type_label_id: 'l1' },
        ],
        inventory_request_participants: [
            { id: 'p1', request_id: 'ir1', profile_id: null, external_email: 'ext@x.org' },
        ],
        program_requests: [
            {
                id: 'pr1',
                display_id: 1,
                name: 'Talk',
                language: 'English',
                program_type: 'Other',
                requester_id: 'u2',
                status: 'approved',
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
        comments: [
            {
                id: 'c1',
                inventory_request_id: 'ir1',
                author_id: null,
                author_name: 'Setu Bot',
                message: 'hello',
                created_at: '2031-01-01T00:00:00Z',
            },
            {
                id: 'c2',
                program_request_id: 'pr1',
                author_id: 'u2',
                message: 'hi',
                created_at: '2031-01-01T00:00:00Z',
            },
        ],
        rosters: [],
        home_content: [{ id: true, guidelines: '' }],
        shift_types: [],
        program_types: [],
        program_languages: [],
        session_types: [],
        blocks: [],
    };
    const client = { ...fakeClient(tables), rpc: async () => ({ data: [], error: null }) };
    const board = await api.dashboard(client, client, 'u1');
    const inventory = await api.listInventoryRequests(client, client, 1, {});
    const programs = await api.listProgramRequests(client, client, 1, {});
    assert.deepEqual(board.inventoryRequests, inventory.items);
    assert.deepEqual(board.programRequests, programs.items);
    assert.deepEqual(board.departments, [
        { Id: 'd1', Name: 'Media', ShortName: 'MED', LeadEmail: 'l@x.org' },
    ]);
});

test('request lists can be narrowed by department, requester and label', async () => {
    const base = {
        profiles: [
            { id: 'u1', email: 'u1@x.org', name: 'U1' },
            { id: 'u2', email: 'u2@x.org', name: 'U2' },
        ],
        departments: [],
        places: [],
        comments: [],
        inventory_types: [{ id: 't1', name: 'Camera' }],
        inventory_type_labels: [
            { id: 'l1', display_id: 1, inventory_type_id: 't1', name: 'CAM-1' },
            { id: 'l2', display_id: 2, inventory_type_id: 't1', name: 'CAM-2' },
        ],
        inventory_requests: [
            { id: 'ir1', display_id: 1, requester_id: 'u1', status: 'draft', department_id: 'd1' },
            { id: 'ir2', display_id: 2, requester_id: 'u2', status: 'draft', department_id: 'd2' },
        ],
        inventory_request_items: [
            { id: 'i1', request_id: 'ir1', inventory_type_id: 't1', quantity: 1 },
            { id: 'i2', request_id: 'ir2', inventory_type_id: 't1', quantity: 1 },
        ],
        inventory_request_item_labels: [
            { id: 'a1', request_item_id: 'i1', inventory_type_label_id: 'l1' },
            { id: 'a2', request_item_id: 'i2', inventory_type_label_id: 'l2' },
        ],
        inventory_request_participants: [],
        program_requests: [
            { id: 'pr1', display_id: 1, requester_id: 'u1', status: 'draft', department_id: 'd1' },
            { id: 'pr2', display_id: 2, requester_id: 'u2', status: 'draft', department_id: 'd2' },
        ],
        program_sessions: [],
        program_request_participants: [],
    };
    const client = fakeClient(base);
    const ids = async (list, query) =>
        (await list(client, client, 1, query)).items.map((r) => r.Id);
    assert.deepEqual(await ids(api.listInventoryRequests, { departmentId: 'd2' }), ['ir2']);
    assert.deepEqual(await ids(api.listInventoryRequests, { requesterEmail: 'u1@x.org' }), ['ir1']);
    assert.deepEqual(await ids(api.listInventoryRequests, { labelId: 'l2' }), ['ir2']);
    assert.deepEqual(await ids(api.listProgramRequests, { departmentId: 'd1' }), ['pr1']);
    assert.deepEqual(await ids(api.listProgramRequests, { requesterEmail: 'u2@x.org' }), ['pr2']);
});
