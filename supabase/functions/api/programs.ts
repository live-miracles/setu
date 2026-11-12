import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentWriter,
    fetchAll,
    fetchAllIn,
    profilesFor,
    requireNonEmpty,
    result,
    withLockedDedupe,
    type Row,
} from './core.ts';
import {
    commentDto,
    commentsByTargetFor,
    compareQueryValues,
    groupByKey,
    latestActivityAt,
    matchesSearch,
    paginate,
} from './query.ts';
import { emailArg, requireUnchangedWorkflowStatus } from './validation.ts';
import {
    assertCanEdit,
    deleteRequest,
    isApprover,
    loadRequestAccess,
    parseParticipants,
    performRequestAction,
    replaceParticipants,
    requireDepartment,
    requireRequesterProfile,
    updateRequestParticipants,
    type RequestKindConfig,
} from './requests.ts';
import { assertPlaceAvailability, availablePlaces } from './scheduling.ts';

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
        Participants: '',
        SessionsJson: '',
        CommentsJson: '',
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

export function programRequestSortValue(request: Row, sortBy: unknown): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'place') return request.placeName;
    if (sortBy === 'sessionStart') return request.sessionStart;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

export function matchesProgramDateScope(request: Row, dateScope: unknown): boolean {
    if (!dateScope) return true;
    const nowIso = new Date().toISOString();
    const hasOngoingOrFuture = (request.sessions as Row[]).some((s) => s.EndDateTime >= nowIso);
    const isUnscheduled = (request.sessions as Row[]).length === 0;
    return dateScope === 'past'
        ? !hasOngoingOrFuture && !isUnscheduled
        : hasOngoingOrFuture || isUnscheduled;
}

export async function listProgramRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const [places, departments, requests, sessions, participants] = await Promise.all([
        client
            .from('places')
            .select('*')
            .then((res) => result(res) as Row[]),
        client
            .from('departments')
            .select('*')
            .then((res) => result(res) as Row[]),
        fetchAll((from, to) =>
            client.from('program_requests').select('*').order('id').range(from, to),
        ),
        fetchAll((from, to) =>
            client
                .from('program_sessions')
                .select('*')
                .order('start_at')
                .order('id')
                .range(from, to),
        ),
        fetchAll((from, to) =>
            client.from('program_request_participants').select('*').order('id').range(from, to),
        ),
    ]);
    const placesById = new Map(places.map((x) => [x.id, x]));
    const departmentsById = new Map(departments.map((x) => [x.id, x]));
    const commentsByTarget = await commentsByTargetFor(client, 'program_request_id');
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
        ...[...commentsByTarget.values()].flat().map((x) => x.author_id),
    ]);

    const dtos = requests.map((x) =>
        programRequestDto(
            x,
            placesById,
            departmentsById,
            profilesById,
            sessionsByRequest.get(x.id) || [],
            participantsByRequest.get(x.id) || [],
            commentsByTarget.get(x.id) || [],
        ),
    );

    const statuses: string[] = query.statuses || [];
    const filtered = dtos
        .filter((r) => statuses.length === 0 || statuses.indexOf(r.Status) !== -1)
        .filter((r) => !query.placeId || r.PlaceId === query.placeId)
        .filter((r) => !query.departmentId || r.DepartmentId === query.departmentId)
        .filter((r) => !query.requesterEmail || r.UserId === query.requesterEmail)
        .filter((r) => matchesProgramDateScope(r, query.dateScope))
        .filter((r) =>
            matchesSearch(query.q, [
                'PRG-' + r.DisplayId,
                r.Name,
                r.Language,
                r.Type,
                r.userName,
                r.UserId,
                r.departmentName,
                r.LeadEmail,
                r.participants.join(' '),
                r.placeName,
                r.sessions.map((s: Row) => s.Name + ' ' + s.Type).join(' '),
            ]),
        );

    if (query.sortBy) {
        filtered.sort((a, b) =>
            compareQueryValues(
                programRequestSortValue(a, query.sortBy),
                programRequestSortValue(b, query.sortBy),
                query.sortDirection,
            ),
        );
    } else {
        filtered.sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    }
    return paginate(filtered, page, 25);
}

