// Offline-Cache. Bei jeder Aenderung VERSION erhoehen.
const VERSION = 'knotenpunkt-v1';
const DATEIEN = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './src/ui/app.js', './src/ui/board.js', './src/ui/text.js', './src/ui/rules-text.js',
  './src/engine/rules.js', './src/engine/board.js', './src/engine/state.js',
  './src/engine/resolver.js', './src/engine/bots.js',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netz zuerst, Cache als Rueckfall - so ist die App offline spielbar,
// bekommt aber online immer die aktuelle Fassung.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
