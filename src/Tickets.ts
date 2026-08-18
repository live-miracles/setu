const TICKETS_PAGE_SIZE = 20;

function buildTicketDTO(
    ticket: Ticket,
    usersByEmail: Record<string, User>,
    commentsByRequestId: Record<string, CommentRecord[]> = {},
): TicketDTO {
    const assignee = ticket.AssigneeId ? usersByEmail[ticket.AssigneeId] : undefined;
    const comments = commentsFor(ticket.Id, commentsByRequestId, usersByEmail);
    return Object.assign({}, ticket, {
        assigneeName: assignee ? assignee.Name : '',
        comments,
    });
}

// Tickets are hidden from viewer/user roles entirely (canUseTickets in
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
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
    const statuses = query.statuses || [];
    const dtos = Tables.Tickets.readAll()
        .map((t) => buildTicketDTO(t, usersByEmail, commentsByRequestId))
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
        groupCommentsByRequestId(Tables.Comments.readAll()),
    );
}

function createTicket(input: CreateTicketInput, requestId: string): TicketDTO {
    const actor = requireTicketAccess();
    const title = requireNonEmpty(input.title, 'Title is required.');

    const { result } = withLockedDedupe('ticket:create', requestId, () => {
        const created = Tables.Tickets.insert({
            DisplayId: getNextDisplayId('ticket'),
            Title: title,
            Description: input.description || '',
            Status: 'unassigned',
            AssigneeId: '',
        });
        return { ticket: created };
    });
    const { ticket } = result;

    return buildTicketDTO(
        ticket,
        indexBy([actor], (u) => u.Email),
        {},
    );
}

function updateTicket(id: string, input: UpdateTicketInput, requestId: string): TicketDTO {
    const actor = requireTicketAccess();
    const title = requireNonEmpty(input.title, 'Title is required.');
    const description = input.description || '';

    const { result } = withLockedDedupe('ticket:update:' + id, requestId, () => {
        const ticket = Tables.Tickets.findById(id);
        if (!ticket) throw new ValidationError('ticket_not_found');
        const updated = Tables.Tickets.updateById(id, {
            Title: title,
            Description: description,
        });
        return { ticket: updated };
    });

    return buildTicketDTO(
        result.ticket,
        indexBy([actor], (u) => u.Email),
        {},
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

    const { result: nextStatus } = withLockedDedupe(
        'ticket:' + ticketId + ':' + action,
        dedupeRequestId,
        (): TicketStatus => {
            const ticket = Tables.Tickets.findById(ticketId);
            if (!ticket) throw new ValidationError('ticket_not_found');
            let computedStatus: TicketStatus;

            if (action === 'assign') {
                if (!assigneeId) throw new ValidationError('assignee_required');
                if (!canApprove(actor) && assigneeId !== actor.Email)
                    throw new AuthorizationError('approver_required');
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
                });
                insertActionComment(
                    'ticket',
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
                Tables.Tickets.updateById(ticketId, { Status: computedStatus });
                insertActionComment(
                    'ticket',
                    ticketId,
                    actor.Email,
                    actor.Name + ' closed this ticket.',
                );
            } else if (action === 'reopen') {
                if (!canApprove(actor)) throw new AuthorizationError('approver_required');
                if (ticket.Status !== 'closed') throw new ValidationError('invalid_transition');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, { Status: computedStatus });
                insertActionComment(
                    'ticket',
                    ticketId,
                    actor.Email,
                    actor.Name + ' reopened this ticket.',
                );
            } else {
                throw new ValidationError('unsupported_action');
            }

            return computedStatus;
        },
    );

    return nextStatus;
}
