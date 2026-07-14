/**
 * Scalar-field tooling for the Ch2 dimension ladder (prompts/nf03/05 §Ch2):
 * grid sampling, marching-squares isolines, bilinear gradients, and
 * steepest-descent paths.
 *
 * Fidelity: equipotential spacing is ΔV/|E| — for a point charge the shells
 * spread ∝ r² (E ∝ 1/r²), for a parallel-plate pair they are evenly spaced
 * planes; both are golden-tested. The 3D "onion shell" view renders these
 * same isolines on cut planes (stacked marching squares) — a deliberate
 * mobile-budget choice over a full marching-cubes isosurface, since the cut
 * plane is exactly the interaction the levels teach (V is a scalar FIELD:
 * one number per point of a 1/2/3-D domain, never a "3D tensor").
 */

export interface GridField {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Row-major node values: v[iy*nx + ix]. */
  v: Float64Array;
}

export interface Pt {
  x: number;
  y: number;
}

/** Sample fn over [x0,x1]×[y0,y1] on an nx×ny node grid (nx,ny ≥ 2). */
export function sampleField(
  fn: (x: number, y: number) => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  nx: number,
  ny: number,
): GridField {
  const dx = (x1 - x0) / (nx - 1);
  const dy = (y1 - y0) / (ny - 1);
  const v = new Float64Array(nx * ny);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      v[iy * nx + ix] = fn(x0 + ix * dx, y0 + iy * dy);
    }
  }
  return { nx, ny, x0, y0, dx, dy, v };
}

const clamp = (t: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, t));

/** Bilinear interpolation; coordinates clamp to the window. */
export function gridValue(f: GridField, x: number, y: number): number {
  const fx = clamp((x - f.x0) / f.dx, 0, f.nx - 1);
  const fy = clamp((y - f.y0) / f.dy, 0, f.ny - 1);
  const ix = Math.min(Math.floor(fx), f.nx - 2);
  const iy = Math.min(Math.floor(fy), f.ny - 2);
  const tx = fx - ix;
  const ty = fy - iy;
  const i = iy * f.nx + ix;
  const v00 = f.v[i]!;
  const v10 = f.v[i + 1]!;
  const v01 = f.v[i + f.nx]!;
  const v11 = f.v[i + f.nx + 1]!;
  return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
}

/** Central-difference gradient [∂v/∂x, ∂v/∂y], clamped at the borders. */
export function gridGradient(f: GridField, x: number, y: number): [number, number] {
  const hx = f.dx;
  const hy = f.dy;
  const gx = (gridValue(f, x + hx, y) - gridValue(f, x - hx, y)) / (2 * hx);
  const gy = (gridValue(f, x, y + hy) - gridValue(f, x, y - hy)) / (2 * hy);
  // near the window edge the symmetric stencil is clamped one-sided; the
  // denominator correction keeps planes exact there too
  const xl = clamp(x - hx, f.x0, f.x0 + (f.nx - 1) * f.dx);
  const xr = clamp(x + hx, f.x0, f.x0 + (f.nx - 1) * f.dx);
  const yl = clamp(y - hy, f.y0, f.y0 + (f.ny - 1) * f.dy);
  const yr = clamp(y + hy, f.y0, f.y0 + (f.ny - 1) * f.dy);
  return [
    xr > xl ? (gx * 2 * hx) / (xr - xl) : 0,
    yr > yl ? (gy * 2 * hy) / (yr - yl) : 0,
  ];
}

/**
 * Marching squares: isolines of `f` at `level`, joined into polylines
 * (closed rings come back as a single polyline whose ends meet).
 * Node values exactly at the level are nudged to avoid degenerate ties.
 */
