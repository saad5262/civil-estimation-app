// ═══════════════════════════════════════════════════════════
// CIVIL ESTIMATION SUITE — Service Worker
// Provides full offline capability via Cache-First strategy
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'civil-estimation-suite-v2.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // jsPDF & AutoTable (CDN — cached on first load)
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing Civil Estimation Suite v2.0...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets immediately; CDN assets best-effort
      return cache.addAll(['./', './index.html', './manifest.json'])
        .then(() => {
          // Try to cache CDN assets (non-blocking)
          return Promise.allSettled(
            ASSETS_TO_CACHE.slice(3).map(url =>
              fetch(url, { mode: 'cors' })
                .then(res => res.ok ? cache.put(url, res) : null)
                .catch(() => null)
            )
          );
        });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — Cache First with Network Fallback ──
self.addEventListener('fetch', event => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache; refresh in background
        const networkUpdate = fetch(event.request)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            }
            return res;
          })
          .catch(() => null);

        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(res => {
        if (!res || !res.ok || res.type === 'opaque') return res;
        const toCache = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, toCache));
        return res;
      }).catch(() => {
        // Ultimate fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC — Auto-save notification ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
