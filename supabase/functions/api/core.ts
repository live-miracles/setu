import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { canWriteRole, isAdminRole, isApproverRole } from '../_shared/request-policy.ts';
import { boundedText, MAX_NAME_LENGTH, MAX_PHONE_LENGTH, requiredStringArg } from './validation.ts';

export type Row = Record<string, any>;

// An error with the HTTP status the caller should see. Anything thrown that is
// not an ApiError is a 400 carrying its message, as before.
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export function result<T>(
    value: { data: T | null; error: { message: string; code?: string } | null },
    duplicateMessage?: string | ((error: string) => string),
): T {
    if (value.error) {
        if (duplicateMessage && value.error.code === '23505') {
            throw new Error(
                typeof duplicateMessage === 'function'
                    ? duplicateMessage(value.error.message)
                    : duplicateMessage,
            );
        }
        throw new Error(value.error.message);
    }
    if (value.data === null) throw new Error('The requested record was not found.');
    return value.data;
}

// PostgREST caps every response at the project's max-rows setting (1000 by
// default) and silently truncates anything larger, so a plain select('*') on a
// growing table quietly drops rows. fetchAll pages with range() until a short
// page comes back. Callers must order by a unique column (add `.order('id')`
// last) so pages neither overlap nor skip rows.
const PAGE_SIZE = 1000;

export async function fetchAll(
    page: (
        from: number,
        to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const batch = result(await page(from, from + PAGE_SIZE - 1)) as Row[];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) return rows;
    }
}

// Long `.in(...)` lists travel in the request URL, which gateways cap at a few
// KB (~100 UUIDs is comfortably below it). fetchAllIn de-dups the ids, splits
// them into chunks and pages each chunk; the callback gets one chunk plus the
// page bounds and must order by a unique column.
const IN_CHUNK_SIZE = 100;

export async function fetchAllIn(
    ids: Iterable<string>,
    page: (
        chunk: string[],
        from: number,
        to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
    const uniqueIds = [...new Set([...ids].filter(Boolean))];
    const rows: Row[] = [];
    for (let index = 0; index < uniqueIds.length; index += IN_CHUNK_SIZE) {
        const chunk = uniqueIds.slice(index, index + IN_CHUNK_SIZE);
        rows.push(...(await fetchAll((from, to) => page(chunk, from, to))));
    }
    return rows;
}

export function requireNonEmpty(value: unknown, message: string): string {
    return requiredStringArg(value == null ? '' : String(value), message);
}

export async function currentProfile(client: SupabaseClient, userId: string): Promise<Row> {
    return result(await client.from('profiles').select('*').eq('id', userId).single()) as Row;
}

// Viewer is the organization-wide read-only role: it may read every request but
// never create, edit, transition, delete or comment on one.
export async function currentWriter(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (!canWriteRole(profile.role)) throw new ApiError(403, 'Viewer access is read-only.');
    return profile;
}

export async function requireAdmin(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (!isAdminRole(profile.role)) throw new ApiError(403, 'Administrator access is required.');
    return profile;
}

export async function requireApprover(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (!isApproverRole(profile.role)) {
        throw new ApiError(403, 'Approver access is required.');
    }
    return profile;
}

// The allowlist is enforced at this API boundary and does not revoke existing
// Supabase sessions. Intentional design decision; see docs/security-review.md,
// "Domain allowlist and existing sessions".
export async function emailDomainAllowed(admin: SupabaseClient, email: string): Promise<boolean> {
    return Boolean(result(await admin.rpc('is_email_domain_allowed', { candidate_email: email })));
}

export async function requireAllowedEmailDomain(
    admin: SupabaseClient,
    email: string,
): Promise<void> {
    if (!(await emailDomainAllowed(admin, email))) {
        throw new ApiError(403, 'Access is restricted to approved email domains.');
    }
}

// Inventory types and labels point at an inventory place by id. Selecting with
// this embeds the place's name as `location`, so the DTOs can show it without a
// second lookup.
export const WITH_LOCATION = '*, location:inventory_places(name)';

export function locationFields(row: Row): Row {
    return { Location: row.location?.name || '', LocationId: row.location_id || '' };
}

export function inventoryLabelDto(label: Row): Row {
    return {
        Id: label.id,
        DisplayId: label.display_id,
        InventoryTypeId: label.inventory_type_id,
        Name: label.name,
        ...locationFields(label),
    };
}

// The place an inventory type or label is moved to must exist; an empty value
// means "no place".
export async function optionalInventoryPlaceId(
    admin: SupabaseClient,
    value: unknown,
): Promise<string | null> {
    const id = String(value ?? '').trim();
    if (!id) return null;
    const { data, error } = await admin
        .from('inventory_places')
        .select('id')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Location not found.');
    return id;
}

// The brand an inventory type is given must be on the inventory brands list; an
// empty brand means "no brand".
export async function requireInventoryBrand(admin: SupabaseClient, name: string): Promise<void> {
    if (!name) return;
    const { data, error } = await admin
        .from('inventory_brands')
        .select('id')
        .eq('name', name)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Brand not found.');
}

export function userDto(profile: Row, departments: Map<string, Row>): Row {
    return {
        Email: profile.email,
        Name: profile.name || '',
        Role: profile.role,
        DepartmentId: profile.department_id || '',
        Phone: profile.phone || '',
        Whatsapp: profile.whatsapp || '',
        departmentName: departments.get(profile.department_id)?.name || '',
        SignInBlocked: Boolean(profile.sign_in_blocked),
    };
}

export async function profilesFor(
    admin: SupabaseClient,
    ids: Iterable<string>,
): Promise<Map<string, Row>> {
    const rows = await fetchAllIn(ids, (chunk, from, to) =>
        admin.from('profiles').select('*').in('id', chunk).order('id').range(from, to),
    );
    return new Map(rows.map((profile) => [profile.id, profile]));
}

export async function currentUser(client: SupabaseClient, userId: string): Promise<Row> {
    const [profile, departments] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).single(),
        client.from('departments').select('*'),
    ]);
    return userDto(
        result(profile) as Row,
        new Map((result(departments) as Row[]).map((x) => [x.id, x])),
    );
}

export async function updateOwnProfile(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: unknown,
): Promise<Row> {
    const patch = (input && typeof input === 'object' ? input : {}) as Row;
    const changes: Row = {};
    if (patch.name !== undefined) {
        if (!String(patch.name).trim()) throw new Error('Name is required.');
        changes.name = boundedText(patch.name, 'Name', MAX_NAME_LENGTH);
    }
    if (patch.departmentId !== undefined) changes.department_id = patch.departmentId || null;
    if (patch.phone !== undefined) {
        if (!String(patch.phone).trim()) throw new Error('Phone is required.');
        changes.phone = boundedText(patch.phone, 'Phone', MAX_PHONE_LENGTH);
    }
    if (patch.whatsapp !== undefined) {
        changes.whatsapp = boundedText(patch.whatsapp, 'WhatsApp', MAX_PHONE_LENGTH);
    }
    if (!Object.keys(changes).length) return currentUser(client, userId);
    const updated = result(
        await client.from('profiles').update(changes).eq('id', userId).select('*').single(),
    ) as Row;
    const departments = result(await client.from('departments').select('*')) as Row[];
    return userDto(updated, new Map(departments.map((x) => [x.id, x])));
}

// A client-chosen id doubles as the idempotency key of a create: the SQL save
// finds the row already there on a replay and returns it unchanged.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newRequestId(clientId: unknown): string {
    const candidate = String(clientId || '');
    return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : crypto.randomUUID();
}
