import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requiredStringArg } from './validation.ts';

export type Row = Record<string, any>;

export function result<T>(
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

export function requireNonEmpty(value: unknown, message: string): string {
    return requiredStringArg(value == null ? '' : String(value), message);
}

export async function currentProfile(client: SupabaseClient, userId: string): Promise<Row> {
    return result(await client.from('profiles').select('*').eq('id', userId).single()) as Row;
}

export async function requireAdmin(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (profile.role !== 'admin') throw new Error('Administrator access is required.');
    return profile;
}

export async function requireApprover(client: SupabaseClient, userId: string): Promise<Row> {
    const profile = await currentProfile(client, userId);
    if (profile.role !== 'admin' && profile.role !== 'approver') {
        throw new Error('Approver access is required.');
    }
    return profile;
}

export async function emailDomainAllowed(admin: SupabaseClient, email: string): Promise<boolean> {
    return Boolean(result(await admin.rpc('is_email_domain_allowed', { candidate_email: email })));
}

export async function requireAllowedEmailDomain(
    admin: SupabaseClient,
    email: string,
): Promise<void> {
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
export async function withLockedDedupe<T>(
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

export function userDto(profile: Row, departments: Map<string, Row>): Row {
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

export async function profilesFor(
    admin: SupabaseClient,
    ids: Iterable<string>,
): Promise<Map<string, Row>> {
    const uniqueIds = [...new Set([...ids].filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    const rows = result(await admin.from('profiles').select('*').in('id', uniqueIds)) as Row[];
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
