const INVENTORY_REQUESTS_PAGE_SIZE = 20;

// Outstanding (issued but not yet returned) plus permanently-lost (returned
// damaged/missing) quantity per equipment type — subtracted from
// TotalQuantity to derive availableQuantity on read, rather than storing a
// mutable counter that could drift from the underlying request/return rows.
function computeDeductionsByType(): Record<string, number> {
    const requestItems = Tables.InventoryRequestItems.readAll();
    const requestItemsById = indexById(requestItems);
    const deductions: Record<string, number> = {};
    requestItems.forEach((item) => {
        deductions[item.EquipmentTypeId] =
            (deductions[item.EquipmentTypeId] || 0) + (item.IssuedQuantity - item.ReturnedQuantity);
    });
    Tables.InventoryReturns.readAll().forEach((ret) => {
        if (ret.Condition === 'good') return;
        const item = requestItemsById[ret.RequestItemId];
        if (!item) return;
        deductions[item.EquipmentTypeId] = (deductions[item.EquipmentTypeId] || 0) + ret.Quantity;
    });
    return deductions;
}

function buildEquipmentTypeDTOs(types: EquipmentType[]): EquipmentTypeDTO[] {
    const deductions = computeDeductionsByType();
    return types.map((t) =>
        Object.assign({}, t, { availableQuantity: t.TotalQuantity - (deductions[t.Id] || 0) }),
    );
}

function buildInventoryRequestItemDTO(
    item: InventoryRequestItem,
    equipmentTypesById: Record<string, EquipmentType>,
): InventoryRequestItemDTO {
    return Object.assign({}, item, {
        itemName: (equipmentTypesById[item.EquipmentTypeId] || ({} as EquipmentType)).Name || '',
    });
}

function buildInventoryRequestDTO(
    request: InventoryRequest,
    itemsByRequest: Record<string, InventoryRequestItem[]>,
    equipmentTypesById: Record<string, EquipmentType>,
    profilesById: Record<string, Profile>,
    commentsByOwnerId: Record<string, CommentRecord[]>,
): InventoryRequestDTO {
    const items = (itemsByRequest[request.Id] || []).map((i) =>
        buildInventoryRequestItemDTO(i, equipmentTypesById),
    );
    const requester = profilesById[request.RequesterId];
    const comments = commentsFor('inventory_request', request.Id, commentsByOwnerId, profilesById);
    return Object.assign({}, request, {
        requesterName: requester ? requester.Name : '',
        items,
        comments,
    });
}

function listEquipmentTypes(): EquipmentTypeDTO[] {
    requireUser();
    return buildEquipmentTypeDTOs(Tables.EquipmentTypes.readAll());
}

function createEquipmentType(
    input: CreateEquipmentTypeInput,
    requestId: string,
): EquipmentTypeDTO {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!(input.totalQuantity >= 0))
        throw new ValidationError('total_quantity_must_be_non_negative');
    const { result } = withLockedDedupe('equipment_type:create', requestId, () => {
        return Tables.EquipmentTypes.insert({
            Name: name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageDriveFileId: '',
            TotalQuantity: input.totalQuantity,
        });
    });
    return buildEquipmentTypeDTOs([result])[0];
}

