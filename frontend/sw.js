/* The PWA shell deliberately caches only same-origin static assets. API and
 * image requests stay network-first so request data and access changes cannot
 * become stale or leak through a shared cache. */
const CACHE = 'setu-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
            ),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (
                    response.ok &&
                    (url.pathname === '/' || /\.(?:js|css|png|webmanifest)$/.test(url.pathname))
                ) {
                    const copy = response.clone();
                    void caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
});
