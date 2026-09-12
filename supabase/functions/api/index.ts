import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Row = Record<string, any>;
type RequestBody = { operation?: string; args?: unknown[] };
const appOrigin = Deno.env.get('SETU_APP_ORIGIN') || '';
const headers = {
    'Access-Control-Allow-Origin': appOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers });
}

function result<T>(
    value: { data: T | null; error: { message: string; code?: string } | null },
    duplicateMessage?: string,
): T {
    if (value.error) {
        if (duplicateMessage && value.error.code === '23505') throw new Error(duplicateMessage);
        throw new Error(value.error.message);
    }
    if (value.data === null) throw new Error('The requested record was not found.');
    return value.data;
}

function requireNonEmpty(value: unknown, message: string): string {
    const trimmed = String(value == null ? '' : value).trim();
    if (!trimmed) throw new Error(message);
    return trimmed;
}

const USER_ROLES = ['admin', 'approver', 'viewer', 'user'];

async function currentProfile(client: SupabaseClient, userId: string): Promise<Row> {
    return result(await client.from('profiles').select('*').eq('id', userId).single()) as Row;
}

async function requireAdmin(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (profile.role !== 'admin') throw new Error('Administrator access is required.');
    return profile;
}

async function requireApprover(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (profile.role !== 'admin' && profile.role !== 'approver') {
        throw new Error('Approver access is required.');
    }
    return profile;
}

async function emailDomainAllowed(admin: SupabaseClient, email: string): Promise<boolean> {
    return Boolean(result(await admin.rpc('is_email_domain_allowed', { candidate_email: email })));
}

async function requireAllowedEmailDomain(admin: SupabaseClient, email: string): Promise<void> {
    if (!(await emailDomainAllowed(admin, email))) {
        throw new Error('Access is restricted to approved email domains.');
    }
}

// Replaces the Apps Script backend's CacheService-based dedupe (Dedupe.ts):
// the insert into idempotency_keys is the atomic claim (a retried call with
// the same scope+requestId hits the primary key and is detected below), the
// mutation runs, and its result is stored back onto that same row. A
// throwing mutation deletes its claim so the same request id can be retried.
// Unlike the original (a real distributed lock), a second call that arrives
// while the first is still mid-flight fails fast with a retryable error
// rather than blocking for the first one's result — an acceptable trade-off
// for calls that are seconds apart (a double-click, a retried request), not
// truly concurrent, which is what this exists to guard against in practice.
async function withLockedDedupe<T>(
    admin: SupabaseClient,
    scope: string,
    requestId: string,
    fn: () => Promise<T>,
): Promise<{ duplicate: boolean; result: T }> {
    if (String(requestId || '').length < 8) {
        throw new Error('A request id of at least 8 characters is required.');
    }
    const { error: insertError } = await admin
        .from('idempotency_keys')
        .insert({ scope, request_id: requestId });
    if (insertError) {
        if (insertError.code === '23505') {
            const existing = result(
                await admin
                    .from('idempotency_keys')
                    .select('*')
                    .eq('scope', scope)
                    .eq('request_id', requestId)
                    .single(),
            ) as Row;
            if (existing.result === null) {
                throw new Error('This request is already being processed — please wait and retry.');
            }
            return { duplicate: true, result: existing.result as T };
        }
        throw new Error(insertError.message);
    }
    try {
        const value = await fn();
        await admin
            .from('idempotency_keys')
            .update({ result: value === undefined ? null : value })
            .eq('scope', scope)
            .eq('request_id', requestId);
        return { duplicate: false, result: value };
    } catch (error) {
        await admin
            .from('idempotency_keys')
            .delete()
            .eq('scope', scope)
            .eq('request_id', requestId);
        throw error;
    }
}

function userDto(profile: Row, departments: Map<string, Row>): Row {
    return {
        Email: profile.email,
        Name: profile.name || '',
        Role: profile.role,
        DepartmentId: profile.department_id || '',
        Phone: profile.phone || '',
        Whatsapp: profile.whatsapp || '',
        departmentName: departments.get(profile.department_id)?.name || '',
    };
}

async function profilesFor(
    admin: SupabaseClient,
    ids: Iterable<string>,
): Promise<Map<string, Row>> {
    const uniqueIds = [...new Set([...ids].filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    const rows = result(await admin.from('profiles').select('*').in('id', uniqueIds)) as Row[];
    return new Map(rows.map((profile) => [profile.id, profile]));
}

async function currentUser(client: SupabaseClient, userId: string): Promise<Row> {
    const [profile, departments] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).single(),
        client.from('departments').select('*'),
    ]);
    return userDto(
        result(profile) as Row,
        new Map((result(departments) as Row[]).map((x) => [x.id, x])),
    );
}

async function updateOwnProfile(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: unknown,
): Promise<Row> {
    const patch = (input && typeof input === 'object' ? input : {}) as Row;
    const changes: Row = {};
    if (patch.name !== undefined) {
        if (!String(patch.name).trim()) throw new Error('Name is required.');
        changes.name = String(patch.name).trim();
    }
    if (patch.departmentId !== undefined) changes.department_id = patch.departmentId || null;
    if (patch.phone !== undefined) {
        if (!String(patch.phone).trim()) throw new Error('Phone is required.');
        changes.phone = String(patch.phone).trim();
    }
    if (patch.whatsapp !== undefined) changes.whatsapp = String(patch.whatsapp || '').trim();
    if (!Object.keys(changes).length) return currentUser(client, userId);
    const updated = result(
        await client.from('profiles').update(changes).eq('id', userId).select('*').single(),
    ) as Row;
    const departments = result(await client.from('departments').select('*')) as Row[];
    return userDto(updated, new Map(departments.map((x) => [x.id, x])));
}

// ---------------------------------------------------------------------------
// Mutations: departments, places, inventory types, users, settings, blocks
// (ported from src/Admin.ts). Every create/update/delete takes a
// client-generated requestId and goes through withLockedDedupe.
// ---------------------------------------------------------------------------

function departmentDto(x: Row): Row {
    return { Id: x.id, Name: x.name, ShortName: x.short_name, LeadEmail: x.lead_email };
}

async function createDepartment(
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

async function updateDepartment(
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

async function deleteDepartment(
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

async function createPlace(
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

async function updatePlace(
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

async function deletePlace(
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

async function inventoryTypeDto(client: SupabaseClient, row: Row): Promise<Row> {
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

async function createInventoryType(
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

async function updateInventoryType(
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

async function deleteInventoryType(
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
async function updateUser(
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
async function deleteUser(
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
async function createShiftType(
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
                        default_start_time: input.defaultStartTime,
                        default_end_time: input.defaultEndTime,
                    })
                    .select('*')
                    .single(),
                'A shift type with this name already exists.',
            ) as Row;
            return {
                Name: row.name,
                Color: row.color,
                DefaultStartTime: String(row.default_start_time).slice(0, 5),
                DefaultEndTime: String(row.default_end_time).slice(0, 5),
            };
        },
    );
    return dto;
}

async function updateShiftType(
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
                        default_start_time: input.defaultStartTime,
                        default_end_time: input.defaultEndTime,
                    })
                    .eq('name', name)
                    .select('*')
                    .single(),
                'A shift type with this name already exists.',
            ) as Row;
            return {
                Name: row.name,
                Color: row.color,
                DefaultStartTime: String(row.default_start_time).slice(0, 5),
                DefaultEndTime: String(row.default_end_time).slice(0, 5),
            };
        },
    );
    return dto;
}

async function deleteShiftType(
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

function namedOptionDto(table: NamedOptionTable, row: Row): Row {
    return table === 'program_types' ? { Name: row.name, Color: row.color } : { Name: row.name };
}

async function createNamedOption(
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

async function updateNamedOption(
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

async function deleteNamedOption(
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

async function createBlock(
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
                    place: String(input.place || ''),
                })
                .select('*')
                .single(),
        ) as Row;
        return {
            Id: row.id,
            Name: row.name,
            Place: row.place,
            StartDateTime: row.start_at,
            EndDateTime: row.end_at,
        };
    });
    return dto;
}

async function updateBlock(
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
                        place: String(input.place || ''),
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            return {
                Id: row.id,
                Name: row.name,
                Place: row.place,
                StartDateTime: row.start_at,
                EndDateTime: row.end_at,
            };
        },
    );
    return dto;
}

