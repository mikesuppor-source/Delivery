// Cedar Delivery Desk — PWA Service Worker for Offline Courier Run Sheets
const CACHE_NAME = 'cedar-driver-pwa-v3';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico'
];

// Install: Cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching asset error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous cache versions & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept or cache non-GET requests or cross-origin requests
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Never cache API routes to avoid stale financial states
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Next.js Static Assets (JS bundles, CSS, fonts): Stale-While-Revalidate
  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes.status === 200) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        }).catch(() => null);

        return cached || fetchPromise || caches.match('/');
      })
    );
    return;
  }

  // Navigation (HTML Pages like /driver/[id]): Network-first with Cache-fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('/') || new Response(
            '<html><body><h1>Offline</h1><p>Cedar Delivery Run Sheet is running in offline mode. Please reconnect to sync latest orders.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
  }
});

// Push Event: Handle background push notifications when screen is locked or browser in background
self.addEventListener('push', (event) => {
  let data = {
    title: 'Cedar Delivery',
    body: 'New order update available',
    url: '/driver',
    tag: 'cedar-dispatch'
  };

  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (_e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/driver'
    },
    tag: data.tag || 'cedar-dispatch',
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click: Focus existing window or open the driver run sheet
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/driver') && 'focus' in client) {
          if (targetUrl && client.url !== targetUrl && 'navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