export function isolines(f: GridField, level: number): Pt[][] {
  const { nx, ny, dx, dy, x0, y0 } = f;
  const val = (ix: number, iy: number): number => {
    const v = f.v[iy * nx + ix]!;
    // nudge exact hits so every crossing is a strict sign change
    return v === level ? level + Math.abs(level || 1) * 1e-12 : v;
  };

  // Each segment endpoint lies on a grid edge; key edges so segments chain.
  type Seg = { a: Pt; b: Pt; ka: string; kb: string };
  const segs: Seg[] = [];
  const edgeKeyH = (ix: number, iy: number): string => `h${ix},${iy}`; // edge (ix,iy)-(ix+1,iy)
  const edgeKeyV = (ix: number, iy: number): string => `v${ix},${iy}`; // edge (ix,iy)-(ix,iy+1)

  const lerpH = (ix: number, iy: number): Pt => {
    const va = val(ix, iy);
    const vb = val(ix + 1, iy);
    const t = (level - va) / (vb - va);
    return { x: x0 + (ix + t) * dx, y: y0 + iy * dy };
  };
  const lerpV = (ix: number, iy: number): Pt => {
    const va = val(ix, iy);
    const vb = val(ix, iy + 1);
    const t = (level - va) / (vb - va);
    return { x: x0 + ix * dx, y: y0 + (iy + t) * dy };
  };

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const tl = val(ix, iy) > level ? 1 : 0;
      const tr = val(ix + 1, iy) > level ? 2 : 0;
      const br = val(ix + 1, iy + 1) > level ? 4 : 0;
      const bl = val(ix, iy + 1) > level ? 8 : 0;
      const code = tl | tr | br | bl;
      if (code === 0 || code === 15) continue;

      const top = (): [Pt, string] => [lerpH(ix, iy), edgeKeyH(ix, iy)];
      const bottom = (): [Pt, string] => [lerpH(ix, iy + 1), edgeKeyH(ix, iy + 1)];
      const left = (): [Pt, string] => [lerpV(ix, iy), edgeKeyV(ix, iy)];
      const right = (): [Pt, string] => [lerpV(ix + 1, iy), edgeKeyV(ix + 1, iy)];

      const emit = (e1: [Pt, string], e2: [Pt, string]): void => {
        segs.push({ a: e1[0], b: e2[0], ka: e1[1], kb: e2[1] });
      };

      switch (code) {
        case 1: case 14: emit(left(), top()); break;
        case 2: case 13: emit(top(), right()); break;
        case 3: case 12: emit(left(), right()); break;
        case 4: case 11: emit(right(), bottom()); break;
        case 6: case 9: emit(top(), bottom()); break;
        case 7: case 8: emit(left(), bottom()); break;
        case 5: // saddle: resolve by cell-center average
        case 10: {
          const center =
            (val(ix, iy) + val(ix + 1, iy) + val(ix, iy + 1) + val(ix + 1, iy + 1)) / 4;
          const centerHigh = center > level;
          if ((code === 5) === centerHigh) {
            emit(left(), top());
            emit(right(), bottom());
          } else {
            emit(top(), right());
            emit(left(), bottom());
          }
          break;
        }
      }
    }
  }

  // Chain segments end-to-end via shared edge keys.
  const byKey = new Map<string, number[]>();
  segs.forEach((s, i) => {
    (byKey.get(s.ka) ?? byKey.set(s.ka, []).get(s.ka)!).push(i);
    (byKey.get(s.kb) ?? byKey.set(s.kb, []).get(s.kb)!).push(i);
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const lines: Pt[][] = [];

  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const s0 = segs[start]!;
    const line: Pt[] = [s0.a, s0.b];
    let headKey = s0.ka;
    let tailKey = s0.kb;

    const extend = (key: string, atFront: boolean): string | null => {
      const cands = (byKey.get(key) ?? []).filter((i) => !used[i]);
      if (cands.length === 0) return null;
      const i = cands[0]!;
      used[i] = true;
      const s = segs[i]!;
      const [pt, nextKey] = s.ka === key ? [s.b, s.kb] : [s.a, s.ka];
      if (atFront) line.unshift(pt);
      else line.push(pt);
      return nextKey;
    };

    let k: string | null;
    while ((k = extend(tailKey, false)) !== null) tailKey = k;
    while ((k = extend(headKey, true)) !== null) headKey = k;
    lines.push(line);
  }
  return lines;
}

/**
 * Steepest-descent (gradient-flow) path from (x,y): the ball a player drops
 * on the P1 heightmap. Overdamped — direction is always −∇v, which is the
 * point of the level: downhill IS the (negative) gradient. Stops at flat
 * spots, minima, or the window edge.
 */
export function descentPath(
  f: GridField,
  x: number,
  y: number,
  opts: { step_m: number; maxSteps: number },
): Pt[] {
  const path: Pt[] = [{ x, y }];
  let px = x;
  let py = y;
  let step = opts.step_m;
  const gradEps = 1e-9;
  const x1 = f.x0 + (f.nx - 1) * f.dx;
  const y1 = f.y0 + (f.ny - 1) * f.dy;
  for (let i = 0; i < opts.maxSteps; i++) {
    const [gx, gy] = gridGradient(f, px, py);
    const g = Math.hypot(gx, gy);
    if (g < gradEps) break;
    const nx = px - (gx / g) * step;
    const ny = py - (gy / g) * step;
    if (gridValue(f, nx, ny) >= gridValue(f, px, py)) {
      // overshot the valley floor: refine, then give up when converged
      step /= 2;
      if (step < opts.step_m / 64) break;
      continue;
    }
    px = nx;
    py = ny;
    path.push({ x: px, y: py });
    if (px <= f.x0 || px >= x1 || py <= f.y0 || py >= y1) break;
  }
  return path;
}
