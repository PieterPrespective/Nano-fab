# NF03-03 — The 3D Wafer Over Time

Feedback item #3: *"a 3D representation over time of chip production I can
puzzle with, supported by graphs rather than focused on graphs."* This is the
technical spec for that centerpiece: the wafer data model, the process
timeline with scrubbing, and the renderer that fits the Tab S8.

## 1. Wafer data model: column stacks (not general voxels)

Real process emulators (SEMulator3D-class) and every classroom cross-section
share one property: at chip scale the structure is a **stack of material
segments per (x, y) column**. We exploit that:

```ts
type Material = 'si' | 'sio2' | 'si3n4' | 'poly' | 'metal' | 'resist' |
                'highk' | 'doped-n' | 'doped-p' | 'air';

/** One vertical column: ordered, non-overlapping segments from substrate up. */
type Column = Array<{ material: Material; z0_m: number; z1_m: number }>;

interface WaferModel {
  nx: number; ny: number;          // grid, default 96×96 (128×128 stretch)
  pitch_m: number;                 // lateral cell size, e.g. 4e-9
  columns: Column[];               // nx*ny, row-major
}
```

Why this beats a voxel grid: memory is O(segments) not O(z-resolution);
every process op below §2 is a per-column segment edit plus, for isotropic
behavior, a morphological pass over the neighborhood (dilate/erode on the
grid — which is also the *teaching metaphor*: sandcastle erosion). Vertical
resolution is continuous (no z-quantization artifacts in thin gate oxides).

All wafer ops are **pure**: `op(wafer, params) → wafer'`. Structural sharing
(reuse untouched Column arrays) keeps scrubbing cheap.

## 2. The process timeline

```ts
interface ProcessStep { op: OpKind; params: OpParams; label: string }
interface Timeline {
  steps: ProcessStep[];
  /** Memoized wafer state AFTER each step; index -1 = blank substrate. */
  snapshots: WaferModel[];
}
```

- `runTimeline(steps, substrate) → snapshots[]` — pure, memoized by step
  prefix: editing step k invalidates only snapshots ≥ k.
- **Scrubbing** = picking (stepIndex, t∈[0,1]) and rendering
  `interpolateStep(snapshots[k-1], steps[k], t)`. Every op defines its own
  visual interpolation (etch front descending, film growing conformally,
  implant clouds fading in, CMP plane sweeping down). Interpolators are pure
  and golden-tested at t ∈ {0, 0.25, 0.5, 0.75, 1}.
- Budget: 12-step timeline × 96×96 grid re-runs in < 50 ms on desktop
  (< 150 ms on device) so card edits feel live; enforced by a perf test.

## 3. Rendering: minimal WebGL2, purpose-built

### Decision: hand-rolled renderer, not a 3D engine

The scene is *only*: axis-aligned material slabs (greedy-meshed boxes), one
cross-section clip plane, ghost overlays, and line/handle gizmos. That's
~1,200 lines of focused WebGL2 — far less code than integrating and shipping
a general engine, keeps the zero-runtime-dependency rule, and keeps the
bundle ≈ tiny (phase 1 ships 10 kB gzipped; budget for the whole 3D layer is
+45 kB gzipped).

**Escape hatch (decided in advance, not under pressure):** if NF3-5 exceeds
its two-session budget or a chapter needs non-slab geometry (curved mirrors
in a Ch5 cutaway can be faked with prebuilt line art), we adopt three.js as
the one justified runtime dependency and record the decision in CLAUDE.md.

### Pipeline

1. **Meshing (pure, CPU, tested):** `meshWafer(wafer, clipPlane) →
   {positions, normals, materialIds, indices}` — greedy meshing merges
   coplanar faces per material; the clip plane generates capped cut faces
   with a distinct "cut" shading flag (bright section face = the classic
   textbook cross-section look).
   Tests: golden vertex buffers for fixture wafers (blank, one film, etched
   trench, full transistor); watertightness (every edge shared by exactly 2
   faces pre-clip); triangle-count regression bounds.
2. **Upload:** one interleaved VBO per snapshot mesh; scrub interpolations
   that only move a front reuse geometry with a uniform where possible
   (etch/CMP fronts are a clip-height uniform, not a remesh — remesh only at
   step boundaries).
3. **Shading:** single program; flat-ish lambert + hemispheric fill; material
   palette lookup by id; screen-space outline on the section cut; no shadows
   (a baked AO-ish gradient by depth in the stack reads "3D" well enough on
   a tablet and costs nothing).
4. **Overlays:** ghost meshes for target structures (transparent, front-face
   only), prediction sketches billboarded, handles/gizmos as a separate
   line pass.

### Performance budget (Adreno 730)

| Item | Budget |
|---|---|
| Triangles after greedy meshing | ≤ 150 k (fixture "full transistor" at 96×96 measures ~40 k) |
| Draw calls | ≤ 20 |
| 3D canvas dpr | capped at 1.5 (UI canvas stays at native dpr for text) |
| Frame budget while scrubbing | 33 ms (30 fps floor; 60 target) |
| Remesh (step boundary) | ≤ 16 ms at 96×96 |

**NF3-0 is an on-device spike that validates exactly this table before
anything is built on top** (see `07-task-checklist.md`). If 96×96 misses
30 fps, the grid drops to 64×64 — puzzles are authored against the abstract
model, so grid size is a config constant, not a design change.

## 4. The scene around the wafer

- **Timeline bar** (bottom): step cards in slots; the scrub head; play
  button animates through steps at 1 step/900 ms. Cards show op icon +
  1-line params; tap = edit card (opens its param sheet), drag = reorder
  (`connect/order` verb).
- **Section handle**: a grabbable tab on the wafer edge; `cut` verb drags the
  clip plane through the structure. Double-tap the handle: snap to the
  canonical transistor section (through the gate).
- **Inset graphs** (`insets` in level JSON): dock top-right, collapsed to a
  sparkline chip until tapped. E.g. during implant: dopant depth profile
  under the probe point; during exposure: aerial-image slice under the cut
  line; after the final step: the full phase-1 Id–Vg of the built device.
  *The graph never appears before the scene event it explains* (`unlockOn`).
- **Probe** (long-press): tooltip with column stack at that point — layer
  thicknesses top-down, local dose/dopant concentration.

## 5. TDD strategy summary

| Layer | Test type |
|---|---|
| Column ops, morphology, timeline memoization, interpolators | Unit + golden fixtures (JSON wafers), property tests (segments sorted, non-overlapping, ≥ 0 thickness — run after *every* op in a random-op fuzz) |
| Greedy mesher, clip capping | Golden buffers + invariants (watertight, tri-count bounds) |
| Renderer / GL glue | Kept dumb; Playwright screenshot goldens per fixture scene (pixel-diff tolerance 1%), on the existing e2e harness |
| Perf budgets | Vitest bench guards (CPU side) + on-device spike protocol (GPU side, manual, NF3-0 and NF3-11) |
