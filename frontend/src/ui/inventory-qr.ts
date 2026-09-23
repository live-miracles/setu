export function parseInventoryQrValue(
    types: InventoryTypeDTO[],
    decodedValue: string,
): { type: InventoryTypeDTO; labelId: string | null } | null {
    const value = decodedValue.trim();
    const [inventoryTypeId, labelId, ...extra] = value.split(':');
    if (extra.length > 0 || !inventoryTypeId) return null;
    const type = types.find((entry) => entry.Id === inventoryTypeId);
    if (!type) return null;
    if (!labelId) return { type, labelId: null };
    const label = (type.labels || []).find((entry) => entry.Id === labelId);
    return label ? { type, labelId } : null;
}

export function findInventoryTypeByQrValue(
    types: InventoryTypeDTO[],
    decodedValue: string,
): InventoryTypeDTO | null {
    return parseInventoryQrValue(types, decodedValue)?.type || null;
}

export function addScannedInventoryItem(
    items: InventoryItemDTO[],
    inventoryTypeId: string,
    labelId?: string | null,
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
                labels: labelId ? [labelId] : [],
            },
        ];
    }
    return items.map((item, index) =>
        index === existingIndex
            ? {
                  ...item,
                  Quantity: item.Quantity + 1,
                  labels: labelId
                      ? Array.from(new Set([...(item.labels || []), labelId]))
                      : item.labels || [],
              }
            : { ...item },
    );
}

export function addScannedInventoryItemForIssue(
    items: InventoryItemDTO[],
    inventoryTypeId: string,
    labelId?: string | null,
): InventoryItemDTO[] {
    const existingIndex = items.findIndex((item) => item.InventoryTypeId === inventoryTypeId);
    if (existingIndex === -1) {
        return addScannedInventoryItem(items, inventoryTypeId, labelId);
    }
    if (!labelId) return items.map((item) => ({ ...item, labels: item.labels || [] }));
    return items.map((item, index) => {
        if (index !== existingIndex) return { ...item };
        const labels = Array.from(new Set([...(item.labels || []), labelId]));
        return { ...item, Quantity: Math.max(item.Quantity, labels.length), labels };
    });
}

export function inventoryItemHasLabel(
    item: InventoryItemDTO | undefined,
    labelId: string,
): boolean {
    return Boolean(
        item?.labels?.some((label) =>
            typeof label === 'string' ? label === labelId : label.Id === labelId,
        ),
    );
}

export function inventoryQrValue(inventoryTypeId: string, labelId?: string | null): string {
    return labelId ? `${inventoryTypeId}:${labelId}` : inventoryTypeId;
}

export function inventoryTypeQrFilename(type: InventoryTypeDTO): string {
    const name = type.Name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return `${name.replace(/^-|-$/g, '') || 'inventory-type'}-${type.Id}.png`;
}

export function inventoryLabelQrFilename(type: InventoryTypeDTO, label: InventoryLabel): string {
    const typeName = type.Name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    const labelName = label.Name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return `${typeName.replace(/^-|-$/g, '') || 'inventory-type'}-${
        labelName.replace(/^-|-$/g, '') || 'label'
    }-${label.Id}.png`;
}

export function inventoryTypeQrLabel(name: string, maxLength = 32): string {
    const value = name.trim();
    if (value.length <= maxLength) return value;
    return value.slice(0, Math.max(1, maxLength - 1)).trimEnd() + '…';
}
