const PROGRAM_REQUESTS_PAGE_SIZE = 25;

const PROGRAM_REQUIRED_FIELDS: Record<
    string,
    (input: CreateProgramRequestInput | UpdateProgramRequestInput) => boolean
> = {
    name: (input) => input.type === 'Other',
    language: () => true,
    type: () => true,
    departmentId: () => true,
    leadEmail: () => true,
};

const PROGRAM_FIELD_LABELS: Record<string, string> = {
    name: 'Program title',
    language: 'Language',
    type: 'Program type',
    departmentId: 'Department',
    leadEmail: 'Lead email',
};

const SESSION_REQUIRED_FIELDS: Record<string, (session: ProgramSessionInput) => boolean> = {
    type: () => true,
    startDateTime: () => true,
    endDateTime: () => true,
};

const SESSION_FIELD_LABELS: Record<string, string> = {
    type: 'Session type',
    startDateTime: 'Session start',
    endDateTime: 'Session end',
};

function programInputValue(
    input: CreateProgramRequestInput | UpdateProgramRequestInput,
    field: string,
): string {
    return String((input as unknown as Record<string, unknown>)[field] || '');
}

function cleanProgramField(
    input: CreateProgramRequestInput | UpdateProgramRequestInput,
    field: string,
): string {
    const value = programInputValue(input, field);
    return PROGRAM_REQUIRED_FIELDS[field]?.(input)
        ? requireNonEmpty(value, PROGRAM_FIELD_LABELS[field] + ' is required.')
        : value;
}

function cleanSessionField(session: ProgramSessionInput, field: string): string {
    const value = String((session as unknown as Record<string, unknown>)[field] || '');
    return SESSION_REQUIRED_FIELDS[field]?.(session)
        ? requireNonEmpty(value, SESSION_FIELD_LABELS[field] + ' is required.')
        : value;
}

function cleanProgramSessions(
    input: ProgramSessionInput[],
    requireAtLeastOne = true,
): ProgramSession[] {
    const sessions = (input || []).map((session) => {
        const sessionType = cleanSessionField(session, 'type');
        const startDateTime = cleanSessionField(session, 'startDateTime');
        const endDateTime = cleanSessionField(session, 'endDateTime');
        const startMs = Date.parse(startDateTime);
        const endMs = Date.parse(endDateTime);
        if (
            !startDateTime ||
            !endDateTime ||
            Number.isNaN(startMs) ||
            Number.isNaN(endMs) ||
            endMs <= startMs
        ) {
            throw new ValidationError('Session end must be after its start.');
        }
        if (endMs - startMs >= 24 * 60 * 60 * 1000) {
            throw new ValidationError('Sessions must be shorter than 24 hours.');
        }
        return {
            Name: cleanSessionField(session, 'name'),
            Type: sessionType,
            StartDateTime: startDateTime,
            EndDateTime: endDateTime,
        };
    });
    if (requireAtLeastOne && sessions.length === 0) {
        throw new ValidationError('At least one session is required.');
    }
    return sessions;
}

// Status-change history (who/when) lives in Comments, same as
// InventoryRequests — see Comments.ts. No issue/return/close step here: a
// program request only ever moves draft -> submitted -> approved/rejected,
// with cancellation available before a final decision.
function buildProgramRequestDTO(
    request: ProgramRequest,
    placesById: Record<string, Place>,
    usersByEmail: Record<string, User>,
    departmentsById: Record<string, Department>,
    includeSessions = true,
): ProgramRequestDTO {
    const place = placesById[request.PlaceId];
    const requester = usersByEmail[request.UserId];
    const department = departmentsById[request.DepartmentId];
    const comments = parseCommentsJson(request.CommentsJson, request.Id).map((comment) =>
        buildCommentDTO(comment, usersByEmail),
    );
    const sessions = parseProgramSessionsJson(request.SessionsJson)
        .slice()
        .sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime));
    const validSessionDates = sessions
        .flatMap((session) => [session.StartDateTime, session.EndDateTime])
        .filter((value) => !Number.isNaN(Date.parse(value)))
        .sort();
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        placeName: place ? place.Name : '',
        departmentName: department ? department.Name : '',
        participants: parseParticipants(request.Participants),
        sessions: includeSessions ? sessions : [],
        sessionStart: validSessionDates[0] || '',
        sessionEnd: validSessionDates[validSessionDates.length - 1] || '',
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
    if (sortBy === 'sessionStart') return request.sessionStart;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

