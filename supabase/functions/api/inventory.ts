import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentWriter,
    fetchAll,
    fetchAllIn,
    inventoryLabelDto,
    profilesFor,
    requireNonEmpty,
    WITH_LOCATION,
    result,
    withLockedDedupe,
    type Row,
} from './core.ts';
import {
    commentDto,
    commentsByTargetFor,
    compareQueryValues,
    groupByKey,
    latestActivityAt,
    matchesSearch,
    paginate,
} from './query.ts';
import { emailArg } from './validation.ts';
import {
    assertCanEdit,
    deleteRequest,
    isApprover,
    loadRequestAccess,
    parseParticipants,
    performRequestAction,
    replaceParticipants,
    requireDepartment,
    requireRequesterProfile,
    updateRequestParticipants,
    type RequestKindConfig,
} from './requests.ts';

export function inventoryRequestDto(
    x: Row,
    typesById: Map<string, Row>,
    departmentsById: Map<string, Row>,
    profilesById: Map<string, Row>,
    items: Row[],
    participants: Row[],
    comments: Row[],
): Row {
    return {
        Id: x.id,
        DisplayId: x.display_id,
        Name: x.name,
        UserId: profilesById.get(x.requester_id)?.email || '',
        StartDate: x.start_date,
        EndDate: x.end_date,
        Status: x.status,
        ImageId: x.image_path,
        DepartmentId: x.department_id || '',
        LeadEmail: x.lead_email,
        Participants: '',
        ItemsJson: '',
        CommentsJson: '',
        userName: profilesById.get(x.requester_id)?.name || '',
        departmentName: departmentsById.get(x.department_id)?.name || '',
        participants: participants
            .map((p) => profilesById.get(p.profile_id)?.email || p.external_email || '')
            .filter(Boolean),
        items: items.map((i) => ({
            InventoryTypeId: i.inventory_type_id,
            Quantity: i.quantity,
            Condition: i.return_condition || '',
            itemName: [
                typesById.get(i.inventory_type_id)?.brand,
                typesById.get(i.inventory_type_id)?.name,
            ]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .join(' · '),
            labels: (i.labels || []).map(inventoryLabelDto),
        })),
        comments: comments.map((c) => commentDto(c, profilesById)),
    };
}

// Sets `labels` on each request item row from the label assignments, so the
// request DTO builder can map them. Used by the list, detail and dashboard reads.
export function attachItemLabels(items: Row[], assignments: Row[], labels: Row[]): void {
    const labelsById = new Map(labels.map((label) => [label.id, label]));
    const labelsByItemId = new Map<string, Row[]>();
    assignments.forEach((assignment) => {
        const label = labelsById.get(assignment.inventory_type_label_id);
        if (!label) return;
        const values = labelsByItemId.get(assignment.request_item_id) || [];
        values.push(label);
        labelsByItemId.set(assignment.request_item_id, values);
    });
    items.forEach((item) => {
        item.labels = labelsByItemId.get(item.id) || [];
    });
}

export function inventoryRequestSortValue(request: Row, sortBy: unknown): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'startDate') return request.StartDate;
    if (sortBy === 'endDate') return request.EndDate;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

