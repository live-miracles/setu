import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchAll, fetchAllIn, result, type Row } from './core.ts';

// The place-availability rule, owned in one place: two approved programs may not
// use the same place within an hour of each other. SQL approval
// (perform_program_request_action_tx) enforces the same rule under a lock; this
// module answers it ahead of time for edits and for the place picker.
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

// Sessions of every approved program (optionally only at one place), grouped
// by the place they occupy; the request being edited never conflicts with itself.
async function approvedSessionsByPlace(
    admin: SupabaseClient,
    excludeRequestId: string | undefined,
    placeId?: string,
): Promise<Map<string, TimeSpan[]>> {
    const approved = await fetchAll((from, to) => {
        const query = admin
            .from('program_requests')
            .select('id, place_id')
            .eq('status', 'approved');
        return (placeId ? query.eq('place_id', placeId) : query).order('id').range(from, to);
    });
    const placeIdByRequest = new Map<string, string>();
    approved.forEach((request) => {
        if (request.id !== excludeRequestId && request.place_id) {
            placeIdByRequest.set(request.id, request.place_id);
        }
    });
    const sessions = await fetchAllIn(placeIdByRequest.keys(), (chunk, from, to) =>
        admin
            .from('program_sessions')
            .select('id, request_id, start_at, end_at')
            .in('request_id', chunk)
            .order('id')
            .range(from, to),
    );
    const byPlace = new Map<string, TimeSpan[]>();
    sessions.forEach((session) => {
        const place = placeIdByRequest.get(session.request_id);
        if (!place) return;
        byPlace.set(place, [...(byPlace.get(place) || []), session as TimeSpan]);
    });
    return byPlace;
}

export async function assertPlaceAvailability(
    admin: SupabaseClient,
    placeId: string | null,
    sessions: TimeSpan[],
    currentRequestId?: string,
): Promise<void> {
    if (!placeId || !sessions.length) return;
    const byPlace = await approvedSessionsByPlace(admin, currentRequestId, placeId);
    if (clashes(sessions, byPlace.get(placeId) || [])) {
        throw new Error(
            'This place is unavailable: its session is within one hour of another scheduled program.',
        );
    }
}

export async function availablePlaces(
    admin: SupabaseClient,
    currentRequestId: string,
    sessions: TimeSpan[],
): Promise<Row[]> {
    const places = result(await admin.from('places').select('*').order('name')) as Row[];
    const byPlace = sessions.length
        ? await approvedSessionsByPlace(admin, currentRequestId)
        : new Map<string, TimeSpan[]>();
    return places
        .filter((place) => !clashes(sessions, byPlace.get(place.id) || []))
        .map((place) => ({ Id: place.id, Name: place.name }));
}
