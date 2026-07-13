/**
 * Layer 6 — fab process operations over the column-stack wafer
 * (prompts/nf03/04 §1). Every op is pure: op(wafer, params) → wafer.
 *
 * Fidelity anchors (simplified in trend, stated in-game):
 * - spin coating planarizes (resist tops out flat over topography)
 * - RIE is anisotropic, wet etch isotropic ⇒ undercut; selectivity is
 *   chemistry choosing what erodes
 * - CVD/ALD deposits conformally (coats walls & cavities: GAA wrap);
 *   PVD is directional and bridges deep narrow slots ⇒ keyhole voids
 * - implant range grows with energy; thick mask stacks stop the beam;
 *   anneal activates and diffuses dopants (Gaussian spread)
 * - CMP planarizes down to a stop layer
 * - thermal oxidation CONSUMES ~0.45× of the grown thickness in silicon
 *   (Deal-Grove flavor)
 */

import {
  addOnTop,
  airGaps,
  colTop,
  matAtZ,
  neighborsOf,
  normalizeColumn,
  removeFromTop,
  removeRange,
  topHeights,
  topMaterial,
  truncateAt,
  type Column,
  type Material,
  type WaferModel,
} from '../scene/wafer';

export interface MaskRect {
  /** Normalized [0,1] wafer coordinates; a cell is inside if its center is. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type RateTable = Partial<Record<Material, number>>;

function rateFn(rates: RateTable): (m: Material) => number {
  return (m) => rates[m] ?? 0;
}

function mapColumns(w: WaferModel, f: (col: Column, k: number) => Column): WaferModel {
  return { ...w, columns: w.columns.map(f) };
}

// ---------------------------------------------------------------- spin

/** Spin-coat resist: fills up to a flat plane `thickness` above the tallest feature. */
export function spinResist(w: WaferModel, p: { thickness_m: number }): WaferModel {
  const tops = topHeights(w);
  let maxTop = 0;
  for (const t of tops) maxTop = Math.max(maxTop, t);
  const plane = maxTop + p.thickness_m;
  return mapColumns(w, (col) => {
    const top = colTop(col);
    return plane - top > 1e-13 ? addOnTop(col, 'resist', plane - top) : col;
  });
}

// ---------------------------------------------------------------- expose / develop

/**
 * Expose through a mask: latent image = dose inside mask rects, blurred by
 * `blurCells` passes of a 3-tap kernel (the poor man's aerial-image PSF —
 * replaced by the real litho model in Ch3/Ch4 integration).
 */
export function expose(
  w: WaferModel,
  p: { mask: MaskRect[]; dose: number; blurCells?: number },
): WaferModel {
  const { nx, ny } = w;
  let img = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) / nx;
      const cy = (j + 0.5) / ny;
      const inside = p.mask.some((r) => cx >= r.x0 && cx < r.x1 && cy >= r.y0 && cy < r.y1);
      if (inside) img[j * nx + i] = p.dose;
    }
  }
  const passes = p.blurCells ?? 1;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let sum = 2 * img[k]!;
        let wsum = 2;
        if (i > 0) (sum += img[k - 1]!), wsum++;
        if (i < nx - 1) (sum += img[k + 1]!), wsum++;
        if (j > 0) (sum += img[k - nx]!), wsum++;
        if (j < ny - 1) (sum += img[k + nx]!), wsum++;
        next[k] = sum / wsum;
      }
    }
    img = next;
  }
  return { ...w, latent: img };
}

/** Develop (positive tone): resist dissolves where latent ≥ threshold. */
export function develop(w: WaferModel, p: { threshold: number }): WaferModel {
  const latent = w.latent;
  if (!latent) return w;
  const out = mapColumns(w, (col, k) =>
    latent[k]! >= p.threshold ? normalizeColumn(col.filter((s) => s.m !== 'resist')) : col,
  );
  delete out.latent;
  return out;
}

/** Strip all remaining resist (ash). */
export function strip(w: WaferModel): WaferModel {
  const out = mapColumns(w, (col) => normalizeColumn(col.filter((s) => s.m !== 'resist')));
  delete out.latent;
  return out;
}

// ---------------------------------------------------------------- etch

/**
 * Etch with per-material rates (unlisted ⇒ 0 ⇒ acts as mask).
 * anisotropy 1: straight down. anisotropy < 1: adds isotropic rounds that
 * eat sideways from exposed neighbors — the undercut that ruins linewidth
 * under a mask (wet-etch lesson).
 */
