/**
 * NF3-0 SPIKE — throwaway code, not part of the game.
 *
 * Column-stack wafer fixture: a transistor-ish structure built in 5 animated
 * process phases, parameterized by scrub time t ∈ [0,1]. Mirrors the data
 * model proposed in prompts/nf03/03-wafer3d-and-time.md §1 so the spike's
 * perf numbers transfer.
 *
 * Units: nm (spike only; the real model uses SI meters).
 */

export const MAT = {
  air: 0,
  si: 1,
  sio2: 2,
  poly: 3,
  metal: 4,
  nitride: 5,
  resist: 6,
} as const;

export interface Seg {
  m: number;
  z0: number;
  z1: number;
}
export type Column = Seg[]; // sorted, non-overlapping, from substrate up

export interface Wafer {
  n: number; // grid n×n
  pitch: number; // nm per cell
  columns: Column[]; // n*n row-major
  zMax: number;
}

const SUB_H = 120; // substrate thickness shown

/** Smoothstep for pleasing front motion. */
function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
}

/** Phase progress: overall t → per-phase u ∈ [0,1]. */
function phase(t: number, i: number, nPhases = 5): number {
  return ease(t * nPhases - i);
}

export function buildWafer(n: number, t: number): Wafer {
  const pitch = 8;
  const columns: Column[] = new Array(n * n);
  const u1 = phase(t, 0); // STI trench etch
  const u2 = phase(t, 1); // oxide fill (overfill)
  const u3 = phase(t, 2); // CMP planarize
  const u4 = phase(t, 3); // gate stack lines
  const u5 = phase(t, 4); // metal contacts

  const trenchDepth = 55 * u1;
  const fillTh = 80 * u2;
  const gateH = 65 * u4;
  const metalH = 85 * u5;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const col: Column = [];
      // STI trenches: two vertical stripes in x (device isolation)
      const fx = i / n;
      const fy = j / n;
      const inTrench =
        (fx > 0.18 && fx < 0.3) || (fx > 0.7 && fx < 0.82);
      const siTop = SUB_H - (inTrench ? trenchDepth : 0);
      col.push({ m: MAT.si, z0: 0, z1: siTop });

      // oxide fill: conformal-ish film over topography
      if (fillTh > 0.5) {
        col.push({ m: MAT.sio2, z0: siTop, z1: siTop + fillTh });
      }
      // CMP: shave everything above the original substrate top
      if (u3 > 0) {
        const cmpPlane = SUB_H + fillTh * (1 - u3);
        truncate(col, cmpPlane);
      }
      // gate lines: two poly stripes in y crossing the active areas
      const inGate = (fy > 0.32 && fy < 0.4) || (fy > 0.58 && fy < 0.66);
      const active = fx >= 0.3 && fx <= 0.7;
      if (gateH > 0.5 && inGate && active) {
        const top = colTop(col);
        col.push({ m: MAT.nitride, z0: top, z1: top + 3 }); // "high-k"
        col.push({ m: MAT.poly, z0: top + 3, z1: top + 3 + gateH });
      }
      // metal contact pillars on source/drain pads
      const pad =
        active &&
        !inGate &&
        ((fy > 0.2 && fy < 0.28) || (fy > 0.44 && fy < 0.54) || (fy > 0.7 && fy < 0.78)) &&
        fx > 0.38 &&
        fx < 0.62;
      if (metalH > 0.5 && pad) {
        const top = colTop(col);
        col.push({ m: MAT.metal, z0: top, z1: top + metalH });
      }
      columns[j * n + i] = col;
    }
  }
  let zMax = 0;
  for (const c of columns) zMax = Math.max(zMax, colTop(c));
  return { n, pitch, columns, zMax };
}

function colTop(col: Column): number {
  return col.length ? col[col.length - 1]!.z1 : 0;
}

function truncate(col: Column, z: number): void {
  for (let k = col.length - 1; k >= 0; k--) {
    const s = col[k]!;
    if (s.z0 >= z) col.splice(k, 1);
    else if (s.z1 > z) s.z1 = z;
  }
}

/** Material at height z in a column (air if none). */
export function matAt(col: Column, z: number): number {
  for (const s of col) {
    if (z >= s.z0 && z < s.z1) return s.m;
  }
  return MAT.air;
}
