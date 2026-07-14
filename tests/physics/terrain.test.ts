import { describe, expect, it } from 'vitest';
import { drainCurrent, thermalVoltage, type DeviceParams } from '../../src/physics/device';
import {
  arrivalRate,
  barrierHeight_eV,
  crowdFractionOver,
  sampleCrowdEnergies_eV,
  terrainProfile,
} from '../../src/physics/terrain';

/** Well-tempered GAA device: mild short-channel effects, vth ≈ vth0. */
const GAA: DeviceParams = {
  arch: 'gaa',
  gateLength_m: 24e-9,
  eot_m: 0.8e-9,
  bodyThickness_m: 6e-9,
  sheetWidth_m: 25e-9,
  nStack: 3,
  vth0_V: 0.3,
  vdd_V: 0.7,
  temperature_K: 300,
};

/** Leaky short planar device: strong DIBL, the Ch2 "bullying drain". */
const PLANAR: DeviceParams = {
  ...GAA,
  arch: 'planar',
  gateLength_m: 18e-9,
  eot_m: 1e-9,
  nStack: 1,
};

describe('barrierHeight_eV', () => {
  it('vanishes at threshold and grows as the gate shuts', () => {
    expect(barrierHeight_eV(GAA, { vg_V: GAA.vth0_V, vds_V: 0.05 })).toBeLessThan(0.02);
    const shut = barrierHeight_eV(GAA, { vg_V: 0, vds_V: 0.05 });
    const half = barrierHeight_eV(GAA, { vg_V: 0.15, vds_V: 0.05 });
    expect(shut).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(0);
  });

  it('never goes negative (above threshold the barrier is just gone)', () => {
    expect(barrierHeight_eV(GAA, { vg_V: GAA.vdd_V, vds_V: GAA.vdd_V })).toBe(0);
  });

  it('DIBL: raising Vds erodes the barrier — dramatically on the short planar device', () => {
    const at = (p: DeviceParams, vds: number): number =>
      barrierHeight_eV(p, { vg_V: 0, vds_V: vds });
    const planarDrop = at(PLANAR, 0.05) - at(PLANAR, 0.7);
    const gaaDrop = at(GAA, 0.05) - at(GAA, 0.7);
    expect(planarDrop).toBeGreaterThan(5 * gaaDrop);
    expect(gaaDrop).toBeGreaterThanOrEqual(0);
  });
});

describe('terrainProfile', () => {
  it('source sits at 0, the peak is the barrier height, the drain floor is −Vds', () => {
    const bias = { vg_V: 0.1, vds_V: 0.5 };
    const prof = terrainProfile(GAA, bias, 201);
    expect(prof).toHaveLength(201);
    expect(prof[0]!.e_eV).toBeCloseTo(0, 3);
    expect(prof[200]!.e_eV).toBeCloseTo(-0.5, 3);
    const peak = Math.max(...prof.map((p) => p.e_eV));
    expect(peak).toBeCloseTo(barrierHeight_eV(GAA, bias), 3);
    // x runs 0..1 monotonically
    expect(prof[0]!.x_frac).toBe(0);
    expect(prof[200]!.x_frac).toBe(1);
  });

  it('descends monotonically from the peak to the drain (balls do not get trapped)', () => {
    const prof = terrainProfile(PLANAR, { vg_V: 0, vds_V: 0.7 }, 201);
    const peakIdx = prof.reduce((bi, p, i) => (p.e_eV > prof[bi]!.e_eV ? i : bi), 0);
    for (let i = peakIdx + 1; i < prof.length; i++) {
      expect(prof[i]!.e_eV).toBeLessThanOrEqual(prof[i - 1]!.e_eV + 1e-12);
    }
  });
});

describe('ball crowd', () => {
  it('flux-weighted energies are exponential: mean = kT, crossing fraction = exp(−Eb/kT)', () => {
    const kt = thermalVoltage(300); // eV numerically
    const e = sampleCrowdEnergies_eV(42, 20000, 300);
    const mean = e.reduce((a, b) => a + b, 0) / e.length;
    expect(Math.abs(mean - kt) / kt).toBeLessThan(0.03);
    for (const mult of [1, 2, 3]) {
      const eb = mult * kt;
      const frac = crowdFractionOver(e, eb);
      expect(Math.abs(frac - Math.exp(-mult))).toBeLessThan(0.012);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = sampleCrowdEnergies_eV(7, 100, 300);
    const b = sampleCrowdEnergies_eV(7, 100, 300);
    const c = sampleCrowdEnergies_eV(8, 100, 300);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('arrival rate ↔ drain current consistency (the terrain IS the device)', () => {
  it('subthreshold rate ratios track the phase-1 model within ±10%', () => {
    const vds = 0.7;
    const pairs: Array<[number, number]> = [
      [0, 0.06],
      [0, 0.12],
      [0.06, 0.12],
    ];
    for (const [vg1, vg2] of pairs) {
      const rateRatio =
        arrivalRate(GAA, { vg_V: vg2, vds_V: vds }) / arrivalRate(GAA, { vg_V: vg1, vds_V: vds });
      const idRatio = drainCurrent(GAA, vg2, vds) / drainCurrent(GAA, vg1, vds);
      expect(Math.abs(rateRatio - idRatio) / idRatio).toBeLessThan(0.1);
    }
  });

  it('DIBL leakage shows up in the balls too: Vds ↑ ⇒ off-state arrivals ↑ (planar)', () => {
    const lo = arrivalRate(PLANAR, { vg_V: 0, vds_V: 0.05 });
    const hi = arrivalRate(PLANAR, { vg_V: 0, vds_V: 0.7 });
    const idLo = drainCurrent(PLANAR, 0, 0.05);
    const idHi = drainCurrent(PLANAR, 0, 0.7);
    expect(hi / lo).toBeGreaterThan(3);
    // trend agrees with the device model within a factor comfortably < 2×
    const rateGain = hi / lo;
    const idGain = idHi / idLo;
    expect(rateGain / idGain).toBeGreaterThan(0.5);
    expect(rateGain / idGain).toBeLessThan(2);
  });

  it('a taller barrier means exponentially fewer arrivals (Boltzmann tail anchor)', () => {
    const kt = thermalVoltage(300);
    const r1 = arrivalRate(GAA, { vg_V: 0.2, vds_V: 0.7 });
    const eb1 = barrierHeight_eV(GAA, { vg_V: 0.2, vds_V: 0.7 });
    // lower vg by exactly n·kT·ln10 ⇒ barrier +kT·ln10 ⇒ rate ÷10 (one decade
    // of subthreshold swing, the 59.6 mV/dec anchor seen from the terrain)
    const n = 1.029; // ≈ ideality of the well-tempered GAA fixture
    const r2 = arrivalRate(GAA, { vg_V: 0.2 - n * kt * Math.LN10, vds_V: 0.7 });
    const eb2 = barrierHeight_eV(GAA, { vg_V: 0.2 - n * kt * Math.LN10, vds_V: 0.7 });
    expect(eb2 - eb1).toBeGreaterThan(0);
    expect(r1 / r2).toBeGreaterThan(8);
    expect(r1 / r2).toBeLessThan(12.5);
  });
});
