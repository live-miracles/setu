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

function result<T>(value: { data: T | null; error: { message: string } | null }): T {
    if (value.error) throw new Error(value.error.message);
    if (value.data === null) throw new Error('The requested record was not found.');
    return value.data;
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
        await admin.from('profiles').update(changes).eq('id', userId).select('*').single(),
    ) as Row;
    const departments = result(await client.from('departments').select('*')) as Row[];
    return userDto(updated, new Map(departments.map((x) => [x.id, x])));
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
        client.from('tickets').select('*').order('display_id', { ascending: false }),
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
        tickets,
        comments,
        home,
        shiftTypes,
        programTypes,
        languages,
        sessionTypes,
        blocks,
    ] = responses.map(result) as Row[];
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
        ...tickets.map((x: Row) => x.assignee_id),
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
        tickets: tickets.map((x: Row) => ({
            Id: x.id,
            DisplayId: x.display_id,
            Title: x.title,
            Description: x.description,
            Status: x.status,
            AssigneeId: profilesById.get(x.assignee_id)?.email || '',
            CommentsJson: '',
            assigneeName: profilesById.get(x.assignee_id)?.name || '',
            comments: commentsByTarget.get(`ticket:${x.id}`) || [],
        })),
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
    const body = (await request.json()) as RequestBody;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    try {
        if (body.operation === 'whoAmI') return respond(await currentUser(client, authData.user.id));
        if (body.operation === 'getDashboard') {
            return respond(await dashboard(client, admin, authData.user.id));
        }
        if (body.operation === 'updateOwnProfile') {
            return respond(await updateOwnProfile(client, admin, authData.user.id, body.args?.[0]));
        }
        return respond(
            { error: `The ${String(body.operation || '')} operation has not been migrated yet.` },
            501,
        );
    } catch (error) {
        console.error(error);
        return respond(
            { error: error instanceof Error ? error.message : 'Unable to complete the request.' },
            400,
        );
    }
});
