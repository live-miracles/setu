import { describe, expect, it } from 'vitest';
import {
    canTransitionProgramRequest,
    canTransitionRequest,
    canTransitionTicket,
    inventoryDeltaForReturn,
} from './workflows';

describe('inventory request workflow', () => {
    it('allows the complete happy path', () => {
        expect(canTransitionRequest('draft', 'submitted')).toBe(true);
        expect(canTransitionRequest('submitted', 'approved')).toBe(true);
        expect(canTransitionRequest('approved', 'issued')).toBe(true);
        expect(canTransitionRequest('issued', 'returned')).toBe(true);
        expect(canTransitionRequest('returned', 'closed')).toBe(true);
    });

    it('rejects unsafe skips and terminal changes', () => {
        expect(canTransitionRequest('submitted', 'issued')).toBe(false);
        expect(canTransitionRequest('closed', 'submitted')).toBe(false);
        expect(canTransitionRequest('rejected', 'approved')).toBe(false);
    });

    it.each([
        ['good', 3],
        ['damaged', 0],
        ['missing', 0],
    ] as const)('returns the correct stock delta for %s items', (condition, delta) => {
        expect(inventoryDeltaForReturn(3, condition)).toBe(delta);
    });

    it('rejects invalid return quantities', () => {
        expect(() => inventoryDeltaForReturn(0, 'good')).toThrow();
        expect(() => inventoryDeltaForReturn(1.5, 'good')).toThrow();
    });
});

describe('program request workflow', () => {
    it('allows the complete happy path', () => {
        expect(canTransitionProgramRequest('draft', 'submitted')).toBe(true);
        expect(canTransitionProgramRequest('submitted', 'approved')).toBe(true);
        expect(canTransitionProgramRequest('approved', 'closed')).toBe(true);
    });

    it('rejects unsafe skips and terminal changes', () => {
        expect(canTransitionProgramRequest('submitted', 'closed')).toBe(false);
        expect(canTransitionProgramRequest('closed', 'submitted')).toBe(false);
        expect(canTransitionProgramRequest('rejected', 'approved')).toBe(false);
    });
});

describe('ticket workflow', () => {
    it('supports assign, close and reopen', () => {
        expect(canTransitionTicket('unassigned', 'pending')).toBe(true);
        expect(canTransitionTicket('pending', 'closed')).toBe(true);
        expect(canTransitionTicket('closed', 'pending')).toBe(true);
    });
});
