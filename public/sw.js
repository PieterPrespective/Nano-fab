/**
 * NanoFab service worker — offline-first precache shell (placeholder).
 *
 * Phase 1 task NF1-7 (prompts/nf01/05-pwa-and-deploy.md) replaces this with a
 * versioned precache of the built assets + level JSON. Until then it only
 * claims clients so registration can be exercised end-to-end.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
