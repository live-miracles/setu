import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    requireAdmin,
    requireApprover,
    requireNonEmpty,
    result,
    userDto,
    withLockedDedupe,
    type Row,
} from './core.ts';

const USER_ROLES = ['admin', 'approver', 'viewer', 'user'];

function optionalTime(value: unknown): string | null {
    const time = String(value ?? '').trim();
    return time || null;
}

function timeDto(value: unknown): string {
    return value == null ? '' : String(value).slice(0, 5);
}

export function departmentDto(x: Row): Row {
    return { Id: x.id, Name: x.name, ShortName: x.short_name, LeadEmail: x.lead_email };
}

export async function createDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'department:create',
        requestId,
        async () => {
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
                'A department with this name already exists.',
            ) as Row;
            return departmentDto(row);
        },
    );
    return dto;
}

export async function updateDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'department:update:' + id,
        requestId,
        async () => {
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
                'A department with this name already exists.',
            ) as Row;
            return departmentDto(row);
        },
    );
    return dto;
}

export async function deleteDepartment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, 'department:delete:' + id, requestId, async () => {
        const { error } = await admin.from('departments').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

export async function createPlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(admin, 'place:create', requestId, async () => {
        const row = result(
            await admin.from('places').insert({ name }).select('*').single(),
            'A place with this name already exists.',
        ) as Row;
        return { Id: row.id, Name: row.name };
    });
    return dto;
}

export async function updatePlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'place:update:' + id,
        requestId,
        async () => {
            const row = result(
                await admin.from('places').update({ name }).eq('id', id).select('*').single(),
                'A place with this name already exists.',
            ) as Row;
            return { Id: row.id, Name: row.name };
        },
    );
    return dto;
}

export async function deletePlace(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, 'place:delete:' + id, requestId, async () => {
        const { error } = await admin.from('places').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

export async function inventoryTypeDto(client: SupabaseClient, row: Row): Promise<Row> {
    const availability = result(await client.rpc('inventory_availability')) as Row[];
    const available = availability.find((x) => x.inventory_type_id === row.id);
    return {
        Id: row.id,
        Name: row.name,
        Description: row.description,
        Requestable: row.requestable,
        ImageId: row.image_path,
        TotalQuantity: row.total_quantity,
        availableQuantity: available ? available.available_quantity : row.total_quantity,
    };
}

export async function createInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!(Number(input.totalQuantity) >= 0))
        throw new Error('Total quantity must not be negative.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory-type:create',
        requestId,
        async () => {
            const row = result(
                await admin
                    .from('inventory_types')
                    .insert({
                        name,
                        description: String(input.description || ''),
                        requestable: input.requestable !== false,
                        image_path: String(input.imageId || ''),
                        total_quantity: Number(input.totalQuantity),
                    })
                    .select('*')
                    .single(),
                'An inventory type with this name already exists.',
            ) as Row;
            return inventoryTypeDto(client, row);
        },
    );
    return dto;
}

