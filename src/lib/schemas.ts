import { z } from 'zod';

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    q: z.string().trim().max(100).default(''),
});

export const createShiftSchema = z
    .object({
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        period: z.enum(['Morning', 'Evening', 'Night']),
        locationId: z.uuid().optional(),
        locationName: z.string().trim().min(2).max(120),
        assigneeIds: z.array(z.uuid()).min(1).max(20),
        notes: z.string().trim().max(1000).optional(),
    })
    .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
        message: 'Shift end must be after its start.',
        path: ['endsAt'],
    });

export const createInventoryRequestSchema = z
    .object({
        title: z.string().trim().min(3).max(160),
        fromDate: z.iso.date(),
        toDate: z.iso.date(),
        purpose: z.string().trim().min(5).max(2000),
        items: z
            .array(
                z.object({
                    inventoryItemId: z.uuid(),
                    quantity: z.number().int().min(1).max(1000),
                }),
            )
            .min(1)
            .max(50),
    })
    .refine((data) => data.toDate >= data.fromDate, {
        message: 'End date must not be before start date.',
        path: ['toDate'],
    });

export const createInventoryItemSchema = z
    .object({
        name: z.string().trim().min(2).max(160),
        equipmentTypeId: z.uuid(),
        locationId: z.uuid().nullable().optional(),
        serialNumber: z.string().trim().max(120).nullable().optional(),
        totalQuantity: z.number().int().min(0).max(100_000),
        availableQuantity: z.number().int().min(0).max(100_000),
        adminNotes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((data) => data.availableQuantity <= data.totalQuantity, {
        message: 'Available quantity cannot exceed total quantity.',
        path: ['availableQuantity'],
    });

export const requestActionSchema = z.object({
    note: z.string().trim().max(2000).default(''),
    returns: z
        .array(
            z.object({
                requestItemId: z.uuid(),
                quantity: z.number().int().min(1),
                condition: z.enum(['good', 'damaged', 'missing']),
                notes: z.string().trim().min(3).max(1000),
            }),
        )
        .max(50)
        .default([]),
});

export const createTicketSchema = z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(8).max(4000),
    locationId: z.uuid().optional(),
    locationName: z.string().trim().min(2).max(120),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const ticketActionSchema = z.object({
    assigneeId: z.uuid().optional(),
});

export const pushSubscriptionSchema = z.object({
    endpoint: z.url().max(2000),
    keys: z.object({
        p256dh: z.string().min(10).max(1000),
        auth: z.string().min(5).max(500),
    }),
});

export const uploadUrlSchema = z.object({
    ownerType: z.enum([
        'profile',
        'inventory_item',
        'inventory_request',
        'inventory_return',
        'ticket',
        'ticket_comment',
    ]),
    ownerId: z.uuid(),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    sizeBytes: z
        .number()
        .int()
        .min(1)
        .max(15 * 1024 * 1024),
});
