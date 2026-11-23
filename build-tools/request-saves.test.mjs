import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

// Creating and editing a request is authorization and validation in TypeScript,
// then one SQL function call (atomic-request-saves-db-check.mjs covers the SQL).
// These tests check what the edge function hands to those functions.
const api = await loadBundle(`
    export { createInventoryRequest, updateInventoryRequest, updateInventoryRequestParticipants }
        from './supabase/functions/api/inventory';
    export { createProgramRequest, updateProgramRequest, updateProgramRequestParticipants }
        from './supabase/functions/api/programs';
`);

const CLIENT_ID = '3f1c2a9e-7b64-4d0a-9c1e-5a2b8d4e6f70';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// One in-memory database serves as both the user-scoped and the service-role
// client; `rpc` records each SQL function call and, like the real create, adds
// the row so the request can be read back.
function fixture({ requestStatus = 'draft', rpcError = null } = {}) {
    const tables = {
        profiles: [
            { id: 'owner', email: 'owner@example.org', name: 'Owner', role: 'user' },
            { id: 'guest', email: 'guest@example.org', name: 'Guest', role: 'user' },
            { id: 'stranger', email: 'stranger@example.org', name: 'Stranger', role: 'user' },
            { id: 'boss', email: 'boss@example.org', name: 'Boss', role: 'approver' },
        ],
        departments: [{ id: 'dept', name: 'Dept' }],
        places: [{ id: 'hall', name: 'Hall' }],
        inventory_types: [{ id: 'type', requestable: true }],
        inventory_requests: [
            { id: 'existing-inv', name: 'Kit', requester_id: 'owner', status: requestStatus },
        ],
        inventory_request_items: [],
        inventory_request_participants: [{ request_id: 'existing-inv', profile_id: 'guest' }],
        program_requests: [
            {
                id: 'existing-prog',
                name: 'Talk',
                requester_id: 'owner',
                status: requestStatus,
                place_id: null,
            },
        ],
        program_sessions: [],
        program_request_participants: [{ request_id: 'existing-prog', profile_id: 'guest' }],
        comments: [],
    };
    const db = fakeClient(tables);
    const rpcCalls = [];
    const admin = {
        ...db,
        async rpc(name, args) {
            rpcCalls.push({ name, args });
            if (rpcError) return { data: null, error: { message: rpcError } };
            if (args.p_mode === 'create') {
                const table = name.includes('inventory')
                    ? 'inventory_requests'
                    : 'program_requests';
                if (!tables[table].some((row) => row.id === args.p_request_id)) {
                    tables[table].push({
                        id: args.p_request_id,
                        name: args.p_fields.name,
                        requester_id: args.p_fields.requester_id,
                        status: 'draft',
                    });
                }
            }
            return { data: args.p_request_id ?? true, error: null };
        },
    };
    return { client: db, admin, rpcCalls };
}

const inventoryInput = (overrides = {}) => ({
    name: 'Kit',
    userId: 'owner@example.org',
    startDate: '2031-01-01',
    endDate: '2031-01-02',
    departmentId: 'dept',
    leadEmail: 'Lead@Example.org',
    participants: 'guest@example.org, outsider@example.org',
    items: [{ inventoryTypeId: 'type', quantity: 2 }],
    ...overrides,
});

const programInput = (overrides = {}) => ({
    type: 'Workshop',
    name: 'Talk',
    language: 'English',
    userId: 'owner@example.org',
    departmentId: 'dept',
    leadEmail: 'lead@example.org',
    participants: 'guest@example.org',
    sessions: [
        {
            type: 'Talk',
            startDateTime: '2031-01-05T10:00:00Z',
            endDateTime: '2031-01-05T11:00:00Z',
        },
    ],
    ...overrides,
});

const kinds = [
    {
        kind: 'inventory',
        rpc: 'save_inventory_request_tx',
        existingId: 'existing-inv',
        input: inventoryInput,
        create: (...args) => api.createInventoryRequest(...args),
        update: (...args) => api.updateInventoryRequest(...args),
        participants: (...args) => api.updateInventoryRequestParticipants(...args),
    },
    {
        kind: 'program',
        rpc: 'save_program_request_tx',
        existingId: 'existing-prog',
        input: programInput,
        create: (...args) => api.createProgramRequest(...args),
        update: (...args) => api.updateProgramRequest(...args),
        participants: (...args) => api.updateProgramRequestParticipants(...args),
    },
];