async function deleteBlock(
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

async function updateHomeContent(
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

// ---------------------------------------------------------------------------
// Shared query/pagination helpers (ported from the Apps Script backend's
// Utils.ts — same page sizes, same search/sort semantics — so behaviour for
// existing users doesn't change just because the storage moved).
// ---------------------------------------------------------------------------

function paginate<T>(rows: T[], page: number, pageSize: number): Row {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const start = (safePage - 1) * pageSize;
    return {
        items: rows.slice(start, start + pageSize),
        page: safePage,
        pageSize,
        totalCount: rows.length,
    };
}

function normalizedSearch(value: unknown): string {
    return String(value == null ? '' : value)
        .trim()
        .toLocaleLowerCase();
}

function matchesSearch(query: unknown, values: unknown[]): boolean {
    const needles = String(query || '')
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!needles.length) return true;
    return needles.some((needle) =>
        values.some((value) => normalizedSearch(value).indexOf(needle) !== -1),
    );
}

function compareQueryValues(left: unknown, right: unknown, direction: unknown): number {
    const cmp = String(left == null ? '' : left).localeCompare(
        String(right == null ? '' : right),
        undefined,
        { numeric: true, sensitivity: 'base' },
    );
    return direction === 'desc' ? -cmp : cmp;
}

// Sort key for "most recently active first" request lists: the latest
// comment's timestamp (every request gets a comment at creation), falling
// back to DisplayId for the rare empty case.
function latestActivityAt(comments: Row[], displayId: number): string {
    if (!comments.length) return String(displayId).padStart(10, '0');
    return comments[comments.length - 1].Timestamp;
}

function groupByKey<T extends Row>(rows: T[], key: string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    rows.forEach((row) => {
        const values = map.get(row[key]) || [];
        values.push(row);
        map.set(row[key], values);
    });
    return map;
}

function commentDto(x: Row, profilesById: Map<string, Row>): Row {
    const author = profilesById.get(x.author_id);
    return {
        Id: x.id,
        Timestamp: x.created_at,
        RequestId: x.target_id,
        UserId: author?.email || '',
        Message: x.message,
        userName: author?.name || '',
    };
}

// Comments' own RLS policy ("users read visible comments") already checks
// can_view_inventory_request/can_view_program_request/is_approver() per
// row, so a plain select through the user-scoped `client` — not `admin` —
// already comes back containing only rows this caller may see.
async function commentsByTargetFor(
    client: SupabaseClient,
    admin: SupabaseClient,
    targetType: 'inventory_request' | 'program_request',
): Promise<Map<string, Row[]>> {
    const comments = result(
        await client.from('comments').select('*').eq('target_type', targetType).order('created_at'),
    ) as Row[];
    const profilesById = await profilesFor(
        admin,
        comments.map((x) => x.author_id),
    );
    const byTarget = new Map<string, Row[]>();
    comments.forEach((x) => {
        const values = byTarget.get(x.target_id) || [];
        values.push(commentDto(x, profilesById));
        byTarget.set(x.target_id, values);
    });
    return byTarget;
}

// ---------------------------------------------------------------------------
// Reference/settings data — small, rarely-changing tables. Readable by any
// authenticated user per their RLS policies.
// ---------------------------------------------------------------------------

async function listDepartments(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('departments').select('*').order('name')) as Row[];
    return rows.map((x) => ({
        Id: x.id,
        Name: x.name,
        ShortName: x.short_name,
        LeadEmail: x.lead_email,
    }));
}

async function listPlaces(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('places').select('*').order('name')) as Row[];
    return rows.map((x) => ({ Id: x.id, Name: x.name }));
}

async function listInventoryTypes(client: SupabaseClient): Promise<Row[]> {
    const [typesRes, availabilityRes] = await Promise.all([
        client.from('inventory_types').select('*').order('name'),
        client.rpc('inventory_availability'),
    ]);
    const types = result(typesRes) as Row[];
    const availableById = new Map(
        (result(availabilityRes) as Row[]).map((x) => [x.inventory_type_id, x.available_quantity]),
    );
    return types.map((x) => ({
        Id: x.id,
        Name: x.name,
        Description: x.description,
        Requestable: x.requestable,
        ImageId: x.image_path,
        TotalQuantity: x.total_quantity,
        availableQuantity: availableById.get(x.id) ?? x.total_quantity,
    }));
}

async function getSettings(client: SupabaseClient): Promise<Row> {
    const [homeRes, shiftRes, programTypesRes, languagesRes, sessionTypesRes] = await Promise.all([
        client.from('home_content').select('*').eq('id', true).single(),
        client.from('shift_types').select('*').order('name'),
        client.from('program_types').select('*').order('name'),
        client.from('program_languages').select('*').order('name'),
        client.from('session_types').select('*').order('name'),
    ]);
    return {
        guidelines: (result(homeRes) as Row).guidelines,
        shiftTypes: (result(shiftRes) as Row[]).map((x) => ({
            Name: x.name,
            Color: x.color,
            DefaultStartTime: String(x.default_start_time).slice(0, 5),
            DefaultEndTime: String(x.default_end_time).slice(0, 5),
        })),
        programTypes: (result(programTypesRes) as Row[]).map((x) => ({
            Name: x.name,
            Color: x.color,
        })),
        programLanguages: (result(languagesRes) as Row[]).map((x) => ({ Name: x.name })),
        sessionTypes: (result(sessionTypesRes) as Row[]).map((x) => ({ Name: x.name })),
    };
}

async function listAllowedEmailDomains(client: SupabaseClient, userId: string): Promise<Row[]> {
    await requireAdmin(client, userId);
    const rows = result(
        await client.from('allowed_email_domains').select('*').order('domain'),
    ) as Row[];
    return rows.map((row) => ({ domain: row.domain, enabled: row.enabled }));
}

async function createAllowedEmailDomain(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireAdmin(client, userId);
    const domain = requireNonEmpty(input.domain, 'Email domain is required.')
        .toLowerCase()
        .replace(/^@/, '');
    if (!/^[^@\s]+\.[^@\s]+$/.test(domain)) throw new Error('Enter a valid email domain.');
    const { result: row } = await withLockedDedupe(
        admin,
        'allowed-email-domain:create',
        requestId,
        async () =>
            result(
                await admin.from('allowed_email_domains').insert({ domain }).select('*').single(),
                'That email domain is already allowed.',
            ),
    );
    return { domain: row.domain, enabled: row.enabled };
}

async function deleteAllowedEmailDomain(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    domain: string,
    requestId: string,
): Promise<void> {
    await requireAdmin(client, userId);
    await withLockedDedupe(admin, 'allowed-email-domain:delete:' + domain, requestId, async () => {
        const { error } = await admin
            .from('allowed_email_domains')
            .delete()
            .eq('domain', domain.toLowerCase().replace(/^@/, ''));
        if (error) throw new Error(error.message);
        return null;
    });
}

async function getHomeContent(client: SupabaseClient): Promise<Row> {
    const home = result(
        await client.from('home_content').select('*').eq('id', true).single(),
    ) as Row;
    return { Guidelines: home.guidelines };
}

async function listBlocks(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('blocks').select('*').order('start_at')) as Row[];
    return rows.map((x) => ({
        Id: x.id,
        Name: x.name,
        Place: x.place,
        StartDateTime: x.start_at,
        EndDateTime: x.end_at,
    }));
}

async function listUsers(client: SupabaseClient, userId: string): Promise<Row[]> {
    const profile = result(
        await client.from('profiles').select('*').eq('id', userId).single(),
    ) as Row;
    const departmentsById = new Map(
        (result(await client.from('departments').select('*')) as Row[]).map((x) => [x.id, x]),
    );
    // Mirrors dashboard()'s dashboardProfiles: admins/approvers see everyone,
    // everyone else sees only themselves.
    const profiles =
        profile.role === 'admin' || profile.role === 'approver'
            ? (result(await client.from('profiles').select('*')) as Row[])
            : [profile];
    return profiles.map((x) => userDto(x, departmentsById));
}

