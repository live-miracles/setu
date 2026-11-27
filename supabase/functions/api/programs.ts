import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentWriter,
    fetchAll,
    fetchAllIn,
    newRequestId,
    profilesFor,
    requireNonEmpty,
    result,
    type Row,
} from './core.ts';
import { commentDto, groupByKey, REQUEST_PAGE_SIZE, requestPage } from './query.ts';
import { boundedText, emailArg, MAX_NAME_LENGTH } from './validation.ts';
import {
    assertCanEdit,
    deleteRequest,
    isApprover,
    loadRequestAccess,
    parseParticipants,
    performRequestAction,
    resolveParticipants,
    requireDepartment,
    requireRequesterProfile,
    updateRequestParticipants,
    type RequestKindConfig,
} from './requests.ts';
import { availablePlaces } from './scheduling.ts';

export function programSessionDto(x: Row): Row {
    return {
        Name: x.name || '',
        Type: x.session_type,
        StartDateTime: x.start_at,
        EndDateTime: x.end_at,
    };
}

export function programRequestDto(
    x: Row,
    placesById: Map<string, Row>,
    departmentsById: Map<string, Row>,
    profilesById: Map<string, Row>,
    sessions: Row[],
    participants: Row[],
    comments: Row[],
): Row {
    const requestSessions = sessions.map(programSessionDto);
    return {
        Id: x.id,
        DisplayId: x.display_id,
        Name: x.name,
        Language: x.language,
        Type: x.program_type,
        UserId: profilesById.get(x.requester_id)?.email || '',
        Status: x.status,
        PlaceId: x.place_id,
        DepartmentId: x.department_id || '',
        LeadEmail: x.lead_email,
        userName: profilesById.get(x.requester_id)?.name || '',
        placeName: placesById.get(x.place_id)?.name || '',
        departmentName: departmentsById.get(x.department_id)?.name || '',
        participants: participants
            .map((p) => profilesById.get(p.profile_id)?.email || p.external_email || '')
            .filter(Boolean),
        sessions: requestSessions,
        sessionStart: requestSessions[0]?.StartDateTime || '',
        sessionEnd: requestSessions.at(-1)?.EndDateTime || '',
        comments: comments.map((c) => commentDto(c, profilesById)),
    };
}

// Loads the requests with these ids, children included, as DTOs in the order
// given. Requests the caller may not see are left out (the reads run through the
// caller's own RLS-scoped client).
async function loadProgramRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    ids: string[],
): Promise<Row[]> {
    if (!ids.length) return [];
    const byRequest = (table: string, column: string, order: string[]) =>
        fetchAllIn(ids, (chunk, from, to) => {
            let query = client.from(table).select('*').in(column, chunk);
            for (const key of order) query = query.order(key);
            return query.range(from, to);
        });
    const [requests, places, departments, sessions, participants, comments] = await Promise.all([
        byRequest('program_requests', 'id', ['id']),
        client
            .from('places')
            .select('*')
            .then((res) => result(res) as Row[]),
        client
            .from('departments')
            .select('*')
            .then((res) => result(res) as Row[]),
        byRequest('program_sessions', 'request_id', ['start_at', 'id']),
        byRequest('program_request_participants', 'request_id', ['id']),
        byRequest('comments', 'program_request_id', ['created_at', 'id']),
    ]);
    const placesById = new Map<string, Row>(places.map((x) => [x.id, x]));
    const departmentsById = new Map<string, Row>(departments.map((x) => [x.id, x]));
    const requestsById = new Map<string, Row>(requests.map((x) => [x.id, x]));
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const commentsByRequest = groupByKey(comments, 'program_request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
        ...comments.map((x) => x.author_id),
    ]);
    return ids
        .filter((id) => requestsById.has(id))
        .map((id) =>
            programRequestDto(
                requestsById.get(id)!,
                placesById,
                departmentsById,
                profilesById,
                sessionsByRequest.get(id) || [],
                participantsByRequest.get(id) || [],
                commentsByRequest.get(id) || [],
            ),
        );
}

// One page of requests. The database filters, searches, sorts and counts (see
// requestPage); only the 25 requests on the page are loaded.
export async function listProgramRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const found = await requestPage(client, 'list_program_requests_page', page, query);
    return {
        items: await loadProgramRequests(client, admin, found.ids),
        page: found.page,
        pageSize: REQUEST_PAGE_SIZE,
        totalCount: found.totalCount,
    };
}

export async function getProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [request] = await loadProgramRequests(client, admin, [id]);
    if (!request) throw new Error('Request not found.');
    return request;
}

const MAX_PROGRAM_SESSIONS = 100;

