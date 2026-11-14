import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

// Inventory locations are rows of the inventory places list that types and
// labels point at by id, not free text.
const api = await loadBundle(`
    export {
        createInventoryLabel,
        createInventoryPlace,
        createInventoryType,
        deleteInventoryPlace,
        updateInventoryLabel,
    } from './supabase/functions/api/settings';
    export { listInventoryTypes } from './supabase/functions/api/reference';
`);

const adminClient = fakeClient({ profiles: [{ id: 'admin-1', role: 'admin' }] });

// Records what the API writes and answers only the lookups these calls make.
function recordingAdmin({ places = [], deleteError = null } = {}) {
    const writes = [];
    const idempotency = {
        insert: async () => ({ error: null }),
        update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
        delete: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
    };
    const written = (table, payload) => ({
        select: () => ({
            single: async () => {
                writes.push({ table, payload });
                return { data: { id: 'new-1', display_id: 1, ...payload }, error: null };
            },
        }),
    });
    const admin = {
        from(table) {
            if (table === 'idempotency_keys') return idempotency;
            if (table === 'inventory_places') {
                return {
                    select: () => ({
                        eq: (_column, id) => ({
                            maybeSingle: async () => ({
                                data: places.find((place) => place.id === id) ?? null,
                                error: null,
                            }),
                        }),
                    }),
                    insert: (payload) => written(table, payload),
                    delete: () => ({ eq: async () => ({ error: deleteError }) }),
                };
            }
            if (table === 'inventory_types') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { id: 't1' }, error: null }),
                        }),
                    }),
                    insert: (payload) => written(table, payload),
                };
            }
            return {
                insert: (payload) => written(table, payload),
                update: (payload) => ({ eq: () => written(table, payload) }),
            };
        },
    };
    return { admin, writes };
}

test('the catalog shows each type and label with its place name and id', async () => {
    const catalog = fakeClient({
        inventory_types: [
            { id: 't1', name: 'Camera', location_id: 'p1', location: { name: 'Studio 2' } },
            { id: 't2', name: 'Cable', location_id: null, location: null },
        ],
        inventory_type_labels: [
            {
                id: 'l1',
                display_id: 1,
                inventory_type_id: 't1',
                name: 'CAM-1',
                location_id: 'p2',
                location: { name: 'Studio 5' },
            },
            { id: 'l2', display_id: 2, inventory_type_id: 't1', name: 'CAM-2', location: null },
        ],
    });
    catalog.rpc = async () => ({ data: [], error: null });
    // Listed by name, so the cable comes before the camera.
    const [cable, camera] = await api.listInventoryTypes(catalog);
    assert.deepEqual([camera.Location, camera.LocationId], ['Studio 2', 'p1']);
    assert.deepEqual([cable.Location, cable.LocationId], ['', '']);
    assert.deepEqual(
        camera.labels.map((label) => [label.Location, label.LocationId]),
        [
            ['Studio 5', 'p2'],
            ['', ''],
        ],
    );
});

test('a label or type can only be placed at an existing inventory place', async () => {
    const { admin, writes } = recordingAdmin({ places: [{ id: 'p1', name: 'Studio 2' }] });
    await assert.rejects(
        api.createInventoryLabel(
            adminClient,
            admin,
            'admin-1',
            { inventoryTypeId: 't1', name: 'CAM-1', locationId: 'missing' },
            'request-1',
        ),
        /Location not found/,
    );
    await assert.rejects(
        api.createInventoryType(
            adminClient,
            admin,
            'admin-1',
            { name: 'Camera', locationId: 'missing' },
            'request-2',
        ),
        /Location not found/,
    );
    assert.deepEqual(writes, []);

    await api.createInventoryLabel(
        adminClient,
        admin,
        'admin-1',
        { inventoryTypeId: 't1', name: 'CAM-1', locationId: 'p1' },
        'request-3',
    );
    assert.equal(writes.at(-1).payload.location_id, 'p1');
});

test('an empty location clears the place so a label falls back to its type', async () => {
    const { admin, writes } = recordingAdmin();
    await api.updateInventoryLabel(
        adminClient,
        admin,
        'admin-1',
        'l1',
        { name: 'CAM-1', locationId: '' },
        'request-4',
    );
    assert.equal(writes.at(-1).payload.location_id, null);
});

test('inventory places are admin-only and cannot be deleted while in use', async () => {
    const viewerClient = fakeClient({ profiles: [{ id: 'user-1', role: 'user' }] });
    const { admin } = recordingAdmin();
    await assert.rejects(
        api.createInventoryPlace(viewerClient, admin, 'user-1', { name: 'Studio 2' }, 'request-5'),
        /Administrator access/,
    );
    await assert.rejects(
        api.createInventoryPlace(adminClient, admin, 'admin-1', { name: '  ' }, 'request-6'),
        /Name is required/,
    );

    const inUse = recordingAdmin({
        deleteError: { code: '23503', message: 'violates foreign key constraint' },
    });
    await assert.rejects(
        api.deleteInventoryPlace(adminClient, inUse.admin, 'admin-1', 'p1', 'request-7'),
        /used by inventory types or labels/,
    );
});
