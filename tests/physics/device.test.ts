import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  deviceMetrics,
  drainCurrent,
  effectiveWidth,
  electrostatics,
  gateLeakage,
  gidl,
  idVgCurve,
  thermalVoltage,
  type DeviceParams,
} from '../../src/physics/device';
import {
  LONG_CHANNEL,
  N5_FINFET,
  N5_GAA,
  N5_PLANAR,
  makeRng,
  randomDevice,
} from '../helpers/devices';

const MV_PER_DEC = 1000; // V/dec → mV/dec for readable assertions

/** Golden-fixture helper: UPDATE_GOLDEN=1 regenerates, otherwise compares. */
function golden(name: string, actual: unknown): void {
  const path = join(__dirname, '..', 'fixtures', 'device', name);
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(actual, null, 1));
    return;
  }
  if (!existsSync(path)) throw new Error(`missing golden fixture ${name}; run UPDATE_GOLDEN=1 npm test`);
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  expectCloseDeep(actual, expected, 1e-9);
}

function expectCloseDeep(a: unknown, b: unknown, relTol: number): void {
  if (typeof a === 'number' && typeof b === 'number') {
    const scale = Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
    expect(Math.abs(a - b) / scale).toBeLessThanOrEqual(relTol);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    expect(a.length).toBe(b.length);
    a.forEach((v, i) => expectCloseDeep(v, b[i], relTol));
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort()).toEqual(Object.keys(b as object).sort());
    for (const k of Object.keys(a)) {
      expectCloseDeep((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], relTol);
    }
  } else {
    expect(a).toEqual(b);
  }
}

describe('electrostatics', () => {
  it('E1: Boltzmann floor — long channel sits at kT/q·ln10, nothing beats it', () => {
    const ss = electrostatics(LONG_CHANNEL).ss_VperDec * MV_PER_DEC;
    expect(ss).toBeGreaterThan(59.1);
    expect(ss).toBeLessThan(60.1);
    const rng = makeRng(42);
    for (let i = 0; i < 5000; i++) {
      const d = randomDevice(rng);
      expect(electrostatics(d).ss_VperDec * MV_PER_DEC).toBeGreaterThanOrEqual(59.5);
    }
  });

  it('E2: SS scales linearly with temperature (kT/q)', () => {
    const cold = electrostatics(LONG_CHANNEL).ss_VperDec;
    const hot = electrostatics({ ...LONG_CHANNEL, temperature_K: 350 }).ss_VperDec;
    expect(hot / cold).toBeCloseTo(350 / 300, 3);
    expect(thermalVoltage(300)).toBeCloseTo(0.025852, 5);
  });

  it('E3: long-channel DIBL is negligible', () => {
    expect(electrostatics(LONG_CHANNEL).dibl_VperV * 1000).toBeLessThan(1); // < 1 mV/V
  });

  it('E4: SS and DIBL strictly worsen as Lg shrinks', () => {
    let prevSs = 0;
    let prevDibl = 0;
    for (const lg of [30e-9, 25e-9, 20e-9, 15e-9, 10e-9]) {
      const es = electrostatics({ ...N5_GAA, gateLength_m: lg });
      expect(es.ss_VperDec).toBeGreaterThan(prevSs);
      expect(es.dibl_VperV).toBeGreaterThan(prevDibl);
      prevSs = es.ss_VperDec;
      prevDibl = es.dibl_VperV;
    }
  });

  it('E5: architecture ordering — planar worse than FinFET worse than GAA', () => {
    const p = electrostatics(N5_PLANAR);
    const f = electrostatics(N5_FINFET);
    const g = electrostatics(N5_GAA);
    expect(p.ss_VperDec).toBeGreaterThan(f.ss_VperDec);
    expect(f.ss_VperDec).toBeGreaterThan(g.ss_VperDec);
    expect(p.dibl_VperV).toBeGreaterThan(f.dibl_VperV);
    expect(f.dibl_VperV).toBeGreaterThan(g.dibl_VperV);
  });

  it('E6: thinning the body improves electrostatic control', () => {
    const thick = electrostatics({ ...N5_GAA, bodyThickness_m: 10e-9 });
    const thin = electrostatics({ ...N5_GAA, bodyThickness_m: 5e-9 });
    expect(thin.ss_VperDec).toBeLessThan(thick.ss_VperDec);
    expect(thin.dibl_VperV).toBeLessThan(thick.dibl_VperV);
  });

  it('E7: calibration windows at "5nm"-like dimensions', () => {
    const g = electrostatics(N5_GAA);
    expect(g.ss_VperDec * MV_PER_DEC).toBeGreaterThanOrEqual(62);
    expect(g.ss_VperDec * MV_PER_DEC).toBeLessThanOrEqual(75);
    expect(g.dibl_VperV * 1000).toBeGreaterThanOrEqual(20);
    expect(g.dibl_VperV * 1000).toBeLessThanOrEqual(80);
    const p = electrostatics(N5_PLANAR);
    expect(p.ss_VperDec * MV_PER_DEC).toBeGreaterThan(90); // planar died for a reason
    expect(p.dibl_VperV * 1000).toBeGreaterThan(150);
  });

  it('E8: golden — SS/DIBL vs Lg for all architectures', () => {
    const lgs = [10e-9, 14e-9, 18e-9, 22e-9, 26e-9, 30e-9];
    const table = (['planar', 'finfet', 'gaa'] as const).map((arch) =>
      lgs.map((lg) => {
        const es = electrostatics({ ...N5_GAA, arch, gateLength_m: lg });
        return { lg_m: lg, ss_VperDec: es.ss_VperDec, dibl_VperV: es.dibl_VperV };
      }),
    );
    golden('electrostatics.json', table);
  });
});

