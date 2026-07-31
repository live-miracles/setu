// Replaces the source app's `idempotency_keys` ledger table. A create/action
// call passes a client-generated request id (>=8 chars); the check-and-store
// happens *inside* the same `withLock` critical section as the mutation
// itself, so a concurrent duplicate call can never race between "checked,
// not yet stored" and the mutation actually running.
const DEDUPE_CACHE_TTL_SECONDS = 21600; // 6h, CacheService's max TTL

function withLockedDedupe<T>(
    scope: string,
    requestId: string,
    fn: () => T,
): { duplicate: boolean; result: T } {
    requireMinLength(requestId, 8, 'A request id of at least 8 characters is required.');
    const key = 'dedupe:' + scope + ':' + requestId;

    return withLock(() => {
        const cache = CacheService.getScriptCache();
        const cached = cache.get(key);
        if (cached != null) {
            return { duplicate: true, result: JSON.parse(cached) as T };
        }
        const result = fn();
        cache.put(
            key,
            JSON.stringify(result === undefined ? null : result),
            DEDUPE_CACHE_TTL_SECONDS,
        );
        return { duplicate: false, result };
    });
}
