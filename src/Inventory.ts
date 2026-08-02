const INVENTORY_REQUESTS_PAGE_SIZE = 20;

// Outstanding (issued but not yet returned) quantity per inventory type —
// subtracted from TotalQuantity to derive availableQuantity on read, rather
// than storing a mutable counter that could drift from the underlying
// request rows. Returns are all-or-nothing per request (see the 'return'
// branch below), so an item's full Quantity counts as outstanding exactly
// while its request's Status is 'issued'. Damaged/missing returns aren't
// deducted here: an admin corrects TotalQuantity by hand when equipment is
// permanently lost.
function computeDeductionsByType(): Record<string, number> {
    const requestsById = indexBy(Tables.InventoryRequests.readAll(), (r) => r.Id);
    const deductions: Record<string, number> = {};
    Tables.InventoryItems.readAll().forEach((item) => {
        const request = requestsById[item.RequestId];
        if (!request || request.Status !== 'issued') return;
        deductions[item.InventoryTypeId] = (deductions[item.InventoryTypeId] || 0) + item.Quantity;
    });
    return deductions;
}

function buildInventoryTypeDTOs(types: InventoryType[]): InventoryTypeDTO[] {
    const deductions = computeDeductionsByType();
    return types.map((t) =>
        Object.assign({}, t, { availableQuantity: t.TotalQuantity - (deductions[t.Id] || 0) }),
    );
}

function buildInventoryItemDTO(
    item: InventoryItem,
    inventoryTypesById: Record<string, InventoryType>,
): InventoryItemDTO {
    return Object.assign({}, item, {
        itemName: (inventoryTypesById[item.InventoryTypeId] || ({} as InventoryType)).Name || '',
    });
}

function buildInventoryRequestDTO(
    request: InventoryRequest,
    itemsByRequest: Record<string, InventoryItem[]>,
    inventoryTypesById: Record<string, InventoryType>,
    usersByEmail: Record<string, User>,
    commentsByRequestId: Record<string, CommentRecord[]>,
): InventoryRequestDTO {
    const items = (itemsByRequest[request.Id] || []).map((i) =>
        buildInventoryItemDTO(i, inventoryTypesById),
    );
    const requester = usersByEmail[request.UserId];
    const comments = commentsFor(request.Id, commentsByRequestId, usersByEmail);
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        participants: parseParticipants(request.Participants),
        items,
        comments,
    });
}

function listInventoryTypes(): InventoryTypeDTO[] {
    requireUser();
    return buildInventoryTypeDTOs(Tables.InventoryTypes.readAll());
}

function createInventoryType(input: CreateInventoryTypeInput, requestId: string): InventoryTypeDTO {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!(input.totalQuantity >= 0))
        throw new ValidationError('total_quantity_must_be_non_negative');
    const { result } = withLockedDedupe('inventory_type:create', requestId, () => {
        return Tables.InventoryTypes.insert({
            Name: name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageId: '',
            TotalQuantity: input.totalQuantity,
        });
    });
    return buildInventoryTypeDTOs([result])[0];
}

function updateInventoryType(
    id: string,
    input: CreateInventoryTypeInput,
    requestId: string,
): InventoryTypeDTO {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!(input.totalQuantity >= 0))
        throw new ValidationError('total_quantity_must_be_non_negative');
    const { result } = withLockedDedupe('inventory_type:update', requestId, () => {
        if (!Tables.InventoryTypes.findById(id)) throw new ValidationError('not_found');
        return Tables.InventoryTypes.updateById(id, {
            Name: name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            TotalQuantity: input.totalQuantity,
        });
    });
    return buildInventoryTypeDTOs([result])[0];
}

function deleteInventoryType(id: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('inventory_type:delete', requestId, () => {
        Tables.InventoryTypes.deleteById(id);
        return null;
    });
}

