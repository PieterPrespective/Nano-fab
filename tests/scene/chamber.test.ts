import { describe, expect, it } from 'vitest';
import { LevelValidationError } from '../../src/engine/levels';
import {
  chamberMetrics,
  fireShot,
  initialChamberState,
  parseChamberSetup,
  placeCharge,
  probeField,
  simulateShot,
} from '../../src/scene/chamber';
import { rawLevelsV2 } from '../../src/levels/index';

const c1_01 = (rawLevelsV2[0] as { scene: { setup: unknown } }).scene.setup;
const c1_04 = (rawLevelsV2[3] as { scene: { setup: unknown } }).scene.setup;

describe('parseChamberSetup', () => {
  it('parses shipped setups; nC converts to C', () => {
    const s = parseChamberSetup(c1_01);
    expect(s.launcher.speed_ms).toBe(1e7);
    expect(s.regions[0]!.ey_Vm).toBe(-200);
    const s3 = parseChamberSetup((rawLevelsV2[2] as { scene: { setup: unknown } }).scene.setup);
    expect(s3.charges[0]!.q_C).toBeCloseTo(-3e-9, 15);
    expect(s3.placeable?.count).toBe(2);
    expect(s3.placeable?.q_C).toBeCloseTo(-3e-9, 15);
  });

  it('rejects malformed setups with path-precise errors', () => {
    expect(() => parseChamberSetup({ launcher: { x: 0.1 } })).toThrow(LevelValidationError);
    expect(() => parseChamberSetup(null)).toThrow(/scene\.setup/);
  });
});

describe('chamber simulation', () => {
  const setup = parseChamberSetup(c1_01);

  it('obstacles absorb; the aperture blocks off-axis shots (c1-04)', () => {
    const impl = parseChamberSetup(c1_04);
    const blocked = simulateShot(impl, initialChamberState(), 8e6, 1.2e6);
    expect(blocked.hit).toBe(false);
    // truncated at the aperture, well before the right wall
    expect(blocked.points[blocked.points.length - 1]!.x_m).toBeLessThan(0.7);
  });

  it('energy window: only the right launch speed implants (c1-04)', () => {
    const impl = parseChamberSetup(c1_04);
    expect(simulateShot(impl, initialChamberState(), 8e6, 0).hit).toBe(true);
    expect(simulateShot(impl, initialChamberState(), 4e6, 0).hit).toBe(false); // too shallow
    expect(simulateShot(impl, initialChamberState(), 1.2e7, 0).hit).toBe(false); // too deep
  });

  it('polarity flips the curve direction (c1-02 lesson)', () => {
    const electron = simulateShot(setup, initialChamberState(), 1e7, 0);
    const positive = simulateShot(setup, { ...initialChamberState(), polarity: -1 }, 1e7, 0);
    const yE = electron.points[electron.points.length - 1]!.y_m;
    const yP = positive.points[positive.points.length - 1]!.y_m;
    expect(yE).toBeGreaterThan(setup.launcher.y); // electron rises in this field
    expect(yP).toBeLessThan(setup.launcher.y); // positive falls
  });

  it('placeCharge honors the placement budget', () => {
    const s3 = parseChamberSetup((rawLevelsV2[2] as { scene: { setup: unknown } }).scene.setup);
    let st = initialChamberState();
    st = placeCharge(s3, st, 0.3, 0.3);
    st = placeCharge(s3, st, 0.4, 0.3);
    const full = placeCharge(s3, st, 0.5, 0.3);
    expect(full.placed).toHaveLength(2); // budget is 2
    expect(placeCharge(setup, initialChamberState(), 0.5, 0.5).placed).toHaveLength(0); // c1-01: none
  });

  it('metrics: hits, fraction, shots, landing energy', () => {
    let st = fireShot(setup, initialChamberState(), 1e7, 3e6); // miss
    st = fireShot(setup, st, 1e7, 0); // hit
    const m = chamberMetrics(setup, st);
    expect(m.hits).toBe(1);
    expect(m.shotsUsed).toBe(2);
    expect(m.hitFraction).toBeCloseTo(0.5, 9);
    expect(m.landingEnergy_J).toBeGreaterThan(0);
  });

  it('probeField reports the superposed field (uniform region here)', () => {
    const [ex, ey] = probeField(setup, initialChamberState(), 0.5, 0.4);
    expect(ex).toBe(0);
    expect(ey).toBe(-200);
  });
});