export async function updateInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (!(Number(input.totalQuantity) >= 0))
        throw new Error('Total quantity must not be negative.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'inventory-type:update:' + id,
        requestId,
        async () => {
            const existing = result(
                await admin.from('inventory_types').select('*').eq('id', id).single(),
            ) as Row;
            const row = result(
                await admin
                    .from('inventory_types')
                    .update({
                        name,
                        description: String(input.description || ''),
                        requestable: input.requestable !== false,
                        image_path:
                            input.imageId === undefined
                                ? existing.image_path
                                : String(input.imageId || ''),
                        total_quantity: Number(input.totalQuantity),
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
                'An inventory type with this name already exists.',
            ) as Row;
            return inventoryTypeDto(client, row);
        },
    );
    return dto;
}

export async function deleteInventoryType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, 'inventory-type:delete:' + id, requestId, async () => {
        const { error } = await admin.from('inventory_types').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

// No createUser: users self-register on first Google sign-in (the
// on_auth_user_created trigger inserts their profile automatically, same as
// getCurrentActor() used to in the Apps Script backend) rather than being
// pre-provisioned by an admin.
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
    if (patch.departmentId) {
        const { data, error } = await admin
            .from('departments')
            .select('id')
            .eq('id', patch.departmentId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Department not found.');
    }
    const updated = result(
        await admin
            .from('profiles')
            .update({
                name:
                    patch.name !== undefined
                        ? requireNonEmpty(patch.name, 'Name is required.')
                        : target.name,
                role: patch.role !== undefined ? patch.role : target.role,
                department_id:
                    patch.departmentId !== undefined
                        ? patch.departmentId || null
                        : target.department_id,
                phone: patch.phone !== undefined ? String(patch.phone) : target.phone,
                whatsapp: patch.whatsapp !== undefined ? String(patch.whatsapp) : target.whatsapp,
            })
            .eq('email', targetEmail)
            .select('*')
            .single(),
    ) as Row;
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
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const target = result(
        await admin.from('profiles').select('id').eq('email', targetEmail).single(),
    ) as Row;
    await withLockedDedupe(admin, 'user:delete:' + target.id, requestId, async () => {
        const { error } = await admin.auth.admin.deleteUser(target.id);
        if (error) throw new Error(error.message);
        return null;
    });
}

// Shift/program/session types and languages are keyed by name itself (see
// the migration) rather than a generated id — updating one renames the row
// in place, which cascades to anything referencing it by name (program
// requests' language/type, sessions' session_type).
export async function createShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'shift-type:create',
        requestId,
        async () => {
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
            return {
                Name: row.name,
                Color: row.color,
                DefaultStartTime: timeDto(row.default_start_time),
                DefaultEndTime: timeDto(row.default_end_time),
            };
        },
    );
    return dto;
}

export async function updateShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    name: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'shift-type:update:' + name,
        requestId,
        async () => {
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
            return {
                Name: row.name,
                Color: row.color,
                DefaultStartTime: timeDto(row.default_start_time),
                DefaultEndTime: timeDto(row.default_end_time),
            };
        },
    );
    return dto;
}

export async function deleteShiftType(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    name: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, 'shift-type:delete:' + name, requestId, async () => {
        const { error } = await admin.from('shift_types').delete().eq('name', name);
        if (error) throw new Error(error.message);
        return null;
    });
}

type NamedOptionTable = 'program_types' | 'program_languages' | 'session_types';

export function namedOptionDto(table: NamedOptionTable, row: Row): Row {
    return table === 'program_types' ? { Name: row.name, Color: row.color } : { Name: row.name };
}

export async function createNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    scope: string,
    label: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        scope + ':create',
        requestId,
        async () => {
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
        },
    );
    return dto;
}

export async function updateNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    scope: string,
    label: string,
    name: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result: dto } = await withLockedDedupe(
        admin,
        scope + ':update:' + name,
        requestId,
        async () => {
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
        },
    );
    return dto;
}

export async function deleteNamedOption(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    table: NamedOptionTable,
    scope: string,
    name: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, scope + ':delete:' + name, requestId, async () => {
        const { error } = await admin.from(table).delete().eq('name', name);
        if (error) throw new Error(error.message);
        return null;
    });
}

export async function createBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireApprover(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const startDateTime = requireNonEmpty(input.startDateTime, 'Start is required.');
    const endDateTime = requireNonEmpty(input.endDateTime, 'End is required.');
    if (endDateTime <= startDateTime) throw new Error('Block end must be after start.');
    const { result: dto } = await withLockedDedupe(admin, 'block:create', requestId, async () => {
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
    });
    return dto;
}

export async function updateBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireApprover(client, userId);
    const name = requireNonEmpty(input.name, 'Name is required.');
    const startDateTime = requireNonEmpty(input.startDateTime, 'Start is required.');
    const endDateTime = requireNonEmpty(input.endDateTime, 'End is required.');
    if (endDateTime <= startDateTime) throw new Error('Block end must be after start.');
    const { result: dto } = await withLockedDedupe(
        admin,
        'block:update:' + id,
        requestId,
        async () => {
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
        },
    );
    return dto;
}

export async function deleteBlock(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    await requireApprover(client, userId);
    await withLockedDedupe(admin, 'block:delete:' + id, requestId, async () => {
        const { error } = await admin.from('blocks').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

export async function updateHomeContent(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const row = result(
        await admin
            .from('home_content')
            .update({ guidelines: String(input.guidelines || ''), updated_by: userId })
            .eq('id', true)
            .select('*')
            .single(),
    ) as Row;
    return { Guidelines: row.guidelines };
}
