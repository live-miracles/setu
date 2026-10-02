import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const rootUrl = new URL('../', import.meta.url);

async function importDashboard() {
    const source = (
        await readFile(new URL('supabase/functions/api/dashboard.ts', rootUrl), 'utf8')
    ).replace(/^import[\s\S]*?;\n/gm, '');
    const prelude = `
        const result = (response) => {
            if (response.error) throw new Error(response.error.message);
            return response.data;
        };
        const profilesFor = async (_admin, ids) => new Map(
            ids.filter(Boolean).map((id) => [id, { id, email: id + '@example.test', name: id }]),
        );
        const userDto = (profile) => ({ Email: profile.email, Name: profile.name, Role: profile.role });
    `;
    const { code } = await transform(prelude + source, { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('dashboard bounds request data and scopes dependent rows', async () => {
    const { dashboard } = await importDashboard();
    const calls = [];
    const inventoryRequests = Array.from({ length: 300 }, (_, index) => ({
        id: `inventory-${index}`,
        requester_id: `requester-${index}`,
        status: 'draft',
        display_id: index,
    }));
    inventoryRequests.unshift({
        id: 'closed-inventory',
        requester_id: 'closed-requester',
        status: 'closed',
        display_id: 999,
    });
    const programRequests = Array.from({ length: 300 }, (_, index) => ({
        id: `program-${index}`,
        requester_id: `program-requester-${index}`,
        status: 'draft',
        display_id: index,
    }));
    const rows = {
        profiles: [
            {
                id: 'actor-1',
                email: 'actor@example.test',
                name: 'Actor',
                role: 'admin',
            },
        ],
        departments: [],
        places: [],
        inventory_types: [],
        rosters: [],
        inventory_requests: inventoryRequests,
        inventory_type_labels: [],
        program_requests: programRequests,
        home_content: [{ id: true, guidelines: '' }],
        shift_types: [],
        program_types: [],
        program_languages: [],
        session_types: [],
        blocks: [],
        inventory_request_items: [
            { id: 'included-item', request_id: 'inventory-0', inventory_type_id: 'type-1' },
            { id: 'excluded-item', request_id: 'inventory-299', inventory_type_id: 'type-2' },
        ],
        inventory_request_participants: [],
        program_sessions: [
            { request_id: 'program-0', start_at: '2026-01-01', end_at: '2026-01-02' },
            { request_id: 'program-299', start_at: '2026-01-01', end_at: '2026-01-02' },
        ],
        program_request_participants: [],
        comments: [],
        inventory_request_item_labels: [
            { request_item_id: 'included-item', inventory_type_label_id: 'label-1' },
            { request_item_id: 'excluded-item', inventory_type_label_id: 'label-2' },
        ],
    };
    function from(table) {
        let data = [...(rows[table] || [])];
        return {
            select() {
                return this;
            },
            eq(column, value) {
                data = data.filter((row) => row[column] === value);
                return this;
            },
            gte() {
                return this;
            },
            in(column, values) {
                calls.push(['in', table, column, values]);
                data = data.filter((row) => values.includes(row[column]));
                return this;
            },
            order() {
                return this;
            },
            limit(value) {
                calls.push(['limit', table, value]);
                data = data.slice(0, value);
                return this;
            },
            async single() {
                return { data: data[0], error: null };
            },
            then(resolve, reject) {
                return Promise.resolve({ data, error: null }).then(resolve, reject);
            },
        };
    }
    const client = {
        from,
        rpc: async () => ({ data: [], error: null }),
    };

    const payload = await dashboard(client, {}, 'actor-1');
    assert.equal(payload.inventoryRequests.length, 250);
    assert.equal(payload.programRequests.length, 250);
    assert.equal(
        payload.inventoryRequests.some((request) => request.Id === 'closed-inventory'),
        false,
    );
    assert.equal(payload.inventoryRequests[0].items.length, 1);
    assert.equal(payload.programRequests[0].sessions.length, 1);
    assert.deepEqual(
        calls.filter(([operation]) => operation === 'limit'),
        [
            ['limit', 'inventory_requests', 250],
            ['limit', 'program_requests', 250],
        ],
    );
    for (const table of [
        'inventory_request_items',
        'inventory_request_participants',
        'program_sessions',
        'program_request_participants',
    ]) {
        const call = calls.find(
            ([operation, calledTable, column]) =>
                operation === 'in' && calledTable === table && column === 'request_id',
        );
        assert.ok(call, `${table} should be scoped to dashboard request ids`);
        assert.equal(call[3].length, 250);
    }
    assert.ok(
        calls.some(
            ([operation, table, column, values]) =>
                operation === 'in' &&
                table === 'inventory_request_item_labels' &&
                column === 'request_item_id' &&
                values.length === 1 &&
                values[0] === 'included-item',
        ),
    );
});

test('request images are lazy-loaded and asynchronously decoded', async () => {
    const source = await readFile(new URL('frontend/src/ui/request-image.tsx', rootUrl), 'utf8');
    assert.match(source, /loading="lazy"/);
    assert.match(source, /decoding="async"/);
});