function listInventoryRequests(page: number): Paginated<InventoryRequestDTO> {
    const actor = requireUser();
    const itemsByRequest = groupBy(Tables.InventoryItems.readAll(), (i) => i.RequestId);
    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
    const dtos = Tables.InventoryRequests.readAll()
        .filter((r) => canViewRequest(actor, r.UserId, parseParticipants(r.Participants)))
        .map((r) =>
            buildInventoryRequestDTO(
                r,
                itemsByRequest,
                inventoryTypesById,
                usersByEmail,
                commentsByRequestId,
            ),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    return paginate(dtos, page, INVENTORY_REQUESTS_PAGE_SIZE);
}

function createInventoryRequest(
    input: CreateInventoryRequestInput,
    requestId: string,
): InventoryRequestDTO {
    const actor = requireUser();
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new ValidationError('endDate must be on or after startDate.');
    }
    if (!input.items || input.items.length === 0)
        throw new ValidationError('At least one item is required.');
    const lines = input.items.map((line) => {
        if (!(line.quantity > 0)) throw new ValidationError('quantity_must_be_positive');
        const inventoryType = Tables.InventoryTypes.findById(line.inventoryTypeId);
        if (!inventoryType) throw new ValidationError('inventory_type_not_found');
        return { inventoryType, quantity: line.quantity };
    });
    const images = (input.images || []).filter(Boolean).slice(0, 3);
    const participants = parseParticipants(input.participants);

    const { result } = withLockedDedupe('inventory_request:create', requestId, () => {
        const created = Tables.InventoryRequests.insert({
            DisplayId: getNextDisplayId('inventory_request'),
            Name: name,
            UserId: actor.Email,
            StartDate: input.startDate,
            EndDate: input.endDate,
            Status: 'submitted',
            Image1Id: images[0] || '',
            Image2Id: images[1] || '',
            Image3Id: images[2] || '',
            Participants: formatParticipants(participants),
        });
        lines.forEach((line) => {
            Tables.InventoryItems.insert({
                RequestId: created.Id,
                InventoryTypeId: line.inventoryType.Id,
                Quantity: line.quantity,
                Condition: '',
            });
        });
        const comment = insertActionComment(
            'inventory',
            created.Id,
            actor.Email,
            actor.Name + ' submitted this request.',
        );
        return { request: created, comment };
    });
    const { request, comment } = result;

    const approvers = Tables.Users.findWhere((u) => canApprove(u) && u.Email !== actor.Email);
    approvers.forEach((approver) => {
        sendNotificationEmail(
            approver.Email,
            'inventory:' + request.Id + ':submitted',
            'New equipment request: REQ-' + request.DisplayId,
            actor.Name +
                ' requested equipment for ' +
                request.StartDate +
                ' to ' +
                request.EndDate +
                '.',
            '?section=inventory',
        );
    });

    const requestItems = Tables.InventoryItems.findWhere((i) => i.RequestId === request.Id);
    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    return buildInventoryRequestDTO(
        request,
        { [request.Id]: requestItems },
        inventoryTypesById,
        indexBy([actor], (u) => u.Email),
        { [request.Id]: [comment] },
    );
}

