import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    currentProfile,
    profilesFor,
    requireNonEmpty,
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
            itemName: typesById.get(i.inventory_type_id)?.name || '',
            labels: (i.labels || []).map((label: Row) => ({
                Id: label.id,
                DisplayId: label.display_id,
                InventoryTypeId: label.inventory_type_id,
                Name: label.name,
            })),
        })),
        comments: comments.map((c) => commentDto(c, profilesById)),
    };
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
    const [
        typesRes,
        departmentsRes,
        requestsRes,
        itemsRes,
        requestItemLabelsRes,
        labelsRes,
        participantsRes,
    ] = await Promise.all([
        client.from('inventory_types').select('*'),
        client.from('departments').select('*'),
        client.from('inventory_requests').select('*'),
        client.from('inventory_request_items').select('*'),
        client.from('inventory_request_item_labels').select('*'),
        client.from('inventory_type_labels').select('*'),
        client.from('inventory_request_participants').select('*'),
    ]);
    const typesById = new Map((result(typesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const requests = result(requestsRes) as Row[];
    const items = result(itemsRes) as Row[];
    const requestItemLabels = result(requestItemLabelsRes) as Row[];
    const labelsById = new Map((result(labelsRes) as Row[]).map((label) => [label.id, label]));
    const labelsByItemId = new Map<string, Row[]>();
    requestItemLabels.forEach((assignment) => {
        const label = labelsById.get(assignment.inventory_type_label_id);
        if (!label) return;
        const values = labelsByItemId.get(assignment.request_item_id) || [];
        values.push(label);
        labelsByItemId.set(assignment.request_item_id, values);
    });
    items.forEach((item) => {
        item.labels = labelsByItemId.get(item.id) || [];
    });
    const participants = result(participantsRes) as Row[];
    const commentsByTarget = await commentsByTargetFor(client, admin, 'inventory_request_id');
    const itemsByRequest = groupByKey(items, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
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
    const filtered = dtos
        .filter((r) => statuses.length === 0 || statuses.indexOf(r.Status) !== -1)
        .filter(
            (r) =>
                !query.inventoryTypeId ||
                r.items.some((i: Row) => i.InventoryTypeId === query.inventoryTypeId),
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
    return paginate(filtered, page, 25);
}

export async function getInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [
        requestRes,
        typesRes,
        departmentsRes,
        itemsRes,
        requestItemLabelsRes,
        labelsRes,
        participantsRes,
        commentsRes,
    ] = await Promise.all([
        client.from('inventory_requests').select('*').eq('id', id).single(),
        client.from('inventory_types').select('*'),
        client.from('departments').select('*'),
        client.from('inventory_request_items').select('*').eq('request_id', id),
        client.from('inventory_request_item_labels').select('*'),
        client.from('inventory_type_labels').select('*'),
        client.from('inventory_request_participants').select('*').eq('request_id', id),
        client.from('comments').select('*').eq('inventory_request_id', id).order('created_at'),
    ]);
    const request = result(requestRes) as Row;
    const typesById = new Map((result(typesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const items = result(itemsRes) as Row[];
    const requestItemIds = new Set(items.map((item) => item.id));
    const labelsById = new Map((result(labelsRes) as Row[]).map((label) => [label.id, label]));
    const labelsByItemId = new Map<string, Row[]>();
    (result(requestItemLabelsRes) as Row[]).forEach((assignment) => {
        if (!requestItemIds.has(assignment.request_item_id)) return;
        const label = labelsById.get(assignment.inventory_type_label_id);
        if (!label) return;
        const values = labelsByItemId.get(assignment.request_item_id) || [];
        values.push(label);
        labelsByItemId.set(assignment.request_item_id, values);
    });
    items.forEach((item) => {
        item.labels = labelsByItemId.get(item.id) || [];
    });
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

// Shared by inventory and program request writes (ported from Utils.ts).
// Trimmed/lowercased/deduped so membership checks are plain string equality.
export function parseParticipants(raw: unknown): string[] {
    const seen = new Set<string>();
    String(raw || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
        .forEach((email) => seen.add(email));
    return Array.from(seen);
}

// Resolves each participant email to a profile row when one exists (citext,
// case-insensitive), or keeps it as an external_email otherwise — mirrors
// the child participant tables' `num_nonnulls(profile_id, external_email)
// = 1` constraint.
export async function resolveParticipants(admin: SupabaseClient, emails: string[]): Promise<Row[]> {
    if (!emails.length) return [];
    const profiles = result(
        await admin.from('profiles').select('id, email').in('email', emails),
    ) as Row[];
    const profileIdByEmail = new Map(profiles.map((p) => [String(p.email).toLowerCase(), p.id]));
    return emails.map((email) => {
        const profileId = profileIdByEmail.get(email);
        return profileId
            ? { profile_id: profileId, external_email: null }
            : { profile_id: null, external_email: email };
    });
}

export async function insertActionComment(
    admin: SupabaseClient,
    targetType: 'inventory_request' | 'program_request',
    targetId: string,
    authorId: string,
    message: string,
): Promise<void> {
    const { error } = await admin.from('comments').insert({
        ...(targetType === 'inventory_request'
            ? { inventory_request_id: targetId }
            : { program_request_id: targetId }),
        author_id: authorId,
        message,
    });
    if (error) throw new Error(error.message);
}

export async function requireRequesterProfile(admin: SupabaseClient, email: string): Promise<Row> {
    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Requester not found.');
    return data;
}

export async function requireDepartment(admin: SupabaseClient, id: string): Promise<Row> {
    const { data, error } = await admin.from('departments').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Department not found.');
    return data;
}

export async function validateInventoryItems(admin: SupabaseClient, items: Row[]): Promise<Row[]> {
    const validated = await Promise.all(
        (items || []).map(async (line) => {
            if (!(Number(line.quantity) > 0)) throw new Error('Quantity must be positive.');
            const { data: type, error } = await admin
                .from('inventory_types')
                .select('id')
                .eq('id', line.inventoryTypeId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!type) throw new Error('Inventory type not found.');
            const condition = String(line.condition || '');
            if (condition && ['returned', 'damaged', 'missing'].indexOf(condition) === -1) {
                throw new Error('Invalid return condition.');
            }
            const rawLabelIds = (Array.isArray(line.labelIds) ? line.labelIds : [])
                .map((labelId) => String(labelId).trim())
                .filter(Boolean);
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
                quantity: Number(line.quantity),
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

export async function replaceParticipants(
    admin: SupabaseClient,
    table: 'inventory_request_participants' | 'program_request_participants',
    requestId: string,
    participantEmails: string[],
): Promise<void> {
    const { error: deleteError } = await admin.from(table).delete().eq('request_id', requestId);
    if (deleteError) throw new Error(deleteError.message);
    const participants = await resolveParticipants(admin, participantEmails);
    if (!participants.length) return;
    const { error } = await admin
        .from(table)
        .insert(participants.map((p) => ({ ...p, request_id: requestId })));
    if (error) throw new Error(error.message);
}

export async function createInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const requesterEmail = String(input.userId || actor.email).toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    if (requestedBy.email !== actor.email && !isApprover) {
        throw new Error('You cannot create a request on behalf of another user.');
    }
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new Error('End date must be on or after start date.');
    }
    const items = await validateInventoryItems(admin, input.items || []);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory_request:create',
        requestId,
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
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const name = requireNonEmpty(input.name, 'Name is required.');
    const requesterEmail = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
        throw new Error('End date must be on or after start date.');
    }
    const items = await validateInventoryItems(admin, input.items || []);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory_request:update:' + id,
        requestId,
        async () => {
            const [existingRes, participantsRes] = await Promise.all([
                admin.from('inventory_requests').select('*').eq('id', id).single(),
                admin.from('inventory_request_participants').select('*').eq('request_id', id),
            ]);
            const existing = result(existingRes) as Row;
            const existingParticipants = result(participantsRes) as Row[];
            const isOwner =
                existing.requester_id === actor.id ||
                existingParticipants.some((p) => p.profile_id === actor.id);
            if (!(isApprover || (isOwner && existing.status === 'draft'))) {
                throw new Error('You are not allowed to edit this request.');
            }
            if (existing.requester_id !== requestedBy.id && !isApprover) {
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
                'inventory_request_participants',
                id,
                participantEmails,
            );
            return updated;
        },
    );
    return getInventoryRequest(client, admin, dto.id);
}

export async function updateInventoryRequestParticipants(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const participantEmails = parseParticipants(input.participants);
    await withLockedDedupe(admin, 'inventory_request:participants:' + id, requestId, async () => {
        const [existingRes, participantsRes] = await Promise.all([
            admin.from('inventory_requests').select('*').eq('id', id).single(),
            admin.from('inventory_request_participants').select('*').eq('request_id', id),
        ]);
        const existing = result(existingRes) as Row;
        const existingParticipants = result(participantsRes) as Row[];
        const canEdit =
            isApprover ||
            existing.requester_id === actor.id ||
            existingParticipants.some((p) => p.profile_id === actor.id);
        if (!canEdit) throw new Error('You are not allowed to edit participants on this request.');
        await replaceParticipants(admin, 'inventory_request_participants', id, participantEmails);
        return null;
    });
    return getInventoryRequest(client, admin, id);
}

// Outstanding (issued but not yet closed) quantity per inventory type —
// subtracted from TotalQuantity to derive availableQuantity, rather than a
// mutable counter that could drift from the underlying request rows. Ported
// from computeDeductionsByType in Inventory.ts, which itself documents why
// damaged/missing returns aren't deducted here.
export async function computeDeductionsByType(admin: SupabaseClient): Promise<Map<string, number>> {
    const [requestsRes, itemsRes] = await Promise.all([
        admin.from('inventory_requests').select('id, status').eq('status', 'issued'),
        admin.from('inventory_request_items').select('*'),
    ]);
    const issuedIds = new Set((result(requestsRes) as Row[]).map((r) => r.id));
    const deductions = new Map<string, number>();
    (result(itemsRes) as Row[]).forEach((item) => {
        if (!issuedIds.has(item.request_id)) return;
        deductions.set(
            item.inventory_type_id,
            (deductions.get(item.inventory_type_id) || 0) + item.quantity,
        );
    });
    return deductions;
}

async function validateIssuedLabelAssignments(
    admin: SupabaseClient,
    requestId: string,
    items: Row[],
): Promise<void> {
    const itemIds = items.map((item) => item.id);
    if (!itemIds.length) return;
    const [currentAssignmentsRes, allAssignmentsRes, allItemsRes, issuedRequestsRes] =
        await Promise.all([
            admin
                .from('inventory_request_item_labels')
                .select('request_item_id, inventory_type_label_id')
                .in('request_item_id', itemIds),
            admin
                .from('inventory_request_item_labels')
                .select('request_item_id, inventory_type_label_id'),
            admin.from('inventory_request_items').select('id, request_id'),
            admin.from('inventory_requests').select('id').eq('status', 'issued'),
        ]);
    const currentAssignments = result(currentAssignmentsRes) as Row[];
    const currentLabelIds = new Set<string>();
    currentAssignments.forEach((assignment) => {
        if (currentLabelIds.has(assignment.inventory_type_label_id)) {
            throw new Error('A label was scanned more than once for this request.');
        }
        currentLabelIds.add(assignment.inventory_type_label_id);
    });
    const issuedRequestIds = new Set(
        (result(issuedRequestsRes) as Row[])
            .map((request) => request.id)
            .filter((issuedId) => issuedId !== requestId),
    );
    const issuedItemIds = new Set(
        (result(allItemsRes) as Row[])
            .filter((item) => issuedRequestIds.has(item.request_id))
            .map((item) => item.id),
    );
    const usedLabels = new Set<string>();
    (result(allAssignmentsRes) as Row[]).forEach((assignment) => {
        if (issuedItemIds.has(assignment.request_item_id)) {
            usedLabels.add(assignment.inventory_type_label_id);
        }
    });
    for (const labelId of currentLabelIds) {
        if (usedLabels.has(labelId)) {
            throw new Error('This inventory label is already assigned to an issued request.');
        }
    }
}

// Ported from performInventoryRequestAction in Inventory.ts (itself a port
// of the source app's perform_inventory_request_action Postgres function).
// Wrapped end-to-end in withLockedDedupe, same as the Apps Script version
// wrapped it in withLock — the one-row-at-a-time application-level check
// stands in for real per-row `FOR UPDATE` locking.
export async function performInventoryRequestAction(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    action: string,
    note: string,
    dedupeRequestId: string,
): Promise<string> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';

    const { result: nextStatus } = await withLockedDedupe(
        admin,
        'inventory_request:' + id + ':' + action,
        dedupeRequestId,
        async (): Promise<string> => {
            const [requestRes, participantsRes] = await Promise.all([
                admin.from('inventory_requests').select('*').eq('id', id).single(),
                admin.from('inventory_request_participants').select('*').eq('request_id', id),
            ]);
            const request = result(requestRes) as Row;
            const participants = result(participantsRes) as Row[];
            let computedStatus: string;
            const narrate = (message: string) =>
                insertActionComment(admin, 'inventory_request', id, actor.id, message);

            if (action === 'submit') {
                const isOwner =
                    request.requester_id === actor.id ||
                    participants.some((p) => p.profile_id === actor.id);
                if (!isOwner || request.status !== 'draft') throw new Error('Invalid transition.');
                const { count } = await admin
                    .from('inventory_request_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('request_id', id);
                if (!count) throw new Error('At least one item is required.');
                computedStatus = 'submitted';
                await narrate(actor.name + ' submitted this request.');
            } else {
                if (!isApprover) throw new Error('Approver access is required.');
                if (action === 'approve') {
                    if (request.status !== 'submitted') throw new Error('Invalid transition.');
                    computedStatus = 'approved';
                    await narrate(
                        actor.name + ' approved this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'reject') {
                    if (request.status !== 'submitted') throw new Error('Invalid transition.');
                    computedStatus = 'rejected';
                    await narrate(
                        actor.name + ' rejected this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'issue') {
                    if (request.status !== 'approved') throw new Error('Invalid transition.');
                    const items = result(
                        await admin
                            .from('inventory_request_items')
                            .select('*')
                            .eq('request_id', id),
                    ) as Row[];
                    await validateIssuedLabelAssignments(admin, id, items);
                    const itemLabels = result(
                        await admin
                            .from('inventory_request_item_labels')
                            .select('request_item_id')
                            .in(
                                'request_item_id',
                                items.map((item) => item.id),
                            ),
                    ) as Row[];
                    const labelCountByItemId = new Map<string, number>();
                    itemLabels.forEach((assignment) => {
                        labelCountByItemId.set(
                            assignment.request_item_id,
                            (labelCountByItemId.get(assignment.request_item_id) || 0) + 1,
                        );
                    });
                    const types = result(await admin.from('inventory_types').select('*')) as Row[];
                    const typesById = new Map(types.map((t) => [t.id, t]));
                    const deductions = await computeDeductionsByType(admin);
                    for (const item of items) {
                        const labelCount = labelCountByItemId.get(item.id) || 0;
                        if (labelCount > item.quantity) {
                            item.quantity = labelCount;
                            const { error } = await admin
                                .from('inventory_request_items')
                                .update({ quantity: labelCount })
                                .eq('id', item.id);
                            if (error) throw new Error(error.message);
                        }
                        const type = typesById.get(item.inventory_type_id);
                        if (!type) throw new Error('Inventory type not found.');
                        const available = type.total_quantity - (deductions.get(type.id) || 0);
                        if (available < item.quantity)
                            throw new Error('Insufficient inventory available.');
                        deductions.set(type.id, (deductions.get(type.id) || 0) + item.quantity);
                    }
                    computedStatus = 'issued';
                    await narrate(actor.name + ' issued the equipment.' + (note ? ' ' + note : ''));
                } else if (action === 'cancel') {
                    if (['draft', 'submitted', 'approved'].indexOf(request.status) === -1) {
                        throw new Error('Invalid transition.');
                    }
                    computedStatus = 'cancelled';
                    await narrate(
                        actor.name + ' cancelled this request.' + (note ? ' ' + note : ''),
                    );
                } else if (action === 'close') {
                    if (['rejected', 'cancelled'].indexOf(request.status) === -1) {
                        if (request.status !== 'issued') throw new Error('Invalid transition.');
                        const items = result(
                            await admin
                                .from('inventory_request_items')
                                .select('*')
                                .eq('request_id', id),
                        ) as Row[];
                        if (!items.length || items.some((item) => !item.return_condition)) {
                            throw new Error('Every item needs a return condition.');
                        }
                    }
                    computedStatus = 'closed';
                    await narrate(actor.name + ' closed this request.' + (note ? ' ' + note : ''));
                } else {
                    throw new Error('Unsupported action.');
                }
            }

            const { error } = await admin
                .from('inventory_requests')
                .update({ status: computedStatus })
                .eq('id', id);
            if (error) throw new Error(error.message);
            return computedStatus;
        },
    );
    return nextStatus;
}

export async function deleteInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    await withLockedDedupe(admin, 'inventory_request:delete:' + id, requestId, async () => {
        const [requestRes, participantsRes] = await Promise.all([
            admin.from('inventory_requests').select('*').eq('id', id).single(),
            admin.from('inventory_request_participants').select('*').eq('request_id', id),
        ]);
        const request = result(requestRes) as Row;
        const participants = result(participantsRes) as Row[];
        const owner =
            request.requester_id === actor.id ||
            participants.some((p) => p.profile_id === actor.id);
        if (!isApprover && !owner) throw new Error('You are not allowed to delete this request.');
        if (request.status !== 'draft' && request.status !== 'cancelled') {
            throw new Error('This request can no longer be deleted.');
        }
        const { error } = await admin.from('inventory_requests').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}