describe('effectiveWidth', () => {
  it('planar is the drawn width; FinFET adds sidewalls; GAA counts full perimeters', () => {
    expect(effectiveWidth(N5_PLANAR)).toBeCloseTo(25e-9, 12);
    expect(effectiveWidth(N5_FINFET)).toBeCloseTo(3 * (2 * 5e-9 + 25e-9), 12);
    expect(effectiveWidth(N5_GAA)).toBeCloseTo(3 * 2 * (5e-9 + 25e-9), 12);
  });
});

describe('drain current & leakage', () => {
  it('C1: numeric subthreshold slope matches analytic SS', () => {
    // Deep subthreshold (Vth0 = 0.4 V), where softplus ≈ exp is exact.
    const d: DeviceParams = { ...N5_GAA, vth0_V: 0.4 };
    const ss = electrostatics(d).ss_VperDec;
    const vg1 = 0.05;
    const vg2 = 0.15;
    const decades = Math.log10(drainCurrent(d, vg2, d.vdd_V) / drainCurrent(d, vg1, d.vdd_V));
    const numericSs = (vg2 - vg1) / decades;
    expect(numericSs / ss).toBeGreaterThan(0.98);
    expect(numericSs / ss).toBeLessThan(1.02);
  });

  it('C2: healthy "5nm"-like device — Ion/Ioff and current density in realistic windows', () => {
    const m = deviceMetrics(N5_GAA);
    expect(m.ionOverIoff).toBeGreaterThan(1e4);
    expect(m.ionOverIoff).toBeLessThan(1e7);
    const ionDensity_uA_per_um = m.ion_A / effectiveWidth(N5_GAA); // A/m ≡ µA/µm
    expect(ionDensity_uA_per_um).toBeGreaterThan(100);
    expect(ionDensity_uA_per_um).toBeLessThan(2000);
  });

  it('C3: Id is finite, non-negative, and strictly increasing in Vg (property)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 300; i++) {
      const d = randomDevice(rng);
      let prev = -1;
      for (let k = 0; k <= 30; k++) {
        const vg = (d.vdd_V * k) / 30;
        const id = drainCurrent(d, vg, d.vdd_V);
        expect(Number.isFinite(id)).toBe(true);
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeGreaterThan(prev);
        prev = id;
      }
    }
  });

  it('C4: DIBL shifts the subthreshold curve by 10^(DIBL·ΔVds/SS)', () => {
    // vds ∈ {0.2, 0.7}: both beyond the thermal drain-saturation knee, so the
    // ratio isolates the DIBL-induced Vth shift.
    const d: DeviceParams = { ...N5_GAA, vth0_V: 0.4 };
    const es = electrostatics(d);
    const ratio = drainCurrent(d, 0.1, 0.7) / drainCurrent(d, 0.1, 0.2);
    const expected = 10 ** ((es.dibl_VperV * 0.5) / es.ss_VperDec);
    expect(ratio / expected).toBeGreaterThan(0.9);
    expect(ratio / expected).toBeLessThan(1.1);
  });

  it('C5: drive current scales with the stacked effective width (GAA advantage)', () => {
    const two = deviceMetrics({ ...N5_GAA, nStack: 2 }).ion_A;
    const four = deviceMetrics({ ...N5_GAA, nStack: 4 }).ion_A;
    expect(four / two).toBeCloseTo(2, 6);
  });

  it('C6: gate tunneling grows ~10× per 0.25 nm of oxide thinning (why HKMG)', () => {
    const thick = gateLeakage(N5_GAA);
    const thin = gateLeakage({ ...N5_GAA, eot_m: N5_GAA.eot_m - 0.25e-9 });
    expect(thin / thick).toBeGreaterThan(8);
    expect(thin / thick).toBeLessThan(12);
  });

  it('C7: leakage crossover — tunneling irrelevant at EOT 1.2 nm, dominant at 0.6 nm', () => {
    const relaxed = deviceMetrics({ ...N5_GAA, eot_m: 1.2e-9 });
    expect(relaxed.gateLeakage_A / relaxed.ioff_A).toBeLessThan(0.1);
    const aggressive = deviceMetrics({ ...N5_GAA, eot_m: 0.6e-9 });
    expect(aggressive.gateLeakage_A / aggressive.ioff_A).toBeGreaterThan(0.5);
  });

  it('C8: GIDL grows with drain bias and thinner oxide', () => {
    expect(gidl({ ...N5_GAA, vdd_V: 0.9 })).toBeGreaterThan(gidl(N5_GAA));
    expect(gidl({ ...N5_GAA, eot_m: 0.7e-9 })).toBeGreaterThan(gidl(N5_GAA));
  });

  it('C9: raising Vdd buys drive but pays leakage power (dark-silicon tension)', () => {
    const lo = deviceMetrics(N5_GAA);
    const hi = deviceMetrics({ ...N5_GAA, vdd_V: 0.9 });
    expect(hi.ion_A).toBeGreaterThan(lo.ion_A);
    expect(hi.leakagePower_W).toBeGreaterThan(lo.leakagePower_W);
  });

  it('C10: golden — full Id–Vg curves for the reference devices', () => {
    const curves = [LONG_CHANNEL, N5_PLANAR, N5_FINFET, N5_GAA].map((d) => ({
      arch: d.arch,
      lowVds: idVgCurve(d, 0.05, { from_V: 0, to_V: d.vdd_V, points: 25 }),
      highVds: idVgCurve(d, d.vdd_V, { from_V: 0, to_V: d.vdd_V, points: 25 }),
      metrics: deviceMetrics(d),
    }));
    golden('idvg.json', curves);
  });
});

