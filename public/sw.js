self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(
      payload.title || "Livestream Operations",
      {
        body: payload.body || "You have a new notification.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-64.png",
        data: { url: payload.url || "/app" },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const existing = clients.find((client) =>
          client.url.includes(targetUrl),
        );
        return existing ? existing.focus() : self.clients.openWindow(targetUrl);
      },
    ),
  );
});
