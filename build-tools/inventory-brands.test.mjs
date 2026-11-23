import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

// An inventory type's brand is chosen from the inventory brands list, not typed.
const api = await loadBundle(`
    export {
        createInventoryBrand,
        createInventoryType,
        deleteInventoryBrand,
        updateInventoryType,
    } from './supabase/functions/api/settings';
`);

const adminClient = fakeClient({ profiles: [{ id: 'admin-1', role: 'admin' }] });
// Building the saved type's response reads its availability.
adminClient.rpc = async () => ({ data: [], error: null });

// Records what the API writes and answers only the lookups these calls make.
function recordingAdmin({ brands = [], deleteError = null } = {}) {
    const writes = [];
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
            if (table === 'inventory_brands') {
                return {
                    select: () => ({
                        eq: (_column, name) => ({
                            maybeSingle: async () => ({
                                data: brands.find((brand) => brand.name === name) ?? null,
                                error: null,
                            }),
                        }),
                    }),
                    insert: (payload) => written(table, payload),
                    delete: () => ({ eq: async () => ({ error: deleteError }) }),
                };
            }
            return {
                insert: (payload) => written(table, payload),
                update: (payload) => ({ eq: () => written(table, payload) }),
                select: () => ({
                    eq: () => ({ single: async () => ({ data: { id: 't1' }, error: null }) }),
                }),
            };
        },
    };
    return { admin, writes };
}

test('a type can only be given a brand from the inventory brands list', async () => {
    const { admin, writes } = recordingAdmin({ brands: [{ id: 'b1', name: 'Sony' }] });
    await assert.rejects(
        api.createInventoryType(adminClient, admin, 'admin-1', { name: 'Camera', brand: 'Typo' }),
        /Brand not found/,
    );
    await assert.rejects(
        api.updateInventoryType(adminClient, admin, 'admin-1', 't1', {
            name: 'Camera',
            brand: 'Typo',
        }),
        /Brand not found/,
    );
    assert.equal(writes.length, 0, 'nothing is written for an unknown brand');

    await api.createInventoryType(adminClient, admin, 'admin-1', {
        name: 'Camera',
        brand: ' Sony ',
    });
    assert.equal(writes.at(-1).payload.brand, 'Sony');

    // No brand is always allowed.
    await api.createInventoryType(adminClient, admin, 'admin-1', { name: 'Cable', brand: '' });
    assert.equal(writes.at(-1).payload.brand, '');
});

test('inventory brands are admin-only and cannot be deleted while in use', async () => {
    const viewerClient = fakeClient({ profiles: [{ id: 'user-1', role: 'user' }] });
    const { admin } = recordingAdmin();
    await assert.rejects(
        api.createInventoryBrand(viewerClient, admin, 'user-1', { name: 'Sony' }),
        /Administrator access/,
    );
    await assert.rejects(
        api.createInventoryBrand(adminClient, admin, 'admin-1', { name: '  ' }),
        /Name is required/,
    );

    const inUse = recordingAdmin({
        deleteError: { code: '23503', message: 'Brand "Sony" is still used by inventory types.' },
    });
    await assert.rejects(
        api.deleteInventoryBrand(adminClient, inUse.admin, 'admin-1', 'b1'),
        /used by inventory types and cannot be deleted/,
    );
});
