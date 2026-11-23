import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    emailDomainAllowed,
    inventoryLabelDto,
    locationFields,
    optionalInventoryPlaceId,
    requireInventoryBrand,
    requireAdmin,
    requireApprover,
    requireNonEmpty,
    result,
    userDto,
    WITH_LOCATION,
    type Row,
} from './core.ts';
import {
    departmentDto,
    homeContentDto,
    inventoryTypeDto,
    namedOptionDto,
    type NamedOptionTable,
    placeDto,
    shiftTypeDto,
} from './dto.ts';
import { boundedText, emailArg, MAX_NAME_LENGTH, MAX_PHONE_LENGTH } from './validation.ts';
import { normalizeHiddenViews } from '../_shared/views.ts';

const USER_ROLES = ['admin', 'approver', 'viewer', 'user'];

function optionalTime(value: unknown): string | null {
    const time = String(value ?? '').trim();
    return time || null;
}

function parseInventoryTotalQuantity(value: unknown): number | null {
    if (value == null || String(value).trim() === '') return null;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error('Total quantity must be a non-negative whole number.');
    }
    return quantity;
}

function departmentDuplicateMessage(error: string): string {
    return error.includes('short_name')
        ? 'A department with this short name already exists.'
        : 'A department with this name already exists.';
}

export async function createDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from('departments')
            .insert({
                name,
                short_name: String(input.shortName || ''),
                lead_email: String(input.leadEmail || '')
                    .trim()
                    .toLowerCase(),
            })
            .select('*')
            .single(),
        departmentDuplicateMessage,
    ) as Row;
    return departmentDto(row);
}

export async function updateDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from('departments')
            .update({
                name,
                short_name: String(input.shortName || ''),
                lead_email: String(input.leadEmail || '')
                    .trim()
                    .toLowerCase(),
            })
            .eq('id', id)
            .select('*')
            .single(),
        departmentDuplicateMessage,
    ) as Row;
    return departmentDto(row);
}

export async function deleteDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.from('departments').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// Program places (where sessions are held), inventory places (where equipment
// is kept) and inventory brands are separate lists with the same shape (a
// unique name) and the same rules.
type PlaceTable = 'places' | 'inventory_places' | 'inventory_brands';

const DUPLICATE_NAME_MESSAGE: Record<PlaceTable, string> = {
    places: 'A place with this name already exists.',
    inventory_places: 'A place with this name already exists.',
    inventory_brands: 'A brand with this name already exists.',
};

async function createPlaceIn(
    table: PlaceTable,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin.from(table).insert({ name }).select('*').single(),
        DUPLICATE_NAME_MESSAGE[table],
    ) as Row;
    return placeDto(row);
}

async function updatePlaceIn(
    table: PlaceTable,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin.from(table).update({ name }).eq('id', id).select('*').single(),
        DUPLICATE_NAME_MESSAGE[table],
    ) as Row;
    return placeDto(row);
}

async function deletePlaceIn(
    table: PlaceTable,
    inUseMessage: string,
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.from(table).delete().eq('id', id);
    if (error) throw new Error(error.code === '23503' ? inUseMessage : error.message);
}

export function createPlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    return createPlaceIn('places', client, admin, userId, input);
}

export function updatePlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    return updatePlaceIn('places', client, admin, userId, id, input);
}

export function deletePlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    return deletePlaceIn(
        'places',
        'This place is used by programs or blocks and cannot be deleted.',
        client,
        admin,
        userId,
        id,
    );
}

export function createInventoryPlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    return createPlaceIn('inventory_places', client, admin, userId, input);
}

export function updateInventoryPlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    return updatePlaceIn('inventory_places', client, admin, userId, id, input);
}

export function deleteInventoryPlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    return deletePlaceIn(
        'inventory_places',
        'This place is used by inventory types or labels and cannot be deleted.',
        client,
        admin,
        userId,
        id,
    );
}

export function createInventoryBrand(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    return createPlaceIn('inventory_brands', client, admin, userId, input);
}

export function updateInventoryBrand(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    return updatePlaceIn('inventory_brands', client, admin, userId, id, input);
}

export function deleteInventoryBrand(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    return deletePlaceIn(
        'inventory_brands',
        'This brand is used by inventory types and cannot be deleted.',
        client,
        admin,
        userId,
        id,
    );
}