// Ported from the source app's `perform_inventory_request_action` Postgres
// function. Wrapped end-to-end (read + validate + every mutated row) in one
// withLockedDedupe/withLock, replacing Postgres's per-row `FOR UPDATE` locks
// with one coarse script-global mutex.
function performInventoryRequestAction(
    requestId: string,
    action: InventoryRequestAction,
    note: string,
    returnItems: ReturnItemInput[] | null,
    dedupeRequestId: string,
): InventoryRequestStatus {
    const actor = requireUser();

    const { duplicate, result: nextStatus } = withLockedDedupe(
        'inventory_request:' + requestId + ':' + action,
        dedupeRequestId,
        (): InventoryRequestStatus => {
            const request = Tables.InventoryRequests.findById(requestId);
            if (!request) throw new ValidationError('request_not_found');
            let computedStatus: InventoryRequestStatus;

            if (action === 'submit') {
                const participants = parseParticipants(request.Participants);
                const isOwner =
                    request.UserId === actor.Email || participants.indexOf(actor.Email) !== -1;
                if (!isOwner || request.Status !== 'draft')
                    throw new ValidationError('invalid_transition');
                computedStatus = 'submitted';
                Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                insertActionComment(
                    'inventory',
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
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
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
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' rejected this request. ' + note,
                    );
                } else if (action === 'issue') {
                    if (request.Status !== 'approved')
                        throw new ValidationError('invalid_transition');
                    const items = Tables.InventoryItems.findWhere((i) => i.RequestId === requestId);
                    const inventoryTypesById = indexBy(
                        Tables.InventoryTypes.readAll(),
                        (t) => t.Id,
                    );
                    const deductions = computeDeductionsByType();
                    items.forEach((item) => {
                        const type = inventoryTypesById[item.InventoryTypeId];
                        if (!type) throw new ValidationError('inventory_type_not_found');
                        const available = type.TotalQuantity - (deductions[type.Id] || 0);
                        if (available < item.Quantity)
                            throw new ValidationError('insufficient_inventory');
                        deductions[type.Id] = (deductions[type.Id] || 0) + item.Quantity;
                    });
                    computedStatus = 'issued';
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' issued the equipment.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'return') {
                    if (request.Status !== 'issued' || !returnItems || returnItems.length === 0) {
                        throw new ValidationError('invalid_transition_or_return_items');
                    }
                    // A return closes out the whole request in one step — see the
                    // ReturnItemInput comment in shared/types.d.ts — so every item
                    // on the request must be present exactly once.
                    const items = Tables.InventoryItems.findWhere((i) => i.RequestId === requestId);
                    const returnedIds = new Set(returnItems.map((r) => r.requestItemId));
                    const coversAllItems =
                        returnItems.length === items.length &&
                        items.every((item) => returnedIds.has(item.Id));
                    if (!coversAllItems) throw new ValidationError('invalid_return_items');

                    const itemsById = indexBy(items, (i) => i.Id);
                    const inventoryTypesById = indexBy(
                        Tables.InventoryTypes.readAll(),
                        (t) => t.Id,
                    );
                    const summaries: string[] = [];
                    returnItems.forEach((ret) => {
                        const item = itemsById[ret.requestItemId];
                        const type = inventoryTypesById[item.InventoryTypeId];
                        Tables.InventoryItems.updateById(item.Id, { Condition: ret.condition });
                        summaries.push(
                            item.Quantity +
                                '× ' +
                                (type ? type.Name : '') +
                                ' (' +
                                ret.condition +
                                ')',
                        );
                    });
                    computedStatus = 'returned';
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' returned ' + summaries.join(', ') + '.',
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
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' cancelled this request. ' + note,
                    );
                } else if (action === 'close') {
                    if (['returned', 'rejected', 'cancelled'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'closed';
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
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
        notifyOnInventoryRequestAction(requestId, action, actor, nextStatus, dedupeRequestId);
    }
    return nextStatus;
}

function notifyOnInventoryRequestAction(
    requestId: string,
    action: InventoryRequestAction,
    actor: User,
    newStatus: InventoryRequestStatus,
    dedupeRequestId: string,
): void {
    const request = Tables.InventoryRequests.findById(requestId);
    if (!request) return;
    const owner: RequestOwner = {
        kind: 'inventory',
        displayId: request.DisplayId,
        userId: request.UserId,
        participants: parseParticipants(request.Participants),
    };
    const eventKey = 'inventory:' + requestId + ':' + action + ':' + dedupeRequestId;
    requestOwnerRecipients(owner, actor.Email).forEach((email) => {
        sendNotificationEmail(
            email,
            eventKey,
            'REQ-' + request.DisplayId + ' ' + newStatus,
            actor.Name + ' ' + action + 'd your equipment request.',
            '?section=inventory',
        );
    });
}
