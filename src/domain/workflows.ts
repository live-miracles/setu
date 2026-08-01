import type {
    InventoryRequestStatus,
    ProgramRequestStatus,
    ReturnCondition,
    TicketStatus,
} from './types';

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

const programRequestTransitions: Record<ProgramRequestStatus, ProgramRequestStatus[]> = {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved: ['cancelled', 'closed'],
    rejected: ['closed'],
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

export function canTransitionProgramRequest(from: ProgramRequestStatus, to: ProgramRequestStatus) {
    return programRequestTransitions[from].includes(to);
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
