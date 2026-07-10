# NF01-06 — Phase 1 Task Checklist (TDD order)

Execution order for the whole phase. Every task follows red → green →
refactor; **no `src/` code lands before its failing test exists.** Every
commit passes `npm test` and `npm run build`.

## NF1-0 — Scaffold ✅ (done at repo setup)

Vite + strict TS + Vitest toolchain, directory layout, CLAUDE.md, CI workflow,
PWA placeholders, sanity test (`tests/scaffold.test.ts`).

## NF1-1 — Device electrostatics *(spec: 02 §3.1–3.2, tests E1–E8)*

- [x] Red: `tests/helpers/devices.ts` reference configs; `tests/physics/device.test.ts` E1–E7.
- [x] Green: `DeviceParams`/`Electrostatics` types, `electrostatics()`, `effectiveWidth()`.
- [x] Calibrate α_ss / α_dibl until E7 windows pass; add golden fixture (E8).
- [x] Fidelity doc comments (59.6 mV/dec, roadmap ordering, 18 nm @ "5nm").

## NF1-2 — Currents & leakage *(spec: 02 §3.3–3.4, tests C1–C9)*

- [x] Red: C1–C9.
- [x] Green: `drainCurrent()` (EKV-flavored, overflow-safe softplus), `gateLeakage()`, `gidl()`.
- [x] Calibrate J0/A_g/B_g to pass the C7 crossover ("why HKMG").

## NF1-3 — Metrics & curves *(spec: 02 §3.5, tests C10, T1–T3)*

- [x] Red: C10 + trade-off tests T1–T3.
- [x] Green: `deviceMetrics()`, `idVgCurve()`.
- [x] Generate + commit all golden fixtures (`tests/fixtures/device/`).

## NF1-4 — Engine *(spec: 03 §1–2, tests L1–L5, S1–S2, P1–P3)*

- [x] Red: level validation, scoring, progress suites (fake `ProgressStore`).
- [x] Green: `engine/levels.ts`, `engine/scoring.ts`, `engine/progress.ts`.

## NF1-5 — Levels *(spec: 03 §4, test S3)*

- [x] Red: S3 harness — every `src/levels/*.json` must parse, be solvable by
      its `solutions.json` sidecar, and score 0 stars at `init` values.
- [x] Green: author `l1-01.json` … `l1-06.json` + solutions + `codex.json`;
      tune targets until S3 passes with comfortable margins.
- [x] Explain-text review: each level cites its real anchor (fidelity rule).

## NF1-6 — UI *(spec: 04, pure-helper tests)*

- [x] Red: `format`, `plot` (ticks/project), `controls` (slider round-trip),
      `layout` (touch-target property test).
- [x] Green: pure helpers, then canvas glue: level select → play screen →
      result overlay → codex; wire recompute-on-drag.
- [x] Desktop smoke: play all 6 levels start to finish.

## NF1-7 — Offline PWA *(spec: 05 §2)*

- [x] Red: `tests/pwa/precache.test.ts` against a fixture dist tree.
- [x] Green: `scripts/inject-sw-precache.mjs`, real `sw.js` (versioned
      cache-first), manifest icons; `npm run build` wires the injection.
- [x] DevTools offline pass (05 §3 desktop checklist).

## NF1-8 — Deploy & release QA *(spec: 05 §3, 04 §4)*

- [ ] Enable Pages (Source = GitHub Actions); merge to `main`; verify deploy.
- [ ] Desktop + Tab S8 QA checklists all green (Chrome **and** Samsung Internet).
- [ ] Tag `v0.1.0`. Phase 1 done ⇔ every box in `00-overview.md` §Definition
      of done is checked.

## Standing rules

- Physics stays pure (no DOM imports in `src/physics/`, `src/engine/`).
- SI units internally; display conversion only in `ui/format.ts`.
- Golden fixtures regenerate only deliberately, in their own commit.
- If a level becomes unwinnable after a physics change, S3 catches it — fix
  the level data or the constants, never delete the test.
