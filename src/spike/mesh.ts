/**
 * NF3-0 SPIKE — exposed-surface mesher for the column-stack wafer.
 *
 * Emits a triangle soup of air-exposed faces (tops + walls at material/air
 * boundaries between neighboring columns), interleaved [pos3, normal3, rgb3].
 * Interior material-material boundaries are skipped; the cross-section pass
 * draws the cut face separately. Greedy merging is deliberately NOT done —
 * the spike measures the worst-case triangle count.
 */

import { MAT, type Column, type Wafer } from './wafer';

/**
 * Material palette baked into vertex colors at mesh time. A uniform-array
 * lookup indexed by a flat varying compiled fine on desktop ANGLE but is
 * rejected by mobile GLSL compilers (not "dynamically uniform"), which left
 * the canvas black on the Tab S8 — so no indexing in shaders at all.
 */
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], // air (never drawn)
  [0.42, 0.45, 0.52], // si
  [0.65, 0.78, 0.92], // sio2
  [0.95, 0.62, 0.35], // poly
  [0.98, 0.83, 0.3], // metal
  [0.55, 0.85, 0.7], // nitride/high-k
  [0.85, 0.45, 0.75], // resist
];

export interface Mesh {
  data: Float32Array; // stride 9: pos3, normal3, rgb3
  vertexCount: number;
  triangles: number;
}

const STRIDE = 9;

/** z-interval boundaries of a column including implicit air gaps. */
function breakpoints(a: Column, b: Column, zTop: number): number[] {
  const set = new Set<number>([0, zTop]);
  for (const s of a) {
    set.add(s.z0);
    set.add(s.z1);
  }
  for (const s of b) {
    set.add(s.z0);
    set.add(s.z1);
  }
  return [...set].sort((p, q) => p - q);
}

function matIn(col: Column, z0: number, z1: number): number {
  const zm = (z0 + z1) / 2;
  for (const s of col) if (zm >= s.z0 && zm < s.z1) return s.m;
  return MAT.air;
}

export function meshWafer(w: Wafer): Mesh {
  const { n, pitch, columns } = w;
  const zTop = w.zMax + 1;
  const out: number[] = [];

  const quad = (
    // 4 corners CCW as seen from the +normal side
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    m: number,
  ) => {
    const [r, g, b] = PALETTE[m] ?? PALETTE[0]!;
    out.push(ax, ay, az, nx, ny, nz, r, g, b, bx, by, bz, nx, ny, nz, r, g, b, cx, cy, cz, nx, ny, nz, r, g, b);
    out.push(ax, ay, az, nx, ny, nz, r, g, b, cx, cy, cz, nx, ny, nz, r, g, b, dx, dy, dz, nx, ny, nz, r, g, b);
  };

  const empty: Column = [];
  const colAt = (i: number, j: number): Column =>
    i < 0 || j < 0 || i >= n || j >= n ? empty : columns[j * n + i]!;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const col = colAt(i, j);
      const x0 = i * pitch;
      const x1 = x0 + pitch;
      const y0 = j * pitch;
      const y1 = y0 + pitch;

      // Horizontal faces: segment tops/bottoms exposed to air within column.
      for (const s of col) {
        if (matIn(col, s.z1, s.z1 + 0.001) === MAT.air || s.z1 >= colTop(col)) {
          quad(x0, y0, s.z1, x1, y0, s.z1, x1, y1, s.z1, x0, y1, s.z1, 0, 0, 1, s.m);
        }
        if (s.z0 > 0 && matIn(col, s.z0 - 0.001, s.z0) === MAT.air) {
          quad(x0, y0, s.z0, x0, y1, s.z0, x1, y1, s.z0, x1, y0, s.z0, 0, 0, -1, s.m);
        }
      }

      // Walls vs +x and +y neighbors (each shared wall done once).
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const nb = colAt(i + di, j + dj);
        const bps = breakpoints(col, nb, zTop);
        for (let k = 0; k < bps.length - 1; k++) {
          const z0 = bps[k]!;
          const z1 = bps[k + 1]!;
          if (z1 - z0 < 1e-6) continue;
          const ma = matIn(col, z0, z1);
          const mb = matIn(nb, z0, z1);
          if (ma === mb || (ma !== MAT.air && mb !== MAT.air)) continue; // hidden or interior
          if (di === 1) {
            // wall at x = x1
            if (ma !== MAT.air) quad(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 1, 0, 0, ma);
            else quad(x1, y1, z0, x1, y0, z0, x1, y0, z1, x1, y1, z1, -1, 0, 0, mb);
          } else {
            // wall at y = y1
            if (ma !== MAT.air) quad(x1, y1, z0, x0, y1, z0, x0, y1, z1, x1, y1, z1, 0, 1, 0, ma);
            else quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, -1, 0, mb);
          }
        }
      }

      // Grid-boundary outer walls so the wafer block looks solid from outside.
      if (i === 0) wallX(out, col, x0, y0, y1, -1);
      if (i === n - 1) wallX(out, col, x1, y0, y1, 1);
      if (j === 0) wallY(out, col, y0, x0, x1, -1);
      if (j === n - 1) wallY(out, col, y1, x0, x1, 1);
    }
  }

  const data = new Float32Array(out);
  return { data, vertexCount: data.length / STRIDE, triangles: data.length / STRIDE / 3 };
}

