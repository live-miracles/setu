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
    const shiftTypes = result(await client.from('shift_types').select('id, name')) as Row[];
    const shiftTypesById = new Map(shiftTypes.map((x) => [x.id, x]));
    const profilesById = await profilesFor(
        admin,
        rosters.map((x) => x.user_id),
    );
    const dtos = rosters.map((x) => ({
        Id: x.id,
        ShiftTypeId: x.shift_type_id,
        ShiftName: String(x.shift_name || ''),
        Name: String(x.shift_name || '').trim() || shiftTypesById.get(x.shift_type_id)?.name || '',
        StartDate: String(x.start_at).slice(0, 10),
        EndDate: String(x.end_at).slice(0, 10),
        StartTime: String(x.start_at).slice(11, 16),
        EndTime: String(x.end_at).slice(11, 16),
        UserId: profilesById.get(x.user_id)?.email || '',
        userName: profilesById.get(x.user_id)?.name || '',
    }));
    return paginate(dtos, page, 20);
}

export function rosterDto(row: Row, user: Row, shiftType: Row): Row {
    return {
        Id: row.id,
        ShiftTypeId: row.shift_type_id,
        ShiftName: String(row.shift_name || ''),
        Name: String(row.shift_name || '').trim() || shiftType.name,
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
    if (
        combineDateTime(input.endDate, input.endTime) <=
        combineDateTime(input.startDate, input.startTime)
    ) {
        throw new Error('End time is before start time.');
    }
    const shiftTypeId = requireNonEmpty(input.shiftTypeId, 'Shift is required.');
    const shiftType = result(
        await admin.from('shift_types').select('*').eq('id', shiftTypeId).maybeSingle(),
    ) as Row | null;
    if (!shiftType) throw new Error('Shift preset not found.');
    const email = requireNonEmpty(input.userId, 'User is required.').toLowerCase();
    const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('User not found.');
    if (data.role !== 'admin' && data.role !== 'approver') {
        throw new Error('Roster assignee must be an administrator or approver.');
    }
    return { user: data, shiftType };
}

// Scheduling is an approver power, and roster assignees must also be
// administrators or approvers.
export async function createRoster(
    client: SupabaseClient,
    admin: SupabaseClient,
    userId: string,
    input: Row,
    requestId: string,
): Promise<Row> {
    await requireApprover(client, userId);
    const { user, shiftType } = await requireValidRosterInput(admin, input);
    const { result: dto } = await withLockedDedupe(admin, 'roster:create', requestId, async () => {
        const row = result(
            await admin
                .from('rosters')
                .insert({
                    shift_type_id: shiftType.id,
                    shift_name: String(input.shiftName || '').trim() || null,
                    start_at: combineDateTime(input.startDate, input.startTime),
                    end_at: combineDateTime(input.endDate, input.endTime),
                    user_id: user.id,
                })
                .select('*')
                .single(),
        ) as Row;
        return rosterDto(row, user, shiftType);
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
    const { user, shiftType } = await requireValidRosterInput(admin, input);
    const { result: dto } = await withLockedDedupe(
        admin,
        'roster:update:' + id,
        requestId,
        async () => {
            const row = result(
                await admin
                    .from('rosters')
                    .update({
                        shift_type_id: shiftType.id,
                        shift_name: String(input.shiftName || '').trim() || null,
                        start_at: combineDateTime(input.startDate, input.startTime),
                        end_at: combineDateTime(input.endDate, input.endTime),
                        user_id: user.id,
                    })
                    .eq('id', id)
                    .select('*')
                    .single(),
            ) as Row;
            return rosterDto(row, user, shiftType);
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
