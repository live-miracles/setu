export function dateRangesOverlap(
    firstStart: string,
    firstEnd: string,
    secondStart: string,
    secondEnd: string,
): boolean {
    return firstStart <= secondEnd && firstEnd >= secondStart;
}

export function dateTimeRangesOverlap(
    firstStart: string,
    firstEnd: string,
    secondStart: string,
    secondEnd: string,
): boolean {
    return firstStart < secondEnd && firstEnd > secondStart;
}

interface AvailabilityCatalogItem {
    id: string;
    total: number;
}

interface AvailabilityLine {
    inventoryTypeId: string;
    quantity: number;
}

export function calculateInventoryAvailability(
    catalog: AvailabilityCatalogItem[],
    reservations: AvailabilityLine[],
    requested: AvailabilityLine[],
): InventoryAvailabilityItem[] {
    const totals = new Map(catalog.map((item) => [item.id, item.total]));
    const reserved = new Map<string, number>();
    const requestedTotals = new Map<string, number>();
    reservations.forEach((item) =>
        reserved.set(
            item.inventoryTypeId,
            (reserved.get(item.inventoryTypeId) || 0) + item.quantity,
        ),
    );
    requested.forEach((item) =>
        requestedTotals.set(
            item.inventoryTypeId,
            (requestedTotals.get(item.inventoryTypeId) || 0) + item.quantity,
        ),
    );
    return Array.from(requestedTotals.entries()).map(([inventoryTypeId, requestedQuantity]) => {
        const totalQuantity = totals.get(inventoryTypeId) || 0;
        const reservedQuantity = reserved.get(inventoryTypeId) || 0;
        const availableQuantity = Math.max(0, totalQuantity - reservedQuantity);
        return {
            inventoryTypeId,
            requestedQuantity,
            totalQuantity,
            reservedQuantity,
            availableQuantity,
            available: availableQuantity >= requestedQuantity,
        };
    });
}

export function attentionTotal(
    summary: Omit<AttentionSummary, 'total'>,
    approver: boolean,
): number {
    return (
        summary.inventoryAwaitingApproval +
        summary.inventoryReadyToIssue +
        summary.inventoryOverdue +
        summary.programAwaitingApproval +
        (approver ? summary.openTickets : summary.assignedTickets)
    );
}
