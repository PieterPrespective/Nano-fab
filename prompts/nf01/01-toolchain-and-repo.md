# NF01-01 — Toolchain & Repo Scaffold

Status: **done** (created during repo setup). This document records what exists
and why, so later tasks don't re-litigate it.

## Stack decisions (from the reference plan)

- **Vanilla TypeScript, strict mode** — no frameworks, zero runtime
  dependencies. Dev dependencies only: `typescript`, `vite`, `vitest`.
- **Vite** — dev server + static production build to `dist/`.
- **Vitest** — unit tests; config lives in `vite.config.ts` (`test` block),
  tests in `tests/**/*.test.ts`, environment `node` (physics/engine are pure,
  no DOM needed; that is a design constraint, not a limitation).
- **Canvas 2D** for all phase-1 rendering. WebGL2/WebGPU arrive with Layer 3.

## Repository layout

```
/src
  main.ts          # entry: mounts UI, registers service worker (prod only)
  /engine          # game loop, state, level loading/scoring, save/load
  /physics
    device.ts      # Layer 1 compact transistor + leakage models  ← phase 1
    interconnect.ts# Layer 2 (M2 placeholder)
    /litho         # Layer 3 (M3 placeholder)
    stage.ts       # Layer 4 motion (M4 placeholder)
    yield.ts       # Layer 4 yield (M4 placeholder)
  /render          # Canvas2D plot + panel renderers
  /ui              # panels, sliders, codex, level select
  /levels          # *.json level definitions (data, not code)
  /pwa             # PWA notes; actual sw.js + manifest live in /public
/public
  manifest.webmanifest
  sw.js            # service worker (upgraded to precache in NF1-7)
/tests             # mirrors /src; golden fixtures in tests/fixtures/
/prompts/nf01      # this plan + reference design document
CLAUDE.md          # contributor rules (constraints, conventions, fidelity rule)
vite.config.ts     # base '/Nano-fab/' for Pages (override with VITE_BASE)
.github/workflows/deploy.yml  # CI: test → build → deploy dist/ to Pages
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (service worker disabled in dev) |
| `npm test` | Vitest, single run — must be green before every commit |
| `npm run test:watch` | Vitest watch mode — the TDD inner loop |
| `npm run build` | `tsc --noEmit` typecheck, then production build |
| `npm run preview` | Serve the production build locally (PWA testing) |

## CI / deploy pipeline

`.github/workflows/deploy.yml`:

- On every push/PR: `npm ci` → `npm test` → `npm run build`.
- On push to `main` only: upload `dist/` and deploy to GitHub Pages
  (`actions/deploy-pages`, OIDC — no secrets needed).
- One-time manual step: in the GitHub repo settings, set
  **Settings → Pages → Source = "GitHub Actions"**.

## Conventions that tests enforce

- **SI units internally** (m, V, A, s, K). Display conversion (nm, mV/dec,
  µA/µm) happens only in `src/ui/format.ts`, which has its own unit tests.
  Every exported type field documents its unit in its name or doc comment
  (`gateLength_m`, `ss_VperDec`).
- **Physics purity**: nothing in `src/physics/` may import from `src/ui/`,
  `src/render/`, or `src/engine/`, nor touch `window`/`document`. (Enforced by
  review; a lint rule can be added later if it's ever violated.)
- **Fidelity rule**: every exported model function carries a doc comment citing
  the real-world number/trend it targets and naming its simplifications.
