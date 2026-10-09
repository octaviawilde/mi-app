// Service worker: a small helper that lives in the browser and keeps a copy of the app,
// so it opens even with no internet (on the metro, in the mountains...).
// Rule: always try the internet first (to get updates); if there's no internet, use the copy.

const CACHE = "mi-app-v7";   // change the number when you want to throw away old copies
const ARCHIVOS = [
  "./", "index.html", "style.css", "app.js", "ejemplo.json", "profe/entrevista.json",
  "manifest.webmanifest", "icono-192.png", "icono-512.png", "icono-180.png",
];

// 1. Install: save a copy of the app's files
self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

// 2. Activate: delete copies from older versions
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3. Every request: internet first, then the saved copy.
//    cache: "no-cache" = always ask the server "is there something newer?"
//    (otherwise the phone may reuse a 10-minute-old copy from GitHub)
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request.url, { cache: "no-cache" })
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true }))
  );
});
