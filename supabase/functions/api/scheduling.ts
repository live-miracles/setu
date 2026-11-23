import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchAll, result, type Row } from './core.ts';

// The place-availability rule: two approved programs may not use the same place
// within an hour of each other. SQL enforces it under a lock, both when a
// request is approved (perform_program_request_action_tx) and when a request is
// saved (save_program_request_tx); this module only answers it ahead of time
// for the place picker.
const PLACE_BUFFER_MS = 60 * 60 * 1000;

export interface TimeSpan {
    start_at: string;
    end_at: string;
}

export function sessionsOverlapWithBuffer(
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
    bufferMs: number,
): boolean {
    const ls = Date.parse(leftStart);
    const le = Date.parse(leftEnd);
    const rs = Date.parse(rightStart);
    const re = Date.parse(rightEnd);
    if ([ls, le, rs, re].some((value) => Number.isNaN(value))) return false;
    return ls < re + bufferMs && rs < le + bufferMs;
}

function clashes(sessions: TimeSpan[], others: TimeSpan[]): boolean {
    return others.some((other) =>
        sessions.some((session) =>
            sessionsOverlapWithBuffer(
                session.start_at,
                session.end_at,
                other.start_at,
                other.end_at,
                PLACE_BUFFER_MS,
            ),
        ),
    );
}

// Approved sessions that could clash with `sessions` (they touch the sessions'
// overall time span, widened by the buffer), grouped by the place they occupy;
// the request being edited never conflicts with itself.
async function approvedSessionsByPlace(
    admin: SupabaseClient,
    excludeRequestId: string | undefined,
    sessions: TimeSpan[],
): Promise<Map<string, TimeSpan[]>> {
    const starts = sessions.map((s) => Date.parse(s.start_at)).filter((ms) => !Number.isNaN(ms));
    const ends = sessions.map((s) => Date.parse(s.end_at)).filter((ms) => !Number.isNaN(ms));
    if (!starts.length || !ends.length) return new Map();
    const windowStart = new Date(Math.min(...starts) - PLACE_BUFFER_MS).toISOString();
    const windowEnd = new Date(Math.max(...ends) + PLACE_BUFFER_MS).toISOString();
    const rows = await fetchAll((from, to) => {
        const query = admin
            .from('program_sessions')
            .select('id, request_id, start_at, end_at, program_requests!inner(place_id, status)')
            .eq('program_requests.status', 'approved')
            .not('program_requests.place_id', 'is', null)
            .lt('start_at', windowEnd)
            .gt('end_at', windowStart);
        return (excludeRequestId ? query.neq('request_id', excludeRequestId) : query)
            .order('id')
            .range(from, to);
    });
    const byPlace = new Map<string, TimeSpan[]>();
    rows.forEach((row) => {
        const place = row.program_requests?.place_id as string | undefined;
        if (!place) return;
        byPlace.set(place, [...(byPlace.get(place) || []), row as TimeSpan]);
    });
    return byPlace;
}

export async function availablePlaces(
    admin: SupabaseClient,
    currentRequestId: string,
    sessions: TimeSpan[],
): Promise<Row[]> {
    const places = result(await admin.from('places').select('*').order('name')) as Row[];
    const byPlace = await approvedSessionsByPlace(admin, currentRequestId, sessions);
    return places
        .filter((place) => !clashes(sessions, byPlace.get(place.id) || []))
        .map((place) => ({ Id: place.id, Name: place.name }));
}
