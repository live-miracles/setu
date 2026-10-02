import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentProfile, requireNonEmpty, result, type Row } from './core.ts';

const ALLOWED_IMAGE_MIME_TYPES = ['image/avif', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 50 * 1024;
const IMAGE_BUCKET = 'request-images';
const IMAGE_CACHE_CONTROL = '31536000';

export function isOwnedImagePath(userId: string, path: string): boolean {
    return Boolean(path) && !path.split('/').includes('..') && path.startsWith(`${userId}/`);
}

export async function createImageUploadUrl(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    fileName: string,
    mimeType: string,
    targetType: string,
    targetId: string,
): Promise<Row> {
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1)
        throw new Error('That file type is not supported.');
    requireNonEmpty(fileName, 'A file name is required.');
    const target = requireNonEmpty(targetId, 'An image target is required.');
    const actor = await currentProfile(client, userId);
    if (targetType === 'inventory_type') {
        if (actor.role !== 'admin') throw new Error('Administrator access is required.');
        result(await admin.from('inventory_types').select('id').eq('id', target).single());
    } else if (targetType === 'inventory_request') {
        const [requestRes, participantsRes] = await Promise.all([
            admin
                .from('inventory_requests')
                .select('requester_id, status')
                .eq('id', target)
                .single(),
            admin
                .from('inventory_request_participants')
                .select('profile_id')
                .eq('request_id', target),
        ]);
        const request = result(requestRes) as Row;
        const participants = result(participantsRes) as Row[];
        const isApprover = actor.role === 'admin' || actor.role === 'approver';
        const isOwner =
            request.requester_id === actor.id ||
            participants.some((participant) => participant.profile_id === actor.id);
        if (!(isApprover || (isOwner && request.status === 'draft'))) {
            throw new Error('You are not allowed to update this request image.');
        }
    } else {
        throw new Error('That image target is not supported.');
    }
    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${targetType}/${target}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await admin.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: data.token };
}

export async function uploadImage(
    admin: SupabaseClient,
    userId: string,
    base64Data: string,
    fileName: string,
    mimeType: string,
    previousImageId: string,
): Promise<string> {
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {
        throw new Error('That file type is not supported.');
    }
    requireNonEmpty(fileName, 'A file name is required.');
    const previousPath = String(previousImageId || '').trim();
    if (previousPath && !isOwnedImagePath(userId, previousPath)) {
        throw new Error('You cannot replace an image owned by another user.');
    }
    // Reject oversized payloads before decoding so a huge string cannot exhaust
    // the function's memory; base64 expands the byte count by 4/3.
    if (base64Data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
        throw new Error('The selected file is too large.');
    }
    let bytes: Uint8Array;
    try {
        bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    } catch {
        throw new Error('The selected file is not valid image data.');
    }
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('The selected file is too large.');

    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(IMAGE_BUCKET).upload(path, bytes, {
        cacheControl: IMAGE_CACHE_CONTROL,
        contentType: mimeType,
        upsert: false,
    });
    if (error) throw new Error(error.message);

    // Storage has no in-place binary replace either — upload the new object
    // first, then best-effort remove the old one, so a failed upload never
    // leaves a request pointing at nothing (same trade-off as the source
    // app's Drive create-then-trash sequence).
    if (previousPath && previousPath !== path) {
        await admin.storage.from(IMAGE_BUCKET).remove([previousPath]);
    }
    return path;
}

// Images live in a public bucket. The object path is still random and uploads
// and deletes remain behind this trusted Edge Function, while reads use a
// stable URL so browsers and Supabase's CDN can cache the asset.
export async function getImageUrl(admin: SupabaseClient, imageId: string): Promise<string> {
    const path = String(imageId || '').trim();
    if (!path) return '';
    return admin.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
