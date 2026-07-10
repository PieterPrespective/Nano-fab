import { describe, expect, it } from 'vitest';
import { parseLevel, resolveParams } from '../../src/engine/levels';
import { evaluate } from '../../src/engine/scoring';
import { VALID_LEVEL } from './levels.test';

/** A level whose targets we can steer precisely via vdd/geometry. */
function levelWith(overrides: Record<string, unknown>) {
  return parseLevel({ ...JSON.parse(JSON.stringify(VALID_LEVEL)), ...overrides });
}

describe('evaluate', () => {
  it('S1: boundary semantics — exactly-equal passes for both ops', () => {
    const level = levelWith({});
    const params = resolveParams(level, { arch: 'gaa', gateLength_m: 24e-9, eot_m: 0.8e-9, nStack: 4 });
    const ev = evaluate(level, params);
    // Rebuild the same level with targets set to the exact achieved values.
    const exact = levelWith({
      targets: [
        { metric: 'dibl_VperV', op: '<=', value: ev.metrics.dibl_VperV, label: 'exact <=' },
        { metric: 'ion_A', op: '>=', value: ev.metrics.ion_A, label: 'exact >=' },
      ],
    });
    const ev2 = evaluate(exact, params);
    expect(ev2.targets.every((t) => t.pass)).toBe(true);
    expect(ev2.passed).toBe(true);
  });

  it('S1b: a failing target fails the level and reports actuals', () => {
    const impossible = levelWith({
      targets: [{ metric: 'ss_VperDec', op: '<=', value: 0.050, label: 'beat Boltzmann' }],
    });
    const ev = evaluate(impossible, resolveParams(impossible, {}));
    expect(ev.passed).toBe(false);
    expect(ev.stars).toBe(0);
    expect(ev.targets[0]!.actual).toBeGreaterThan(0.059);
  });

  it('S2: star ladder in both directions', () => {
    const level = levelWith({});
    const params = resolveParams(level, { arch: 'gaa', gateLength_m: 24e-9, eot_m: 0.8e-9, nStack: 4 });
    const base = evaluate(level, params);
    expect(base.passed).toBe(true);
    const leak = base.metrics.leakagePower_W;

    const mk = (direction: 'min' | 'max', two: number, three: number) =>
      evaluate(
        levelWith({ stars: { metric: 'leakagePower_W', direction, two, three } }),
        params,
      ).stars;

    // min: lower is better
    expect(mk('min', leak * 2, leak * 1.5)).toBe(3); // beats both
    expect(mk('min', leak * 2, leak * 0.5)).toBe(2); // beats two only
    expect(mk('min', leak * 0.5, leak * 0.25)).toBe(1); // beats neither
    // max: higher is better
    expect(mk('max', leak * 0.5, leak * 0.9)).toBe(3);
    expect(mk('max', leak * 0.9, leak * 2)).toBe(2);
    expect(mk('max', leak * 2, leak * 3)).toBe(1);
  });
});
