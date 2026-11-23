import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

const rootUrl = new URL('../', import.meta.url);

async function importDashboard() {
    return loadBundle(`export { dashboard } from './supabase/functions/api/dashboard';`);
}

// Wraps a fake client so `.in()` and `.limit()` calls are recorded per table.
function recording(client, calls) {
    const wrap = (query, table) =>
        new Proxy(query, {
            get(target, property) {
                const value = target[property];
                if (typeof value !== 'function') return value;
                return (...args) => {
                    if (property === 'in' || property === 'limit') {
                        calls.push([property, table, ...args]);
                    }
                    const returned = value(...args);
                    return returned === target ? wrap(target, table) : returned;
                };
            },
        });
    return { from: (table) => wrap(client.from(table), table) };
}

test('dashboard bounds request data and scopes dependent rows', async () => {
    const { dashboard } = await importDashboard();
    const calls = [];
    const inventoryRequests = Array.from({ length: 300 }, (_, index) => ({
        id: `inventory-${index}`,
        requester_id: `requester-${index}`,
        status: 'draft',
        display_id: index,
        updated_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}Z`,
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
        updated_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}Z`,
    }));
    const rows = {
        profiles: [{ id: 'actor-1', email: 'actor@example.test', name: 'Actor', role: 'admin' }],
        shift_types: [],
        rosters: [],
        inventory_requests: inventoryRequests,
        program_requests: programRequests,
        program_sessions: [
            { request_id: 'program-0', start_at: '2026-01-01', end_at: '2026-01-02' },
            { request_id: 'program-299', start_at: '2026-01-01', end_at: '2026-01-02' },
            { request_id: 'program-not-listed', start_at: '2026-01-01', end_at: '2026-01-02' },
        ],
        comments: [],
    };
    const client = recording(fakeClient(rows), calls);

    const payload = await dashboard(client, client, 'actor-1');
    assert.equal(payload.pendingProgramRequests.length, 250);
    assert.equal(payload.ongoingInventoryRequests.length, 250);
    assert.equal(payload.pendingProgramCount, 300);
    assert.equal(payload.ongoingInventoryCount, 300);
    assert.equal(
        payload.ongoingInventoryRequests.some((request) => request.Id === 'closed-inventory'),
        false,
    );
    assert.deepEqual(
        calls.filter(([operation, table]) => operation === 'limit' && table.endsWith('_requests')),
        [
            ['limit', 'program_requests', 250],
            ['limit', 'inventory_requests', 250],
        ],
    );
    // Sessions are loaded only for the listed programs, chunked so no request URL
    // carries hundreds of ids.
    const scoped = calls.filter(
        ([operation, table, column]) =>
            operation === 'in' && table === 'program_sessions' && column === 'request_id',
    );
    assert.ok(scoped.length > 1);
    assert.ok(scoped.every((call) => call[3].length <= 100));
    const scopedIds = new Set(scoped.flatMap((call) => call[3]));
    assert.equal(scopedIds.size, 250);
    assert.equal(scopedIds.has('program-not-listed'), false);
    // The dashboard never asks for inventory items or participants: it only lists summaries.
    assert.equal(
        calls.some(([, table]) => /items|participants/.test(table)),
        false,
    );
});

test('request images are lazy-loaded and asynchronously decoded', async () => {
    const source = await readFile(new URL('frontend/src/ui/request-image.tsx', rootUrl), 'utf8');
    assert.match(source, /loading="lazy"/);
    assert.match(source, /decoding="async"/);
});
