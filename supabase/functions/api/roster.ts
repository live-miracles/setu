import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    fetchAll,
    profilesFor,
    requireApprover,
    requireNonEmpty,
    result,
    withLockedDedupe,
    type Row,
} from './core.ts';
import { paginate } from './query.ts';
import { isApproverRole } from '../_shared/request-policy.ts';

export async function listRosters(
    client: SupabaseClient,
    admin: SupabaseClient,
    page: number,
): Promise<Row> {
    // Full history, not just upcoming — that's dashboard()'s upcomingRosters
    // preview; this is the paginated listing behind the Roster page. RLS
    // limits this read to authenticated users; write operations below still
    // require approver access.
    const rosters = (
        await fetchAll((from, to) => client.from('rosters').select('*').order('id').range(from, to))
    ).sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)));
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
        ...rosterTimeFields(x),
        UserId: profilesById.get(x.user_id)?.email || '',
        userName: profilesById.get(x.user_id)?.name || '',
    }));
    return paginate(dtos, page, 20);
}

// Date/time fields of a roster DTO. A time left blank is stored as the start
// or end of its day (see combineDateTime) with its *_time_set flag false, and
// is read back as ''.
export function rosterTimeFields(row: Row): Row {
    return {
        StartDate: String(row.start_at).slice(0, 10),
        EndDate: String(row.end_at).slice(0, 10),
        StartTime: row.start_time_set === false ? '' : String(row.start_at).slice(11, 16),
        EndTime: row.end_time_set === false ? '' : String(row.end_at).slice(11, 16),
    };
}

export function rosterDto(row: Row, user: Row, shiftType: Row): Row {
    return {
        Id: row.id,
        ShiftTypeId: row.shift_type_id,
        ShiftName: String(row.shift_name || ''),
        Name: String(row.shift_name || '').trim() || shiftType.name,
        ...rosterTimeFields(row),
        UserId: user.email,
        userName: user.name,
    };
}

// A blank start is the start of the day, a blank end is the end of the day.
export function combineDateTime(date: unknown, time: unknown, blank = '00:00:00'): string {
    return `${date}T${time ? `${time}:00` : blank}`;
}

function rosterTimestamps(input: Row): { startAt: string; endAt: string } {
    return {
        startAt: combineDateTime(input.startDate, input.startTime),
        endAt: combineDateTime(input.endDate, input.endTime, '23:59:59'),
    };
}

function rosterTimeColumns(input: Row): Row {
    const { startAt, endAt } = rosterTimestamps(input);
    return {
        start_at: startAt,
        end_at: endAt,
        start_time_set: Boolean(input.startTime),
        end_time_set: Boolean(input.endTime),
    };
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
    const { startAt, endAt } = rosterTimestamps(input);
    if (endAt <= startAt) throw new Error('End time is before start time.');
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
    if (!isApproverRole(data.role)) {
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
    const { result: dto } = await withLockedDedupe(
        admin,
        'roster:create',
        requestId,
        userId,
        async () => {
            const row = result(
                await admin
                    .from('rosters')
                    .insert({
                        shift_type_id: shiftType.id,
                        shift_name: String(input.shiftName || '').trim() || null,
                        ...rosterTimeColumns(input),
                        user_id: user.id,
                    })
                    .select('*')
                    .single(),
            ) as Row;
            return rosterDto(row, user, shiftType);
        },
    );
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
        userId,
        async () => {
            const row = result(
                await admin
                    .from('rosters')
                    .update({
                        shift_type_id: shiftType.id,
                        shift_name: String(input.shiftName || '').trim() || null,
                        ...rosterTimeColumns(input),
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
    await withLockedDedupe(admin, 'roster:delete:' + id, requestId, userId, async () => {
        const { error } = await admin.from('rosters').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return null;
    });
}
