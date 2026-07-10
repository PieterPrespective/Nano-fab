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
  event.respondWith(
    caches.match(req, OPTS).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') {
        // SPA shell: any navigation inside scope falls back to index.html.
        return caches.match('./index.html', OPTS).then((shell) => shell || fetch(req));
      }
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