async function listRosters(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
): Promise<Row> {
    // Full history, not just upcoming — that's dashboard()'s upcomingRosters
    // preview; this is the paginated listing behind the Roster page. RLS
    // ("approvers read rosters") already limits this to approvers/admins.
    const rosters = (result(await client.from('rosters').select('*')) as Row[]).sort((a, b) =>
        String(b.start_at).localeCompare(String(a.start_at)),
    );
    const profilesById = await profilesFor(
        admin,
        rosters.map((x) => x.user_id),
    );
    const dtos = rosters.map((x) => ({
        Id: x.id,
        Name: x.name,
        StartDate: String(x.start_at).slice(0, 10),
        EndDate: String(x.end_at).slice(0, 10),
        StartTime: String(x.start_at).slice(11, 16),
        EndTime: String(x.end_at).slice(11, 16),
        UserId: profilesById.get(x.user_id)?.email || '',
        userName: profilesById.get(x.user_id)?.name || '',
    }));
    return paginate(dtos, page, 20);
}

function rosterDto(row: Row, user: Row): Row {
    return {
        Id: row.id,
        Name: row.name,
        StartDate: String(row.start_at).slice(0, 10),
        EndDate: String(row.end_at).slice(0, 10),
        StartTime: String(row.start_at).slice(11, 16),
        EndTime: String(row.end_at).slice(11, 16),
        UserId: user.email,
        userName: user.name,
    };
}

function combineDateTime(date: unknown, time: unknown): string {
    return `${date}T${time || '00:00'}:00`;
}

// `input.userId` is (despite the name, inherited from the source app) the
// user's email — Users are keyed by Email there, same convention `rosters`
// resource uses on the frontend (see refine-data-provider.ts's idField).
async function requireValidRosterInput(admin: SupabaseClient, input: Row): Promise<Row> {
    if (!input.startDate || !input.endDate) throw new Error('Start and end dates are required.');
    if (input.endDate < input.startDate) throw new Error('End date must not be before start date.');
    requireNonEmpty(input.name, 'Name is required.');
    const email = requireNonEmpty(input.userId, 'User is required.').toLowerCase();
    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('User not found.');
    return data;
}

// Scheduling is an approver power, not an admin one — anyone in Users can
// be the assignee, including roles that can't open the roster themselves.
async function createRoster(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireApprover(client, userId);
    const user = await requireValidRosterInput(admin, input);
    const { result: dto } = await withLockedDedupe(admin, 'roster:create', requestId, async () => {
        const row = result(
            await admin
                .from('rosters')
                .insert({
                    name: String(input.name).trim(),
                    start_at: combineDateTime(input.startDate, input.startTime),
                    end_at: combineDateTime(input.endDate, input.endTime),
                    user_id: user.id,
                })
                .select('*')
                .single(),
        ) as Row;
        return rosterDto(row, user);
    });
    return dto;
}

