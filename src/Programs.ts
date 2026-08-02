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

function listProgramRequests(page: number): Paginated<ProgramRequestDTO> {
    const actor = requireUser();
    const sessionsByRequest = groupBy(Tables.Sessions.readAll(), (s) => s.RequestId);
    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
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
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    return paginate(dtos, page, PROGRAM_REQUESTS_PAGE_SIZE);
}

function createProgramRequest(
    input: CreateProgramRequestInput,
    requestId: string,
): ProgramRequestDTO {
    const actor = requireUser();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const type = requireNonEmpty(input.type, 'Type is required.');
    const place = Tables.Places.findById(input.placeId);
    if (!place) throw new ValidationError('place_not_found');
    if (!input.sessions || input.sessions.length === 0)
        throw new ValidationError('At least one session is required.');
    const sessionLines = input.sessions.map((session) => {
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
    const participants = parseParticipants(input.participants);

    const { result } = withLockedDedupe('program_request:create', requestId, () => {
        const created = Tables.ProgramRequests.insert({
            DisplayId: getNextDisplayId('program_request'),
            Name: name,
            Type: type,
            UserId: actor.Email,
            Status: 'submitted',
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
            actor.Name + ' submitted this request.',
        );
        return { request: created, sessions: createdSessions, comment };
    });
    const { request, sessions: createdSessions, comment } = result;

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

    const placesById = indexBy(Tables.Places.readAll(), (p) => p.Id);
    return buildProgramRequestDTO(
        request,
        { [request.Id]: createdSessions },
        placesById,
        indexBy([actor], (u) => u.Email),
        { [request.Id]: [comment] },
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
