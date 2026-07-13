import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, normal, poisson } from '../../src/physics/rng';

describe('createRng', () => {
  it('is deterministic: same seed ⇒ same sequence', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it('stays in [0,1) with sane mean/variance', () => {
    const rng = createRng(42);
    let sum = 0;
    let sumSq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
    expect(variance).toBeGreaterThan(1 / 12 - 0.01); // uniform: 1/12 ≈ 0.0833
    expect(variance).toBeLessThan(1 / 12 + 0.01);
  });
});

describe('deriveSeed', () => {
  it('nearby stream ids give unrelated streams', () => {
    const a = createRng(deriveSeed(7, 0));
    const b = createRng(deriveSeed(7, 1));
    expect(a()).not.toBe(b());
  });
});

describe('distributions', () => {
  it('normal: mean ≈ 0, sd ≈ 1', () => {
    const rng = createRng(9);
    let sum = 0;
    let sumSq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = normal(rng);
      sum += v;
      sumSq += v * v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(sumSq / n).toBeGreaterThan(0.95);
    expect(sumSq / n).toBeLessThan(1.05);
  });

  it('poisson: mean ≈ variance ≈ λ in both regimes', () => {
    const rng = createRng(11);
    for (const lambda of [3, 80]) {
      let sum = 0;
      let sumSq = 0;
      const n = 8000;
      for (let i = 0; i < n; i++) {
        const v = poisson(rng, lambda);
        sum += v;
        sumSq += v * v;
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      expect(Math.abs(mean - lambda) / lambda).toBeLessThan(0.05);
      expect(Math.abs(variance - lambda) / lambda).toBeLessThan(0.12);
    }
    expect(poisson(createRng(1), 0)).toBe(0);
  });
});
