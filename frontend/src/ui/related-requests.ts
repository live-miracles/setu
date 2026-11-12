import { useList } from '@refinedev/core';

// History views (a user's, department's, inventory type's or label's requests)
// ask the request list endpoints, which see every request. The dashboard only
// carries a bounded recent sample, so reading history from it silently drops
// older and closed requests. Returns the latest page plus the true total;
// pass `filters: null` to stay idle until something is selected.
export const RELATED_REQUEST_LIMIT = 25;

export function useRelatedRequests<T extends InventoryRequestDTO | ProgramRequestDTO>(
    resource: 'inventory-requests' | 'program-requests',
    filters: Record<string, string> | null,
): { items: T[]; total: number } {
    const { result } = useList<T>({
        resource,
        pagination: { currentPage: 1, pageSize: RELATED_REQUEST_LIMIT },
        filters: Object.entries(filters || {}).map(([field, value]) => ({
            field,
            operator: 'eq' as const,
            value,
        })),
        queryOptions: { enabled: filters !== null },
    });
    if (filters === null) return { items: [], total: 0 };
    return { items: result.data, total: result.total ?? result.data.length };
}
