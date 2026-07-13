/**
 * Target evaluation + star scoring. Pure: Level + DeviceParams → Evaluation.
 */

import { deviceMetrics, type DeviceMetrics, type DeviceParams } from '../physics/device';
import type { Level, Target } from './levels';

export interface TargetResult {
  label: string;
  metric: Target['metric'];
  op: Target['op'];
  value: number;
  actual: number;
  pass: boolean;
}

export interface Evaluation {
  metrics: DeviceMetrics;
  targets: TargetResult[];
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
}

export function evaluate(level: Level, params: DeviceParams): Evaluation {
  const metrics = deviceMetrics(params);
  const targets = level.targets.map((t): TargetResult => {
    const actual = metrics[t.metric];
    const pass = t.op === '<=' ? actual <= t.value : actual >= t.value;
    return { label: t.label, metric: t.metric, op: t.op, value: t.value, actual, pass };
  });
  const passed = targets.every((t) => t.pass);
  let stars: Evaluation['stars'] = 0;
  if (passed) {
    stars = 1;
    const s = level.stars;
    const actual = metrics[s.metric];
    if (s.direction === 'min') {
      if (actual <= s.three) stars = 3;
      else if (actual <= s.two) stars = 2;
    } else {
      if (actual >= s.three) stars = 3;
      else if (actual >= s.two) stars = 2;
    }
  }
  return { metrics, targets, passed, stars };
}

// ---------------------------------------------------------------- v2 path

export interface GenericEvaluation {
  metrics: Record<string, number>;
  targets: TargetResult[];
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
}

/**
 * Schema-v2 evaluation: same target/star semantics as v1, but over an
 * arbitrary scene-metric record (validated against the scene's metric
 * registry at parse time).
 */
export function evaluateMetrics(
  targets: Target[],
  stars: { metric: string; direction: 'min' | 'max'; two: number; three: number },
  metrics: Record<string, number>,
): GenericEvaluation {
  const results = targets.map((t): TargetResult => {
    const actual = metrics[t.metric as string] ?? 0;
    const pass = t.op === '<=' ? actual <= t.value : actual >= t.value;
    return { label: t.label, metric: t.metric, op: t.op, value: t.value, actual, pass };
  });
  const passed = results.every((t) => t.pass);
  let starCount: GenericEvaluation['stars'] = 0;
  if (passed) {
    starCount = 1;
    const actual = metrics[stars.metric] ?? 0;
    if (stars.direction === 'min') {
      if (actual <= stars.three) starCount = 3;
      else if (actual <= stars.two) starCount = 2;
    } else {
      if (actual >= stars.three) starCount = 3;
      else if (actual >= stars.two) starCount = 2;
    }
  }
  return { metrics, targets: results, passed, stars: starCount };
}
