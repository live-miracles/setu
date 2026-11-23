import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchAll, fetchAllIn, profilesFor, result, type Row } from './core.ts';
import { inventoryRequestDto } from './inventory.ts';
import { programRequestDto } from './programs.ts';
import { rosterTimeFields } from './roster.ts';
import { commentDto, groupByKey } from './query.ts';
import { ONGOING_INVENTORY_STATUSES } from '../_shared/request-policy.ts';

// The dashboard is the HOME screen's data and nothing else (reference data such
// as departments, places and inventory types has its own endpoints). It carries
// the requests that need attention, a bounded sample capped at this many of
// each kind with the true total next to it, the latest comments, and the
// upcoming roster. History views (a department's, user's, inventory type's or
// label's requests) ask the request list endpoints, which see every request.
export const DASHBOARD_REQUEST_LIMIT = 250;
// Comments on the home screen: the newest few of each kind (the client merges
// the two kinds and drops a kind whose view an admin hid).
export const DASHBOARD_COMMENT_LIMIT = 8;

const PENDING_PROGRAM_STATUSES = ['draft', 'submitted'];

function pick(row: Row, keys: string[]): Row {
    return Object.fromEntries(keys.map((key) => [key, row[key]]));
}

// The total behind a bounded read; the fake clients of some tests report none.
function totalOf(response: { count?: number | null }, rows: Row[]): number {
    return response.count ?? rows.length;
}

export async function dashboard(
    client: SupabaseClient,
    admin: SupabaseClient,
    _userId: string,
): Promise<Row> {
    const [
        pendingPrograms,
        ongoingInventory,
        recentProgramComments,
        recentInventoryComments,
        shiftTypes,
        rosters,
    ] = await Promise.all([
        client
            .from('program_requests')
            .select('id, display_id, name, status, requester_id', { count: 'exact' })
            .in('status', PENDING_PROGRAM_STATUSES)
            .order('updated_at', { ascending: false })
            .limit(DASHBOARD_REQUEST_LIMIT),
        client
            .from('inventory_requests')
            .select('id, display_id, name, status, requester_id, start_date, end_date', {
                count: 'exact',
            })
            .in('status', [...ONGOING_INVENTORY_STATUSES])
            .order('updated_at', { ascending: false })
            .limit(DASHBOARD_REQUEST_LIMIT),
        client
            .from('comments')
            .select('*')
            .not('program_request_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(DASHBOARD_COMMENT_LIMIT),
        client
            .from('comments')
            .select('*')
            .not('inventory_request_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(DASHBOARD_COMMENT_LIMIT),
        client.from('shift_types').select('id, name'),
        fetchAll((from, to) =>
            client
                .from('rosters')
                .select('*')
                .gte('end_at', new Date().toISOString())
                .order('start_at')
                .order('id')
                .range(from, to),
        ).then((data) => ({ data, error: null })),
    ]);
    const programs = result(pendingPrograms) as Row[];
    const inventory = result(ongoingInventory) as Row[];
    const programComments = result(recentProgramComments) as Row[];
    const inventoryComments = result(recentInventoryComments) as Row[];
    const rosterRows = result(rosters) as Row[];
    const shiftTypesById = new Map<string, Row>(
        (result(shiftTypes) as Row[]).map((x) => [x.id, x]),
    );

    // Page and chunk every dependent lookup: PostgREST truncates a response at
    // max-rows, and a long `.in(...)` list overflows the gateway's URL limit.
    // The comment threads' requests are at most a handful, but may be anywhere
    // in history, so they are fetched by id rather than taken from the samples.
    const [sessions, programRefs, inventoryRefs] = await Promise.all([
        fetchAllIn(
            programs.map((x) => x.id),
            (chunk, from, to) =>
                client
                    .from('program_sessions')
                    .select('*')
                    .in('request_id', chunk)
                    .order('start_at')
                    .order('id')
                    .range(from, to),
        ),
        fetchAllIn(
            programComments.map((x) => x.program_request_id),
            (chunk, from, to) =>
                client
                    .from('program_requests')
                    .select('id, display_id, name')
                    .in('id', chunk)
                    .order('id')
                    .range(from, to),
        ),
        fetchAllIn(
            inventoryComments.map((x) => x.inventory_request_id),
            (chunk, from, to) =>
                client
                    .from('inventory_requests')
                    .select('id, display_id, name')
                    .in('id', chunk)
                    .order('id')
                    .range(from, to),
        ),
    ]);
    const profilesById = await profilesFor(admin, [
        ...rosterRows.map((x) => x.user_id),
        ...programs.map((x) => x.requester_id),
        ...inventory.map((x) => x.requester_id),
        ...programComments.map((x) => x.author_id),
        ...inventoryComments.map((x) => x.author_id),
    ]);
    const sessionsByRequest = groupByKey(sessions, 'request_id');
    const noRows = new Map<string, Row>();
    const requestRef = (row: Row) => ({ Id: row.id, DisplayId: row.display_id, Name: row.name });
    const refsById = (rows: Row[]) => new Map(rows.map((x) => [x.id, requestRef(x)]));
    const programRefsById = refsById(programRefs);
    const inventoryRefsById = refsById(inventoryRefs);
    const recentComments = [
        ...programComments.map((comment) => ({
            kind: 'programs',
            request: programRefsById.get(comment.program_request_id),
            comment: commentDto(comment, profilesById),
        })),
        ...inventoryComments.map((comment) => ({
            kind: 'inventory',
            request: inventoryRefsById.get(comment.inventory_request_id),
            comment: commentDto(comment, profilesById),
        })),
    ].filter((entry) => entry.request);

    return {
        upcomingRosters: rosterRows.map((x) => ({
            Id: x.id,
            ShiftTypeId: x.shift_type_id,
            ShiftName: String(x.shift_name || ''),
            Name:
                String(x.shift_name || '').trim() ||
                shiftTypesById.get(x.shift_type_id)?.name ||
                '',
            ...rosterTimeFields(x),
            UserId: profilesById.get(x.user_id)?.email || '',
            userName: profilesById.get(x.user_id)?.name || '',
        })),
        pendingProgramRequests: programs.map((x) =>
            pick(
                programRequestDto(
                    x,
                    noRows,
                    noRows,
                    profilesById,
                    sessionsByRequest.get(x.id) || [],
                    [],
                    [],
                ),
                ['Id', 'DisplayId', 'Name', 'Status', 'userName', 'sessionStart', 'sessionEnd'],
            ),
        ),
        pendingProgramCount: totalOf(pendingPrograms, programs),
        ongoingInventoryRequests: inventory.map((x) =>
            pick(inventoryRequestDto(x, noRows, noRows, profilesById, [], [], []), [
                'Id',
                'DisplayId',
                'Name',
                'Status',
                'userName',
                'StartDate',
                'EndDate',
            ]),
        ),
        ongoingInventoryCount: totalOf(ongoingInventory, inventory),
        recentComments,
    };
}
