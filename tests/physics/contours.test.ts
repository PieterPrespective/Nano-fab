import { describe, expect, it } from 'vitest';
import {
  descentPath,
  gridGradient,
  gridValue,
  isolines,
  sampleField,
  type GridField,
} from '../../src/physics/contours';
import { K_COULOMB, potentialAt, type EmEnv } from '../../src/physics/em';

/** A single +q charge at the center of a 1×1 m window. */
const CHARGE_ENV: EmEnv = { charges: [{ q_C: 1e-9, x_m: 0.5, y_m: 0.5 }], regions: [] };
const chargeField = (n = 129): GridField =>
  sampleField((x, y) => potentialAt(x, y, CHARGE_ENV), 0, 0, 1, 1, n, n);

const polylineLength = (line: { x: number; y: number }[]): number => {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  return s;
};

describe('sampleField / gridValue / gridGradient', () => {
  it('samples a plane exactly and interpolates bilinearly between nodes', () => {
    const f = sampleField((x, y) => 2 * x + 3 * y, 0, 0, 1, 1, 11, 11);
    expect(gridValue(f, 0.5, 0.5)).toBeCloseTo(2.5, 12);
    // off-node point of a bilinear function is reproduced exactly
    expect(gridValue(f, 0.317, 0.481)).toBeCloseTo(2 * 0.317 + 3 * 0.481, 12);
  });

  it('gradient of a plane is the plane’s slope everywhere', () => {
    const f = sampleField((x, y) => 2 * x + 3 * y, 0, 0, 1, 1, 21, 21);
    const [gx, gy] = gridGradient(f, 0.4, 0.7);
    expect(gx).toBeCloseTo(2, 6);
    expect(gy).toBeCloseTo(3, 6);
  });

  it('clamps lookups outside the window instead of exploding', () => {
    const f = sampleField((x) => x, 0, 0, 1, 1, 5, 5);
    expect(gridValue(f, -3, 0.5)).toBeCloseTo(0, 12);
    expect(gridValue(f, 42, 0.5)).toBeCloseTo(1, 12);
  });
});

