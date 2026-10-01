// Offline-Cache. Bei jeder Aenderung VERSION erhoehen.
const VERSION = 'knotenpunkt-v10';
const DATEIEN = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './src/ui/app.js', './src/ui/board.js', './src/ui/board3d.js', './src/ui/figures.js',
  './src/ui/reveal.js', './src/ui/view-flag.js', './src/ui/text.js', './src/ui/rules-text.js',
  './src/ui/online-views.js',
  './src/engine/rules.js', './src/engine/board.js', './src/engine/state.js',
  './src/engine/resolver.js', './src/engine/bots.js',
  './src/net/room.js', './src/net/online.js', './src/net/config.js', './src/net/firebase.js',
  './vendor/three/three.module.min.js', './vendor/three/OrbitControls.js',
  './vendor/three/NOTICE.md',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(DATEIEN))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function istVendor(url) {
  return url.pathname.includes('/vendor/');
}

// Vendor (Three.js-Pin): Cache zuerst — unveraenderliche Assets.
// App-Code: Netz zuerst, Cache als Rueckfall.
// Fremde Server (Firebase) unangetastet.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (istVendor(url)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        });
      }).catch(() => caches.match('./index.html')),
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
