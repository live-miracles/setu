import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentProfile, newRequestId, requireNonEmpty, result, type Row } from './core.ts';
import { commentDto } from './query.ts';
import { MAX_COMMENT_LENGTH } from './validation.ts';
import { canCollaborate, canWriteRole } from '../_shared/request-policy.ts';
import { isPartyOfRequest } from './requests.ts';

interface RequestOwner {
    kind: 'inventory_request' | 'program_request';
    request: Row;
    participants: Row[];
}

export async function findRequestOwner(
    admin: SupabaseClient,
    requestId: string,
): Promise<RequestOwner | null> {
    for (const [kind, table, participantsTable] of [
        ['inventory_request', 'inventory_requests', 'inventory_request_participants'],
        ['program_request', 'program_requests', 'program_request_participants'],
    ] as const) {
        const requestRes = await admin
            .from(table)
            .select('requester_id, lead_email')
            .eq('id', requestId)
            .maybeSingle();
        if (requestRes.error) throw new Error(requestRes.error.message);
        if (!requestRes.data) continue;
        const participants = result(
            await admin
                .from(participantsTable)
                .select('profile_id, external_email')
                .eq('request_id', requestId),
        ) as Row[];
        return { kind, request: requestRes.data, participants };
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
    const isParty = isPartyOfRequest(actor, owner.request, owner.participants);
    if (!canCollaborate({ isParty, role: actor.role })) {
        throw new Error('You do not have access to this request.');
    }

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
