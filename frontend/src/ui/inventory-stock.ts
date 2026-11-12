export function formatInventoryAvailability(available: number, total: number): string {
    return `${available} / ${total}`;
}

// Availability only counts items already issued, so an issued request's own
// quantity is already deducted. Only warn while the request is still pending.
const SHORTAGE_CHECKED_STATUSES: ReadonlySet<string> = new Set(['draft', 'submitted']);

export function inventoryShortageMessage(
    status: string,
    requested: number,
    available: number | null | undefined,
): string {
    if (!SHORTAGE_CHECKED_STATUSES.has(status)) return '';
    if (available == null || available >= requested) return '';
    return `Only ${Math.max(available, 0)} available right now, but ${requested} requested.`;
}
