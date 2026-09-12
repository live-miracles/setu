import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    requireAdmin,
    requireNonEmpty,
    result,
    userDto,
    withLockedDedupe,
    type Row,
} from './core.ts';
import { profilesFor } from './core.ts';

export async function listDepartments(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('departments').select('*').order('name')) as Row[];
    return rows.map((x) => ({
        Id: x.id,
        Name: x.name,
        ShortName: x.short_name,
        LeadEmail: x.lead_email,
    }));
}

export async function listPlaces(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('places').select('*').order('name')) as Row[];
    return rows.map((x) => ({ Id: x.id, Name: x.name }));
}

export async function listInventoryTypes(client: SupabaseClient): Promise<Row[]> {
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

export async function getSettings(client: SupabaseClient): Promise<Row> {
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

export async function listAllowedEmailDomains(
    client: SupabaseClient,
    userId: string,
): Promise<Row[]> {
    await requireAdmin(client, userId);
    const rows = result(
        await client.from('allowed_email_domains').select('*').order('domain'),
    ) as Row[];
    return rows.map((row) => ({ domain: row.domain, enabled: row.enabled }));
}

export async function createAllowedEmailDomain(
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

export async function deleteAllowedEmailDomain(
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

export async function getHomeContent(client: SupabaseClient): Promise<Row> {
    const home = result(
        await client.from('home_content').select('*').eq('id', true).single(),
    ) as Row;
    return { Guidelines: home.guidelines };
}

export async function listBlocks(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('blocks').select('*').order('start_at')) as Row[];
    return rows.map((x) => ({
        Id: x.id,
        Name: x.name,
        Place: x.place_id || '',
        StartDateTime: x.start_at,
        EndDateTime: x.end_at,
    }));
}

export async function listUsers(client: SupabaseClient, userId: string): Promise<Row[]> {
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

// ---------------------------------------------------------------------------
// Comments (shared by inventory requests and program requests)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inventory requests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Program requests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Images (Supabase Storage, replacing the source app's DriveApp uploads)
// ---------------------------------------------------------------------------
