const PROGRAM_REQUESTS_PAGE_SIZE = 20;

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

function cleanProgramSessions(input: ProgramSessionInput[]): ProgramSession[] {
    if (!input || input.length === 0)
        throw new ValidationError('At least one session is required.');
    return input.map((session) => {
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
    commentsByRequestId: Record<string, CommentRecord[]>,
): ProgramRequestDTO {
    const place = placesById[request.PlaceId];
    const requester = usersByEmail[request.UserId];
    const department = departmentsById[request.DepartmentId];
    const comments = commentsFor(request.Id, commentsByRequestId, usersByEmail);
    const sessions = parseProgramSessionsJson(request.SessionsJson)
        .slice()
        .sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime));
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        placeName: place ? place.Name : '',
        departmentName: department ? department.Name : '',
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

function listProgramRequests(
    page: number,
    query: ProgramRequestQuery = {},
): Paginated<ProgramRequestDTO> {
    const actor = requireUser();
    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const departmentsById = indexBy(Tables.Departments.readAll(), (d) => d.Id);
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
    const statuses = query.statuses || [];
    const dtos = Tables.ProgramRequests.readAll()
        .filter((r) => canViewRequest(actor, r.UserId, parseParticipants(r.Participants)))
        .map((r) =>
            buildProgramRequestDTO(
                r,
                placesById,
                usersByEmail,
                departmentsById,
                commentsByRequestId,
            ),
        )
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
        groupCommentsByRequestId(Tables.Comments.readAll()),
    );
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
    const place = input.placeId ? Tables.Places.findById(input.placeId) : null;
    if (input.placeId && !place) throw new ValidationError('place_not_found');
    const sessionLines = cleanProgramSessions(input.sessions);
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
        });
        const comment = insertActionComment(
            'program',
            created.Id,
            actor.Email,
            actor.Name + ' saved this draft.',
            false,
        );
        return { request: created, comment };
    });
    const { request, comment } = result;

    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    return buildProgramRequestDTO(
        request,
        placesById,
        indexBy([actor], (u) => u.Email),
        { [department.Id]: department },
        { [request.Id]: [comment] },
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
    const sessionLines = cleanProgramSessions(input.sessions);
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
        const comment = insertActionComment(
            'program',
            id,
            actor.Email,
            actor.Name + ' updated this request.',
            false,
        );
        return { request: updated, comment };
    });

    return buildProgramRequestDTO(
        result.request,
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
        { [id]: [result.comment] },
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
                if (!isOwner || request.Status !== 'draft')
                    throw new ValidationError('invalid_transition');
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
                } else {
                    throw new ValidationError('unsupported_action');
                }
            }

            return computedStatus;
        },
    );

    return nextStatus;
}
