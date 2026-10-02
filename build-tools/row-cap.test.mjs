import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    stdin: {
        resolveDir: process.cwd(),
        contents: `
            export { fetchAll, fetchAllIn, profilesFor } from './supabase/functions/api/core';
            export { assertPlaceAvailability, getAvailablePlaces, getCalendarMonth,
                listProgramRequests } from './supabase/functions/api/programs';
            export { getInventoryRequest, listInventoryRequests } from './supabase/functions/api/inventory';
            export { listRosters } from './supabase/functions/api/roster';
            export { listInventoryTypes } from './supabase/functions/api/reference';
        `,
    },
    plugins: [
        {
            name: 'unused-input-validation',
            setup(build) {
                build.onResolve({ filter: /\/validation\.ts$/ }, () => ({
                    path: 'validation',
                    namespace: 'test',
                }));
                build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                    contents: `export const requiredStringArg = (value) => value;
                        export const emailArg = (value) => value;
                        export const isValidEmail = () => true;
                        export const MAX_PARTICIPANTS = 50;
                        export const MAX_COMMENT_LENGTH = 4000;`,
                }));
            },
        },
    ],
});
const api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

// In-memory stand-in for PostgREST: honours filters/order/range, truncates at
// max-rows like a hosted project, and rejects `.in()` lists too long for a URL.
const MAX_ROWS = 1000;
const MAX_IN_VALUES = 100;
function fakeClient(tables, calls = []) {
    return {
        from(table) {
            const filters = [];
            const orders = [];
            let bounds = null;
            const query = {
                select: () => query,
                eq: (column, value) => (filters.push((row) => row[column] === value), query),
                lt: (column, value) => (filters.push((row) => row[column] < value), query),
                gt: (column, value) => (filters.push((row) => row[column] > value), query),
                is: (column, value) => (filters.push((row) => row[column] === value), query),
                not: (column, op, value) => (
                    filters.push((row) => !(op === 'is' && row[column] === value)),
                    query
                ),
                in: (column, values) => {
                    if (values.length > MAX_IN_VALUES) throw new Error('URI too long');
                    filters.push((row) => values.includes(row[column]));
                    return query;
                },
                order: (column) => (orders.push(column), query),
                range: (from, to) => ((bounds = [from, to]), query),
                single: () => query.then((res) => ({ data: res.data?.[0] ?? null, error: null })),
                then(resolve, reject) {
                    let rows = (tables[table] || []).filter((row) => filters.every((f) => f(row)));
                    rows = [...rows].sort((a, b) => {
                        for (const column of orders) {
                            if (a[column] < b[column]) return -1;
                            if (a[column] > b[column]) return 1;
                        }
                        return 0;
                    });
                    const from = bounds ? bounds[0] : 0;
                    const to = bounds ? bounds[1] : MAX_ROWS - 1;
                    calls.push({ table, from, to });
                    return Promise.resolve({
                        data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)),
                        error: null,
                    }).then(resolve, reject);
                },
            };
            return query;
        },
    };
}

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

test('fetchAllIn chunks long id lists and dedupes them', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ id: pad(i) }));
    const calls = [];
    const client = fakeClient({ things: rows }, calls);
    const ids = [...rows.map((row) => row.id), ...rows.map((row) => row.id)];
    const found = await api.fetchAllIn(ids, (chunk, from, to) =>
        client.from('things').select('*').in('id', chunk).order('id').range(from, to),
    );
    assert.equal(found.length, 450);
    assert.equal(calls.length, 5);
});

test('profilesFor handles more users than fit in one request URL', async () => {
    const profiles = Array.from({ length: 480 }, (_, i) => ({ id: pad(i), email: `u${i}@x.org` }));
    const profilesById = await api.profilesFor(
        fakeClient({ profiles }),
        profiles.map((p) => p.id),
    );
    assert.equal(profilesById.size, 480);
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

test('calendar and place availability scale with the window, not with all approved programs', async () => {
    const requests = Array.from({ length: 1500 }, (_, i) => ({
        id: pad(i),
        display_id: i,
        name: `P${i}`,
        requester_id: 'u1',
        status: 'approved',
        place_id: i % 2 ? 'pl1' : 'pl2',
    }));
    // Only request 0 occupies 10 January; the rest sit on the 20th of their month.
    const day = (i) => `2031-${String((i % 12) + 1).padStart(2, '0')}-${i === 0 ? '10' : '20'}`;
    const sessions = requests.map((r, i) => ({
        id: pad(i),
        request_id: r.id,
        session_type: 'Talk',
        start_at: `${day(i)}T10:00:00Z`,
        end_at: `${day(i)}T11:00:00Z`,
    }));
    const tables = {
        places: [
            { id: 'pl1', name: 'Hall' },
            { id: 'pl2', name: 'Room' },
        ],
        departments: [],
        program_requests: requests,
        program_sessions: sessions,
        program_request_participants: [],
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
    };
    const client = fakeClient(tables);

    const january = await api.getCalendarMonth(client, 2031, 1);
    const expected = requests.filter((_, i) => i % 12 === 0).length;
    assert.equal(january.programs.length, expected);

    const probe = [{ startDateTime: '2031-01-10T10:30:00Z', endDateTime: '2031-01-10T11:30:00Z' }];
    // Index 0 (place pl2, January) overlaps the probe; pl1 stays free.
    const places = await api.getAvailablePlaces(client, '', probe);
    assert.deepEqual(
        places.map((place) => place.Id),
        ['pl1'],
    );
    assert.deepEqual(
        (await api.getAvailablePlaces(client, requests[0].id, probe)).map((place) => place.Id),
        ['pl1', 'pl2'],
    );

    const sessionsToCheck = [{ start_at: '2031-01-10T11:30:00Z', end_at: '2031-01-10T12:00:00Z' }];
    await assert.rejects(
        api.assertPlaceAvailability(client, 'pl2', sessionsToCheck),
        /unavailable/,
    );
    await api.assertPlaceAvailability(client, 'pl2', sessionsToCheck, requests[0].id);
    await api.assertPlaceAvailability(client, 'pl1', sessionsToCheck);
});

test('inventory detail loads only the labels and types its items use', async () => {
    const calls = [];
    const client = fakeClient(
        {
            inventory_requests: [
                { id: 'r1', display_id: 1, name: 'Kit', requester_id: 'u1', status: 'draft' },
            ],
            departments: [],
            inventory_request_items: [
                { id: 'i1', request_id: 'r1', inventory_type_id: 't1', quantity: 1 },
            ],
            inventory_request_item_labels: [
                { id: 'a1', request_item_id: 'i1', inventory_type_label_id: 'l1' },
                { id: 'a2', request_item_id: 'other', inventory_type_label_id: 'l2' },
            ],
            inventory_types: [
                { id: 't1', name: 'Camera', brand: 'Acme' },
                { id: 't2', name: 'Unused' },
            ],
            inventory_type_labels: [
                { id: 'l1', display_id: 1, inventory_type_id: 't1', name: 'CAM-1' },
                { id: 'l2', display_id: 2, inventory_type_id: 't2', name: 'OTHER' },
            ],
            inventory_request_participants: [],
            comments: [],
            profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
        },
        calls,
    );
    const request = await api.getInventoryRequest(client, client, 'r1');
    assert.deepEqual(
        request.items.map((item) => [item.itemName, item.labels.map((label) => label.Name)]),
        [['Acme · Camera', ['CAM-1']]],
    );
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
