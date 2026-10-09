// Service worker: a small helper that lives in the browser and keeps a copy of the app,
// so it opens even with no internet (on the metro, in the mountains...).
// Rule: always try the internet first (to get updates); if there's no internet, use the copy.

const CACHE = "mi-app-v10";   // change the number when you want to throw away old copies
const FILES = [
  "./", "index.html", "style.css", "app.js", "sample.json", "profe/interview.json", "profe/core.md",
  "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png",
];

// 1. Install: save a copy of the app's files
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

// 2. Activate: delete copies from older versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3. Every request: internet first, then the saved copy.
//    cache: "no-cache" = always ask the server "is there something newer?"
//    (otherwise the phone may reuse a 10-minute-old copy from GitHub)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request.url, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
