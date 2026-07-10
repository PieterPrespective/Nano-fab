# Layer 3 — lithography models (milestone 3, NOT part of phase 1)

Planned modules:

- `aerial.ts` — aerial image: Gaussian PSF first, then FFT-based single-kernel
  Abbe/Hopkins approximation (WebGL2 fragment shaders, FP16, 256² interactive cap).
- `resist.ts` — threshold resist model with blur.
- `stochastics.ts` — Poisson photon shot noise, LER, bridge/break defects.
- `opc.ts` — EPE scoring for the OPC puzzle.

All CPU-side models are pure and test-first; GPU shaders get golden-image tests.
