# NF03-01 — The Learning Journey: Kinematics → Electromagnetism → EUV

## 1. Learner model

The target player (and our real playtester) is comfortable with:

- **Kinematics**: position, velocity, acceleration, jerk; trajectories.
- **Some kinetics**: F = ma, momentum, energy, springs, damping, resonance.

They are *not* assumed to know: charge, fields, potential, band diagrams,
wave optics, quantum effects. Phase 1 assumed all of that implicitly — that's
why it didn't teach.

**Strategy: run the whole journey on mechanical rails.** Every chapter
introduces exactly one genuinely new idea, always entered through a mechanical
isomorph the player already owns, exercised by direct manipulation, and only
then formalized (the graph appears *after* the intuition, as a supporting
inset).

## 2. The bridge map (mechanics ↔ electromagnetism)

This table is the backbone of the curriculum. Left column = what the player
knows; middle = the mapping; right = where it breaks (taught explicitly —
broken analogies create the deepest understanding when the break is staged,
not discovered by confusion).

| Mechanics (owned) | EM concept (new) | Mapping | Where it breaks |
|---|---|---|---|
| Uniform gravity g; projectile arcs | Uniform E field acting on charge | F = qE like F = mg ⇒ same parabolic kinematics; "charge-to-mass ratio" sets the arc | Sign: charge comes in two polarities; fields can repel |
| Height h, ramp, mgh | Electric potential V, qV | Energy landscape: potential *is* a terrain; a barrier *is* a hill | Potential landscapes are shaped by charges themselves (feedback) |
| Ball rolling over a hill: needs ½mv² ≥ mgΔh | Carrier crossing the gate barrier | Boltzmann tail = "how many balls in a warm crowd are fast enough" ⇒ subthreshold slope, 60 mV/dec | **Tunneling: the ball sometimes appears on the far side of a hill it cannot climb.** Staged as the "mechanics ends here" event of the game |
| Water-surface ripples, superposition | Light as a wave; interference, diffraction | Two-slit ripples → why features below ~λ/2 can't be printed → Rayleigh CD = k₁λ/NA | Light needs no medium; wavelength is fixed by the source (13.5 nm EUV) |
| Raindrops on pavement (discrete arrivals) | Photons; shot noise | Few drops ⇒ patchy wetness; few photons ⇒ ragged printed edges (Poisson) | Photon energy is quantized: each EUV photon is a 92 eV hammer blow |
| Springs, damping, resonance, jerk-limited motion profiles | The EUV scanner wafer stage | **No bridge needed — this IS mechanics.** 5 g accelerations, sub-nm settling, jerk vs. throughput | — (this chapter is the player's victory lap on home turf) |
| Sandcastle building, erosion, filling, sanding | Fab process steps (deposit, etch, CMP) | Morphological intuition: conformal deposition = snowfall, anisotropic etch = sandblasting from above, CMP = sanding flat | Selectivity: chemistry lets you erode one material and not another |

## 3. Chapter arc

Six chapters. Each has: an *arena* (the 3D/2.5D scene type), a *new concept*,
its *mechanical entry point*, and a *payoff* that visibly advances the goal
stated on the box: **understand how chips are made, down to the EUV machine.**

1. **Ch1 — Motion & Charge** (arena: particle chamber).
   New: charge, E field. Entry: launch particles through field regions —
   projectile kinematics with q/m instead of g. Payoff: you can steer
   electrons; this is how an implanter aims dopants and how a plasma flings
   tin ions at mirrors.

2. **Ch2 — Hills & Barriers** (arena: energy-landscape terrain = the
   transistor, re-staged from phase 1). New: potential, barriers, thermal
   crowds, leakage; the tunneling break. Entry: drag the terrain itself (the
   barrier IS the gate voltage); watch a crowd of thermal "balls" spill over.
   Payoff: the phase-1 Id–Vg curve is *re-derived by the player* — the graph
   inset now merely records what they can already see happening. All six
   phase-1 levels return here as terrain puzzles.

3. **Ch3 — Waves & Light** (arena: ripple tank → optical bench).
   New: interference, diffraction, resolution. Entry: poke a virtual water
   surface, then swap water for light. Payoff: the player *measures* the
   diffraction limit and derives why EUV needs λ = 13.5 nm and mirrors, not
   lenses.

4. **Ch4 — Counting Photons** (arena: resist surface under exposure).
   New: quantization, Poisson statistics, dose vs. stochastic defects (the
   RLS triangle). Entry: rain discrete photons on resist, scrub dose up/down,
   watch edges roughen and bridges form. Payoff: the industry's actual
   #1 patterning problem, felt in the hands.

5. **Ch5 — The Machine** (arena: scanner cutaway: source, mirrors, stage).
   New concept: none — this is kinematics and kinetics, the player's home
   field, applied at heroic scale. Entry: shape jerk-limited S-curve motion
   profiles by dragging trajectory handles; tune a settling servo; sync the
   4× reticle stage. Payoff: throughput vs. overlay — wafers/hour is money.

6. **Ch6 — The Fab** (arena: the full 3D wafer + process timeline).
   New: process integration (deposit/expose/etch/implant/CMP as puzzle
   pieces). Entry: sandcastle morphology. Payoff: **build a working GAA
   transistor from blank silicon in ~12 steps**, then run yield. Everything
   from Ch1–Ch5 is a tool here: implant aiming (Ch1), barrier design (Ch2),
   printable masks (Ch3), dose choice (Ch4), throughput cost (Ch5).

Chapter 6 is also the sandbox: free process play on a blank wafer.

## 4. The tutor loop (how levels trigger learning)

Every level follows the same five-beat loop. The level JSON v2 encodes beats
2–4 declaratively (see `02-interaction-model.md` §4).

1. **Hook** — the scene shows a concrete situation, no numbers ("these
   electrons need to land in the drain region").
2. **Predict** — the player commits: sketch the trajectory with a finger,
   place a marker where the beam will land, pick which of three etched
   profiles will result. No simulation yet. Predictions are cheap, fast, and
   *always* answerable from the previous chapter's knowledge plus a guess.
3. **Reveal** — the simulation runs; the player's prediction stays on screen,
   ghosted, next to reality. The gap is the lesson. Prediction accuracy earns
   "insight" points (separate from level stars — being wrong is informative,
   not punished, but a *streak* of good predictions is rewarded).
4. **Play** — open-ended manipulation until the level target is met (the
   phase-1 target/star machinery, unchanged underneath).
5. **Formalize** — the explain panel + the supporting graph inset, now
   *annotated with the player's own data points* ("the arc you drew at
   prediction time corresponds to this point on the curve"). Codex entry
   unlocks with the real-world numbers.

### Misconception probes

Chapters 2 and 4 include one level each whose *expected* prediction is the
classic misconception (e.g. "double the barrier height ⇒ half the current" —
reality: exponentially less; "double the dose ⇒ double the roughness" —
reality: √2 less). These levels exist to be predicted wrong; the reveal beat
carries the teaching load. Marked `probe: true` in level data so the insight
scoring doesn't penalize them.

## 5. Mastery model (replaces bare stars-per-level)

- Concept nodes (≈ 18): `charge-force`, `field-map`, `potential-terrain`,
  `boltzmann-tail`, `tunneling`, `superposition`, `diffraction-limit`,
  `photon-shot-noise`, `rls-triangle`, `scurve-motion`, `settling`,
  `deposition`, `etch-anisotropy`, `implant`, `cmp`, `masking`, `overlay`,
  `yield`.
- Each level declares which nodes it exercises. Node mastery = f(level stars,
  prediction accuracy on that node's levels). Chapter gates unlock on node
  mastery, not raw level completion (finishing by flailing doesn't unlock).
- The codex becomes a **field notebook**: per-node page with the player's own
  prediction-vs-reality snapshots embedded next to the real-world numbers.
  (Snapshots = serialized scene thumbnails, stored in the save.)

## 6. What phase-1 content becomes

| Phase-1 asset | NF03 fate |
|---|---|
| `physics/device.ts` + tests | Unchanged; drives Ch2 scoring and the Ch2 inset curves |
| Levels l1-01…06 | Re-staged as Ch2 terrain levels (same targets/solutions/S3 tests; new scene + interactions) |
| Codex entries | Absorbed into field-notebook nodes |
| Slider/plot UI | Plot becomes the inset-graph component; sliders demoted to the fine-tune drawer |
| Engine scoring/progress | Kept; extended (schema v2, save migration v1→v2) |
