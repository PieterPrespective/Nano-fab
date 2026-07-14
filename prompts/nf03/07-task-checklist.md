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
- [x] e2e: per-scene screenshots + render assertions (landed with NF3-7's
      scene shells): every scene is screenshotted and asserted non-blank via
      pixel variance; strict pixel goldens deliberately skipped (dpr/AA
      drift across environments makes them flaky — variance + eyeballed
      screenshots caught every real regression so far, incl. the blank
      first-frame and black-canvas bugs).

## NF3-4 — Interaction layer (pure core ✅; scene bindings land with scenes)

- [x] Snapshot-based `engine/undo.ts` (immutable states make command
      inversion trivial) — history/redo-branch/capacity tests.
- [x] Prediction scorers `ui/predict.ts` (arclength resample + sketch/mark/
      choose) with monotone-deviation and tolerance-band tests.
- [ ] Per-scene tool bindings, fine-tune drawer, probe inspector, palette,
      e2e multi-touch helpers — with the scene runtimes (NF3-6+), where the
      objects the verbs act on first exist.

## NF3-5 — Tutor & mastery ✅ (notebook screens land with NF3-11 polish)

- [x] `ui/tutor.ts` beat sequencing (intro→predict→reveal→play→formalize,
      skip-never-gates, reveal-once score freezing, ghost persistence) —
      state-machine tests.
- [x] `ui/mastery.ts` chapter gates: unlock via understanding (node-mastery
      EMA ≥ 0.35) OR completion (all prev-chapter levels cleared) — both
      paths tested.

## NF3-6 — Ch1 Motion & Charge

- [x] `physics/em.ts` (Coulomb superposition, potentialAt with E=−∇V check,
      RK4; energy-conservation and exact-parabola anchor tests — the Ch1
      kinematics bridge verified to closed form).
- [x] Particle-chamber scene model (`scene/chamber.ts`, pure: setup
      parsing, obstacle absorption, energy windows, polarity, placement
      budget) + canvas runtime with slingshot launch, charge placement,
      long-press field probe, prediction sketch/mark input, reveal ghosts.
- [x] Levels c1-01…04 (projectile bridge → polarity → superposition
      steering → the implanter with an energy window) + solver-verified
      solutions + S3 content tests (incl. lazy-wrong-answer checks).
- [x] Chapter shell (`ui/shell.ts`): chapter map with mastery gates,
      per-chapter level lists, legacy device-lab hand-off (strangler).
- [x] Chapter e2e happy path: real click-through + drag-sketch prediction,
      clear with 3★, mastery persisted, offline reload, legacy path.

## NF3-7 — Ch2 Hills & Barriers (dimension ladder + the re-stage) ✅

- [x] `physics/em.ts` gains `potentialAt` (landed in NF3-6); new
      `physics/contours.ts`: marching squares with segment chaining,
      bilinear grid sampling/gradients, steepest-descent (gradient-flow)
      paths. Goldens: point-charge rings are circles ±2%, equal-ΔV shell
      spacing = ΔV/E (∝ r², measured 4×±15% per doubling), plate pair gives
      straight evenly-spaced lines, descent curves along −∇V on an
      anisotropic bowl (not the chord).
- [x] Prologue levels c2-01…03 (`scalar-field-gradient`): P1 heightmap with
      watershed decoy (balls roll gradient flow; sketch prediction), P2
      charged sphere in a box with cut plane + probe (mark prediction), P3
      strained-Si rank-2 slab (choose probe; σ̿ response leaves E unless on
      a principal axis). Pure model in `scene/fieldlab.ts` (new `field-lab`
      scene type + metric namespace); runtime `ui/scenes/fieldScene.ts`.
- [x] `physics/terrain.ts`: barrier (Vth−Vg)/n with DIBL sag, band profile,
      seeded flux-weighted crowd (crossing fraction exp(−Eb/kT)), analytic
      arrival rate; subthreshold rate ratios match drainCurrent ±10%.
- [x] Energy-terrain scene (`scene/terrainlab.ts` pure +
      `ui/scenes/terrainScene.ts`): grab the hilltop (Vg), drain ledge
      (Vds), hill base (gate length); thermal ball crowd with honest meters
      (crowd pace cube-root compressed, labeled; Id/barrier/targets exact);
      Id–Vg inset. Levels c2-04…10 re-stage l1-01…06 with v1 targets
      verbatim + c2-06 "shells around the drain" (DIBL as ≥2-D geometry).
      S3 proves the ORIGINAL v1 solutions win the re-stages unmodified.
- [x] Delete v1-only shell paths (strangler step 3): `ui/app.ts`,
      `ui/layout.ts` and the legacy chapter-map card are gone; l1-*.json +
      engine/levels.ts remain as the v1 fixture set and the shared
      controls/params machinery.

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
