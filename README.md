# NanoFab

A physics-faithful chip-design puzzle/sandbox game. Build transistors that
actually switch, route wires that fight RC delay, print patterns through
stochastic EUV lithography, and tune a scanner where jerk limits money — with
real physics, real numbers, and real trade-offs.

- **Design document:** [`prompts/nf01/reference-nanofab-design-plan.md`](prompts/nf01/reference-nanofab-design-plan.md)
- **Phase 1 (MVP) plan:** [`prompts/nf01/`](prompts/nf01/) — Layer 1 device
  puzzle, test-driven. Start at [`00-overview.md`](prompts/nf01/00-overview.md).
- **NF03 refactor plan:** [`prompts/nf03/`](prompts/nf03/) — from graphs to a
  guided kinematics→EM→EUV learning journey with direct manipulation and a 3D
  process-over-time wafer. Start at [`00-overview.md`](prompts/nf03/00-overview.md).
- **Contributor guide:** [`CLAUDE.md`](CLAUDE.md)

## Stack

Vanilla TypeScript + Vite + Canvas 2D (WebGL2/WebGPU later for lithography).
Offline-first installable PWA; no backend. Target device: Galaxy Tab S8.

## Develop

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (Vitest)
npm run build    # typecheck + static build to dist/
```

Pushes to `main` deploy to GitHub Pages via GitHub Actions.
