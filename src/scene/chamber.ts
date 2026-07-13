/**
 * Particle-chamber scene model (Ch1 — Motion & Charge). Pure: setup parsing,
 * shot simulation via physics/em.ts, metrics for the level evaluator.
 *
 * The chamber is a 1 m × 0.75 m vacuum box; particles are electrons (or
 * "positive test particles" with electron mass — the game states the
 * simplification). Fields in V/m, charges in nC: numbers chosen so
 * electron-scale kinematics plays out over centimeters in ~100 ns.
 */

import { LevelValidationError } from '../engine/levels';
import {
  ELECTRON_M,
  ELECTRON_Q,
  fieldAt,
  integrateTrajectory,
  type EmEnv,
  type FieldRegion,
  type PointCharge,
  type TrajectoryPoint,
} from '../physics/em';

export const CHAMBER_W = 1;
export const CHAMBER_H = 0.75;
const DT = 2e-10;
const MAX_STEPS = 2500;

export interface Obstacle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ChamberSetup {
  regions: FieldRegion[];
  charges: PointCharge[]; // fixed scene charges
  launcher: { x: number; y: number; speed_ms: number };
  target: { x: number; y: number; r: number };
  obstacles: Obstacle[];
  /** Player may place this many steering charges of this magnitude. */
  placeable: { count: number; q_C: number } | null;
  /** Player may flip the launched particle's charge sign (c1-02). */
  polarityToggle: boolean;
  /** Target only counts when impact kinetic energy is in this window (J). */
  energyWindow: { min_J: number; max_J: number } | null;
  /** The canonical shot used for the prediction reveal. */
  predictionShot: { vx_ms: number; vy_ms: number };
}

export interface ChamberState {
  placed: PointCharge[];
  polarity: 1 | -1; // multiplies ELECTRON_Q (−e); −1 ⇒ positive particle
  shots: Shot[];
}

export interface Shot {
  points: TrajectoryPoint[];
  hit: boolean;
  landingEnergy_J: number;
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
function arr(v: unknown, path: string): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) fail(path, 'expected array');
  return v;
}

/** Validate a level's scene.setup for the particle chamber. */
export function parseChamberSetup(json: unknown): ChamberSetup {
  const o = rec(json, '$.scene.setup');
  const regions = arr(o.regions, '$.scene.setup.regions').map((r, i) => {
    const p = `$.scene.setup.regions[${i}]`;
    const g = rec(r, p);
    return {
      x0_m: num(g.x0, `${p}.x0`),
      y0_m: num(g.y0, `${p}.y0`),
      x1_m: num(g.x1, `${p}.x1`),
      y1_m: num(g.y1, `${p}.y1`),
      ex_Vm: num(g.ex_Vm ?? 0, `${p}.ex_Vm`),
      ey_Vm: num(g.ey_Vm ?? 0, `${p}.ey_Vm`),
    };
  });
  const charges = arr(o.charges, '$.scene.setup.charges').map((c, i) => {
    const p = `$.scene.setup.charges[${i}]`;
    const g = rec(c, p);
    return { q_C: num(g.q_nC, `${p}.q_nC`) * 1e-9, x_m: num(g.x, `${p}.x`), y_m: num(g.y, `${p}.y`) };
  });
  const l = rec(o.launcher, '$.scene.setup.launcher');
  const t = rec(o.target, '$.scene.setup.target');
  const obstacles = arr(o.obstacles, '$.scene.setup.obstacles').map((b, i) => {
    const p = `$.scene.setup.obstacles[${i}]`;
    const g = rec(b, p);
    return { x0: num(g.x0, p), y0: num(g.y0, p), x1: num(g.x1, p), y1: num(g.y1, p) };
  });
  const placeable = o.placeable
    ? (() => {
        const g = rec(o.placeable, '$.scene.setup.placeable');
        return { count: num(g.count, '$.scene.setup.placeable.count'), q_C: num(g.q_nC, '$.scene.setup.placeable.q_nC') * 1e-9 };
      })()
    : null;
  const energyWindow = o.energyWindow
    ? (() => {
        const g = rec(o.energyWindow, '$.scene.setup.energyWindow');
        return { min_J: num(g.min_J, '$.min'), max_J: num(g.max_J, '$.max') };
      })()
    : null;
  const ps = rec(o.predictionShot ?? { vx_ms: num(l.speed_ms, '$.launcher.speed_ms'), vy_ms: 0 }, '$.scene.setup.predictionShot');
  return {
    regions,
    charges,
    launcher: { x: num(l.x, '$.launcher.x'), y: num(l.y, '$.launcher.y'), speed_ms: num(l.speed_ms, '$.launcher.speed_ms') },
    target: { x: num(t.x, '$.target.x'), y: num(t.y, '$.target.y'), r: num(t.r, '$.target.r') },
    obstacles,
    placeable,
    polarityToggle: o.polarityToggle === true,
    energyWindow,
    predictionShot: { vx_ms: num(ps.vx_ms, '$.predictionShot.vx_ms'), vy_ms: num(ps.vy_ms, '$.predictionShot.vy_ms') },
  };
}

