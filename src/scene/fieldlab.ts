/**
 * Field-lab scene model (Ch2 prologue — the dimension ladder). Pure: setup
 * parsing, ball drops, cut-plane probes, slab-orientation probes, metrics.
 *
 * Three modes, one lesson (prompts/nf03/05 §Ch2 prologue): electric
 * potential is a scalar FIELD — one number per point of a 1-D, 2-D, or 3-D
 * domain — never a "3D tensor". The thing that needs two indices is a
 * rank-2 response like strained-silicon conductivity (mode 'tensor'), where
 * the answer to "how well does it conduct?" depends on direction.
 *
 * - heightmap: V(x,y) landscape; balls roll along −∇V (gradient flow).
 * - volume: V(x,y,z) of charges in a box; the player cuts and probes.
 * - tensor: J = σ̿·E of a strained slab; rotate the slab, watch J leave E.
 */

import { LevelValidationError } from '../engine/levels';
import { descentPath, sampleField, type Pt } from '../physics/contours';
import { potentialAt, type EmEnv, K_COULOMB, type PointCharge } from '../physics/em';

export interface Charge3 {
  q_C: number;
  x_m: number;
  y_m: number;
  z_m: number;
}

export interface HeightmapSetup {
  mode: 'heightmap';
  charges: PointCharge[];
  window: { x0: number; y0: number; x1: number; y1: number };
  /** The basin the balls must reach. */
  home: { x: number; y: number; r: number };
  ballsRequired: number;
  /** Where the sketch-prediction ball is dropped from (reveal ghost). */
  predictionStart?: { x: number; y: number };
  /** Sculpt variant: fixed release points the player must serve. */
  spawns?: Array<{ x: number; y: number }>;
  /** Sculpt variant: the player may place this many charges. */
  placeable?: { count: number; q_C: number };
}

export interface VolumeSetup {
  mode: 'volume';
  charges: Charge3[];
  box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
}

export interface TensorSetup {
  mode: 'tensor';
  /** Conductivity along the strained (major) principal axis (arb.). */
  sigmaMajor: number;
  /** Conductivity along the minor axis (arb.). */
  sigmaMinor: number;
  /** Applied field magnitude along +x (arb.). */
  e0: number;
  /** Options for a `choose` prediction, if the level has one. */
  choices?: string[];
  correctChoice?: number;
}

export type FieldLabSetup = HeightmapSetup | VolumeSetup | TensorSetup;

export interface Drop {
  x: number;
  y: number;
  home: boolean;
  path: Pt[];
}

export interface VolumeProbe {
  u: number;
  v: number;
  e_mag: number;
  nearPeak: boolean;
}

export interface TensorProbe {
  theta_rad: number;
  /** |J| response magnitude (arb.). */
  j_mag: number;
  /** Angle between J and the applied E (rad) — 0 only on principal axes. */
  deflection_rad: number;
}

export type CutAxis = 'x' | 'y' | 'z';

export interface FieldLabState {
  drops: Drop[];
  /** Sculpt variant: charges the player has placed. */
  placed: PointCharge[];
  cutAxis: CutAxis;
  cutFrac: number;
  cutsMade: number;
  probesV: VolumeProbe[];
  probesT: TensorProbe[];
}

export function initialFieldLabState(): FieldLabState {
  return { drops: [], placed: [], cutAxis: 'z', cutFrac: 0.5, cutsMade: 0, probesV: [], probesT: [] };
}

function fail(path: string, detail: string): never {
  throw new LevelValidationError(path, detail);
}
function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected finite number');
  return v;
}
function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected object');
  return v as Record<string, unknown>;
}

