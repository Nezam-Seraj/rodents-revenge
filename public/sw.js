// Rodent's Revenge — Service Worker (offline + installable)
const CACHE = 'rodents-revenge-v1';
const BASE = '/rodents-revenge/';

const PRECACHE = [
    BASE,
    BASE + 'index.html',
    BASE + 'manifest.json',
    BASE + 'icons/icon-192.png',
    BASE + 'icons/icon-512.png',
    BASE + 'icons/icon-maskable-512.png',
    BASE + 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Only handle same-origin GET requests (skip cross-origin like Google Fonts)
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    // Navigations (HTML): network-first, fall back to cached shell
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(BASE + 'index.html', copy));
                    return res;
                })
                .catch(() => caches.match(BASE + 'index.html'))
        );
        return;
    }

    // Static assets (hashed JS/CSS, icons): cache-first, populate on miss
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((res) => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, copy));
                }
                return res;
            });
        })
    );
});
