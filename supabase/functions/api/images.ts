import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireNonEmpty, type Row } from './core.ts';

const ALLOWED_IMAGE_MIME_TYPES = ['image/avif', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 50 * 1024;
const IMAGE_BUCKET = 'request-images';
const IMAGE_URL_TTL_SECONDS = 60 * 60;

export async function createImageUploadUrl(
    admin: SupabaseClient,
    userId: string,
    fileName: string,
    mimeType: string,
): Promise<Row> {
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1)
        throw new Error('That file type is not supported.');
    requireNonEmpty(fileName, 'A file name is required.');
    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
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
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('The selected file is too large.');

    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(IMAGE_BUCKET).upload(path, bytes, {
        contentType: mimeType,
        upsert: false,
    });
    if (error) throw new Error(error.message);

    // Storage has no in-place binary replace either — upload the new object
    // first, then best-effort remove the old one, so a failed upload never
    // leaves a request pointing at nothing (same trade-off as the source
    // app's Drive create-then-trash sequence).
    const previousPath = String(previousImageId || '').trim();
    if (previousPath && previousPath !== path) {
        await admin.storage.from(IMAGE_BUCKET).remove([previousPath]);
    }
    return path;
}

// The bucket is private, so every render needs a fresh signed URL rather than
// a stable public link — same "only a trusted Edge Function issues
// upload/download URLs" boundary the bucket's own migration comment
// describes. Knowing the (random, unguessable) path is treated as
// sufficient — the same trust model the source app used for Drive's
// anyone-with-link sharing.
export async function getImageUrl(admin: SupabaseClient, imageId: string): Promise<string> {
    const path = String(imageId || '').trim();
    if (!path) return '';
    const { data, error } = await admin.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(path, IMAGE_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);
    return data.signedUrl;
}
