import {
    addScannedInventoryItem,
    addScannedInventoryItemForIssue,
    findInventoryTypeByQrValue,
    inventoryItemHasLabel,
    inventoryQrValue,
    inventoryTypeQrFilename,
    inventoryTypeQrLabel,
    parseInventoryQrValue,
} from './inventory-qr';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const types = [
    {
        Id: 'inventory-type-uuid-1',
        DisplayId: 34,
        Name: 'Camera body',
        Description: '',
        Requestable: true,
        ImageId: '',
        TotalQuantity: 4,
        availableQuantity: 2,
        labels: [
            {
                Id: 'label-1',
                DisplayId: 12,
                InventoryTypeId: 'inventory-type-uuid-1',
                Name: 'CAM-001',
            },
        ],
    },
    {
        Id: 'inventory-type-uuid-2',
        DisplayId: 35,
        Name: 'Tripod / stand',
        Description: '',
        Requestable: true,
        ImageId: '',
        TotalQuantity: 4,
        availableQuantity: 4,
        labels: [],
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
    assert(
        parseInventoryQrValue(types, 'inventory-type-uuid-1:label-1')?.labelId === 'label-1',
        'scanner should parse a labeled inventory QR value',
    );
    assert(
        parseInventoryQrValue(types, '34')?.type.Id === 'inventory-type-uuid-1',
        'scanner should parse a compact unlabeled inventory QR value',
    );
    assert(
        parseInventoryQrValue(types, '34-12')?.labelId === 'label-1',
        'scanner should parse a compact labeled inventory QR value',
    );
    assert(
        inventoryQrValue(types[0]) === '34' &&
            inventoryQrValue(types[0], types[0].labels[0]) === '34-12',
        'QR generation should use compact inventory and label numbers',
    );
    assert(
        parseInventoryQrValue(types, 'inventory-type-uuid-1:unknown-label') === null,
        'scanner should reject a label that is not configured for the type',
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
    const labeled = addScannedInventoryItem(items, 'inventory-type-uuid-1', 'label-1');
    assert(
        labeled[0].Quantity === 3 && inventoryItemHasLabel(labeled[0], 'label-1'),
        'request scanning should increment quantity and attach a new label',
    );
    const issued = addScannedInventoryItemForIssue(items, 'inventory-type-uuid-1', 'label-1');
    assert(
        issued[0].Quantity === 2 && inventoryItemHasLabel(issued[0], 'label-1'),
        'issue scanning should attach a label without incrementing an existing quantity',
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