/** Validate a level's scene.setup for the field lab. */
export function parseFieldLabSetup(json: unknown): FieldLabSetup {
  const o = rec(json, '$.scene.setup');
  switch (o.mode) {
    case 'heightmap': {
      if (!Array.isArray(o.charges) || o.charges.length === 0) {
        fail('$.scene.setup.charges', 'expected non-empty array');
      }
      const charges = o.charges.map((c, i) => {
        const p = `$.scene.setup.charges[${i}]`;
        const g = rec(c, p);
        return { q_C: num(g.q_nC, `${p}.q_nC`) * 1e-9, x_m: num(g.x, `${p}.x`), y_m: num(g.y, `${p}.y`) };
      });
      const w = rec(o.window, '$.scene.setup.window');
      const h = rec(o.home, '$.scene.setup.home');
      let predictionStart: { x: number; y: number } | undefined;
      if (o.predictionStart !== undefined) {
        const ps = rec(o.predictionStart, '$.scene.setup.predictionStart');
        predictionStart = { x: num(ps.x, '$.predictionStart.x'), y: num(ps.y, '$.predictionStart.y') };
      }
      let spawns: Array<{ x: number; y: number }> | undefined;
      if (o.spawns !== undefined) {
        if (!Array.isArray(o.spawns) || o.spawns.length === 0) {
          fail('$.scene.setup.spawns', 'expected non-empty array');
        }
        spawns = o.spawns.map((sp, i) => {
          const g = rec(sp, `$.scene.setup.spawns[${i}]`);
          return { x: num(g.x, `$.spawns[${i}].x`), y: num(g.y, `$.spawns[${i}].y`) };
        });
      }
      let placeable: { count: number; q_C: number } | undefined;
      if (o.placeable !== undefined) {
        const g = rec(o.placeable, '$.scene.setup.placeable');
        placeable = {
          count: num(g.count, '$.placeable.count'),
          q_C: num(g.q_nC, '$.placeable.q_nC') * 1e-9,
        };
      }
      return {
        spawns,
        placeable,
        mode: 'heightmap',
        charges,
        window: { x0: num(w.x0, '$.x0'), y0: num(w.y0, '$.y0'), x1: num(w.x1, '$.x1'), y1: num(w.y1, '$.y1') },
        home: { x: num(h.x, '$.home.x'), y: num(h.y, '$.home.y'), r: num(h.r, '$.home.r') },
        ballsRequired: o.ballsRequired === undefined ? 3 : num(o.ballsRequired, '$.ballsRequired'),
        predictionStart,
      };
    }
    case 'volume': {
      if (!Array.isArray(o.charges) || o.charges.length === 0) {
        fail('$.scene.setup.charges', 'expected non-empty array');
      }
      const charges = o.charges.map((c, i) => {
        const p = `$.scene.setup.charges[${i}]`;
        const g = rec(c, p);
        return {
          q_C: num(g.q_nC, `${p}.q_nC`) * 1e-9,
          x_m: num(g.x, `${p}.x`),
          y_m: num(g.y, `${p}.y`),
          z_m: num(g.z, `${p}.z`),
        };
      });
      const b = rec(o.box, '$.scene.setup.box');
      return {
        mode: 'volume',
        charges,
        box: {
          x0: num(b.x0, '$.x0'), y0: num(b.y0, '$.y0'), z0: num(b.z0, '$.z0'),
          x1: num(b.x1, '$.x1'), y1: num(b.y1, '$.y1'), z1: num(b.z1, '$.z1'),
        },
      };
    }
    case 'tensor': {
      let choices: string[] | undefined;
      if (o.choices !== undefined) {
        if (!Array.isArray(o.choices) || o.choices.some((c) => typeof c !== 'string')) {
          fail('$.scene.setup.choices', 'expected string array');
        }
        choices = o.choices as string[];
      }
      let correctChoice: number | undefined;
      if (o.correctChoice !== undefined) {
        const cc = num(o.correctChoice, '$.scene.setup.correctChoice');
        if (!choices || cc < 0 || cc >= choices.length) {
          fail('$.scene.setup.correctChoice', 'correctChoice must index into choices');
        }
        correctChoice = cc;
      }
      return {
        mode: 'tensor',
        sigmaMajor: num(o.sigmaMajor, '$.scene.setup.sigmaMajor'),
        sigmaMinor: num(o.sigmaMinor, '$.scene.setup.sigmaMinor'),
        e0: o.e0 === undefined ? 1 : num(o.e0, '$.scene.setup.e0'),
        choices,
        correctChoice,
      };
    }
    default:
      fail('$.scene.setup.mode', 'expected heightmap|volume|tensor');
  }
}

/** Gameplay softening: keeps wells finite so descent settles, not diverges. */
const WELL_SOFTEN = 0.02;
const GRID_N = 97;

/** The 2-D potential landscape a heightmap level rolls balls on. */
export function heightmapEnv(setup: HeightmapSetup, placed: PointCharge[] = []): EmEnv {
  return { charges: [...setup.charges, ...placed], regions: [], soften_m: WELL_SOFTEN };
}

