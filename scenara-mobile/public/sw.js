/**
 * Scenara service worker — minimal Web Push relay.
 *
 * Two responsibilities:
 *   1. push event:  decode the JSON the backend sent (title/body/data) and
 *      ask the OS to show a system notification.
 *   2. notificationclick:  route the user back into the app at data.route.
 *      We focus an existing tab when possible (Vercel-served PWA) so we
 *      don't pile up duplicate windows.
 *
 * Stays tiny on purpose. Anything bigger lives in the React app.
 */

self.addEventListener("install", () => {
  // Activate immediately on first install — otherwise the user has to
  // close all tabs before push works.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Scenara", body: "", data: {} };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Fallback: treat as plain text body
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Scenara", {
      body: payload.body || "",
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: payload.data || {},
      tag: "scenara",            // collapse multiple updates into one slot
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  // We just route the SPA to "/" + a query string carrying route+params;
  // the app's tap-handler reads it and calls router.push. Doing it in JS
  // (not as a real path) keeps the SW agnostic to Expo Router internals.
  const route = typeof data.route === "string" ? data.route : "/";
  const params = data.params && typeof data.params === "object" ? data.params : {};
  const search = new URLSearchParams({ pn_route: route, ...flatten(params) }).toString();
  const target = `/?${search}`;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer focusing an open Scenara tab over opening a new one.
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.postMessage({ type: "scenara/push-tap", route, params });
            await client.focus();
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});

function flatten(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    out[`pn_${k}`] = String(obj[k]);
  }
  return out;
}
