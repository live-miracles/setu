import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBundle } from './test-support.mjs';

const api = await loadBundle(`
            export { getInventoryRequestActions, getProgramRequestActions }
                from './frontend/src/workflows';
            export { canTransition } from './supabase/functions/_shared/request-policy';
            export { performInventoryRequestAction } from './supabase/functions/api/inventory';
            export { performProgramRequestAction } from './supabase/functions/api/programs';
        `);

for (const kind of ['Inventory', 'Program']) {
    const actions = api[`get${kind}RequestActions`];
    const transition = (status, action) => api.canTransition(kind.toLowerCase(), status, action);
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

    test(`${kind}: unapprove and reopen are approver-only and status-specific`, () => {
        const request = {
            UserId: 'owner@example.com',
            participants: ['guest@example.com'],
        };
        const allowed = { unapprove: 'approved', reopen: 'cancelled' };
        const statuses = [
            'draft',
            'submitted',
            'approved',
            'rejected',
            'cancelled',
            ...(kind === 'Inventory' ? ['issued', 'closed'] : []),
        ];
        for (const [action, validStatus] of Object.entries(allowed)) {
            for (const status of statuses) {
                assert.equal(transition(status, action), status === validStatus);
                for (const role of ['user', 'viewer', 'approver', 'admin']) {
                    // Owners and participants get no access to reverse a decision.
                    for (const email of ['owner@example.com', 'guest@example.com']) {
                        assert.equal(
                            actions(
                                { ...request, Status: status },
                                { Role: role, Email: email },
                            ).includes(action),
                            status === validStatus && (role === 'approver' || role === 'admin'),
                            `${action} for ${role} on ${status}`,
                        );
                    }
                }
            }
        }
    });

    test(`${kind}: actions run as the authenticated actor and surface RPC errors`, async () => {
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
        const rpcCalls = [];
        let rpcError = 'Only rejected requests can be returned to draft.';
        const admin = {
            async rpc(name, args) {
                rpcCalls.push(name);
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
            api[`perform${kind}RequestAction`](client, admin, actor.id, 'request-1', 'revise', '');
        await assert.rejects(perform(), /Only rejected/);
        rpcError = null;
        assert.equal(await perform(), 'draft');
        assert.equal(rpcCalls.length, 2, 'the RPC is the only writer and runs once per call');
    });
}
