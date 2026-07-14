/**
 * Ch2 energy terrain: the transistor's conduction-band edge as a landscape
 * (prompts/nf03/05 §Ch2). No new physics — every number is derived from the
 * phase-1 compact model in `device.ts`, so the terrain and the Id–Vg inset
 * can never disagree.
 *
 * Fidelity: subthreshold conduction is thermionic emission over a barrier —
 * Id ∝ exp(−Eb/kT) with Eb ≈ q(Vth−Vg)/n. The ball crowd makes that literal:
 * flux-weighted crossing energies of a 1-D thermal ensemble are exponential
 * (p(E) = e^(−E/kT)/kT), so the fraction that crests the hill is exactly
 * exp(−Eb/kT) — one decade per n·kT·ln10 of gate voltage, the 59.6 mV/dec
 * anchor seen as falling balls. DIBL appears as the drain tilt eroding the
 * hilltop (Vth ← Vth0 − DIBL·Vds), same as the device model.
 */

import {
  electrostatics,
  thermalVoltage,
  type DeviceParams,
} from './device';
import { createRng } from './rng';

export interface Bias {
  /** Gate voltage (V). */
  vg_V: number;
  /** Drain-source voltage (V). */
  vds_V: number;
}

/**
 * Height of the source→channel energy barrier (eV, per electron).
 * Eb = max(0, (Vth − Vg)/n): dividing by the ideality n makes the terrain's
 * Boltzmann tail reproduce the device model's subthreshold swing exactly.
 */
export function barrierHeight_eV(p: DeviceParams, bias: Bias): number {
  const { ss_VperDec, dibl_VperV } = electrostatics(p);
  const n = ss_VperDec / (thermalVoltage(p.temperature_K) * Math.LN10);
  const vth = p.vth0_V - dibl_VperV * bias.vds_V;
  return Math.max(0, (vth - bias.vg_V) / n);
}

export interface TerrainPoint {
  /** Position along source(0) → drain(1). */
  x_frac: number;
  /** Conduction-band edge relative to the source Fermi level (eV). */
  e_eV: number;
}

/** Gaussian bump width of the channel barrier (fraction of the strip). */
const BUMP_SIGMA = 0.12;
/** The drain floor ramps down over this x-range. */
const DRAIN_RAMP: [number, number] = [0.5, 0.9];

const smoothstep = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * Conduction-band profile along the channel: flat source at 0, a Gaussian
 * barrier peaking at `barrierHeight_eV` mid-channel, and a drain floor at
 * −Vds. Shape constants are cosmetic; the peak and the floor are physics.
 */
export function terrainProfile(p: DeviceParams, bias: Bias, points = 121): TerrainPoint[] {
  const eb = barrierHeight_eV(p, bias);
  const out: TerrainPoint[] = [];
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    const bump = Math.exp(-((x - 0.5) ** 2) / (2 * BUMP_SIGMA * BUMP_SIGMA));
    const drain = smoothstep((x - DRAIN_RAMP[0]) / (DRAIN_RAMP[1] - DRAIN_RAMP[0]));
    out.push({ x_frac: x, e_eV: eb * bump - bias.vds_V * drain });
  }
  return out;
}

/**
 * Relative arrival rate of balls over the barrier: ν·exp(−Eb/kT).
 * ν is an arbitrary attempt rate (default 1) — the game only ever shows and
 * scores ratios, which match the device model's subthreshold current ratios
 * (consistency-tested to ±10%).
 */
export function arrivalRate(p: DeviceParams, bias: Bias, attemptRate = 1): number {
  const phit = thermalVoltage(p.temperature_K);
  return attemptRate * Math.exp(-barrierHeight_eV(p, bias) / phit);
}

/**
 * Seeded thermal crowd: flux-weighted crossing energies (eV), exponential
 * with mean kT. Inverse-CDF sampling keeps it deterministic per seed.
 */
export function sampleCrowdEnergies_eV(seed: number, count: number, temperature_K: number): number[] {
  const rng = createRng(seed);
  const kt = thermalVoltage(temperature_K);
  const out: number[] = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    // u ∈ (0,1]: guard the log
    const u = 1 - rng();
    out[i] = -kt * Math.log(u > 0 ? u : Number.MIN_VALUE);
  }
  return out;
}

/** Fraction of the crowd with energy above the barrier. */
export function crowdFractionOver(energies_eV: readonly number[], barrier_eV: number): number {
  if (energies_eV.length === 0) return 0;
  let n = 0;
  for (const e of energies_eV) if (e > barrier_eV) n++;
  return n / energies_eV.length;
}
