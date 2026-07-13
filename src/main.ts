/**
 * NanoFab entry point: mounts the chapter shell (NF03) and, in production,
 * registers the offline-first service worker. The phase-1 device lab lives
 * on behind the "Classic Layer 1" card until Chapter 2 re-stages it.
 */

import { startShell } from './ui/shell';

const app = document.getElementById('app');
if (app) startShell(app);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Offline support is progressive enhancement; the game must still run.
  });
}
