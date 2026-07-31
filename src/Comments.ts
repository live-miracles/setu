// Comments are the audit trail for InventoryRequests: every status change is
// narrated here as a system-authored comment instead of a dedicated *At
// column, alongside whatever comments real users type. Designed to extend
// to other commentable sections later (e.g. studio booking requests) via
// CommentOwnerType.
const SYSTEM_ACTOR_ID = 'system';

function buildCommentDTO(
    comment: CommentRecord,
    profilesById: Record<string, Profile>,
): CommentDTO {
    const authorName =
        comment.AuthorId === SYSTEM_ACTOR_ID
            ? 'Setu'
            : (profilesById[comment.AuthorId] || ({} as Profile)).Name || '';
    return Object.assign({}, comment, { authorName });
}

function commentsFor(
    ownerType: CommentOwnerType,
    ownerId: string,
    commentsByOwnerId: Record<string, CommentRecord[]>,
    profilesById: Record<string, Profile>,
): CommentDTO[] {
    return (commentsByOwnerId[ownerId] || [])
        .filter((c) => c.OwnerType === ownerType)
        .sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt))
        .map((c) => buildCommentDTO(c, profilesById));
}

// Sort key for "most recently active first" request lists, now that
// InventoryRequests no longer carry their own UpdatedAt: the latest
// comment's CreatedAt (every row gets a system comment at creation, so this
// is always populated), falling back to DisplayId for the rare empty case.
function latestActivityAt(comments: CommentDTO[], displayId: number): string {
    if (comments.length === 0) return String(displayId).padStart(10, '0');
    return comments[comments.length - 1].CreatedAt;
}

function insertSystemComment(
    ownerType: CommentOwnerType,
    ownerId: string,
    message: string,
): CommentRecord {
    return Tables.Comments.insert({
        OwnerType: ownerType,
        OwnerId: ownerId,
        AuthorId: SYSTEM_ACTOR_ID,
        Message: message,
        CreatedAt: nowIso(),
    });
}

function addComment(
    ownerType: CommentOwnerType,
    ownerId: string,
    message: string,
    requestId: string,
): CommentDTO {
    const actor = requireUser();
    const trimmedMessage = requireNonEmpty(message, 'Message is required.');

    if (ownerType !== 'inventory_request') throw new ValidationError('unsupported_owner_type');
    const request = Tables.InventoryRequests.findById(ownerId);
    if (!request) throw new ValidationError('request_not_found');

    const { result: comment, duplicate } = withLockedDedupe(
        ownerType + ':' + ownerId + ':comment',
        requestId,
        () => {
            return Tables.Comments.insert({
                OwnerType: ownerType,
                OwnerId: ownerId,
                AuthorId: actor.Id,
                Message: trimmedMessage,
                CreatedAt: nowIso(),
            });
        },
    );

    if (!duplicate) {
        const recipients = Array.from(
            new Set([request.RequesterId].filter((id) => id && id !== actor.Id)),
        );
        recipients.forEach((id) => {
            sendNotificationEmail(
                id,
                ownerType + ':' + ownerId + ':comment:' + comment.Id,
                'New comment on REQ-' + request.DisplayId,
                actor.Name + ' commented: ' + trimmedMessage,
                '?section=inventory',
            );
        });
    }

    return buildCommentDTO(comment, indexById([actor]));
}
