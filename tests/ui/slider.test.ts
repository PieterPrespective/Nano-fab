import { describe, expect, it } from 'vitest';
import type { NumericControl } from '../../src/engine/levels';
import { sliderToValue, valueToSlider } from '../../src/ui/slider';

const linear: NumericControl = { kind: 'numeric', min: 0.6e-9, max: 2e-9, init: 1e-9, scale: 'linear' };
const log: NumericControl = { kind: 'numeric', min: 12e-9, max: 60e-9, init: 12e-9, scale: 'log' };
const stepped: NumericControl = { kind: 'numeric', min: 1, max: 4, init: 1, scale: 'linear', step: 1 };

describe('slider mapping', () => {
  it('endpoints map exactly', () => {
    expect(sliderToValue(0, linear)).toBe(linear.min);
    expect(sliderToValue(1, linear)).toBe(linear.max);
    expect(sliderToValue(0, log)).toBeCloseTo(log.min, 18);
    expect(sliderToValue(1, log)).toBeCloseTo(log.max, 18);
  });

  it('round-trips value → t → value for both scales (property)', () => {
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      for (const spec of [linear, log]) {
        const v = sliderToValue(t, spec);
        const t2 = valueToSlider(v, spec);
        expect(Math.abs(t2 - t)).toBeLessThan(1e-9);
      }
    }
  });

  it('log scale is geometric: mid-slider is the geometric mean', () => {
    const mid = sliderToValue(0.5, log);
    expect(mid).toBeCloseTo(Math.sqrt(log.min * log.max), 15);
  });

  it('clamps out-of-range positions and values', () => {
    expect(sliderToValue(-3, linear)).toBe(linear.min);
    expect(sliderToValue(7, linear)).toBe(linear.max);
    expect(valueToSlider(-1, linear)).toBe(0);
    expect(valueToSlider(1, linear)).toBe(1);
  });

  it('snaps stepped controls to integers', () => {
    expect(sliderToValue(0.4, stepped)).toBe(2);
    expect(sliderToValue(0.55, stepped)).toBe(3);
    expect(sliderToValue(0.99, stepped)).toBe(4);
  });
});