export function etch(
  w: WaferModel,
  p: { depth_m: number; anisotropy?: number; rates: RateTable },
): WaferModel {
  const rate = rateFn(p.rates);
  const aniso = p.anisotropy ?? 1;

  // vertical component
  let out = mapColumns(w, (col) => removeFromTop(col, p.depth_m, rate).col);

  // isotropic component: k rounds, each reaching one cell sideways. The
  // attack comes from any air the neighbor exposes: the space above its top
  // AND its internal cavities — which is what lets a selective release etch
  // tunnel inward under the channel sheets (GAA).
  const rounds = Math.floor(((1 - aniso) * p.depth_m) / w.pitch_m);
  for (let r = 0; r < rounds; r++) {
    const snapshot = out.columns;
    out = mapColumns(out, (col, k) => {
      let next = col;
      for (const nb of neighborsOf(out, k)) {
        const nbCol = snapshot[nb]!;
        for (const gap of [...airGaps(nbCol), { z0_m: colTop(nbCol), z1_m: Number.POSITIVE_INFINITY }]) {
          if (gap.z1_m - gap.z0_m > 1e-13) next = removeRange(next, gap.z0_m, gap.z1_m, rate);
        }
      }
      return next;
    });
  }
  return out;
}

// ---------------------------------------------------------------- deposit

/**
 * Deposit a film.
 * conformality ≥ 0.5 (CVD/ALD): coats tops AND cavity walls — internal air
 * gaps shrink from both ends and pinch off when thinner than 2×thickness
 * (this is what wraps a gate all around released nanosheets).
 * conformality < 0.5 (PVD): tops only; deep narrow slots bridge at the
 * mouth, trapping a keyhole void (the teachable failure).
 */
export function deposit(
  w: WaferModel,
  p: { material: Material; thickness_m: number; conformality?: number },
): WaferModel {
  const th = p.thickness_m;
  const conformal = (p.conformality ?? 1) >= 0.5;
  const tops = topHeights(w);
  return mapColumns(w, (col, k) => {
    if (conformal) {
      let next: Column = [...col.map((s) => ({ ...s }))];
      // coat cavity walls (vertical wrap within the column)
      for (const gap of airGaps(col)) {
        const size = gap.z1_m - gap.z0_m;
        if (size <= 2 * th) {
          next.push({ m: p.material, z0_m: gap.z0_m, z1_m: gap.z1_m }); // pinch-off: fill
        } else {
          next.push({ m: p.material, z0_m: gap.z0_m, z1_m: gap.z0_m + th });
          next.push({ m: p.material, z0_m: gap.z1_m - th, z1_m: gap.z1_m });
        }
      }
      return addOnTop(normalizeColumn(next), p.material, th);
    }
    // directional: bridging happens across a slot's NARROW axis — a trench
    // (walls on x only) shadows just as badly as a hole (walls all around).
    const i = k % w.nx;
    const j = (k - i) / w.nx;
    const NEG = Number.NEGATIVE_INFINITY;
    const xPair = Math.min(i > 0 ? tops[k - 1]! : NEG, i < w.nx - 1 ? tops[k + 1]! : NEG);
    const yPair = Math.min(j > 0 ? tops[k - w.nx]! : NEG, j < w.ny - 1 ? tops[k + w.nx]! : NEG);
    const mouth = Math.max(xPair, yPair); // the level where a bridge would form
    if (mouth - tops[k]! > 3 * w.pitch_m) {
      // film spans at the slot mouth, trapping a keyhole void below
      return normalizeColumn([...col, { m: p.material, z0_m: mouth, z1_m: mouth + th }]);
    }
    return addOnTop(col, p.material, th);
  });
}

// ---------------------------------------------------------------- implant / anneal

/**
 * Ion implantation: converts silicon to doped-n/p in a band centered
 * `range_m` below the exposed surface (range grows with energy — Ch1's
 * charged-projectile aiming, industrialized). A mask stack thicker than
 * range + straggle stops the beam.
 */
export function implant(
  w: WaferModel,
  p: { species: 'n' | 'p'; range_m: number; straggle_m: number; tiltCells?: number },
): WaferModel {
  const doped: Material = p.species === 'n' ? 'doped-n' : 'doped-p';
  const tilt = p.tiltCells ?? 0;
  const stop = p.range_m + 2 * p.straggle_m;
  return mapColumns(w, (col, k) => {
    // tilt: the beam that lands here entered above the column `tilt` cells away
    const i = k % w.nx;
    const srcI = Math.min(w.nx - 1, Math.max(0, i - tilt));
    const srcCol = w.columns[k - i + srcI]!;
    const entry = colTop(srcCol);
    // non-silicon overburden above the band blocks the beam
    let blocking = 0;
    for (const s of srcCol) {
      if (s.m !== 'si' && s.m !== 'doped-n' && s.m !== 'doped-p') blocking += s.z1_m - s.z0_m;
    }
    if (blocking >= stop) return col;
    const z1 = entry - Math.max(0, p.range_m - p.straggle_m);
    const z0 = entry - (p.range_m + p.straggle_m);
    // convert si within the band
    const out: Column = [];
    for (const s of col) {
      if (s.m !== 'si' || s.z1_m <= z0 || s.z0_m >= z1) {
        out.push({ ...s });
        continue;
      }
      if (s.z0_m < z0) out.push({ m: 'si', z0_m: s.z0_m, z1_m: z0 });
      out.push({ m: doped, z0_m: Math.max(s.z0_m, z0), z1_m: Math.min(s.z1_m, z1) });
      if (s.z1_m > z1) out.push({ m: 'si', z0_m: z1, z1_m: s.z1_m });
    }
    return normalizeColumn(out);
  });
}

