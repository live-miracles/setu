import { z } from 'npm:zod@4';

const requestSchema = z
    .object({
        operation: z.string().trim().min(1).optional(),
        args: z.array(z.unknown()).optional(),
    })
    .loose();

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

export const MAX_COMMENT_LENGTH = 4000;
export const MAX_PARTICIPANTS = 50;

// Addresses are stored and later passed to the mail worker as a single
// recipient, so reject anything that could address several people (commas,
// semicolons, angle brackets) or carry whitespace/control characters.
const EMAIL_PATTERN = /^[^\s@,;:<>()[\]"\\]+@[^\s@,;:<>()[\]"\\]+\.[^\s@,;:<>()[\]"\\]+$/;

export function isValidEmail(value: string): boolean {
    return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function emailArg(value: unknown, requiredMessage: string): string {
    const email = requiredStringArg(value, requiredMessage).toLowerCase();
    if (!isValidEmail(email))
        throw new Error(`"${email.slice(0, 80)}" is not a valid email address.`);
    return email;
}

export const MAX_NAME_LENGTH = 200;
export const MAX_PHONE_LENGTH = 50;

export function boundedText(value: unknown, label: string, max: number): string {
    const text = String(value ?? '').trim();
    if (text.length > max) throw new Error(`${label} must be at most ${max} characters.`);
    return text;
}

// An image id is the storage path the upload returned
// (`<user>/<target type>/<target>/<uuid>.<ext>`). It ends up in a URL, so accept
// only plain path segments: no scheme, query, fragment, encoding or `..`.
// Older records keep whatever path they were saved with, so the shape is
// checked loosely rather than against the current layout.
const IMAGE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function imagePathArg(value: unknown): string {
    const path = String(value || '').trim();
    if (!path) return '';
    if (path.length > 300 || path.includes('..') || !IMAGE_PATH_PATTERN.test(path)) {
        throw new Error('The image is not valid.');
    }
    return path;
}
