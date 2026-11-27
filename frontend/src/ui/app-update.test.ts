import { watchForControllerChange, type UpdateSource } from './app-update';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function fakeSource(controller: unknown) {
    const listeners: Array<() => void> = [];
    const source: UpdateSource & { controller: unknown } = {
        controller,
        addEventListener: (_type, listener) => listeners.push(listener),
    };
    return { source, fire: () => listeners.forEach((listener) => listener()) };
}

export function runAppUpdateAssertions(): void {
    // First install: the worker claims a page that had none. Not an update.
    const first = fakeSource(null);
    let firstCalls = 0;
    watchForControllerChange(first.source, () => firstCalls++);
    first.source.controller = {};
    first.fire();
    assert(firstCalls === 0, 'the first install must not offer a reload');

    // An already-controlled page sees a new worker take over: offer it, once.
    const later = fakeSource({});
    let laterCalls = 0;
    watchForControllerChange(later.source, () => laterCalls++);
    later.fire();
    later.fire();
    assert(laterCalls === 1, 'a worker replacing the old one offers a reload exactly once');
}