/** The gradient-flow path a ball dropped at (x,y) would take. */
export function descentPathForDrop(
  setup: HeightmapSetup,
  x: number,
  y: number,
  placed: PointCharge[] = [],
): Pt[] {
  const env = heightmapEnv(setup, placed);
  const { x0, y0, x1, y1 } = setup.window;
  const f = sampleField((px, py) => potentialAt(px, py, env), x0, y0, x1, y1, GRID_N, GRID_N);
  return descentPath(f, x, y, { step_m: (x1 - x0) / 200, maxSteps: 5000 });
}

/** Drop a ball: it follows −∇V; `home` if it settles in the home basin. */
export function dropBall(setup: HeightmapSetup, state: FieldLabState, x: number, y: number): FieldLabState {
  const path = descentPathForDrop(setup, x, y, state.placed);
  const end = path[path.length - 1]!;
  const home = Math.hypot(end.x - setup.home.x, end.y - setup.home.y) <= setup.home.r;
  return { ...state, drops: [...state.drops, { x, y, home, path }] };
}

/** Placing on (near) an existing charge removes it instead. */
const REMOVE_RADIUS = 0.05;

/**
 * Sculpt variant: place one of the budgeted charges (or pick one back up).
 * Over-budget placements are ignored — the budget IS the puzzle.
 */
export function placeChargeHM(setup: HeightmapSetup, state: FieldLabState, x: number, y: number): FieldLabState {
  if (!setup.placeable) return state;
  const near = state.placed.findIndex((c) => Math.hypot(c.x_m - x, c.y_m - y) <= REMOVE_RADIUS);
  if (near >= 0) {
    return { ...state, placed: state.placed.filter((_, i) => i !== near) };
  }
  if (state.placed.length >= setup.placeable.count) return state;
  return { ...state, placed: [...state.placed, { q_C: setup.placeable.q_C, x_m: x, y_m: y }] };
}

/** How many fixed spawns currently roll home, given the placed charges. */
export function spawnsHome(setup: HeightmapSetup, state: FieldLabState): number {
  if (!setup.spawns) return 0;
  let n = 0;
  for (const sp of setup.spawns) {
    const path = descentPathForDrop(setup, sp.x, sp.y, state.placed);
    const end = path[path.length - 1]!;
    if (Math.hypot(end.x - setup.home.x, end.y - setup.home.y) <= setup.home.r) n++;
  }
  return n;
}

const VOLUME_SOFTEN = 1e-6;

/** |E| (V/m) of the 3-D charge set at a point. */
export function volumeFieldAt(setup: VolumeSetup, x: number, y: number, z: number): number {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (const c of setup.charges) {
    const dx = x - c.x_m;
    const dy = y - c.y_m;
    const dz = z - c.z_m;
    const r2 = Math.max(dx * dx + dy * dy + dz * dz, VOLUME_SOFTEN * VOLUME_SOFTEN);
    const r = Math.sqrt(r2);
    const e = (K_COULOMB * c.q_C) / r2;
    ex += (e * dx) / r;
    ey += (e * dy) / r;
    ez += (e * dz) / r;
  }
  return Math.hypot(ex, ey, ez);
}

/** V (volts) of the 3-D charge set at a point (zero at infinity). */
export function volumePotentialAt(setup: VolumeSetup, x: number, y: number, z: number): number {
  let v = 0;
  for (const c of setup.charges) {
    const r = Math.max(Math.hypot(x - c.x_m, y - c.y_m, z - c.z_m), VOLUME_SOFTEN);
    v += (K_COULOMB * c.q_C) / r;
  }
  return v;
}

/** Move the cut plane (axis + fraction along the box). Counted as a cut. */
export function setCut(state: FieldLabState, axis: CutAxis, frac: number): FieldLabState {
  return {
    ...state,
    cutAxis: axis,
    cutFrac: Math.min(1, Math.max(0, frac)),
    cutsMade: state.cutsMade + 1,
  };
}

/** Map (u,v) on the current cut face to the 3-D point it names. */
export function cutPoint(
  setup: VolumeSetup,
  state: FieldLabState,
  u: number,
  v: number,
): [number, number, number] {
  const b = setup.box;
  switch (state.cutAxis) {
    case 'x':
      return [b.x0 + state.cutFrac * (b.x1 - b.x0), u, v];
    case 'y':
      return [u, b.y0 + state.cutFrac * (b.y1 - b.y0), v];
    case 'z':
      return [u, v, b.z0 + state.cutFrac * (b.z1 - b.z0)];
  }
}

