import {
    closeBlockedByMissingCondition,
    emptyItemDraft,
    itemDraftError,
    itemDraftOf,
    itemFromDraft,
    markItemReturned,
    missingReturnStatusMessage,
    removeItem,
    scanIntoItems,
    submitBlockedByNoItems,
    upsertItem,
} from './inventory-items';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const label = (Id: string, DisplayId: number) => ({ Id, DisplayId, Name: `L${DisplayId}` });
const type = {
    Id: 'type-1',
    DisplayId: 1,
    Brand: 'Acme',
    Name: 'Camera',
    labels: [label('label-1', 1), label('label-2', 2)],
} as unknown as InventoryTypeDTO;
const item = (overrides: Partial<InventoryItemDTO> = {}): InventoryItemDTO => ({
    InventoryTypeId: 'type-1',
    Quantity: 1,
    Condition: '',
    itemName: 'Acme · Camera',
    labels: [],
    ...overrides,
});

export function runInventoryItemsAssertions(): void {
    // Closing an issued request needs a return condition on every line.
    assert(
        closeBlockedByMissingCondition('issued', [item(), item({ Condition: 'returned' })]),
        'an issued request with an unreturned line cannot be closed',
    );
    assert(
        !closeBlockedByMissingCondition('issued', [item({ Condition: 'damaged' })]),
        'every line has a condition',
    );
    assert(
        !closeBlockedByMissingCondition('approved', [item()]),
        'only issued requests are checked',
    );

    // The message names the lines that still need a status (three at most).
    const one = missingReturnStatusMessage([item(), item({ Condition: 'returned' })]);
    assert(one.startsWith('Acme · Camera has no return status yet.'), 'a single line is named');
    const many = missingReturnStatusMessage([
        item({ itemName: 'A' }),
        item({ itemName: 'B' }),
        item({ itemName: 'C' }),
        item({ itemName: 'D' }),
        item({ itemName: 'E', Condition: 'damaged' }),
    ]);
    assert(
        many.startsWith('4 items have no return status yet: A, B, C and 1 more.'),
        'several lines are counted and the list is shortened',
    );

    // Submitting needs at least one line; other actions are not held back.
    assert(submitBlockedByNoItems('submit', []), 'an empty request cannot be submitted');
    assert(!submitBlockedByNoItems('submit', [item()]), 'a request with a line can be submitted');
    assert(!submitBlockedByNoItems('cancel', []), 'only submitting needs lines');

    // Drafts: editing a line starts from its labels, never below their count.
    const draft = itemDraftOf(item({ Quantity: 1, labels: [label('a', 1) as never, 'b'] }));
    assert(draft.Quantity === 2, 'the quantity covers the labels');
    assert(draft.LabelIds.join(',') === 'a,b', 'label objects and ids both become ids');
    assert(itemDraftError(emptyItemDraft(), [type]) === 'Select an inventory type.', 'type needed');
    assert(
        itemDraftError({ ...emptyItemDraft(), InventoryTypeId: 'type-1', Quantity: 0 }, [type]) ===
            'Quantity must be greater than zero.',
        'quantity needed',
    );
    assert(
        itemDraftError({ ...emptyItemDraft(), InventoryTypeId: 'gone' }, [type]) ===
            'Select a valid inventory type.',
        'the type must exist',
    );
    assert(
        itemDraftError({ ...emptyItemDraft(), InventoryTypeId: 'type-1' }, [type]) === null,
        'a complete draft is fine',
    );
    const built = itemFromDraft(
        { InventoryTypeId: 'type-1', Quantity: 1, Condition: '', LabelIds: ['a', 'b', 'c'] },
        type,
    );
    assert(built.Quantity === 3, 'a line asks for at least one of each label');
    assert(built.itemName === 'Acme · Camera', 'the line is named after the type');

    // List edits return new lists and keep what the draft does not carry.
    const base = [item(), item({ InventoryTypeId: 'type-2', Condition: 'returned' })];
    assert(upsertItem(base, null, item({ Quantity: 5 })).length === 3, 'a new line is added');
    const edited = upsertItem(base, 1, item({ InventoryTypeId: 'type-3', Quantity: 4 }));
    assert(edited.length === 2 && edited[1].InventoryTypeId === 'type-3', 'a line is replaced');
    assert(edited[0] === base[0], 'other lines are untouched');
    assert(removeItem(base, 0).length === 1, 'a line is removed');
    assert(markItemReturned(base, 0)[0].Condition === 'returned', 'a line is marked returned');
    assert(base[0].Condition === '', 'the original list is not changed');

    // Scans: a request scan counts one more, an issue scan only adds the label.
    const scanned = scanIntoItems([type], [item({ Quantity: 1 })], '1-2', 'request');
    assert(scanned.ok && scanned.items[0].Quantity === 2, 'a request scan adds one');
    assert(
        scanned.ok && scanned.items[0].labels.join(',') === 'label-2',
        'the scanned label is added',
    );
    const issued = scanIntoItems([type], [item({ Quantity: 1 })], '1-2', 'issue');
    assert(issued.ok && issued.items[0].Quantity === 1, 'an issue scan keeps the count');
    const fresh = scanIntoItems([type], [], '1', 'request');
    assert(
        fresh.ok && fresh.items.length === 1 && fresh.items[0].itemName === 'Acme · Camera',
        'a new type becomes a named line',
    );
    const duplicate = scanIntoItems([type], [item({ labels: ['label-2'] })], '1-2', 'issue');
    assert(!duplicate.ok && duplicate.reason === 'duplicate-label', 'a label is added once');
    const unknown = scanIntoItems([type], [], '99', 'request');
    assert(!unknown.ok && unknown.reason === 'not-found', 'an unknown code is refused');
}
