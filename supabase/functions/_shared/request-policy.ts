// The single owner of "who may do what to a request, in which status".
//
// Pure and dependency-free on purpose: the edge function, the React app and the
// tests all import this one file, so the rules cannot drift between them. It is
// a policy, not an executor — the atomic transitions still happen in the
// perform_*_request_action_tx SQL functions, which remain the authority; the
// parity test in build-tools/request-policy.test.mjs keeps the two aligned.
//
// "Party" means the requester or one of the request's participants. Callers
// decide how to tell (profile ids on the server, emails in the browser) and use
// isRequestParty to compare them.

export type RequestKind = 'inventory' | 'program';
export type RequestRole = 'admin' | 'approver' | 'user' | 'viewer';

export interface RequestPolicyInput {
    status: string;
    isParty: boolean;
    role: string;
}

// Every action a request kind knows, in the order the UI offers them.
const ACTIONS: Record<RequestKind, readonly string[]> = {
    inventory: [
        'submit',
        'approve',
        'reject',
        'issue',
        'close',
        'cancel',
        'revise',
        'unapprove',
        'reopen',
    ],
    // No issue/close step: a program request only ever moves draft -> submitted
    // -> approved/rejected, with cancellation before a final decision.
    program: ['submit', 'approve', 'reject', 'cancel', 'revise', 'unapprove', 'reopen'],
};

const TRANSITIONS: Record<RequestKind, Record<string, readonly string[]>> = {
    inventory: {
        draft: ['submit', 'cancel'],
        submitted: ['approve', 'reject', 'cancel'],
        approved: ['issue', 'cancel', 'unapprove'],
        rejected: ['revise', 'close'],
        issued: ['close'],
        cancelled: ['reopen', 'close'],
        closed: [],
    },
    program: {
        draft: ['submit', 'cancel'],
        submitted: ['approve', 'reject', 'cancel'],
        approved: ['cancel', 'unapprove'],
        rejected: ['revise'],
        cancelled: ['reopen'],
    },
};

// A rejected program request has no close step, so deleting it is how it is
// disposed of; an inventory request is closed instead.
const DELETABLE_STATUSES: Record<RequestKind, readonly string[]> = {
    inventory: ['draft', 'cancelled'],
    program: ['draft', 'cancelled', 'rejected'],
};

// Inventory requests still in play: shown on the home dashboard, as opposed to
// the closed, rejected or cancelled history.
export const ONGOING_INVENTORY_STATUSES: readonly string[] = [
    'draft',
    'submitted',
    'approved',
    'issued',
];

export function isAdminRole(role: string): boolean {
    return role === 'admin';
}

export function isApproverRole(role: string): boolean {
    return role === 'admin' || role === 'approver';
}

// Viewer is the organization-wide read-only role.
export function canWriteRole(role: string): boolean {
    return role !== 'viewer';
}

export function normalizeIdentity(value: string): string {
    return value.trim().toLowerCase();
}

export function isRequestParty(
    actor: string,
    requester: string,
    participants: readonly string[],
): boolean {
    const me = normalizeIdentity(actor);
    return (
        normalizeIdentity(requester) === me ||
        participants.some((participant) => normalizeIdentity(participant) === me)
    );
}

export function canTransition(kind: RequestKind, status: string, action: string): boolean {
    return (TRANSITIONS[kind][status] || []).indexOf(action) !== -1;
}

function mayPerform(kind: RequestKind, action: string, input: RequestPolicyInput): boolean {
    const approver = isApproverRole(input.role);
    if (action === 'submit') {
        // Inventory submission belongs to the requester side only; a program
        // request may also be submitted by an approver on someone's behalf.
        return kind === 'program' ? input.isParty || approver : input.isParty;
    }
    if (action === 'revise') return input.isParty || approver;
    return approver;
}

export function availableActions(kind: RequestKind, input: RequestPolicyInput): string[] {
    if (!canWriteRole(input.role)) return [];
    return ACTIONS[kind].filter(
        (action) => canTransition(kind, input.status, action) && mayPerform(kind, action, input),
    );
}

// Approvers may always edit; a requester or participant only while it is a draft.
export function canEditRequest(input: RequestPolicyInput): boolean {
    if (!canWriteRole(input.role)) return false;
    return isApproverRole(input.role) || (input.isParty && input.status === 'draft');
}

export function canDeleteRequest(kind: RequestKind, input: RequestPolicyInput): boolean {
    if (!canWriteRole(input.role)) return false;
    return (
        (isApproverRole(input.role) || input.isParty) &&
        DELETABLE_STATUSES[kind].indexOf(input.status) !== -1
    );
}

// Participants, comments and request images are open to approvers and parties
// in any status.
export function canCollaborate(input: { isParty: boolean; role: string }): boolean {
    return canWriteRole(input.role) && (isApproverRole(input.role) || input.isParty);
}