describe('marching-squares isolines', () => {
  it('golden: a point-charge equipotential is a circle of radius kq/V (± 2%)', () => {
    const f = chargeField();
    const r0 = 0.2;
    const level = (K_COULOMB * 1e-9) / r0;
    const lines = isolines(f, level);
    expect(lines.length).toBeGreaterThan(0);
    const pts = lines.flat();
    expect(pts.length).toBeGreaterThan(40);
    for (const p of pts) {
      const r = Math.hypot(p.x - 0.5, p.y - 0.5);
      expect(Math.abs(r - r0) / r0).toBeLessThan(0.02);
    }
    // ...and it closes into a full ring: total length ≈ 2πr
    const total = lines.reduce((a, l) => a + polylineLength(l), 0);
    expect(total).toBeGreaterThan(2 * Math.PI * r0 * 0.95);
    expect(total).toBeLessThan(2 * Math.PI * r0 * 1.05);
  });

  it('golden: equal-ΔV shells space out as 1/E — spacing grows ∝ r²', () => {
    const f = chargeField(257);
    const kq = K_COULOMB * 1e-9;
    const dv = 2; // volts between consecutive shells
    const meanRadius = (level: number): number => {
      const pts = isolines(f, level).flat();
      expect(pts.length).toBeGreaterThan(0);
      return pts.reduce((a, p) => a + Math.hypot(p.x - 0.5, p.y - 0.5), 0) / pts.length;
    };
    // measured Δr between the V(r) and V(r)+ΔV shells, vs the exact
    // analytic spacing kq·ΔV/(V·(V+ΔV)) — which is ΔV/E ∝ r² for small ΔV.
    const spacingAt = (r: number): number => {
      const v = kq / r;
      return Math.abs(meanRadius(v) - meanRadius(v + dv));
    };
    const exactSpacing = (r: number): number => {
      const v = kq / r;
      return (kq * dv) / (v * (v + dv));
    };
    const s1 = spacingAt(0.12);
    const s2 = spacingAt(0.24);
    expect(Math.abs(s1 - exactSpacing(0.12)) / exactSpacing(0.12)).toBeLessThan(0.1);
    expect(Math.abs(s2 - exactSpacing(0.24)) / exactSpacing(0.24)).toBeLessThan(0.1);
    // the trend the level teaches: doubling r ⇒ ~4× the shell spacing (1/E = r²/kq)
    expect(s2 / s1).toBeGreaterThan(3.3);
    expect(s2 / s1).toBeLessThan(4.5);
    // sanity: measured mean radii match the analytic circles
    for (const r of [0.1, 0.15, 0.2, 0.3]) {
      expect(Math.abs(meanRadius(kq / r) - r) / r).toBeLessThan(0.02);
    }
  });

  it('golden: a plate pair (linear V) gives straight, parallel, evenly spaced lines', () => {
    const ex = 500; // V/m along +x ⇒ V = −ex·x
    const f = sampleField((x) => -ex * x, 0, 0, 1, 0.75, 101, 76);
    // levels chosen OFF grid nodes (nodes sit at multiples of 5 V)
    const levels = [-102.5, -202.5, -302.5, -402.5];
    const xs = levels.map((v) => {
      const pts = isolines(f, v).flat();
      expect(pts.length).toBeGreaterThan(10);
      const meanX = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      // straight and vertical: every point sits at the mean x
      for (const p of pts) expect(Math.abs(p.x - meanX)).toBeLessThan(1e-9);
      return meanX;
    });
    // analytic position x = −V/ex, i.e. evenly spaced by ΔV/E = 0.2 m
    xs.forEach((x, i) => expect(x).toBeCloseTo(-levels[i]! / ex, 9));
  });

  it('returns nothing when the level is outside the field’s range', () => {
    const f = sampleField(() => 1, 0, 0, 1, 1, 9, 9);
    expect(isolines(f, 5)).toEqual([]);
  });

  it('joins segments into few long polylines (not confetti)', () => {
    const f = chargeField();
    const lines = isolines(f, (K_COULOMB * 1e-9) / 0.25);
    // a single closed ring should come back as one (or very few) polylines
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(Math.max(...lines.map((l) => l.length))).toBeGreaterThan(30);
  });
});

describe('steepest-descent paths', () => {
  it('rolls to the bottom of a bowl', () => {
    const f = sampleField((x, y) => (x - 0.5) ** 2 + (y - 0.5) ** 2, 0, 0, 1, 1, 65, 65);
    const path = descentPath(f, 0.15, 0.8, { step_m: 0.005, maxSteps: 2000 });
    const end = path[path.length - 1]!;
    expect(Math.hypot(end.x - 0.5, end.y - 0.5)).toBeLessThan(0.02);
  });

  it('curves along the gradient on an anisotropic bowl — NOT the straight line to the minimum', () => {
    // h = x'² + 6y'²: gradient flow bends toward the fast (y) axis first.
    const f = sampleField(
      (x, y) => (x - 0.5) ** 2 + 6 * (y - 0.5) ** 2,
      0, 0, 1, 1, 129, 129,
    );
    const path = descentPath(f, 0.1, 0.9, { step_m: 0.002, maxSteps: 5000 });
    const end = path[path.length - 1]!;
    expect(Math.hypot(end.x - 0.5, end.y - 0.5)).toBeLessThan(0.02);
    // max deviation from the start→minimum chord must be substantial
    const chordDev = path.reduce((best, p) => {
      // distance from p to the line through (0.1,0.9)→(0.5,0.5)
      const dx = 0.5 - 0.1;
      const dy = 0.5 - 0.9;
      const t = ((p.x - 0.1) * dx + (p.y - 0.9) * dy) / (dx * dx + dy * dy);
      const px = 0.1 + t * dx;
      const py = 0.9 + t * dy;
      return Math.max(best, Math.hypot(p.x - px, p.y - py));
    }, 0);
    expect(chordDev).toBeGreaterThan(0.05);
  });

  it('stops at a flat spot instead of jittering forever', () => {
    const f = sampleField(() => 0.3, 0, 0, 1, 1, 17, 17);
    const path = descentPath(f, 0.4, 0.6, { step_m: 0.01, maxSteps: 500 });
    expect(path.length).toBeLessThan(5);
  });
});