export async function listInventoryRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const allRows = (table: string) =>
        fetchAll((from, to) => client.from(table).select('*').order('id').range(from, to));
    const [departments, types, requests, items, requestItemLabels, labels, participants] =
        await Promise.all([
            client
                .from('departments')
                .select('*')
                .then((res) => result(res) as Row[]),
            allRows('inventory_types'),
            allRows('inventory_requests'),
            allRows('inventory_request_items'),
            allRows('inventory_request_item_labels'),
            allRows('inventory_type_labels'),
            allRows('inventory_request_participants'),
        ]);
    const typesById = new Map(types.map((x) => [x.id, x]));
    const departmentsById = new Map(departments.map((x) => [x.id, x]));
    attachItemLabels(items, requestItemLabels, labels);
    const commentsByTarget = await commentsByTargetFor(client, 'inventory_request_id');
    const itemsByRequest = groupByKey(items, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
        ...[...commentsByTarget.values()].flat().map((x) => x.author_id),
    ]);

    const dtos = requests.map((x) =>
        inventoryRequestDto(
            x,
            typesById,
            departmentsById,
            profilesById,
            itemsByRequest.get(x.id) || [],
            participantsByRequest.get(x.id) || [],
            commentsByTarget.get(x.id) || [],
        ),
    );

    const statuses: string[] = query.statuses || [];
    const matching = dtos
        .filter(
            (r) =>
                !query.inventoryTypeId ||
                r.items.some((i: Row) => i.InventoryTypeId === query.inventoryTypeId),
        )
        .filter((r) => !query.departmentId || r.DepartmentId === query.departmentId)
        .filter((r) => !query.requesterEmail || r.UserId === query.requesterEmail)
        .filter(
            (r) =>
                !query.labelId ||
                r.items.some((i: Row) => i.labels.some((label: Row) => label.Id === query.labelId)),
        )
        .filter((r) =>
            matchesSearch(query.q, [
                'REQ-' + r.DisplayId,
                r.Name,
                r.userName,
                r.departmentName,
                r.LeadEmail,
                r.participants.join(' '),
                r.items.map((i: Row) => i.itemName).join(' '),
            ]),
        );
    // Counted before the status filter so every status option keeps its badge.
    const statusCounts: Row = {};
    matching.forEach((r) => {
        statusCounts[r.Status] = (statusCounts[r.Status] || 0) + 1;
    });
    const filtered = matching.filter(
        (r) => statuses.length === 0 || statuses.indexOf(r.Status) !== -1,
    );

    if (query.sortBy) {
        filtered.sort((a, b) =>
            compareQueryValues(
                inventoryRequestSortValue(a, query.sortBy),
                inventoryRequestSortValue(b, query.sortBy),
                query.sortDirection,
            ),
        );
    } else {
        filtered.sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        );
    }
    return { ...paginate(filtered, page, 25), statusCounts };
}

export async function getInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [requestRes, departmentsRes, itemsRes, participantsRes, commentsRes] = await Promise.all([
        client.from('inventory_requests').select('*').eq('id', id).single(),
        client.from('departments').select('*'),
        client.from('inventory_request_items').select('*').eq('request_id', id),
        client.from('inventory_request_participants').select('*').eq('request_id', id),
        client.from('comments').select('*').eq('inventory_request_id', id).order('created_at'),
    ]);
    const request = result(requestRes) as Row;
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const items = result(itemsRes) as Row[];
    // Only the label assignments, types and labels this request uses: reading
    // the whole catalogs (and every assignment) both wastes work and hits the
    // row cap, silently dropping labels from the detail page.
    const assignments = await fetchAllIn(
        items.map((item) => item.id),
        (chunk, from, to) =>
            client
                .from('inventory_request_item_labels')
                .select('*')
                .in('request_item_id', chunk)
                .order('id')
                .range(from, to),
    );
    const [types, labels] = await Promise.all([
        fetchAllIn(
            items.map((item) => item.inventory_type_id),
            (chunk, from, to) =>
                client
                    .from('inventory_types')
                    .select('*')
                    .in('id', chunk)
                    .order('id')
                    .range(from, to),
        ),
        fetchAllIn(
            assignments.map((assignment) => assignment.inventory_type_label_id),
            (chunk, from, to) =>
                client
                    .from('inventory_type_labels')
                    .select(WITH_LOCATION)
                    .in('id', chunk)
                    .order('id')
                    .range(from, to),
        ),
    ]);
    const typesById = new Map(types.map((x) => [x.id, x]));
    attachItemLabels(items, assignments, labels);
    const participants = result(participantsRes) as Row[];
    const comments = result(commentsRes) as Row[];
    const profilesById = await profilesFor(admin, [
        request.requester_id,
        ...participants.map((x) => x.profile_id),
        ...comments.map((x) => x.author_id),
    ]);
    return inventoryRequestDto(
        request,
        typesById,
        departmentsById,
        profilesById,
        items,
        participants,
        comments,
    );
}

