const CACHE_NAME = 'raju-sweets-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/logo.png',
  '/manifest.json'
];

// Install event - Cache core shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force active immediately on install
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate event - Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  self.clients.claim(); // Claim immediately to enable auto-update
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - Network first strategy for dynamic assets, falling back to cache
self.addEventListener('fetch', (event) => {
  // Skip dynamic firebase/database or POST/PUT/DELETE requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If successful response, clone and save to cache dynamically
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline / Network Error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});