// The DTO of one inventory type as it is right now: its availability and
// labels are read fresh.
async function loadInventoryTypeDto(client: SupabaseClient, row: Row): Promise<Row> {
    const [availabilityRes, labelsRes] = await Promise.all([
        client.rpc('inventory_availability'),
        client
            .from('inventory_type_labels')
            .select(WITH_LOCATION)
            .eq('inventory_type_id', row.id)
            .order('name'),
    ]);
    const available = (result(availabilityRes) as Row[]).find(
        (x) => x.inventory_type_id === row.id,
    );
    return inventoryTypeDto(row, available?.available_quantity, result(labelsRes) as Row[]);
}
export async function createInventoryLabel(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const inventoryTypeId = requireNonEmpty(input.inventoryTypeId, 'Inventory type is required.');
    const name = boundedText(input.name, 'Label name', MAX_NAME_LENGTH);
    const type = result(
        await admin.from('inventory_types').select('id').eq('id', inventoryTypeId).maybeSingle(),
    ) as Row | null;
    if (!type) throw new Error('Inventory type not found.');
    const locationId = await optionalInventoryPlaceId(admin, input.locationId);
    const label = result(
        await admin
            .from('inventory_type_labels')
            .insert({ inventory_type_id: inventoryTypeId, name, location_id: locationId })
            .select(WITH_LOCATION)
            .single(),
        'A label with this name already exists for this inventory type.',
    ) as Row;
    return inventoryLabelDto(label);
}

export async function deleteInventoryLabel(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.from('inventory_type_labels').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function updateInventoryLabel(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = boundedText(input.name, 'Label name', MAX_NAME_LENGTH);
    const locationId = await optionalInventoryPlaceId(admin, input.locationId);
    const label = result(
        await admin
            .from('inventory_type_labels')
            .update({ name, location_id: locationId })
            .eq('id', id)
            .select(WITH_LOCATION)
            .single(),
        'A label with this name already exists for this inventory type.',
    ) as Row;
    return inventoryLabelDto(label);
}

export async function createInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const brand = String(input.brand || '').trim();
    const model = String(input.model || '').trim();
    const totalQuantity = parseInventoryTotalQuantity(input.totalQuantity);
    await requireInventoryBrand(admin, brand);
    const locationId = await optionalInventoryPlaceId(admin, input.locationId);
    const row = result(
        await admin
            .from('inventory_types')
            .insert({
                brand,
                name,
                model,
                location_id: locationId,
                description: String(input.description || ''),
                requestable: input.requestable !== false,
                image_path: String(input.imageId || ''),
                total_quantity: totalQuantity,
            })
            .select(WITH_LOCATION)
            .single(),
        'An inventory type with this brand, name, and model already exists.',
    ) as Row;
    return loadInventoryTypeDto(client, row);
}

export async function updateInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const brand = String(input.brand || '').trim();
    const model = String(input.model || '').trim();
    const totalQuantity = parseInventoryTotalQuantity(input.totalQuantity);
    const existing = result(
        await admin.from('inventory_types').select('*').eq('id', id).single(),
    ) as Row;
    await requireInventoryBrand(admin, brand);
    const locationId = await optionalInventoryPlaceId(admin, input.locationId);
    const row = result(
        await admin
            .from('inventory_types')
            .update({
                brand,
                name,
                model,
                location_id: locationId,
                description: String(input.description || ''),
                requestable: input.requestable !== false,
                image_path:
                    input.imageId === undefined ? existing.image_path : String(input.imageId || ''),
                total_quantity: totalQuantity,
            })
            .eq('id', id)
            .select(WITH_LOCATION)
            .single(),
        'An inventory type with this brand, name, and model already exists.',
    ) as Row;
    return loadInventoryTypeDto(client, row);
}

export async function deleteInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.rpc('delete_inventory_type_with_items', {
        target_inventory_type_id: id,
    });
    if (error) throw new Error(error.message);
}

async function requireDepartmentExists(admin: SupabaseClient, id: unknown): Promise<void> {
    const { data, error } = await admin.from('departments').select('id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Department not found.');
}

// About a hundred years: Supabase has no permanent ban, only a duration.
const SIGN_IN_BLOCKED_BAN = '876000h';

// Most users self-register on first Google sign-in (the on_auth_user_created
// trigger inserts their profile). An administrator can also add a member who
// has no organisation email yet, so they can be rostered: the auth identity is
// created banned (cannot sign in, whatever the domain allowlist says) and the
// profile is flagged sign_in_blocked. updateUser lifts both once the member's
// work email is set.
export async function createUser(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const email = emailArg(input.email, 'Email is required.');
    const name = boundedText(
        requireNonEmpty(input.name, 'Name is required.'),
        'Name',
        MAX_NAME_LENGTH,
    );
    const role = input.role === undefined || input.role === '' ? 'user' : input.role;
    if (USER_ROLES.indexOf(role) === -1) throw new Error('Unknown role.');
    const departmentId = String(input.departmentId || '') || null;
    if (departmentId) await requireDepartmentExists(admin, departmentId);
    const phone = boundedText(input.phone, 'Phone', MAX_PHONE_LENGTH);
    const whatsapp = boundedText(input.whatsapp, 'WhatsApp', MAX_PHONE_LENGTH);
    await requireEmailUnused(admin, email);
    const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        ban_duration: SIGN_IN_BLOCKED_BAN,
        user_metadata: { full_name: name },
    });
    if (created.error || !created.data.user) {
        throw new Error(created.error?.message || 'Unable to add this member.');
    }
    const authUserId = created.data.user.id;
    const updated = await admin
        .from('profiles')
        .update({
            name,
            role,
            department_id: departmentId,
            phone,
            whatsapp,
            sign_in_blocked: true,
        })
        .eq('id', authUserId)
        .select('*')
        .single();
    if (updated.error || !updated.data) {
        // Do not leave a banned identity without its profile details.
        await admin.auth.admin.deleteUser(authUserId);
        throw new Error(updated.error?.message || 'Unable to add this member.');
    }
    const departments = (result(await admin.from('departments').select('*')) as Row[]).map(
        (x) => [x.id, x] as [string, Row],
    );
    return userDto(updated.data, new Map(departments));
}

