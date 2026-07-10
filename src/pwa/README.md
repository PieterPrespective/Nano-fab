# PWA shell

- `public/manifest.webmanifest` — installable app manifest (standalone launch on the Tab S8).
- `public/sw.js` — service worker; phase 1 upgrades it to precache the built
  bundle and all level JSON for full offline play (see prompts/nf01/05-pwa-and-deploy.md).

Hard constraint: the game is fully playable offline after first load. No backend, ever.
