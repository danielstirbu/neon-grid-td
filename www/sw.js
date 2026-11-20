/* Neon Grid TD service worker — cache-first, 100% offline after first load. */
const CACHE = 'neon-grid-td-v13';

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-180.png',
  './js/main.js',
  './js/config.js',
  './js/audio.js',
  './js/pathfinding.js',
  './js/entities.js',
  './js/waves.js',
  './js/renderer.js',
  './js/toon.js',
  './js/landscape.js',
  './js/ui.js',
  './js/boot.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so updates land, cache fallback keeps it offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch(req, { signal: ctrl.signal });
        if (res.ok) {
          // Only cache successful responses; a captive-portal or 500 page must
          // never replace index.html in the cache.
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', res.clone());
        }
        return res;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      } finally {
        clearTimeout(timer);
      }
    })());
    return;
  }

  // Assets: cache-first with background fill.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