function listInventoryRequests(page: number): Paginated<InventoryRequestDTO> {
    requireUser();
    const itemsByRequest = groupBy(Tables.InventoryRequestItems.readAll(), (i) => i.RequestId);
    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
    const profilesById = indexById(Tables.Profiles.readAll());
    const commentsByOwnerId = groupBy(Tables.Comments.readAll(), (c) => c.OwnerId);
    const dtos = Tables.InventoryRequests.readAll()
        .map((r) =>
            buildInventoryRequestDTO(
                r,
                itemsByRequest,
                equipmentTypesById,
                profilesById,
                commentsByOwnerId,
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
    const title = requireNonEmpty(input.title, 'Title is required.');
    if (!input.fromDate || !input.toDate || input.toDate < input.fromDate) {
        throw new ValidationError('toDate must be on or after fromDate.');
    }
    if (!input.items || input.items.length === 0)
        throw new ValidationError('At least one item is required.');
    const lines = input.items.map((line) => {
        if (!(line.quantity > 0)) throw new ValidationError('quantity_must_be_positive');
        const equipmentType = Tables.EquipmentTypes.findById(line.equipmentTypeId);
        if (!equipmentType) throw new ValidationError('equipment_type_not_found');
        return { equipmentType, quantity: line.quantity };
    });

    const { result } = withLockedDedupe('inventory_request:create', requestId, () => {
        const created = Tables.InventoryRequests.insert({
            DisplayId: getNextDisplayId('inventory_request'),
            Title: title,
            RequesterId: actor.Id,
            FromDate: input.fromDate,
            ToDate: input.toDate,
            Purpose: input.purpose || '',
            Status: 'submitted',
            AdminNote: '',
        });
        lines.forEach((line) => {
            Tables.InventoryRequestItems.insert({
                RequestId: created.Id,
                EquipmentTypeId: line.equipmentType.Id,
                Quantity: line.quantity,
                IssuedQuantity: 0,
                ReturnedQuantity: 0,
            });
        });
        const comment = insertSystemComment(
            'inventory_request',
            created.Id,
            actor.Name + ' submitted this request.',
        );
        return { request: created, comment };
    });
    const { request, comment } = result;

    const admins = Tables.Profiles.findWhere(
        (p) => p.Role === 'admin' && p.Status === 'active' && p.Id !== actor.Id,
    );
    admins.forEach((admin) => {
        sendNotificationEmail(
            admin.Id,
            'inventory:' + request.Id + ':submitted',
            'New equipment request: REQ-' + request.DisplayId,
            actor.Name +
                ' requested equipment for ' +
                request.FromDate +
                ' to ' +
                request.ToDate +
                '.',
            '?section=inventory',
        );
    });

    const requestItems = Tables.InventoryRequestItems.findWhere((i) => i.RequestId === request.Id);
    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
    return buildInventoryRequestDTO(
        request,
        { [request.Id]: requestItems },
        equipmentTypesById,
        indexById([actor]),
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
                if (request.RequesterId !== actor.Id || request.Status !== 'draft')
                    throw new ValidationError('invalid_transition');
                computedStatus = 'submitted';
                Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                insertSystemComment(
                    'inventory_request',
                    requestId,
                    actor.Name + ' submitted this request.',
                );
            } else {
                if (actor.Role !== 'admin') throw new AuthorizationError('admin_required');

                if (action === 'approve') {
                    if (request.Status !== 'submitted')
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'approved';
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        AdminNote: note || '',
                    });
                    insertSystemComment(
                        'inventory_request',
                        requestId,
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
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        AdminNote: note,
                    });
                    insertSystemComment(
                        'inventory_request',
                        requestId,
                        actor.Name + ' rejected this request. ' + note,
                    );
                } else if (action === 'issue') {
                    if (request.Status !== 'approved')
                        throw new ValidationError('invalid_transition');
                    const items = Tables.InventoryRequestItems.findWhere(
                        (i) => i.RequestId === requestId,
                    );
                    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
                    const deductions = computeDeductionsByType();
                    items.forEach((item) => {
                        const type = equipmentTypesById[item.EquipmentTypeId];
                        if (!type) throw new ValidationError('equipment_type_not_found');
                        const available = type.TotalQuantity - (deductions[type.Id] || 0);
                        if (available < item.Quantity)
                            throw new ValidationError('insufficient_inventory');
                        deductions[type.Id] = (deductions[type.Id] || 0) + item.Quantity;
                        Tables.InventoryRequestItems.updateById(item.Id, {
                            IssuedQuantity: item.Quantity,
                        });
                    });
                    computedStatus = 'issued';
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        AdminNote: note || request.AdminNote,
                    });
                    insertSystemComment(
                        'inventory_request',
                        requestId,
                        actor.Name + ' issued the equipment.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'return') {
                    if (request.Status !== 'issued' || !returnItems || returnItems.length === 0) {
                        throw new ValidationError('invalid_transition_or_return_items');
                    }
                    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
                    const summaries: string[] = [];
                    returnItems.forEach((ret) => {
                        if (!(ret.quantity >= 1)) throw new ValidationError('invalid_return_item');
                        requireMinLength(
                            ret.notes,
                            3,
                            'A note of at least 3 characters is required for each returned item.',
                        );
                        const item = Tables.InventoryRequestItems.findById(ret.requestItemId);
                        if (
                            !item ||
                            item.RequestId !== requestId ||
                            item.ReturnedQuantity + ret.quantity > item.IssuedQuantity
                        ) {
                            throw new ValidationError('invalid_return_quantity');
                        }
                        const type = equipmentTypesById[item.EquipmentTypeId];
                        Tables.InventoryReturns.insert({
                            RequestItemId: item.Id,
                            Quantity: ret.quantity,
                            Condition: ret.condition,
                            Notes: ret.notes,
                            ReceivedBy: actor.Id,
                        });
                        Tables.InventoryRequestItems.updateById(item.Id, {
                            ReturnedQuantity: item.ReturnedQuantity + ret.quantity,
                        });
                        summaries.push(
                            ret.quantity + '× ' + (type ? type.Name : '') + ' (' + ret.condition + ')',
                        );
                    });
                    const remaining = Tables.InventoryRequestItems.findWhere(
                        (i) => i.RequestId === requestId && i.ReturnedQuantity < i.IssuedQuantity,
                    );
                    computedStatus = remaining.length === 0 ? 'returned' : 'issued';
                    insertSystemComment(
                        'inventory_request',
                        requestId,
                        actor.Name + ' returned ' + summaries.join(', ') + '.',
                    );
                    if (computedStatus === 'returned') {
                        Tables.InventoryRequests.updateById(requestId, {
                            Status: computedStatus,
                            AdminNote: note || request.AdminNote,
                        });
                    }
                } else if (action === 'cancel') {
                    requireMinLength(
                        note,
                        3,
                        'A note of at least 3 characters is required to cancel.',
                    );
                    if (['draft', 'submitted', 'approved'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'cancelled';
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        AdminNote: note,
                    });
                    insertSystemComment(
                        'inventory_request',
                        requestId,
                        actor.Name + ' cancelled this request. ' + note,
                    );
                } else if (action === 'close') {
                    if (['returned', 'rejected', 'cancelled'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'closed';
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        AdminNote: note || request.AdminNote,
                    });
                    insertSystemComment(
                        'inventory_request',
                        requestId,
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
    actor: Profile,
    newStatus: InventoryRequestStatus,
    dedupeRequestId: string,
): void {
    const request = Tables.InventoryRequests.findById(requestId);
    if (!request || request.RequesterId === actor.Id) return;
    sendNotificationEmail(
        request.RequesterId,
        'inventory:' + requestId + ':' + action + ':' + dedupeRequestId,
        'REQ-' + request.DisplayId + ' ' + newStatus,
        actor.Name + ' ' + action + 'd your equipment request.',
        '?section=inventory',
    );
}
