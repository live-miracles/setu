// Client-side transition guards, mirroring the source app's
// src/domain/workflows.ts and kept in sync with the server-side state
// machines in Inventory.ts/Programs.ts/Tickets.ts. These only decide which
// action buttons the UI offers — the backend remains the authoritative
// check.

const INVENTORY_REQUEST_TRANSITIONS: Record<InventoryRequestStatus, InventoryRequestAction[]> = {
    draft: ['submit', 'cancel'],
    submitted: ['approve', 'reject', 'cancel'],
    approved: ['issue', 'cancel'],
    rejected: ['close'],
    issued: ['return'],
    returned: ['close'],
    cancelled: ['close'],
    closed: [],
};

export function canTransitionInventoryRequest(
    status: InventoryRequestStatus,
    action: InventoryRequestAction,
): boolean {
    return (INVENTORY_REQUEST_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

// No issue/return step — a program request only ever moves draft ->
// submitted -> approved/rejected -> cancelled -> closed.
const PROGRAM_REQUEST_TRANSITIONS: Record<ProgramRequestStatus, ProgramRequestAction[]> = {
    draft: ['submit', 'cancel'],
    submitted: ['approve', 'reject', 'cancel'],
    approved: ['cancel', 'close'],
    rejected: ['close'],
    cancelled: ['close'],
    closed: [],
};

export function canTransitionProgramRequest(
    status: ProgramRequestStatus,
    action: ProgramRequestAction,
): boolean {
    return (PROGRAM_REQUEST_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

// 'assign' has no status precondition server-side (an admin can reassign a
// ticket from any state), so it's offered from every status.
const TICKET_TRANSITIONS: Record<TicketStatus, TicketAction[]> = {
    unassigned: ['assign', 'close'],
    pending: ['assign', 'close'],
    closed: ['assign', 'reopen'],
};

export function canTransitionTicket(status: TicketStatus, action: TicketAction): boolean {
    return (TICKET_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

export function isRequestOverdue(request: InventoryRequestDTO): boolean {
    if (request.Status !== 'issued' || !request.EndDate) return false;
    return new Date(request.EndDate).getTime() < Date.now();
}

// Role predicates, mirroring canManageConfig/canApprove in Auth.ts — same
// caveat as the transition tables above: they only decide what the UI
// offers, and the backend re-checks every one of them. There's no
// client-side equivalent of canViewAllRequests: request scoping happens
// server-side, so a `user` simply never receives the rows they can't see.
export function canManageConfig(me: UserDTO): boolean {
    return me.Role === 'admin';
}

export function canApprove(me: UserDTO): boolean {
    return me.Role === 'admin' || me.Role === 'approver';
}

// The ticket board is hidden from `user` outright, so the nav entry, the
// Home stat and the assignee picker all gate on this.
export function canUseTickets(me: UserDTO): boolean {
    return me.Role !== 'user';
}
