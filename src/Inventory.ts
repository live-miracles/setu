const INVENTORY_ITEMS_PAGE_SIZE = 30;
const INVENTORY_REQUESTS_PAGE_SIZE = 20;

function buildInventoryItemDTO(
    item: InventoryItem,
    equipmentTypesById: Record<string, EquipmentType>,
    locationsById: Record<string, Place>,
): InventoryItemDTO {
    return Object.assign({}, item, {
        equipmentTypeName:
            (equipmentTypesById[item.EquipmentTypeId] || ({} as EquipmentType)).Name || '',
        locationName: (locationsById[item.LocationId] || ({} as Place)).Name || '',
    });
}

function buildInventoryRequestItemDTO(
    item: InventoryRequestItem,
    inventoryItemsById: Record<string, InventoryItem>,
): InventoryRequestItemDTO {
    return Object.assign({}, item, {
        itemName: (inventoryItemsById[item.InventoryItemId] || ({} as InventoryItem)).Name || '',
    });
}

function buildInventoryRequestDTO(
    request: InventoryRequest,
    itemsByRequest: Record<string, InventoryRequestItem[]>,
    inventoryItemsById: Record<string, InventoryItem>,
    profilesById: Record<string, Profile>,
    commentsByOwnerId: Record<string, CommentRecord[]>,
): InventoryRequestDTO {
    const items = (itemsByRequest[request.Id] || []).map((i) =>
        buildInventoryRequestItemDTO(i, inventoryItemsById),
    );
    const requester = profilesById[request.RequesterId];
    const comments = commentsFor('inventory_request', request.Id, commentsByOwnerId, profilesById);
    return Object.assign({}, request, {
        requesterName: requester ? requester.Name : '',
        items,
        comments,
    });
}

function listEquipmentTypes(): EquipmentType[] {
    requireUser();
    return Tables.EquipmentTypes.readAll();
}

function createEquipmentType(input: CreateEquipmentTypeInput, requestId: string): EquipmentType {
    const actor = requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('equipment_type:create', requestId, () => {
        const created = Tables.EquipmentTypes.insert({
            Name: name,
            Description: input.description || '',
            Requestable: input.requestable !== false,
            ImageDriveFileId: '',
        });
        logActivity(actor.Id, 'equipment_type', created.Id, 'create', null, created, {});
        return created;
    });
    return result;
}

function listInventoryItems(page: number): Paginated<InventoryItemDTO> {
    requireUser();
    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
    const locationsById = indexById(Tables.Locations.readAll());
    const dtos = Tables.InventoryItems.readAll()
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((item) => buildInventoryItemDTO(item, equipmentTypesById, locationsById));
    return paginate(dtos, page, INVENTORY_ITEMS_PAGE_SIZE);
}

function createInventoryItem(input: CreateInventoryItemInput, requestId: string): InventoryItemDTO {
    const actor = requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const equipmentType = Tables.EquipmentTypes.findById(input.equipmentTypeId);
    if (!equipmentType) throw new ValidationError('equipment_type_not_found');
    const location = Tables.Locations.findById(input.locationId);
    if (!location) throw new ValidationError('location_not_found');
    if (!(input.totalQuantity >= 0))
        throw new ValidationError('total_quantity_must_be_non_negative');

    const { result } = withLockedDedupe('inventory_item:create', requestId, () => {
        const created = Tables.InventoryItems.insert({
            EquipmentTypeId: input.equipmentTypeId,
            Name: name,
            LocationId: input.locationId,
            SerialNumber: input.serialNumber || '',
            TotalQuantity: input.totalQuantity,
            AvailableQuantity: input.totalQuantity,
            ImageDriveFileId: '',
            AdminNotes: input.adminNotes || '',
        });
        logActivity(actor.Id, 'inventory_item', created.Id, 'create', null, created, {});
        return created;
    });

    return buildInventoryItemDTO(
        result,
        { [equipmentType.Id]: equipmentType },
        { [location.Id]: location },
    );
}

function listInventoryRequests(page: number): Paginated<InventoryRequestDTO> {
    requireUser();
    const itemsByRequest = groupBy(Tables.InventoryRequestItems.readAll(), (i) => i.RequestId);
    const inventoryItemsById = indexById(Tables.InventoryItems.readAll());
    const profilesById = indexById(Tables.Profiles.readAll());
    const commentsByOwnerId = groupBy(Tables.Comments.readAll(), (c) => c.OwnerId);
    const dtos = Tables.InventoryRequests.readAll()
        .map((r) =>
            buildInventoryRequestDTO(
                r,
                itemsByRequest,
                inventoryItemsById,
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
        const inventoryItem = Tables.InventoryItems.findById(line.inventoryItemId);
        if (!inventoryItem) throw new ValidationError('inventory_item_not_found');
        return { inventoryItem, quantity: line.quantity };
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
                InventoryItemId: line.inventoryItem.Id,
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
        logActivity(
            actor.Id,
            'inventory_request',
            created.Id,
            'create_and_submit',
            null,
            created,
            {},
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
    const inventoryItemsById = indexById(Tables.InventoryItems.readAll());
    return buildInventoryRequestDTO(
        request,
        { [request.Id]: requestItems },
        inventoryItemsById,
        indexById([actor]),
        { [request.Id]: [comment] },
    );
}

// Ported from the source app's `perform_inventory_request_action` Postgres
// function. Wrapped end-to-end (read + validate + every mutated row + the
// activity log write) in one withLockedDedupe/withLock, replacing Postgres's
// per-row `FOR UPDATE` locks with one coarse script-global mutex.
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
            const before = Object.assign({}, request);
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
                    items.forEach((item) => {
                        const invItem = Tables.InventoryItems.findById(item.InventoryItemId);
                        if (!invItem || invItem.AvailableQuantity < item.Quantity)
                            throw new ValidationError('insufficient_inventory');
                        Tables.InventoryItems.updateById(invItem.Id, {
                            AvailableQuantity: invItem.AvailableQuantity - item.Quantity,
                        });
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
                        const invItem = Tables.InventoryItems.findById(item.InventoryItemId)!;
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
                        if (ret.condition === 'good') {
                            Tables.InventoryItems.updateById(invItem.Id, {
                                AvailableQuantity: invItem.AvailableQuantity + ret.quantity,
                            });
                        }
                        summaries.push(
                            ret.quantity + '× ' + invItem.Name + ' (' + ret.condition + ')',
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

            const after = Tables.InventoryRequests.findById(requestId);
            logActivity(actor.Id, 'inventory_request', requestId, action, before, after, {});
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
