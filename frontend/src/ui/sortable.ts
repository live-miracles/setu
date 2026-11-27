// Pure helpers for the drag-to-reorder list (SortableList in kit.tsx).

export interface SlotRect {
    top: number;
    height: number;
}

// Where an item lands when it is dragged `dy` pixels from slot `from`: after
// every other item whose middle it has passed.
export function dropIndex(rects: readonly SlotRect[], from: number, dy: number): number {
    const dragged = rects[from];
    if (!dragged) return from;
    const centre = dragged.top + dragged.height / 2 + dy;
    let index = 0;
    rects.forEach((rect, position) => {
        if (position !== from && rect.top + rect.height / 2 < centre) index++;
    });
    return index;
}

// A copy of the list with the item at `from` moved to `to`.
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
    if (from === to || from < 0 || from >= items.length) return [...items];
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
    return next;
}

// Replaces the items of `subset` inside `all` with `reordered`, slot for slot,
// so everything outside the subset keeps its place.
export function reorderSubset<T>(
    all: readonly T[],
    subset: readonly T[],
    reordered: readonly T[],
): T[] {
    let next = 0;
    return all.map((item) => (subset.includes(item) ? reordered[next++] : item));
}
