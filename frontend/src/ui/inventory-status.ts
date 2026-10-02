const ONGOING_INVENTORY_STATUSES: ReadonlySet<InventoryRequestStatus> = new Set([
    'draft',
    'submitted',
    'approved',
    'issued',
]);

export function isOngoingInventoryRequest(request: Pick<InventoryRequest, 'Status'>): boolean {
    return ONGOING_INVENTORY_STATUSES.has(request.Status);
}
