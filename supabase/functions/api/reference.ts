import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    fetchAll,
    inventoryLabelDto,
    locationFields,
    requireAdmin,
    requireNonEmpty,
    result,
    userDto,
    WITH_LOCATION,
    type Row,
} from './core.ts';
import { profilesFor } from './core.ts';
import { isApproverRole } from '../_shared/request-policy.ts';
import { emailArg } from './validation.ts';
import {
    departmentDto,
    homeContentDto,
    inventoryTypeDto,
    namedOptionDto,
    placeDto,
    shiftTypeDto,
} from './dto.ts';

export async function listDepartments(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('departments').select('*').order('name')) as Row[];
    return rows.map(departmentDto);
}

export async function listPlaces(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('places').select('*').order('name')) as Row[];
    return rows.map(placeDto);
}

export async function listInventoryPlaces(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('inventory_places').select('*').order('name')) as Row[];
    return rows.map(placeDto);
}

export async function listInventoryBrands(client: SupabaseClient): Promise<Row[]> {
    const rows = result(await client.from('inventory_brands').select('*').order('name')) as Row[];
    return rows.map(placeDto);
}

export async function listInventoryTypes(client: SupabaseClient): Promise<Row[]> {
    const [types, availabilityRes, labels] = await Promise.all([
        fetchAll((from, to) =>
            client
                .from('inventory_types')
                .select(WITH_LOCATION)
                .order('name')
                .order('id')
                .range(from, to),
        ),
        client.rpc('inventory_availability'),
        fetchAll((from, to) =>
            client
                .from('inventory_type_labels')
                .select(WITH_LOCATION)
                .order('name')
                .order('id')
                .range(from, to),
        ),
    ]);
    const availableById = new Map(
        (result(availabilityRes) as Row[]).map((x) => [x.inventory_type_id, x.available_quantity]),
    );
    return types.map((x) =>
        inventoryTypeDto(
            x,
            availableById.get(x.id),
            labels.filter((label) => label.inventory_type_id === x.id),
        ),
    );
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
        shiftTypes: (result(shiftRes) as Row[]).map(shiftTypeDto),
        programTypes: (result(programTypesRes) as Row[]).map((x) =>
            namedOptionDto('program_types', x),
        ),
        programLanguages: (result(languagesRes) as Row[]).map((x) =>
            namedOptionDto('program_languages', x),
        ),
        sessionTypes: (result(sessionTypesRes) as Row[]).map((x) =>
            namedOptionDto('session_types', x),
        ),
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
): Promise<Row> {
    await requireAdmin(client, userId);
    const domain = requireNonEmpty(input.domain, 'Email domain is required.')
        .toLowerCase()
        .replace(/^@/, '');
    if (!/^[^@\s]+\.[^@\s]+$/.test(domain)) throw new Error('Enter a valid email domain.');
    const row = result(
        await admin.from('allowed_email_domains').insert({ domain }).select('*').single(),
        'That email domain is already allowed.',
    ) as Row;
    return { domain: row.domain, enabled: row.enabled };
}

export async function deleteAllowedEmailDomain(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    domain: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin
        .from('allowed_email_domains')
        .delete()
        .eq('domain', domain.toLowerCase().replace(/^@/, ''));
    if (error) throw new Error(error.message);
}

// A comment email lists every address in its Cc header, so the list stays short.
const MAX_EMAIL_CC_ADDRESSES = 20;

export async function listEmailCcAddresses(client: SupabaseClient, userId: string): Promise<Row[]> {
    await requireAdmin(client, userId);
    const rows = result(
        await client.from('email_cc_addresses').select('email').order('email'),
    ) as Row[];
    return rows.map((row) => ({ email: row.email }));
}

export async function createEmailCcAddress(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
): Promise<Row> {
    await requireAdmin(client, userId);
    const email = emailArg(input.email, 'Email address is required.');
    const count = await admin
        .from('email_cc_addresses')
        .select('email', { count: 'exact', head: true });
    if (count.error) throw new Error(count.error.message);
    if ((count.count ?? 0) >= MAX_EMAIL_CC_ADDRESSES) {
        throw new Error(`At most ${MAX_EMAIL_CC_ADDRESSES} addresses can be copied on emails.`);
    }
    const row = result(
        await admin.from('email_cc_addresses').insert({ email }).select('email').single(),
        'That address already gets a copy of every email.',
    ) as Row;
    return { email: row.email };
}

export async function deleteEmailCcAddress(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    email: string,
): Promise<void> {
    await requireAdmin(client, userId);
    const { error } = await admin
        .from('email_cc_addresses')
        .delete()
        .eq('email', email.trim().toLowerCase());
    if (error) throw new Error(error.message);
}

export async function getHomeContent(client: SupabaseClient): Promise<Row> {
    const home = result(
        await client.from('home_content').select('*').eq('id', true).single(),
    ) as Row;
    return homeContentDto(home);
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
    const profiles = isApproverRole(profile.role)
        ? (result(await client.from('profiles').select('*')) as Row[])
        : [profile];
    return profiles.map((x) => userDto(x, departmentsById));
}
