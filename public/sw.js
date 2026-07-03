/* Triage Mail — web push service worker */

self.addEventListener("install", (event) => {
  // Activate this worker immediately without waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Fall back to plain text bodies.
    payload = { title: "Triage Mail", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Triage Mail";
  const options = {
    body: payload.body || "You have a new important email.",
    icon: "/brand/logo.png",
    badge: "/brand/logo.png",
    data: { url: payload.url || "/review" },
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/review";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if one is already open.
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              client.navigate(targetUrl).catch(() => {});
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