async function requireEmailUnused(admin: SupabaseClient, email: string): Promise<void> {
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) throw new Error('A user with this email already exists.');
}

// Sets the work email of a member who cannot sign in yet. When the new address
// is allowed to sign in, the ban is lifted so their first Google sign-in links
// to this same identity and keeps their roster shifts, requests and role.
async function setWorkEmail(admin: SupabaseClient, target: Row, newEmail: string): Promise<Row> {
    if (!target.sign_in_blocked) {
        throw new Error('The email can only be changed for a member who has not signed in yet.');
    }
    await requireEmailUnused(admin, newEmail);
    const mayNowSignIn = await emailDomainAllowed(admin, newEmail);
    const changed = await admin.auth.admin.updateUserById(target.id, {
        email: newEmail,
        email_confirm: true,
        ...(mayNowSignIn ? { ban_duration: 'none' } : {}),
    });
    if (changed.error) throw new Error(changed.error.message);
    return { email: newEmail, sign_in_blocked: !mayNowSignIn };
}

export async function updateUser(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    targetEmail: string,
    patch: Row,
): Promise<Row> {
    const actor = await requireAdmin(client, userId);
    const target = result(
        await admin.from('profiles').select('*').eq('email', targetEmail).single(),
    ) as Row;
    if (patch.role !== undefined && USER_ROLES.indexOf(patch.role) === -1) {
        throw new Error('Unknown role.');
    }
    if (target.email === actor.email && patch.role && patch.role !== 'admin') {
        throw new Error('You cannot remove your own administrator access.');
    }
    if (patch.departmentId) await requireDepartmentExists(admin, patch.departmentId);
    const newEmail = patch.email === undefined ? '' : emailArg(patch.email, 'Email is required.');
    // Validate every field before the identity is touched, so a bad value
    // cannot leave the auth email changed and the profile not.
    const fields = {
        name:
            patch.name !== undefined
                ? boundedText(
                      requireNonEmpty(patch.name, 'Name is required.'),
                      'Name',
                      MAX_NAME_LENGTH,
                  )
                : target.name,
        role: patch.role !== undefined ? patch.role : target.role,
        department_id:
            patch.departmentId !== undefined ? patch.departmentId || null : target.department_id,
        phone:
            patch.phone !== undefined
                ? boundedText(patch.phone, 'Phone', MAX_PHONE_LENGTH)
                : target.phone,
        whatsapp:
            patch.whatsapp !== undefined
                ? boundedText(patch.whatsapp, 'WhatsApp', MAX_PHONE_LENGTH)
                : target.whatsapp,
    };
    const emailChange =
        newEmail && newEmail !== target.email ? await setWorkEmail(admin, target, newEmail) : {};
    const saved = await admin
        .from('profiles')
        .update({ ...emailChange, ...fields })
        .eq('id', target.id)
        .select('*')
        .single();
    if (saved.error && 'email' in emailChange) {
        // Put the identity back so it keeps matching the profile.
        await admin.auth.admin.updateUserById(target.id, {
            email: target.email,
            ban_duration: SIGN_IN_BLOCKED_BAN,
        });
    }
    const updated = result(saved) as Row;
    const departmentsById = new Map(
        (result(await client.from('departments').select('*')) as Row[]).map((x) => [x.id, x]),
    );
    return userDto(updated, departmentsById);
}

