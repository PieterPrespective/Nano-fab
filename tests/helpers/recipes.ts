/**
 * Golden process recipes (prompts/nf03/04 §1): the canonical planar MOSFET
 * and simplified-GAA flows. Authored at 24×24 so golden fixtures stay small;
 * puzzles are grid-agnostic.
 */

import type { ProcessStep } from '../../src/scene/timeline';
import { createSubstrate, type WaferModel } from '../../src/scene/wafer';

export const GRID = 24;
export const PITCH = 8e-9;
export const SUBSTRATE_TH = 120e-9;

export function substrate(): WaferModel {
  return createSubstrate(GRID, GRID, PITCH, SUBSTRATE_TH);
}

const SI_ETCH = { si: 1, 'doped-n': 1, 'doped-p': 1 } as const;

/**
 * Planar MOSFET, the Ch6 level-7 payoff. Gate runs along y at the wafer
 * center; source/drain implants are self-aligned to the gate (level 6's
 * great trick). ~16 steps — the "12-step" plan estimate was optimistic,
 * reality wins.
 */
export const PLANAR_MOSFET: ProcessStep[] = [
  // --- STI: isolate the active area (columns x ∈ [0.25, 0.75)) ---
  { op: 'spinResist', thickness_m: 60e-9 },
  {
    op: 'expose',
    dose: 1,
    blurCells: 0,
    mask: [
      { x0: 0, y0: 0, x1: 0.25, y1: 1 },
      { x0: 0.75, y0: 0, x1: 1, y1: 1 },
    ],
  },
  { op: 'develop', threshold: 0.5 },
  { op: 'etch', depth_m: 50e-9, anisotropy: 1, rates: SI_ETCH },
  { op: 'strip' },
  { op: 'deposit', material: 'sio2', thickness_m: 70e-9, conformality: 1 },
  { op: 'cmp', stopMaterial: 'si' },
  // --- gate stack: thin thermal oxide + poly gate line along y ---
  { op: 'thermalOxide', thickness_m: 2e-9 },
  { op: 'deposit', material: 'poly', thickness_m: 50e-9, conformality: 1 },
  { op: 'spinResist', thickness_m: 50e-9 },
  {
    op: 'expose',
    dose: 1,
    blurCells: 0,
    // protect the gate: expose everything EXCEPT the gate stripe
    mask: [
      { x0: 0, y0: 0, x1: 1, y1: 0.42 },
      { x0: 0, y0: 0.58, x1: 1, y1: 1 },
    ],
  },
  { op: 'develop', threshold: 0.5 },
  { op: 'etch', depth_m: 52e-9, anisotropy: 1, rates: { poly: 1, sio2: 0.05 } },
  { op: 'strip' },
  // --- self-aligned source/drain: the gate itself masks the channel ---
  { op: 'implant', species: 'n', range_m: 25e-9, straggle_m: 10e-9 },
  { op: 'anneal', spread_m: 8e-9 },
];

/**
 * Simplified GAA: alternating sacrificial/channel stack, fin patterning,
 * selective release of the sacrificial layers (suspended sheets = cavities),
 * then conformal gate wrap filling the cavities. Uses si3n4 as the
 * sacrificial stand-in for SiGe.
 */
export const GAA_RELEASE: ProcessStep[] = [
  // superlattice: 3 × (sacrificial + channel)
  { op: 'deposit', material: 'si3n4', thickness_m: 10e-9, conformality: 1 },
  { op: 'deposit', material: 'si', thickness_m: 8e-9, conformality: 1 },
  { op: 'deposit', material: 'si3n4', thickness_m: 10e-9, conformality: 1 },
  { op: 'deposit', material: 'si', thickness_m: 8e-9, conformality: 1 },
  { op: 'deposit', material: 'si3n4', thickness_m: 10e-9, conformality: 1 },
  { op: 'deposit', material: 'si', thickness_m: 8e-9, conformality: 1 },
  // pattern the stack into a fin along y (keep x ∈ [0.4, 0.6))
  { op: 'spinResist', thickness_m: 60e-9 },
  {
    op: 'expose',
    dose: 1,
    blurCells: 0,
    mask: [
      { x0: 0, y0: 0, x1: 0.4, y1: 1 },
      { x0: 0.6, y0: 0, x1: 1, y1: 1 },
    ],
  },
  { op: 'develop', threshold: 0.5 },
  { op: 'etch', depth_m: 54e-9, anisotropy: 1, rates: { si: 1, si3n4: 1 } },
  { op: 'strip' },
  // selective release: dissolve ONLY the sacrificial layers (selectivity!)
  { op: 'etch', depth_m: 200e-9, anisotropy: 0, rates: { si3n4: 1 } },
  // conformal gate dielectric + metal wrap fills the cavities (GAA!)
  { op: 'deposit', material: 'highk', thickness_m: 2e-9, conformality: 1 },
  { op: 'deposit', material: 'metal', thickness_m: 6e-9, conformality: 1 },
];
