import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    profilesFor,
    requireApprover,
    requireNonEmpty,
    result,
    withLockedDedupe,
    type Row,
} from './core.ts';
import { paginate } from './query.ts';

export async function listRosters(
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

export function rosterDto(row: Row, user: Row): Row {
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

export function combineDateTime(date: unknown, time: unknown): string {
    return `${date}T${time || '00:00'}:00`;
}

// `input.userId` is (despite the name, inherited from the source app) the
// user's email — Users are keyed by Email there, same convention `rosters`
// resource uses on the frontend (see refine-data-provider.ts's idField).
// Deliberately does not reject a user_id/time-range overlap with that same
// user's other shifts — a user double-booked across two shifts is a
// scheduling call for the approver to make, not something to block.
export async function requireValidRosterInput(admin: SupabaseClient, input: Row): Promise<Row> {
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
export async function createRoster(
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

export async function updateRoster(
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

export async function deleteRoster(
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
