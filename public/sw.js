/**
 * NanoFab service worker — offline-first versioned precache.
 *
 * The precache-manifest placeholder below is replaced at build time by
 * scripts/inject-sw-precache.mjs with { version, files } computed from the
 * built dist/ tree. Strategy: precache the whole app shell on install,
 * cache-first on fetch, atomic cache swap on version change.
 */
const MANIFEST = __PRECACHE_MANIFEST__;
const CACHE = `nanofab-${MANIFEST.version}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(MANIFEST.files))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // ignoreVary: servers that send `Vary: Origin` (e.g. vite preview) would
  // otherwise make precached responses unmatchable for module-script
  // requests, breaking offline exactly where it matters.
  const OPTS = { ignoreSearch: true, ignoreVary: true };

  if (req.mode === 'navigate') {
    // NETWORK-FIRST for pages: deploys and new pages appear on the next
    // load instead of being masked by a stale cached shell (a cache-first
    // navigation once served the old game at a brand-new URL). The cache is
    // only the offline fallback, refreshed on every successful fetch.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req, OPTS)
            .then((hit) => hit || caches.match('./index.html', OPTS))
            .then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  // CACHE-FIRST for subresources: hashed asset filenames are immutable, so
  // a cache hit is always correct and instant.
  event.respondWith(
    caches.match(req, OPTS).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
