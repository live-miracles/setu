import {
    addScannedInventoryItem,
    addScannedInventoryItemForIssue,
    inventoryItemHasLabel,
    inventoryTypeDisplayName,
    parseInventoryQrValue,
} from './inventory-qr';

// The pure rules behind the item lines of an inventory request. The detail
// screen persists the list these return; it keeps no copy of the lines.

export const missingReturnStatusMessage =
    'Please configure return status for all the issued inventory items before closing the request.';

// An issued request cannot be closed until every line says how it came back.
export function closeBlockedByMissingCondition(
    status: InventoryRequestStatus,
    items: InventoryItemDTO[],
): boolean {
    return status === 'issued' && items.some((item) => !item.Condition);
}

export const submitNeedsItemsMessage =
    'Add at least one inventory item to this request (use "Add item" or scan a QR code), then submit it.';

// A draft with no item lines cannot be submitted; the screen says so before it
// asks the person to confirm, instead of showing the server's refusal afterwards.
export function submitBlockedByNoItems(action: string, items: InventoryItemDTO[]): boolean {
    return action === 'submit' && items.length === 0;
}

export interface ItemDraft {
    InventoryTypeId: string;
    Quantity: number;
    Condition: ReturnCondition | '';
    LabelIds: string[];
}

export const emptyItemDraft = (): ItemDraft => ({
    InventoryTypeId: '',
    Quantity: 1,
    Condition: '',
    LabelIds: [],
});

export function itemLabelIds(item: InventoryItemDTO): string[] {
    return (item.labels || []).map((label) => (typeof label === 'string' ? label : label.Id));
}

export function itemDraftOf(item: InventoryItemDTO): ItemDraft {
    const labelIds = itemLabelIds(item);
    return {
        InventoryTypeId: item.InventoryTypeId,
        Quantity: Math.max(item.Quantity, labelIds.length),
        Condition: item.Condition,
        LabelIds: labelIds,
    };
}

// The message to show for a draft that cannot be saved, or null when it can.
export function itemDraftError(draft: ItemDraft, types: InventoryTypeDTO[]): string | null {
    if (!draft.InventoryTypeId) return 'Select an inventory type.';
    if (draft.Quantity <= 0) return 'Quantity must be greater than zero.';
    if (!types.some((type) => type.Id === draft.InventoryTypeId))
        return 'Select a valid inventory type.';
    return null;
}

// A line cannot be requested in a smaller quantity than the labels picked for it.
export function itemFromDraft(draft: ItemDraft, type: InventoryTypeDTO): InventoryItemDTO {
    return {
        InventoryTypeId: draft.InventoryTypeId,
        Quantity: Math.max(draft.Quantity, draft.LabelIds.length),
        Condition: draft.Condition,
        itemName: inventoryTypeDisplayName(type),
        labels: draft.LabelIds,
    };
}

// Adds a line (index null) or edits one, keeping the fields the draft does not carry.
export function upsertItem(
    items: InventoryItemDTO[],
    index: number | null,
    next: InventoryItemDTO,
): InventoryItemDTO[] {
    return index === null
        ? [...items, next]
        : items.map((item, at) => (at === index ? { ...item, ...next } : item));
}

export function removeItem(items: InventoryItemDTO[], index: number): InventoryItemDTO[] {
    return items.filter((_, at) => at !== index);
}

export function markItemReturned(items: InventoryItemDTO[], index: number): InventoryItemDTO[] {
    return items.map((item, at) => (at === index ? { ...item, Condition: 'returned' } : item));
}

export type ScanResult =
    | { ok: true; items: InventoryItemDTO[] }
    | { ok: false; reason: 'not-found' | 'duplicate-label' };

// What a scanned QR code does to the lines. A request scan counts one more of
// the type; an issue scan adds a label without raising the requested count.
export function scanIntoItems(
    types: InventoryTypeDTO[],
    items: InventoryItemDTO[],
    decodedValue: string,
    mode: 'request' | 'issue',
): ScanResult {
    const scan = parseInventoryQrValue(types, decodedValue);
    if (!scan) return { ok: false, reason: 'not-found' };
    const existing = items.find((item) => item.InventoryTypeId === scan.type.Id);
    if (scan.labelId && inventoryItemHasLabel(existing, scan.labelId)) {
        return { ok: false, reason: 'duplicate-label' };
    }
    const add = mode === 'issue' ? addScannedInventoryItemForIssue : addScannedInventoryItem;
    return {
        ok: true,
        items: add(items, scan.type.Id, scan.labelId).map((item) =>
            item.InventoryTypeId === scan.type.Id && !item.itemName
                ? { ...item, itemName: inventoryTypeDisplayName(scan.type) }
                : item,
        ),
    };
}
