# NF01-05 — PWA Shell & Deploy Pipeline (NF1-7, NF1-8)

Hard constraints (CLAUDE.md): no backend, fully offline after first load,
installable on the Galaxy Tab S8, static `dist/` deployed by GitHub Actions.

## 1. What already exists (repo scaffold)

- `public/manifest.webmanifest` — standalone display, theme colors. **TODO in
  NF1-7:** add real icons (192/512 px maskable PNGs, generated from a simple
  wafer/die glyph) — required for installability.
- `public/sw.js` — placeholder that only claims clients.
- `src/main.ts` — registers `sw.js` in production builds only (dev stays
  SW-free so caching never fights the dev server).
- `.github/workflows/deploy.yml` — test → build → deploy `dist/` to Pages on
  `main`; plain CI on PRs/branches.
- `vite.config.ts` — `base: '/Nano-fab/'` (Pages serves from a subpath);
  `VITE_BASE` env override for other hosts.

## 2. NF1-7 — offline-first service worker

Strategy: **versioned precache, cache-first, atomic upgrade**. No runtime
dependency (no Workbox); the SW is ~60 lines of vanilla JS.

1. **Build-time manifest injection.** Vite hashes assets, so the SW must know
   the built filenames. Add `scripts/inject-sw-precache.mjs` (node, no deps):
   after `vite build`, scan `dist/` and replace `__PRECACHE_MANIFEST__` in
   `dist/sw.js` with the file list + a content-hash version string. Wire as
   `"build": "tsc --noEmit && vite build && node scripts/inject-sw-precache.mjs"`.
2. **SW behavior** (`public/sw.js`):
   - `install`: open `nanofab-v<hash>` cache, `addAll` the manifest (app shell,
     JS/CSS chunks, level JSON, manifest, icons); `skipWaiting`.
   - `activate`: delete caches with other versions; `clients.claim()`.
   - `fetch`: same-origin GET → cache-first, falling back to network, navigations
     fall back to cached `index.html` (SPA shell).
3. **Level JSON**: imported via `import.meta.glob('.../levels/*.json', {eager:true})`
   so levels are *in the bundle* — nothing to fetch at runtime, offline for free.
   (The SW precache list then matters only for the shell; keep both anyway so a
   future lazy-loaded level pack stays offline-safe.)

### Tests

- `tests/pwa/precache.test.ts` — run the inject script against a fixture
  `dist/` tree (temp dir): manifest contains every file, version changes when
  a file's bytes change, is stable when nothing changed, placeholder token
  gone from output.
- SW runtime behavior is not unit tested (browser-only API): covered by the
  manual checklist below — that's a deliberate, documented test-pyramid choice.

## 3. NF1-8 — deploy + release QA

1. One-time: repo **Settings → Pages → Source = GitHub Actions**.
2. Merge phase-1 work to `main`; the workflow deploys to
   `https://<owner>.github.io/Nano-fab/`.
3. Run the QA gates:

**Desktop (DevTools):**
- [ ] Application → Manifest: installable, no warnings; icons load.
- [ ] Load page → Network tab → Offline → hard reload: app boots, all levels
      playable, progress saves.
- [ ] Deploy a trivial change: SW updates on next load (new version activates,
      old cache deleted).

**On the Tab S8:**
- [ ] Chrome: install to home screen; launch standalone; airplane mode → full
      gameplay; relaunch from cold in airplane mode.
- [ ] Samsung Internet: same pass (this browser is why WebGL2-not-WebGPU is
      the baseline later — keep it in the QA loop from phase 1).
- [ ] Run the UI QA checklist from `04-ui-canvas.md` §4 on the deployed URL.

## 4. Out of scope for phase 1

Update-available toast, background sync, cache size budgeting, WebGL2 asset
caching (M3), multiple level packs. Note them in issues, don't build them.
