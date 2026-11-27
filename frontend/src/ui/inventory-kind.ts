import { inventoryLabelsPath, inventoryTypesPath } from '../paths';
import { isViewVisible, sortByViewOrder, type ViewSettings } from './views';

// Inventory types and inventory labels share one "Inventory" menu entry with a
// switch between them, like the two request boards. The last one a person
// looked at is remembered, so the menu entry opens where they left off.
export type InventoryKind = 'types' | 'labels';

export const INVENTORY_KINDS: InventoryKind[] = ['types', 'labels'];

const LAST_KIND_STORAGE_KEY = 'setu:inventory-kind';

export function inventoryKindPath(kind: InventoryKind): string {
    return kind === 'labels' ? inventoryLabelsPath : inventoryTypesPath;
}

export function inventoryKindLabel(kind: InventoryKind): string {
    return kind === 'labels' ? 'Labels' : 'Types';
}

// The settings key that hides each kind (see supabase/functions/_shared/views.ts).
const KIND_VIEW = { types: 'inventory-types', labels: 'inventory-labels' } as const;

// The kinds an admin has not hidden, in switch order.
export function visibleInventoryKinds(homeContent: ViewSettings): InventoryKind[] {
    return sortByViewOrder(
        homeContent,
        INVENTORY_KINDS.filter((kind) => isViewVisible(homeContent, KIND_VIEW[kind])),
        (kind) => [KIND_VIEW[kind]],
    );
}

export function readLastInventoryKind(): InventoryKind {
    try {
        const stored = window.localStorage.getItem(LAST_KIND_STORAGE_KEY);
        return INVENTORY_KINDS.find((kind) => kind === stored) ?? 'types';
    } catch {
        return 'types';
    }
}

export function writeLastInventoryKind(kind: InventoryKind): void {
    try {
        window.localStorage.setItem(LAST_KIND_STORAGE_KEY, kind);
    } catch {
        // Private browsing or disabled storage only loses the remembered choice.
    }
}
