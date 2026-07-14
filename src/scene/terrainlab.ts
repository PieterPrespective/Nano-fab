/**
 * Energy-terrain scene model (Ch2 — the transistor re-staged). Pure: setup
 * parsing, control resolution, metrics. The setup embeds a v1-style
 * controls/fixed block, and the metrics ARE `deviceMetrics` of the resolved
 * parameters — so the re-staged levels score identically to their phase-1
 * originals, and the terrain view (physics/terrain.ts) can never disagree
 * with the Id–Vg inset.
 */

import {
  LevelValidationError,
  parseControl,
  resolveControlValues,
  type ControlSpec,
  type Level,
  type PlayerValues,
} from '../engine/levels';
import { deviceMetrics, type DeviceParams } from '../physics/device';

export interface TerrainLabSetup {
  controls: Record<string, ControlSpec>;
  fixed: Level['fixed'];
  /** Seed for the thermal ball crowd (visual determinism). */
  crowdSeed: number;
  /** Options for a `choose` prediction, if the level has one. */
  choices?: string[];
  correctChoice?: number;
}

function fail(path: string, detail: string): never {
  throw new LevelValidationError(path, detail);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a level's scene.setup for the energy terrain. */
export function parseTerrainSetup(json: unknown): TerrainLabSetup {
  if (!isRecord(json)) fail('$.scene.setup', 'expected object');
  if (!isRecord(json.controls) || Object.keys(json.controls).length === 0) {
    fail('$.scene.setup.controls', 'expected non-empty object');
  }
  const controls: Record<string, ControlSpec> = {};
  for (const [key, spec] of Object.entries(json.controls)) {
    controls[key] = parseControl(key, spec, `$.scene.setup.controls.${key}`);
  }
  const fixed: Level['fixed'] = {};
  if (json.fixed !== undefined) {
    if (!isRecord(json.fixed)) fail('$.scene.setup.fixed', 'expected object');
    Object.assign(fixed, json.fixed);
  }
  let crowdSeed = 1;
  if (json.crowdSeed !== undefined) {
    if (typeof json.crowdSeed !== 'number') fail('$.scene.setup.crowdSeed', 'expected number');
    crowdSeed = json.crowdSeed;
  }
  let choices: string[] | undefined;
  let correctChoice: number | undefined;
  if (json.choices !== undefined) {
    if (!Array.isArray(json.choices) || json.choices.some((c) => typeof c !== 'string')) {
      fail('$.scene.setup.choices', 'expected string array');
    }
    choices = json.choices as string[];
  }
  if (json.correctChoice !== undefined) {
    if (
      typeof json.correctChoice !== 'number' ||
      !choices ||
      json.correctChoice < 0 ||
      json.correctChoice >= choices.length
    ) {
      fail('$.scene.setup.correctChoice', 'correctChoice must index into choices');
    }
    correctChoice = json.correctChoice;
  }
  return { controls, fixed, crowdSeed, choices, correctChoice };
}

/** The do-nothing baseline: every control at its init value. */
export function initialTerrainValues(setup: TerrainLabSetup): PlayerValues {
  const v: PlayerValues = {};
  for (const [key, spec] of Object.entries(setup.controls)) v[key] = spec.init;
  return v;
}

/** Defaults + fixed + clamped player values → DeviceParams. */
export function resolveTerrainParams(setup: TerrainLabSetup, values: PlayerValues): DeviceParams {
  return resolveControlValues(setup.controls, setup.fixed, values);
}

/** Scored metrics: exactly the phase-1 device metrics. */
export function terrainMetrics(setup: TerrainLabSetup, values: PlayerValues): Record<string, number> {
  return { ...deviceMetrics(resolveTerrainParams(setup, values)) };
}
