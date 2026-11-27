import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { currentWriter, result, type Row } from './core.ts';
import { boundedText, isValidEmail, MAX_COMMENT_LENGTH, MAX_PARTICIPANTS } from './validation.ts';
import {
    canCollaborate,
    canDeleteRequest,
    canEditRequest,
    isApproverRole,
    normalizeIdentity,
    type RequestKind,
} from '../_shared/request-policy.ts';

// Everything inventory and program requests have in common, behind one
// interface: what differs (tables, the SQL transition function, the DTO reader)
// is a RequestKindConfig; the lifecycle skeleton — load the request with its
// participants, authorize through the shared policy, write — lives here once.
// Multi-row writes are single SQL functions (save_*_request_tx, migration
// 20261124000000), so a request is never left half-saved.
export interface RequestKindConfig {
    kind: RequestKind;
    table: 'inventory_requests' | 'program_requests';
    participantsTable: 'inventory_request_participants' | 'program_request_participants';
    actionRpc: 'perform_inventory_request_action_tx' | 'perform_program_request_action_tx';
    read: (client: SupabaseClient, admin: SupabaseClient, id: string) => Promise<Row>;
}

export interface RequestAccess {
    request: Row;
    isParty: boolean;
}

// A party is the requester, a participant with an account, the request's lead,
// or a participant listed by email: the last two are matched on the signed-in
// profile's email, which comes from Google sign-in and which users cannot change.
// The database functions and policies apply the same rule (migration
// 20261201000000), and the browser's check in frontend/src/workflows.ts follows
// it too.
export function isPartyOfRequest(actor: Row, request: Row, participants: Row[]): boolean {
    const me = normalizeIdentity(String(actor.email || ''));
    const isMe = (email: unknown) => me !== '' && normalizeIdentity(String(email || '')) === me;
    return (
        request.requester_id === actor.id ||
        isMe(request.lead_email) ||
        participants.some(
            (participant) =>
                participant.profile_id === actor.id || isMe(participant.external_email),
        )
    );
}

export function isApprover(profile: Row): boolean {
    return isApproverRole(String(profile.role));
}

// Trimmed/lowercased/deduped so membership checks are plain string equality.
export function parseParticipants(raw: unknown): string[] {
    const seen = new Set<string>();
    String(raw || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
        .forEach((email) => {
            if (!isValidEmail(email)) {
                throw new Error(
                    `"${email.slice(0, 80)}" is not a valid participant email address.`,
                );
            }
            seen.add(email);
        });
    if (seen.size > MAX_PARTICIPANTS) {
        throw new Error(`A request can have at most ${MAX_PARTICIPANTS} participants.`);
    }
    return Array.from(seen);
}

// Resolves each participant email to a profile row when one exists (citext,
// case-insensitive), or keeps it as an external_email otherwise — mirrors
// the child participant tables' `num_nonnulls(profile_id, external_email)
// = 1` constraint.
export async function resolveParticipants(admin: SupabaseClient, emails: string[]): Promise<Row[]> {
    if (!emails.length) return [];
    const profiles = result(
        await admin.from('profiles').select('id, email').in('email', emails),
    ) as Row[];
    const profileIdByEmail = new Map(profiles.map((p) => [String(p.email).toLowerCase(), p.id]));
    return emails.map((email) => {
        const profileId = profileIdByEmail.get(email);
        return profileId
            ? { profile_id: profileId, external_email: null }
            : { profile_id: null, external_email: email };
    });
}

export async function requireRequesterProfile(admin: SupabaseClient, email: string): Promise<Row> {
    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Requester not found.');
    return data;
}

export async function requireDepartment(admin: SupabaseClient, id: string): Promise<Row> {
    const { data, error } = await admin.from('departments').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Department not found.');
    return data;
}

export async function loadRequestAccess(
    admin: SupabaseClient,
    config: RequestKindConfig,
    id: string,
    actor: Row,
): Promise<RequestAccess> {
    const [requestRes, participantsRes] = await Promise.all([
        admin.from(config.table).select('*').eq('id', id).single(),
        admin.from(config.participantsTable).select('*').eq('request_id', id),
    ]);
    const request = result(requestRes) as Row;
    const participants = result(participantsRes) as Row[];
    return {
        request,
        isParty: isPartyOfRequest(actor, request, participants),
    };
}

export function policyInput(actor: Row, access: RequestAccess) {
    return { status: String(access.request.status), isParty: access.isParty, role: actor.role };
}

// Throws unless the actor may edit the request's own fields (and image).
export function assertCanEdit(actor: Row, access: RequestAccess): void {
    if (!canEditRequest(policyInput(actor, access))) {
        throw new Error('You are not allowed to edit this request.');
    }
}

export async function updateRequestParticipants(
    config: RequestKindConfig,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const participantEmails = parseParticipants(input.participants);
    const access = await loadRequestAccess(admin, config, id, actor);
    if (!canCollaborate({ isParty: access.isParty, role: actor.role })) {
        throw new Error('You are not allowed to edit participants on this request.');
    }
    result(
        await admin.rpc('save_request_participants_tx', {
            p_kind: config.kind,
            p_request_id: id,
            p_participants: await resolveParticipants(admin, participantEmails),
            p_actor_id: actor.id,
        }),
    );
    return config.read(client, admin, id);
}

// The RPC locks the request (plus its place or stock), validates the
// transition, updates status and writes the activity comment atomically.
export async function performRequestAction(
    config: RequestKindConfig,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    action: string,
    note: string,
): Promise<string> {
    const actor = await currentWriter(client, userId);
    // The note is appended to the activity comment, so it has the comment's cap.
    boundedText(note, 'Note', MAX_COMMENT_LENGTH);
    return result(
        await admin.rpc(config.actionRpc, {
            p_request_id: id,
            p_action: action,
            p_actor_id: actor.id,
            p_note: note,
        }),
    ) as string;
}

export async function deleteRequest(
    config: RequestKindConfig,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    const actor = await currentWriter(client, userId);
    const access = await loadRequestAccess(admin, config, id, actor);
    if (!isApprover(actor) && !access.isParty) {
        throw new Error('You are not allowed to delete this request.');
    }
    if (!canDeleteRequest(config.kind, policyInput(actor, access))) {
        throw new Error('This request can no longer be deleted.');
    }
    const { error } = await admin.from(config.table).delete().eq('id', id);
    if (error) throw new Error(error.message);
}
