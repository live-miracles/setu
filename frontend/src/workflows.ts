// Client-side transition guards, mirroring the source app's
// src/domain/workflows.ts and kept in sync with the server-side state
// machines in Inventory.ts/Programs.ts. These only decide which action
// buttons the UI offers — the backend remains the authoritative check.

const INVENTORY_REQUEST_TRANSITIONS: Record<InventoryRequestStatus, InventoryRequestAction[]> = {
    draft: ['submit', 'cancel'],
    submitted: ['approve', 'reject', 'cancel'],
    approved: ['issue', 'cancel'],
    rejected: ['revise', 'close'],
    issued: ['close'],
    cancelled: ['close'],
    closed: [],
};

export function canTransitionInventoryRequest(
    status: InventoryRequestStatus,
    action: InventoryRequestAction,
): boolean {
    return (INVENTORY_REQUEST_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

// No issue/return/close step — a program request only ever moves draft ->
// submitted -> approved/rejected, with cancellation available before a final
// decision. Rejected requests can return to draft for revision.
const PROGRAM_REQUEST_TRANSITIONS: Record<ProgramRequestStatus, ProgramRequestAction[]> = {
    draft: ['submit', 'cancel'],
    submitted: ['approve', 'reject', 'cancel'],
    approved: ['cancel'],
    rejected: ['revise'],
    cancelled: [],
};

export function canTransitionProgramRequest(
    status: ProgramRequestStatus,
    action: ProgramRequestAction,
): boolean {
    return (PROGRAM_REQUEST_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

export function isRequestOverdue(request: InventoryRequestDTO): boolean {
    if (request.Status !== 'issued' || !request.EndDate) return false;
    // The due date is inclusive: a request becomes overdue after the end of
    // its due date, rather than at midnight at the start of that date.
    return new Date(`${request.EndDate}T23:59:59`).getTime() < Date.now();
}

// Role predicates, mirroring requireAdmin/requireApprover in
// supabase/functions/api/index.ts — same caveat as the transition tables
// above: they only decide what the UI offers, and the backend re-checks
// every one of them. There's no client-side equivalent of
// canViewAllRequests: request scoping happens server-side, so a `user`
// simply never receives the rows they can't see.
export function canManageConfig(me: UserDTO): boolean {
    return me.Role === 'admin';
}

// Viewer is the organization-wide read-only role (the API refuses its writes).
export function canWrite(me: UserDTO): boolean {
    return me.Role !== 'viewer';
}

export function canApprove(me: UserDTO): boolean {
    return me.Role === 'admin' || me.Role === 'approver';
}

export function getInventoryRequestActions(
    request: InventoryRequestDTO,
    me: UserDTO,
): InventoryRequestAction[] {
    if (!canWrite(me)) return [];
    const email = me.Email.trim().toLowerCase();
    const owner =
        request.UserId.trim().toLowerCase() === email ||
        (request.participants || []).some(
            (participant) => participant.trim().toLowerCase() === email,
        );
    return (
        [
            'submit',
            'approve',
            'reject',
            'issue',
            'close',
            'cancel',
            'revise',
        ] as InventoryRequestAction[]
    )
        .filter((action) => canTransitionInventoryRequest(request.Status, action))
        .filter((action) =>
            action === 'submit'
                ? owner
                : action === 'revise'
                  ? owner || canApprove(me)
                  : canApprove(me),
        );
}