const MAX_REQUEST_ITEM_LINES = 100;
const MAX_ITEM_QUANTITY = 100000;
const MAX_LABELS_PER_ITEM = 100;

// Only approvers may request a type marked not requestable (the UI hides those
// types from everyone else); a type already on the request stays allowed so
// editing an existing request is never blocked by a later catalog change.
export async function validateInventoryItems(
    admin: SupabaseClient,
    items: unknown,
    options: { allowNonRequestable?: boolean; existingTypeIds?: Set<string> } = {},
): Promise<Row[]> {
    if (!Array.isArray(items)) throw new Error('Request items must be a list.');
    if (items.length > MAX_REQUEST_ITEM_LINES) {
        throw new Error(`A request can have at most ${MAX_REQUEST_ITEM_LINES} item lines.`);
    }
    const validated = await Promise.all(
        items.map(async (line) => {
            const quantity = Number(line.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
                throw new Error('Quantity must be a whole number greater than zero.');
            }
            const { data: type, error } = await admin
                .from('inventory_types')
                .select('id, requestable')
                .eq('id', line.inventoryTypeId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!type) throw new Error('Inventory type not found.');
            if (
                type.requestable === false &&
                !options.allowNonRequestable &&
                !options.existingTypeIds?.has(type.id)
            ) {
                throw new Error('This inventory type cannot be requested.');
            }
            const condition = String(line.condition || '');
            if (condition && ['returned', 'damaged', 'missing'].indexOf(condition) === -1) {
                throw new Error('Invalid return condition.');
            }
            const rawLabelIds = (Array.isArray(line.labelIds) ? line.labelIds : [])
                .map((labelId) => String(labelId).trim())
                .filter(Boolean);
            if (rawLabelIds.length > MAX_LABELS_PER_ITEM) {
                throw new Error(`An item can have at most ${MAX_LABELS_PER_ITEM} labels.`);
            }
            const labelIds = Array.from(new Set(rawLabelIds));
            if (labelIds.length !== rawLabelIds.length) {
                throw new Error('A label was added more than once.');
            }
            if (labelIds.length) {
                const labels = result(
                    await admin
                        .from('inventory_type_labels')
                        .select('id, inventory_type_id')
                        .in('id', labelIds),
                ) as Row[];
                if (
                    labels.length !== labelIds.length ||
                    labels.some((label) => label.inventory_type_id !== line.inventoryTypeId)
                ) {
                    throw new Error('One or more labels do not belong to this inventory type.');
                }
            }
            return {
                inventory_type_id: line.inventoryTypeId,
                quantity,
                return_condition: condition || null,
                label_ids: labelIds,
            };
        }),
    );
    const seenLabelIds = new Set<string>();
    validated.forEach((item) => {
        item.label_ids.forEach((labelId: string) => {
            if (seenLabelIds.has(labelId)) throw new Error('A label was added more than once.');
            seenLabelIds.add(labelId);
        });
    });
    return validated;
}

// Replaces an inventory/program request's child rows wholesale — the
// frontend always sends the full desired list, same as the old JSON-column
// writes did, so delete-then-insert reproduces that "whole column
// overwrite" semantics. Not atomic across the two statements (Supabase-js
// has no client-side multi-table transaction); the withLockedDedupe wrapper
// around every caller at least rules out a concurrent duplicate submission
// racing this same sequence.
export async function replaceInventoryRequestItems(
    admin: SupabaseClient,
    requestId: string,
    items: Row[],
): Promise<void> {
    const { error: deleteError } = await admin
        .from('inventory_request_items')
        .delete()
        .eq('request_id', requestId);
    if (deleteError) throw new Error(deleteError.message);
    for (const item of items) {
        const labelIds = Array.isArray(item.label_ids) ? item.label_ids : [];
        const inserted = result(
            await admin
                .from('inventory_request_items')
                .insert({
                    request_id: requestId,
                    inventory_type_id: item.inventory_type_id,
                    quantity: item.quantity,
                    return_condition: item.return_condition,
                })
                .select('id')
                .single(),
        ) as Row;
        if (!labelIds.length) continue;
        const { error } = await admin.from('inventory_request_item_labels').insert(
            labelIds.map((labelId) => ({
                request_item_id: inserted.id,
                inventory_type_label_id: labelId,
            })),
        );
        if (error) throw new Error(error.message);
    }
}

