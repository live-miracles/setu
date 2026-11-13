import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBundle } from './test-support.mjs';

const policy = await loadBundle(`export * from './supabase/functions/_shared/request-policy';`);

const STATUSES = {
    inventory: ['draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed'],
    program: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
};
const ROLES = ['user', 'viewer', 'approver', 'admin'];

for (const kind of ['inventory', 'program']) {
    test(`${kind}: a viewer can do nothing, even as the requester`, () => {
        for (const status of STATUSES[kind]) {
            const input = { status, isParty: true, role: 'viewer' };
            assert.deepEqual(policy.availableActions(kind, input), []);
            assert.equal(policy.canEditRequest(input), false);
            assert.equal(policy.canDeleteRequest(kind, input), false);
            assert.equal(policy.canCollaborate(input), false);
        }
    });

    test(`${kind}: only approvers decide, cancel, reverse or reopen`, () => {
        for (const status of STATUSES[kind]) {
            for (const role of ROLES) {
                for (const isParty of [true, false]) {
                    const offered = policy.availableActions(kind, { status, isParty, role });
                    for (const action of ['approve', 'reject', 'cancel', 'unapprove', 'reopen']) {
                        assert.equal(
                            offered.includes(action),
                            policy.canTransition(kind, status, action) &&
                                (role === 'admin' || role === 'approver'),
                            `${action} for ${role} (party: ${isParty}) on ${status}`,
                        );
                    }
                }
            }
        }
    });

    test(`${kind}: offered actions are always legal transitions`, () => {
        for (const status of STATUSES[kind]) {
            for (const role of ROLES) {
                for (const isParty of [true, false]) {
                    for (const action of policy.availableActions(kind, {
                        status,
                        isParty,
                        role,
                    })) {
                        assert.ok(policy.canTransition(kind, status, action), action);
                    }
                }
            }
        }
    });

    test(`${kind}: requesters may edit only drafts; approvers may always edit`, () => {
        for (const status of STATUSES[kind]) {
            assert.equal(
                policy.canEditRequest({ status, isParty: true, role: 'user' }),
                status === 'draft',
            );
            assert.equal(policy.canEditRequest({ status, isParty: false, role: 'user' }), false);
            for (const role of ['approver', 'admin']) {
                assert.equal(policy.canEditRequest({ status, isParty: false, role }), true);
            }
        }
    });

    test(`${kind}: participants and comments need approver or party access`, () => {
        assert.equal(policy.canCollaborate({ isParty: true, role: 'user' }), true);
        assert.equal(policy.canCollaborate({ isParty: false, role: 'user' }), false);
        assert.equal(policy.canCollaborate({ isParty: false, role: 'approver' }), true);
    });
}

test('submit: the requester side, or any approver for someone else', () => {
    for (const kind of ['inventory', 'program']) {
        for (const role of ['approver', 'admin']) {
            const draft = { status: 'draft', isParty: false, role };
            assert.equal(policy.availableActions(kind, draft).includes('submit'), true);
        }
        const stranger = { status: 'draft', isParty: false, role: 'user' };
        assert.equal(policy.availableActions(kind, stranger).includes('submit'), false);
    }
    const owner = { status: 'draft', isParty: true, role: 'user' };
    assert.deepEqual(policy.availableActions('inventory', owner), ['submit']);
    assert.deepEqual(policy.availableActions('program', owner), ['submit']);
});

test('revise: requester side or approver, rejected requests only', () => {
    for (const kind of ['inventory', 'program']) {
        assert.equal(
            policy.availableActions(kind, { status: 'rejected', isParty: true, role: 'user' })[0],
            'revise',
        );
        assert.equal(
            policy
                .availableActions(kind, { status: 'rejected', isParty: false, role: 'user' })
                .includes('revise'),
            false,
        );
        assert.equal(
            policy
                .availableActions(kind, { status: 'draft', isParty: true, role: 'admin' })
                .includes('revise'),
            false,
        );
    }
});

test('delete: a rejected program can be deleted, a rejected inventory request is closed instead', () => {
    const party = (status) => ({ status, isParty: true, role: 'user' });
    assert.equal(policy.canDeleteRequest('program', party('rejected')), true);
    assert.equal(policy.canDeleteRequest('inventory', party('rejected')), false);
    for (const kind of ['inventory', 'program']) {
        assert.equal(policy.canDeleteRequest(kind, party('draft')), true);
        assert.equal(policy.canDeleteRequest(kind, party('cancelled')), true);
        for (const status of ['submitted', 'approved', 'issued', 'closed']) {
            assert.equal(policy.canDeleteRequest(kind, party(status)), false, status);
            assert.equal(
                policy.canDeleteRequest(kind, { status, isParty: false, role: 'admin' }),
                false,
                status,
            );
        }
        assert.equal(
            policy.canDeleteRequest(kind, { status: 'draft', isParty: false, role: 'user' }),
            false,
        );
    }
});

test('isRequestParty compares identities ignoring case and surrounding spaces', () => {
    assert.equal(policy.isRequestParty(' Owner@Example.com ', 'owner@example.com', []), true);
    assert.equal(
        policy.isRequestParty('guest@example.com', 'owner@example.com', [' GUEST@example.com']),
        true,
    );
    assert.equal(policy.isRequestParty('other@example.com', 'owner@example.com', []), false);
});
