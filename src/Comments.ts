// Comments are the audit trail for InventoryRequests, ProgramRequests and
// Tickets: every status change is narrated here — authored by whichever user
// actually performed the action, no system/bot actor — alongside whatever
// comments people type themselves. RequestId lookups try each commentable
// table since a raw id carries no type tag of its own.

interface RequestOwner {
    kind: 'inventory' | 'program' | 'ticket';
    displayId: number;
    userId: string;
    participants: string[];
    leadEmail: string;
}

function findRequestOwner(requestId: string): RequestOwner | null {
    const inventoryRequest = Tables.InventoryRequests.findById(requestId);
    if (inventoryRequest) {
        return {
            kind: 'inventory',
            displayId: inventoryRequest.DisplayId,
            userId: inventoryRequest.UserId,
            participants: parseParticipants(inventoryRequest.Participants),
            leadEmail: inventoryRequest.LeadEmail,
        };
    }
    const programRequest = Tables.ProgramRequests.findById(requestId);
    if (programRequest) {
        return {
            kind: 'program',
            displayId: programRequest.DisplayId,
            userId: programRequest.UserId,
            participants: parseParticipants(programRequest.Participants),
            leadEmail: programRequest.LeadEmail,
        };
    }
    const ticket = Tables.Tickets.findById(requestId);
    if (ticket) {
        return {
            kind: 'ticket',
            displayId: ticket.DisplayId,
            userId: ticket.AssigneeId,
            participants: [],
            leadEmail: '',
        };
    }
    return null;
}

function requestOwnerRecipients(owner: RequestOwner, excludingActorId: string): string[] {
    return Array.from(new Set([owner.userId, owner.leadEmail, ...owner.participants])).filter(
        (email) => email && email !== excludingActorId,
    );
}

function insertActionComment(
    kind: 'inventory' | 'program' | 'ticket',
    requestId: string,
    actorId: string,
    message: string,
    notify = true,
): CommentRecord {
    const comment = Tables.Comments.insert({
        Timestamp: nowIso(),
        RequestId: requestId,
        UserId: actorId,
        Message: message,
    });
    if (notify) sendCommentNotification(requestId, comment);
    return comment;
}

function buildCommentDTO(comment: CommentRecord, usersByEmail: Record<string, User>): CommentDTO {
    const user = usersByEmail[comment.UserId];
    return Object.assign({}, comment, { userName: user ? user.Name : '' });
}

function groupCommentsByRequestId(comments: CommentRecord[]): Record<string, CommentRecord[]> {
    return groupBy(comments, (c) => c.RequestId);
}

function commentsFor(
    requestId: string,
    commentsByRequestId: Record<string, CommentRecord[]>,
    usersByEmail: Record<string, User>,
): CommentDTO[] {
    return (commentsByRequestId[requestId] || [])
        .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp))
        .map((c) => buildCommentDTO(c, usersByEmail));
}

// Sort key for "most recently active first" request lists: the latest
// comment's Timestamp (every row gets a comment at creation, so this is
// always populated), falling back to DisplayId for the rare empty case.
function latestActivityAt(comments: CommentDTO[], displayId: number): string {
    if (comments.length === 0) return String(displayId).padStart(10, '0');
    return comments[comments.length - 1].Timestamp;
}

function sendCommentNotification(requestId: string, comment: CommentRecord): void {
    const owner = findRequestOwner(requestId);
    if (!owner) return;
    const actor = Tables.Users.findById(comment.UserId);
    const actorName = actor ? actor.Name : comment.UserId;
    const prefix = owner.kind === 'inventory' ? 'REQ-' : owner.kind === 'program' ? 'PRG-' : 'TKT-';
    const section =
        owner.kind === 'inventory'
            ? 'inventory'
            : owner.kind === 'program'
              ? 'programs'
              : 'tickets';
    sendNotificationEmail(
        notificationFromEmail(),
        requestOwnerRecipients(owner, comment.UserId),
        owner.kind + ':' + requestId + ':comment:' + comment.Id,
        'Update on ' + prefix + owner.displayId,
        actorName + ': ' + comment.Message,
        '?section=' + section,
        actorName,
    );
}

function addComment(requestId: string, message: string, dedupeRequestId: string): CommentDTO {
    const actor = requireUser();
    const trimmedMessage = requireNonEmpty(message, 'Message is required.');

    const owner = findRequestOwner(requestId);
    if (!owner) throw new ValidationError('request_not_found');
    // A `user` is scoped to requests they raised or are a participant on, so
    // knowing an id must not be enough to comment on someone else's request.
    // Tickets use the ticket-board gate instead because they have no reporter.
    if (
        owner.kind === 'ticket'
            ? !canUseTickets(actor)
            : !canViewRequest(actor, owner.userId, owner.participants)
    ) {
        throw new AuthorizationError('You do not have access to this request.');
    }

    const { result: comment } = withLockedDedupe(
        owner.kind + ':' + requestId + ':comment',
        dedupeRequestId,
        () => insertActionComment(owner.kind, requestId, actor.Email, trimmedMessage, true),
    );

    return buildCommentDTO(
        comment,
        indexBy([actor], (u) => u.Email),
    );
}

function listComments(requestId: string, page: number): Paginated<CommentDTO> {
    const actor = requireUser();
    const owner = findRequestOwner(requestId);
    if (!owner) throw new ValidationError('request_not_found');
    if (
        owner.kind === 'ticket'
            ? !canUseTickets(actor)
            : !canViewRequest(actor, owner.userId, owner.participants)
    ) {
        throw new AuthorizationError('You do not have access to this request.');
    }
    const usersByEmail = indexBy(Tables.Users.readAll(), (user) => user.Email);
    const comments = Tables.Comments.readAll()
        .filter((comment) => comment.RequestId === requestId)
        .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
    const pageSize = 25;
    const safePage = Math.max(1, Math.floor(page) || 1);
    const end = comments.length - (safePage - 1) * pageSize;
    const start = Math.max(0, end - pageSize);
    return {
        items: comments.slice(start, end).map((comment) => buildCommentDTO(comment, usersByEmail)),
        page: safePage,
        pageSize,
        totalCount: comments.length,
    };
}
