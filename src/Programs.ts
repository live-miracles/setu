const PROGRAM_REQUESTS_PAGE_SIZE = 20;

// Status-change history (who/when) lives in Comments, same as
// InventoryRequests — see Comments.ts. No issue/return step here: a program
// request only ever moves draft -> submitted -> approved/rejected ->
// cancelled -> closed.
function buildProgramRequestDTO(
    request: ProgramRequest,
    sessionsByRequest: Record<string, ProgramSession[]>,
    placesById: Record<string, Place>,
    usersByEmail: Record<string, User>,
    commentsByRequestId: Record<string, CommentRecord[]>,
): ProgramRequestDTO {
    const place = placesById[request.PlaceId];
    const requester = usersByEmail[request.UserId];
    const comments = commentsFor(request.Id, commentsByRequestId, usersByEmail);
    const sessions = (sessionsByRequest[request.Id] || [])
        .slice()
        .sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime));
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        placeName: place ? place.Name : '',
        participants: parseParticipants(request.Participants),
        sessions,
        comments,
    });
}

function programRequestSortValue(
    request: ProgramRequestDTO,
    sortBy: ProgramRequestQuery['sortBy'],
): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'place') return request.placeName;
    if (sortBy === 'sessionStart') return request.sessions[0]?.StartDateTime || '';
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

function listProgramRequests(
    page: number,
    query: ProgramRequestQuery = {},
): Paginated<ProgramRequestDTO> {
    const actor = requireUser();
    const sessionsByRequest = groupBy(Tables.Sessions.readAll(), (s) => s.RequestId);
    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
    const statuses = query.statuses || [];
    const dtos = Tables.ProgramRequests.readAll()
        .filter((r) => canViewRequest(actor, r.UserId, parseParticipants(r.Participants)))
        .map((r) =>
            buildProgramRequestDTO(
                r,
                sessionsByRequest,
                placesById,
                usersByEmail,
                commentsByRequestId,
            ),
        )
        .filter((request) => statuses.length === 0 || statuses.indexOf(request.Status) !== -1)
        .filter((request) => !query.placeId || request.PlaceId === query.placeId)
        .filter((request) =>
            matchesSearch(query.q, [
                'PRG-' + request.DisplayId,
                request.Name,
                request.Type,
                request.userName,
                request.participants.join(' '),
                request.placeName,
                request.sessions.map((session) => session.Name + ' ' + session.Type).join(' '),
            ]),
        );
    const sortBy = query.sortBy;
    if (sortBy) {
        const direction = query.sortDirection || 'asc';
        dtos.sort((a, b) =>
            compareQueryValues(
                programRequestSortValue(a, sortBy),
                programRequestSortValue(b, sortBy),
                direction,
            ),
        );
    } else {
        dtos.sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    }
    return paginate(dtos, page, PROGRAM_REQUESTS_PAGE_SIZE);
}

function getProgramRequest(id: string): ProgramRequestDTO {
    const actor = requireUser();
    const request = Tables.ProgramRequests.findById(id);
    if (
        !request ||
        !canViewRequest(actor, request.UserId, parseParticipants(request.Participants))
    ) {
        throw new ValidationError('request_not_found');
    }
    return buildProgramRequestDTO(
        request,
        groupBy(Tables.Sessions.readAll(), (session) => session.RequestId),
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        groupCommentsByRequestId(Tables.Comments.readAll()),
    );
}

function checkProgramConflicts(
    placeId: string,
    sessions: ProgramSessionInput[],
    excludeRequestId = '',
): ProgramConflict[] {
    requireUser();
    if (!Tables.Places.findById(placeId)) throw new ValidationError('place_not_found');
    const candidateSessions = (sessions || []).filter(
        (session) =>
            Boolean(session.startDateTime) &&
            Boolean(session.endDateTime) &&
            session.endDateTime > session.startDateTime,
    );
    if (candidateSessions.length === 0) return [];

    const reservingRequests = Tables.ProgramRequests.findWhere(
        (request) =>
            request.Id !== excludeRequestId &&
            request.PlaceId === placeId &&
            request.Status === 'approved',
    );
    const requestsById = indexBy(reservingRequests, (request) => request.Id);
    const conflicts: ProgramConflict[] = [];
    Tables.Sessions.readAll().forEach((existing) => {
        const request = requestsById[existing.RequestId];
        if (!request) return;
        candidateSessions.forEach((candidate) => {
            if (
                candidate.startDateTime < existing.EndDateTime &&
                candidate.endDateTime > existing.StartDateTime
            ) {
                conflicts.push({
                    requestId: request.Id,
                    displayId: request.DisplayId,
                    requestName: request.Name,
                    sessionName: existing.Name,
                    startDateTime: existing.StartDateTime,
                    endDateTime: existing.EndDateTime,
                });
            }
        });
    });
    return conflicts;
}

