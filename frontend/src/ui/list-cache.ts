// A tiny in-memory cache for the list-shaped pages the router unmounts and
// remounts: the inventory, programs and tickets boards, and the calendar's
// month grid. Without it every trip into a detail page and back re-fetches and
// flashes a loading line over content the user just looked at.
//
// The dashboard stays authoritative: refreshDashboard() clears the cache before
// it re-fetches, so an entry only ever lives between two dashboard refreshes.

// Filter, page and month combinations accumulate as the user searches and
// scrolls through the year, and each entry holds a full payload. Cap the map
// and evict the least-recently-used entry so a long session cannot grow
// without bound.
const MAX_ENTRIES = 48;

const cache = new Map<string, unknown>();
let cacheVersion = 0;

export type RequestListKind = 'inventory' | 'programs' | 'tickets';

export function requestListCacheKey(
    kind: RequestListKind,
    page: number,
    search: string,
    statuses: string[],
    dateScope: ProgramRequestQuery['dateScope'],
): string {
    // The status filter is a set as far as the backend is concerned, but the
    // multi-select hands it back in click order, so sort a copy (never the
    // caller's state array) to keep equivalent filters on one key.
    return JSON.stringify(['requests', kind, page, search, [...statuses].sort(), dateScope]);
}

export function calendarMonthCacheKey(year: number, month: number): string {
    return JSON.stringify(['calendar', year, month]);
}

export function getCachedList<T>(key: string): T | undefined {
    const hit = cache.get(key);
    if (hit === undefined) return undefined;
    // Re-insert so the most recently read key is the last to be evicted.
    cache.delete(key);
    cache.set(key, hit);
    return hit as T;
}

/**
 * Store a payload, unless the cache was cleared while the request that produced
 * it was in flight — `version` must be the value read before that request
 * started, which is why it is required rather than defaulted.
 */
export function cacheList<T>(key: string, value: T, version: number): void {
    if (version !== cacheVersion) return;
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }
}

export function getListCacheVersion(): number {
    return cacheVersion;
}

export function clearListCache(): void {
    cache.clear();
    cacheVersion += 1;
}
