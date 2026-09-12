import { z } from 'npm:zod@3';

const requestSchema = z
    .object({
        operation: z.string().trim().min(1).optional(),
        args: z.array(z.unknown()).optional(),
    })
    .passthrough();

export type ApiRequest = z.infer<typeof requestSchema>;

export function parseApiRequest(value: unknown): ApiRequest {
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success) throw new Error('The request body is invalid.');
    return parsed.data;
}

export function objectArg(value: unknown, message = 'An object argument is required.') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(message);
    }
    return value as Record<string, unknown>;
}

export function requiredStringArg(value: unknown, message: string): string {
    const parsed = z.string().trim().min(1, message).safeParse(value);
    if (!parsed.success) throw new Error(message);
    return parsed.data;
}
