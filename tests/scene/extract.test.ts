import { describe, expect, it } from 'vitest';
import { deviceMetrics } from '../../src/physics/device';
import { extractDevice } from '../../src/scene/extract';
import { Timeline } from '../../src/scene/timeline';
import { GAA_RELEASE, PITCH, PLANAR_MOSFET, substrate } from '../helpers/recipes';

describe('extractDevice: the Ch6 → Ch2 bridge', () => {
  it('measures the planar recipe within 5% of recipe intent', () => {
    const w = new Timeline(substrate()).run(PLANAR_MOSFET).at(-1)!;
    const { params, gateAt } = extractDevice(w);
    expect(gateAt).not.toBeNull();
    expect(params.arch).toBe('planar');
    // gate stripe y∈[0.42,0.58) on a 24-grid covers cells j=10..13 → 4·pitch
    const intentGateLength = 4 * PITCH;
    expect(Math.abs(params.gateLength_m - intentGateLength) / intentGateLength).toBeLessThanOrEqual(0.05);
    // thermal oxide step grew 2 nm of gate dielectric
    expect(Math.abs(params.eot_m - 2e-9) / 2e-9).toBeLessThanOrEqual(0.05);
  });

  it('recognizes the GAA build: wrapped sheets counted as the stack', () => {
    const w = new Timeline(substrate()).run(GAA_RELEASE).at(-1)!;
    const { params } = extractDevice(w);
    expect(params.arch).toBe('gaa');
    expect(params.nStack).toBe(3);
    expect(params.bodyThickness_m).toBeCloseTo(8e-9, 12);
  });

  it('the extracted device runs through the phase-1 physics and switches', () => {
    const w = new Timeline(substrate()).run(PLANAR_MOSFET).at(-1)!;
    const m = deviceMetrics(extractDevice(w).params);
    expect(m.ionOverIoff).toBeGreaterThan(5e2); // a 32 nm planar device switches (barely — it IS planar)
    expect(m.ss_VperDec).toBeGreaterThan(0.0595); // and still bows to Boltzmann
  });

  it('a blank wafer yields defaults with no gate location', () => {
    const { params, gateAt } = extractDevice(substrate());
    expect(gateAt).toBeNull();
    expect(params.arch).toBe('planar');
  });
});
