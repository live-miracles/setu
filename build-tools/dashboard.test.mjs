import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeClient, loadBundle } from './test-support.mjs';

const { dashboard } = await loadBundle(
    `export { dashboard } from './supabase/functions/api/dashboard';`,
);

const pad = (n) => String(n).padStart(4, '0');

test('dashboard carries only the home screen data, with true totals past the sample bound', async () => {
    const programs = Array.from({ length: 300 }, (_, i) => ({
        id: `p${pad(i)}`,
        display_id: i,
        name: `Program ${i}`,
        requester_id: 'u1',
        status: i % 2 ? 'draft' : 'submitted',
        updated_at: new Date(Date.UTC(2031, 0, 1, 0, 0, i)).toISOString(),
    }));
    programs.push({
        id: 'done',
        display_id: 999,
        name: 'Done',
        requester_id: 'u1',
        status: 'approved',
    });
    const inventory = [
        {
            id: 'i1',
            display_id: 1,
            name: 'Shoot',
            requester_id: 'u1',
            status: 'issued',
            end_date: '2031-01-02',
        },
        { id: 'i2', display_id: 2, name: 'Old', requester_id: 'u1', status: 'closed' },
    ];
    const client = fakeClient({
        profiles: [{ id: 'u1', email: 'u1@x.org', name: 'U1' }],
        shift_types: [],
        rosters: [],
        program_requests: programs,
        program_sessions: [
            {
                id: 's1',
                request_id: 'p0299',
                start_at: '2031-02-01T10:00:00Z',
                end_at: '2031-02-01T11:00:00Z',
            },
        ],
        inventory_requests: inventory,
        comments: [
            // A comment on a request outside both samples still appears.
            {
                id: 'c1',
                program_request_id: 'done',
                author_id: 'u1',
                kind: 'comment',
                message: 'old news',
                created_at: '2031-01-01T00:00:00Z',
            },
            {
                id: 'c2',
                inventory_request_id: 'i2',
                author_id: null,
                author_name: 'Setu Bot',
                kind: 'comment',
                message: 'closed',
                created_at: '2031-01-02T00:00:00Z',
            },
            // A status event is newer than both but is not a comment.
            {
                id: 'c3',
                program_request_id: 'done',
                author_id: 'u1',
                kind: 'status',
                message: 'Approved this request.',
                created_at: '2031-01-03T00:00:00Z',
            },
        ],
    });
    const payload = await dashboard(client, client, 'u1');

    assert.deepEqual(Object.keys(payload).sort(), [
        'ongoingInventoryCount',
        'ongoingInventoryRequests',
        'pendingProgramCount',
        'pendingProgramRequests',
        'recentComments',
        'upcomingRosters',
    ]);
    // 300 pending programs: the list is bounded, the count is the truth, and an
    // approved program is not pending.
    assert.equal(payload.pendingProgramRequests.length, 250);
    assert.equal(payload.pendingProgramCount, 300);
    assert.equal(
        payload.pendingProgramRequests.some((r) => r.Id === 'done'),
        false,
    );
    const withSession = payload.pendingProgramRequests.find((r) => r.Id === 'p0299');
    assert.equal(withSession.sessionStart, '2031-02-01T10:00:00Z');
    assert.deepEqual(Object.keys(withSession).sort(), [
        'DisplayId',
        'Id',
        'Name',
        'Status',
        'sessionEnd',
        'sessionStart',
        'userName',
    ]);
    assert.deepEqual(
        payload.ongoingInventoryRequests.map((r) => r.Id),
        ['i1'],
    );
    assert.equal(payload.ongoingInventoryCount, 1);
    assert.equal(payload.ongoingInventoryRequests[0].userName, 'U1');
    assert.deepEqual(
        payload.recentComments.map((entry) => [
            entry.kind,
            entry.request.Id,
            entry.comment.Message,
        ]),
        [
            ['programs', 'done', 'old news'],
            ['inventory', 'i2', 'closed'],
        ],
    );
});
