import { apiHandler, jsonCreated, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { uploadUrlSchema } from '@/lib/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { claimIdempotencyKey } from '@/lib/idempotency';

export async function POST(request: Request) {
    return apiHandler(async () => {
        const user = await requireUser();
        const input = await parseJson(request, uploadUrlSchema);
        if (isDemoMode) {
            return jsonCreated({
                attachmentId: crypto.randomUUID(),
                path: 'demo/not-uploaded',
                signedUrl: null,
            });
        }
        await claimIdempotencyKey(request, user.id, 'attachment:create');
        const admin = createSupabaseAdminClient();
        await assertAttachmentAccess(user.id, user.role, input.ownerType, input.ownerId);
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${input.ownerType}/${input.ownerId}/${crypto.randomUUID()}-${safeName}`;
        const { data: signed, error: signedError } = await admin.storage
            .from('private-attachments')
            .createSignedUploadUrl(path);
        if (signedError) throw signedError;
        const { data: attachment, error } = await admin
            .from('attachments')
            .insert({
                owner_type: input.ownerType,
                owner_id: input.ownerId,
                storage_path: path,
                original_name: input.fileName,
                content_type: input.contentType,
                size_bytes: input.sizeBytes,
                uploaded_by: user.id,
            })
            .select('id')
            .single();
        if (error) throw error;
        return jsonCreated({
            attachmentId: attachment.id,
            path,
            token: signed.token,
        });
    });
}

async function assertAttachmentAccess(
    profileId: string,
    role: string,
    ownerType: string,
    ownerId: string,
) {
    if (role === 'admin') return;
    const admin = createSupabaseAdminClient();
    if (ownerType === 'profile' && ownerId === profileId) return;
    if (ownerType === 'inventory_request') {
        const { data } = await admin
            .from('inventory_requests')
            .select('id')
            .eq('id', ownerId)
            .eq('requester_id', profileId)
            .maybeSingle();
        if (data) return;
    }
    if (ownerType === 'ticket') {
        const { data } = await admin.from('tickets').select('id').eq('id', ownerId).maybeSingle();
        if (data) return;
    }
    if (ownerType === 'ticket_comment') {
        const { data } = await admin
            .from('ticket_comments')
            .select('id')
            .eq('id', ownerId)
            .maybeSingle();
        if (data) return;
    }
    throw new Error('You do not have access to attach files to this record.');
}