// `name` is only required when the type is 'Other'; every other type carries
// its own name.
function programTitleFields(input: Row): { type: string; name: string; language: string } {
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name = boundedText(
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || ''),
        'Program title',
        MAX_NAME_LENGTH,
    );
    const language = boundedText(
        requireNonEmpty(input.language, 'Language is required.'),
        'Language',
        MAX_NAME_LENGTH,
    );
    return { type, name, language };
}

function boundedProgramSessions(value: unknown): Row[] {
    if (!Array.isArray(value)) throw new Error('Program sessions must be a list.');
    if (value.length > MAX_PROGRAM_SESSIONS) {
        throw new Error(`A program can have at most ${MAX_PROGRAM_SESSIONS} sessions.`);
    }
    return value as Row[];
}

// `name` is only required when Type is 'Other' — every other program type
// carries its own name (matches PROGRAM_REQUIRED_FIELDS in Programs.ts).
export function validateProgramSessions(sessions: unknown, requireAtLeastOne = true): Row[] {
    const cleaned = boundedProgramSessions(sessions).map((session) => {
        const sessionType = requireNonEmpty(session.type, 'Session type is required.');
        const startDateTime = requireNonEmpty(session.startDateTime, 'Session start is required.');
        const endDateTime = requireNonEmpty(session.endDateTime, 'Session end is required.');
        const startMs = Date.parse(startDateTime);
        const endMs = Date.parse(endDateTime);
        if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
            throw new Error('Session end must be after its start.');
        }
        if (endMs - startMs >= 24 * 60 * 60 * 1000) {
            throw new Error('Sessions must be shorter than 24 hours.');
        }
        return {
            name: boundedText(session.name, 'Session name', MAX_NAME_LENGTH),
            session_type: sessionType,
            start_at: startDateTime,
            end_at: endDateTime,
        };
    });
    if (requireAtLeastOne && !cleaned.length) throw new Error('At least one session is required.');
    return cleaned;
}

export async function getAvailablePlaces(
    admin: SupabaseClient,
    currentRequestId: string,
    inputSessions: unknown,
): Promise<Row[]> {
    const sessions = boundedProgramSessions(inputSessions).map((s) => ({
        start_at: s.startDateTime || '',
        end_at: s.endDateTime || '',
    }));
    return availablePlaces(admin, currentRequestId, sessions);
}

// The calendar is an org-wide events view, not a personal request list — every
// signed-in user sees every approved program regardless of role or whether
// they're the requester/a participant, so this reads through `admin` rather
// than the RLS-scoped `client` (which would narrow a plain `user` down to
// just their own requests, same as the request-detail pages already do).
// Intentional design decision; see docs/security-review.md, "Shared
// approved-program calendar".
export async function getCalendarMonth(
    admin: SupabaseClient,
    year: number,
    month: number,
): Promise<Row> {
    // The browser buckets sessions by *local* date, so a session in the first or
    // last hours of a local month can fall in the neighbouring UTC month. Pad
    // the window by a day each side (more than any UTC offset); the client only
    // draws sessions whose local date is inside the visible month.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const monthStart = new Date(Date.UTC(year, month - 1, 1) - DAY_MS).toISOString();
    const monthEnd = new Date(Date.UTC(year, month, 1) + DAY_MS).toISOString();
    // Only the sessions that touch the window, of approved programs; a program's
    // other sessions are then loaded so its full schedule can be summarised.
    const [placesRes, departmentsRes, windowSessions] = await Promise.all([
        admin.from('places').select('*').order('name'),
        admin.from('departments').select('*'),
        fetchAll((from, to) =>
            admin
                .from('program_sessions')
                .select('id, request_id, program_requests!inner(status)')
                .eq('program_requests.status', 'approved')
                .lt('start_at', monthEnd)
                .gt('end_at', monthStart)
                .order('id')
                .range(from, to),
        ),
    ]);
    const places = result(placesRes) as Row[];
    const placesById = new Map<string, Row>(places.map((p) => [p.id, p]));
    const departmentsById = new Map<string, Row>(
        (result(departmentsRes) as Row[]).map((d) => [d.id, d]),
    );
    const requestIds = [...new Set(windowSessions.map((s) => s.request_id as string))];
    const [requests, sessions] = await Promise.all([
        fetchAllIn(requestIds, (chunk, from, to) =>
            admin.from('program_requests').select('*').in('id', chunk).order('id').range(from, to),
        ),
        fetchAllIn(requestIds, (chunk, from, to) =>
            admin
                .from('program_sessions')
                .select('*')
                .in('request_id', chunk)
                .order('start_at')
                .order('id')
                .range(from, to),
        ),
    ]);
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const windowStartMs = Date.parse(monthStart);
    const windowEndMs = Date.parse(monthEnd);
    const programs: Row[] = [];
    requests.forEach((request) => {
        const allSessions = sessionsByRequest.get(request.id) || [];
        const monthSessions = allSessions.filter((s) => {
            const start = Date.parse(s.start_at);
            const end = Date.parse(s.end_at);
            return (
                !Number.isNaN(start) &&
                !Number.isNaN(end) &&
                start < windowEndMs &&
                end > windowStartMs
            );
        });
        if (!monthSessions.length) return;
        // sessionStart/sessionEnd reflect the program's full schedule
        // (computed from allSessions); only the `sessions` field itself is
        // narrowed to this month, same split the source app made.
        // The calendar shows what is on and where, not who is behind it: no
        // profiles, participants or comments are read, so the requester and the
        // contact addresses stay with the request itself.
        const dto = programRequestDto(
            request,
            placesById,
            departmentsById,
            new Map(),
            allSessions,
            [],
            [],
        );
        programs.push({
            ...dto,
            LeadEmail: '',
            sessions: monthSessions.map(programSessionDto),
            comments: [],
        });
    });
    return { places: places.map((p) => ({ Id: p.id, Name: p.name })), programs };
}

