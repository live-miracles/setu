import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentWriter,
    fetchAll,
    fetchAllIn,
    newRequestId,
    inventoryLabelDto,
    profilesFor,
    requireNonEmpty,
    WITH_LOCATION,
    result,
    type Row,
} from './core.ts';
import { commentDto, groupByKey, REQUEST_PAGE_SIZE, requestPage } from './query.ts';
import { emailArg } from './validation.ts';
import {
    assertCanEdit,
    deleteRequest,
    isApprover,
    loadRequestAccess,
    parseParticipants,
    performRequestAction,
    resolveParticipants,
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

// Loads the requests with these ids, children included, as DTOs in the order
// given. Requests the caller may not see are left out (the reads run through the
// caller's own RLS-scoped client).
async function loadInventoryRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    ids: string[],
): Promise<Row[]> {
    if (!ids.length) return [];
    const byRequest = (table: string, column: string, order: string[]) =>
        fetchAllIn(ids, (chunk, from, to) => {
            let query = client.from(table).select('*').in(column, chunk);
            for (const key of order) query = query.order(key);
            return query.range(from, to);
        });
    const [requests, departments, items, participants, comments] = await Promise.all([
        byRequest('inventory_requests', 'id', ['id']),
        client
            .from('departments')
            .select('*')
            .then((res) => result(res) as Row[]),
        byRequest('inventory_request_items', 'request_id', ['id']),
        byRequest('inventory_request_participants', 'request_id', ['id']),
        byRequest('comments', 'inventory_request_id', ['created_at', 'id']),
    ]);
    // Only the label assignments, types and labels these requests use.
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
    attachItemLabels(items, assignments, labels);
    const typesById = new Map<string, Row>(types.map((x) => [x.id, x]));
    const departmentsById = new Map<string, Row>(departments.map((x) => [x.id, x]));
    const requestsById = new Map<string, Row>(requests.map((x) => [x.id, x]));
    const itemsByRequest = groupByKey(items, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const commentsByRequest = groupByKey(comments, 'inventory_request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
        ...comments.map((x) => x.author_id),
    ]);
    return ids
        .filter((id) => requestsById.has(id))
        .map((id) =>
            inventoryRequestDto(
                requestsById.get(id)!,
                typesById,
                departmentsById,
                profilesById,
                itemsByRequest.get(id) || [],
                participantsByRequest.get(id) || [],
                commentsByRequest.get(id) || [],
            ),
        );
}

// One page of requests. The database filters, searches, sorts and counts (see
// requestPage); only the 25 requests on the page are loaded.
export async function listInventoryRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const found = await requestPage(client, 'list_inventory_requests_page', page, query);
    return {
        items: await loadInventoryRequests(client, admin, found.ids),
        page: found.page,
        pageSize: REQUEST_PAGE_SIZE,
        totalCount: found.totalCount,
        statusCounts: found.statusCounts,
    };
}

export async function getInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [request] = await loadInventoryRequests(client, admin, [id]);
    if (!request) throw new Error('Request not found.');
    return request;
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
            const rawLabelIds = (Array.isArray(line.labelIds) ? (line.labelIds as unknown[]) : [])
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

export async function createInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    clientId?: string,
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

    const id = newRequestId(clientId);
    result(
        await admin.rpc('save_inventory_request_tx', {
            p_mode: 'create',
            p_request_id: id,
            p_fields: {
                name,
                requester_id: requestedBy.id,
                start_date: input.startDate,
                end_date: input.endDate,
                image_path: String(input.imageId || ''),
                department_id: department.id,
                lead_email: leadEmail,
            },
            p_items: items,
            p_participants: await resolveParticipants(admin, participantEmails),
            p_expected_status: 'draft',
        }),
    );
    return getInventoryRequest(client, admin, id);
}

export async function updateInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
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

    const access = await loadRequestAccess(admin, inventoryRequestKind, id, actor);
    assertCanEdit(actor, access);
    const existing = access.request;
    if (existing.requester_id !== requestedBy.id && !approver) {
        throw new Error('You cannot reassign the requester.');
    }
    result(
        await admin.rpc('save_inventory_request_tx', {
            p_mode: 'update',
            p_request_id: id,
            p_fields: {
                name,
                requester_id: requestedBy.id,
                start_date: input.startDate,
                end_date: input.endDate,
                department_id: department.id,
                lead_email: leadEmail,
                // Left out when the caller sent no image, which keeps the current one.
                ...(input.imageId === undefined ? {} : { image_path: String(input.imageId || '') }),
            },
            p_items: items,
            p_participants: await resolveParticipants(admin, participantEmails),
            p_expected_status: String(existing.status),
        }),
    );
    return getInventoryRequest(client, admin, id);
}

const inventoryRequestKind: RequestKindConfig = {
    kind: 'inventory',
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
): Promise<Row> {
    return updateRequestParticipants(inventoryRequestKind, client, admin, userId, id, input);
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
): Promise<string> {
    return performRequestAction(inventoryRequestKind, client, admin, userId, id, action, note);
}

export function deleteInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    return deleteRequest(inventoryRequestKind, client, admin, userId, id);
}
