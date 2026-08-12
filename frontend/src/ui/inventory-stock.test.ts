import { formatInventoryAvailability } from './inventory-stock';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runInventoryStockAssertions(): void {
    assert(
        formatInventoryAvailability(3, 6) === '3 / 6',
        'inventory availability should show available quantity over total quantity',
    );
    assert(
        formatInventoryAvailability(0, 6) === '0 / 6',
        'inventory availability should show zero when all equipment is issued',
    );
}
