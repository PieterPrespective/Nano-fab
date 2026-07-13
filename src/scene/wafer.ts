/**
 * The 3D wafer data model: a grid of vertical column stacks
 * (prompts/nf03/03 §1). SI units (meters). Pure functions only.
 *
 * Air is IMPLICIT: columns store only solid segments; any z-gap between
 * segments is air — which is how cavities (undercut, released nanosheets)
 * are represented for free.
 */

export type Material =
  | 'si'
  | 'sio2'
  | 'si3n4'
  | 'poly'
  | 'metal'
  | 'resist'
  | 'highk'
  | 'doped-n'
  | 'doped-p';

export interface Segment {
  m: Material;
  z0_m: number;
  z1_m: number;
}
/** Sorted by z0, non-overlapping, all thicknesses > 0. */
export type Column = Segment[];

export interface WaferModel {
  nx: number;
  ny: number;
  pitch_m: number;
  columns: Column[]; // nx*ny, row-major (j*nx + i)
  /** Latent exposure image (set by expose, consumed by develop). */
  latent?: Float32Array;
}

const EPS = 1e-13;

export function createSubstrate(nx: number, ny: number, pitch_m: number, thickness_m: number): WaferModel {
  const col: Column = [{ m: 'si', z0_m: 0, z1_m: thickness_m }];
  return {
    nx,
    ny,
    pitch_m,
    columns: Array.from({ length: nx * ny }, () => col.map((s) => ({ ...s }))),
  };
}

export function colTop(col: Column): number {
  return col.length ? col[col.length - 1]!.z1_m : 0;
}

export function topMaterial(col: Column): Material | 'air' {
  return col.length ? col[col.length - 1]!.m : 'air';
}

export function matAtZ(col: Column, z: number): Material | 'air' {
  for (const s of col) if (z >= s.z0_m - EPS && z < s.z1_m - EPS) return s.m;
  return 'air';
}

/** Merge same-material touching segments, drop degenerate ones, sort. */
export function normalizeColumn(col: Column): Column {
  const sorted = col
    .filter((s) => s.z1_m - s.z0_m > EPS)
    .sort((a, b) => a.z0_m - b.z0_m);
  const out: Column = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.m === s.m && Math.abs(last.z1_m - s.z0_m) < EPS) {
      last.z1_m = s.z1_m;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** Add material on top of the column (aligned to current top). */
export function addOnTop(col: Column, m: Material, thickness_m: number): Column {
  const top = colTop(col);
  return normalizeColumn([...col, { m, z0_m: top, z1_m: top + thickness_m }]);
}

/**
 * Etch from the top with per-material rates (missing/0 ⇒ mask: stops the
 * etch). `budget_m` is meters of nominal-rate etching. Returns the etched
 * column and unconsumed budget.
 */
export function removeFromTop(
  col: Column,
  budget_m: number,
  rate: (m: Material) => number,
): { col: Column; rest: number } {
  const out = col.map((s) => ({ ...s }));
  let budget = budget_m;
  while (budget > EPS && out.length > 0) {
    const top = out[out.length - 1]!;
    const r = rate(top.m);
    if (r <= 0) break; // masking material
    const len = top.z1_m - top.z0_m;
    const removable = Math.min(len, budget * r);
    top.z1_m -= removable;
    budget -= removable / r;
    if (top.z1_m - top.z0_m <= EPS) out.pop();
  }
  return { col: normalizeColumn(out), rest: budget };
}

/** Remove etchable material within [zLo, zHi) (isotropic side etching). */
export function removeRange(
  col: Column,
  zLo: number,
  zHi: number,
  rate: (m: Material) => number,
): Column {
  const out: Column = [];
  for (const s of col) {
    if (rate(s.m) <= 0 || s.z1_m <= zLo + EPS || s.z0_m >= zHi - EPS) {
      out.push({ ...s });
      continue;
    }
    if (s.z0_m < zLo) out.push({ m: s.m, z0_m: s.z0_m, z1_m: zLo });
    if (s.z1_m > zHi) out.push({ m: s.m, z0_m: zHi, z1_m: s.z1_m });
  }
  return normalizeColumn(out);
}

/** Truncate everything above the plane (CMP). */
export function truncateAt(col: Column, z: number): Column {
  return normalizeColumn(
    col.flatMap((s) => (s.z0_m >= z ? [] : [{ m: s.m, z0_m: s.z0_m, z1_m: Math.min(s.z1_m, z) }])),
  );
}

/** Internal air gaps (cavities + the trench space below neighbors' tops). */
export function airGaps(col: Column): Array<{ z0_m: number; z1_m: number }> {
  const gaps: Array<{ z0_m: number; z1_m: number }> = [];
  let prevTop = 0;
  for (const s of col) {
    if (s.z0_m - prevTop > EPS) gaps.push({ z0_m: prevTop, z1_m: s.z0_m });
    prevTop = s.z1_m;
  }
  return gaps;
}

export function topHeights(w: WaferModel): Float64Array {
  const out = new Float64Array(w.columns.length);
  for (let k = 0; k < w.columns.length; k++) out[k] = colTop(w.columns[k]!);
  return out;
}

export function neighborsOf(w: WaferModel, k: number): number[] {
  const i = k % w.nx;
  const j = (k - i) / w.nx;
  const out: number[] = [];
  if (i > 0) out.push(k - 1);
  if (i < w.nx - 1) out.push(k + 1);
  if (j > 0) out.push(k - w.nx);
  if (j < w.ny - 1) out.push(k + w.nx);
  return out;
}

/** Total volume (m³) of a material — conservation checks in tests. */
export function materialVolume(w: WaferModel, m: Material): number {
  const cell = w.pitch_m * w.pitch_m;
  let v = 0;
  for (const col of w.columns) for (const s of col) if (s.m === m) v += (s.z1_m - s.z0_m) * cell;
  return v;
}

/** Throws if any column violates the structural invariants (test fuzzing). */
export function checkInvariants(w: WaferModel): void {
  if (w.columns.length !== w.nx * w.ny) throw new Error('column count mismatch');
  for (let k = 0; k < w.columns.length; k++) {
    let prev = -Infinity;
    for (const s of w.columns[k]!) {
      if (!(s.z1_m - s.z0_m > EPS)) throw new Error(`degenerate segment in column ${k}`);
      if (s.z0_m < -EPS) throw new Error(`segment below substrate in column ${k}`);
      if (s.z0_m < prev - EPS) throw new Error(`overlap/order violation in column ${k}`);
      if ((s.m as string) === 'air') throw new Error(`explicit air stored in column ${k}`);
      prev = s.z1_m;
    }
  }
}
