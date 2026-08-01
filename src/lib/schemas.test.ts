import { describe, expect, it } from 'vitest';
import {
    createInventoryRequestSchema,
    createProgramRequestSchema,
    createRosterSchema,
    imageUploadSchema,
} from './schemas';

describe('command validation', () => {
    it('rejects a roster entry whose end date is before its start', () => {
        const result = createRosterSchema.safeParse({
            name: 'Morning Shift',
            startDate: '2026-07-28',
            endDate: '2026-07-27',
            startTime: '06:00',
            endTime: '12:00',
            userId: 'volunteer@example.org',
        });
        expect(result.success).toBe(false);
    });

    it('accepts a valid multi-item inventory request', () => {
        const result = createInventoryRequestSchema.safeParse({
            name: 'Studio setup',
            startDate: '2026-07-29',
            endDate: '2026-07-31',
            items: [
                {
                    inventoryTypeId: '18f9ab6d-b735-4fcb-b200-7996b178aa90',
                    quantity: 2,
                },
            ],
        });
        expect(result.success).toBe(true);
    });

    it('rejects a program request session whose end is before its start', () => {
        const result = createProgramRequestSchema.safeParse({
            name: 'Sunday Live Program',
            type: 'Live Broadcast',
            placeId: '18f9ab6d-b735-4fcb-b200-7996b178aa90',
            sessions: [
                {
                    name: 'Main Session',
                    type: 'Live',
                    startDateTime: '2026-07-29T10:00:00.000Z',
                    endDateTime: '2026-07-29T09:00:00.000Z',
                },
            ],
        });
        expect(result.success).toBe(false);
    });

    it('blocks oversized or unsupported images', () => {
        expect(
            imageUploadSchema.safeParse({
                fileName: 'payload.exe',
                contentType: 'application/octet-stream',
                sizeBytes: 100,
            }).success,
        ).toBe(false);
        expect(
            imageUploadSchema.safeParse({
                fileName: 'large.jpg',
                contentType: 'image/jpeg',
                sizeBytes: 100 * 1024,
            }).success,
        ).toBe(false);
    });
});
