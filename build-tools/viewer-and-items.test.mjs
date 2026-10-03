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
            export { createInventoryRequest, updateInventoryRequest, updateInventoryRequestParticipants,
                performInventoryRequestAction, deleteInventoryRequest, validateInventoryItems }
                from './supabase/functions/api/inventory';
            export { createProgramRequest, updateProgramRequest, updateProgramRequestParticipants,
                performProgramRequestAction, deleteProgramRequest, validateProgramSessions }
                from './supabase/functions/api/programs';
            export { createImageUploadUrl } from './supabase/functions/api/images';
            export { updateOwnProfile } from './supabase/functions/api/core';
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
                    contents: `export const requiredStringArg = (value) => String(value ?? '').trim();
                        export const emailArg = (value) => value;
                        export const isValidEmail = () => true;
                        export const MAX_PARTICIPANTS = 50;
                        export const MAX_COMMENT_LENGTH = 4000;
                        export const MAX_NAME_LENGTH = 200;
                        export const MAX_PHONE_LENGTH = 50;
                        export const boundedText = (value, label, max) => {
                            const text = String(value ?? '').trim();
                            if (text.length > max) throw new Error(label + ' must be at most ' + max + ' characters.');
                            return text;
                        };`,
                }));
            },
        },
    ],
});
const api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const clientFor = (role) => ({
    from: () => ({
        select: () => ({
            eq: () => ({
                single: async () => ({ data: { id: 'user-1', role }, error: null }),
            }),
        }),
    }),
});
const untouchedAdmin = new Proxy(
    {},
    {
        get() {
            throw new Error('a viewer write must be refused before any database access');
        },
    },
);

test('viewers cannot create, edit, transition, delete or upload for requests', async () => {
    const viewer = clientFor('viewer');
    const calls = [
        () => api.createInventoryRequest(viewer, untouchedAdmin, 'user-1', {}, 'request-123'),
        () => api.updateInventoryRequest(viewer, untouchedAdmin, 'user-1', 'r1', {}, 'request-123'),
        () =>
            api.updateInventoryRequestParticipants(
                viewer,
                untouchedAdmin,
                'user-1',
                'r1',
                {},
                'request-123',
            ),
        () =>
            api.performInventoryRequestAction(
                viewer,
                untouchedAdmin,
                'user-1',
                'r1',
                'submit',
                '',
                'request-123',
            ),
        () => api.deleteInventoryRequest(viewer, untouchedAdmin, 'user-1', 'r1', 'request-123'),
        () => api.createProgramRequest(viewer, untouchedAdmin, 'user-1', {}, 'request-123'),
        () => api.updateProgramRequest(viewer, untouchedAdmin, 'user-1', 'r1', {}, 'request-123'),
        () =>
            api.updateProgramRequestParticipants(
                viewer,
                untouchedAdmin,
                'user-1',
                'r1',
                {},
                'request-123',
            ),
        () =>
            api.performProgramRequestAction(
                viewer,
                untouchedAdmin,
                'user-1',
                'r1',
                'submit',
                '',
                'request-123',
            ),
        () => api.deleteProgramRequest(viewer, untouchedAdmin, 'user-1', 'r1', 'request-123'),
        () =>
            api.createImageUploadUrl(
                viewer,
                untouchedAdmin,
                'user-1',
                'a.jpg',
                'image/jpeg',
                'inventory_request',
                'r1',
            ),
    ];
    for (const call of calls) await assert.rejects(call(), /read-only/);
});

test('other roles still pass the viewer gate', async () => {
    // A plain user gets past the gate and only fails later on missing data.
    await assert.rejects(
        api.createInventoryRequest(
            clientFor('user'),
            untouchedAdmin,
            'user-1',
            { name: 'x' },
            'request-123',
        ),
        /must be refused before any database access/,
    );
});

function typeAdmin(types) {
    return {
        from(table) {
            assert.equal(table, 'inventory_types');
            return {
                select: () => ({
                    eq: (_column, id) => ({
                        maybeSingle: async () => ({ data: types[id] || null, error: null }),
                    }),
                }),
            };
        },
    };
}

test('inventory lines need whole positive quantities and requestable types', async () => {
    const admin = typeAdmin({
        open: { id: 'open', requestable: true },
        locked: { id: 'locked', requestable: false },
    });
    const line = (inventoryTypeId, quantity) => ({ inventoryTypeId, quantity });
    for (const quantity of [0, -1, 1.5, 'abc', 100001]) {
        await assert.rejects(
            api.validateInventoryItems(admin, [line('open', quantity)]),
            /whole number/,
            String(quantity),
        );
    }
    const ok = await api.validateInventoryItems(admin, [line('open', 3)]);
    assert.equal(ok[0].quantity, 3);

    await assert.rejects(
        api.validateInventoryItems(admin, [line('locked', 1)]),
        /cannot be requested/,
    );
    await api.validateInventoryItems(admin, [line('locked', 1)], { allowNonRequestable: true });
    await api.validateInventoryItems(admin, [line('locked', 1)], {
        existingTypeIds: new Set(['locked']),
    });
    await assert.rejects(
        api.validateInventoryItems(
            admin,
            Array.from({ length: 101 }, () => line('open', 1)),
        ),
        /at most 100/,
    );
    await assert.rejects(api.validateInventoryItems(admin, {}), /must be a list/);
    await assert.rejects(
        api.validateInventoryItems(admin, [
            { inventoryTypeId: 'open', quantity: 1, labelIds: Array(101).fill('label') },
        ]),
        /at most 100 labels/,
    );
});

test('program sessions are a bounded list', () => {
    assert.throws(() => api.validateProgramSessions({}), /must be a list/);
    assert.throws(
        () =>
            api.validateProgramSessions(
                Array.from({ length: 101 }, () => ({})),
                false,
            ),
        /at most 100 sessions/,
    );
});

test('profile fields are length bounded', async () => {
    await assert.rejects(
        api.updateOwnProfile(clientFor('user'), {}, 'user-1', { name: 'x'.repeat(201) }),
        /at most 200/,
    );
    await assert.rejects(
        api.updateOwnProfile(clientFor('user'), {}, 'user-1', { phone: '1'.repeat(51) }),
        /at most 50/,
    );
});
