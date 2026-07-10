# NF01 — Phase 1 Prototype Plan: Overview

> Phase 1 implements the MVP defined in
> [`reference-nanofab-design-plan.md`](reference-nanofab-design-plan.md)
> ("Staged development roadmap → MVP"): **the Layer 1 device puzzle only**,
> plus everything needed to make it a real, shippable product — engine, Canvas
> 2D UI, JSON levels, offline PWA shell, and the GitHub Pages deploy pipeline.

## Goal

A player on a Galaxy Tab S8 (or any browser) can install NanoFab as a PWA,
play 6 device-physics puzzle levels fully offline, and learn — with real
numbers — why leakage rises when gates shrink, why 60 mV/dec is a wall, what
DIBL is, and why the industry moved planar → FinFET → GAA.

## Scope

**In scope (phase 1):**

| # | Work package | Plan document |
|---|---|---|
| 1 | Toolchain & repo scaffold (done at setup) | [`01-toolchain-and-repo.md`](01-toolchain-and-repo.md) |
| 2 | Compact device physics model (`src/physics/device.ts`) | [`02-device-physics-model.md`](02-device-physics-model.md) |
| 3 | Engine: level schema, validation, scoring, save/load | [`03-engine-levels-scoring.md`](03-engine-levels-scoring.md) |
| 4 | Canvas 2D UI: sliders, Id–Vg plot, level flow, codex panel | [`04-ui-canvas.md`](04-ui-canvas.md) |
| 5 | PWA shell (offline precache) + GitHub Pages deploy | [`05-pwa-and-deploy.md`](05-pwa-and-deploy.md) |
| 6 | 6 authored levels + explain-the-physics text | [`03-engine-levels-scoring.md`](03-engine-levels-scoring.md) §Levels |

**Explicitly out of scope (later milestones, per the reference plan):**
Monte-Carlo variability (M2), Layer 2 interconnect/Elmore (M2), Layer 3
lithography/FFT (M3), Layer 4 stage/yield (M4), WebGL2/WebGPU anything,
sandbox/DTCO campaign, audio, accounts/leaderboards.

## Test-driven workflow (applies to every work package)

Every model and engine module follows the same loop:

1. **Red** — write the test first, from the spec tables in these documents.
   Tests live in `tests/`, mirroring `src/` (e.g. `tests/physics/device.test.ts`).
2. **Green** — implement the minimum in `src/` to pass. Physics modules are
   pure functions of plain data: no DOM, no canvas, no state, no `Date`/RNG
   (RNG is injected where needed later).
3. **Refactor** — clean up with tests green. Then commit; every commit must
   pass `npm test` and `npm run build` (typecheck).

Three kinds of tests, in order of preference:

- **Anchor tests** — assert a physically known value or limit (e.g. SS → 59.6
  mV/dec at 300 K for a long channel; these encode the *fidelity rule*).
- **Property/trend tests** — assert monotonicity and ordering (e.g. shrinking
  gate length must increase DIBL; GAA must beat FinFET must beat planar at
  identical dimensions). These pin the physics *shape* without over-fitting
  constants.
- **Golden-curve tests** — after a model first goes green and its constants
  are calibrated (per the calibration tables in `02-…md`), commit a JSON
  fixture of full curves in `tests/fixtures/` and snapshot-compare against it
  (relative tolerance 1e-9). These freeze behavior for refactors. When a model
  changes *deliberately*, regenerate fixtures in the same commit and say so in
  the commit message.

UI is kept thin enough that it doesn't need DOM tests in phase 1: all layout
math, formatting, and interaction logic is factored into pure helpers and unit
tested; canvas/pointer glue is verified by the manual on-device checklist in
`04-ui-canvas.md`.

## Suggested implementation order

Dependencies point left → right; each task is sized for one focused session.

```
NF1-1 device electrostatics  ─┐
NF1-2 device I–V + leakage   ─┼─→ NF1-4 engine: levels + scoring ─→ NF1-6 UI: level flow
NF1-3 device metrics         ─┘        NF1-5 levels l1-01…06     ─→ NF1-7 PWA offline
                                                                  ─→ NF1-8 deploy + on-device QA
```

Task-by-task checklist with red/green steps: [`06-task-checklist.md`](06-task-checklist.md).

## Definition of done (phase 1)

- [ ] `npm test` green; device physics and engine fully covered by anchor,
      property, and golden-curve tests.
- [ ] `npm run build` produces a static `dist/` with zero type errors and no
      runtime dependencies.
- [ ] 6 levels playable start-to-finish with touch only; each has working
      targets, star scoring, and an "explain the physics" panel citing its
      real-world anchor.
- [ ] Progress persists across reloads (localStorage), versioned save format.
- [ ] PWA: installable; after first load, full gameplay with network disabled
      (verified via DevTools offline and on-device airplane mode).
- [ ] Push to `main` auto-deploys to GitHub Pages via Actions (test → build →
      publish), and the deployed app passes the same offline check.
- [ ] Every physics function carries a fidelity comment citing the real value
      or trend it targets (CLAUDE.md fidelity rule).
