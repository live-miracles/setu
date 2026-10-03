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
            export { getInventoryRequestActions, canTransitionInventoryRequest,
                canTransitionProgramRequest } from './frontend/src/workflows';
            export { getProgramRequestActions } from './frontend/src/ui/program-actions';
            export { performInventoryRequestAction } from './supabase/functions/api/inventory';
            export { performProgramRequestAction } from './supabase/functions/api/programs';
        `,
    },
    plugins: [
        {
            name: 'unused-input-validation',
            setup(build) {
                // These tests call workflow functions directly, not the HTTP parser.
                build.onResolve({ filter: /\/validation\.ts$/ }, () => ({
                    path: 'validation',
                    namespace: 'test',
                }));
                build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                    contents: `export const requiredStringArg = (value) => value;
                        export const emailArg = (value) => value;
                        export const requireUnchangedWorkflowStatus = () => {};
                        export const isValidEmail = () => true;
                        export const MAX_PARTICIPANTS = 50;
                        export const MAX_COMMENT_LENGTH = 4000;
                        export const MAX_NAME_LENGTH = 200;
                        export const MAX_PHONE_LENGTH = 50;
                        export const boundedText = (value) => String(value ?? '').trim();`,
                }));
            },
        },
    ],
});
const api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

for (const kind of ['Inventory', 'Program']) {
    const actions = api[`get${kind}RequestActions`];
    const transition = api[`canTransition${kind}Request`];
    test(`${kind}: revise visibility follows ownership and approval permissions`, () => {
        const request = {
            Status: 'rejected',
            UserId: 'owner@example.com',
            participants: ['guest@example.com'],
        };
        for (const role of ['user', 'viewer', 'approver', 'admin']) {
            for (const email of [
                ' OWNER@EXAMPLE.COM ',
                'guest@example.com',
                'unrelated@example.com',
            ]) {
                // Viewer is read-only, even on a request they own or joined.
                const allowed =
                    role !== 'viewer' &&
                    (role === 'admin' || role === 'approver' || email !== 'unrelated@example.com');
                assert.equal(
                    actions(request, { Role: role, Email: email }).includes('revise'),
                    allowed,
                );
            }
        }
        for (const status of [
            'draft',
            'submitted',
            'approved',
            'cancelled',
            ...(kind === 'Inventory' ? ['issued', 'closed'] : []),
        ]) {
            assert.equal(transition(status, 'revise'), false);
            assert.equal(
                actions(
                    { ...request, Status: status },
                    { Role: 'admin', Email: 'owner@example.com' },
                ).includes('revise'),
                false,
            );
        }
        assert.equal(transition('rejected', 'revise'), true);
        assert.equal(transition('rejected', 'submit'), false);
        assert.equal(transition('draft', 'approve'), false);
        assert.equal(transition('draft', 'submit'), true);
        assert.deepEqual(
            actions({ ...request, Status: 'draft' }, { Role: 'user', Email: 'owner@example.com' }),
            ['submit'],
        );
    });

    test(`${kind}: authenticated actor, RPC errors, and retry deduplication`, async () => {
        const ledger = new Map();
        const actor = { id: 'authenticated-actor', role: 'user' };
        const client = {
            from(table) {
                assert.equal(table, 'profiles');
                return {
                    select() {
                        return this;
                    },
                    eq(column, value) {
                        assert.equal(column, 'id');
                        assert.equal(value, actor.id);
                        return this;
                    },
                    async single() {
                        return { data: actor, error: null };
                    },
                };
            },
        };
        let rpcCalls = 0;
        let rpcError = 'Only rejected requests can be returned to draft.';
        const admin = {
            from(table) {
                assert.equal(table, 'idempotency_keys');
                let scope, requestId, update;
                let operation = 'select';
                return {
                    async insert(row) {
                        const key = `${row.scope}/${row.request_id}`;
                        if (ledger.has(key)) return { error: { code: '23505' } };
                        ledger.set(key, { result: null });
                        return { error: null };
                    },
                    select() {
                        return this;
                    },
                    update(value) {
                        operation = 'update';
                        update = value;
                        return this;
                    },
                    delete() {
                        operation = 'delete';
                        return this;
                    },
                    eq(column, value) {
                        if (column === 'scope') scope = value;
                        else requestId = value;
                        return this;
                    },
                    async single() {
                        return { data: ledger.get(`${scope}/${requestId}`), error: null };
                    },
                    then(resolve) {
                        const key = `${scope}/${requestId}`;
                        if (operation === 'delete') ledger.delete(key);
                        if (operation === 'update') ledger.set(key, update);
                        return Promise.resolve({ error: null }).then(resolve);
                    },
                };
            },
            async rpc(name, args) {
                rpcCalls++;
                assert.equal(name, `perform_${kind.toLowerCase()}_request_action_tx`);
                assert.deepEqual(args, {
                    p_request_id: 'request-1',
                    p_action: 'revise',
                    p_actor_id: actor.id,
                    p_note: '',
                });
                return rpcError
                    ? { data: null, error: { message: rpcError } }
                    : { data: 'draft', error: null };
            },
        };
        const perform = () =>
            api[`perform${kind}RequestAction`](
                client,
                admin,
                actor.id,
                'request-1',
                'revise',
                '',
                'retry-key-1',
            );
        await assert.rejects(perform(), /Only rejected/);
        assert.equal(ledger.size, 0, 'failed actions must be retryable');
        rpcError = null;
        assert.equal(await perform(), 'draft');
        assert.equal(await perform(), 'draft');
        assert.equal(rpcCalls, 2, 'a successful retry must not repeat the database mutation');
    });
}
