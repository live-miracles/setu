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
    const deductions: Record<string, number> = {};
    Tables.InventoryRequests.readAll().forEach((request) => {
        if (request.Status !== 'issued') return;
        parseInventoryItemsJson(request.ItemsJson).forEach((item) => {
            deductions[item.InventoryTypeId] =
                (deductions[item.InventoryTypeId] || 0) + item.Quantity;
        });
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
    inventoryTypesById: Record<string, InventoryType>,
    usersByEmail: Record<string, User>,
    departmentsById: Record<string, Department>,
    commentsByRequestId: Record<string, CommentRecord[]>,
): InventoryRequestDTO {
    const items = parseInventoryItemsJson(request.ItemsJson).map((i) =>
        buildInventoryItemDTO(i, inventoryTypesById),
    );
    const requester = usersByEmail[request.UserId];
    const department = departmentsById[request.DepartmentId];
    const comments = commentsFor(request.Id, commentsByRequestId, usersByEmail);
    return Object.assign({}, request, {
        userName: requester ? requester.Name : '',
        departmentName: department ? department.Name : '',
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

function inventoryRequestSortValue(
    request: InventoryRequestDTO,
    sortBy: InventoryRequestQuery['sortBy'],
): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'startDate') return request.StartDate;
    if (sortBy === 'endDate') return request.EndDate;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

function listInventoryRequests(
    page: number,
    query: InventoryRequestQuery = {},
): Paginated<InventoryRequestDTO> {
    const actor = requireUser();
    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);
    const departmentsById = indexBy(Tables.Departments.readAll(), (d) => d.Id);
    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());
    const statuses = query.statuses || [];
    const dtos = Tables.InventoryRequests.readAll()
        .filter((r) => canViewRequest(actor, r.UserId, parseParticipants(r.Participants)))
        .map((r) =>
            buildInventoryRequestDTO(
                r,
                inventoryTypesById,
                usersByEmail,
                departmentsById,
                commentsByRequestId,
            ),
        )
        .filter((request) => statuses.length === 0 || statuses.indexOf(request.Status) !== -1)
        .filter(
            (request) =>
                !query.inventoryTypeId ||
                request.items.some((item) => item.InventoryTypeId === query.inventoryTypeId),
        )
        .filter((request) =>
            matchesSearch(query.q, [
                'REQ-' + request.DisplayId,
                request.Name,
                request.userName,
                request.departmentName,
                request.LeadEmail,
                request.participants.join(' '),
                request.items.map((item) => item.itemName).join(' '),
            ]),
        );
    const sortBy = query.sortBy;
    if (sortBy) {
        const direction = query.sortDirection || 'asc';
        dtos.sort((a, b) =>
            compareQueryValues(
                inventoryRequestSortValue(a, sortBy),
                inventoryRequestSortValue(b, sortBy),
                direction,
            ),
        );
    } else {
        dtos.sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    }
    return paginate(dtos, page, INVENTORY_REQUESTS_PAGE_SIZE);
}

function getInventoryRequest(id: string): InventoryRequestDTO {
    const actor = requireUser();
    const request = Tables.InventoryRequests.findById(id);
    if (
        !request ||
        !canViewRequest(actor, request.UserId, parseParticipants(request.Participants))
    ) {
        throw new ValidationError('request_not_found');
    }
    return buildInventoryRequestDTO(
        request,
        indexBy(Tables.InventoryTypes.readAll(), (type) => type.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
        groupCommentsByRequestId(Tables.Comments.readAll()),
    );
}

function createInventoryRequest(
    input: CreateInventoryRequestInput,
    requestId: string,
): InventoryRequestDTO {
    const actor = requireUser();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const userId = (input.userId || actor.Email).toLowerCase();
    const requestedBy = Tables.Users.findById(userId);
    if (!requestedBy) throw new ValidationError('requester_not_found');
    if (requestedBy.Email !== actor.Email && !canApprove(actor)) {
        throw new AuthorizationError('requester_edit_not_allowed');
    }
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new ValidationError('endDate must be on or after startDate.');
    }
    const lines = (input.items || []).map((line) => {
        if (!(line.quantity > 0)) throw new ValidationError('quantity_must_be_positive');
        const inventoryType = Tables.InventoryTypes.findById(line.inventoryTypeId);
        if (!inventoryType) throw new ValidationError('inventory_type_not_found');
        const condition = (line.condition || '') as ReturnCondition | '';
        if (condition && ['good', 'damaged', 'missing'].indexOf(condition) === -1) {
            throw new ValidationError('invalid_return_condition');
        }
        return { inventoryType, quantity: line.quantity, condition };
    });
    const imageId = input.imageId || '';
    const participants = parseParticipants(input.participants);
    const departmentId = requireNonEmpty(input.departmentId, 'Department is required.');
    const department = Tables.Departments.findById(departmentId);
    if (!department) throw new ValidationError('department_not_found');
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();

    const { result } = withLockedDedupe('inventory_request:create', requestId, () => {
        const items = lines.map((line) => ({
            InventoryTypeId: line.inventoryType.Id,
            Quantity: line.quantity,
            Condition: line.condition,
        }));
        const created = Tables.InventoryRequests.insert({
            DisplayId: getNextDisplayId('inventory_request'),
            Name: name,
            UserId: requestedBy.Email,
            StartDate: input.startDate,
            EndDate: input.endDate,
            Status: 'draft',
            ImageId: imageId,
            DepartmentId: department.Id,
            LeadEmail: leadEmail,
            Participants: formatParticipants(participants),
            ItemsJson: stringifyInventoryItems(items),
        });
        const comment = insertActionComment(
            'inventory',
            created.Id,
            actor.Email,
            actor.Name + ' saved this draft.',
            false,
        );
        return { request: created, comment };
    });
    const { request, comment } = result;

    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    return buildInventoryRequestDTO(
        request,
        inventoryTypesById,
        indexBy([actor], (u) => u.Email),
        { [department.Id]: department },
        { [request.Id]: [comment] },
    );
}

function updateInventoryRequest(
    id: string,
    input: UpdateInventoryRequestInput,
    requestId: string,
): InventoryRequestDTO {
    const actor = requireUser();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const userId = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = Tables.Users.findById(userId);
    if (!requestedBy) throw new ValidationError('requester_not_found');
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new ValidationError('endDate must be on or after startDate.');
    }
    const lines = (input.items || []).map((line) => {
        if (!(line.quantity > 0)) throw new ValidationError('quantity_must_be_positive');
        const inventoryType = Tables.InventoryTypes.findById(line.inventoryTypeId);
        if (!inventoryType) throw new ValidationError('inventory_type_not_found');
        const condition = (line.condition || '') as ReturnCondition | '';
        if (condition && ['good', 'damaged', 'missing'].indexOf(condition) === -1) {
            throw new ValidationError('invalid_return_condition');
        }
        return { inventoryType, quantity: line.quantity, condition };
    });
    const participants = parseParticipants(input.participants);
    const departmentId = requireNonEmpty(input.departmentId, 'Department is required.');
    const department = Tables.Departments.findById(departmentId);
    if (!department) throw new ValidationError('department_not_found');
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();

    const { result } = withLockedDedupe('inventory_request:update:' + id, requestId, () => {
        const request = Tables.InventoryRequests.findById(id);
        if (!request) throw new ValidationError('request_not_found');
        const requestParticipants = parseParticipants(request.Participants);
        const isOwner =
            request.UserId === actor.Email || requestParticipants.indexOf(actor.Email) !== -1;
        if (!(canApprove(actor) || (isOwner && request.Status === 'draft'))) {
            throw new AuthorizationError('edit_not_allowed');
        }
        if (request.UserId !== requestedBy.Email && !canApprove(actor)) {
            throw new AuthorizationError('requester_edit_not_allowed');
        }
        const updated = Tables.InventoryRequests.updateById(id, {
            Name: name,
            UserId: requestedBy.Email,
            StartDate: input.startDate,
            EndDate: input.endDate,
            DepartmentId: department.Id,
            LeadEmail: leadEmail,
            Participants: formatParticipants(participants),
            ItemsJson: stringifyInventoryItems(
                lines.map((line) => ({
                    InventoryTypeId: line.inventoryType.Id,
                    Quantity: line.quantity,
                    Condition: line.condition,
                })),
            ),
        });
        const comment = insertActionComment(
            'inventory',
            id,
            actor.Email,
            actor.Name + ' updated this request.',
            false,
        );
        return { request: updated, comment };
    });

    return buildInventoryRequestDTO(
        result.request,
        indexBy(Tables.InventoryTypes.readAll(), (type) => type.Id),
        indexBy(Tables.Users.readAll(), (user) => user.Email),
        indexBy(Tables.Departments.readAll(), (department) => department.Id),
        { [id]: [result.comment] },
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

    const { result: nextStatus } = withLockedDedupe(
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
                if (parseInventoryItemsJson(request.ItemsJson).length === 0) {
                    throw new ValidationError('At least one item is required.');
                }
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
                    if (request.Status !== 'submitted')
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'rejected';
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' rejected this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'issue') {
                    if (request.Status !== 'approved')
                        throw new ValidationError('invalid_transition');
                    const items = parseInventoryItemsJson(request.ItemsJson);
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
                    const items = parseInventoryItemsJson(request.ItemsJson);
                    if (returnItems.length !== items.length)
                        throw new ValidationError('invalid_return_items');

                    const inventoryTypesById = indexBy(
                        Tables.InventoryTypes.readAll(),
                        (t) => t.Id,
                    );
                    const summaries: string[] = [];
                    returnItems.forEach((ret, index) => {
                        const item = items[index];
                        const type = inventoryTypesById[item.InventoryTypeId];
                        item.Condition = ret.condition;
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
                    Tables.InventoryRequests.updateById(requestId, {
                        Status: computedStatus,
                        ItemsJson: stringifyInventoryItems(items),
                    });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' returned ' + summaries.join(', ') + '.',
                    );
                } else if (action === 'cancel') {
                    if (['draft', 'submitted', 'approved'].indexOf(request.Status) === -1)
                        throw new ValidationError('invalid_transition');
                    computedStatus = 'cancelled';
                    Tables.InventoryRequests.updateById(requestId, { Status: computedStatus });
                    insertActionComment(
                        'inventory',
                        requestId,
                        actor.Email,
                        actor.Name + ' cancelled this request.' + (note ? ' ' + note : ''),
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

    return nextStatus;
}
