// A tiny in-memory cache for the program board's list pages. The board is
// unmounted whenever the router swaps in a detail page, so without this every
// return trip to the list would re-fetch and flash a spinner.
//
// The dashboard is authoritative: refreshDashboard() clears the cache before it
// re-fetches, so entries only ever live between two dashboard refreshes.

// Filter/page combinations accumulate as the user searches and pages around,
// and each entry holds a full page of DTOs. Cap the map and evict the
// least-recently-used entry so a long session cannot grow without bound.
const MAX_ENTRIES = 24;

const cache = new Map<string, Paginated<ProgramRequestDTO>>();
let cacheVersion = 0;

export function programRequestCacheKey(
    page: number,
    search: string,
    statuses: string[],
    dateScope: ProgramRequestQuery['dateScope'],
): string {
    // The status filter is a set as far as the backend is concerned, but the
    // multi-select hands it back in click order, so sort a copy (never the
    // caller's state array) to keep equivalent filters on one key.
    return JSON.stringify({ page, search, statuses: [...statuses].sort(), dateScope });
}

export function getCachedProgramRequests(key: string): Paginated<ProgramRequestDTO> | undefined {
    const hit = cache.get(key);
    // Re-insert so the most recently read key is the last to be evicted.
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
    }
    return hit;
}

/**
 * Store a page of results, unless the cache was cleared while the request that
 * produced them was in flight — `version` must be the value read before the
 * request started, which is why it is required rather than defaulted.
 */
export function cacheProgramRequests(
    key: string,
    result: Paginated<ProgramRequestDTO>,
    version: number,
): void {
    if (version !== cacheVersion) return;
    cache.delete(key);
    cache.set(key, result);
    if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }
}

export function getProgramRequestCacheVersion(): number {
    return cacheVersion;
}

export function clearProgramRequestCache(): void {
    cache.clear();
    cacheVersion += 1;
}
