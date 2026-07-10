/**
 * Id–Vg plot math: scales, ticks, curve projection. Pure — the canvas
 * renderer just draws what these functions return.
 */

import type { CurvePoint } from '../physics/device';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LogTick {
  value: number;
  label: string;
  labeled: boolean;
}

/**
 * Decade ticks for a log current axis. At most ~12 labeled ticks; when the
 * range spans more decades, labels skip evenly (every 2nd, 3rd, …).
 */
export function logTicks(min: number, max: number): LogTick[] {
  if (!(min > 0) || !(max > 0) || min >= max) return [];
  const lo = Math.ceil(Math.log10(min) - 1e-9);
  const hi = Math.floor(Math.log10(max) + 1e-9);
  const count = hi - lo + 1;
  if (count <= 0) return [];
  const skip = Math.max(1, Math.ceil(count / 12));
  const ticks: LogTick[] = [];
  for (let e = lo; e <= hi; e++) {
    ticks.push({ value: 10 ** e, label: `1e${e}`, labeled: (e - lo) % skip === 0 });
  }
  return ticks;
}

export interface PlotViewport {
  rect: Rect;
  vgMin: number;
  vgMax: number;
  /** Log-axis floor; id values at or below 0 clamp here (log safety). */
  idMin: number;
  idMax: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Map a curve to pixel coordinates (y grows downward, log current axis). */
export function projectCurve(curve: CurvePoint[], vp: PlotViewport): Pt[] {
  const { rect, vgMin, vgMax, idMin, idMax } = vp;
  const logMin = Math.log10(idMin);
  const logMax = Math.log10(idMax);
  return curve.map((p) => {
    const id = Math.max(p.id_A, idMin); // clamp: log axis must never see ≤ 0
    const tx = (p.vg_V - vgMin) / (vgMax - vgMin);
    const ty = (Math.log10(id) - logMin) / (logMax - logMin);
    return {
      x: rect.x + tx * rect.w,
      y: rect.y + rect.h - ty * rect.h,
    };
  });
}

/** Project a single (vg, id) point. */
export function projectPoint(vg_V: number, id_A: number, vp: PlotViewport): Pt {
  return projectCurve([{ vg_V, id_A }], vp)[0]!;
}

/** Pick a rounded log-axis range that covers the given currents. */
export function currentRange(values: number[]): { idMin: number; idMax: number } {
  const positive = values.filter((v) => v > 0 && Number.isFinite(v));
  const max = positive.length ? Math.max(...positive) : 1e-3;
  const min = positive.length ? Math.min(...positive) : 1e-12;
  const idMax = 10 ** Math.ceil(Math.log10(max));
  let idMin = 10 ** Math.floor(Math.log10(min));
  idMin = Math.max(idMin, idMax / 1e12); // cap at 12 decades for readability
  if (idMin >= idMax) idMin = idMax / 1e3;
  return { idMin, idMax };
}
