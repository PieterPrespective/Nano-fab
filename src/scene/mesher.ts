/**
 * Exposed-surface mesher for the column-stack wafer (prompts/nf03/03 §3).
 *
 * Emits a triangle soup of air-adjacent faces — tops, bottoms of overhangs,
 * cavity ceilings/floors (implicit-air gaps), walls where a column's solid
 * meets a neighbor's air, and the outer block walls. Interior material-
 * material boundaries are skipped; the bright cross-section face is a
 * separate mesh so it can re-generate per clip drag.
 *
 * Vertex layout: interleaved [pos3, normal3, rgb3], stride 9 floats.
 * Positions are in nanometers (SI meters × 1e9) so 32-bit floats keep
 * plenty of precision at wafer scale.
 */

import { MATERIAL_COLORS } from '../render3d/palette';
import { colTop, matAtZ, type Column, type Material, type WaferModel } from './wafer';

export interface Mesh {
  data: Float32Array; // stride 9: pos3 (nm), normal3, rgb3
  vertexCount: number;
  triangles: number;
}

export const MESH_STRIDE = 9;
const M_TO_NM = 1e9;

class SoupBuilder {
  readonly out: number[] = [];

  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    nx: number, ny: number, nz: number,
    m: Material,
  ): void {
    const [r, g, b] = MATERIAL_COLORS[m];
    this.out.push(ax, ay, az, nx, ny, nz, r, g, b);
    this.out.push(bx, by, bz, nx, ny, nz, r, g, b);
    this.out.push(cx, cy, cz, nx, ny, nz, r, g, b);
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    m: Material,
  ): void {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, m);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz, m);
  }

  build(): Mesh {
    const data = new Float32Array(this.out);
    return { data, vertexCount: data.length / MESH_STRIDE, triangles: data.length / MESH_STRIDE / 3 };
  }
}

/** z breakpoints of two columns merged (segment edges define wall intervals). */
function breakpoints(a: Column, b: Column, zTop: number): number[] {
  const set = new Set<number>([0, zTop]);
  for (const s of a) {
    set.add(s.z0_m);
    set.add(s.z1_m);
  }
  for (const s of b) {
    set.add(s.z0_m);
    set.add(s.z1_m);
  }
  return [...set].sort((p, q) => p - q);
}

export function meshWafer(w: WaferModel): Mesh {
  const { nx, ny, columns } = w;
  const pitch = w.pitch_m * M_TO_NM;
  let zMax = 0;
  for (const col of columns) zMax = Math.max(zMax, colTop(col));
  const zTop = zMax + w.pitch_m;
  const soup = new SoupBuilder();
  const EMPTY: Column = [];
  const colAt = (i: number, j: number): Column =>
    i < 0 || j < 0 || i >= nx || j >= ny ? EMPTY : columns[j * nx + i]!;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = colAt(i, j);
      const x0 = i * pitch;
      const x1 = x0 + pitch;
      const y0 = j * pitch;
      const y1 = y0 + pitch;

      // Horizontal faces wherever a segment touches air above/below
      // (includes cavity floors and ceilings — implicit-air gaps).
      for (const s of col) {
        const z1 = s.z1_m * M_TO_NM;
        const z0 = s.z0_m * M_TO_NM;
        if (matAtZ(col, s.z1_m + 1e-12) === 'air') {
          soup.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, s.m);
        }
        if (s.z0_m > 1e-12 && matAtZ(col, s.z0_m - 1e-12) === 'air') {
          soup.quad(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, 0, 0, -1, s.m);
        }
      }

      // Walls vs +x and +y neighbors (each shared wall considered once).
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const nb = colAt(i + di, j + dj);
        const isBoundary = i + di >= nx || j + dj >= ny;
        const bps = breakpoints(col, nb, zTop);
        for (let k = 0; k < bps.length - 1; k++) {
          const zLo = bps[k]!;
          const zHi = bps[k + 1]!;
          if (zHi - zLo < 1e-13) continue;
          const zm = (zLo + zHi) / 2;
          const ma = matAtZ(col, zm);
          const mb = isBoundary ? 'air' : matAtZ(nb, zm);
          if (ma === mb || (ma !== 'air' && mb !== 'air')) continue;
          const z0 = zLo * M_TO_NM;
          const z1 = zHi * M_TO_NM;
          if (di === 1) {
            if (ma !== 'air') soup.quad(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 1, 0, 0, ma);
            else soup.quad(x1, y1, z0, x1, y0, z0, x1, y0, z1, x1, y1, z1, -1, 0, 0, mb as Material);
          } else {
            if (ma !== 'air') soup.quad(x1, y1, z0, x0, y1, z0, x0, y1, z1, x1, y1, z1, 0, 1, 0, ma);
            else soup.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, -1, 0, mb as Material);
          }
        }
      }

      // -x / -y outer block walls (the +x/+y boundaries are handled above).
      if (i === 0) {
        for (const s of col) {
          const z0 = s.z0_m * M_TO_NM;
          const z1 = s.z1_m * M_TO_NM;
          soup.quad(x0, y1, z0, x0, y0, z0, x0, y0, z1, x0, y1, z1, -1, 0, 0, s.m);
        }
      }
      if (j === 0) {
        for (const s of col) {
          const z0 = s.z0_m * M_TO_NM;
          const z1 = s.z1_m * M_TO_NM;
          soup.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, s.m);
        }
      }
    }
  }
  return soup.build();
}

/**
 * Bright cross-section face at plane x (or y) = frac of the wafer extent:
 * colored quads for every material segment of the intersected column line.
 * Cheap enough to rebuild on every clip-handle drag.
 */
export function sectionMesh(w: WaferModel, frac: number, axis: 'x' | 'y' = 'x'): Mesh {
  const pitch = w.pitch_m * M_TO_NM;
  const soup = new SoupBuilder();
  const n = axis === 'x' ? w.nx : w.ny;
  const other = axis === 'x' ? w.ny : w.nx;
  const idx = Math.min(n - 1, Math.max(0, Math.floor(frac * n)));
  const c = idx * pitch + pitch / 2;
  for (let t = 0; t < other; t++) {
    const col = axis === 'x' ? w.columns[t * w.nx + idx]! : w.columns[idx * w.nx + t]!;
    const t0 = t * pitch;
    const t1 = t0 + pitch;
    for (const s of col) {
      const z0 = s.z0_m * M_TO_NM;
      const z1 = s.z1_m * M_TO_NM;
      if (axis === 'x') soup.quad(c, t0, z0, c, t1, z0, c, t1, z1, c, t0, z1, 1, 0, 0, s.m);
      else soup.quad(t0, c, z0, t1, c, z0, t1, c, z1, t0, c, z1, 0, 1, 0, s.m);
    }
  }
  return soup.build();
}
