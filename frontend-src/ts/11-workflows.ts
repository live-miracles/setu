// Client-side transition guards, mirroring the source app's
// src/domain/workflows.ts and kept in sync with the server-side state
// machines in Inventory.ts/Tickets.ts. These only decide which action
// buttons the UI offers — the backend remains the authoritative check.

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

function canTransitionInventoryRequest(
    status: InventoryRequestStatus,
    action: InventoryRequestAction,
): boolean {
    return (INVENTORY_REQUEST_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

// 'assign' has no status precondition server-side (an admin can reassign a
// ticket from any state), so it's offered from every status.
const TICKET_TRANSITIONS: Record<TicketStatus, TicketAction[]> = {
    unassigned: ['assign', 'close'],
    pending: ['assign', 'close'],
    closed: ['assign', 'reopen'],
};

function canTransitionTicket(status: TicketStatus, action: TicketAction): boolean {
    return (TICKET_TRANSITIONS[status] || []).indexOf(action) !== -1;
}

function inventoryDeltaForReturn(quantity: number, condition: ReturnCondition): number {
    return condition === 'good' ? quantity : 0;
}