for (const { kind, rpc, existingId, input, create, update, participants } of kinds) {
    test(`${kind}: a create passes the client's uuid through as the request id`, async () => {
        const { client, admin, rpcCalls } = fixture();
        const first = await create(client, admin, 'owner', input(), CLIENT_ID.toUpperCase());
        assert.equal(first.Id, CLIENT_ID);
        assert.equal(rpcCalls.length, 1);
        assert.equal(rpcCalls[0].name, rpc);
        assert.equal(rpcCalls[0].args.p_mode, 'create');
        assert.equal(rpcCalls[0].args.p_request_id, CLIENT_ID);
        assert.equal(rpcCalls[0].args.p_expected_status, 'draft');
        assert.equal(rpcCalls[0].args.p_fields.requester_id, 'owner');
        assert.equal(rpcCalls[0].args.p_fields.lead_email, 'lead@example.org');
        assert.deepEqual(rpcCalls[0].args.p_participants.slice(0, 1), [
            { profile_id: 'guest', external_email: null },
        ]);

        // A replay is the SQL function's job: the same id goes to it again and
        // the same request comes back, with nothing else written.
        const replay = await create(client, admin, 'owner', input(), CLIENT_ID);
        assert.equal(replay.Id, CLIENT_ID);
        assert.equal(rpcCalls.length, 2);
        assert.equal(rpcCalls[1].args.p_request_id, CLIENT_ID);
    });

    test(`${kind}: a create without a usable client id gets a generated uuid`, async () => {
        const { client, admin, rpcCalls } = fixture();
        for (const clientId of ['request-123', '', undefined]) {
            await create(client, admin, 'owner', input(), clientId);
        }
        const ids = rpcCalls.map((call) => call.args.p_request_id);
        assert.equal(new Set(ids).size, 3);
        for (const id of ids) assert.match(id, UUID);
    });

    test(`${kind}: a create is refused for another requester and surfaces SQL errors`, async () => {
        const { client, admin, rpcCalls } = fixture();
        await assert.rejects(
            create(client, admin, 'stranger', input(), CLIENT_ID),
            /on behalf of another user/,
        );
        assert.equal(rpcCalls.length, 0, 'nothing is saved for a refused create');
        // An approver may create on someone else's behalf.
        await create(client, admin, 'boss', input(), CLIENT_ID);
        assert.equal(rpcCalls[0].args.p_fields.requester_id, 'owner');

        const failing = fixture({ rpcError: 'This request id is already in use.' });
        await assert.rejects(
            create(failing.client, failing.admin, 'owner', input(), CLIENT_ID),
            /already in use/,
        );
    });

    test(`${kind}: an update passes the status it authorized against`, async () => {
        const draft = fixture({ requestStatus: 'draft' });
        await update(draft.client, draft.admin, 'owner', existingId, input());
        assert.equal(draft.rpcCalls.length, 1);
        assert.equal(draft.rpcCalls[0].name, rpc);
        assert.equal(draft.rpcCalls[0].args.p_mode, 'update');
        assert.equal(draft.rpcCalls[0].args.p_request_id, existingId);
        assert.equal(draft.rpcCalls[0].args.p_expected_status, 'draft');

        // An old cached client still sends a status; the server ignores it, because
        // the status only changes through workflow actions.
        await update(draft.client, draft.admin, 'owner', existingId, {
            ...input(),
            status: 'approved',
        });
        assert.equal(draft.rpcCalls.length, 2);
        assert.equal(draft.rpcCalls[1].args.p_expected_status, 'draft');
        assert.equal('status' in draft.rpcCalls[1].args.p_fields, false);
        draft.rpcCalls.pop();

        // Approvers may edit in any status, and the status they saw is the one the save expects.
        const submitted = fixture({ requestStatus: 'submitted' });
        await update(submitted.client, submitted.admin, 'boss', existingId, input());
        assert.equal(submitted.rpcCalls[0].args.p_expected_status, 'submitted');

        // The requester may not edit once it has been submitted; the SQL is never reached.
        await assert.rejects(
            update(submitted.client, submitted.admin, 'owner', existingId, input()),
            /not allowed to edit/,
        );
        await assert.rejects(
            update(draft.client, draft.admin, 'stranger', existingId, input()),
            /not allowed to edit/,
        );
        assert.equal(submitted.rpcCalls.length, 1);
        assert.equal(draft.rpcCalls.length, 1);
    });

    test(`${kind}: participant edits go through save_request_participants_tx`, async () => {
        const { client, admin, rpcCalls } = fixture({ requestStatus: 'submitted' });
        await participants(client, admin, 'guest', existingId, {
            participants: 'guest@example.org, Outsider@Example.org',
        });
        assert.deepEqual(rpcCalls, [
            {
                name: 'save_request_participants_tx',
                args: {
                    p_kind: kind,
                    p_request_id: existingId,
                    p_participants: [
                        { profile_id: 'guest', external_email: null },
                        { profile_id: null, external_email: 'outsider@example.org' },
                    ],
                },
            },
        ]);

        await assert.rejects(
            participants(client, admin, 'stranger', existingId, { participants: '' }),
            /not allowed to edit participants/,
        );
        assert.equal(rpcCalls.length, 1);
    });
}
