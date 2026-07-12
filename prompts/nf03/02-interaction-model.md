# NF03-02 — Interaction Model: Beyond Sliders

Feedback item #2: *"allowing a user more input than just a slider will help a
lot."* This document defines the interaction vocabulary, the input
architecture, and how levels declare interactions as data.

## 1. The verb set

Eight direct-manipulation verbs cover every level in Ch1–Ch6. Each verb is a
reusable, tested component — levels compose them, never invent new input code.

| Verb | Gesture | Used for |
|---|---|---|
| **place** | tap (ghost preview under finger, lift to commit) | charges, dopant sources, probes, assist features, step markers |
| **drag-object** | one-finger drag on an object | moving charges/electrodes, raising/lowering an energy hill (grab the terrain), resizing the gate, moving mask edges |
| **draw** | one-finger freehand or polygon tap-tap-close | prediction sketches (trajectories, landing zones), mask polygons, cut lines |
| **launch** | pull-back-and-release (slingshot) | test charges in Ch1, thermal "balls" in Ch2 — velocity set by pull vector: pure kinematics feel |
| **scrub** | horizontal drag on the timeline bar | process time in Ch6, dose accumulation in Ch4, motion-profile time in Ch5 |
| **cut** | two-finger swipe across the wafer (or drag the section handle) | repositioning the 3D cross-section plane |
| **connect/order** | drag cards into timeline slots | process-step sequencing puzzles (Ch6) |
| **probe** | long-press any object | inspector bubble with live values (field strength here, layer thickness here, local dose) — replaces walls of always-on numbers |

Camera (3D scenes): two-finger orbit, two-finger pinch zoom, two-finger pan.
One finger *always* belongs to the active tool — no mode errors between
camera and manipulation.

Sliders survive only inside the **fine-tune drawer**: a pull-up panel showing
the numeric values of whatever the player last manipulated, for precision
adjustment. Never the primary path; never the only path (enforced by the NF03
definition of done).

## 2. Input architecture

```
PointerRouter                # raw pointer events → gesture classification
  ├─ GestureRecognizer       # tap / long-press / drag / pinch / two-finger, with
  │                          # touch-slop + 250 ms long-press threshold — PURE state machine
  ├─ CameraController        # consumes all two-finger gestures in 3D scenes
  └─ ToolController          # consumes one-finger gestures, dispatches to active tool
       └─ tools: PlaceTool, DragTool, DrawTool, LaunchTool, ScrubTool,
                 CutTool, OrderTool, ProbeTool   # each: hitTest() + onStart/Move/End
```

- `GestureRecognizer` is a pure state machine (events in → gesture events
  out) and gets an exhaustive unit-test suite (tap vs. drag disambiguation,
  slop radii, pinch begin/end, long-press cancel on move). This is where
  touch UIs usually rot; we pin it with tests up front.
- Tools operate on the **scene model**, never the renderer. Undo/redo is a
  command stack over scene-model mutations (tested: every tool emits an
  invertible command).
- A **tool palette** (left edge, thumb-reachable) shows only the tools the
  current level declares. One active tool at a time; probe is always
  available via long-press regardless of active tool.

## 3. Prediction input (beat 2 of the tutor loop)

Predictions reuse the same verbs in a restricted "prediction layer":

- **sketch**: draw verb onto an overlay; the sketch is sampled to a polyline.
- **mark**: place verb for a single point/region.
- **choose**: tap one of N ghost previews (used by misconception probes).

Scoring a prediction = pure function `predictionScore(sketch|mark|choice,
simResult) → 0..1` per prediction type (e.g. mean perpendicular distance
between sketched and simulated trajectory, normalized by scene size). All
pure, all unit-tested against fixture scenes.

## 4. Level schema v2 (interaction surface)

Additions to the phase-1 level JSON (full schema in
`06-architecture-refactor.md` §4):

```jsonc
{
  "schema": 2,
  "scene": {
    "type": "particle-chamber" | "energy-terrain" | "ripple-tank" |
            "resist-exposure" | "scanner-stage" | "wafer3d",
    "setup": { /* scene-type-specific initial objects, typed & validated */ }
  },
  "tools": ["place-charge", "launch", "probe"],   // whitelist for the palette
  "prediction": {                                  // optional; omit = no predict beat
    "kind": "sketch" | "mark" | "choose",
    "prompt": "Sketch the path the electron will take.",
    "scored": true,                                // false for misconception probes
    "conceptNodes": ["charge-force"]
  },
  "targets": [ /* unchanged phase-1 target machinery */ ],
  "insets": [                                      // graphs as SUPPORT, not focus
    { "kind": "idvg" | "trajectory-xy" | "dose-histogram" | "profile-section",
      "unlockOn": "reveal" }                       // insets appear only after the reveal beat
  ]
}
```

Validation rules (all tested, same style as phase 1): scene type known; every
tool known and meaningful for the scene type; prediction kind matches an
available scorer; every inset kind known; concept nodes exist in the mastery
graph.

## 5. Interaction TDD strategy

Pure and tested:
- GestureRecognizer state machine (synthetic pointer sequences → expected
  gesture streams; ~20 cases including the nasty ones: drag that starts as a
  potential long-press, second finger landing mid-drag).
- Tool command emission + undo inversion (apply → invert → scene deep-equals).
- Prediction scorers (fixture sketches vs. fixture sim results with known
  scores).
- Hit-testing math (ray vs. slab/handle in 3D; point vs. polygon in 2D).

Glue (thin, e2e-covered): pointer event wiring, palette rendering, drawer.
The existing Playwright harness gains synthetic multi-touch helpers
(`touchscreen.tap`, two-pointer orbit via CDP `Input.dispatchTouchEvent`) and
per-scene screenshot goldens.
