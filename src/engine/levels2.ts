/**
 * Level schema v2: scene-first levels with declared tools, an optional
 * predict-then-observe beat, inset graphs, and concept-node tags.
 * v1 levels (phase 1) remain parseable via parseAnyLevel during the
 * migration window (prompts/nf03/06 §2-3).
 */

import { METRIC_KEYS } from '../physics/device';
import {
  LevelValidationError,
  parseLevel as parseLevelV1,
  type Level as LevelV1,
  type StarsSpec,
  type Target,
} from './levels';

export const SCENE_TYPES = [
  'particle-chamber',
  'field-lab',
  'energy-terrain',
  'logic-inverter',
  'ripple-tank',
  'resist-exposure',
  'scanner-stage',
  'wafer3d',
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const TOOL_IDS = [
  'place',
  'drag-object',
  'draw',
  'launch',
  'scrub',
  'cut',
  'order',
  'probe',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const PREDICTION_KINDS = ['sketch', 'mark', 'choose'] as const;
export type PredictionKind = (typeof PREDICTION_KINDS)[number];

export const INSET_KINDS = [
  'idvg',
  'trajectory-xy',
  'dose-histogram',
  'profile-section',
  'motion-profile',
] as const;
export type InsetKind = (typeof INSET_KINDS)[number];

/**
 * Metric registry: each scene type exposes its own namespace of scoreable
 * metrics; the validator rejects targets naming anything else.
 */
export const METRIC_REGISTRY: Record<SceneType, readonly string[]> = {
  'energy-terrain': METRIC_KEYS, // scored by the phase-1 device model
  'particle-chamber': ['hits', 'hitFraction', 'landingEnergy_J', 'shotsUsed'],
  'field-lab': ['ballsHome', 'dropsUsed', 'spawnsHome', 'chargesPlaced', 'cutsMade', 'probesUsed', 'peakFound', 'orientationsProbed'],
  'logic-inverter': ['vm_V', 'gain', 'nmLow_V', 'nmHigh_V', 'swing_V'],
  'ripple-tank': ['minPitch_m', 'epe_m', 'contrast'],
  'resist-exposure': ['defectCount', 'ler_m', 'dose_Jm2', 'throughput_wph'],
  'scanner-stage': ['moveSettle_s', 'overlay_m', 'wafersPerHour'],
  wafer3d: ['structureIoU', 'processCost', 'stepCount', 'yieldFraction', 'profitPerWafer'],
};

/** Concept nodes of the mastery graph (prompts/nf03/01 §5 + §2.5). */
export const CONCEPT_NODES = [
  'charge-force',
  'field-map',
  'scalar-field-gradient',
  'potential-terrain',
  'boltzmann-tail',
  'tunneling',
  'switch-logic',
  'superposition',
  'diffraction-limit',
  'photon-shot-noise',
  'rls-triangle',
  'scurve-motion',
  'settling',
  'deposition',
  'etch-anisotropy',
  'implant',
  'cmp',
  'masking',
  'overlay',
  'yield',
] as const;
export type ConceptNode = (typeof CONCEPT_NODES)[number];

export interface Prediction {
  kind: PredictionKind;
  prompt: string;
  /** false ⇒ misconception probe: revealed, never penalized. */
  scored: boolean;
  conceptNodes: ConceptNode[];
}

export interface Inset {
  kind: InsetKind;
  unlockOn: 'reveal' | 'clear' | 'always';
}

export interface LevelV2 {
  schema: 2;
  id: string;
  chapter: number;
  title: string;
  intro: string;
  explain: string;
  scene: { type: SceneType; setup: Record<string, unknown> };
  tools: ToolId[];
  prediction?: Prediction;
  targets: Target[]; // same shape as v1; metric names per scene registry
  stars: StarsSpec & { metric: string };
  insets: Inset[];
  conceptNodes: ConceptNode[];
}

export type AnyLevel = { v: 1; level: LevelV1 } | { v: 2; level: LevelV2 };

const TOP_KEYS = new Set([
  'schema',
  'id',
  'chapter',
  'title',
  'intro',
  'explain',
  'scene',
  'tools',
  'prediction',
  'targets',
  'stars',
  'insets',
  'conceptNodes',
]);

function fail(path: string, detail: string): never {
  throw new LevelValidationError(path, detail);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || !v) fail(path, 'expected non-empty string');
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected finite number');
  return v;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v !== 'string' || !options.includes(v as T)) {
    fail(path, `expected one of ${options.join('|')}`);
  }
  return v as T;
}

