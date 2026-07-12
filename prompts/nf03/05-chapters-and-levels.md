# NF03-05 — Chapters & Levels (Ch1–Ch6)

Concrete level designs. Format per level: **arena / interaction / predict /
target / anchor**. Physics modules referenced here are specified in
`06-architecture-refactor.md` §3. Ch6 levels live in `04-process-puzzles.md` §3.

## Ch1 — Motion & Charge (arena: particle chamber, 2.5D)

New module `physics/em.ts`: point charges (Coulomb), uniform field regions,
`fieldAt(p)`, RK4 `integrateTrajectory(q, m, x0, v0, fields, dt)` — all pure;
anchors: F = qE; electron q/m = 1.76×10¹¹ C/kg ("fields move electrons like
gravity moves planets, but 10²⁰× harder per kilogram").

1. **Gravity, but sideways** — uniform E region between two plates; slingshot-
   launch an electron to hit a target. *Predict:* sketch the arc. It's a
   projectile problem — deliberately trivial for this player, cementing the
   bridge. *Anchor:* CRT/oscilloscope deflection.
2. **Two polarities** — same, but the player flips the charge sign and places
   the plates themselves. *Predict:* mark the landing point after sign flip.
3. **Field hockey** — place up to 4 fixed charges to steer a stream through a
   maze onto a target (Coulomb superposition felt by hand). *Probe* shows the
   local field vector.
4. **The implanter** — steer a dopant ion beam through aperture + deflection
   plates into a marked wafer region at a required landing *energy* window
   (kinetics!). *Anchor:* real ion implanters: keV–MeV beams, tilt to dodge
   channeling. Direct setup for Ch6 implant op.

Mastery nodes: `charge-force`, `field-map`.

## Ch2 — Hills & Barriers (arena: energy terrain; the transistor re-staged)

The scene is a 3D terrain strip = conduction-band edge along
source–channel–drain. **The terrain IS the device**: barrier height tracks
gate voltage, drain side tilts with Vds, DIBL visibly erodes the hilltop as
Vds rises. A crowd of thermal balls (Maxwell-Boltzmann speeds, ~200 of them)
jitters at the source; those that crest the hill rain into the drain — the
drain current is literally the ball arrival rate. `physics/terrain.ts` maps
`DeviceParams` + biases → terrain profile using the *existing device model's*
electrostatics (no new physics, a new view).

1. **Roll over the hill** — drag the hilltop down (= raise Vg), watch arrival
   rate explode. *Predict (probe level):* "half the barrier ⇒ ?× the balls"
   — reveal: it's exponential (the Boltzmann tail counted live on screen).
   The Id–Vg inset unlocks *after*, annotated at the player's barrier
   heights. *Anchor:* 59.6 mV/dec = kT/q·ln10.
2. **The drain is bullying again** — player only controls Vds tilt; watch the
   hilltop sag (DIBL) and leakage rise at Vg = 0. Fix by choosing
   architecture: wrap the terrain walls (planar→FinFET→GAA shown as the
   channel trench getting gated on more sides, narrowing how much the drain
   field reaches in). Re-stage of l1-04.
3. **The wall you cannot beat** (l1-03 re-staged) — try to make the ball
   crowd switch off faster than 60 mV/dec by any terrain shaping; fail;
   codex moment.
4. **The ball that cheats** — thin the gate-oxide floor; balls occasionally
   *appear through* the barrier wall (tunneling, staged as the deliberate
   "mechanics ends here" event; screen flash + notebook entry). Gate leakage
   inset. Re-stage of l1-02. *Anchor:* direct tunneling ~10×/0.25 nm.
5.–6. **Re-stage l1-01, l1-05, l1-06** as terrain + geometry-drag levels
   (grab gate length in a mini cross-section; stack sheets by dragging copies)
   with the original targets/solutions (S3 tests carry over verbatim).

Mastery nodes: `potential-terrain`, `boltzmann-tail`, `tunneling`.

## Ch3 — Waves & Light (arena: ripple tank → optical bench)

New module `physics/waves.ts`: 2-D scalar interference from N coherent point
sources (closed-form sum, no FFT needed at this stage), single-slit/double-
slit envelopes, `aerialImage1D(maskEdges, λ, NA, defocus)` via Gaussian-PSF
convolution (the nf01 M3 baseline, promoted).

1. **Two pokes** — tap the water surface in two places; standing interference
   fringes appear. *Predict:* mark where the water stays calm. *Anchor:*
   superposition.
2. **Light is the same ripple** — same scene, λ slider replaced by a *source
   picker* (green 550 nm / DUV 193 nm / EUV 13.5 nm — fixed real choices, not
   a continuum); fringes rescale. Measure fringe spacing with a drag-ruler.
3. **The blur limit** — print a 1-D mask (drag its edges) through each
   source; watch the aerial image blur kill small gaps. Find the smallest
   printable pitch per λ. *Predict:* which of 3 patterns survives at 193 nm.
   *Anchor:* CD = k₁·λ/NA; why the industry went to 13.5 nm.
4. **Mirrors only** — interlude level: try to focus EUV with a lens — the
   beam is absorbed (everything absorbs EUV); switch to Mo/Si mirrors at ~70%
   reflectivity each and count photons surviving 10 bounces (≈ 3%). Sets up
   Ch4's photon scarcity and Ch5's machine. *Anchor:* multilayer mirrors,
   ~0.7¹⁰.

Mastery nodes: `superposition`, `diffraction-limit`.

## Ch4 — Counting Photons (arena: resist surface under exposure)

`physics/stochastic.ts`: Poisson-sampled photon field on a grid (seeded RNG
injected — pure), resist blur, threshold; defect counting
(bridge/break detection via connected components — pure & tested).

1. **Raindrops** — scrub exposure time; discrete photon hits accumulate on
   the resist grid; low dose = patchy coverage. *Predict:* how many drops to
   cover 95%? (Everyone under-guesses; Poisson tails teach.)
2. **The ragged edge** — print a line at scrubbed dose; edge roughness vs.
   dose shown as the *scene* (bumpy printed line in 3D), LER value as inset.
   *Probe level:* "double the dose ⇒ roughness halves?" Reveal: √2. *Anchor:*
   LER ∝ 1/√dose; EUV has ~14× fewer photons than ArF at equal energy.
3. **Bridge and break** — find the minimum dose where a comb pattern prints
   with zero stochastic defects across 20 seeded trials; throughput meter
   (wafers/hour, from dose) drops as dose rises. The RLS triangle as a lived
   trade-off. *Anchor:* stochastic defects are EUV's #1 patterning problem.

Mastery nodes: `photon-shot-noise`, `rls-triangle`.

## Ch5 — The Machine (arena: scanner cutaway; the kinematics victory lap)

`physics/stage.ts` finally implemented: jerk-limited S-curve profile
generator (bounded j, a, v), 2nd-order damped settling response, move+settle
time, overlay error during exposure window. All closed-form/ODE, pure,
golden-tested. *Anchors:* ~5 g stage acceleration, sub-nm settling, dual
stage, 4× (anamorphic 8×) reticle sync, ~60 pm metrology.

1. **The profile is yours** — drag acceleration-profile handles (trapezoid →
   S-curve) to move the stage one field pitch. Aggressive jerk excites a
   visible ringing (the wafer table wobbles in 3D); exposure can't start
   until residual < overlay budget. Score: move+settle time. *Predict:*
   which of two profiles settles first (the gentler one wins — counter-
   intuitive for speed-minded players).
2. **Resonance hunt** — the table has a hidden resonance; find it by feel
   (excite, watch ring-down), then shape jerk to avoid exciting it.
   Pure mechanics joy.
3. **Two dancers** — sync the reticle stage at exactly 4× wafer-stage
   velocity during the scan window; error shows as image smear on the die.
4. **Wafers per hour (boss)** — full step-and-scan across 9 fields balancing
   jerk, settle, dose (Ch4), overlay. Score in wafers/hour and money.
   *Anchor:* EXE:5200B ≈ $380 M, 175 wph @ 50 mJ/cm² — the machine must never
   idle.

Mastery nodes: `scurve-motion`, `settling`, `overlay`.

## Ch6 — The Fab

See `04-process-puzzles.md` §3 (9 levels + sandbox). Mastery nodes:
`deposition`, `etch-anisotropy`, `implant`, `cmp`, `masking`, `yield`.

## Content-test contract (extends phase-1 S3)

For every level: recorded solution wins (≥1 star) from init state; init state
does not win; every prediction has a scorer fixture; every mastery node
referenced exists; every chapter gate is reachable with ≤ the levels in that
chapter (no dead locks). For Ch6 additionally: documented wrong-order recipe
fails (order-sensitivity), golden-recipe extraction feeds device metrics
within tolerance.
