# NF03 — Refactor Plan: From Graphs to a Fab You Can Touch

> Phase-1 (nf01) shipped a working, offline, physics-faithful prototype — and
> playtesting surfaced its core weakness: **it doesn't trigger learning.** The
> player drags a slider until a number turns green. The graph is the game; the
> physics stays invisible. This plan is the response to that feedback.

## The three findings from playtesting (verbatim intent)

1. **"The game doesn't really trigger learning. My experience is kinematics —
   velocity, acceleration, maybe some kinetics. Guide me from there to
   electromagnetism and on to understanding EUV."**
   → NanoFab must become a *guided learning journey* that starts from
   mechanical intuition (motion, forces, energy, hills) and builds a bridge,
   chapter by chapter, to fields, potentials, waves, photons, and finally the
   EUV machine — which is itself a giant kinematics puzzle (jerk-limited
   stages), landing the player back on home turf.

2. **"More input than just a slider."**
   → Direct manipulation becomes the primary input: place charges, launch
   particles, draw masks, drag energy hills, stack process steps, scrub time,
   cut cross-sections. Sliders survive only as secondary fine-tuning.

3. **"A 3D representation over time of chip production I can puzzle with,
   supported by graphs rather than focused on graphs."**
   → The centerpiece becomes a 3D wafer that evolves through process steps on
   a scrubbing timeline. The player *builds* structures (ultimately a
   transistor) by choosing, ordering, and parameterizing process steps.
   Graphs shrink into contextual inset panels that support the scene.

## What this is (and isn't)

This is a **refactor of the game design and presentation layer** on top of the
phase-1 foundation — not a rewrite. The physics modules, engine discipline
(pure + test-first), level-as-data philosophy, PWA/deploy pipeline, and the
Tab S8 hard constraints all carry over unchanged. The device model from
phase 1 becomes the *scoring engine behind* Chapter 2 rather than the whole
game.

## Plan documents

| Doc | Contents |
|---|---|
| [`01-learning-journey.md`](01-learning-journey.md) | The pedagogy: learner model (kinematics-first), the mechanics→EM bridge map, chapter arc, predict-then-observe tutor loop |
| [`02-interaction-model.md`](02-interaction-model.md) | Direct-manipulation verbs, tool palette, gesture layer, level schema v2 interaction declarations |
| [`03-wafer3d-and-time.md`](03-wafer3d-and-time.md) | The 3D wafer data model (column stacks), process timeline + scrubbing, minimal WebGL2 renderer, perf budget, TDD strategy |
| [`04-process-puzzles.md`](04-process-puzzles.md) | Process-step physics ops (deposit/expose/etch/implant/CMP…), the build-a-structure puzzle format, scoring |
| [`05-chapters-and-levels.md`](05-chapters-and-levels.md) | Concrete chapter/level designs Ch1–Ch6 with interactions, win conditions, and real-world anchors |
| [`06-architecture-refactor.md`](06-architecture-refactor.md) | Code-level plan: what stays / what's new, module layout, schema & save migration, bundle/perf budgets |
| [`07-task-checklist.md`](07-task-checklist.md) | TDD execution order NF3-0 … NF3-11 with red/green steps and the risk register |

## Design principles (added to CLAUDE.md when implementation starts)

1. **Scene first, graphs second.** The primary view is always a *place* — a
   wafer, a vacuum chamber, an energy landscape — never a chart. Charts appear
   as pinnable insets that explain what the scene just did.
2. **Meet the player on mechanical ground.** Every new EM concept is
   introduced through a mechanical isomorph the player already owns
   (field ↔ acceleration field, potential ↔ height, photon arrivals ↔
   raindrops), and the *one place the analogy breaks* (tunneling) is staged as
   a deliberate "mechanics ends here" moment.
3. **Predict before reveal.** The strongest learning trigger we have: the
   player commits to a prediction (sketch a trajectory, mark where the beam
   lands, guess the etched profile) *before* the simulation runs. The gap
   between prediction and outcome is the lesson — and part of the score.
4. **Hands on the objects.** If a value can be changed by grabbing something
   in the scene, it must not be a slider.
5. **Same fidelity rule as phase 1.** Every model cites its real anchor;
   simplifications are stated in-game.

## Hard constraints (unchanged from phase 1)

Offline-first installable PWA; no backend; Galaxy Tab S8 (Adreno 730) is the
performance target; WebGL2 baseline (WebGPU only behind feature detection);
touch-first; vanilla strict TypeScript; physics pure and test-first; levels
and chapters as JSON data.

## Definition of done (NF03)

- [ ] Chapters 1–6 playable start to finish, offline, on the Tab S8.
- [ ] Every level's primary interaction is direct manipulation (place / drag /
      draw / launch / scrub / cut); zero levels where a slider is the only input.
- [ ] The 3D wafer view holds ≥ 30 fps on-device while scrubbing a 12-step
      process timeline at grid 96×96 (stretch: 60 fps / 128×128).
- [ ] Predict-then-observe implemented and used in ≥ 60% of levels; prediction
      accuracy tracked in the mastery model.
- [ ] Phase-1 device levels re-staged as Chapter 2 scenes (energy-landscape
      view); no regression in the phase-1 physics test suite.
- [ ] All new physics/geometry modules pure and test-first; e2e screenshot
      suite green; save-format migration v1→v2 covered by tests.
- [ ] Deployed to Pages; on-device QA checklist passed in Chrome + Samsung
      Internet.