function validateProgramRequestInput(input: CreateProgramRequestInput): {
    name: string;
    type: string;
    place: Place;
    sessions: { name: string; type: string; startDateTime: string; endDateTime: string }[];
    participants: string[];
    initialStatus: 'draft' | 'submitted';
} {
    const name = requireNonEmpty(input.name, 'Name is required.');
    const type = requireNonEmpty(input.type, 'Type is required.');
    const place = Tables.Places.findById(input.placeId);
    if (!place) throw new ValidationError('place_not_found');
    if (!input.sessions || input.sessions.length === 0)
        throw new ValidationError('At least one session is required.');
    const sessions = input.sessions.map((session) => {
        const sessionName = requireNonEmpty(session.name, 'Session name is required.');
        const sessionType = requireNonEmpty(session.type, 'Session type is required.');
        if (
            !session.startDateTime ||
            !session.endDateTime ||
            session.endDateTime <= session.startDateTime
        ) {
            throw new ValidationError('Session end must be after its start.');
        }
        return {
            name: sessionName,
            type: sessionType,
            startDateTime: session.startDateTime,
            endDateTime: session.endDateTime,
        };
    });
    return {
        name,
        type,
        place,
        sessions,
        participants: parseParticipants(input.participants),
        initialStatus: input.initialStatus === 'draft' ? 'draft' : 'submitted',
    };
}

function createProgramRequest(
    input: CreateProgramRequestInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const {
        name,
        type,
        place,
        sessions: sessionLines,
        participants,
        initialStatus,
    } = validateProgramRequestInput(input);

    const { result } = withLockedDedupe('program_request:create', requestId, () => {
        const created = Tables.ProgramRequests.insert({
            DisplayId: getNextDisplayId('program_request'),
            Name: name,
            Type: type,
            UserId: actor.Email,
            Status: initialStatus,
            PlaceId: place.Id,
            Participants: formatParticipants(participants),
        });
        const createdSessions = sessionLines.map((session) =>
            Tables.Sessions.insert({
                Name: session.name,
                Type: session.type,
                RequestId: created.Id,
                StartDateTime: session.startDateTime,
                EndDateTime: session.endDateTime,
            }),
        );
        const comment = insertActionComment(
            'program',
            created.Id,
            actor.Email,
            initialStatus === 'draft'
                ? actor.Name + ' saved this request as a draft.'
                : actor.Name + ' submitted this request.',
        );
        return { request: created, sessions: createdSessions, comment };
    });
    const { request, sessions: createdSessions, comment } = result;

    if (initialStatus === 'submitted') {
        const approvers = Tables.Users.findWhere((u) => canApprove(u) && u.Email !== actor.Email);
        approvers.forEach((approver) => {
            sendNotificationEmail(
                approver.Email,
                'program:' + request.Id + ':submitted',
                'New program request: PRG-' + request.DisplayId,
                actor.Name + ' requested a program: ' + request.Name + '.',
                '?section=programs',
            );
        });
    }

    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    return buildProgramRequestDTO(
        request,
        { [request.Id]: createdSessions },
        placesById,
        indexBy([actor], (u) => u.Email),
        { [request.Id]: [comment] },
    );
}

