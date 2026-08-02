// Comments are the audit trail for InventoryRequests and ProgramRequests:
// every status change is narrated here — authored by whichever user
// actually performed the action, no system/bot actor — alongside whatever
// comments people type themselves. Exactly one of InventoryRequestId/
// ProgramRequestId is set per row; requestId lookups below try
// InventoryRequests then ProgramRequests since a raw id carries no type tag
// of its own. Tickets have no comments.

interface RequestOwner {
    kind: 'inventory' | 'program';
    displayId: number;
    userId: string;
    participants: string[];
}

function findRequestOwner(requestId: string): RequestOwner | null {
    const inventoryRequest = Tables.InventoryRequests.findById(requestId);
    if (inventoryRequest) {
        return {
            kind: 'inventory',
            displayId: inventoryRequest.DisplayId,
            userId: inventoryRequest.UserId,
            participants: parseParticipants(inventoryRequest.Participants),
        };
    }
    const programRequest = Tables.ProgramRequests.findById(requestId);
    if (programRequest) {
        return {
            kind: 'program',
            displayId: programRequest.DisplayId,
            userId: programRequest.UserId,
            participants: parseParticipants(programRequest.Participants),
        };
    }
    return null;
}

function requestOwnerRecipients(owner: RequestOwner, excludingActorId: string): string[] {
    return Array.from(new Set([owner.userId, ...owner.participants])).filter(
        (email) => email && email !== excludingActorId,
    );
}

function insertActionComment(
    kind: 'inventory' | 'program',
    requestId: string,
    actorId: string,
    message: string,
): CommentRecord {
    return Tables.Comments.insert({
        Timestamp: nowIso(),
        InventoryRequestId: kind === 'inventory' ? requestId : '',
        ProgramRequestId: kind === 'program' ? requestId : '',
        UserId: actorId,
        Message: message,
    });
}

function buildCommentDTO(comment: CommentRecord, usersByEmail: Record<string, User>): CommentDTO {
    const user = usersByEmail[comment.UserId];
    return Object.assign({}, comment, { userName: user ? user.Name : '' });
}

function groupCommentsByRequestId(comments: CommentRecord[]): Record<string, CommentRecord[]> {
    return groupBy(comments, (c) => c.InventoryRequestId || c.ProgramRequestId);
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

function addComment(requestId: string, message: string, dedupeRequestId: string): CommentDTO {
    const actor = requireUser();
    const trimmedMessage = requireNonEmpty(message, 'Message is required.');

    const owner = findRequestOwner(requestId);
    if (!owner) throw new ValidationError('request_not_found');
    // A `user` is scoped to requests they raised or are a participant on, so
    // knowing an id must not be enough to comment on someone else's request.
    if (!canViewRequest(actor, owner.userId, owner.participants)) {
        throw new AuthorizationError('You do not have access to this request.');
    }

    const { result: comment, duplicate } = withLockedDedupe(
        owner.kind + ':' + requestId + ':comment',
        dedupeRequestId,
        () => insertActionComment(owner.kind, requestId, actor.Email, trimmedMessage),
    );

    if (!duplicate) {
        const prefix = owner.kind === 'inventory' ? 'REQ-' : 'PRG-';
        const section = owner.kind === 'inventory' ? 'inventory' : 'programs';
        requestOwnerRecipients(owner, actor.Email).forEach((email) => {
            sendNotificationEmail(
                email,
                owner.kind + ':' + requestId + ':comment:' + comment.Id,
                'New comment on ' + prefix + owner.displayId,
                actor.Name + ' commented: ' + trimmedMessage,
                '?section=' + section,
            );
        });
    }

    return buildCommentDTO(
        comment,
        indexBy([actor], (u) => u.Email),
    );
}
