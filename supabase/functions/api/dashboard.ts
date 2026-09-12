import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { profilesFor, result, userDto, type Row } from './core.ts';

export async function dashboard(
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
    // Keyed by request id alone: inventory/program request ids are UUIDs
    // from independent tables, so there's no collision risk without also
    // keying by which column was set.
    const commentsByTarget = new Map<string, Row[]>();
    comments.forEach((x: Row) => {
        const requestId = x.inventory_request_id || x.program_request_id;
        const values = commentsByTarget.get(requestId) || [];
        const author = profilesById.get(x.author_id);
        values.push({
            Id: x.id,
            Timestamp: x.created_at,
            RequestId: requestId,
            UserId: author?.email || '',
            Message: x.message,
            userName: author?.name || '',
        });
        commentsByTarget.set(requestId, values);
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
            comments: commentsByTarget.get(x.id) || [],
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
                comments: commentsByTarget.get(x.id) || [],
            };
        }),
        homeContent: { Guidelines: home.guidelines },
        shiftTypes: shiftTypes.map((x: Row) => ({
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
