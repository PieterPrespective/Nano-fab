# NF01-04 — Canvas 2D UI (NF1-6)

Touch-first, Canvas 2D only, zero dependencies. The UI is deliberately thin:
it owns pixels and pointer events, nothing else. Every piece of logic that can
be a pure function *is* one, and is unit tested; the canvas glue is covered by
the manual on-device checklist at the bottom.

## 1. Screens & flow

```
Level select ──tap──▶ Play screen ──all targets pass──▶ Result overlay
   ▲  (grid of level cards,          │                    (stars, metrics,
   │   stars, lock state)            │                     "explain the physics")
   └─────────── back ◀───────────────┴──── next level ◀────┘
```

- Levels unlock sequentially (l1-02 needs l1-01 cleared) — reads `Progress`.
- Play screen layout (portrait & landscape via one flex-ish layout function):
  - **Id–Vg plot** (top ~55%): log-scale Id vs Vg, curves at vds = 50 mV and
    Vdd, Ion/Ioff markers, target bands where meaningful.
  - **Metrics strip**: SS, DIBL, Ion, Ioff, leakage power — each with a
    pass/fail tint against the level targets.
  - **Controls** (bottom, thumb-reachable): one row per unlocked control —
    sliders (linear or log per level JSON), segmented buttons for `arch`,
    stepper for `nStack`.
- Recompute-on-drag: slider input → `resolveParams` → `deviceMetrics` +
  `idVgCurve` → redraw. Budget: << 16 ms (closed-form algebra; no caching
  needed, but coalesce to one recompute per animation frame).

## 2. Module breakdown

```
src/ui/
  app.ts        # screen state machine, owns Progress + Level[]; the only mutable hub
  levelSelect.ts# level grid rendering + hit test
  playScreen.ts # composition of plot/metrics/controls; wires pointer events
  controls.ts   # slider/segment/stepper widgets (canvas-drawn)
  format.ts     # SI → display units (nm, mV/dec, µA, nW) — PURE
src/render/
  plot.ts       # Id–Vg plot: scales, ticks, curve path, markers — layout PURE
  theme.ts      # colors, spacing, type scale (dark theme)
```

### Pure, unit-tested helpers (the actual TDD surface)

| Function | Contract (tests) |
|---|---|
| `format.si(value, unit, digits)` | 1.8e-8 m → "18 nm"; 6.2e-5 A → "62 µA"; 0 and negatives; round-trips the metrics table in `04`-fixtures |
| `format.perDecade(ss_VperDec)` | 0.0596 → "59.6 mV/dec" |
| `plot.logTicks(min, max)` | decade ticks for Id axis: covers [1e-12, 1e-3] with ≤ 12 labeled ticks; handles min = max |
| `plot.project(curve, viewport)` | maps {vg, id} points to pixel coords; id ≤ 0 clamps to floor rather than NaN (log axis safety) |
| `controls.sliderToValue(t, spec)` / `valueToSlider` | inverse pair (property test: round-trip ± 1e-12) for linear **and** log scales; clamps t ∈ [0,1] |
| `ui/layout.ts` `layout(w, h)` | returns rects for plot/metrics/controls; no overlap, all within canvas, controls ≥ 64 px row height at any aspect ratio in [3:4 … 21:9] (touch-target property test) |

Tests live in `tests/ui/*.test.ts`, `tests/render/plot.test.ts` — plain node
environment; none of these helpers may touch a canvas context.

### Canvas glue (not unit tested, kept dumb)

`playScreen.ts`/`controls.ts` draw from the layout rects and dispatch pointer
events → widget hit tests → value changes → recompute. Rules:

- Pointer events only (`pointerdown/move/up`), never mouse/hover; pinch-zoom
  reserved for later layers (phase 1 has nothing to zoom).
- `devicePixelRatio`-aware canvas sizing (crisp on the Tab S8's 2560×1600).
- No per-frame allocations in the draw path (reuse arrays); target 60 fps
  while dragging.

## 3. Codex / explain-the-physics panel

- Result overlay shows the level's `explain` text (source: level JSON).
- `src/ui/codex.ts` renders unlocked codex entries from
  `src/levels/codex.json` (id → title, body, realNumbers[]). Phase-1 entries:
  `boltzmann-limit`, `dibl`, `gate-tunneling`, `gaa-stacking`,
  `node-names-are-marketing`, `dark-silicon`.
- Codex content is data; validated by a small schema test like levels (L-series).

## 4. Manual on-device QA checklist (run in NF1-8)

On the Galaxy Tab S8 (Chrome + Samsung Internet):

- [ ] All 6 levels playable with touch only; sliders draggable with a thumb,
      no accidental scrolls (CSS `touch-action` verified).
- [ ] Drag a slider: curve follows the finger with no visible lag or jank.
- [ ] Rotate portrait ↔ landscape mid-level: layout reflows, state survives.
- [ ] Text legible at arm's length (min font ~14 px CSS at dpr 2).
- [ ] No hover-dependent affordance anywhere (tap-test every interaction).
- [ ] Lighthouse PWA + performance pass on the deployed URL.
