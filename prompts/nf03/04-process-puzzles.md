# NF03-04 — Process Steps & the Build-a-Structure Puzzle

The puzzle core of Chapter 6 (and the sandbox): given a **target
cross-section**, produce it on the 3D wafer by choosing, ordering, and
parameterizing process steps. "Chip production over time" becomes something
the player *does*, not watches.

## 1. Process op library (`src/physics/process.ts`, pure, test-first)

Each op: `apply(wafer, params) → wafer` + `interpolate(before, params, t) →
wafer` + a fidelity comment citing its real anchor. Simplified-but-faithful,
same rule as phase 1.

| Op | Params | Model (per column + neighborhood) | Real anchor (taught) |
|---|---|---|---|
| `spinResist` | thickness | add uniform resist film over topography (planarizing fill toward flat top) | spin coating planarizes; ~20–200 nm films |
| `expose` | maskPolygons, dose, defocus | Gaussian-PSF aerial image on the resist top surface (reuses nf01 litho plan §M3 baseline); latent image stored per column; stochastic mode adds Poisson noise at low dose (Ch4 tie-in) | diffraction-limited printing; dose vs. stochastics |
| `develop` | threshold | remove resist where latent ≥ threshold (positive tone) | threshold resist model (Mack simplified) |
| `etch` | depth, anisotropy∈[0,1], selectivity: Material→rate | anisotropic part: descend top-exposed segments not under a masking material; isotropic part: morphological erode with lateral rate = (1−anisotropy)·rate ⇒ undercut | RIE vs. wet etch; undercut; selectivity ("chemistry picks what erodes") |
| `deposit` | material, thickness, conformality∈[0,1] | conformality 1: film follows all exposed surfaces (morphological dilate); 0: line-of-sight from top only (fills trenches badly ⇒ voids — teachable failure) | CVD/ALD conformal vs. PVD directional; ALD = "one atomic monolayer per cycle" |
| `implant` | species(n/p), dose, energy, tilt | Gaussian depth profile centered at range(energy) into topmost non-masking materials; masked columns shielded when mask stack thicker than stopping depth; tilt shifts lateral landing (Ch1 kinematics tie-in: it's aiming charged projectiles) | ion implantation; photoresist/oxide as implant mask |
| `anneal` | time·temp product | 3D Gaussian blur of dopant clouds (diffusion); activates implant (changes render tint) | dopant activation + diffusion broadening |
| `cmp` | stopMaterial \| targetZ | truncate all columns at the height where stopMaterial is first exposed (min over grid), or at targetZ | CMP planarization; stop layers; dishing mentioned in codex |
| `strip` | — | remove all resist | ash/strip |
| `thermalOxide` | thickness | convert top silicon to SiO₂ (consumes ~0.45× Si thickness — the classic detail) | LOCOS-era oxidation; Deal-Grove flavor |

Property fuzz test (shared): any random op sequence keeps every column
sorted, non-overlapping, non-negative, and inside the world box. Golden
tests: each op on 4 fixture wafers; the canonical **12-step planar MOSFET
recipe** and **~16-step simplified GAA recipe** produce golden final wafers
(these goldens ARE the Ch6 level solutions).

## 2. Puzzle format

```jsonc
{
  "scene": { "type": "wafer3d", "setup": { "substrate": "si", "grid": 96 } },
  "cards":   [ /* the step cards available, some with locked params */ ],
  "budget":  { "maxSteps": 8, "cost": { "expose": 3, "cmp": 2, "default": 1 } },
  "target":  "fixtures/targets/isolated-gate.json",   // a WaferModel
  "targets": [
    { "metric": "structureIoU",  "op": ">=", "value": 0.92, "label": "Match ≥ 92%" },
    { "metric": "processCost",   "op": "<=", "value": 9,    "label": "Budget ≤ 9" }
  ],
  "stars": { "metric": "structureIoU", "direction": "max", "two": 0.95, "three": 0.985 }
}
```

- **structureIoU**: per-material volumetric intersection-over-union between
  achieved and target wafer (pure, tested; air excluded; dopant materials
  compared with concentration tolerance). Computed per material and combined
  as the minimum over required materials — you can't hide a missing gate
  behind a perfect oxide.
- **Diff view** (the "why did it fail" loop): toggle that renders
  achieved-only material in red ghost, missing-in-achieved in blue ghost,
  directly on the 3D wafer. This replaces number-staring with *looking at
  your mistake*.
- Multiple orderings can win (as in a real fab there are process-integration
  choices); the S3-style content test verifies the recorded solution wins
  AND that at least one documented wrong order (e.g. implant after gate
  metal) fails — puzzles must be order-sensitive to teach integration.

## 3. Puzzle ladder (Chapter 6)

1. **First trench** — spin/expose/develop/etch/strip. Teaches the 5-step
   lithography heartbeat that everything else repeats.
2. **The undercut** — same target, wet etch only (anisotropy 0) ⇒ player
   discovers undercut ruins the linewidth; fix with anisotropic etch.
   (Misconception probe: predict the wet-etched profile.)
3. **Bury a wire (damascene)** — etch trench, overfill metal, CMP flat.
4. **Void in the canyon** — deep trench + directional deposit ⇒ void; fix
   with conformal (ALD) deposit. Prediction: choose which fill survives.
5. **Make it n-type where I say** — implant through a resist mask; tilt play;
   anneal spreads it (predict the spread).
6. **Self-alignment** — the great trick: pattern the gate FIRST, then implant
   uses the gate itself as the mask ⇒ source/drain perfectly aligned for
   free. The level that makes people love process engineering.
7. **The planar MOSFET** — full 12-step recipe to hit a transistor target;
   final inset: the phase-1 Id–Vg of *the device you just built* (bridge to
   Ch2 scoring: geometry extracted from the wafer feeds `deviceMetrics`).
8. **Stack the sheets in 3D** — simplified GAA: multilayer Si/SiGe deposit,
   patterning, selective etch releasing the sheets (selectivity as the hero),
   gate-all-around fill. The payoff picture of the whole game.
9. **Yield run (boss)** — take recipe #7/#8, add defect density + dose choice
   (Ch4) + stage throughput (Ch5); Poisson/Murphy yield and cost/die
   (`physics/yield.ts` finally lands). Score = profit, not perfection.

Sandbox mode: all cards, no target, blank wafer, share-nothing (screenshot to
device gallery).

## 4. Geometry → device bridge

`extractDevice(wafer, probeRegion) → DeviceParams` (pure): measures gate
length (gate-material span), EOT (dielectric thickness under gate), body
thickness, sheet count from the wafer model and feeds phase-1
`deviceMetrics`. Tested against the golden recipes (extracted params within
5% of recipe intent). This closes the loop: **the thing you built in 3D is
scored by the physics you learned in Ch2.**
