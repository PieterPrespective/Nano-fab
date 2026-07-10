# NF01-03 — Engine: Level Schema, Scoring, Save/Load

Game logic lives in `src/engine/` and is as pure and test-driven as the
physics: level parsing, target evaluation, star scoring, and progress
persistence are all plain-data functions. The UI only calls them.

## 1. Level JSON schema (v1)

Levels are data, not code (`src/levels/l1-*.json`). Validated at load by
`src/engine/levels.ts`; invalid levels fail loudly with a path-precise error.

```jsonc
{
  "schema": 1,
  "id": "l1-04",                  // unique, stable; save data keys off this
  "layer": 1,
  "title": "Drain-Induced Bullying",
  "intro": "Short setup text shown before play.",
  "explain": "Explain-the-physics text shown after passing. MUST cite the real anchor (fidelity rule), e.g. 'Your gate is 18 nm — the real gate length of the \"5nm\" node.'",

  // Which DeviceParams the player may touch, with playable ranges.
  // Everything not listed is locked to `fixed` (or the engine default).
  "controls": {
    "gateLength_m":  { "min": 10e-9, "max": 40e-9, "init": 25e-9, "scale": "log" },
    "eot_m":         { "min": 0.6e-9, "max": 2e-9, "init": 1e-9, "scale": "linear" },
    "arch":          { "options": ["planar", "finfet", "gaa"], "init": "planar" },
    "nStack":        { "min": 1, "max": 4, "step": 1, "init": 1 }
  },
  "fixed": { "vdd_V": 0.7, "vth0_V": 0.25, "temperature_K": 300 },

  // All targets must pass to clear the level. Metrics are DeviceMetrics keys.
  "targets": [
    { "metric": "dibl_VperV",  "op": "<=", "value": 0.05,
      "label": "DIBL ≤ 50 mV/V" },
    { "metric": "ion_A",       "op": ">=", "value": 40e-6,
      "label": "Ion ≥ 40 µA" }
  ],

  // Stars: 1 = targets met; 2/3 = increasingly tight bonus threshold on one metric.
  "stars": {
    "metric": "leakagePower_W", "direction": "min",
    "two": 50e-9, "three": 10e-9
  },

  "codex": ["boltzmann-limit", "dibl"]   // codex entry ids unlocked on clear
}
```

Schema rules the validator enforces (each is a test):

- `schema === 1`; unknown top-level keys rejected (typo protection).
- Every `controls` key is a real `DeviceParams` field; `min < max`;
  `init` within range; `scale` ∈ {linear, log}; log requires min > 0.
- Every `targets[].metric` is a real `DeviceMetrics` key; `op` ∈ {`<=`, `>=`}.
- `stars` thresholds are ordered correctly for `direction`
  (min: two ≥ three; max: two ≤ three).
- ids match `/^l\d+-\d{2}$/` and are unique across the level list.

## 2. Engine modules & API

### `src/engine/levels.ts`
```ts
parseLevel(json: unknown): Level               // throws LevelValidationError with path
loadLevelList(jsons: unknown[]): Level[]       // + uniqueness checks
resolveParams(level: Level, playerValues: PlayerValues): DeviceParams
```
`resolveParams` merges fixed + defaults + clamped player values; clamping is
engine policy (UI can't produce out-of-range physics inputs, and neither can a
corrupted save).

### `src/engine/scoring.ts`
```ts
evaluate(level: Level, params: DeviceParams): Evaluation
// Evaluation = { metrics: DeviceMetrics,
//                targets: Array<{label, pass, actual, value, op}>,
//                passed: boolean, stars: 0|1|2|3 }
```
Stars: 0 if any target fails; else 1, upgraded to 2/3 by the bonus metric.

### `src/engine/progress.ts`
```ts
interface ProgressStore { get(k: string): string | null; set(k: string, v: string): void; }
loadProgress(store: ProgressStore): Progress   // tolerant: corrupt ⇒ fresh + console.warn
saveProgress(store: ProgressStore, p: Progress): void
recordResult(p: Progress, levelId: string, stars: number, best: PlayerValues): Progress
```
Persisted shape: `{ version: 1, levels: { [id]: { stars, bestValues } } }`.
`ProgressStore` abstracts localStorage so tests inject a Map-backed fake —
no DOM in engine tests. Unknown future `version` ⇒ refuse to overwrite
(don't destroy a newer save), start in-memory.

## 3. Test plan (write first)

`tests/engine/levels.test.ts`, `scoring.test.ts`, `progress.test.ts`.

| ID | Test | Assertion |
|---|---|---|
| L1 | Valid level parses | the schema example above round-trips |
| L2 | Each validator rule | one failing fixture per rule; error message contains the JSON path |
| L3 | All shipped levels valid | `import.meta.glob`-loaded `src/levels/*.json` all parse; ids unique |
| L4 | Clamping | out-of-range player value ⇒ clamped, not thrown |
| L5 | resolveParams precedence | fixed beats default; player beats init; locked param ignores player value |
| S1 | Targets ops | `<=`/`>=` boundary cases (exactly-equal passes) |
| S2 | Star ladder | crafted metrics hit 0/1/2/3 correctly, both directions |
| S3 | Solvability (per level) | for each shipped level: its `solution` sidecar values (kept in `tests/fixtures/levels/solutions.json`) evaluate to ≥ 1 star, and its `init` values evaluate to **0 stars** (level not pre-solved) |
| P1 | Round-trip | save → load identity via fake store |
| P2 | Corrupt JSON / wrong version | fresh progress, nothing thrown; newer version never overwritten |
| P3 | recordResult | keeps max stars, updates bestValues only on improvement |

S3 is the highest-value test in the phase: it proves every shipped level is
winnable and non-trivial *by construction* whenever physics constants change.

## 4. The six phase-1 levels

Authored in NF1-5, each with a `solutions.json` entry (test S3) and an
`explain` that names its real-world anchor:

| ID | Title (working) | Unlocked controls | Core lesson / targets |
|---|---|---|---|
| l1-01 | "Make it switch" | gateLength | Ion/Ioff ≥ 10⁴ at Vdd 0.7 V — shrinking Lg raises leakage; find the safe zone |
| l1-02 | "The thin-oxide trap" | eot | drive needs thin oxide, tunneling punishes it; Ion target + gate-leakage cap (why HKMG) |
| l1-03 | "The 60 mV wall" | gateLength, bodyThickness | SS ≤ 65 mV/dec — achievable; SS ≤ 58 impossible (bonus text: only steep-slope devices beat kT/q) |
| l1-04 | "Drain-induced bullying" | gateLength, arch | DIBL ≤ 50 mV/V at Lg ≤ 20 nm — forces planar → FinFET/GAA |
| l1-05 | "Stack the sheets" | arch, nStack, sheetWidth | Ion target inside a fixed footprint — GAA stacking wins (the real N3/N2 move) |
| l1-06 | "Dark silicon budget" | all of the above | Ion ≥ X **and** leakage power ≤ Y at fixed Vdd — the full optimization; stars on leakage |

Difficulty follows the reference plan: intuitive → quantitative → optimization.
