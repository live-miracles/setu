export function parseInventoryQrValue(
    types: InventoryTypeDTO[],
    decodedValue: string,
): { type: InventoryTypeDTO; labelId: string | null } | null {
    const value = decodedValue.trim();
    if (/^\d+(?:-\d+)?$/.test(value)) {
        // Codes are entered into "00-00" fields, so "02" must match display id 2.
        const [inventoryTypeCode, labelCode] = value.split('-').map((code) => String(Number(code)));
        const type = types.find((entry) => String(entry.DisplayId) === inventoryTypeCode);
        if (!type) return null;
        if (labelCode === undefined) return { type, labelId: null };
        const label = (type.labels || []).find((entry) => String(entry.DisplayId) === labelCode);
        return label ? { type, labelId: label.Id } : null;
    }
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

export function inventoryQrValue(
    inventoryType: Pick<InventoryTypeDTO, 'Id' | 'DisplayId'>,
    label?: Pick<InventoryLabel, 'Id' | 'DisplayId'> | null,
): string {
    return label
        ? `${inventoryType.DisplayId}-${label.DisplayId}`
        : String(inventoryType.DisplayId);
}

export function inventoryTypeQrFilename(type: InventoryTypeDTO): string {
    const name = inventoryTypeDisplayName(type)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return `${name.replace(/^-|-$/g, '') || 'inventory-type'}-${type.Id}.png`;
}

export function inventoryLabelQrFilename(type: InventoryTypeDTO, label: InventoryLabel): string {
    const typeName = inventoryTypeDisplayName(type)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    const labelName = label.Name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return `${typeName.replace(/^-|-$/g, '') || 'inventory-type'}-${
        labelName.replace(/^-|-$/g, '') || 'label'
    }-${label.Id}.png`;
}

export function inventoryTypeDisplayName(type: { Brand?: unknown; Name?: unknown }): string {
    return [type.Brand, type.Name]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
}

export function inventoryTypeQrLabel(name: string, maxLength = 32): string {
    const value = name.trim();
    if (value.length <= maxLength) return value;
    return value.slice(0, Math.max(1, maxLength - 1)).trimEnd() + '…';
}

// Compares label names alphabetically, treating digit runs as numbers so
// "Cable 5" comes before "Cable 10".
export function compareLabelNames(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function sortInventoryLabels(labels: InventoryLabel[] = []): InventoryLabel[] {
    return [...labels].sort((a, b) => compareLabelNames(a.Name, b.Name));
}

export type InventoryGroupBy = 'brand' | 'location' | 'serial';

export type InventoryGroup<T> = {
    key: string;
    title: string;
    rows: T[];
    // Location grouping only: how many units of each row (same order as rows)
    // sit in this location.
    counts?: number[];
};

// Location written in a label name, by the "serial | location" convention:
// the text after the last " | ". Labels without one have no location.
export function inventoryLabelLocation(name: unknown): string {
    const parts = String(name || '').split('|');
    return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

type GroupableInventoryType = {
    DisplayId?: unknown;
    Brand?: unknown;
    Name?: unknown;
    Location?: unknown;
    TotalQuantity?: unknown;
    labels?: Array<{ Name?: unknown }>;
};

// Units per location for one type. Labels count towards the location in their
// name; labels without one, and units beyond the labelled ones, count towards
// the type's own Location field.
export function inventoryTypeLocationCounts(row: GroupableInventoryType): Map<string, number> {
    const counts = new Map<string, number>();
    const add = (key: string, n: number) => {
        if (n > 0) counts.set(key, (counts.get(key) || 0) + n);
    };
    const fallback = String(row.Location || '').trim();
    const labels = row.labels || [];
    labels.forEach((label) => add(inventoryLabelLocation(label.Name) || fallback, 1));
    const total = row.TotalQuantity == null ? null : Number(row.TotalQuantity);
    if (total != null && Number.isFinite(total)) add(fallback, total - labels.length);
    if (counts.size === 0) counts.set(fallback, 0);
    return counts;
}

// Groups inventory types by brand or location. Groups sort alphabetically
// (numbers compared numerically), types inside a group by display name, and
// types without a value land in a trailing "No brand" / "No location" group.
// By location, a type appears under every location its labels name. By serial,
// all types form one list ordered by their QR number (DisplayId).
export function groupInventoryTypes<T extends GroupableInventoryType>(
    rows: T[],
    groupBy: InventoryGroupBy,
): InventoryGroup<T>[] {
    if (groupBy === 'serial') {
        const serial = (row: T) => {
            const value = Number(row.DisplayId);
            return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
        };
        return [
            {
                key: 'serial',
                title: 'All by QR number',
                rows: [...rows].sort((a, b) => serial(a) - serial(b)),
            },
        ];
    }
    const groups = new Map<string, Array<{ row: T; count: number }>>();
    rows.forEach((row) => {
        const entries =
            groupBy === 'brand'
                ? new Map([[String(row.Brand || '').trim(), 0]])
                : inventoryTypeLocationCounts(row);
        entries.forEach((count, key) => {
            groups.set(key, [...(groups.get(key) || []), { row, count }]);
        });
    });
    return [...groups.entries()]
        .sort(([a], [b]) => (a && b ? compareLabelNames(a, b) : a ? -1 : b ? 1 : 0))
        .map(([key, entries]) => {
            const sorted = [...entries].sort((a, b) =>
                compareLabelNames(inventoryTypeDisplayName(a.row), inventoryTypeDisplayName(b.row)),
            );
            return {
                key,
                title: key || (groupBy === 'brand' ? 'No brand' : 'No location'),
                rows: sorted.map((entry) => entry.row),
                ...(groupBy === 'location' ? { counts: sorted.map((entry) => entry.count) } : {}),
            };
        });
}
