import { describe, expect, it } from 'vitest';
import { resample, scoreChoose, scoreMark, scoreSketch, type Pt } from '../../src/ui/predict';

const line = (pts: Array<[number, number]>): Pt[] => pts.map(([x, y]) => ({ x, y }));

describe('resample', () => {
  it('spaces points evenly by arc length regardless of input density', () => {
    const dense = line([[0, 0], [1, 0], [1.1, 0], [1.2, 0], [10, 0]]);
    const r = resample(dense, 5);
    expect(r.map((p) => p.x)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('handles degenerate inputs', () => {
    expect(resample([], 4)).toEqual([]);
    expect(resample(line([[3, 3]]), 3)).toHaveLength(3);
    expect(resample(line([[1, 1], [1, 1]]), 3)[2]).toEqual({ x: 1, y: 1 });
  });
});

describe('scoreSketch', () => {
  const truth = line([[0, 0], [5, 2], [10, 8]]);
  const diag = Math.hypot(10, 8);

  it('a faithful sketch scores near 1 even with different sampling', () => {
    const sketch = resample(truth, 7);
    // sparse resampling chords the corner slightly — near-1, not exactly 1
    expect(scoreSketch(sketch, truth, diag)).toBeGreaterThan(0.95);
    expect(scoreSketch(truth, truth, diag)).toBeCloseTo(1, 9); // identical input IS exact
  });

  it('scores fall monotonically with deviation; far sketches hit 0', () => {
    const offset = (d: number) => truth.map((p) => ({ x: p.x, y: p.y + d }));
    const s1 = scoreSketch(offset(0.5), truth, diag);
    const s2 = scoreSketch(offset(1.5), truth, diag);
    const s3 = scoreSketch(offset(100), truth, diag);
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeGreaterThan(s3);
    expect(s3).toBe(0);
    expect(s1).toBeLessThan(1);
  });

  it('deviation equal to the tolerance band scores ~0.5', () => {
    const tolDev = 0.12 * diag;
    const sketch = truth.map((p) => ({ x: p.x, y: p.y + tolDev }));
    expect(scoreSketch(sketch, truth, diag)).toBeCloseTo(0.5, 2);
  });

  it('degenerate inputs score 0', () => {
    expect(scoreSketch([], truth, diag)).toBe(0);
    expect(scoreSketch(truth, truth, 0)).toBe(0);
  });
});

describe('scoreMark / scoreChoose', () => {
  it('mark: full credit inside radius, linear falloff, zero at 3r', () => {
    const t = { x: 10, y: 10 };
    expect(scoreMark({ x: 10.5, y: 10 }, t, 1)).toBe(1);
    expect(scoreMark({ x: 12, y: 10 }, t, 1)).toBeCloseTo(0.5, 9);
    expect(scoreMark({ x: 13, y: 10 }, t, 1)).toBe(0);
    expect(scoreMark({ x: 50, y: 50 }, t, 1)).toBe(0);
    expect(scoreMark(t, t, 0)).toBe(0);
  });

  it('choose is exact-match', () => {
    expect(scoreChoose(2, 2)).toBe(1);
    expect(scoreChoose(1, 2)).toBe(0);
  });
});
