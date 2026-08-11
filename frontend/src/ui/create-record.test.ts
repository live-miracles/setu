import { createRecordDestination } from './create-record';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runCreateRecordAssertions(): void {
    assert(
        createRecordDestination('programs', 'program-123') === 'program-123',
        'program creation should return the created record id',
    );
    assert(
        createRecordDestination('inventory', 'inventory-123') === 'inventory-123',
        'inventory creation should return the created record id',
    );
    assert(
        createRecordDestination('tickets', 'ticket-123') === 'ticket-123',
        'ticket creation should return the created record id',
    );
}
