/**
 * NanoFab entry point: mounts the canvas app and (in production) registers
 * the offline-first service worker.
 */

import { startApp } from './ui/app';

const app = document.getElementById('app');
if (app) startApp(app);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Offline support is progressive enhancement; the game must still run.
  });
}
