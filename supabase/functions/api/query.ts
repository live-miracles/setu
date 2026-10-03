import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchAll, type Row } from './core.ts';

export function paginate<T>(rows: T[], page: number, pageSize: number): Row {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const start = (safePage - 1) * pageSize;
    return {
        items: rows.slice(start, start + pageSize),
        page: safePage,
        pageSize,
        totalCount: rows.length,
    };
}

export function normalizedSearch(value: unknown): string {
    return String(value == null ? '' : value)
        .trim()
        .toLocaleLowerCase();
}

export function matchesSearch(query: unknown, values: unknown[]): boolean {
    const needles = String(query || '')
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!needles.length) return true;
    return needles.every((needle) =>
        values.some((value) => normalizedSearch(value).indexOf(needle) !== -1),
    );
}

export function compareQueryValues(left: unknown, right: unknown, direction: unknown): number {
    const cmp = String(left == null ? '' : left).localeCompare(
        String(right == null ? '' : right),
        undefined,
        { numeric: true, sensitivity: 'base' },
    );
    return direction === 'desc' ? -cmp : cmp;
}

// Sort key for "most recently active first" request lists: the latest
// comment's timestamp (every request gets a comment at creation), falling
// back to DisplayId for the rare empty case.
export function latestActivityAt(comments: Row[], displayId: number): string {
    if (!comments.length) return String(displayId).padStart(10, '0');
    return comments[comments.length - 1].Timestamp;
}

export function groupByKey<T extends Row>(rows: T[], key: string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    rows.forEach((row) => {
        const values = map.get(row[key]) || [];
        values.push(row);
        map.set(row[key], values);
    });
    return map;
}

export function commentDto(x: Row, profilesById: Map<string, Row>): Row {
    const author = profilesById.get(x.author_id);
    return {
        Id: x.id,
        Timestamp: x.created_at,
        RequestId: x.inventory_request_id || x.program_request_id,
        UserId: author?.email || '',
        Message: x.message,
        userName: x.author_name || author?.name || 'Setu Bot',
    };
}

// Comments' own RLS policy ("users read visible comments") already checks
// can_view_inventory_request/can_view_program_request/is_approver() per
// row, so a plain select through the user-scoped `client` — not `admin` —
// already comes back containing only rows this caller may see. Returns raw
// rows (the request DTO builders map them with commentDto); callers include
// the authors in their profile lookup.
export async function commentsByTargetFor(
    client: SupabaseClient,
    column: 'inventory_request_id' | 'program_request_id',
): Promise<Map<string, Row[]>> {
    const comments = await fetchAll((from, to) =>
        client
            .from('comments')
            .select('*')
            .not(column, 'is', null)
            .order('created_at')
            .order('id')
            .range(from, to),
    );
    const byTarget = new Map<string, Row[]>();
    comments.forEach((x) => {
        const values = byTarget.get(x[column]) || [];
        values.push(x);
        byTarget.set(x[column], values);
    });
    return byTarget;
}

// ---------------------------------------------------------------------------
// Reference/settings data — small, rarely-changing tables. Readable by any
// authenticated user per their RLS policies.
// ---------------------------------------------------------------------------
