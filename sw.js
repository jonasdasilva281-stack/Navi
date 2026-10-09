// Service worker da Navi: guarda a "casca" da app para abrir depressa; os preços vêm sempre da rede.
const CACHE = "navi-v33";
const CASCA = ["/", "/index.html", "/manifest.webmanifest", "/airports.json", "/land-110m.json", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return; // preços: sempre rede
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("/index.html"))));
});
