import { isOngoingInventoryRequest } from './inventory-status';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runInventoryStatusAssertions(): void {
    for (const Status of ['draft', 'submitted', 'approved', 'issued'] as const) {
        assert(isOngoingInventoryRequest({ Status }), `${Status} should be ongoing`);
    }
    for (const Status of ['rejected', 'cancelled', 'closed'] as const) {
        assert(!isOngoingInventoryRequest({ Status }), `${Status} should not be ongoing`);
    }
}
