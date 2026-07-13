/**
 * Ch1/Ch2 electromagnetics: point charges, plate field regions, potential,
 * and RK4 trajectories (prompts/nf03/05 Ch1, 06 §1).
 *
 * Fidelity: Coulomb constant k = 1/(4πε₀) ≈ 8.988×10⁹ N·m²/C²; electron
 * q/m ≈ −1.759×10¹¹ C/kg — fields move electrons like gravity moves
 * planets, but ~10²⁰× harder per kilogram. In a uniform field the equation
 * of motion IS the projectile problem (a = qE/m), which is the whole Ch1
 * bridge: the player's kinematics transfers verbatim.
 */

export const K_COULOMB = 8.9875517923e9; // N·m²/C²
export const ELECTRON_Q = -1.602176634e-19; // C
export const ELECTRON_M = 9.1093837015e-31; // kg

export interface PointCharge {
  q_C: number;
  x_m: number;
  y_m: number;
}

/** Uniform field inside an axis-aligned region (parallel-plate idealization). */
export interface FieldRegion {
  x0_m: number;
  y0_m: number;
  x1_m: number;
  y1_m: number;
  ex_Vm: number;
  ey_Vm: number;
}

export interface EmEnv {
  charges: PointCharge[];
  regions: FieldRegion[];
  /** Softening radius: field saturates inside (keeps trajectories finite). */
  soften_m?: number;
}

export function fieldAt(x: number, y: number, env: EmEnv): [number, number] {
  let ex = 0;
  let ey = 0;
  const soft = env.soften_m ?? 1e-6;
  for (const c of env.charges) {
    const dx = x - c.x_m;
    const dy = y - c.y_m;
    const r2 = Math.max(dx * dx + dy * dy, soft * soft);
    const r = Math.sqrt(r2);
    const e = (K_COULOMB * c.q_C) / r2;
    ex += (e * dx) / r;
    ey += (e * dy) / r;
  }
  for (const g of env.regions) {
    if (x >= g.x0_m && x < g.x1_m && y >= g.y0_m && y < g.y1_m) {
      ex += g.ex_Vm;
      ey += g.ey_Vm;
    }
  }
  return [ex, ey];
}

/**
 * Electric potential of the point charges (V, zero at infinity). Field
 * regions are excluded on purpose: V is single-valued only for
 * conservative configurations, and the Ch2 prologue teaches V on charge
 * landscapes. E = −∇V is verified against fieldAt in tests.
 */
export function potentialAt(x: number, y: number, env: EmEnv): number {
  let v = 0;
  const soft = env.soften_m ?? 1e-6;
  for (const c of env.charges) {
    const r = Math.max(Math.hypot(x - c.x_m, y - c.y_m), soft);
    v += (K_COULOMB * c.q_C) / r;
  }
  return v;
}

export interface TrajectoryPoint {
  x_m: number;
  y_m: number;
  vx_ms: number;
  vy_ms: number;
  t_s: number;
}

export interface Bounds {
  x0_m: number;
  y0_m: number;
  x1_m: number;
  y1_m: number;
}

/**
 * RK4 integration of a charged particle. Stops when it leaves `bounds` or
 * after `maxSteps`. Deterministic; the plot inset draws points verbatim.
 */
export function integrateTrajectory(
  q_C: number,
  m_kg: number,
  x0: number,
  y0: number,
  vx0: number,
  vy0: number,
  env: EmEnv,
  dt_s: number,
  maxSteps: number,
  bounds: Bounds,
): TrajectoryPoint[] {
  const qm = q_C / m_kg;
  const acc = (x: number, y: number): [number, number] => {
    const [ex, ey] = fieldAt(x, y, env);
    return [qm * ex, qm * ey];
  };
  const pts: TrajectoryPoint[] = [{ x_m: x0, y_m: y0, vx_ms: vx0, vy_ms: vy0, t_s: 0 }];
  let x = x0;
  let y = y0;
  let vx = vx0;
  let vy = vy0;
  for (let i = 1; i <= maxSteps; i++) {
    const [a1x, a1y] = acc(x, y);
    const k1 = { x: vx, y: vy, vx: a1x, vy: a1y };
    const [a2x, a2y] = acc(x + (dt_s / 2) * k1.x, y + (dt_s / 2) * k1.y);
    const k2 = { x: vx + (dt_s / 2) * k1.vx, y: vy + (dt_s / 2) * k1.vy, vx: a2x, vy: a2y };
    const [a3x, a3y] = acc(x + (dt_s / 2) * k2.x, y + (dt_s / 2) * k2.y);
    const k3 = { x: vx + (dt_s / 2) * k2.vx, y: vy + (dt_s / 2) * k2.vy, vx: a3x, vy: a3y };
    const [a4x, a4y] = acc(x + dt_s * k3.x, y + dt_s * k3.y);
    const k4 = { x: vx + dt_s * k3.vx, y: vy + dt_s * k3.vy, vx: a4x, vy: a4y };
    x += (dt_s / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
    y += (dt_s / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
    vx += (dt_s / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
    vy += (dt_s / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
    pts.push({ x_m: x, y_m: y, vx_ms: vx, vy_ms: vy, t_s: i * dt_s });
    if (x < bounds.x0_m || x > bounds.x1_m || y < bounds.y0_m || y > bounds.y1_m) break;
  }
  return pts;
}
