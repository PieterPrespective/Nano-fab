# NF03-06 — Architecture Refactor & Migration

## 1. Keep / extend / new / demote

**Keep unchanged** (with their test suites):
- `src/physics/device.ts` — drives Ch2 + Ch6 device extraction.
- Engine target/star evaluation (`engine/scoring.ts`).
- PWA shell, SW precache pipeline, CI/deploy, e2e harness bones.
- `ui/format.ts`, `render/plot.ts` (plot becomes the inset-graph component).

**Extend:**
- `engine/levels.ts` → schema v2 (scene/tools/prediction/insets/cards), with
  v1 levels still parseable during migration (Ch2 re-stages carry v1 target
  blocks inside v2 wrappers).
- `engine/progress.ts` → save v2: adds mastery map, prediction history,
  notebook snapshots. `migrateV1(save) → v2` keeps stars/bestValues; tested
  (v1 fixture in, v2 out; newer-version protection logic unchanged).

**New modules:**

```
src/physics/
  em.ts           # charges, fields, RK4 trajectories            (Ch1)
  terrain.ts      # DeviceParams+bias → energy terrain; ball crowd (Ch2)
  waves.ts        # interference, 1D aerial image                (Ch3)
  stochastic.ts   # seeded Poisson exposure, LER, defect count   (Ch4)
  stage.ts        # S-curve profiles, settling, overlay          (Ch5) [stub exists]
  process.ts      # wafer column ops + timeline                  (Ch6)
  yield.ts        # Poisson/Murphy                               (Ch6) [stub exists]
src/scene/
  wafer.ts        # WaferModel, column edits, morphology
  timeline.ts     # runTimeline, memoization, interpolators
  mesher.ts       # greedy meshing + clip capping
  extract.ts      # wafer → DeviceParams bridge
src/render3d/
  gl.ts           # context, program, buffer helpers (thin)
  waferRenderer.ts# draw pass, palette, section shading
  camera.ts       # orbit/pan/zoom state (pure math + thin glue)
src/ui/
  gestures.ts     # PURE gesture state machine
  tools/*.ts      # the 8 verbs (pure command emitters + thin bindings)
  tutor.ts        # predict→reveal→formalize sequencing, insight scoring
  mastery.ts      # concept graph, node mastery, chapter gates
  notebook.ts     # field-notebook screens (replaces codex.ts UI; data kept)
  shell.ts        # chapter map / level flow (replaces app.ts select screen)
```

**Demote:** slider row → fine-tune drawer component; full-screen plot → inset.

RNG rule: any stochastic model takes an injected seeded generator
(xorshift128+, in `physics/rng.ts`) — replays and tests are deterministic;
level JSON pins seeds for fairness.

## 2. Level schema v2 (consolidated)

```jsonc
{
  "schema": 2,
  "id": "c4-03", "chapter": 4, "title": "...",
  "scene": { "type": "...", "setup": { } },
  "tools": ["..."],
  "prediction": { "kind": "sketch|mark|choose", "prompt": "...",
                  "scored": true, "conceptNodes": ["..."] },
  "cards": [ /* wafer3d only */ ], "budget": { },
  "targets": [ /* v1 machinery, metric names now per-scene-type */ ],
  "stars": { },
  "insets": [ { "kind": "...", "unlockOn": "reveal|clear|always" } ],
  "conceptNodes": ["..."], "explain": "...", "intro": "..."
}
```

Metric registry becomes pluggable: each scene type registers its metric
namespace (`device.*` = phase-1 DeviceMetrics; `wafer.structureIoU`;
`stage.moveSettle_s`; `litho.defectCount`; …). Validator checks
`targets[].metric` against the scene's registry — same path-precise error
style, same test pattern as phase 1 (one failing fixture per rule).

## 3. Migration plan (keeps the game shippable at every step)

1. **Dual-schema window**: parser accepts v1 and v2; old app shell keeps
   working on v1 levels until Ch2 re-stages land, then v1 parsing is deleted
   in one commit (test suite proves nothing references it).
2. **Save migration**: on load, v1 saves upgrade in memory; write-back only
   after the player clears anything (no gratuitous rewrites). Newer-version
   read-only protection carries over.
3. **Strangler shell**: `shell.ts` mounts either the old play screen (v1) or
   a scene runtime (v2) per level; screens are ported chapter by chapter;
   `app.ts` dies when the last v1 level is re-staged.
4. **CLAUDE.md update** in the same PR that lands NF3-0: new module map, the
   scene-first + predict-before-reveal principles, renderer decision record.

## 4. Budgets & platform rules

| Budget | Value | Enforced by |
|---|---|---|
| Bundle (total, gzip) | ≤ 120 kB (phase 1: 10 kB; 3D+scenes ≈ +45 kB; content grows the rest) | CI check on dist size |
| Level JSON total | ≤ 150 kB raw (targets stored as RLE'd column stacks) | content test |
| CPU: 12-step timeline re-run @96×96 | < 50 ms desktop CI | vitest bench guard |
| GPU frame while scrubbing | ≥ 30 fps device | NF3-0 spike + NF3-11 QA protocol |
| Cold boot to chapter map | < 2 s on device | QA protocol |

WebGL2 remains the baseline; nothing in NF03 requires WebGPU. FP16 texture
work only enters if/when the M3 FFT litho path lands (not in NF03 scope —
Ch3/Ch4 use the Gaussian-PSF + closed-form models on CPU grids ≤ 256²).

## 5. Testing pyramid (unchanged philosophy, new layers)

1. **Pure unit + golden**: all `physics/*`, `scene/*`, gesture machine, tool
   commands, prediction scorers, mastery math, migrations. Target: every
   NF03 bug class that bit us in phase 1 (first-frame flag, Vary/origin,
   token-in-comment) has a named regression test where applicable.
2. **Content tests**: the S3-family contract in `05-chapters-and-levels.md`.
3. **e2e (Playwright, existing harness)**: per-scene-type boot + screenshot
   golden; one full happy-path per chapter (open → predict → reveal → solve
   via debug hooks → progress recorded); offline reload; save-migration
   scenario (inject v1 save, assert v2 upgrade + stars preserved).
4. **On-device protocol** (manual, documented): fps overlay + checklists, run
   at NF3-0 (spike) and NF3-11 (release QA).
