import {
    REQUEST_KINDS,
    readLastRequestKind,
    requestKindLabel,
    requestKindPath,
    writeLastRequestKind,
} from './request-kind';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runRequestKindAssertions(): void {
    assert(
        requestKindPath('programs') === '/programs' &&
            requestKindPath('inventory') === '/inventory',
        'each request kind should map to its board path',
    );
    assert(
        requestKindLabel('programs') === 'Programs' &&
            requestKindLabel('inventory') === 'Inventory',
        'each request kind should have a switch label',
    );
    assert(
        REQUEST_KINDS.join() === 'programs,inventory',
        'the switch should list programs before inventory',
    );

    const store = new Map<string, string>();
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
        localStorage: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        },
    };
    try {
        assert(readLastRequestKind() === 'programs', 'nothing stored should open on programs');
        writeLastRequestKind('inventory');
        assert(readLastRequestKind() === 'inventory', 'the last kind should be remembered');
        store.set([...store.keys()][0], 'something-else');
        assert(readLastRequestKind() === 'programs', 'an unknown stored value should be ignored');
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
}
