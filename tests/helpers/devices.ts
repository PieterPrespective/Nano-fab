import type { DeviceParams } from '../../src/physics/device';

/**
 * Named reference devices used across the physics test suites
 * (see prompts/nf01/02-device-physics-model.md §4).
 */

/** The textbook long-channel planar device: ideal electrostatics. */
export const LONG_CHANNEL: DeviceParams = {
  arch: 'planar',
  gateLength_m: 1e-6,
  eot_m: 2e-9,
  bodyThickness_m: 10e-9,
  sheetWidth_m: 1e-6,
  nStack: 1,
  vth0_V: 0.4,
  vdd_V: 1.0,
  temperature_K: 300,
};

/**
 * "5nm-like" hero device: ~18 nm gate length (the real gate length of the
 * "5nm" node per IRDS 2021), 3-sheet GAA stack.
 */
export const N5_GAA: DeviceParams = {
  arch: 'gaa',
  gateLength_m: 18e-9,
  eot_m: 0.9e-9,
  bodyThickness_m: 5e-9,
  sheetWidth_m: 25e-9,
  nStack: 3,
  vth0_V: 0.25,
  vdd_V: 0.7,
  temperature_K: 300,
};

/** Same dimensions, weaker gate wrap. */
export const N5_FINFET: DeviceParams = { ...N5_GAA, arch: 'finfet' };
export const N5_PLANAR: DeviceParams = { ...N5_GAA, arch: 'planar', nStack: 1 };

/** Playable parameter box (mirrors engine defaults/level ranges). */
export const PLAYABLE_BOX = {
  gateLength_m: [10e-9, 1e-6],
  eot_m: [0.5e-9, 3e-9],
  bodyThickness_m: [3e-9, 20e-9],
  sheetWidth_m: [5e-9, 50e-9],
  nStack: [1, 4],
  vth0_V: [0.15, 0.5],
  vdd_V: [0.4, 1.2],
} as const;

/** Deterministic LCG so property tests are reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function randomDevice(rng: () => number): DeviceParams {
  const pick = (lo: number, hi: number) => lo + (hi - lo) * rng();
  const pickLog = (lo: number, hi: number) => Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * rng());
  const archs = ['planar', 'finfet', 'gaa'] as const;
  return {
    arch: archs[Math.floor(rng() * 3)]!,
    gateLength_m: pickLog(...PLAYABLE_BOX.gateLength_m),
    eot_m: pick(...PLAYABLE_BOX.eot_m),
    bodyThickness_m: pick(...PLAYABLE_BOX.bodyThickness_m),
    sheetWidth_m: pick(...PLAYABLE_BOX.sheetWidth_m),
    nStack: 1 + Math.floor(rng() * 4),
    vth0_V: pick(...PLAYABLE_BOX.vth0_V),
    vdd_V: pick(...PLAYABLE_BOX.vdd_V),
    temperature_K: 300,
  };
}
