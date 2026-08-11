export function findInventoryTypeByQrValue(
    types: InventoryTypeDTO[],
    decodedValue: string,
): InventoryTypeDTO | null {
    const value = decodedValue.trim();
    return types.find((type) => type.Id === value) || null;
}

export function addScannedInventoryItem(
    items: InventoryItemDTO[],
    inventoryTypeId: string,
): InventoryItemDTO[] {
    const existingIndex = items.findIndex((item) => item.InventoryTypeId === inventoryTypeId);
    if (existingIndex === -1) {
        return [
            ...items,
            {
                InventoryTypeId: inventoryTypeId,
                Quantity: 1,
                Condition: '',
                itemName: '',
            },
        ];
    }
    return items.map((item, index) =>
        index === existingIndex ? { ...item, Quantity: item.Quantity + 1 } : { ...item },
    );
}

export function inventoryTypeQrFilename(type: InventoryTypeDTO): string {
    const name = type.Name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return `${name.replace(/^-|-$/g, '') || 'inventory-type'}-${type.Id}.png`;
}

export function inventoryTypeQrLabel(name: string, maxLength = 32): string {
    const value = name.trim();
    if (value.length <= maxLength) return value;
    return value.slice(0, Math.max(1, maxLength - 1)).trimEnd() + '…';
}