/** Anneal: dopant bands diffuse outward (vertically and one cell laterally per pitch). */
export function anneal(w: WaferModel, p: { spread_m: number }): WaferModel {
  const grow = (col: Column, d: number): Column => {
    const envelopeTop = colTop(col); // dopants can't diffuse into air
    const out: Column = [];
    for (const s of col) {
      if (s.m === 'doped-n' || s.m === 'doped-p') {
        out.push({
          m: s.m,
          z0_m: Math.max(0, s.z0_m - d),
          z1_m: Math.min(envelopeTop, s.z1_m + d),
        });
      } else {
        out.push({ ...s });
      }
    }
    // doped regions win overlaps against plain si (diffusion into silicon)
    return resolveDopedOverlaps(out);
  };
  let out = mapColumns(w, (col) => grow(col, p.spread_m));
  const lateralRounds = Math.round(p.spread_m / w.pitch_m);
  for (let r = 0; r < lateralRounds; r++) {
    const snapshot = out.columns;
    out = mapColumns(out, (col, k) => {
      let next = col;
      for (const nb of neighborsOf(out, k)) {
        for (const s of snapshot[nb]!) {
          if (s.m !== 'doped-n' && s.m !== 'doped-p') continue;
          next = paintDopedOverSi(next, s.m, s.z0_m, s.z1_m);
        }
      }
      return next;
    });
  }
  return out;
}

function resolveDopedOverlaps(col: Column): Column {
  const doped = col.filter((s) => s.m === 'doped-n' || s.m === 'doped-p');
  let out = col.filter((s) => s.m !== 'doped-n' && s.m !== 'doped-p');
  for (const d of doped) {
    // carve the doped band out of silicon, then insert it
    out = out.flatMap((s) => {
      if (s.m !== 'si' || s.z1_m <= d.z0_m || s.z0_m >= d.z1_m) return [s];
      const parts: Column = [];
      if (s.z0_m < d.z0_m) parts.push({ m: 'si', z0_m: s.z0_m, z1_m: d.z0_m });
      if (s.z1_m > d.z1_m) parts.push({ m: 'si', z0_m: d.z1_m, z1_m: s.z1_m });
      return parts;
    });
    out.push({ ...d });
  }
  return normalizeColumn(out);
}

function paintDopedOverSi(col: Column, doped: Material, z0: number, z1: number): Column {
  const out: Column = [];
  let changed = false;
  for (const s of col) {
    if (s.m !== 'si' || s.z1_m <= z0 || s.z0_m >= z1) {
      out.push({ ...s });
      continue;
    }
    changed = true;
    if (s.z0_m < z0) out.push({ m: 'si', z0_m: s.z0_m, z1_m: z0 });
    out.push({ m: doped, z0_m: Math.max(s.z0_m, z0), z1_m: Math.min(s.z1_m, z1) });
    if (s.z1_m > z1) out.push({ m: 'si', z0_m: z1, z1_m: s.z1_m });
  }
  return changed ? normalizeColumn(out) : col;
}

// ---------------------------------------------------------------- cmp / oxidation

/**
 * CMP: planarize down to the highest exposed surface of the stop material
 * (or an explicit plane). Overburden above the plane is removed everywhere.
 */
export function cmp(w: WaferModel, p: { stopMaterial?: Material; targetZ_m?: number }): WaferModel {
  let plane = p.targetZ_m;
  if (plane === undefined) {
    if (!p.stopMaterial) throw new Error('cmp: stopMaterial or targetZ_m required');
    plane = 0;
    for (const col of w.columns) {
      for (const s of col) if (s.m === p.stopMaterial) plane = Math.max(plane, s.z1_m);
    }
  }
  const z = plane;
  return mapColumns(w, (col) => truncateAt(col, z));
}

/** The plane cmp would polish to (exposed for scrub interpolation). */
export function cmpPlane(w: WaferModel, stopMaterial: Material): number {
  let plane = 0;
  for (const col of w.columns) {
    for (const s of col) if (s.m === stopMaterial) plane = Math.max(plane, s.z1_m);
  }
  return plane;
}

/**
 * Thermal oxidation: where silicon is exposed, grow SiO₂ of the given
 * thickness, consuming 0.45× of it from the silicon below (the classic
 * Deal-Grove volume ratio).
 */
export function thermalOxide(w: WaferModel, p: { thickness_m: number }): WaferModel {
  const consumed = 0.45 * p.thickness_m;
  return mapColumns(w, (col) => {
    const topM = topMaterial(col);
    if (topM !== 'si' && topM !== 'doped-n' && topM !== 'doped-p') return col;
    const top = colTop(col);
    const trimmed = truncateAt(col, top - consumed);
    return addOnTop(trimmed, 'sio2', p.thickness_m);
  });
}