/** Probe counts as "peak found" within this fraction of the face diagonal. */
const PEAK_TOL_FRAC = 0.08;
const FACE_SAMPLES = 41;

/** Where |E| peaks on the current cut face (grid argmax). */
export function facePeak(setup: VolumeSetup, state: FieldLabState): { u: number; v: number } {
  const b = setup.box;
  const [u0, u1, v0, v1] =
    state.cutAxis === 'x' ? [b.y0, b.y1, b.z0, b.z1]
    : state.cutAxis === 'y' ? [b.x0, b.x1, b.z0, b.z1]
    : [b.x0, b.x1, b.y0, b.y1];
  let best = { u: u0, v: v0 };
  let bestE = -Infinity;
  for (let i = 0; i < FACE_SAMPLES; i++) {
    for (let j = 0; j < FACE_SAMPLES; j++) {
      const u = u0 + ((u1 - u0) * i) / (FACE_SAMPLES - 1);
      const v = v0 + ((v1 - v0) * j) / (FACE_SAMPLES - 1);
      const [x, y, z] = cutPoint(setup, state, u, v);
      const e = volumeFieldAt(setup, x, y, z);
      if (e > bestE) {
        bestE = e;
        best = { u, v };
      }
    }
  }
  return best;
}

/** Probe the field on the current cut face at (u,v). */
export function probeVolume(setup: VolumeSetup, state: FieldLabState, u: number, v: number): FieldLabState {
  const [x, y, z] = cutPoint(setup, state, u, v);
  const e_mag = volumeFieldAt(setup, x, y, z);
  const peak = facePeak(setup, state);
  const b = setup.box;
  const diag =
    state.cutAxis === 'x' ? Math.hypot(b.y1 - b.y0, b.z1 - b.z0)
    : state.cutAxis === 'y' ? Math.hypot(b.x1 - b.x0, b.z1 - b.z0)
    : Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  const nearPeak = Math.hypot(u - peak.u, v - peak.v) <= PEAK_TOL_FRAC * diag;
  return { ...state, probesV: [...state.probesV, { u, v, e_mag, nearPeak }] };
}

/**
 * Rotate the strained slab to `theta` and measure J = σ̿·E.
 * In the slab frame σ̿ = diag(σmajor, σminor); E is fixed along +x.
 * Anchor: strain engineering has boosted Si mobility in production CMOS
 * since the 90 nm node (2003) — direction-dependent response is real.
 */
export function probeOrientation(
  setup: TensorSetup,
  state: FieldLabState,
  theta_rad: number,
): FieldLabState {
  const c = Math.cos(theta_rad);
  const s = Math.sin(theta_rad);
  // E in slab frame, response, back to lab frame
  const jSlabX = setup.sigmaMajor * setup.e0 * c;
  const jSlabY = -setup.sigmaMinor * setup.e0 * s;
  const jx = c * jSlabX - s * jSlabY;
  const jy = s * jSlabX + c * jSlabY;
  const probe: TensorProbe = {
    theta_rad,
    j_mag: Math.hypot(jx, jy),
    deflection_rad: Math.atan2(jy, jx),
  };
  return { ...state, probesT: [...state.probesT, probe] };
}

/** 15° orientation buckets — "distinct angles tried". */
const ANGLE_BUCKET_RAD = Math.PI / 12;

export interface FieldLabMetrics extends Record<string, number> {
  ballsHome: number;
  dropsUsed: number;
  spawnsHome: number;
  chargesPlaced: number;
  cutsMade: number;
  probesUsed: number;
  peakFound: number;
  orientationsProbed: number;
}

export function fieldLabMetrics(setup: FieldLabSetup, state: FieldLabState): FieldLabMetrics {
  const buckets = new Set(state.probesT.map((p) => Math.round(p.theta_rad / ANGLE_BUCKET_RAD)));
  return {
    ballsHome: state.drops.filter((d) => d.home).length,
    dropsUsed: state.drops.length,
    spawnsHome: setup.mode === 'heightmap' ? spawnsHome(setup, state) : 0,
    chargesPlaced: state.placed.length,
    cutsMade: state.cutsMade,
    probesUsed: state.probesV.length + state.probesT.length,
    peakFound: state.probesV.some((p) => p.nearPeak) ? 1 : 0,
    orientationsProbed: buckets.size,
  };
}