// Deleting the auth identity (not just the profile row) is what actually
// revokes access — profiles cascades from auth.users on delete.
export async function deleteUser(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    targetEmail: string,
): Promise<void> {
    const actor = await requireAdmin(client, userId);
    const target = result(
        await admin.from('profiles').select('id').eq('email', targetEmail).single(),
    ) as Row;
    if (target.id === actor.id) throw new Error('You cannot delete your own account.');
    // requests, roster shifts and comments reference profiles with ON DELETE
    // RESTRICT, so explain that instead of surfacing the raw constraint error.
    const references = await Promise.all([
        admin
            .from('inventory_requests')
            .select('id', { count: 'exact', head: true })
            .eq('requester_id', target.id),
        admin
            .from('program_requests')
            .select('id', { count: 'exact', head: true })
            .eq('requester_id', target.id),
        admin.from('rosters').select('id', { count: 'exact', head: true }).eq('user_id', target.id),
        admin
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('author_id', target.id),
    ]);
    references.forEach((reference) => {
        if (reference.error) throw new Error(reference.error.message);
    });
    if (references.some((reference) => (reference.count || 0) > 0)) {
        throw new Error(
            'This user has requests, comments or roster shifts and cannot be deleted. Change their role instead.',
        );
    }
    const { error } = await admin.auth.admin.deleteUser(target.id);
    if (error) throw new Error(error.message);
}

// Shift/program/session types and languages are still edited through their
// names. Shift presets additionally have stable ids so roster rows can keep
// pointing at the preset while storing an independent display-name override.
export async function createShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from('shift_types')
            .insert({
                name,
                color: String(input.color || '').trim(),
                default_start_time: optionalTime(input.defaultStartTime),
                default_end_time: optionalTime(input.defaultEndTime),
            })
            .select('*')
            .single(),
        'A shift type with this name already exists.',
    ) as Row;
    return shiftTypeDto(row);
}

export async function updateShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    name: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from('shift_types')
            .update({
                name: newName,
                color: String(input.color || '').trim(),
                default_start_time: optionalTime(input.defaultStartTime),
                default_end_time: optionalTime(input.defaultEndTime),
            })
            .eq('name', name)
            .select('*')
            .single(),
        'A shift type with this name already exists.',
    ) as Row;
    return shiftTypeDto(row);
}

export async function deleteShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    name: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.from('shift_types').delete().eq('name', name);
    if (error) throw new Error(error.message);
}

export async function createNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    label: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from(table)
            .insert(
                table === 'program_types'
                    ? { name, color: String(input.color || '').trim() }
                    : { name },
            )
            .select('*')
            .single(),
        `A ${label} with this name already exists.`,
    ) as Row;
    return namedOptionDto(table, row);
}

export async function updateNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    label: string,
    name: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const row = result(
        await admin
            .from(table)
            .update(
                table === 'program_types'
                    ? { name: newName, color: String(input.color || '').trim() }
                    : { name: newName },
            )
            .eq('name', name)
            .select('*')
            .single(),
        `A ${label} with this name already exists.`,
    ) as Row;
    return namedOptionDto(table, row);
}

export async function deleteNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    name: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin.from(table).delete().eq('name', name);
    if (error) throw new Error(error.message);
}

export async function createBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireApprover(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const startDateTime = requireNonEmpty(input.startDateTime, 'Start is required.');
    const endDateTime = requireNonEmpty(input.endDateTime, 'End is required.');
    if (endDateTime <= startDateTime) throw new Error('Block end must be after start.');
    const row = result(
        await admin
            .from('blocks')
            .insert({
                name,
                start_at: startDateTime,
                end_at: endDateTime,
                place_id: input.place || null,
            })
            .select('*')
            .single(),
    ) as Row;
    return {
        Id: row.id,
        Name: row.name,
        Place: row.place_id || '',
        StartDateTime: row.start_at,
        EndDateTime: row.end_at,
    };
}

export async function updateBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
): Promise<Row> {
    await requireApprover(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const startDateTime = requireNonEmpty(input.startDateTime, 'Start is required.');
    const endDateTime = requireNonEmpty(input.endDateTime, 'End is required.');
    if (endDateTime <= startDateTime) throw new Error('Block end must be after start.');
    const row = result(
        await admin
            .from('blocks')
            .update({
                name,
                start_at: startDateTime,
                end_at: endDateTime,
                place_id: input.place || null,
            })
            .eq('id', id)
            .select('*')
            .single(),
    ) as Row;
    return {
        Id: row.id,
        Name: row.name,
        Place: row.place_id || '',
        StartDateTime: row.start_at,
        EndDateTime: row.end_at,
    };
}

export async function deleteBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
): Promise<void> {
    await requireApprover(client, userId);
    const { error } = await admin.from('blocks').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function updateHomeContent(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    // Each field is optional so the guidelines and the hidden views can be
    // saved separately without one overwriting the other.
    const changes: Row = { updated_by: userId };
    if (input.guidelines !== undefined) changes.guidelines = String(input.guidelines || '');
    if (input.hiddenViews !== undefined) {
        changes.hidden_views = normalizeHiddenViews(input.hiddenViews);
    }
    const row = result(
        await admin.from('home_content').update(changes).eq('id', true).select('*').single(),
    ) as Row;
    return homeContentDto(row);
}