function matchesProgramDateScope(
    request: ProgramRequestDTO,
    dateScope: ProgramRequestQuery['dateScope'],
): boolean {
    if (!dateScope) return true;
    const nowIso = new Date().toISOString();
    const hasOngoingOrFutureSession = request.sessions.some(
        (session) => session.EndDateTime >= nowIso,
    );
    return dateScope === 'past' ? !hasOngoingOrFutureSession : hasOngoingOrFutureSession;
}

function rangesOverlap(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
): boolean {
    return leftStart < rightEnd && rightStart < leftEnd;
}

function placeAllowsOverlap(place: Place): boolean {
    return (
        place.AllowOverlap === true ||
        ['true', 'yes', '1'].indexOf(String(place.AllowOverlap).toLowerCase()) !== -1
    );
}

function sessionsAreWithinPlaceBuffer(left: ProgramSession, right: ProgramSession): boolean {
    const leftStart = Date.parse(left.StartDateTime);
    const leftEnd = Date.parse(left.EndDateTime);
    const rightStart = Date.parse(right.StartDateTime);
    const rightEnd = Date.parse(right.EndDateTime);
    if ([leftStart, leftEnd, rightStart, rightEnd].some((value) => Number.isNaN(value))) {
        return false;
    }
    const bufferMs = 60 * 60 * 1000;
    return leftStart < rightEnd + bufferMs && rightStart < leftEnd + bufferMs;
}

function assertPlaceAvailability(
    place: Place | null,
    sessions: ProgramSession[],
    currentRequestId?: string,
): void {
    if (!place || placeAllowsOverlap(place) || !sessions.length) return;
    const conflict = Tables.ProgramRequests.readAll()
        .filter(
            (request) =>
                request.Id !== currentRequestId &&
                request.Status === 'approved' &&
                request.PlaceId === place.Id,
        )
        .find((request) =>
            parseProgramSessionsJson(request.SessionsJson).some((otherSession) =>
                sessions.some((session) => sessionsAreWithinPlaceBuffer(session, otherSession)),
            ),
        );
    if (conflict) {
        throw new ValidationError(
            'This place is unavailable: its session is within one hour of another scheduled program.',
        );
    }
}

function assertProgramSessionsNotBlockedForUser(request: ProgramRequest): void {
    const sessions = parseProgramSessionsJson(request.SessionsJson);
    const blockingBlock = Tables.Blocks.readAll()
        .filter((block) => !block.Place)
        .find((block) =>
            sessions.some((session) =>
                rangesOverlap(
                    session.StartDateTime,
                    session.EndDateTime,
                    block.StartDateTime,
                    block.EndDateTime,
                ),
            ),
        );
    if (blockingBlock) {
        throw new ValidationError(
            'This request overlaps with a blocked time: ' + blockingBlock.Name,
        );
    }
}

function hasOngoingOrFutureProgramSession(request: ProgramRequest): boolean {
    return parseProgramSessionsJson(request.SessionsJson).some(
        (session) => Date.parse(session.EndDateTime) >= Date.now(),
    );
}

