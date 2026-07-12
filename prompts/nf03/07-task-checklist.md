# NF03-07 — Task Checklist (TDD order) & Risk Register

Same rules as nf01: red → green → refactor; no `src/` code before its failing
test; every commit passes `npm test` + `npm run build`. Order chosen to
retire the two big risks first (device GPU perf, gesture feel) before content
scales.

## NF3-0 — De-risk spike (timeboxed: 2 sessions) ✋ gate for everything below

- [ ] Throwaway branch: hand-rolled WebGL2 renderer drawing a greedy-meshed
      fixture wafer (96×96, transistor-ish) with orbit + clip plane + scrub
      uniform; deployed to Pages under `/spike/`.
- [ ] **On the Tab S8**: measure fps scrubbing + orbiting (Chrome & Samsung
      Internet). Record numbers in this file. Pass: ≥ 30 fps. Fail: retry at
      64×64; still failing ⇒ trigger the three.js escape hatch
      (`03-…md` §3) before any dependent work starts.
- [ ] Gesture feel probe: one-finger drag vs. two-finger orbit on-device;
      confirm no mode collisions with palms.

## NF3-1 — Foundations

- [ ] `physics/rng.ts` (seeded xorshift; distribution smoke tests).
- [ ] `ui/gestures.ts` pure state machine + the ~20-case suite (tap/drag/
      long-press/pinch/second-finger-mid-drag).
- [ ] Schema v2 parser (accepting v1) + validator rules, one failing fixture
      per rule; metric-registry plumbing.
- [ ] Save v2 + `migrateV1` (fixtures: v1 round-trip, upgrade, newer-version
      read-only).

## NF3-2 — Wafer & timeline core

- [ ] `scene/wafer.ts` column ops + morphology; property-fuzz invariants.
- [ ] `physics/process.ts` ops (spin/expose/develop/etch/deposit/implant/
      anneal/cmp/strip/thermalOxide) with golden fixtures each; the 12-step
      MOSFET + GAA golden recipes.
- [ ] `scene/timeline.ts` memoized runs + interpolators (t-grid goldens);
      bench guard < 50 ms.
- [ ] `scene/extract.ts` wafer→DeviceParams (5% tolerance vs. recipe intent).

## NF3-3 — Meshing & renderer

- [ ] `scene/mesher.ts` greedy meshing + clip capping (golden buffers,
      watertight invariant, tri-count bounds).
- [ ] `render3d/*`: program, palette, section shading, camera math
      (pure parts unit-tested; visuals via e2e screenshot goldens for the 4
      fixture wafers).
- [ ] e2e: scrub animation frames land within pixel tolerance.

## NF3-4 — Interaction layer

- [ ] Tool commands + undo inversion tests for all 8 verbs.
- [ ] Prediction scorers (sketch/mark/choose) with fixture scenes.
- [ ] Fine-tune drawer; probe inspector; palette; e2e multi-touch helpers.

## NF3-5 — Tutor & mastery

- [ ] `ui/tutor.ts` beat sequencing (predict→reveal gating, ghost overlay
      persistence) — state machine tests.
- [ ] `ui/mastery.ts` node graph, gate logic (no-dead-lock content test),
      insight scoring; notebook data model + snapshot serialization.

## NF3-6 — Ch1 Motion & Charge

- [ ] `physics/em.ts` (Coulomb superposition, RK4; energy-conservation and
      known-parabola anchor tests).
- [ ] Particle-chamber scene runtime; 4 levels + solutions + content tests;
      chapter e2e happy path.

## NF3-7 — Ch2 Hills & Barriers (the re-stage)

- [ ] `physics/terrain.ts` (terrain from device electrostatics; ball-crowd
      sampler with seeded RNG; arrival-rate ↔ drainCurrent consistency test
      ±10%).
- [ ] Energy-terrain scene; 6 levels re-staging l1-01…06 (v1 targets inside
      v2 wrappers; original S3 fixtures must pass unmodified).
- [ ] Delete v1-only shell paths once green (strangler step 3).

## NF3-8 — Ch3+Ch4 Waves & Photons

- [ ] `physics/waves.ts` (two-source fringe-spacing anchor test λL/d;
      aerial-image goldens), `physics/stochastic.ts` (Poisson mean/variance,
      LER ∝ 1/√dose test, defect counter on fixture grids).
- [ ] Ripple/optical + resist scenes; 3+3 levels + content tests.

## NF3-9 — Ch5 The Machine

- [ ] `physics/stage.ts` (S-curve generator respects j/a/v bounds —
      property test; settling ODE golden; move+settle monotonicity vs. jerk).
- [ ] Scanner scene (profile handles, ringing visual); 4 levels; boss scoring.

## NF3-10 — Ch6 The Fab

- [ ] Puzzle runtime (cards, budget, IoU metric, diff view); `physics/yield.ts`.
- [ ] 9 levels + sandbox; order-sensitivity content tests; device-extraction
      bridge level (#7) e2e.

## NF3-11 — Polish, migrate, ship

- [ ] Chapter map shell; notebook screens; CLAUDE.md rewrite; README refresh.
- [ ] Full e2e matrix (per-chapter happy paths, offline, save migration).
- [ ] Bundle/size CI guards; deploy; **on-device QA protocol** (fps, feel,
      Chrome + Samsung Internet, airplane mode); tag `v0.3.0`.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| GPU perf misses 30 fps on device | medium | NF3-0 spike is a hard gate; grid is a config constant; three.js escape hatch pre-decided |
| Gesture feel is bad (the make-or-break of "more than sliders") | medium | NF3-0 includes on-device feel probe; gesture machine is pure & heavily tested; feel-tuning constants (slop, thresholds) in one file |
| Scope explosion (6 chapters × content) | high | Chapters ship independently (each NF3-6…10 ends deployable); Ch3/Ch4 can merge to one "Light" chapter if the schedule slips — cut content, never quality gates |
| Column-stack model can't express a needed structure (e.g. true undercut cavity) | low-medium | Columns support interior air segments (cavities OK); genuinely re-entrant 3D (sideways tunnels) only appears in GAA release, which the model handles as segment removal; validated in NF3-2 goldens |
| Predict-then-observe feels like homework | low | Predictions are one gesture, never typed; probes are unpunished; insight streaks reward; can be disabled per-level via data if playtests say so |

## Session sizing

NF3-0…11 ≈ 14–18 focused sessions. Recommended checkpoint after **NF3-7**:
the game already fulfills feedback items 1+2 (guided journey through EM with
direct manipulation, phase-1 content re-staged) and is deployable — a natural
moment for the next playtest before the waves/machine/fab chapters build on
possibly-revised foundations.
