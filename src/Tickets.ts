const TICKETS_PAGE_SIZE = 20;

function buildTicketDTO(ticket: Ticket, usersByEmail: Record<string, User>): TicketDTO {
    const assignee = ticket.AssigneeId ? usersByEmail[ticket.AssigneeId] : undefined;
    return Object.assign({}, ticket, {
        assigneeName: assignee ? assignee.Name : '',
    });
}

function listTickets(page: number): Paginated<TicketDTO> {
    requireUser();
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const dtos = Tables.Tickets.readAll()
        .sort((a, b) => b.DisplayId - a.DisplayId)
        .map((t) => buildTicketDTO(t, usersByEmail));
    return paginate(dtos, page, TICKETS_PAGE_SIZE);
}

function createTicket(input: CreateTicketInput, requestId: string): TicketDTO {
    const actor = requireUser();
    const title = requireNonEmpty(input.title, 'Title is required.');

    const { result: ticket } = withLockedDedupe('ticket:create', requestId, () => {
        return Tables.Tickets.insert({
            DisplayId: getNextDisplayId('ticket'),
            Title: title,
            Description: input.description || '',
            Status: 'unassigned',
            AssigneeId: '',
        });
    });

    const admins = Tables.Users.findWhere((u) => u.Role === 'admin' && u.Email !== actor.Email);
    admins.forEach((admin) => {
        sendNotificationEmail(
            admin.Email,
            'ticket:' + ticket.Id + ':created',
            'New ticket: TKT-' + ticket.DisplayId,
            actor.Name + ' reported: ' + ticket.Title,
            '?section=tickets',
        );
    });

    return buildTicketDTO(ticket, indexBy([actor], (u) => u.Email));
}

// Ported from the source app's `perform_ticket_action` Postgres function,
// same one-lock-spans-the-whole-sequence discipline as Inventory.ts. There
// is no reporter anymore, so 'close' is admin-or-assignee only.
function performTicketAction(
    ticketId: string,
    action: TicketAction,
    assigneeId: string | null,
    dedupeRequestId: string,
): TicketStatus {
    const actor = requireUser();

    const { duplicate, result: nextStatus } = withLockedDedupe(
        'ticket:' + ticketId + ':' + action,
        dedupeRequestId,
        (): TicketStatus => {
            const ticket = Tables.Tickets.findById(ticketId);
            if (!ticket) throw new ValidationError('ticket_not_found');
            let computedStatus: TicketStatus;

            if (action === 'assign') {
                if (actor.Role !== 'admin') throw new AuthorizationError('admin_required');
                if (!assigneeId) throw new ValidationError('assignee_required');
                const assignee = Tables.Users.findById(assigneeId);
                if (!assignee) throw new ValidationError('assignee_not_found');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, {
                    Status: computedStatus,
                    AssigneeId: assigneeId,
                });
            } else if (action === 'close') {
                const isAssignee = ticket.AssigneeId === actor.Email;
                if (actor.Role !== 'admin' && !isAssignee)
                    throw new AuthorizationError('not_ticket_owner');
                if (['unassigned', 'pending'].indexOf(ticket.Status) === -1)
                    throw new ValidationError('invalid_transition');
                computedStatus = 'closed';
                Tables.Tickets.updateById(ticketId, { Status: computedStatus });
            } else if (action === 'reopen') {
                if (actor.Role !== 'admin') throw new AuthorizationError('admin_required');
                if (ticket.Status !== 'closed') throw new ValidationError('invalid_transition');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, { Status: computedStatus });
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

    // The assignee is the only other interested party now that there's no
    // reporter to track — notify them for any action they didn't perform
    // themselves.
    if (ticket.AssigneeId && ticket.AssigneeId !== actor.Email) {
        const verb = action === 'assign' ? 'assigned you to' : action + 'd';
        sendNotificationEmail(
            ticket.AssigneeId,
            eventKey,
            title,
            actor.Name + ' ' + verb + ': ' + ticket.Title,
            '?section=tickets',
        );
    }
}
