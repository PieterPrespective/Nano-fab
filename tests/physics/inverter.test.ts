import { describe, expect, it } from 'vitest';
import { drainCurrent, type DeviceParams } from '../../src/physics/device';
import { inverterMetrics, inverterVTC, inverterVout } from '../../src/physics/inverter';

/** Well-tempered GAA device — makes a crisp inverter. */
const GOOD: DeviceParams = {
  arch: 'gaa',
  gateLength_m: 22e-9,
  eot_m: 0.8e-9,
  bodyThickness_m: 5e-9,
  sheetWidth_m: 25e-9,
  nStack: 3,
  vth0_V: 0.25,
  vdd_V: 0.7,
  temperature_K: 300,
};

/** Leaky short planar device — the drain owns its threshold. */
const BAD: DeviceParams = {
  ...GOOD,
  arch: 'planar',
  gateLength_m: 13e-9,
  eot_m: 1e-9,
  nStack: 1,
};

const VDD = 0.7;

describe('inverterVout (CMOS balance point)', () => {
  it('rails: input low ⇒ output ≈ Vdd; input high ⇒ output ≈ 0 (a NOT gate)', () => {
    expect(inverterVout(GOOD, 0, VDD)).toBeGreaterThan(0.97 * VDD);
    expect(inverterVout(GOOD, VDD, VDD)).toBeLessThan(0.03 * VDD);
  });

  it('the returned Vout balances the two device currents', () => {
    for (const vin of [0.2, 0.35, 0.5]) {
      const vout = inverterVout(GOOD, vin, VDD);
      const idn = drainCurrent(GOOD, vin, vout);
      const idp = drainCurrent(GOOD, VDD - vin, VDD - vout); // symmetric p mirror
      expect(Math.abs(idn - idp)).toBeLessThan(1e-3 * Math.max(idn, idp, 1e-12));
    }
  });

  it('VTC is monotonically non-increasing', () => {
    const vtc = inverterVTC(GOOD, VDD, 101);
    for (let i = 1; i < vtc.length; i++) {
      expect(vtc[i]!.vout_V).toBeLessThanOrEqual(vtc[i - 1]!.vout_V + 1e-9);
    }
  });
});

describe('inverterMetrics', () => {
  const good = inverterMetrics(GOOD, VDD);
  const bad = inverterMetrics(BAD, VDD);

  it('symmetric devices switch at ~Vdd/2', () => {
    expect(Math.abs(good.vm_V - VDD / 2)).toBeLessThan(0.05 * VDD);
  });

  it('a good device gives near-rail swing and real gain', () => {
    expect(good.swing_V).toBeGreaterThan(0.95 * VDD);
    expect(good.gain).toBeGreaterThan(5);
    expect(good.nmLow_V).toBeGreaterThan(0.15);
    expect(good.nmHigh_V).toBeGreaterThan(0.15);
  });

  it('the leaky short-channel device makes a visibly worse logic gate', () => {
    expect(bad.gain).toBeLessThan(good.gain);
    expect(bad.nmLow_V + bad.nmHigh_V).toBeLessThan(good.nmLow_V + good.nmHigh_V);
    expect(bad.swing_V).toBeLessThanOrEqual(good.swing_V + 1e-9);
  });

  it('noise margins are consistent with the VTC rails', () => {
    // NM_L = V_IL − V_OL ≥ 0, NM_H = V_OH − V_IH ≥ 0, both < Vdd
    for (const m of [good, bad]) {
      expect(m.nmLow_V).toBeGreaterThanOrEqual(0);
      expect(m.nmHigh_V).toBeGreaterThanOrEqual(0);
      expect(m.nmLow_V).toBeLessThan(VDD);
      expect(m.nmHigh_V).toBeLessThan(VDD);
    }
  });
});
