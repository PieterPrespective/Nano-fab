/**
 * NanoFab entry point: mounts the chapter shell (NF03) and, in production,
 * registers the offline-first service worker. Chapters 1–2 are live; the
 * phase-1 device lab was re-staged as Chapter 2's energy-terrain levels.
 */

import { startShell } from './ui/shell';

// Tell the index.html boot beacon the module is alive.
(window as unknown as { __nanofabBoot?: boolean }).__nanofabBoot = true;

const app = document.getElementById('app');
if (app) startShell(app);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Offline support is progressive enhancement; the game must still run.
  });
}
