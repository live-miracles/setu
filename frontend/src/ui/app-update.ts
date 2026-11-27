import { dismissToast, pushToast } from './overlay-kit';

// The service worker (frontend/sw.js) activates a new version immediately, but
// the page that is already open keeps running the old scripts. This watches for
// that hand-over and offers a reload instead of reloading under people's feet,
// which could discard a half-filled form.
const UPDATE_TOAST_ID = 'setu-update';

// Chrome re-checks sw.js on navigation, but an installed phone app is often just
// suspended and resumed, so also check whenever it comes back to the foreground.
// Throttled so flipping between apps does not hit the network every time.
export const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

// The slice of ServiceWorkerContainer this needs, so tests can fake it.
export interface UpdateSource {
    readonly controller: unknown;
    addEventListener(type: 'controllerchange', listener: () => void): void;
}

// Calls `onUpdate` once when a different service worker takes over a page that
// already had one. The very first install also fires `controllerchange` (the
// worker claims the page) but that is not an update, so it is ignored.
export function watchForControllerChange(source: UpdateSource, onUpdate: () => void): void {
    const hadController = Boolean(source.controller);
    let notified = false;
    source.addEventListener('controllerchange', () => {
        if (!hadController || notified) return;
        notified = true;
        onUpdate();
    });
}

export function showUpdateToast(reload: () => void = () => window.location.reload()): void {
    pushToast({
        id: UPDATE_TOAST_ID,
        kind: 'info',
        title: 'A new version is available',
        description: 'Reload to get the latest changes. Save any work in progress first.',
        action: { label: 'Reload', onClick: reload },
        dismissible: true,
    });
}

export function dismissUpdateToast(): void {
    dismissToast(UPDATE_TOAST_ID);
}

// Registers the service worker and wires the update prompt. Safe to call once at startup.
export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const container = navigator.serviceWorker;
    watchForControllerChange(container, () => showUpdateToast());
    container
        .register('/sw.js')
        .then((registration) => {
            let lastCheck = Date.now();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState !== 'visible') return;
                if (Date.now() - lastCheck < UPDATE_CHECK_MIN_INTERVAL_MS) return;
                lastCheck = Date.now();
                registration.update().catch(() => {});
            });
        })
        .catch(() => {});
}