describe('the playable trade-off', () => {
  it('T1: SS ≤ 65 mV/dec is reachable in the l1-03 box (levels stay winnable)', () => {
    let best = Infinity;
    for (const lg of [20e-9, 30e-9, 40e-9]) {
      for (const t of [4e-9, 5e-9, 6e-9]) {
        const es = electrostatics({
          ...N5_GAA,
          gateLength_m: lg,
          bodyThickness_m: t,
          eot_m: 0.8e-9,
        });
        best = Math.min(best, es.ss_VperDec * MV_PER_DEC);
      }
    }
    expect(best).toBeLessThanOrEqual(65);
  });

  it('T2: the 60 mV/dec wall — no configuration in the whole box beats it', () => {
    const rng = makeRng(1234);
    for (let i = 0; i < 10000; i++) {
      expect(electrostatics(randomDevice(rng)).ss_VperDec * MV_PER_DEC).toBeGreaterThanOrEqual(59.5);
    }
  });

  it('T3: no free lunch — max-Ion and min-leakage configs differ', () => {
    const configs: DeviceParams[] = [];
    for (const lg of [14e-9, 18e-9, 25e-9, 35e-9]) {
      for (const eot of [0.6e-9, 0.9e-9, 1.2e-9]) {
        configs.push({ ...N5_GAA, gateLength_m: lg, eot_m: eot });
      }
    }
    const byIon = [...configs].sort((a, b) => deviceMetrics(b).ion_A - deviceMetrics(a).ion_A);
    const byLeak = [...configs].sort(
      (a, b) => deviceMetrics(a).leakagePower_W - deviceMetrics(b).leakagePower_W,
    );
    expect(byIon[0]).not.toEqual(byLeak[0]);
  });
});
