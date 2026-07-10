# NanoFab

A physics-faithful chip-design puzzle/sandbox game: real device, interconnect,
lithography, and scanner physics as the core mechanics. **Hard target: runs
fully offline in the browser on a Galaxy Tab S8 (Snapdragon 8 Gen 1 / Adreno
730) as an installable PWA.**

Reference design document: `prompts/nf01/reference-nanofab-design-plan.md`.
Phase 1 implementation plan: `prompts/nf01/` (test-driven, read `00-overview.md` first).

## Four-layer architecture

Physics models mirror the four nested physical layers, innermost → outermost:

| Layer | Mechanic | Model | Module |
|---|---|---|---|
| 1 Device | build a transistor that switches | compact Id–Vg (EKV-flavored) + SS/DIBL electrostatics + tunneling/GIDL leakage; Monte-Carlo variability (M2) | `src/physics/device.ts` |
| 2 Circuit | make it fast, cool, small | Elmore RC delay, Fuchs-Sondheimer/Mayadas-Shatzkes resistivity, EM/IR checks | `src/physics/interconnect.ts` |
| 3 Litho | print the pattern | Gaussian PSF → FFT aerial image (WebGL2/WebGPU), resist threshold, Poisson stochastics, EPE/OPC scoring | `src/physics/litho/` |
| 4 Machine/Fab | tune the scanner, run the fab | jerk-limited S-curve motion + 2nd-order settling; Poisson/Murphy yield | `src/physics/stage.ts`, `src/physics/yield.ts` |

Phase 1 (MVP) implements **Layer 1 only**, plus engine, Canvas 2D UI, JSON
levels, PWA shell, and the deploy pipeline.

## Hard constraints

- No backend. Everything builds to a static `dist/`; save/load via localStorage.
- Offline-first PWA: service worker precaches all assets and level JSON.
- WebGL2 fragment-shader compute is the litho baseline; WebGPU only behind
  runtime feature detection (Samsung Internet may lack it).
- FP16 textures for the FFT optical path; interactive grids capped at 256²
  (512² allowed only for non-interactive "high-fidelity render").
- Touch-first input: drag, pinch-zoom; no hover-dependent UI.

## Coding conventions

- Vanilla TypeScript (strict), Vite, no frameworks and no runtime dependencies
  unless a strong case is made.
- **Physics is pure and unit-tested.** Modules in `src/physics/` export pure
  functions of plain data — no DOM, no canvas, no state. Every model is
  developed test-first against golden curves/fixtures in `tests/`.
- UI (`src/ui/`, `src/render/`) stays thin; game logic lives in `src/engine/`.
- SI units internally (m, V, A, s); convert to display units (nm, mV/dec,
  µA/µm) only at the UI boundary. Document units on every exported type field.

## Fidelity rule

Every model must cite the real-world number or trend it targets (e.g. the
60 mV/dec Boltzmann limit, ~18 nm gate length at the "5nm" node) in a comment
or codex entry. Never present a fabricated value as a real measured one; the
game says when a model is simplified.

## Levels

Each puzzle is a JSON file in `src/levels/` validated by `src/engine/levels.ts`
— targets, tolerances, unlocked controls, scoring weights, explain-the-physics
text. Schema documented in `prompts/nf01/03-engine-levels-scoring.md`. Author
content as data, not code.

## Commands

- `npm run dev` — Vite dev server
- `npm test` / `npm run test:watch` — Vitest unit tests (run before committing)
- `npm run build` — typecheck + production build to `dist/`
- Deploy: GitHub Actions (`.github/workflows/deploy.yml`) tests, builds, and
  publishes `dist/` to GitHub Pages on push to `main`. `vite.config.ts` sets
  `base: '/Nano-fab/'` for Pages; override with `VITE_BASE` elsewhere.
