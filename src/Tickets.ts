const TICKETS_PAGE_SIZE = 20;

function buildTicketDTO(
    ticket: Ticket,
    usersByEmail: Record<string, User>,
    placesById: Record<string, Place> = {},
    commentsByTicketId: Record<string, CommentRecord[]> = {},
): TicketDTO {
    const assignee = ticket.AssigneeId ? usersByEmail[ticket.AssigneeId] : undefined;
    const reporterId = ticket.ReporterId || '';
    const reporter = reporterId ? usersByEmail[reporterId] : undefined;
    const place = ticket.PlaceId ? placesById[ticket.PlaceId] : undefined;
    return Object.assign({}, ticket, {
        assigneeName: assignee ? assignee.Name : '',
        ReporterId: reporterId,
        CreatedAt: ticket.CreatedAt || '',
        UpdatedAt: ticket.UpdatedAt || ticket.CreatedAt || '',
        Priority: ticket.Priority || '',
        PlaceId: ticket.PlaceId || '',
        reporterName: reporter ? reporter.Name : '',
        placeName: place ? place.Name : '',
        comments: (commentsByTicketId[ticket.Id] || [])
            .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp))
            .map((comment) => buildCommentDTO(comment, usersByEmail)),
    });
}

function ticketCommentsById(): Record<string, CommentRecord[]> {
    return groupBy(
        Tables.Comments.findWhere((comment) => Boolean(comment.TicketId)),
        (comment) => comment.TicketId,
    );
}

function insertTicketComment(ticketId: string, actorId: string, message: string): CommentRecord {
    return Tables.Comments.insert({
        Timestamp: nowIso(),
        ProgramRequestId: '',
        InventoryRequestId: '',
        UserId: actorId,
        Message: message,
        TicketId: ticketId,
    });
}

// Tickets are hidden from the `user` role entirely (canUseTickets in
// Auth.ts): no listing, no reporting, no being assigned one. Every entry
// point below closes that off rather than relying on the frontend hiding
// the section.
function requireTicketAccess(): User {
    const actor = requireUser();
    if (!canUseTickets(actor)) {
        throw new AuthorizationError('Tickets are not available for your role.');
    }
    return actor;
}

function ticketSortValue(ticket: TicketDTO, sortBy: TicketQuery['sortBy']): string | number {
    if (sortBy === 'title') return ticket.Title;
    if (sortBy === 'status') return ticket.Status;
    if (sortBy === 'assignee') return ticket.assigneeName;
    return ticket.DisplayId;
}

function listTickets(page: number, query: TicketQuery = {}): Paginated<TicketDTO> {
    requireTicketAccess();
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const placesById = indexBy(Tables.Places.readAll(), (place) => place.Id);
    const commentsByTicketId = ticketCommentsById();
    const statuses = query.statuses || [];
    const dtos = Tables.Tickets.readAll()
        .map((t) => buildTicketDTO(t, usersByEmail, placesById, commentsByTicketId))
        .filter((ticket) => statuses.length === 0 || statuses.indexOf(ticket.Status) !== -1)
        .filter((ticket) => {
            if (!query.assigneeId) return true;
            return query.assigneeId === '__unassigned__'
                ? !ticket.AssigneeId
                : ticket.AssigneeId === query.assigneeId;
        })
        .filter((ticket) =>
            matchesSearch(query.q, [
                'TKT-' + ticket.DisplayId,
                ticket.Title,
                ticket.Description,
                ticket.assigneeName,
                ticket.reporterName,
                ticket.placeName,
                ticket.Priority,
            ]),
        );
    const sortBy = query.sortBy;
    if (sortBy) {
        const direction = query.sortDirection || 'asc';
        dtos.sort((a, b) =>
            compareQueryValues(ticketSortValue(a, sortBy), ticketSortValue(b, sortBy), direction),
        );
    } else {
        dtos.sort((a, b) => b.DisplayId - a.DisplayId);
    }
    return paginate(dtos, page, TICKETS_PAGE_SIZE);
}

function getTicket(id: string): TicketDTO {
    requireTicketAccess();
    const ticket = Tables.Tickets.findById(id);
    if (!ticket) throw new ValidationError('ticket_not_found');
    return buildTicketDTO(
        ticket,
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        ticketCommentsById(),
    );
}

function createTicket(input: CreateTicketInput, requestId: string): TicketDTO {
    const actor = requireTicketAccess();
    const title = requireNonEmpty(input.title, 'Title is required.');
    const priority: TicketPriority = input.priority || 'normal';
    if (['low', 'normal', 'high', 'urgent'].indexOf(priority) === -1) {
        throw new ValidationError('invalid_ticket_priority');
    }
    if (input.placeId && !Tables.Places.findById(input.placeId)) {
        throw new ValidationError('place_not_found');
    }

    const { result } = withLockedDedupe('ticket:create', requestId, () => {
        const timestamp = nowIso();
        const ticket = Tables.Tickets.insert({
            DisplayId: getNextDisplayId('ticket'),
            Title: title,
            Description: input.description || '',
            Status: 'unassigned',
            AssigneeId: '',
            ReporterId: actor.Email,
            CreatedAt: timestamp,
            UpdatedAt: timestamp,
            Priority: priority,
            PlaceId: input.placeId || '',
        });
        const comment = insertTicketComment(
            ticket.Id,
            actor.Email,
            actor.Name + ' reported this ticket.',
        );
        return { ticket, comment };
    });
    const { ticket, comment } = result;

    const approvers = Tables.Users.findWhere((u) => canApprove(u) && u.Email !== actor.Email);
    approvers.forEach((approver) => {
        sendNotificationEmail(
            approver.Email,
            'ticket:' + ticket.Id + ':created',
            'New ticket: TKT-' + ticket.DisplayId,
            actor.Name + ' reported: ' + ticket.Title,
            '?section=tickets',
        );
    });

    return buildTicketDTO(
        ticket,
        indexBy([actor], (u) => u.Email),
        indexBy(Tables.Places.readAll(), (place) => place.Id),
        { [ticket.Id]: [comment] },
    );
}

