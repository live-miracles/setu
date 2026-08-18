import {
    addScannedInventoryItem,
    findInventoryTypeByQrValue,
    inventoryTypeQrFilename,
    inventoryTypeQrLabel,
} from './inventory-qr';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const types = [
    {
        Id: 'inventory-type-uuid-1',
        Name: 'Camera body',
        Description: '',
        Requestable: true,
        ImageId: '',
        TotalQuantity: 4,
        availableQuantity: 2,
    },
    {
        Id: 'inventory-type-uuid-2',
        Name: 'Tripod / stand',
        Description: '',
        Requestable: true,
        ImageId: '',
        TotalQuantity: 4,
        availableQuantity: 4,
    },
] as InventoryTypeDTO[];

const items = [
    {
        InventoryTypeId: 'inventory-type-uuid-1',
        Quantity: 2,
        Condition: 'returned',
        itemName: 'Camera body',
    },
    { InventoryTypeId: 'other-type', Quantity: 1, Condition: '', itemName: 'Other' },
] as InventoryItemDTO[];

export function runInventoryQrAssertions(): void {
    assert(
        findInventoryTypeByQrValue(types, ' inventory-type-uuid-1 ')?.Id ===
            'inventory-type-uuid-1',
        'scanner should trim and match the exact inventory type UUID',
    );
    assert(
        findInventoryTypeByQrValue(types, 'INVENTORY-TYPE-UUID-1') === null,
        'scanner should not perform case-insensitive matching',
    );
    assert(
        findInventoryTypeByQrValue(types, 'unknown-type') === null,
        'scanner should reject unknown inventory type UUIDs',
    );

    const incremented = addScannedInventoryItem(items, 'inventory-type-uuid-1');
    assert(incremented[0].Quantity === 3, 'scanning an existing type should increment quantity');
    assert(incremented[0].Condition === 'returned', 'incrementing should preserve item condition');
    assert(incremented[1].Quantity === 1, 'incrementing should preserve other items');

    const added = addScannedInventoryItem(items, 'inventory-type-uuid-2');
    assert(added.length === 3, 'scanning a new type should add one item');
    assert(
        added[2].InventoryTypeId === 'inventory-type-uuid-2' &&
            added[2].Quantity === 1 &&
            added[2].Condition === '',
        'new scanned item should start at quantity one with no condition',
    );
    assert(
        inventoryTypeQrFilename(types[1]) === 'tripod-stand-inventory-type-uuid-2.png',
        'QR filename should be readable and include the UUID',
    );
    assert(
        inventoryTypeQrLabel('A very long inventory type name that will not fit') ===
            'A very long inventory type name…',
        'QR label should use an ellipsis when the name is too long',
    );
}
