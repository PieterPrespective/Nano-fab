import { describe, expect, it } from 'vitest';
import {
  ELECTRON_M,
  ELECTRON_Q,
  K_COULOMB,
  fieldAt,
  integrateTrajectory,
  potentialAt,
  type EmEnv,
} from '../../src/physics/em';

const BOUNDS = { x0_m: -1, y0_m: -1, x1_m: 1, y1_m: 1 };

describe('fieldAt / potentialAt', () => {
  it('single charge: Coulomb magnitude and direction', () => {
    const env: EmEnv = { charges: [{ q_C: 1e-9, x_m: 0, y_m: 0 }], regions: [] };
    const [ex, ey] = fieldAt(0.1, 0, env);
    expect(ex).toBeCloseTo((K_COULOMB * 1e-9) / 0.01, 3); // kq/r²
    expect(ey).toBeCloseTo(0, 9);
  });

  it('superposition: two charges sum exactly', () => {
    const a: EmEnv = { charges: [{ q_C: 2e-9, x_m: -0.2, y_m: 0.1 }], regions: [] };
    const b: EmEnv = { charges: [{ q_C: -1e-9, x_m: 0.3, y_m: -0.1 }], regions: [] };
    const both: EmEnv = { charges: [...a.charges, ...b.charges], regions: [] };
    const [ax, ay] = fieldAt(0.05, 0.05, a);
    const [bx, by] = fieldAt(0.05, 0.05, b);
    const [cx, cy] = fieldAt(0.05, 0.05, both);
    expect(cx).toBeCloseTo(ax + bx, 9);
    expect(cy).toBeCloseTo(ay + by, 9);
  });

  it('E = −∇V (numerical gradient check on the charge landscape)', () => {
    const env: EmEnv = {
      charges: [
        { q_C: 1e-9, x_m: 0, y_m: 0 },
        { q_C: -2e-9, x_m: 0.3, y_m: 0.2 },
      ],
      regions: [],
    };
    const h = 1e-6;
    const p = { x: 0.11, y: -0.07 };
    const dVdx = (potentialAt(p.x + h, p.y, env) - potentialAt(p.x - h, p.y, env)) / (2 * h);
    const dVdy = (potentialAt(p.x, p.y + h, env) - potentialAt(p.x, p.y - h, env)) / (2 * h);
    const [ex, ey] = fieldAt(p.x, p.y, env);
    expect(-dVdx).toBeCloseTo(ex, 1);
    expect(-dVdy).toBeCloseTo(ey, 1);
    expect(Math.abs(-dVdx - ex) / Math.abs(ex)).toBeLessThan(1e-4);
    expect(Math.abs(-dVdy - ey) / Math.abs(ey)).toBeLessThan(1e-4);
  });

  it('regions apply only inside their box', () => {
    const env: EmEnv = {
      charges: [],
      regions: [{ x0_m: 0, y0_m: 0, x1_m: 0.5, y1_m: 0.5, ex_Vm: 0, ey_Vm: -1e4 }],
    };
    expect(fieldAt(0.25, 0.25, env)[1]).toBe(-1e4);
    expect(fieldAt(0.75, 0.25, env)[1]).toBe(0);
  });
});

describe('integrateTrajectory', () => {
  it('THE Ch1 bridge: uniform field gives the projectile parabola exactly', () => {
    // electron entering a vertical field region — same math as a thrown ball
    const E = -1e3; // V/m downward force on negative charge → upward... sign flows through qE/m
    const env: EmEnv = {
      charges: [],
      regions: [{ x0_m: -1, y0_m: -1, x1_m: 1, y1_m: 1, ex_Vm: 0, ey_Vm: E }],
    };
    const v0 = 1e7; // m/s along +x
    const a = (ELECTRON_Q * E) / ELECTRON_M; // constant acceleration in y
    const pts = integrateTrajectory(ELECTRON_Q, ELECTRON_M, -0.5, 0, v0, 0, env, 1e-10, 400, BOUNDS);
    for (const p of pts) {
      const yClosed = 0.5 * a * p.t_s * p.t_s; // y = ½at² (kinematics!)
      const xClosed = -0.5 + v0 * p.t_s;
      expect(p.x_m).toBeCloseTo(xClosed, 9);
      expect(Math.abs(p.y_m - yClosed)).toBeLessThan(1e-9);
    }
  });

  it('energy conservation around a point charge (RK4 drift stays tiny)', () => {
    const env: EmEnv = { charges: [{ q_C: 1e-12, x_m: 0, y_m: 0 }], regions: [], soften_m: 1e-4 };
    const pts = integrateTrajectory(
      ELECTRON_Q,
      ELECTRON_M,
      0.01,
      0,
      0,
      3.5e5,
      env,
      2e-10,
      2000,
      BOUNDS,
    );
    const energy = (p: (typeof pts)[number]) =>
      0.5 * ELECTRON_M * (p.vx_ms ** 2 + p.vy_ms ** 2) + ELECTRON_Q * potentialAt(p.x_m, p.y_m, env);
    const e0 = energy(pts[0]!);
    const eEnd = energy(pts[pts.length - 1]!);
    expect(Math.abs((eEnd - e0) / e0)).toBeLessThan(1e-4);
    expect(pts.length).toBeGreaterThan(500); // it actually orbited, not escaped instantly
  });

  it('stops when leaving bounds', () => {
    const env: EmEnv = { charges: [], regions: [] };
    const pts = integrateTrajectory(ELECTRON_Q, ELECTRON_M, 0, 0, 1e7, 0, env, 1e-9, 10000, BOUNDS);
    const last = pts[pts.length - 1]!;
    expect(last.x_m).toBeGreaterThan(BOUNDS.x1_m);
    expect(pts.length).toBeLessThan(150);
  });
});
