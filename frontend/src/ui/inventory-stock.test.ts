import { formatInventoryAvailability, inventoryShortageMessage } from './inventory-stock';

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
    assert(
        inventoryShortageMessage('draft', 3, 2) !== '',
        'draft request should warn when quantity exceeds availability',
    );
    assert(
        inventoryShortageMessage('submitted', 3, 2) !== '',
        'submitted request should warn when quantity exceeds availability',
    );
    assert(
        inventoryShortageMessage('draft', 2, 2) === '',
        'no warning when requested quantity equals availability',
    );
    for (const status of ['approved', 'issued', 'closed', 'rejected', 'cancelled']) {
        assert(
            inventoryShortageMessage(status, 2, 0) === '',
            `${status} request should not warn about availability`,
        );
    }
}
