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
