const TICKETS_PAGE_SIZE = 20;

function buildTicketDTO(ticket: Ticket, profilesById: Record<string, Profile>): TicketDTO {
    const reporter = profilesById[ticket.ReporterId];
    const assignee = ticket.AssigneeId ? profilesById[ticket.AssigneeId] : undefined;
    return Object.assign({}, ticket, {
        reporterName: reporter ? reporter.Name : '',
        assigneeName: assignee ? assignee.Name : '',
    });
}

function listTickets(page: number): Paginated<TicketDTO> {
    requireUser();
    const profilesById = indexById(Tables.Profiles.readAll());
    const dtos = Tables.Tickets.readAll()
        .sort((a, b) => b.DisplayId - a.DisplayId)
        .map((t) => buildTicketDTO(t, profilesById));
    return paginate(dtos, page, TICKETS_PAGE_SIZE);
}

function createTicket(input: CreateTicketInput, requestId: string): TicketDTO {
    const actor = requireUser();
    const title = requireNonEmpty(input.title, 'Title is required.');
    const location = Tables.Locations.findById(input.locationId);
    if (!location) throw new ValidationError('location_not_found');

    const { result: ticket } = withLockedDedupe('ticket:create', requestId, () => {
        return Tables.Tickets.insert({
            DisplayId: getNextDisplayId('ticket'),
            Title: title,
            Description: input.description || '',
            LocationId: input.locationId,
            LocationName: location.Name,
            Priority: input.priority,
            Status: 'unassigned',
            ReporterId: actor.Id,
            AssigneeId: '',
        });
    });

    const admins = Tables.Profiles.findWhere(
        (p) => p.Role === 'admin' && p.Status === 'active' && p.Id !== actor.Id,
    );
    admins.forEach((admin) => {
        sendNotificationEmail(
            admin.Id,
            'ticket:' + ticket.Id + ':created',
            'New ticket: TKT-' + ticket.DisplayId,
            actor.Name + ' reported: ' + ticket.Title,
            '?section=tickets',
        );
    });

    return buildTicketDTO(ticket, indexById([actor]));
}

// Ported from the source app's `perform_ticket_action` Postgres function,
// same one-lock-spans-the-whole-sequence discipline as Inventory.ts.
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
                const assignee = Tables.Profiles.findById(assigneeId);
                if (!assignee || assignee.Status !== 'active')
                    throw new ValidationError('assignee_not_active');
                computedStatus = 'pending';
                Tables.Tickets.updateById(ticketId, {
                    Status: computedStatus,
                    AssigneeId: assigneeId,
                });
            } else if (action === 'close') {
                const isAssignee = ticket.AssigneeId === actor.Id;
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
    actor: Profile,
    dedupeRequestId: string,
): void {
    const ticket = Tables.Tickets.findById(ticketId);
    if (!ticket) return;
    const eventKey = 'ticket:' + ticketId + ':' + action + ':' + dedupeRequestId;
    const title = 'TKT-' + ticket.DisplayId + ' ' + action + 'ed';

    if (action === 'assign') {
        if (ticket.AssigneeId && ticket.AssigneeId !== actor.Id) {
            sendNotificationEmail(
                ticket.AssigneeId,
                eventKey,
                title,
                actor.Name + ' assigned you to: ' + ticket.Title,
                '?section=tickets',
            );
        }
    } else if (action === 'close') {
        if (ticket.ReporterId !== actor.Id) {
            sendNotificationEmail(
                ticket.ReporterId,
                eventKey,
                title,
                actor.Name + ' closed: ' + ticket.Title,
                '?section=tickets',
            );
        }
    } else if (action === 'reopen') {
        const recipients = Array.from(
            new Set([ticket.ReporterId, ticket.AssigneeId].filter((id) => id && id !== actor.Id)),
        );
        recipients.forEach((id) => {
            sendNotificationEmail(
                id,
                eventKey,
                title,
                actor.Name + ' reopened: ' + ticket.Title,
                '?section=tickets',
            );
        });
    }
}
