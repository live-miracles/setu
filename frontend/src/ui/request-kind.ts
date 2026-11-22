import { inventoryPath, programsPath } from '../paths';

// The two kinds of request share one "Requests" page with a switch between
// them. The last kind a person looked at is remembered, so the Requests tab
// opens where they left off.
export type RequestKind = 'inventory' | 'programs';

export const REQUEST_KINDS: RequestKind[] = ['programs', 'inventory'];

const LAST_KIND_STORAGE_KEY = 'setu:request-board-kind';

export function requestKindPath(kind: RequestKind): string {
    return kind === 'inventory' ? inventoryPath : programsPath;
}

export function requestKindLabel(kind: RequestKind): string {
    return kind === 'inventory' ? 'Inventory' : 'Programs';
}

export function readLastRequestKind(): RequestKind {
    try {
        const stored = window.localStorage.getItem(LAST_KIND_STORAGE_KEY);
        return REQUEST_KINDS.find((kind) => kind === stored) ?? 'programs';
    } catch {
        return 'programs';
    }
}

export function writeLastRequestKind(kind: RequestKind): void {
    try {
        window.localStorage.setItem(LAST_KIND_STORAGE_KEY, kind);
    } catch {
        // Private browsing or disabled storage only loses the remembered tab.
    }
}