export async function createProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    clientId?: string,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const approver = isApprover(actor);
    const { type, name, language } = programTitleFields(input);
    const requesterEmail = String(input.userId || actor.email).toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    if (requestedBy.email !== actor.email && !approver) {
        throw new Error('You cannot create a request on behalf of another user.');
    }
    if (input.placeId && !approver) throw new Error('Only an approver can assign a place.');
    let place: Row | null = null;
    if (input.placeId) {
        const { data, error } = await admin
            .from('places')
            .select('*')
            .eq('id', input.placeId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Place not found.');
        place = data;
    }
    const sessions = validateProgramSessions(input.sessions || [], false);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);

    const id = newRequestId(clientId);
    // The save checks place availability under the place lock, in the same
    // transaction as the writes.
    result(
        await admin.rpc('save_program_request_tx', {
            p_mode: 'create',
            p_request_id: id,
            p_fields: {
                name,
                language,
                program_type: type,
                requester_id: requestedBy.id,
                place_id: place ? place.id : null,
                department_id: department.id,
                lead_email: leadEmail,
            },
            p_sessions: sessions,
            p_participants: await resolveParticipants(admin, participantEmails),
            p_expected_status: 'draft',
        }),
    );
    return getProgramRequest(client, admin, id);
}

export async function updateProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const approver = isApprover(actor);
    const { type, name, language } = programTitleFields(input);
    const requesterEmail = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    let place: Row | null = null;
    if (input.placeId) {
        const { data, error } = await admin
            .from('places')
            .select('*')
            .eq('id', input.placeId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Place not found.');
        place = data;
    }
    // Existing legacy programs may have no sessions; they remain editable —
    // only createProgramRequest requires at least one.
    const sessions = validateProgramSessions(input.sessions || [], false);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);
    const access = await loadRequestAccess(admin, programRequestKind, id, actor);
    assertCanEdit(actor, access);
    const existing = access.request;
    const newPlaceId = place ? place.id : null;
    if (existing.place_id !== newPlaceId && !approver) {
        throw new Error('Only an approver can change the assigned place.');
    }
    if (existing.requester_id !== requestedBy.id && !approver) {
        throw new Error('You cannot reassign the requester.');
    }
    result(
        await admin.rpc('save_program_request_tx', {
            p_mode: 'update',
            p_request_id: id,
            p_fields: {
                name,
                language,
                program_type: type,
                requester_id: requestedBy.id,
                place_id: newPlaceId,
                department_id: department.id,
                lead_email: leadEmail,
            },
            p_sessions: sessions,
            p_participants: await resolveParticipants(admin, participantEmails),
            p_expected_status: String(existing.status),
            // Names the author of the edit event the save records (once the
            // request has left draft).
            p_actor_id: actor.id,
        }),
    );
    return getProgramRequest(client, admin, id);
}

const programRequestKind: RequestKindConfig = {
    kind: 'program',
    table: 'program_requests',
    participantsTable: 'program_request_participants',
    actionRpc: 'perform_program_request_action_tx',
    read: getProgramRequest,
};

export function updateProgramRequestParticipants(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    return updateRequestParticipants(programRequestKind, client, admin, userId, id, input);
}

// The RPC locks the request (and its place during approval), validates the
// transition, updates status and writes the activity comment atomically.
export function performProgramRequestAction(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    action: string,
    note: string,
): Promise<string> {
    return performRequestAction(programRequestKind, client, admin, userId, id, action, note);
}

export function deleteProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    return deleteRequest(programRequestKind, client, admin, userId, id);
}