// Ported from the source app's `perform_ticket_action` Postgres function,
// same one-lock-spans-the-whole-sequence discipline as Inventory.ts. There
// is no reporter anymore, so 'close' is approver-or-assignee only.
function performTicketAction(
    ticketId: string,
    action: TicketAction,
    assigneeId: string | null,
    dedupeRequestId: string,
): TicketStatus {
    const actor = requireTicketAccess();

    const { duplicate, result: nextStatus } = withLockedDedupe(
        'ticket:' + ticketId + ':' + action,
        dedupeRequestId,
        (): TicketStatus => {
            const ticket = Tables.Tickets.findById(ticketId);
            if (!ticket) throw new ValidationError('ticket_not_found');
            let computedStatus: TicketStatus;

            if (action === 'assign') {
                if (!canApprove(actor)) throw new AuthorizationError('approver_required');
                if (!assigneeId) throw new ValidationError('assignee_required');
                const assignee = Tables.Users.findById(assigneeId);
                if (!assignee) throw new ValidationError('assignee_not_found');
                // Assigning to someone who can't see the board would be a
                // dead end — they'd get the email and find nothing.
                if (!canUseTickets(assignee))
                    throw new ValidationError('assignee_cannot_access_tickets');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, {
                    Status: computedStatus,
                    AssigneeId: assigneeId,
                    UpdatedAt: nowIso(),
                });
                insertTicketComment(
                    ticketId,
                    actor.Email,
                    actor.Name + ' assigned this ticket to ' + assignee.Name + '.',
                );
            } else if (action === 'close') {
                const isAssignee = ticket.AssigneeId === actor.Email;
                if (!canApprove(actor) && !isAssignee)
                    throw new AuthorizationError('not_ticket_owner');
                if (['unassigned', 'pending'].indexOf(ticket.Status) === -1)
                    throw new ValidationError('invalid_transition');
                computedStatus = 'closed';
                Tables.Tickets.updateById(ticketId, {
                    Status: computedStatus,
                    UpdatedAt: nowIso(),
                });
                insertTicketComment(ticketId, actor.Email, actor.Name + ' closed this ticket.');
            } else if (action === 'reopen') {
                if (!canApprove(actor)) throw new AuthorizationError('approver_required');
                if (ticket.Status !== 'closed') throw new ValidationError('invalid_transition');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, {
                    Status: computedStatus,
                    UpdatedAt: nowIso(),
                });
                insertTicketComment(ticketId, actor.Email, actor.Name + ' reopened this ticket.');
            } else {
                throw new ValidationError('unsupported_action');
            }

            return computedStatus;
        },
    );

    if (!duplicate) {
        notifyOnTicketAction(ticketId, action, actor, dedupeRequestId);
    }
    return nextStatus;
}

function notifyOnTicketAction(
    ticketId: string,
    action: TicketAction,
    actor: User,
    dedupeRequestId: string,
): void {
    const ticket = Tables.Tickets.findById(ticketId);
    if (!ticket) return;
    const eventKey = 'ticket:' + ticketId + ':' + action + ':' + dedupeRequestId;
    const title = 'TKT-' + ticket.DisplayId + ' ' + action + 'ed';

    const recipients = Array.from(new Set([ticket.ReporterId, ticket.AssigneeId])).filter(
        (email) => email && email !== actor.Email,
    );
    recipients.forEach((email) => {
        const verb =
            action === 'assign' && email === ticket.AssigneeId ? 'assigned you to' : action + 'd';
        sendNotificationEmail(
            email,
            eventKey,
            title,
            actor.Name + ' ' + verb + ': ' + ticket.Title,
            '?section=tickets',
        );
    });
}

function addTicketComment(ticketId: string, message: string, dedupeRequestId: string): CommentDTO {
    const actor = requireTicketAccess();
    const ticket = Tables.Tickets.findById(ticketId);
    if (!ticket) throw new ValidationError('ticket_not_found');
    const trimmed = requireNonEmpty(message, 'Message is required.');
    const { result: comment, duplicate } = withLockedDedupe(
        'ticket:' + ticketId + ':comment',
        dedupeRequestId,
        () => {
            Tables.Tickets.updateById(ticketId, { UpdatedAt: nowIso() });
            return insertTicketComment(ticketId, actor.Email, trimmed);
        },
    );

    if (!duplicate) {
        Array.from(new Set([ticket.ReporterId, ticket.AssigneeId]))
            .filter((email) => email && email !== actor.Email)
            .forEach((email) =>
                sendNotificationEmail(
                    email,
                    'ticket:' + ticketId + ':comment:' + comment.Id,
                    'New comment on TKT-' + ticket.DisplayId,
                    actor.Name + ' commented: ' + trimmed,
                    '?section=tickets&ticket=' + ticketId,
                ),
            );
    }
    return buildCommentDTO(
        comment,
        indexBy([actor], (user) => user.Email),
    );
}
