import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { result, type Row } from './core.ts';

export const REQUEST_PAGE_SIZE = 25;

// One page of request ids for a list screen. Filtering, searching, sorting,
// paging and counting happen in Postgres (list_*_requests_page, migration
// 20261124020000), under the caller's own visibility; this returns the ids in
// display order plus the totals, and the caller loads just those requests.
export async function requestPage(
    client: SupabaseClient,
    fn: 'list_inventory_requests_page' | 'list_program_requests_page',
    page: number,
    query: Row,
): Promise<{ ids: string[]; page: number; totalCount: number; statusCounts?: Row }> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const value = result(
        await client.rpc(fn, { p_query: query, p_page: safePage, p_page_size: REQUEST_PAGE_SIZE }),
    ) as Row;
    return {
        ids: value.ids,
        page: safePage,
        totalCount: Number(value.total),
        statusCounts: value.statusCounts,
    };
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
        // 'comment', 'status' (a workflow action) or 'edit' (a change to the
        // request's details); Data holds the event's structured details.
        Kind: x.kind || 'comment',
        Data: x.data || null,
        userName: x.author_name || author?.name || 'Setu Bot',
    };
}