export function parseLevelV2(json: unknown): LevelV2 {
  if (!isRecord(json)) fail('$', 'expected object');
  for (const k of Object.keys(json)) if (!TOP_KEYS.has(k)) fail(`$.${k}`, 'unknown key');
  if (json.schema !== 2) fail('$.schema', 'expected 2');

  const id = str(json.id, '$.id');
  if (!/^c\d+-[a-z0-9]{2,4}$/.test(id)) fail('$.id', 'expected pattern c<chapter>-<nn>');
  const chapter = num(json.chapter, '$.chapter');

  if (!isRecord(json.scene)) fail('$.scene', 'expected object');
  const sceneType = oneOf(json.scene.type, SCENE_TYPES, '$.scene.type');
  const setup = json.scene.setup ?? {};
  if (!isRecord(setup)) fail('$.scene.setup', 'expected object');

  if (!Array.isArray(json.tools) || json.tools.length === 0) fail('$.tools', 'expected non-empty array');
  const tools = json.tools.map((t, i) => oneOf(t, TOOL_IDS, `$.tools[${i}]`));

  let prediction: Prediction | undefined;
  if (json.prediction !== undefined) {
    if (!isRecord(json.prediction)) fail('$.prediction', 'expected object');
    const nodes = json.prediction.conceptNodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      fail('$.prediction.conceptNodes', 'expected non-empty array');
    }
    prediction = {
      kind: oneOf(json.prediction.kind, PREDICTION_KINDS, '$.prediction.kind'),
      prompt: str(json.prediction.prompt, '$.prediction.prompt'),
      scored: json.prediction.scored !== false,
      conceptNodes: nodes.map((n, i) => oneOf(n, CONCEPT_NODES, `$.prediction.conceptNodes[${i}]`)),
    };
  }

  const allowedMetrics = METRIC_REGISTRY[sceneType];
  if (!Array.isArray(json.targets) || json.targets.length === 0) {
    fail('$.targets', 'expected non-empty array');
  }
  const targets = json.targets.map((t, i): Target => {
    const path = `$.targets[${i}]`;
    if (!isRecord(t)) fail(path, 'expected object');
    const metric = str(t.metric, `${path}.metric`);
    if (!allowedMetrics.includes(metric)) {
      fail(`${path}.metric`, `"${metric}" is not a metric of scene "${sceneType}"`);
    }
    if (t.op !== '<=' && t.op !== '>=') fail(`${path}.op`, 'expected "<=" | ">="');
    return {
      metric: metric as Target['metric'],
      op: t.op,
      value: num(t.value, `${path}.value`),
      label: str(t.label, `${path}.label`),
    };
  });

  if (!isRecord(json.stars)) fail('$.stars', 'expected object');
  const starsMetric = str(json.stars.metric, '$.stars.metric');
  if (!allowedMetrics.includes(starsMetric)) fail('$.stars.metric', 'not a metric of this scene');
  const direction = oneOf(json.stars.direction, ['min', 'max'] as const, '$.stars.direction');
  const two = num(json.stars.two, '$.stars.two');
  const three = num(json.stars.three, '$.stars.three');
  if (direction === 'min' && !(two >= three)) fail('$.stars', 'min direction requires two >= three');
  if (direction === 'max' && !(two <= three)) fail('$.stars', 'max direction requires two <= three');

  const insets = (json.insets === undefined ? [] : json.insets) as unknown;
  if (!Array.isArray(insets)) fail('$.insets', 'expected array');
  const parsedInsets = insets.map((ins, i): Inset => {
    const path = `$.insets[${i}]`;
    if (!isRecord(ins)) fail(path, 'expected object');
    return {
      kind: oneOf(ins.kind, INSET_KINDS, `${path}.kind`),
      unlockOn: oneOf(ins.unlockOn ?? 'reveal', ['reveal', 'clear', 'always'] as const, `${path}.unlockOn`),
    };
  });

  if (!Array.isArray(json.conceptNodes) || json.conceptNodes.length === 0) {
    fail('$.conceptNodes', 'expected non-empty array');
  }
  const conceptNodes = json.conceptNodes.map((n, i) => oneOf(n, CONCEPT_NODES, `$.conceptNodes[${i}]`));

  return {
    schema: 2,
    id,
    chapter,
    title: str(json.title, '$.title'),
    intro: str(json.intro, '$.intro'),
    explain: str(json.explain, '$.explain'),
    scene: { type: sceneType, setup },
    tools,
    prediction,
    targets,
    stars: { metric: starsMetric, direction, two, three } as LevelV2['stars'],
    insets: parsedInsets,
    conceptNodes,
  };
}

/** Parse either schema; the migration-window entry point. */
export function parseAnyLevel(json: unknown): AnyLevel {
  if (isRecord(json) && json.schema === 2) return { v: 2, level: parseLevelV2(json) };
  return { v: 1, level: parseLevelV1(json) };
}
