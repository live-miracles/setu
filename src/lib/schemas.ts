import { z } from 'zod';

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    q: z.string().trim().max(100).default(''),
});

export const createRosterSchema = z
    .object({
        name: z.string().trim().min(2).max(160),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        startTime: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.'),
        userId: z.email(),
    })
    .refine((data) => data.endDate >= data.startDate, {
        message: 'End date must not be before start date.',
        path: ['endDate'],
    });

export const createInventoryTypeSchema = z.object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    requestable: z.boolean().default(true),
    totalQuantity: z.number().int().min(0).max(100_000),
    imageDriveId: z.string().trim().max(200).optional(),
});

const imagesSchema = z.array(z.string().trim().min(1).max(200)).max(3);

export const createInventoryRequestSchema = z
    .object({
        name: z.string().trim().min(3).max(160),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        items: z
            .array(
                z.object({
                    inventoryTypeId: z.uuid(),
                    quantity: z.number().int().min(1).max(1000),
                }),
            )
            .min(1)
            .max(50),
        images: imagesSchema.default([]),
    })
    .refine((data) => data.endDate >= data.startDate, {
        message: 'End date must not be before start date.',
        path: ['endDate'],
    });

export const inventoryRequestActionSchema = z.object({
    note: z.string().trim().max(2000).default(''),
    returns: z
        .array(
            z.object({
                itemId: z.uuid(),
                condition: z.enum(['good', 'damaged', 'missing']),
            }),
        )
        .max(50)
        .default([]),
    images: imagesSchema.optional(),
});

const sessionInputSchema = z
    .object({
        name: z.string().trim().min(2).max(160),
        type: z.string().trim().min(2).max(120),
        startDateTime: z.iso.datetime(),
        endDateTime: z.iso.datetime(),
    })
    .refine((data) => new Date(data.endDateTime) > new Date(data.startDateTime), {
        message: 'Session end must be after its start.',
        path: ['endDateTime'],
    });

export const createProgramRequestSchema = z.object({
    name: z.string().trim().min(3).max(160),
    type: z.string().trim().min(2).max(120),
    placeId: z.uuid(),
    sessions: z.array(sessionInputSchema).min(1).max(50),
});

export const programRequestActionSchema = z.object({
    note: z.string().trim().max(2000).default(''),
});

export const createTicketSchema = z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(8).max(4000),
});

export const ticketActionSchema = z.object({
    assigneeId: z.email().optional(),
});

export const addCommentSchema = z.object({
    message: z.string().trim().min(1).max(4000),
});

export const imageUploadSchema = z.object({
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z
        .number()
        .int()
        .min(1)
        .max(50 * 1024),
});
