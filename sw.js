// Service Worker for Guitar Chord Studio v2
// Provides offline support, subpath compatibility, and instant updates

const getBasePath = () => {
  const path = self.location.pathname;
  return path.substring(0, path.lastIndexOf('/') + 1);
};

const BASE = getBasePath();
// Pages apps share an origin, not a cache namespace. Never evict another app's data.
const CACHE_PREFIX = `guitar-studio:${BASE}:`;
// BItGgaPL is replaced at build time with the bundle hash (scripts/stamp-sw.mjs)
const CACHE_NAME = `${CACHE_PREFIX}BItGgaPL`;
const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'all_chord_shapes.js',
  BASE + 'song_catalog_data.js'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-caching warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => {
            console.log('Clearing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // For HTML navigation requests: Network First, falling back to cache
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    const fallback = BASE + (url.pathname === BASE + 'electric-lab.html' ? 'electric-lab.html' : 'index.html');
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.open(CACHE_NAME).then(async (cache) =>
            (await cache.match(event.request)) || (await cache.match(fallback)) || Response.error());
        })
    );
    return;
  }

  // For JS, CSS, media: Cache First, update in background (Stale-While-Revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          cache.put(event.request, clone);
        }
        return networkResponse;
      }).catch(() => Response.error());

      return cachedResponse || fetchPromise;
    })
  );
});

// Background sync for practice sessions (when online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-practice-sessions') {
    event.waitUntil(syncPracticeSessions());
  }
});

async function syncPracticeSessions() {
  // Implementation would sync localStorage data to server
  // For now, just log
  console.log('Background sync triggered for practice sessions');
}