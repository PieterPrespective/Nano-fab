# NF03-07 — Task Checklist (TDD order) & Risk Register

Same rules as nf01: red → green → refactor; no `src/` code before its failing
test; every commit passes `npm test` + `npm run build`. Order chosen to
retire the two big risks first (device GPU perf, gesture feel) before content
scales.

## NF3-0 — De-risk spike (timeboxed: 2 sessions) ✋ gate for everything below

- [x] Hand-rolled WebGL2 renderer drawing a greedy-meshed
      fixture wafer (96×96, transistor-ish) with orbit + clip plane + scrub
      uniform; deployed to Pages at `/Nano-fab/spike.html` (source: `src/spike/`, marked throwaway).
- [x] **On the Tab S8**: measured 2026-07-13 — **consistently > 80 fps across
      all test cases** (64²/96²/128², scrubbing with per-frame remesh +
      orbiting). PASS with ~3× headroom ⇒ hand-rolled renderer validated,
      three.js escape hatch not needed. (Found & fixed en route: mobile GLSL
      rejects uniform-array indexing by flat varyings — palette now baked
      into vertex colors.)
- [x] Gesture feel probe: one-finger tool strips vs. two-finger orbit tested
      on-device during the fps runs; no mode collisions reported.

## NF3-1 — Foundations ✅

- [x] `physics/rng.ts` (seeded mulberry32 + normal/Poisson; distribution tests).
- [x] `ui/gestures.ts` pure state machine + suite (tap/drag/long-press/pinch/
      second-finger-mid-drag/pinch-survivor-continues-as-drag).
- [x] Schema v2 parser (accepting v1) + validator rules, one failing fixture
      per rule; metric-registry plumbing.
- [x] Save v2 + `migrateV1` (fixtures: v1 round-trip, upgrade, newer-version
      read-only) + mastery EMA and insight streaks.

## NF3-2 — Wafer & timeline core ✅

- [x] `scene/wafer.ts` column ops (implicit-air gaps = cavities for free);
      property-fuzz invariants over 200 random op applications.
- [x] `physics/process.ts` all 10 ops with behavior tests: litho heartbeat,
      wet-etch undercut (cavity under resist), PVD keyhole voids vs ALD fill,
      self-aligned implant blocking, damascene CMP, Deal-Grove 0.45× consume.
      Golden recipes: 16-step planar MOSFET (order-sensitivity proven: implant
      before gate dopes the channel) + GAA superlattice→release→wrap (the
      conformal fill closes around suspended sheets).
- [x] `scene/timeline.ts` prefix-memoized runs (object-identity test) +
      per-op scrub interpolators (monotone etch front, cmp plane lerp);
      bench guard.
- [x] `scene/extract.ts` wafer→DeviceParams: thinnest-dielectric gate
      detection, GAA sheet counting; planar recipe within 5% of intent and
      scored end-to-end by the phase-1 device physics.

## NF3-3 — Meshing & renderer ✅ (e2e screenshots deferred to NF3-7 shell)

- [x] `scene/mesher.ts` exposed-surface meshing over the SI WaferModel incl.
      cavity ceilings/floors + separate section mesh (x/y axis); hash-based
      golden fixtures, exact-count blank-wafer test, trench bounds, GAA
      cavity faces, palette bake, degenerate inputs.
- [x] `render3d/*`: palette module, pure orbit-camera math unit-tested
      (orthonormality, clip mapping, clamps), WaferRenderer GL glue derived
      from the >80 fps spike (dpr≤1.5 budget baked in).
- [ ] e2e: per-scene screenshot goldens + scrub pixel tolerance — lands with
      the first scene shell (NF3-7), which is the first page that renders.

## NF3-4 — Interaction layer (pure core ✅; scene bindings land with scenes)

- [x] Snapshot-based `engine/undo.ts` (immutable states make command
      inversion trivial) — history/redo-branch/capacity tests.
- [x] Prediction scorers `ui/predict.ts` (arclength resample + sketch/mark/
      choose) with monotone-deviation and tolerance-band tests.
- [ ] Per-scene tool bindings, fine-tune drawer, probe inspector, palette,
      e2e multi-touch helpers — with the scene runtimes (NF3-6+), where the
      objects the verbs act on first exist.

## NF3-5 — Tutor & mastery

- [ ] `ui/tutor.ts` beat sequencing (predict→reveal gating, ghost overlay
      persistence) — state machine tests.
- [ ] `ui/mastery.ts` node graph, gate logic (no-dead-lock content test),
      insight scoring; notebook data model + snapshot serialization.

## NF3-6 — Ch1 Motion & Charge

- [x] `physics/em.ts` (Coulomb superposition, potentialAt with E=−∇V check,
      RK4; energy-conservation and exact-parabola anchor tests — the Ch1
      kinematics bridge verified to closed form).
- [ ] Particle-chamber scene runtime; 4 levels + solutions + content tests;
      chapter e2e happy path.

## NF3-7 — Ch2 Hills & Barriers (dimension ladder + the re-stage)

- [ ] `physics/em.ts` gains `potentialAt`; `physics/contours.ts`
      (marching squares/cubes; goldens: point-charge rings are circles ± tol,
      shell spacing ∝ 1/r²; plate pair gives parallel planes).
- [ ] Prologue levels P1–P3 (`scalar-field-gradient` node): heightmap
      steepest-descent rolls (reuses em RK4), volume + cut-plane shells,
      strained-Si rank-2 sidebar. Prediction fixtures for P1 sketch/P2 mark.
- [ ] `physics/terrain.ts` (terrain from device electrostatics; ball-crowd
      sampler with seeded RNG; arrival-rate ↔ drainCurrent consistency test
      ±10%).
- [ ] Energy-terrain scene; 6 levels re-staging l1-01…06 plus the 2b
      "shells around the drain" DIBL-as-geometry level (v1 targets inside
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
