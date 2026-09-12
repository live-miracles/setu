import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentProfile, requireNonEmpty, result, withLockedDedupe, type Row } from './core.ts';
import { commentDto } from './query.ts';

interface RequestOwner {
    kind: 'inventory_request' | 'program_request';
    requesterId: string | null;
    participantIds: string[];
}

export async function findRequestOwner(
    admin: SupabaseClient,
    requestId: string,
): Promise<RequestOwner | null> {
    const inventoryRes = await admin
        .from('inventory_requests')
        .select('requester_id')
        .eq('id', requestId)
        .maybeSingle();
    if (inventoryRes.error) throw new Error(inventoryRes.error.message);
    if (inventoryRes.data) {
        const participants = result(
            await admin
                .from('inventory_request_participants')
                .select('profile_id')
                .eq('request_id', requestId),
        ) as Row[];
        return {
            kind: 'inventory_request',
            requesterId: inventoryRes.data.requester_id,
            participantIds: participants.map((p) => p.profile_id).filter(Boolean),
        };
    }
    const programRes = await admin
        .from('program_requests')
        .select('requester_id')
        .eq('id', requestId)
        .maybeSingle();
    if (programRes.error) throw new Error(programRes.error.message);
    if (programRes.data) {
        const participants = result(
            await admin
                .from('program_request_participants')
                .select('profile_id')
                .eq('request_id', requestId),
        ) as Row[];
        return {
            kind: 'program_request',
            requesterId: programRes.data.requester_id,
            participantIds: participants.map((p) => p.profile_id).filter(Boolean),
        };
    }
    return null;
}

// Notifications (email/WhatsApp) aren't wired up yet — the source app sent
// one on every comment via sendCommentNotification; this only writes the
// row for now. The email_outbox table exists for exactly this, unbuilt.
export async function addComment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    requestId: string,
    message: string,
    dedupeRequestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const trimmed = requireNonEmpty(message, 'Message is required.');
    const owner = await findRequestOwner(admin, requestId);
    if (!owner) throw new Error('Request not found.');
    const canComment =
        isApprover ||
        owner.requesterId === actor.id ||
        owner.participantIds.indexOf(actor.id) !== -1;
    if (!canComment) throw new Error('You do not have access to this request.');

    const { result: comment } = await withLockedDedupe(
        admin,
        owner.kind + ':' + requestId + ':comment',
        dedupeRequestId,
        async () => {
            const created = result(
                await client
                    .from('comments')
                    .insert({
                        ...(owner.kind === 'inventory_request'
                            ? { inventory_request_id: requestId }
                            : { program_request_id: requestId }),
                        author_id: actor.id,
                        message: trimmed,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            return commentDto(created, new Map([[actor.id, actor]]));
        },
    );
    return comment;
}