function listProgramRequests(
    page: number,
    query: ProgramRequestQuery = {},
): Paginated<ProgramRequestDTO> {
    const actor = requireUser();
    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const departmentsById = indexBy(Tables.Departments.readAll(), (d) => d.Id);
    const statuses = query.statuses || [];
    const dtos = Tables.ProgramRequests.readAll()
        .filter((r) => canViewRequest(actor, r.UserId, parseParticipants(r.Participants)))
        .map((r) => buildProgramRequestDTO(r, placesById, usersByEmail, departmentsById, true))
        .filter((request) => statuses.length === 0 || statuses.indexOf(request.Status) !== -1)
        .filter((request) => !query.placeId || request.PlaceId === query.placeId)
        .filter((request) => matchesProgramDateScope(request, query.dateScope))
        .filter((request) =>
            matchesSearch(query.q, [
                'PRG-' + request.DisplayId,
                request.Name,
                request.Language,
                request.Type,
                request.userName,
                request.UserId,
                request.departmentName,
                request.LeadEmail,
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
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
    );
}

function getCalendarMonth(year: number, month: number): CalendarMonthPayload {
    const actor = requireUser();
    const places = Tables.Places.readAll();
    const placesById = indexBy(places, (place) => place.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (user) => user.Email);
    const departmentsById = indexBy(Tables.Departments.readAll(), (department) => department.Id);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const programs = Tables.ProgramRequests.readAll()
        .filter((request) => request.Status === 'approved')
        .filter((request) =>
            canViewRequest(actor, request.UserId, parseParticipants(request.Participants)),
        )
        .map((request) => {
            const sessions = parseProgramSessionsJson(request.SessionsJson).filter((session) => {
                const start = Date.parse(session.StartDateTime);
                const end = Date.parse(session.EndDateTime);
                return (
                    !Number.isNaN(start) &&
                    !Number.isNaN(end) &&
                    start < monthEnd.getTime() &&
                    end > monthStart.getTime()
                );
            });
            if (!sessions.length) return null;
            const dto = buildProgramRequestDTO(
                request,
                placesById,
                usersByEmail,
                departmentsById,
                false,
            );
            return Object.assign({}, dto, { sessions, comments: [] as CommentDTO[] });
        })
        .filter((program): program is ProgramRequestDTO => Boolean(program));
    return { places, programs };
}

function getAvailablePlaces(requestId: string, inputSessions: ProgramSessionInput[]): Place[] {
    requireUser();
    const sessions = (inputSessions || []).map((session) => ({
        Name: session.name || '',
        Type: session.type || '',
        StartDateTime: session.startDateTime || '',
        EndDateTime: session.endDateTime || '',
    }));
    return Tables.Places.readAll().filter((place) => {
        if (placeAllowsOverlap(place) || !sessions.length) return true;
        return !Tables.ProgramRequests.readAll()
            .filter(
                (request) =>
                    request.Id !== requestId &&
                    request.Status === 'approved' &&
                    request.PlaceId === place.Id,
            )
            .some((request) =>
                parseProgramSessionsJson(request.SessionsJson).some((otherSession) =>
                    sessions.some((session) => sessionsAreWithinPlaceBuffer(session, otherSession)),
                ),
            );
    });
}

function createProgramRequest(
    input: CreateProgramRequestInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const type = cleanProgramField(input, 'type');
    const name = cleanProgramField(input, 'name');
    const language = cleanProgramField(input, 'language');
    const userId = (input.userId || actor.Email).toLowerCase();
    const requestedBy = Tables.Users.findById(userId);
    if (!requestedBy) throw new ValidationError('requester_not_found');
    if (requestedBy.Email !== actor.Email && !canApprove(actor)) {
        throw new AuthorizationError('requester_edit_not_allowed');
    }
    if (input.placeId && !canApprove(actor)) {
        throw new AuthorizationError('place_edit_not_allowed');
    }
    const place = input.placeId ? Tables.Places.findById(input.placeId) : null;
    if (input.placeId && !place) throw new ValidationError('place_not_found');
    const sessionLines = cleanProgramSessions(input.sessions);
    assertPlaceAvailability(place, sessionLines);
    const participants = parseParticipants(input.participants);
    const departmentId = cleanProgramField(input, 'departmentId');
    const department = Tables.Departments.findById(departmentId);
    if (!department) throw new ValidationError('department_not_found');
    const leadEmail = cleanProgramField(input, 'leadEmail').toLowerCase();

    const { result } = withLockedDedupe('program_request:create', requestId, () => {
        const created = Tables.ProgramRequests.insert({
            DisplayId: getNextDisplayId('program_request'),
            Name: name,
            Language: language,
            Type: type,
            UserId: requestedBy.Email,
            Status: 'draft',
            PlaceId: place ? place.Id : '',
            DepartmentId: department.Id,
            LeadEmail: leadEmail,
            Participants: formatParticipants(participants),
            SessionsJson: stringifyProgramSessions(sessionLines),
            CommentsJson: '[]',
        });
        return { request: created };
    });
    const { request } = result;

    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    return buildProgramRequestDTO(
        request,
        placesById,
        indexBy([actor], (u) => u.Email),
        { [department.Id]: department },
    );
}

function updateProgramRequest(
    id: string,
    input: UpdateProgramRequestInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const type = cleanProgramField(input, 'type');
    const name = cleanProgramField(input, 'name');
    const language = cleanProgramField(input, 'language');
    const userId = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = Tables.Users.findById(userId);
    if (!requestedBy) throw new ValidationError('requester_not_found');
    const place = input.placeId ? Tables.Places.findById(input.placeId) : null;
    if (input.placeId && !place) throw new ValidationError('place_not_found');
    // Existing legacy programs may have no sessions. They remain editable;
    // new programs still require at least one session in createProgramRequest.
    const sessionLines = cleanProgramSessions(input.sessions, false);
    assertPlaceAvailability(place, sessionLines, id);
    const participants = parseParticipants(input.participants);
    const departmentId = cleanProgramField(input, 'departmentId');
    const department = Tables.Departments.findById(departmentId);
    if (!department) throw new ValidationError('department_not_found');
    const leadEmail = cleanProgramField(input, 'leadEmail').toLowerCase();

    const { result } = withLockedDedupe('program_request:update:' + id, requestId, () => {
        const request = Tables.ProgramRequests.findById(id);
        if (!request) throw new ValidationError('request_not_found');
        const requestParticipants = parseParticipants(request.Participants);
        const isOwner =
            request.UserId === actor.Email || requestParticipants.indexOf(actor.Email) !== -1;
        if (!(canApprove(actor) || (isOwner && request.Status === 'draft'))) {
            throw new AuthorizationError('edit_not_allowed');
        }
        if (['cancelled', 'rejected'].indexOf(request.Status) !== -1) {
            throw new ValidationError('request_not_editable');
        }
        if (request.PlaceId !== (place ? place.Id : '') && !canApprove(actor)) {
            throw new AuthorizationError('place_edit_not_allowed');
        }
        if (request.UserId !== requestedBy.Email && !canApprove(actor)) {
            throw new AuthorizationError('requester_edit_not_allowed');
        }

        const updated = Tables.ProgramRequests.updateById(id, {
            Name: name,
            Language: language,
            Type: type,
            UserId: requestedBy.Email,
            PlaceId: place ? place.Id : '',
            DepartmentId: department.Id,
            LeadEmail: leadEmail,
            Participants: formatParticipants(participants),
            SessionsJson: stringifyProgramSessions(sessionLines),
        });
        return { request: updated };
    });

    return buildProgramRequestDTO(
        result.request,
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
    );
}

function updateProgramRequestParticipants(
    id: string,
    input: UpdateRequestParticipantsInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const participants = parseParticipants(input.participants);
    const { result } = withLockedDedupe('program_request:participants:' + id, requestId, () => {
        const request = Tables.ProgramRequests.findById(id);
        if (!request) throw new ValidationError('request_not_found');
        const requestParticipants = parseParticipants(request.Participants);
        const canEdit =
            canApprove(actor) ||
            request.UserId === actor.Email ||
            requestParticipants.indexOf(actor.Email) !== -1;
        if (!canEdit) throw new AuthorizationError('participants_edit_not_allowed');
        return {
            request: Tables.ProgramRequests.updateById(id, {
                Participants: formatParticipants(participants),
            }),
        };
    });
    return buildProgramRequestDTO(
        result.request,
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
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

    const { result: nextStatus } = withLockedDedupe(
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
                if ((!isOwner && !canApprove(actor)) || request.Status !== 'draft')
                    throw new ValidationError('invalid_transition');
                if (parseProgramSessionsJson(request.SessionsJson).length === 0) {
                    throw new ValidationError('At least one session is required.');
                }
                if (!canApprove(actor)) assertProgramSessionsNotBlockedForUser(request);
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
                    computedStatus = 'approved';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' approved this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'reject') {
                    if (request.Status !== 'submitted')
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'rejected';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' rejected this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'cancel') {
                    if (['draft', 'submitted', 'approved'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    if (
                        request.Status === 'approved' &&
                        !hasOngoingOrFutureProgramSession(request)
                    ) {
                        throw new ValidationError('Cannot cancel an approved past program.');
                    }
                    computedStatus = 'cancelled';
                    Tables.ProgramRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'program',
                        requestId,
                        actor.Email,
                        actor.Name + ' cancelled this request.' + (note ? ' ' + note : ''),
                    );
                } else {
                    throw new ValidationError('unsupported_action');
                }
            }

            return computedStatus;
        },
    );

    return nextStatus;
}

function deleteProgramRequest(id: string, requestId: string): void {
    const actor = requireUser();
    withLockedDedupe('program_request:delete', requestId, () => {
        const request = Tables.ProgramRequests.findById(id);
        if (!request) throw new ValidationError('request_not_found');
        const participants = parseParticipants(request.Participants);
        const owner = request.UserId === actor.Email || participants.indexOf(actor.Email) !== -1;
        if (!canApprove(actor) && !owner) throw new AuthorizationError('delete_not_allowed');
        if (request.Status !== 'draft' && request.Status !== 'cancelled') {
            throw new ValidationError('request_not_deletable');
        }
        Tables.ProgramRequests.deleteById(id);
        return null;
    });
}
