'use client';

function decodeVapidKey(value: string) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
    const bytes = window.atob(base64);
    return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export async function subscribeCurrentDeviceToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('This browser does not support Web Push.');
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
        if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return;
        throw new Error('Web Push is not configured for this environment.');
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeVapidKey(publicKey),
        }));

    const response = await fetch('/api/v1/push-subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) {
        throw new Error('The device could not be registered for Web Push.');
    }
}
