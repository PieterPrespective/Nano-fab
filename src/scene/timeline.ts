/**
 * The process timeline: an ordered list of steps applied to a substrate,
 * with prefix-memoized snapshots (editing step k only recomputes ≥ k) and
 * per-op scrub interpolation (prompts/nf03/03 §2).
 */

import {
  anneal,
  cmp,
  cmpPlane,
  deposit,
  develop,
  etch,
  expose,
  implant,
  spinResist,
  strip,
  thermalOxide,
  type MaskRect,
  type RateTable,
} from '../physics/process';
import { topHeights, type Material, type WaferModel } from './wafer';

export type ProcessStep =
  | { op: 'spinResist'; thickness_m: number }
  | { op: 'expose'; mask: MaskRect[]; dose: number; blurCells?: number }
  | { op: 'develop'; threshold: number }
  | { op: 'strip' }
  | { op: 'etch'; depth_m: number; anisotropy?: number; rates: RateTable }
  | { op: 'deposit'; material: Material; thickness_m: number; conformality?: number }
  | { op: 'implant'; species: 'n' | 'p'; range_m: number; straggle_m: number; tiltCells?: number }
  | { op: 'anneal'; spread_m: number }
  | { op: 'cmp'; stopMaterial?: Material; targetZ_m?: number }
  | { op: 'thermalOxide'; thickness_m: number };

export function applyStep(w: WaferModel, step: ProcessStep): WaferModel {
  switch (step.op) {
    case 'spinResist':
      return spinResist(w, step);
    case 'expose':
      return expose(w, step);
    case 'develop':
      return develop(w, step);
    case 'strip':
      return strip(w);
    case 'etch':
      return etch(w, step);
    case 'deposit':
      return deposit(w, step);
    case 'implant':
      return implant(w, step);
    case 'anneal':
      return anneal(w, step);
    case 'cmp':
      return cmp(w, step);
    case 'thermalOxide':
      return thermalOxide(w, step);
  }
}

/**
 * Scrub interpolation: the wafer state at fraction t ∈ [0,1] through a step.
 * Continuous ops scale their extent; discrete ops (expose/develop/strip/
 * implant) flip at t ≥ 0.5 — their visual transitions are the renderer's job.
 */
export function interpolateStep(before: WaferModel, step: ProcessStep, t: number): WaferModel {
  const tt = Math.min(1, Math.max(0, t));
  if (tt >= 1) return applyStep(before, step);
  switch (step.op) {
    case 'spinResist':
      return spinResist(before, { thickness_m: step.thickness_m * tt });
    case 'etch':
      return etch(before, { ...step, depth_m: step.depth_m * tt });
    case 'deposit':
      return deposit(before, { ...step, thickness_m: step.thickness_m * tt });
    case 'anneal':
      return anneal(before, { spread_m: step.spread_m * tt });
    case 'thermalOxide':
      return thermalOxide(before, { thickness_m: step.thickness_m * tt });
    case 'cmp': {
      const plane =
        step.targetZ_m ?? (step.stopMaterial ? cmpPlane(before, step.stopMaterial) : 0);
      const tops = topHeights(before);
      let maxTop = 0;
      for (const h of tops) maxTop = Math.max(maxTop, h);
      const current = maxTop - (maxTop - plane) * tt;
      return cmp(before, { targetZ_m: current });
    }
    default:
      return tt >= 0.5 ? applyStep(before, step) : before;
  }
}

/**
 * Prefix-memoizing timeline runner. snapshots[i] = wafer AFTER steps[0..i];
 * editing step k invalidates only snapshots ≥ k (structural sharing keeps
 * untouched columns shared between snapshots).
 */
export class Timeline {
  private stepKeys: string[] = [];
  private snapshots: WaferModel[] = [];

  constructor(private substrate: WaferModel) {}

  run(steps: ProcessStep[]): WaferModel[] {
    const keys = steps.map((s) => JSON.stringify(s));
    let firstDiff = 0;
    while (
      firstDiff < keys.length &&
      firstDiff < this.stepKeys.length &&
      keys[firstDiff] === this.stepKeys[firstDiff]
    ) {
      firstDiff++;
    }
    this.snapshots.length = firstDiff;
    for (let i = firstDiff; i < steps.length; i++) {
      const prev = i === 0 ? this.substrate : this.snapshots[i - 1]!;
      this.snapshots.push(applyStep(prev, steps[i]!));
    }
    this.stepKeys = keys;
    return this.snapshots.slice(0, steps.length);
  }

  /** State at (stepIndex, t): t through steps[stepIndex] after its prefix. */
  at(steps: ProcessStep[], stepIndex: number, t: number): WaferModel {
    const snaps = this.run(steps);
    if (steps.length === 0) return this.substrate;
    const idx = Math.min(steps.length - 1, Math.max(0, stepIndex));
    const before = idx === 0 ? this.substrate : snaps[idx - 1]!;
    return interpolateStep(before, steps[idx]!, t);
  }
}
