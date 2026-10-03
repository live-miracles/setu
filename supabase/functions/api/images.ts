import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentWriter, requireNonEmpty, result, type Row } from './core.ts';

const ALLOWED_IMAGE_MIME_TYPES = ['image/avif', 'image/jpeg', 'image/png', 'image/webp'];
const IMAGE_BUCKET = 'request-images';

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
    const actor = await currentWriter(client, userId);
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

// Images live in a public bucket. The object path is still random and uploads
// and deletes remain behind this trusted Edge Function, while reads use a
// stable URL so browsers and Supabase's CDN can cache the asset.
export async function getImageUrl(admin: SupabaseClient, imageId: string): Promise<string> {
    const path = String(imageId || '').trim();
    if (!path) return '';
    return admin.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
