/// <reference path="../../shared/types.d.ts" />

import { describe, expect, it } from 'vitest';
import {
    attentionTotal,
    calculateInventoryAvailability,
    dateRangesOverlap,
    dateTimeRangesOverlap,
} from '../../frontend/src/domain';
import {
    canTransitionInventoryRequest,
    canTransitionProgramRequest,
    canTransitionTicket,
} from '../../frontend/src/workflows';

describe('request lifecycle guards', () => {
    it('keeps inventory transitions explicit', () => {
        expect(canTransitionInventoryRequest('draft', 'submit')).toBe(true);
        expect(canTransitionInventoryRequest('submitted', 'issue')).toBe(false);
        expect(canTransitionInventoryRequest('issued', 'return')).toBe(true);
    });

    it('keeps program and ticket transitions explicit', () => {
        expect(canTransitionProgramRequest('submitted', 'approve')).toBe(true);
        expect(canTransitionProgramRequest('approved', 'reject')).toBe(false);
        expect(canTransitionTicket('closed', 'reopen')).toBe(true);
    });
});

describe('date conflict rules', () => {
    it('treats inventory date boundaries as reserved', () => {
        expect(dateRangesOverlap('2026-08-01', '2026-08-03', '2026-08-03', '2026-08-05')).toBe(
            true,
        );
        expect(dateRangesOverlap('2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05')).toBe(
            false,
        );
    });

    it('allows adjacent program sessions but rejects real overlap', () => {
        expect(
            dateTimeRangesOverlap(
                '2026-08-01T10:00:00Z',
                '2026-08-01T11:00:00Z',
                '2026-08-01T11:00:00Z',
                '2026-08-01T12:00:00Z',
            ),
        ).toBe(false);
        expect(
            dateTimeRangesOverlap(
                '2026-08-01T10:00:00Z',
                '2026-08-01T11:30:00Z',
                '2026-08-01T11:00:00Z',
                '2026-08-01T12:00:00Z',
            ),
        ).toBe(true);
    });
});

describe('availability and role-aware attention', () => {
    it('aggregates duplicate item lines before evaluating stock', () => {
        const result = calculateInventoryAvailability(
            [{ id: 'camera', total: 5 }],
            [{ inventoryTypeId: 'camera', quantity: 2 }],
            [
                { inventoryTypeId: 'camera', quantity: 2 },
                { inventoryTypeId: 'camera', quantity: 2 },
            ],
        );
        expect(result[0]).toMatchObject({
            availableQuantity: 3,
            requestedQuantity: 4,
            available: false,
        });
    });

    it('counts the queue that the current role can act on', () => {
        const summary = {
            inventoryAwaitingApproval: 1,
            inventoryReadyToIssue: 2,
            inventoryOverdue: 3,
            programAwaitingApproval: 4,
            openTickets: 5,
            assignedTickets: 1,
        };
        expect(attentionTotal(summary, true)).toBe(15);
        expect(attentionTotal(summary, false)).toBe(11);
    });
});