export async function getProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [requestRes, placesRes, departmentsRes, sessionsRes, participantsRes, commentsRes] =
        await Promise.all([
            client.from('program_requests').select('*').eq('id', id).single(),
            client.from('places').select('*'),
            client.from('departments').select('*'),
            client.from('program_sessions').select('*').eq('request_id', id).order('start_at'),
            client.from('program_request_participants').select('*').eq('request_id', id),
            client.from('comments').select('*').eq('program_request_id', id).order('created_at'),
        ]);
    const request = result(requestRes) as Row;
    const placesById = new Map((result(placesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const sessions = result(sessionsRes) as Row[];
    const participants = result(participantsRes) as Row[];
    const comments = result(commentsRes) as Row[];
    const profilesById = await profilesFor(admin, [
        request.requester_id,
        ...participants.map((x) => x.profile_id),
        ...comments.map((x) => x.author_id),
    ]);
    return programRequestDto(
        request,
        placesById,
        departmentsById,
        profilesById,
        sessions,
        participants,
        comments,
    );
}

const MAX_PROGRAM_SESSIONS = 100;

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
            name: String(session.name || ''),
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
    const [placesRes, departmentsRes, requests] = await Promise.all([
        admin.from('places').select('*').order('name'),
        admin.from('departments').select('*'),
        fetchAll((from, to) =>
            admin
                .from('program_requests')
                .select('*')
                .eq('status', 'approved')
                .order('id')
                .range(from, to),
        ),
    ]);
    const places = result(placesRes) as Row[];
    const placesById = new Map(places.map((p) => [p.id, p]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((d) => [d.id, d]));
    const requestIds = requests.map((r) => r.id);
    const [sessions, participants] = await Promise.all([
        fetchAllIn(requestIds, (chunk, from, to) =>
            admin
                .from('program_sessions')
                .select('*')
                .in('request_id', chunk)
                .order('start_at')
                .order('id')
                .range(from, to),
        ),
        fetchAllIn(requestIds, (chunk, from, to) =>
            admin
                .from('program_request_participants')
                .select('*')
                .in('request_id', chunk)
                .order('id')
                .range(from, to),
        ),
    ]);
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(
        admin,
        requests.map((r) => r.requester_id),
    );
    // The browser buckets sessions by *local* date, so a session in the first or
    // last hours of a local month can fall in the neighbouring UTC month. Pad
    // the window by a day each side (more than any UTC offset); the client only
    // draws sessions whose local date is inside the visible month.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const monthStart = Date.UTC(year, month - 1, 1) - DAY_MS;
    const monthEnd = Date.UTC(year, month, 1) + DAY_MS;
    const programs: Row[] = [];
    requests.forEach((request) => {
        const allSessions = sessionsByRequest.get(request.id) || [];
        const monthSessions = allSessions.filter((s) => {
            const start = Date.parse(s.start_at);
            const end = Date.parse(s.end_at);
            return (
                !Number.isNaN(start) && !Number.isNaN(end) && start < monthEnd && end > monthStart
            );
        });
        if (!monthSessions.length) return;
        // sessionStart/sessionEnd reflect the program's full schedule
        // (computed from allSessions); only the `sessions` field itself is
        // narrowed to this month, same split the source app made.
        const dto = programRequestDto(
            request,
            placesById,
            departmentsById,
            profilesById,
            allSessions,
            participantsByRequest.get(request.id) || [],
            [],
        );
        programs.push({ ...dto, sessions: monthSessions.map(programSessionDto), comments: [] });
    });
    return { places: places.map((p) => ({ Id: p.id, Name: p.name })), programs };
}

export async function createProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const approver = isApprover(actor);
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name =
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || '');
    const language = requireNonEmpty(input.language, 'Language is required.');
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
    await assertPlaceAvailability(admin, place?.id || null, sessions);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:create',
        requestId,
        userId,
        async () => {
            const created = result(
                await admin
                    .from('program_requests')
                    .insert({
                        name,
                        language,
                        program_type: type,
                        requester_id: requestedBy.id,
                        status: 'draft',
                        place_id: place ? place.id : null,
                        department_id: department.id,
                        lead_email: leadEmail,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            if (sessions.length) {
                const { error } = await admin
                    .from('program_sessions')
                    .insert(sessions.map((s) => ({ ...s, request_id: created.id })));
                if (error) throw new Error(error.message);
            }
            await replaceParticipants(
                admin,
                'program_request_participants',
                created.id,
                participantEmails,
            );
            return getProgramRequest(client, admin, created.id);
        },
    );
    return dto;
}

export async function updateProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const approver = isApprover(actor);
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name =
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || '');
    const language = requireNonEmpty(input.language, 'Language is required.');
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
    await assertPlaceAvailability(admin, place?.id || null, sessions, id);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);
    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:update:' + id,
        requestId,
        userId,
        async () => {
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
            requireUnchangedWorkflowStatus(input.status, String(existing.status));
            const updated = result(
                await admin
                    .from('program_requests')
                    .update({
                        name,
                        language,
                        program_type: type,
                        requester_id: requestedBy.id,
                        place_id: newPlaceId,
                        department_id: department.id,
                        lead_email: leadEmail,
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            const { error: deleteSessionsError } = await admin
                .from('program_sessions')
                .delete()
                .eq('request_id', id);
            if (deleteSessionsError) throw new Error(deleteSessionsError.message);
            if (sessions.length) {
                const { error } = await admin
                    .from('program_sessions')
                    .insert(sessions.map((s) => ({ ...s, request_id: id })));
                if (error) throw new Error(error.message);
            }
            await replaceParticipants(
                admin,
                programRequestKind.participantsTable,
                id,
                participantEmails,
            );
            return updated;
        },
    );
    return getProgramRequest(client, admin, dto.id);
}

const programRequestKind: RequestKindConfig = {
    kind: 'program',
    scope: 'program_request',
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
    requestId: string,
): Promise<Row> {
    return updateRequestParticipants(
        programRequestKind,
        client,
        admin,
        userId,
        id,
        input,
        requestId,
    );
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
    dedupeRequestId: string,
): Promise<string> {
    return performRequestAction(
        programRequestKind,
        client,
        admin,
        userId,
        id,
        action,
        note,
        dedupeRequestId,
    );
}

export function deleteProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    return deleteRequest(programRequestKind, client, admin, userId, id, requestId);
}
