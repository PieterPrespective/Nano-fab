/**
 * Level JSON schema (v1) parsing + validation.
 *
 * Levels are data, not code (src/levels/*.json). Anything invalid fails
 * loudly at load with a path-precise error so authoring mistakes can't ship.
 * Schema documented in prompts/nf01/03-engine-levels-scoring.md.
 */

import { METRIC_KEYS, type Architecture, type DeviceMetrics, type DeviceParams } from '../physics/device';

export interface NumericControl {
  kind: 'numeric';
  min: number;
  max: number;
  init: number;
  scale: 'linear' | 'log';
  step?: number;
}

export interface EnumControl {
  kind: 'enum';
  options: Architecture[];
  init: Architecture;
}

export type ControlSpec = NumericControl | EnumControl;

export interface Target {
  metric: keyof DeviceMetrics;
  op: '<=' | '>=';
  value: number;
  label: string;
}

export interface StarsSpec {
  metric: keyof DeviceMetrics;
  direction: 'min' | 'max';
  two: number;
  three: number;
}

export interface Level {
  schema: 1;
  id: string;
  layer: number;
  title: string;
  intro: string;
  explain: string;
  controls: Record<string, ControlSpec>;
  fixed: Partial<Record<NumericParamKey, number>> & { arch?: Architecture };
  targets: Target[];
  stars: StarsSpec;
  codex: string[];
}

/** Player choices, keyed by control name. */
export type PlayerValues = Record<string, number | string>;

export type NumericParamKey = Exclude<keyof DeviceParams, 'arch'>;

const NUMERIC_PARAM_KEYS: NumericParamKey[] = [
  'gateLength_m',
  'eot_m',
  'bodyThickness_m',
  'sheetWidth_m',
  'nStack',
  'vth0_V',
  'vdd_V',
  'temperature_K',
];
const ARCHS: Architecture[] = ['planar', 'finfet', 'gaa'];
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'id',
  'layer',
  'title',
  'intro',
  'explain',
  'controls',
  'fixed',
  'targets',
  'stars',
  'codex',
]);

/** Engine defaults for everything a level neither fixes nor unlocks. */
export const DEFAULT_PARAMS: DeviceParams = {
  arch: 'planar',
  gateLength_m: 25e-9,
  eot_m: 1e-9,
  bodyThickness_m: 6e-9,
  sheetWidth_m: 25e-9,
  nStack: 1,
  vth0_V: 0.25,
  vdd_V: 0.7,
  temperature_K: 300,
};

export class LevelValidationError extends Error {
  constructor(
    public readonly path: string,
    detail: string,
  ) {
    super(`invalid level at ${path}: ${detail}`);
    this.name = 'LevelValidationError';
  }
}

function fail(path: string, detail: string): never {
  throw new LevelValidationError(path, detail);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'expected non-empty string');
  return v;
}

function expectNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected finite number');
  return v;
}

function parseControl(key: string, v: unknown, path: string): ControlSpec {
  if (!isRecord(v)) fail(path, 'expected object');
  if ('options' in v) {
    if (key !== 'arch') fail(path, `enum control only supported for "arch", got "${key}"`);
    if (!Array.isArray(v.options) || v.options.length < 2) fail(`${path}.options`, 'expected ≥ 2 options');
    const options = v.options.map((o, i) => {
      if (typeof o !== 'string' || !ARCHS.includes(o as Architecture)) {
        fail(`${path}.options[${i}]`, `expected one of ${ARCHS.join('|')}`);
      }
      return o as Architecture;
    });
    const init = expectString(v.init, `${path}.init`) as Architecture;
    if (!options.includes(init)) fail(`${path}.init`, 'init must be one of options');
    return { kind: 'enum', options, init };
  }
  if (!(NUMERIC_PARAM_KEYS as string[]).includes(key)) {
    fail(path, `"${key}" is not a device parameter`);
  }
  const min = expectNumber(v.min, `${path}.min`);
  const max = expectNumber(v.max, `${path}.max`);
  if (!(min < max)) fail(path, 'min must be < max');
  const init = expectNumber(v.init, `${path}.init`);
  if (init < min || init > max) fail(`${path}.init`, 'init out of [min, max]');
  const scale = v.scale === undefined ? 'linear' : v.scale;
  if (scale !== 'linear' && scale !== 'log') fail(`${path}.scale`, 'expected "linear" | "log"');
  if (scale === 'log' && min <= 0) fail(`${path}.scale`, 'log scale requires min > 0');
  let step: number | undefined;
  if (v.step !== undefined) {
    step = expectNumber(v.step, `${path}.step`);
    if (step <= 0) fail(`${path}.step`, 'step must be > 0');
  }
  return { kind: 'numeric', min, max, init, scale, step };
}

