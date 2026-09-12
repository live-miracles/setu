import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentProfile,
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
import {
    insertActionComment,
    parseParticipants,
    replaceParticipants,
    requireDepartment,
    requireRequesterProfile,
} from './inventory.ts';

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
    const [placesRes, departmentsRes, requestsRes, sessionsRes, participantsRes] =
        await Promise.all([
            client.from('places').select('*'),
            client.from('departments').select('*'),
            client.from('program_requests').select('*'),
            client.from('program_sessions').select('*').order('start_at'),
            client.from('program_request_participants').select('*'),
        ]);
    const placesById = new Map((result(placesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const requests = result(requestsRes) as Row[];
    const sessions = result(sessionsRes) as Row[];
    const participants = result(participantsRes) as Row[];
    const commentsByTarget = await commentsByTargetFor(client, admin, 'program_request_id');
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
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

const PROGRAM_REQUEST_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'cancelled'];

// `name` is only required when Type is 'Other' — every other program type
// carries its own name (matches PROGRAM_REQUIRED_FIELDS in Programs.ts).
export function validateProgramSessions(sessions: Row[], requireAtLeastOne = true): Row[] {
    const cleaned = (sessions || []).map((session) => {
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

export function sessionsOverlapWithBuffer(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
    bufferMs: number,
): boolean {
    const ls = Date.parse(leftStart);
    const le = Date.parse(leftEnd);
    const rs = Date.parse(rightStart);
    const re = Date.parse(rightEnd);
    if ([ls, le, rs, re].some((value) => Number.isNaN(value))) return false;
    return ls < re + bufferMs && rs < le + bufferMs;
}

export function rangesOverlap(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
): boolean {
    return leftStart < rightEnd && rightStart < leftEnd;
}

// A place can't host two approved programs within an hour of each other —
// ported from assertPlaceAvailability in Programs.ts.
export async function assertPlaceAvailability(
    admin: SupabaseClient,
    placeId: string | null,
    sessions: Row[],
    currentRequestId?: string,
): Promise<void> {
    if (!placeId || !sessions.length) return;
    const requests = result(
        await admin
            .from('program_requests')
            .select('id')
            .eq('place_id', placeId)
            .eq('status', 'approved'),
    ) as Row[];
    const otherIds = requests.map((r) => r.id).filter((id) => id !== currentRequestId);
    if (!otherIds.length) return;
    const otherSessions = result(
        await admin.from('program_sessions').select('start_at, end_at').in('request_id', otherIds),
    ) as Row[];
    const bufferMs = 60 * 60 * 1000;
    const conflict = otherSessions.some((other) =>
        sessions.some((session) =>
            sessionsOverlapWithBuffer(
                session.start_at,
                session.end_at,
                other.start_at,
                other.end_at,
                bufferMs,
            ),
        ),
    );
    if (conflict) {
        throw new Error(
            'This place is unavailable: its session is within one hour of another scheduled program.',
        );
    }
}

// Blocks with no place set apply to every non-approver submission.
export async function assertProgramSessionsNotBlockedForUser(
    admin: SupabaseClient,
    sessions: Row[],
): Promise<void> {
    const blocks = result(await admin.from('blocks').select('*').is('place_id', null)) as Row[];
    const blocking = blocks.find((block) =>
        sessions.some((session) =>
            rangesOverlap(session.start_at, session.end_at, block.start_at, block.end_at),
        ),
    );
    if (blocking) throw new Error('This request overlaps with a blocked time: ' + blocking.name);
}

export async function getAvailablePlaces(
    admin: SupabaseClient,
    currentRequestId: string,
    inputSessions: Row[],
): Promise<Row[]> {
    const sessions = (inputSessions || []).map((s) => ({
        start_at: s.startDateTime || '',
        end_at: s.endDateTime || '',
    }));
    const places = result(await admin.from('places').select('*').order('name')) as Row[];
    if (!sessions.length) return places.map((p) => ({ Id: p.id, Name: p.name }));
    const approved = result(
        await admin.from('program_requests').select('id, place_id').eq('status', 'approved'),
    ) as Row[];
    const relevantIds = approved.filter((r) => r.id !== currentRequestId).map((r) => r.id);
    const otherSessions = relevantIds.length
        ? (result(
              await admin
                  .from('program_sessions')
                  .select('request_id, start_at, end_at')
                  .in('request_id', relevantIds),
          ) as Row[])
        : [];
    const placeIdByRequest = new Map(approved.map((r) => [r.id, r.place_id]));
    const bufferMs = 60 * 60 * 1000;
    return places
        .filter(
            (place) =>
                !otherSessions.some(
                    (other) =>
                        placeIdByRequest.get(other.request_id) === place.id &&
                        sessions.some((session) =>
                            sessionsOverlapWithBuffer(
                                session.start_at,
                                session.end_at,
                                other.start_at,
                                other.end_at,
                                bufferMs,
                            ),
                        ),
                ),
        )
        .map((p) => ({ Id: p.id, Name: p.name }));
}

// The calendar is an org-wide events view, not a personal request list — every
// signed-in user sees every approved program regardless of role or whether
// they're the requester/a participant, so this reads through `admin` rather
// than the RLS-scoped `client` (which would narrow a plain `user` down to
// just their own requests, same as the request-detail pages already do).
export async function getCalendarMonth(
    admin: SupabaseClient,
    year: number,
    month: number,
): Promise<Row> {
    const [placesRes, departmentsRes, requestsRes] = await Promise.all([
        admin.from('places').select('*').order('name'),
        admin.from('departments').select('*'),
        admin.from('program_requests').select('*').eq('status', 'approved'),
    ]);
    const places = result(placesRes) as Row[];
    const placesById = new Map(places.map((p) => [p.id, p]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((d) => [d.id, d]));
    const requests = result(requestsRes) as Row[];
    const requestIds = requests.map((r) => r.id);
    const [sessionsRows, participantRows] = requestIds.length
        ? await Promise.all([
              admin.from('program_sessions').select('*').in('request_id', requestIds),
              admin.from('program_request_participants').select('*').in('request_id', requestIds),
          ])
        : [
              { data: [], error: null },
              { data: [], error: null },
          ];
    const sessions = result(sessionsRows) as Row[];
    const participants = result(participantRows) as Row[];
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(
        admin,
        requests.map((r) => r.requester_id),
    );
    const monthStart = Date.UTC(year, month - 1, 1);
    const monthEnd = Date.UTC(year, month, 1);
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
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name =
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || '');
    const language = requireNonEmpty(input.language, 'Language is required.');
    const requesterEmail = String(input.userId || actor.email).toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    if (requestedBy.email !== actor.email && !isApprover) {
        throw new Error('You cannot create a request on behalf of another user.');
    }
    if (input.placeId && !isApprover) throw new Error('Only an approver can assign a place.');
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
    const sessions = validateProgramSessions(input.sessions || []);
    await assertPlaceAvailability(admin, place?.id || null, sessions);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:create',
        requestId,
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
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
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
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);
    const requestedStatus = input.status as string | undefined;
    if (requestedStatus && PROGRAM_REQUEST_STATUSES.indexOf(requestedStatus) === -1) {
        throw new Error('Invalid status.');
    }

    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:update:' + id,
        requestId,
        async () => {
            const [existingRes, participantsRes] = await Promise.all([
                admin.from('program_requests').select('*').eq('id', id).single(),
                admin.from('program_request_participants').select('*').eq('request_id', id),
            ]);
            const existing = result(existingRes) as Row;
            const existingParticipants = result(participantsRes) as Row[];
            const isOwner =
                existing.requester_id === actor.id ||
                existingParticipants.some((p) => p.profile_id === actor.id);
            if (!(isApprover || (isOwner && existing.status === 'draft'))) {
                throw new Error('You are not allowed to edit this request.');
            }
            const newPlaceId = place ? place.id : null;
            if (existing.place_id !== newPlaceId && !isApprover) {
                throw new Error('Only an approver can change the assigned place.');
            }
            if (existing.requester_id !== requestedBy.id && !isApprover) {
                throw new Error('You cannot reassign the requester.');
            }
            const nextStatus = requestedStatus || existing.status;
            if (nextStatus !== existing.status && !isApprover) {
                throw new Error('Only an approver can change the status.');
            }
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
                        status: nextStatus,
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
            await replaceParticipants(admin, 'program_request_participants', id, participantEmails);
            if (nextStatus !== existing.status) {
                await insertActionComment(
                    admin,
                    'program_request',
                    id,
                    actor.id,
                    actor.name + ' changed the status to ' + nextStatus + '.',
                );
            }
            return updated;
        },
    );
    return getProgramRequest(client, admin, dto.id);
}

export async function updateProgramRequestParticipants(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const participantEmails = parseParticipants(input.participants);
    await withLockedDedupe(admin, 'program_request:participants:' + id, requestId, async () => {
        const [existingRes, participantsRes] = await Promise.all([
            admin.from('program_requests').select('*').eq('id', id).single(),
            admin.from('program_request_participants').select('*').eq('request_id', id),
        ]);
        const existing = result(existingRes) as Row;
        const existingParticipants = result(participantsRes) as Row[];
        const canEdit =
            isApprover ||
            existing.requester_id === actor.id ||
            existingParticipants.some((p) => p.profile_id === actor.id);
        if (!canEdit) throw new Error('You are not allowed to edit participants on this request.');
        await replaceParticipants(admin, 'program_request_participants', id, participantEmails);
        return null;
    });
    return getProgramRequest(client, admin, id);
}

// Ported from performProgramRequestAction in Programs.ts — same shape as
// performInventoryRequestAction minus the issue/return step.
export async function performProgramRequestAction(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    action: string,
    note: string,
    dedupeRequestId: string,
): Promise<string> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';

    const { result: nextStatus } = await withLockedDedupe(
        admin,
        'program_request:' + id + ':' + action,
        dedupeRequestId,
        async (): Promise<string> => {
            const [requestRes, participantsRes, sessionsRes] = await Promise.all([
                admin.from('program_requests').select('*').eq('id', id).single(),
                admin.from('program_request_participants').select('*').eq('request_id', id),
                admin.from('program_sessions').select('*').eq('request_id', id),
            ]);
            const request = result(requestRes) as Row;
            const participants = result(participantsRes) as Row[];
            const sessions = result(sessionsRes) as Row[];
            let computedStatus: string;
            const narrate = (message: string) =>
                insertActionComment(admin, 'program_request', id, actor.id, message);

            if (action === 'submit') {
                const isOwner =
                    request.requester_id === actor.id ||
                    participants.some((p) => p.profile_id === actor.id);
                if ((!isOwner && !isApprover) || request.status !== 'draft') {
                    throw new Error('Invalid transition.');
                }
                if (!sessions.length) throw new Error('At least one session is required.');
                if (!isApprover) await assertProgramSessionsNotBlockedForUser(admin, sessions);
                computedStatus = 'submitted';
                await narrate(actor.name + ' submitted this request.');
            } else {
                if (!isApprover) throw new Error('Approver access is required.');
                if (action === 'approve') {
                    if (request.status !== 'submitted') throw new Error('Invalid transition.');
                    if (!request.place_id)
                        throw new Error('A place must be assigned before approval.');
                    computedStatus = 'approved';
                    await narrate(
                        actor.name + ' approved this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'reject') {
                    if (request.status !== 'submitted') throw new Error('Invalid transition.');
                    computedStatus = 'rejected';
                    await narrate(
                        actor.name + ' rejected this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'cancel') {
                    if (['draft', 'submitted', 'approved'].indexOf(request.status) === -1) {
                        throw new Error('Invalid transition.');
                    }
                    if (request.status === 'approved') {
                        const hasFuture = sessions.some((s) => Date.parse(s.end_at) >= Date.now());
                        if (!hasFuture) throw new Error('Cannot cancel an approved past program.');
                    }
                    computedStatus = 'cancelled';
                    await narrate(
                        actor.name + ' cancelled this request.' + (note ? ' ' + note : ''),
                    );
                } else {
                    throw new Error('Unsupported action.');
                }
            }

            const { error } = await admin
                .from('program_requests')
                .update({ status: computedStatus })
                .eq('id', id);
            if (error) throw new Error(error.message);
            return computedStatus;
        },
    );
    return nextStatus;
}

export async function deleteProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    await withLockedDedupe(admin, 'program_request:delete:' + id, requestId, async () => {
        const [requestRes, participantsRes] = await Promise.all([
            admin.from('program_requests').select('*').eq('id', id).single(),
            admin.from('program_request_participants').select('*').eq('request_id', id),
        ]);
        const request = result(requestRes) as Row;
        const participants = result(participantsRes) as Row[];
        const owner =
            request.requester_id === actor.id ||
            participants.some((p) => p.profile_id === actor.id);
        if (!isApprover && !owner) throw new Error('You are not allowed to delete this request.');
        if (['draft', 'cancelled', 'rejected'].indexOf(request.status) === -1) {
            throw new Error('This request can no longer be deleted.');
        }
        const { error } = await admin.from('program_requests').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}