async function updateRoster(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireApprover(client, userId);
    const user = await requireValidRosterInput(admin, input);
    const { result: dto } = await withLockedDedupe(
        admin,
        'roster:update:' + id,
        requestId,
        async () => {
            const row = result(
                await admin
                    .from('rosters')
                    .update({
                        name: String(input.name).trim(),
                        start_at: combineDateTime(input.startDate, input.startTime),
                        end_at: combineDateTime(input.endDate, input.endTime),
                        user_id: user.id,
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            return rosterDto(row, user);
        },
    );
    return dto;
}

async function deleteRoster(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    await requireApprover(client, userId);
    await withLockedDedupe(admin, 'roster:delete:' + id, requestId, async () => {
        const { error } = await admin.from('rosters').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

// ---------------------------------------------------------------------------
// Comments (shared by inventory requests and program requests)
// ---------------------------------------------------------------------------

interface RequestOwner {
    kind: 'inventory_request' | 'program_request';
    requesterId: string | null;
    participantIds: string[];
}

async function findRequestOwner(
    admin: SupabaseClient,
    requestId: string,
): Promise<RequestOwner | null> {
    const inventoryRes = await admin
        .from('inventory_requests')
        .select('requester_id')
        .eq('id', requestId)
        .maybeSingle();
    if (inventoryRes.error) throw new Error(inventoryRes.error.message);
    if (inventoryRes.data) {
        const participants = result(
            await admin
                .from('inventory_request_participants')
                .select('profile_id')
                .eq('request_id', requestId),
        ) as Row[];
        return {
            kind: 'inventory_request',
            requesterId: inventoryRes.data.requester_id,
            participantIds: participants.map((p) => p.profile_id).filter(Boolean),
        };
    }
    const programRes = await admin
        .from('program_requests')
        .select('requester_id')
        .eq('id', requestId)
        .maybeSingle();
    if (programRes.error) throw new Error(programRes.error.message);
    if (programRes.data) {
        const participants = result(
            await admin
                .from('program_request_participants')
                .select('profile_id')
                .eq('request_id', requestId),
        ) as Row[];
        return {
            kind: 'program_request',
            requesterId: programRes.data.requester_id,
            participantIds: participants.map((p) => p.profile_id).filter(Boolean),
        };
    }
    return null;
}

// Notifications (email/WhatsApp) aren't wired up yet — the source app sent
// one on every comment via sendCommentNotification; this only writes the
// row for now. The email_outbox table exists for exactly this, unbuilt.
async function addComment(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    requestId: string,
    message: string,
    dedupeRequestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const trimmed = requireNonEmpty(message, 'Message is required.');
    const owner = await findRequestOwner(admin, requestId);
    if (!owner) throw new Error('Request not found.');
    const canComment =
        isApprover ||
        owner.requesterId === actor.id ||
        owner.participantIds.indexOf(actor.id) !== -1;
    if (!canComment) throw new Error('You do not have access to this request.');

    const { result: comment } = await withLockedDedupe(
        admin,
        owner.kind + ':' + requestId + ':comment',
        dedupeRequestId,
        async () => {
            const created = result(
                await client
                    .from('comments')
                    .insert({
                        target_type: owner.kind,
                        target_id: requestId,
                        author_id: actor.id,
                        message: trimmed,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            return commentDto(created, new Map([[actor.id, actor]]));
        },
    );
    return comment;
}

// ---------------------------------------------------------------------------
// Inventory requests
// ---------------------------------------------------------------------------

function inventoryRequestDto(
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
        })),
        comments: comments.map((c) => commentDto(c, profilesById)),
    };
}

function inventoryRequestSortValue(request: Row, sortBy: unknown): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'startDate') return request.StartDate;
    if (sortBy === 'endDate') return request.EndDate;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

async function listInventoryRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const [typesRes, departmentsRes, requestsRes, itemsRes, participantsRes] = await Promise.all([
        client.from('inventory_types').select('*'),
        client.from('departments').select('*'),
        client.from('inventory_requests').select('*'),
        client.from('inventory_request_items').select('*'),
        client.from('inventory_request_participants').select('*'),
    ]);
    const typesById = new Map((result(typesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const requests = result(requestsRes) as Row[];
    const items = result(itemsRes) as Row[];
    const participants = result(participantsRes) as Row[];
    const commentsByTarget = await commentsByTargetFor(client, admin, 'inventory_request');
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

async function getInventoryRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [requestRes, typesRes, departmentsRes, itemsRes, participantsRes, commentsRes] =
        await Promise.all([
            client.from('inventory_requests').select('*').eq('id', id).single(),
            client.from('inventory_types').select('*'),
            client.from('departments').select('*'),
            client.from('inventory_request_items').select('*').eq('request_id', id),
            client.from('inventory_request_participants').select('*').eq('request_id', id),
            client
                .from('comments')
                .select('*')
                .eq('target_type', 'inventory_request')
                .eq('target_id', id)
                .order('created_at'),
        ]);
    const request = result(requestRes) as Row;
    const typesById = new Map((result(typesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const items = result(itemsRes) as Row[];
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
function parseParticipants(raw: unknown): string[] {
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
async function resolveParticipants(admin: SupabaseClient, emails: string[]): Promise<Row[]> {
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

async function insertActionComment(
    admin: SupabaseClient,
    targetType: 'inventory_request' | 'program_request',
    targetId: string,
    authorId: string,
    message: string,
): Promise<void> {
    const { error } = await admin
        .from('comments')
        .insert({ target_type: targetType, target_id: targetId, author_id: authorId, message });
    if (error) throw new Error(error.message);
}

async function requireRequesterProfile(admin: SupabaseClient, email: string): Promise<Row> {
    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Requester not found.');
    return data;
}

async function requireDepartment(admin: SupabaseClient, id: string): Promise<Row> {
    const { data, error } = await admin.from('departments').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Department not found.');
    return data;
}

async function validateInventoryItems(admin: SupabaseClient, items: Row[]): Promise<Row[]> {
    return Promise.all(
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
            return {
                inventory_type_id: line.inventoryTypeId,
                quantity: Number(line.quantity),
                return_condition: condition || null,
            };
        }),
    );
}

// Replaces an inventory/program request's child rows wholesale — the
// frontend always sends the full desired list, same as the old JSON-column
// writes did, so delete-then-insert reproduces that "whole column
// overwrite" semantics. Not atomic across the two statements (Supabase-js
// has no client-side multi-table transaction); the withLockedDedupe wrapper
// around every caller at least rules out a concurrent duplicate submission
// racing this same sequence.
async function replaceInventoryRequestItems(
    admin: SupabaseClient,
    requestId: string,
    items: Row[],
): Promise<void> {
    const { error: deleteError } = await admin
        .from('inventory_request_items')
        .delete()
        .eq('request_id', requestId);
    if (deleteError) throw new Error(deleteError.message);
    if (!items.length) return;
    const { error } = await admin
        .from('inventory_request_items')
        .insert(items.map((item) => ({ ...item, request_id: requestId })));
    if (error) throw new Error(error.message);
}

async function replaceParticipants(
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

async function createInventoryRequest(
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
            if (items.length) {
                const { error } = await admin
                    .from('inventory_request_items')
                    .insert(items.map((item) => ({ ...item, request_id: created.id })));
                if (error) throw new Error(error.message);
            }
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

async function updateInventoryRequest(
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

async function updateInventoryRequestParticipants(
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
async function computeDeductionsByType(admin: SupabaseClient): Promise<Map<string, number>> {
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

// Ported from performInventoryRequestAction in Inventory.ts (itself a port
// of the source app's perform_inventory_request_action Postgres function).
// Wrapped end-to-end in withLockedDedupe, same as the Apps Script version
// wrapped it in withLock — the one-row-at-a-time application-level check
// stands in for real per-row `FOR UPDATE` locking.
async function performInventoryRequestAction(
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
                    const types = result(await admin.from('inventory_types').select('*')) as Row[];
                    const typesById = new Map(types.map((t) => [t.id, t]));
                    const deductions = await computeDeductionsByType(admin);
                    for (const item of items) {
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

async function deleteInventoryRequest(
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

// ---------------------------------------------------------------------------
// Program requests
// ---------------------------------------------------------------------------

function programSessionDto(x: Row): Row {
    return {
        Name: x.name || '',
        Type: x.session_type,
        StartDateTime: x.start_at,
        EndDateTime: x.end_at,
    };
}

function programRequestDto(
    x: Row,
    placesById: Map<string, Row>,
    departmentsById: Map<string, Row>,
    profilesById: Map<string, Row>,
    sessions: Row[],
    participants: Row[],
    comments: Row[],
): Row {
    const requestSessions = sessions.map(programSessionDto);
    return {
        Id: x.id,
        DisplayId: x.display_id,
        Name: x.name,
        Language: x.language,
        Type: x.program_type,
        UserId: profilesById.get(x.requester_id)?.email || '',
        Status: x.status,
        PlaceId: x.place_id,
        DepartmentId: x.department_id || '',
        LeadEmail: x.lead_email,
        Participants: '',
        SessionsJson: '',
        CommentsJson: '',
        userName: profilesById.get(x.requester_id)?.name || '',
        placeName: placesById.get(x.place_id)?.name || '',
        departmentName: departmentsById.get(x.department_id)?.name || '',
        participants: participants
            .map((p) => profilesById.get(p.profile_id)?.email || p.external_email || '')
            .filter(Boolean),
        sessions: requestSessions,
        sessionStart: requestSessions[0]?.StartDateTime || '',
        sessionEnd: requestSessions.at(-1)?.EndDateTime || '',
        comments: comments.map((c) => commentDto(c, profilesById)),
    };
}

function programRequestSortValue(request: Row, sortBy: unknown): string | number {
    if (sortBy === 'name') return request.Name;
    if (sortBy === 'status') return request.Status;
    if (sortBy === 'place') return request.placeName;
    if (sortBy === 'sessionStart') return request.sessionStart;
    if (sortBy === 'requester') return request.userName;
    return request.DisplayId;
}

function matchesProgramDateScope(request: Row, dateScope: unknown): boolean {
    if (!dateScope) return true;
    const nowIso = new Date().toISOString();
    const hasOngoingOrFuture = (request.sessions as Row[]).some((s) => s.EndDateTime >= nowIso);
    const isUnscheduled = (request.sessions as Row[]).length === 0;
    return dateScope === 'past'
        ? !hasOngoingOrFuture && !isUnscheduled
        : hasOngoingOrFuture || isUnscheduled;
}

async function listProgramRequests(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
    query: Row,
): Promise<Row> {
    const [placesRes, departmentsRes, requestsRes, sessionsRes, participantsRes] =
        await Promise.all([
            client.from('places').select('*'),
            client.from('departments').select('*'),
            client.from('program_requests').select('*'),
            client.from('program_sessions').select('*').order('start_at'),
            client.from('program_request_participants').select('*'),
        ]);
    const placesById = new Map((result(placesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const requests = result(requestsRes) as Row[];
    const sessions = result(sessionsRes) as Row[];
    const participants = result(participantsRes) as Row[];
    const commentsByTarget = await commentsByTargetFor(client, admin, 'program_request');
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(admin, [
        ...requests.map((x) => x.requester_id),
        ...participants.map((x) => x.profile_id),
    ]);

    const dtos = requests.map((x) =>
        programRequestDto(
            x,
            placesById,
            departmentsById,
            profilesById,
            sessionsByRequest.get(x.id) || [],
            participantsByRequest.get(x.id) || [],
            commentsByTarget.get(x.id) || [],
        ),
    );

    const statuses: string[] = query.statuses || [];
    const filtered = dtos
        .filter((r) => statuses.length === 0 || statuses.indexOf(r.Status) !== -1)
        .filter((r) => !query.placeId || r.PlaceId === query.placeId)
        .filter((r) => matchesProgramDateScope(r, query.dateScope))
        .filter((r) =>
            matchesSearch(query.q, [
                'PRG-' + r.DisplayId,
                r.Name,
                r.Language,
                r.Type,
                r.userName,
                r.UserId,
                r.departmentName,
                r.LeadEmail,
                r.participants.join(' '),
                r.placeName,
                r.sessions.map((s: Row) => s.Name + ' ' + s.Type).join(' '),
            ]),
        );

    if (query.sortBy) {
        filtered.sort((a, b) =>
            compareQueryValues(
                programRequestSortValue(a, query.sortBy),
                programRequestSortValue(b, query.sortBy),
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

async function getProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    id: string,
): Promise<Row> {
    const [requestRes, placesRes, departmentsRes, sessionsRes, participantsRes, commentsRes] =
        await Promise.all([
            client.from('program_requests').select('*').eq('id', id).single(),
            client.from('places').select('*'),
            client.from('departments').select('*'),
            client.from('program_sessions').select('*').eq('request_id', id).order('start_at'),
            client.from('program_request_participants').select('*').eq('request_id', id),
            client
                .from('comments')
                .select('*')
                .eq('target_type', 'program_request')
                .eq('target_id', id)
                .order('created_at'),
        ]);
    const request = result(requestRes) as Row;
    const placesById = new Map((result(placesRes) as Row[]).map((x) => [x.id, x]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((x) => [x.id, x]));
    const sessions = result(sessionsRes) as Row[];
    const participants = result(participantsRes) as Row[];
    const comments = result(commentsRes) as Row[];
    const profilesById = await profilesFor(admin, [
        request.requester_id,
        ...participants.map((x) => x.profile_id),
        ...comments.map((x) => x.author_id),
    ]);
    return programRequestDto(
        request,
        placesById,
        departmentsById,
        profilesById,
        sessions,
        participants,
        comments,
    );
}

const PROGRAM_REQUEST_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'cancelled'];

// `name` is only required when Type is 'Other' — every other program type
// carries its own name (matches PROGRAM_REQUIRED_FIELDS in Programs.ts).
function validateProgramSessions(sessions: Row[], requireAtLeastOne = true): Row[] {
    const cleaned = (sessions || []).map((session) => {
        const sessionType = requireNonEmpty(session.type, 'Session type is required.');
        const startDateTime = requireNonEmpty(session.startDateTime, 'Session start is required.');
        const endDateTime = requireNonEmpty(session.endDateTime, 'Session end is required.');
        const startMs = Date.parse(startDateTime);
        const endMs = Date.parse(endDateTime);
        if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
            throw new Error('Session end must be after its start.');
        }
        if (endMs - startMs >= 24 * 60 * 60 * 1000) {
            throw new Error('Sessions must be shorter than 24 hours.');
        }
        return {
            name: String(session.name || ''),
            session_type: sessionType,
            start_at: startDateTime,
            end_at: endDateTime,
        };
    });
    if (requireAtLeastOne && !cleaned.length) throw new Error('At least one session is required.');
    return cleaned;
}

function sessionsOverlapWithBuffer(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
    bufferMs: number,
): boolean {
    const ls = Date.parse(leftStart);
    const le = Date.parse(leftEnd);
    const rs = Date.parse(rightStart);
    const re = Date.parse(rightEnd);
    if ([ls, le, rs, re].some((value) => Number.isNaN(value))) return false;
    return ls < re + bufferMs && rs < le + bufferMs;
}

function rangesOverlap(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
): boolean {
    return leftStart < rightEnd && rightStart < leftEnd;
}

// A place can't host two approved programs within an hour of each other —
// ported from assertPlaceAvailability in Programs.ts.
async function assertPlaceAvailability(
    admin: SupabaseClient,
    placeId: string | null,
    sessions: Row[],
    currentRequestId?: string,
): Promise<void> {
    if (!placeId || !sessions.length) return;
    const requests = result(
        await admin
            .from('program_requests')
            .select('id')
            .eq('place_id', placeId)
            .eq('status', 'approved'),
    ) as Row[];
    const otherIds = requests.map((r) => r.id).filter((id) => id !== currentRequestId);
    if (!otherIds.length) return;
    const otherSessions = result(
        await admin.from('program_sessions').select('start_at, end_at').in('request_id', otherIds),
    ) as Row[];
    const bufferMs = 60 * 60 * 1000;
    const conflict = otherSessions.some((other) =>
        sessions.some((session) =>
            sessionsOverlapWithBuffer(
                session.start_at,
                session.end_at,
                other.start_at,
                other.end_at,
                bufferMs,
            ),
        ),
    );
    if (conflict) {
        throw new Error(
            'This place is unavailable: its session is within one hour of another scheduled program.',
        );
    }
}

// Blocks with no place set apply to every non-approver submission — ported
// from assertProgramSessionsNotBlockedForUser in Programs.ts.
async function assertProgramSessionsNotBlockedForUser(
    admin: SupabaseClient,
    sessions: Row[],
): Promise<void> {
    const blocks = result(await admin.from('blocks').select('*').eq('place', '')) as Row[];
    const blocking = blocks.find((block) =>
        sessions.some((session) =>
            rangesOverlap(session.start_at, session.end_at, block.start_at, block.end_at),
        ),
    );
    if (blocking) throw new Error('This request overlaps with a blocked time: ' + blocking.name);
}

async function getAvailablePlaces(
    admin: SupabaseClient,
    currentRequestId: string,
    inputSessions: Row[],
): Promise<Row[]> {
    const sessions = (inputSessions || []).map((s) => ({
        start_at: s.startDateTime || '',
        end_at: s.endDateTime || '',
    }));
    const places = result(await admin.from('places').select('*').order('name')) as Row[];
    if (!sessions.length) return places.map((p) => ({ Id: p.id, Name: p.name }));
    const approved = result(
        await admin.from('program_requests').select('id, place_id').eq('status', 'approved'),
    ) as Row[];
    const relevantIds = approved.filter((r) => r.id !== currentRequestId).map((r) => r.id);
    const otherSessions = relevantIds.length
        ? (result(
              await admin
                  .from('program_sessions')
                  .select('request_id, start_at, end_at')
                  .in('request_id', relevantIds),
          ) as Row[])
        : [];
    const placeIdByRequest = new Map(approved.map((r) => [r.id, r.place_id]));
    const bufferMs = 60 * 60 * 1000;
    return places
        .filter(
            (place) =>
                !otherSessions.some(
                    (other) =>
                        placeIdByRequest.get(other.request_id) === place.id &&
                        sessions.some((session) =>
                            sessionsOverlapWithBuffer(
                                session.start_at,
                                session.end_at,
                                other.start_at,
                                other.end_at,
                                bufferMs,
                            ),
                        ),
                ),
        )
        .map((p) => ({ Id: p.id, Name: p.name }));
}

// The calendar is an org-wide events view, not a personal request list — every
// signed-in user sees every approved program regardless of role or whether
// they're the requester/a participant, so this reads through `admin` rather
// than the RLS-scoped `client` (which would narrow a plain `user` down to
// just their own requests, same as the request-detail pages already do).
async function getCalendarMonth(admin: SupabaseClient, year: number, month: number): Promise<Row> {
    const [placesRes, departmentsRes, requestsRes] = await Promise.all([
        admin.from('places').select('*').order('name'),
        admin.from('departments').select('*'),
        admin.from('program_requests').select('*').eq('status', 'approved'),
    ]);
    const places = result(placesRes) as Row[];
    const placesById = new Map(places.map((p) => [p.id, p]));
    const departmentsById = new Map((result(departmentsRes) as Row[]).map((d) => [d.id, d]));
    const requests = result(requestsRes) as Row[];
    const requestIds = requests.map((r) => r.id);
    const [sessionsRows, participantRows] = requestIds.length
        ? await Promise.all([
              admin.from('program_sessions').select('*').in('request_id', requestIds),
              admin.from('program_request_participants').select('*').in('request_id', requestIds),
          ])
        : [
              { data: [], error: null },
              { data: [], error: null },
          ];
    const sessions = result(sessionsRows) as Row[];
    const participants = result(participantRows) as Row[];
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const participantsByRequest = groupByKey(participants, 'request_id');
    const profilesById = await profilesFor(
        admin,
        requests.map((r) => r.requester_id),
    );
    const monthStart = Date.UTC(year, month - 1, 1);
    const monthEnd = Date.UTC(year, month, 1);
    const programs: Row[] = [];
    requests.forEach((request) => {
        const allSessions = sessionsByRequest.get(request.id) || [];
        const monthSessions = allSessions.filter((s) => {
            const start = Date.parse(s.start_at);
            const end = Date.parse(s.end_at);
            return (
                !Number.isNaN(start) && !Number.isNaN(end) && start < monthEnd && end > monthStart
            );
        });
        if (!monthSessions.length) return;
        // sessionStart/sessionEnd reflect the program's full schedule
        // (computed from allSessions); only the `sessions` field itself is
        // narrowed to this month, same split the source app made.
        const dto = programRequestDto(
            request,
            placesById,
            departmentsById,
            profilesById,
            allSessions,
            participantsByRequest.get(request.id) || [],
            [],
        );
        programs.push({ ...dto, sessions: monthSessions.map(programSessionDto), comments: [] });
    });
    return { places: places.map((p) => ({ Id: p.id, Name: p.name })), programs };
}

async function createProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name =
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || '');
    const language = requireNonEmpty(input.language, 'Language is required.');
    const requesterEmail = String(input.userId || actor.email).toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    if (requestedBy.email !== actor.email && !isApprover) {
        throw new Error('You cannot create a request on behalf of another user.');
    }
    if (input.placeId && !isApprover) throw new Error('Only an approver can assign a place.');
    let place: Row | null = null;
    if (input.placeId) {
        const { data, error } = await admin
            .from('places')
            .select('*')
            .eq('id', input.placeId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Place not found.');
        place = data;
    }
    const sessions = validateProgramSessions(input.sessions || []);
    await assertPlaceAvailability(admin, place?.id || null, sessions);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);

    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:create',
        requestId,
        async () => {
            const created = result(
                await admin
                    .from('program_requests')
                    .insert({
                        name,
                        language,
                        program_type: type,
                        requester_id: requestedBy.id,
                        status: 'draft',
                        place_id: place ? place.id : null,
                        department_id: department.id,
                        lead_email: leadEmail,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            if (sessions.length) {
                const { error } = await admin
                    .from('program_sessions')
                    .insert(sessions.map((s) => ({ ...s, request_id: created.id })));
                if (error) throw new Error(error.message);
            }
            await replaceParticipants(
                admin,
                'program_request_participants',
                created.id,
                participantEmails,
            );
            return getProgramRequest(client, admin, created.id);
        },
    );
    return dto;
}

async function updateProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    const type = requireNonEmpty(input.type, 'Program type is required.');
    const name =
        type === 'Other'
            ? requireNonEmpty(input.name, 'Program title is required.')
            : String(input.name || '');
    const language = requireNonEmpty(input.language, 'Language is required.');
    const requesterEmail = requireNonEmpty(input.userId, 'Requester is required.').toLowerCase();
    const requestedBy = await requireRequesterProfile(admin, requesterEmail);
    let place: Row | null = null;
    if (input.placeId) {
        const { data, error } = await admin
            .from('places')
            .select('*')
            .eq('id', input.placeId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Place not found.');
        place = data;
    }
    // Existing legacy programs may have no sessions; they remain editable —
    // only createProgramRequest requires at least one.
    const sessions = validateProgramSessions(input.sessions || [], false);
    await assertPlaceAvailability(admin, place?.id || null, sessions, id);
    const department = await requireDepartment(
        admin,
        requireNonEmpty(input.departmentId, 'Department is required.'),
    );
    const leadEmail = requireNonEmpty(input.leadEmail, 'Lead email is required.').toLowerCase();
    const participantEmails = parseParticipants(input.participants);
    const requestedStatus = input.status as string | undefined;
    if (requestedStatus && PROGRAM_REQUEST_STATUSES.indexOf(requestedStatus) === -1) {
        throw new Error('Invalid status.');
    }

    const { result: dto } = await withLockedDedupe(
        admin,
        'program_request:update:' + id,
        requestId,
        async () => {
            const [existingRes, participantsRes] = await Promise.all([
                admin.from('program_requests').select('*').eq('id', id).single(),
                admin.from('program_request_participants').select('*').eq('request_id', id),
            ]);
            const existing = result(existingRes) as Row;
            const existingParticipants = result(participantsRes) as Row[];
            const isOwner =
                existing.requester_id === actor.id ||
                existingParticipants.some((p) => p.profile_id === actor.id);
            if (!(isApprover || (isOwner && existing.status === 'draft'))) {
                throw new Error('You are not allowed to edit this request.');
            }
            const newPlaceId = place ? place.id : null;
            if (existing.place_id !== newPlaceId && !isApprover) {
                throw new Error('Only an approver can change the assigned place.');
            }
            if (existing.requester_id !== requestedBy.id && !isApprover) {
                throw new Error('You cannot reassign the requester.');
            }
            const nextStatus = requestedStatus || existing.status;
            if (nextStatus !== existing.status && !isApprover) {
                throw new Error('Only an approver can change the status.');
            }
            const updated = result(
                await admin
                    .from('program_requests')
                    .update({
                        name,
                        language,
                        program_type: type,
                        requester_id: requestedBy.id,
                        place_id: newPlaceId,
                        department_id: department.id,
                        lead_email: leadEmail,
                        status: nextStatus,
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            const { error: deleteSessionsError } = await admin
                .from('program_sessions')
                .delete()
                .eq('request_id', id);
            if (deleteSessionsError) throw new Error(deleteSessionsError.message);
            if (sessions.length) {
                const { error } = await admin
                    .from('program_sessions')
                    .insert(sessions.map((s) => ({ ...s, request_id: id })));
                if (error) throw new Error(error.message);
            }
            await replaceParticipants(admin, 'program_request_participants', id, participantEmails);
            if (nextStatus !== existing.status) {
                await insertActionComment(
                    admin,
                    'program_request',
                    id,
                    actor.id,
                    actor.name + ' changed the status to ' + nextStatus + '.',
                );
            }
            return updated;
        },
    );
    return getProgramRequest(client, admin, dto.id);
}

async function updateProgramRequestParticipants(
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
    await withLockedDedupe(admin, 'program_request:participants:' + id, requestId, async () => {
        const [existingRes, participantsRes] = await Promise.all([
            admin.from('program_requests').select('*').eq('id', id).single(),
            admin.from('program_request_participants').select('*').eq('request_id', id),
        ]);
        const existing = result(existingRes) as Row;
        const existingParticipants = result(participantsRes) as Row[];
        const canEdit =
            isApprover ||
            existing.requester_id === actor.id ||
            existingParticipants.some((p) => p.profile_id === actor.id);
        if (!canEdit) throw new Error('You are not allowed to edit participants on this request.');
        await replaceParticipants(admin, 'program_request_participants', id, participantEmails);
        return null;
    });
    return getProgramRequest(client, admin, id);
}

// Ported from performProgramRequestAction in Programs.ts — same shape as
// performInventoryRequestAction minus the issue/return step.
async function performProgramRequestAction(
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
        'program_request:' + id + ':' + action,
        dedupeRequestId,
        async (): Promise<string> => {
            const [requestRes, participantsRes, sessionsRes] = await Promise.all([
                admin.from('program_requests').select('*').eq('id', id).single(),
                admin.from('program_request_participants').select('*').eq('request_id', id),
                admin.from('program_sessions').select('*').eq('request_id', id),
            ]);
            const request = result(requestRes) as Row;
            const participants = result(participantsRes) as Row[];
            const sessions = result(sessionsRes) as Row[];
            let computedStatus: string;
            const narrate = (message: string) =>
                insertActionComment(admin, 'program_request', id, actor.id, message);

            if (action === 'submit') {
                const isOwner =
                    request.requester_id === actor.id ||
                    participants.some((p) => p.profile_id === actor.id);
                if ((!isOwner && !isApprover) || request.status !== 'draft') {
                    throw new Error('Invalid transition.');
                }
                if (!sessions.length) throw new Error('At least one session is required.');
                if (!isApprover) await assertProgramSessionsNotBlockedForUser(admin, sessions);
                computedStatus = 'submitted';
                await narrate(actor.name + ' submitted this request.');
            } else {
                if (!isApprover) throw new Error('Approver access is required.');
                if (action === 'approve') {
                    if (request.status !== 'submitted') throw new Error('Invalid transition.');
                    if (!request.place_id)
                        throw new Error('A place must be assigned before approval.');
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
                } else if (action === 'cancel') {
                    if (['draft', 'submitted', 'approved'].indexOf(request.status) === -1) {
                        throw new Error('Invalid transition.');
                    }
                    if (request.status === 'approved') {
                        const hasFuture = sessions.some((s) => Date.parse(s.end_at) >= Date.now());
                        if (!hasFuture) throw new Error('Cannot cancel an approved past program.');
                    }
                    computedStatus = 'cancelled';
                    await narrate(
                        actor.name + ' cancelled this request.' + (note ? ' ' + note : ''),
                    );
                } else {
                    throw new Error('Unsupported action.');
                }
            }

            const { error } = await admin
                .from('program_requests')
                .update({ status: computedStatus })
                .eq('id', id);
            if (error) throw new Error(error.message);
            return computedStatus;
        },
    );
    return nextStatus;
}

async function deleteProgramRequest(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    id: string,
    requestId: string,
): Promise<void> {
    const actor = await currentProfile(client, userId);
    const isApprover = actor.role === 'admin' || actor.role === 'approver';
    await withLockedDedupe(admin, 'program_request:delete:' + id, requestId, async () => {
        const [requestRes, participantsRes] = await Promise.all([
            admin.from('program_requests').select('*').eq('id', id).single(),
            admin.from('program_request_participants').select('*').eq('request_id', id),
        ]);
        const request = result(requestRes) as Row;
        const participants = result(participantsRes) as Row[];
        const owner =
            request.requester_id === actor.id ||
            participants.some((p) => p.profile_id === actor.id);
        if (!isApprover && !owner) throw new Error('You are not allowed to delete this request.');
        if (['draft', 'cancelled', 'rejected'].indexOf(request.status) === -1) {
            throw new Error('This request can no longer be deleted.');
        }
        const { error } = await admin.from('program_requests').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}

// ---------------------------------------------------------------------------
// Images (Supabase Storage, replacing the source app's DriveApp uploads)
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_MIME_TYPES = ['image/avif', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 50 * 1024;
const IMAGE_BUCKET = 'request-images';
const IMAGE_URL_TTL_SECONDS = 60 * 60;

async function createImageUploadUrl(
    admin: SupabaseClient,
    userId: string,
    fileName: string,
    mimeType: string,
): Promise<Row> {
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1)
        throw new Error('That file type is not supported.');
    requireNonEmpty(fileName, 'A file name is required.');
    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await admin.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: data.token };
}

async function uploadImage(
    admin: SupabaseClient,
    userId: string,
    base64Data: string,
    fileName: string,
    mimeType: string,
    previousImageId: string,
): Promise<string> {
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {
        throw new Error('That file type is not supported.');
    }
    requireNonEmpty(fileName, 'A file name is required.');
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('The selected file is too large.');

    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(IMAGE_BUCKET).upload(path, bytes, {
        contentType: mimeType,
        upsert: false,
    });
    if (error) throw new Error(error.message);

    // Storage has no in-place binary replace either — upload the new object
    // first, then best-effort remove the old one, so a failed upload never
    // leaves a request pointing at nothing (same trade-off as the source
    // app's Drive create-then-trash sequence).
    const previousPath = String(previousImageId || '').trim();
    if (previousPath && previousPath !== path) {
        await admin.storage.from(IMAGE_BUCKET).remove([previousPath]);
    }
    return path;
}

// The bucket is private, so every render needs a fresh signed URL rather than
// a stable public link — same "only a trusted Edge Function issues
// upload/download URLs" boundary the bucket's own migration comment
// describes. Knowing the (random, unguessable) path is treated as
// sufficient — the same trust model the source app used for Drive's
// anyone-with-link sharing.
async function getImageUrl(admin: SupabaseClient, imageId: string): Promise<string> {
    const path = String(imageId || '').trim();
    if (!path) return '';
    const { data, error } = await admin.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(path, IMAGE_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);
    return data.signedUrl;
}

async function dashboard(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
): Promise<Row> {
    const responses = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).single(),
        client.from('departments').select('*').order('name'),
        client.from('places').select('*').order('name'),
        client.from('inventory_types').select('*').order('name'),
        client.rpc('inventory_availability'),
        client
            .from('rosters')
            .select('*')
            .gte('end_at', new Date().toISOString())
            .order('start_at'),
        client.from('inventory_requests').select('*').order('updated_at', { ascending: false }),
        client.from('inventory_request_items').select('*'),
        client.from('inventory_request_participants').select('*'),
        client.from('program_requests').select('*').order('updated_at', { ascending: false }),
        client.from('program_sessions').select('*').order('start_at'),
        client.from('program_request_participants').select('*'),
        client.from('comments').select('*').order('created_at'),
        client.from('home_content').select('*').eq('id', true).single(),
        client.from('shift_types').select('*').order('name'),
        client.from('program_types').select('*').order('name'),
        client.from('program_languages').select('*').order('name'),
        client.from('session_types').select('*').order('name'),
        client.from('blocks').select('*').order('start_at'),
    ]);
    const [
        profile,
        departments,
        places,
        types,
        availability,
        rosters,
        inventory,
        items,
        inventoryParticipants,
        programs,
        sessions,
        programParticipants,
        comments,
        home,
        shiftTypes,
        programTypes,
        languages,
        sessionTypes,
        blocks,
    ] = responses.map((r) => result(r)) as Row[];
    const departmentsById = new Map(departments.map((x: Row) => [x.id, x]));
    const placesById = new Map(places.map((x: Row) => [x.id, x]));
    const typesById = new Map(types.map((x: Row) => [x.id, x]));
    const availableById = new Map(
        availability.map((x: Row) => [x.inventory_type_id, x.available_quantity]),
    );
    const profileIds = [
        profile.id,
        ...rosters.map((x: Row) => x.user_id),
        ...inventory.map((x: Row) => x.requester_id),
        ...inventoryParticipants.map((x: Row) => x.profile_id),
        ...programs.map((x: Row) => x.requester_id),
        ...programParticipants.map((x: Row) => x.profile_id),
        ...comments.map((x: Row) => x.author_id),
    ];
    const profilesById = await profilesFor(admin, profileIds);
    const dashboardProfiles =
        profile.role === 'admin' || profile.role === 'approver'
            ? (result(await client.from('profiles').select('*')) as Row[])
            : [profile];
    const participants = new Map<string, string[]>();
    [...inventoryParticipants, ...programParticipants].forEach((x: Row) => {
        const values = participants.get(x.request_id) || [];
        values.push(profilesById.get(x.profile_id)?.email || x.external_email || '');
        participants.set(x.request_id, values.filter(Boolean));
    });
    const itemsByRequest = new Map<string, Row[]>();
    items.forEach((x: Row) => {
        const values = itemsByRequest.get(x.request_id) || [];
        values.push({
            InventoryTypeId: x.inventory_type_id,
            Quantity: x.quantity,
            Condition: x.return_condition || '',
            itemName: typesById.get(x.inventory_type_id)?.name || '',
        });
        itemsByRequest.set(x.request_id, values);
    });
    const sessionsByRequest = new Map<string, Row[]>();
    sessions.forEach((x: Row) => {
        const values = sessionsByRequest.get(x.request_id) || [];
        values.push({
            Name: x.name || '',
            Type: x.session_type,
            StartDateTime: x.start_at,
            EndDateTime: x.end_at,
        });
        sessionsByRequest.set(x.request_id, values);
    });
    const commentsByTarget = new Map<string, Row[]>();
    comments.forEach((x: Row) => {
        const values = commentsByTarget.get(`${x.target_type}:${x.target_id}`) || [];
        const author = profilesById.get(x.author_id);
        values.push({
            Id: x.id,
            Timestamp: x.created_at,
            RequestId: x.target_id,
            UserId: author?.email || '',
            Message: x.message,
            userName: author?.name || '',
        });
        commentsByTarget.set(`${x.target_type}:${x.target_id}`, values);
    });
    return {
        me: userDto(profile, departmentsById),
        users: dashboardProfiles.map((x: Row) => userDto(x, departmentsById)),
        departments: departments.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            ShortName: x.short_name,
            LeadEmail: x.lead_email,
        })),
        places: places.map((x: Row) => ({ Id: x.id, Name: x.name })),
        inventoryTypes: types.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            Description: x.description,
            Requestable: x.requestable,
            ImageId: x.image_path,
            TotalQuantity: x.total_quantity,
            availableQuantity: availableById.get(x.id) ?? x.total_quantity,
        })),
        upcomingRosters: rosters.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            StartDate: x.start_at.slice(0, 10),
            EndDate: x.end_at.slice(0, 10),
            StartTime: x.start_at.slice(11, 16),
            EndTime: x.end_at.slice(11, 16),
            UserId: profilesById.get(x.user_id)?.email || '',
            userName: profilesById.get(x.user_id)?.name || '',
        })),
        inventoryRequests: inventory.map((x: Row) => ({
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
            participants: participants.get(x.id) || [],
            items: itemsByRequest.get(x.id) || [],
            comments: commentsByTarget.get(`inventory_request:${x.id}`) || [],
        })),
        programRequests: programs.map((x: Row) => {
            const requestSessions = sessionsByRequest.get(x.id) || [];
            return {
                Id: x.id,
                DisplayId: x.display_id,
                Name: x.name,
                Language: x.language,
                Type: x.program_type,
                UserId: profilesById.get(x.requester_id)?.email || '',
                Status: x.status,
                PlaceId: x.place_id,
                DepartmentId: x.department_id || '',
                LeadEmail: x.lead_email,
                Participants: '',
                SessionsJson: '',
                CommentsJson: '',
                userName: profilesById.get(x.requester_id)?.name || '',
                placeName: placesById.get(x.place_id)?.name || '',
                departmentName: departmentsById.get(x.department_id)?.name || '',
                participants: participants.get(x.id) || [],
                sessions: requestSessions,
                sessionStart: requestSessions[0]?.StartDateTime || '',
                sessionEnd: requestSessions.at(-1)?.EndDateTime || '',
                comments: commentsByTarget.get(`program_request:${x.id}`) || [],
            };
        }),
        homeContent: { Guidelines: home.guidelines },
        shiftTypes: shiftTypes.map((x: Row) => ({
            Name: x.name,
            Color: x.color,
            DefaultStartTime: String(x.default_start_time).slice(0, 5),
            DefaultEndTime: String(x.default_end_time).slice(0, 5),
        })),
        programTypes: programTypes.map((x: Row) => ({ Name: x.name, Color: x.color })),
        programLanguages: languages.map((x: Row) => ({ Name: x.name })),
        sessionTypes: sessionTypes.map((x: Row) => ({ Name: x.name })),
        blocks: blocks.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            Place: x.place,
            StartDateTime: x.start_at,
            EndDateTime: x.end_at,
        })),
        failedEmailCount: 0,
    };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);
    if (!appOrigin) return respond({ error: 'SETU_APP_ORIGIN is not configured.' }, 500);
    const authorization = request.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!authorization || !url || !key || !serviceKey)
        return respond({ error: 'Server authentication is not configured.' }, 500);
    const client = createClient(url, key, {
        global: { headers: { Authorization: authorization } },
    });
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return respond({ error: 'Authentication is required.' }, 401);
    const pathOperation = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop() || '';
    const body = (await request.json()) as RequestBody;
    if (!body.operation && pathOperation && pathOperation !== 'api') body.operation = pathOperation;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const args = body.args || [];
    try {
        await requireAllowedEmailDomain(admin, authData.user.email || '');
        switch (body.operation) {
            case 'whoAmI':
                return respond(await currentUser(client, authData.user.id));
            case 'getDashboard':
                return respond(await dashboard(client, admin, authData.user.id));
            case 'updateOwnProfile':
                return respond(await updateOwnProfile(client, admin, authData.user.id, args[0]));

            case 'createDepartment':
                return respond(
                    await createDepartment(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateDepartment':
                return respond(
                    await updateDepartment(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteDepartment':
                await deleteDepartment(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createPlace':
                return respond(
                    await createPlace(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updatePlace':
                return respond(
                    await updatePlace(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deletePlace':
                await deletePlace(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createInventoryType':
                return respond(
                    await createInventoryType(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateInventoryType':
                return respond(
                    await updateInventoryType(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteInventoryType':
                await deleteInventoryType(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'updateUser':
                return respond(
                    await updateUser(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                    ),
                );
            case 'deleteUser':
                await deleteUser(client, admin, authData.user.id, String(args[0]), String(args[1]));
                return respond(null);

            case 'createShiftType':
                return respond(
                    await createShiftType(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateShiftType':
                return respond(
                    await updateShiftType(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteShiftType':
                await deleteShiftType(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createProgramType':
                return respond(
                    await createNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'program_types',
                        'program-type',
                        'program type',
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateProgramType':
                return respond(
                    await updateNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'program_types',
                        'program-type',
                        'program type',
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteProgramType':
                await deleteNamedOption(
                    client,
                    admin,
                    authData.user.id,
                    'program_types',
                    'program-type',
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createProgramLanguage':
                return respond(
                    await createNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'program_languages',
                        'program-language',
                        'language',
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateProgramLanguage':
                return respond(
                    await updateNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'program_languages',
                        'program-language',
                        'language',
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteProgramLanguage':
                await deleteNamedOption(
                    client,
                    admin,
                    authData.user.id,
                    'program_languages',
                    'program-language',
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createSessionType':
                return respond(
                    await createNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'session_types',
                        'session-type',
                        'session type',
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateSessionType':
                return respond(
                    await updateNamedOption(
                        client,
                        admin,
                        authData.user.id,
                        'session_types',
                        'session-type',
                        'session type',
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteSessionType':
                await deleteNamedOption(
                    client,
                    admin,
                    authData.user.id,
                    'session_types',
                    'session-type',
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'createBlock':
                return respond(
                    await createBlock(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateBlock':
                return respond(
                    await updateBlock(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteBlock':
                await deleteBlock(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'updateHomeContent':
                return respond(
                    await updateHomeContent(client, admin, authData.user.id, args[0] as Row),
                );

            case 'listDepartments':
                return respond(await listDepartments(client));
            case 'listPlaces':
                return respond(await listPlaces(client));
            case 'listInventoryTypes':
                return respond(await listInventoryTypes(client));
            case 'getSettings':
                return respond(await getSettings(client));
            case 'listAllowedEmailDomains':
                return respond(await listAllowedEmailDomains(client, authData.user.id));
            case 'createAllowedEmailDomain':
                return respond(
                    await createAllowedEmailDomain(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'deleteAllowedEmailDomain':
                await deleteAllowedEmailDomain(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);
            case 'getHomeContent':
                return respond(await getHomeContent(client));
            case 'listBlocks':
                return respond(await listBlocks(client));
            case 'listUsers':
                return respond(await listUsers(client, authData.user.id));
            case 'listRosters':
                return respond(await listRosters(client, admin, Number(args[0]) || 1));
            case 'createRoster':
                return respond(
                    await createRoster(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateRoster':
                return respond(
                    await updateRoster(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteRoster':
                await deleteRoster(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);

            case 'listInventoryRequests':
                return respond(
                    await listInventoryRequests(
                        client,
                        admin,
                        Number(args[0]) || 1,
                        (args[1] as Row) || {},
                    ),
                );
            case 'getInventoryRequest':
                return respond(await getInventoryRequest(client, admin, String(args[0])));
            case 'createInventoryRequest':
                return respond(
                    await createInventoryRequest(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateInventoryRequest':
                return respond(
                    await updateInventoryRequest(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'updateInventoryRequestParticipants':
                return respond(
                    await updateInventoryRequestParticipants(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteInventoryRequest':
                await deleteInventoryRequest(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);
            case 'performInventoryRequestAction':
                // args[3] (returnItems) is unused — it's unused in the source
                // app's own implementation too (see the comment above
                // performInventoryRequestAction).
                return respond(
                    await performInventoryRequestAction(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        String(args[1]),
                        String(args[2] || ''),
                        String(args[4]),
                    ),
                );

            case 'listProgramRequests':
                return respond(
                    await listProgramRequests(
                        client,
                        admin,
                        Number(args[0]) || 1,
                        (args[1] as Row) || {},
                    ),
                );
            case 'getProgramRequest':
                return respond(await getProgramRequest(client, admin, String(args[0])));
            case 'getAvailablePlaces':
                return respond(
                    await getAvailablePlaces(
                        admin,
                        String(args[0] || ''),
                        (args[1] as Row[]) || [],
                    ),
                );
            case 'getCalendarMonth':
                return respond(await getCalendarMonth(admin, Number(args[0]), Number(args[1])));
            case 'createProgramRequest':
                return respond(
                    await createProgramRequest(
                        client,
                        admin,
                        authData.user.id,
                        args[0] as Row,
                        String(args[1]),
                    ),
                );
            case 'updateProgramRequest':
                return respond(
                    await updateProgramRequest(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'updateProgramRequestParticipants':
                return respond(
                    await updateProgramRequestParticipants(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        args[1] as Row,
                        String(args[2]),
                    ),
                );
            case 'deleteProgramRequest':
                await deleteProgramRequest(
                    client,
                    admin,
                    authData.user.id,
                    String(args[0]),
                    String(args[1]),
                );
                return respond(null);
            case 'performProgramRequestAction':
                return respond(
                    await performProgramRequestAction(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        String(args[1]),
                        String(args[2] || ''),
                        String(args[3]),
                    ),
                );

            case 'addComment':
                return respond(
                    await addComment(
                        client,
                        admin,
                        authData.user.id,
                        String(args[0]),
                        String(args[1]),
                        String(args[2]),
                    ),
                );

            case 'uploadImage':
                return respond(
                    await uploadImage(
                        admin,
                        authData.user.id,
                        String(args[0]),
                        String(args[1]),
                        String(args[2]),
                        String(args[3] || ''),
                    ),
                );
            case 'createImageUploadUrl':
                return respond(
                    await createImageUploadUrl(
                        admin,
                        authData.user.id,
                        String(args[0]),
                        String(args[1]),
                    ),
                );
            case 'getImageUrl':
                return respond(await getImageUrl(admin, String(args[0])));

            default:
                return respond(
                    {
                        error: `The ${String(body.operation || '')} operation has not been migrated yet.`,
                    },
                    501,
                );
        }
    } catch (error) {
        console.error(error);
        return respond(
            { error: error instanceof Error ? error.message : 'Unable to complete the request.' },
            400,
        );
    }
});