export function parseLevel(json: unknown): Level {
  if (!isRecord(json)) fail('$', 'expected object');
  for (const k of Object.keys(json)) {
    if (!TOP_LEVEL_KEYS.has(k)) fail(`$.${k}`, 'unknown key');
  }
  if (json.schema !== 1) fail('$.schema', 'expected 1');
  const id = expectString(json.id, '$.id');
  if (!/^l\d+-\d{2}$/.test(id)) fail('$.id', 'expected pattern l<layer>-<nn>');
  const layer = expectNumber(json.layer, '$.layer');
  const title = expectString(json.title, '$.title');
  const intro = expectString(json.intro, '$.intro');
  const explain = expectString(json.explain, '$.explain');

  if (!isRecord(json.controls) || Object.keys(json.controls).length === 0) {
    fail('$.controls', 'expected non-empty object');
  }
  const controls: Record<string, ControlSpec> = {};
  for (const [key, spec] of Object.entries(json.controls)) {
    if (key !== 'arch' && !(NUMERIC_PARAM_KEYS as string[]).includes(key)) {
      fail(`$.controls.${key}`, 'not a device parameter');
    }
    controls[key] = parseControl(key, spec, `$.controls.${key}`);
  }

  const fixed: Level['fixed'] = {};
  if (json.fixed !== undefined) {
    if (!isRecord(json.fixed)) fail('$.fixed', 'expected object');
    for (const [key, value] of Object.entries(json.fixed)) {
      if (key in controls) fail(`$.fixed.${key}`, 'parameter is both fixed and a control');
      if (key === 'arch') {
        if (typeof value !== 'string' || !ARCHS.includes(value as Architecture)) {
          fail('$.fixed.arch', `expected one of ${ARCHS.join('|')}`);
        }
        fixed.arch = value as Architecture;
      } else if ((NUMERIC_PARAM_KEYS as string[]).includes(key)) {
        fixed[key as NumericParamKey] = expectNumber(value, `$.fixed.${key}`);
      } else {
        fail(`$.fixed.${key}`, 'not a device parameter');
      }
    }
  }

  if (!Array.isArray(json.targets) || json.targets.length === 0) {
    fail('$.targets', 'expected non-empty array');
  }
  const targets = json.targets.map((t, i): Target => {
    const path = `$.targets[${i}]`;
    if (!isRecord(t)) fail(path, 'expected object');
    const metric = expectString(t.metric, `${path}.metric`);
    if (!(METRIC_KEYS as string[]).includes(metric)) fail(`${path}.metric`, 'not a device metric');
    if (t.op !== '<=' && t.op !== '>=') fail(`${path}.op`, 'expected "<=" | ">="');
    return {
      metric: metric as keyof DeviceMetrics,
      op: t.op,
      value: expectNumber(t.value, `${path}.value`),
      label: expectString(t.label, `${path}.label`),
    };
  });

  if (!isRecord(json.stars)) fail('$.stars', 'expected object');
  const starsMetric = expectString(json.stars.metric, '$.stars.metric');
  if (!(METRIC_KEYS as string[]).includes(starsMetric)) fail('$.stars.metric', 'not a device metric');
  const direction = json.stars.direction;
  if (direction !== 'min' && direction !== 'max') fail('$.stars.direction', 'expected "min" | "max"');
  const two = expectNumber(json.stars.two, '$.stars.two');
  const three = expectNumber(json.stars.three, '$.stars.three');
  if (direction === 'min' && !(two >= three)) fail('$.stars', 'min direction requires two >= three');
  if (direction === 'max' && !(two <= three)) fail('$.stars', 'max direction requires two <= three');

  if (!Array.isArray(json.codex) || json.codex.some((c) => typeof c !== 'string')) {
    fail('$.codex', 'expected string array');
  }

  return {
    schema: 1,
    id,
    layer,
    title,
    intro,
    explain,
    controls,
    fixed,
    targets,
    stars: { metric: starsMetric as keyof DeviceMetrics, direction, two, three },
    codex: json.codex as string[],
  };
}

/** Parse a level list; ids must be unique. */
export function loadLevelList(jsons: unknown[]): Level[] {
  const levels = jsons.map(parseLevel);
  const seen = new Set<string>();
  for (const l of levels) {
    if (seen.has(l.id)) fail(`$.id`, `duplicate level id "${l.id}"`);
    seen.add(l.id);
  }
  return levels;
}

function clampNumeric(spec: NumericControl, value: number): number {
  let v = value;
  if (!Number.isFinite(v)) v = spec.init;
  if (spec.step) v = spec.min + Math.round((v - spec.min) / spec.step) * spec.step;
  return Math.min(spec.max, Math.max(spec.min, v));
}

/**
 * Merge defaults + level.fixed + clamped player values into DeviceParams.
 * Clamping is engine policy: neither the UI nor a corrupted save can produce
 * out-of-range physics inputs. Locked parameters ignore player values.
 */
export function resolveParams(level: Level, player: PlayerValues): DeviceParams {
  const params: DeviceParams = { ...DEFAULT_PARAMS, ...level.fixed };
  for (const [key, spec] of Object.entries(level.controls)) {
    const raw = player[key];
    if (spec.kind === 'enum') {
      const v = typeof raw === 'string' && spec.options.includes(raw as Architecture) ? raw : spec.init;
      params.arch = v as Architecture;
    } else {
      const v = typeof raw === 'number' ? raw : spec.init;
      params[key as NumericParamKey] = clampNumeric(spec, v);
    }
  }
  return params;
}