export async function createInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const requesterEmail = String(input.userId || actor.email).toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    const approver = isApprover(actor);
    if (requestedBy.email !== actor.email && !approver) {
        throw new Error('You cannot create a request on behalf of another user.');
    }
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new Error('End date must be on or after start date.');
    }
    const items = await validateInventoryItems(admin, input.items || [], {
        allowNonRequestable: approver,
    });
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory_request:create',
        requestId,
        userId,
        async () => {
            const created = result(
                await admin
                    .from('inventory_requests')
                    .insert({
                        name,
                        requester_id: requestedBy.id,
                        start_date: input.startDate,
                        end_date: input.endDate,
                        status: 'draft',
                        image_path: String(input.imageId || ''),
                        department_id: department.id,
                        lead_email: leadEmail,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            await replaceInventoryRequestItems(admin, created.id, items);
            await replaceParticipants(
                admin,
                'inventory_request_participants',
                created.id,
                participantEmails,
            );
            return getInventoryRequest(client, admin, created.id);
        },
    );
    return dto;
}

export async function updateInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentWriter(client, userId);
    const approver = isApprover(actor);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const requesterEmail = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new Error('End date must be on or after start date.');
    }
    const existingTypeIds = new Set(
        (
            result(
                await admin
                    .from('inventory_request_items')
                    .select('inventory_type_id')
                    .eq('request_id', id),
            ) as Row[]
        ).map((row) => row.inventory_type_id as string),
    );
    const items = await validateInventoryItems(admin, input.items || [], {
        allowNonRequestable: approver,
        existingTypeIds,
    });
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = emailArg(input.leadEmail, 'Lead email is required.');
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory_request:update:' + id,
        requestId,
        userId,
        async () => {
            const access = await loadRequestAccess(admin, inventoryRequestKind, id, actor);
            assertCanEdit(actor, access);
            const existing = access.request;
            if (existing.requester_id !== requestedBy.id && !approver) {
                throw new Error('You cannot reassign the requester.');
            }
            const updated = result(
                await admin
                    .from('inventory_requests')
                    .update({
                        name,
                        requester_id: requestedBy.id,
                        start_date: input.startDate,
                        end_date: input.endDate,
                        department_id: department.id,
                        lead_email: leadEmail,
                        image_path:
                            input.imageId === undefined
                                ? existing.image_path
                                : String(input.imageId || ''),
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            await replaceInventoryRequestItems(admin, id, items);
            await replaceParticipants(
                admin,
                inventoryRequestKind.participantsTable,
                id,
                participantEmails,
            );
            return updated;
        },
    );
    return getInventoryRequest(client, admin, dto.id);
}

const inventoryRequestKind: RequestKindConfig = {
    kind: 'inventory',
    scope: 'inventory_request',
    table: 'inventory_requests',
    participantsTable: 'inventory_request_participants',
    actionRpc: 'perform_inventory_request_action_tx',
    read: getInventoryRequest,
};

export function updateInventoryRequestParticipants(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    return updateRequestParticipants(
        inventoryRequestKind,
        client,
        admin,
        userId,
        id,
        input,
        requestId,
    );
}

// The RPC owns the request row lock, inventory type locks, validation, status
// update and activity comment so concurrent approvers cannot oversubscribe
// stock or commit conflicting transitions.
export function performInventoryRequestAction(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    action: string,
    note: string,
    dedupeRequestId: string,
): Promise<string> {
    return performRequestAction(
        inventoryRequestKind,
        client,
        admin,
        userId,
        id,
        action,
        note,
        dedupeRequestId,
    );
}

export function deleteInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    return deleteRequest(inventoryRequestKind, client, admin, userId, id, requestId);
}
