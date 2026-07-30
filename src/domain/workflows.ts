import type { InventoryRequestStatus, ReturnCondition, TicketStatus } from './types';

const requestTransitions: Record<InventoryRequestStatus, InventoryRequestStatus[]> = {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved: ['issued', 'cancelled'],
    rejected: ['closed'],
    issued: ['returned'],
    returned: ['closed'],
    cancelled: ['closed'],
    closed: [],
};

const ticketTransitions: Record<TicketStatus, TicketStatus[]> = {
    unassigned: ['pending', 'closed'],
    pending: ['unassigned', 'closed'],
    closed: ['pending'],
};

export function canTransitionRequest(from: InventoryRequestStatus, to: InventoryRequestStatus) {
    return requestTransitions[from].includes(to);
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus) {
    return ticketTransitions[from].includes(to);
}

export function inventoryDeltaForReturn(quantity: number, condition: ReturnCondition) {
    if (quantity < 1 || !Number.isInteger(quantity)) {
        throw new Error('Return quantity must be a positive integer.');
    }
    return condition === 'good' ? quantity : 0;
}

export function requireIdempotencyKey(value: string | null) {
    if (!value || value.trim().length < 8) {
        throw new Error('A valid Idempotency-Key header is required.');
    }
    return value;
}