function colTop(col: Column): number {
  return col.length ? col[col.length - 1]!.z1 : 0;
}

function wallX(out: number[], col: Column, x: number, y0: number, y1: number, dir: 1 | -1): void {
  for (const s of col) pushWall(out, [x, y0, x, y1], s, dir, true);
}
function wallY(out: number[], col: Column, y: number, x0: number, x1: number, dir: 1 | -1): void {
  for (const s of col) pushWall(out, [x0, y, x1, y], s, dir, false);
}
function pushWall(
  out: number[],
  [ax, ay, bx, by]: [number, number, number, number],
  s: { m: number; z0: number; z1: number },
  dir: 1 | -1,
  isX: boolean,
): void {
  const n = isX ? [dir, 0, 0] : [0, dir, 0];
  const [r, g, b] = PALETTE[s.m] ?? PALETTE[0]!;
  const v = (x: number, y: number, z: number) => out.push(x, y, z, n[0]!, n[1]!, n[2]!, r, g, b);
  // two triangles, winding irrelevant for the spike (culling disabled)
  v(ax, ay, s.z0);
  v(bx, by, s.z0);
  v(bx, by, s.z1);
  v(ax, ay, s.z0);
  v(bx, by, s.z1);
  v(ax, ay, s.z1);
}

/**
 * Cross-section face at plane x = cx: colored quads for every material
 * segment of the intersected column row. Cheap enough to rebuild per drag.
 */
export function sectionMesh(w: Wafer, cx: number): Mesh {
  const { n, pitch, columns } = w;
  const i = Math.min(n - 1, Math.max(0, Math.floor(cx / pitch)));
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    const col = columns[j * n + i]!;
    const y0 = j * pitch;
    const y1 = y0 + pitch;
    for (const s of col) {
      // quad in plane x = cx, normal +x
      const [r, g, b] = PALETTE[s.m] ?? PALETTE[0]!;
      out.push(cx, y0, s.z0, 1, 0, 0, r, g, b, cx, y1, s.z0, 1, 0, 0, r, g, b, cx, y1, s.z1, 1, 0, 0, r, g, b);
      out.push(cx, y0, s.z0, 1, 0, 0, r, g, b, cx, y1, s.z1, 1, 0, 0, r, g, b, cx, y0, s.z1, 1, 0, 0, r, g, b);
    }
  }
  const data = new Float32Array(out);
  return { data, vertexCount: data.length / STRIDE, triangles: data.length / STRIDE / 3 };
}