function updateProgramRequestDraft(
    id: string,
    input: CreateProgramRequestInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const { name, type, place, sessions, participants, initialStatus } =
        validateProgramRequestInput(input);
    const { result } = withLockedDedupe('program_request:update_draft:' + id, requestId, () => {
        const existing = Tables.ProgramRequests.findById(id);
        if (!existing) throw new ValidationError('request_not_found');
        const owners = parseParticipants(existing.Participants);
        if (existing.UserId !== actor.Email && owners.indexOf(actor.Email) === -1) {
            throw new AuthorizationError('not_request_owner');
        }
        if (existing.Status !== 'draft') throw new ValidationError('draft_required');
        const updated = Tables.ProgramRequests.updateById(id, {
            Name: name,
            Type: type,
            PlaceId: place.Id,
            Participants: formatParticipants(participants),
            Status: initialStatus,
        });
        Tables.Sessions.findWhere((session) => session.RequestId === id).forEach((session) =>
            Tables.Sessions.deleteById(session.Id),
        );
        const updatedSessions = sessions.map((session) =>
            Tables.Sessions.insert({
                Name: session.name,
                Type: session.type,
                RequestId: id,
                StartDateTime: session.startDateTime,
                EndDateTime: session.endDateTime,
            }),
        );
        const comment = insertActionComment(
            'program',
            id,
            actor.Email,
            initialStatus === 'draft'
                ? actor.Name + ' updated this draft.'
                : actor.Name + ' submitted this request.',
        );
        return { request: updated, sessions: updatedSessions, comment };
    });

    if (initialStatus === 'submitted') {
        Tables.Users.findWhere((user) => canApprove(user) && user.Email !== actor.Email).forEach(
            (approver) =>
                sendNotificationEmail(
                    approver.Email,
                    'program:' + id + ':submitted:' + requestId,
                    'Program request submitted: PRG-' + result.request.DisplayId,
                    actor.Name + ' submitted ' + result.request.Name + '.',
                    '?section=programs&program=' + id,
                ),
        );
    }
    return buildProgramRequestDTO(
        result.request,
        { [id]: result.sessions },
        indexBy(Tables.Places.readAll(), (item) => item.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        { [id]: Tables.Comments.findWhere((comment) => comment.ProgramRequestId === id) },
    );
}

// Ported from the source app's `perform_program_request_action` Postgres
// function — same shape as performInventoryRequestAction in Inventory.ts
// minus the issue/return step.
function performProgramRequestAction(
    requestId: string,
    action: ProgramRequestAction,
    note: string,
    dedupeRequestId: string,
): ProgramRequestStatus {
    const actor = requireUser();

    const { duplicate, result: nextStatus } = withLockedDedupe(
        'program_request:' + requestId + ':' + action,
        dedupeRequestId,
        (): ProgramRequestStatus => {
            const request = Tables.ProgramRequests.findById(requestId);
            if (!request) throw new ValidationError('request_not_found');
            let computedStatus: ProgramRequestStatus;

            if (action === 'submit') {
                const participants = parseParticipants(request.Participants);
                const isOwner =
                    request.UserId === actor.Email || participants.indexOf(actor.Email) !== -1;
                if (!isOwner || request.Status !== 'draft')
                    throw new ValidationError('invalid_transition');
                computedStatus = 'submitted';
                Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                insertActionComment(
                    'program',
                    requestId,
                    actor.Email,
                    actor.Name + ' submitted this request.',
                );
            } else {
                if (!canApprove(actor)) throw new AuthorizationError('approver_required');

                if (action === 'approve') {
                    if (request.Status !== 'submitted')
                        throw new ValidationError('invalid_transition');
                    const requestSessions = Tables.Sessions.findWhere(
                        (session) => session.RequestId === requestId,
                    );
                    const conflicts = checkProgramConflicts(
                        request.PlaceId,
                        requestSessions.map((session) => ({
                            name: session.Name,
                            type: session.Type,
                            startDateTime: session.StartDateTime,
                            endDateTime: session.EndDateTime,
                        })),
                        requestId,
                    );
                    if (conflicts.length > 0) throw new ValidationError('program_place_conflict');
                    computedStatus = 'approved';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' approved this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'reject') {
                    requireMinLength(
                        note,
                        3,
                        'A note of at least 3 characters is required to reject.',
                    );
                    if (request.Status !== 'submitted')
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'rejected';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' rejected this request. ' + note,
                    );
                } else if (action === 'cancel') {
                    requireMinLength(
                        note,
                        3,
                        'A note of at least 3 characters is required to cancel.',
                    );
                    if (['draft', 'submitted', 'approved'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'cancelled';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' cancelled this request. ' + note,
                    );
                } else if (action === 'close') {
                    if (['approved', 'rejected', 'cancelled'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'closed';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' closed this request.' + (note ? ' ' + note : ''),
                    );
                } else {
                    throw new ValidationError('unsupported_action');
                }
            }

            return computedStatus;
        },
    );

    if (!duplicate) {
        notifyOnProgramRequestAction(requestId, action, actor, nextStatus, dedupeRequestId);
    }
    return nextStatus;
}

function notifyOnProgramRequestAction(
    requestId: string,
    action: ProgramRequestAction,
    actor: User,
    newStatus: ProgramRequestStatus,
    dedupeRequestId: string,
): void {
    const request = Tables.ProgramRequests.findById(requestId);
    if (!request) return;
    const owner: RequestOwner = {
        kind: 'program',
        displayId: request.DisplayId,
        userId: request.UserId,
        participants: parseParticipants(request.Participants),
    };
    const eventKey = 'program:' + requestId + ':' + action + ':' + dedupeRequestId;
    requestOwnerRecipients(owner, actor.Email).forEach((email) => {
        sendNotificationEmail(
            email,
            eventKey,
            'PRG-' + request.DisplayId + ' ' + newStatus,
            actor.Name + ' ' + action + 'd your program request.',
            '?section=programs',
        );
    });
}
