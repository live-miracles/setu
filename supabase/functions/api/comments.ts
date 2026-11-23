import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentProfile, newRequestId, requireNonEmpty, result, type Row } from './core.ts';
import { commentDto } from './query.ts';
import { MAX_COMMENT_LENGTH } from './validation.ts';
import { canCollaborate, canWriteRole } from '../_shared/request-policy.ts';

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

// The database trigger creates one email_outbox row per comment after insert.
// The email-dispatcher Edge Function delivers that row asynchronously.
export async function addComment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    requestId: string,
    message: string,
    clientId?: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    if (!canWriteRole(actor.role)) throw new Error('Viewer access is read-only.');
    const trimmed = requireNonEmpty(message, 'Message is required.');
    if (trimmed.length > MAX_COMMENT_LENGTH) {
        throw new Error(`Comments can be at most ${MAX_COMMENT_LENGTH} characters.`);
    }
    const owner = await findRequestOwner(admin, requestId);
    if (!owner) throw new Error('Request not found.');
    const isParty = owner.requesterId === actor.id || owner.participantIds.indexOf(actor.id) !== -1;
    if (!canCollaborate({ isParty, role: actor.role }))
        throw new Error('You do not have access to this request.');

    // The client's id for this submission is the comment's id, so a replayed
    // submit finds its own comment instead of posting a second one.
    const commentId = newRequestId(clientId);
    const { data, error } = await client
        .from('comments')
        .insert({
            id: commentId,
            ...(owner.kind === 'inventory_request'
                ? { inventory_request_id: requestId }
                : { program_request_id: requestId }),
            author_id: actor.id,
            message: trimmed,
        })
        .select('*')
        .single();
    if (error?.code === '23505') {
        const existing = result(
            await client.from('comments').select('*').eq('id', commentId).single(),
        ) as Row;
        if (existing.author_id !== actor.id) throw new Error('This comment id is already in use.');
        return commentDto(existing, new Map([[actor.id, actor]]));
    }
    return commentDto(result({ data, error }) as Row, new Map([[actor.id, actor]]));
}