export function initialChamberState(): ChamberState {
  return { placed: [], polarity: 1, shots: [] };
}

export function envOf(setup: ChamberSetup, state: ChamberState): EmEnv {
  return { charges: [...setup.charges, ...state.placed], regions: setup.regions, soften_m: 5e-3 };
}

/** Simulate a launch; truncate at obstacles; detect target hit. */
export function simulateShot(
  setup: ChamberSetup,
  state: ChamberState,
  vx_ms: number,
  vy_ms: number,
): Shot {
  const q = ELECTRON_Q * state.polarity;
  const raw = integrateTrajectory(
    q,
    ELECTRON_M,
    setup.launcher.x,
    setup.launcher.y,
    vx_ms,
    vy_ms,
    envOf(setup, state),
    DT,
    MAX_STEPS,
    { x0_m: 0, y0_m: 0, x1_m: CHAMBER_W, y1_m: CHAMBER_H },
  );
  const points: TrajectoryPoint[] = [];
  let hit = false;
  let landingEnergy_J = 0;
  for (const p of raw) {
    points.push(p);
    if (setup.obstacles.some((b) => p.x_m >= b.x0 && p.x_m < b.x1 && p.y_m >= b.y0 && p.y_m < b.y1)) {
      break; // absorbed
    }
    if (Math.hypot(p.x_m - setup.target.x, p.y_m - setup.target.y) <= setup.target.r) {
      landingEnergy_J = 0.5 * ELECTRON_M * (p.vx_ms ** 2 + p.vy_ms ** 2);
      hit =
        setup.energyWindow === null ||
        (landingEnergy_J >= setup.energyWindow.min_J && landingEnergy_J <= setup.energyWindow.max_J);
      break;
    }
  }
  return { points, hit, landingEnergy_J };
}

export function fireShot(setup: ChamberSetup, state: ChamberState, vx: number, vy: number): ChamberState {
  return { ...state, shots: [...state.shots, simulateShot(setup, state, vx, vy)] };
}

export function placeCharge(setup: ChamberSetup, state: ChamberState, x: number, y: number): ChamberState {
  if (!setup.placeable || state.placed.length >= setup.placeable.count) return state;
  return { ...state, placed: [...state.placed, { q_C: setup.placeable.q_C, x_m: x, y_m: y }] };
}

/** Metrics for the level evaluator (METRIC_REGISTRY['particle-chamber']). */
export function chamberMetrics(setup: ChamberSetup, state: ChamberState): Record<string, number> {
  const hits = state.shots.filter((s) => s.hit).length;
  const lastHit = [...state.shots].reverse().find((s) => s.hit);
  return {
    hits,
    hitFraction: state.shots.length ? hits / state.shots.length : 0,
    shotsUsed: state.shots.length,
    landingEnergy_J: lastHit?.landingEnergy_J ?? 0,
  };
}

/** Field probe for the long-press inspector. */
export function probeField(setup: ChamberSetup, state: ChamberState, x: number, y: number): [number, number] {
  return fieldAt(x, y, envOf(setup, state));
}
