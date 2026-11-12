import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchAll, fetchAllIn, profilesFor, result, userDto, type Row } from './core.ts';
import { attachItemLabels, inventoryRequestDto } from './inventory.ts';
import { programRequestDto } from './programs.ts';
import { groupByKey } from './query.ts';
import { departmentDto } from './settings.ts';
import { isApproverRole, ONGOING_INVENTORY_STATUSES } from '../_shared/request-policy.ts';

// The dashboard carries a bounded, recent sample of requests for the home
// screen only: at most this many of each kind, and inventory requests still in
// play. History views (a department's, user's, inventory type's or label's
// requests) must ask the request list endpoints, which see every request.
export const DASHBOARD_REQUEST_LIMIT = 250;

export async function dashboard(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
): Promise<Row> {
    const responses = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).single(),
        client.from('departments').select('*').order('name'),
        client.from('places').select('*').order('name'),
        fetchAll((from, to) =>
            client.from('inventory_types').select('*').order('name').order('id').range(from, to),
        ).then((data) => ({ data, error: null })),
        client.rpc('inventory_availability'),
        fetchAll((from, to) =>
            client
                .from('rosters')
                .select('*')
                .gte('end_at', new Date().toISOString())
                .order('start_at')
                .order('id')
                .range(from, to),
        ).then((data) => ({ data, error: null })),
        client
            .from('inventory_requests')
            .select('*')
            .in('status', [...ONGOING_INVENTORY_STATUSES])
            .order('updated_at', { ascending: false })
            .limit(DASHBOARD_REQUEST_LIMIT),
        fetchAll((from, to) =>
            client
                .from('inventory_type_labels')
                .select('*')
                .order('name')
                .order('id')
                .range(from, to),
        ).then((data) => ({ data, error: null })),
        client
            .from('program_requests')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(DASHBOARD_REQUEST_LIMIT),
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
        inventoryLabels,
        programs,
        home,
        shiftTypes,
        programTypes,
        languages,
        sessionTypes,
        blocks,
    ] = responses.map((r) => result(r)) as Row[];
    const inventoryRequestIds = inventory.map((x: Row) => x.id);
    const programRequestIds = programs.map((x: Row) => x.id);
    // Page and chunk every dependent lookup: PostgREST truncates a response at
    // max-rows, and a long `.in(...)` list overflows the gateway's URL limit
    // (250 requests with a few items each is already ~30 KB of ids).
    const [items, inventoryParticipants, sessions, programParticipants, ...commentRows] =
        await Promise.all([
            fetchAllIn(inventoryRequestIds, (chunk, from, to) =>
                client
                    .from('inventory_request_items')
                    .select('*')
                    .in('request_id', chunk)
                    .order('id')
                    .range(from, to),
            ),
            fetchAllIn(inventoryRequestIds, (chunk, from, to) =>
                client
                    .from('inventory_request_participants')
                    .select('*')
                    .in('request_id', chunk)
                    .order('id')
                    .range(from, to),
            ),
            fetchAllIn(programRequestIds, (chunk, from, to) =>
                client
                    .from('program_sessions')
                    .select('*')
                    .in('request_id', chunk)
                    .order('start_at')
                    .order('id')
                    .range(from, to),
            ),
            fetchAllIn(programRequestIds, (chunk, from, to) =>
                client
                    .from('program_request_participants')
                    .select('*')
                    .in('request_id', chunk)
                    .order('id')
                    .range(from, to),
            ),
            fetchAllIn(inventoryRequestIds, (chunk, from, to) =>
                client
                    .from('comments')
                    .select('*')
                    .in('inventory_request_id', chunk)
                    .order('created_at')
                    .order('id')
                    .range(from, to),
            ),
            fetchAllIn(programRequestIds, (chunk, from, to) =>
                client
                    .from('comments')
                    .select('*')
                    .in('program_request_id', chunk)
                    .order('created_at')
                    .order('id')
                    .range(from, to),
            ),
        ]);
    const requestItemLabels = await fetchAllIn(
        items.map((x: Row) => x.id),
        (chunk, from, to) =>
            client
                .from('inventory_request_item_labels')
                .select('*')
                .in('request_item_id', chunk)
                .order('id')
                .range(from, to),
    );
    const comments = commentRows.flat();
    const departmentsById = new Map(departments.map((x: Row) => [x.id, x]));
    const placesById = new Map(places.map((x: Row) => [x.id, x]));
    const typesById = new Map(types.map((x: Row) => [x.id, x]));
    attachItemLabels(items, requestItemLabels, inventoryLabels);
    const availableById = new Map(
        availability.map((x: Row) => [x.inventory_type_id, x.available_quantity]),
    );
    const shiftTypesById = new Map(shiftTypes.map((x: Row) => [x.id, x]));
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
    const dashboardProfiles = isApproverRole(profile.role)
        ? (result(await client.from('profiles').select('*')) as Row[])
        : [profile];
    const itemsByRequest = groupByKey(items, 'request_id');
    const inventoryParticipantsByRequest = groupByKey(inventoryParticipants, 'request_id');
    const programParticipantsByRequest = groupByKey(programParticipants, 'request_id');
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    // Keyed by request id alone: inventory/program request ids are UUIDs
    // from independent tables, so there's no collision risk without also
    // keying by which column was set.
    const commentsByRequest = groupByKey(
        comments.map((x: Row) => ({
            ...x,
            request_id: x.inventory_request_id || x.program_request_id,
        })),
        'request_id',
    );
    return {
        me: userDto(profile, departmentsById),
        users: dashboardProfiles.map((x: Row) => userDto(x, departmentsById)),
        departments: departments.map(departmentDto),
        places: places.map((x: Row) => ({ Id: x.id, Name: x.name })),
        inventoryTypes: types.map((x: Row) => ({
            Id: x.id,
            DisplayId: x.display_id,
            Brand: x.brand,
            Name: x.name,
            Model: x.model,
            Location: x.location,
            Description: x.description,
            Requestable: x.requestable,
            ImageId: x.image_path,
            TotalQuantity: x.total_quantity,
            availableQuantity: availableById.get(x.id) ?? x.total_quantity,
            labels: inventoryLabels
                .filter((label: Row) => label.inventory_type_id === x.id)
                .map((label: Row) => ({
                    Id: label.id,
                    DisplayId: label.display_id,
                    InventoryTypeId: label.inventory_type_id,
                    Name: label.name,
                })),
        })),
        upcomingRosters: rosters.map((x: Row) => ({
            Id: x.id,
            ShiftTypeId: x.shift_type_id,
            ShiftName: String(x.shift_name || ''),
            Name:
                String(x.shift_name || '').trim() ||
                shiftTypesById.get(x.shift_type_id)?.name ||
                '',
            StartDate: x.start_at.slice(0, 10),
            EndDate: x.end_at.slice(0, 10),
            StartTime: x.start_at.slice(11, 16),
            EndTime: x.end_at.slice(11, 16),
            UserId: profilesById.get(x.user_id)?.email || '',
            userName: profilesById.get(x.user_id)?.name || '',
        })),
        inventoryRequests: inventory.map((x: Row) =>
            inventoryRequestDto(
                x,
                typesById,
                departmentsById,
                profilesById,
                itemsByRequest.get(x.id) || [],
                inventoryParticipantsByRequest.get(x.id) || [],
                commentsByRequest.get(x.id) || [],
            ),
        ),
        programRequests: programs.map((x: Row) =>
            programRequestDto(
                x,
                placesById,
                departmentsById,
                profilesById,
                sessionsByRequest.get(x.id) || [],
                programParticipantsByRequest.get(x.id) || [],
                commentsByRequest.get(x.id) || [],
            ),
        ),
        homeContent: { Guidelines: home.guidelines },
        shiftTypes: shiftTypes.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            Color: x.color,
            DefaultStartTime:
                x.default_start_time == null ? '' : String(x.default_start_time).slice(0, 5),
            DefaultEndTime:
                x.default_end_time == null ? '' : String(x.default_end_time).slice(0, 5),
        })),
        programTypes: programTypes.map((x: Row) => ({ Name: x.name, Color: x.color })),
        programLanguages: languages.map((x: Row) => ({ Name: x.name })),
        sessionTypes: sessionTypes.map((x: Row) => ({ Name: x.name })),
        blocks: blocks.map((x: Row) => ({
            Id: x.id,
            Name: x.name,
            Place: x.place_id || '',
            StartDateTime: x.start_at,
            EndDateTime: x.end_at,
        })),
        failedEmailCount: 0,
    };
}
