/**
 * Slider value mapping (linear and log scales, optional step snapping).
 * Pure inverse pair — the canvas widget just feeds normalized positions in.
 */

import type { NumericControl } from '../engine/levels';

/** Normalized position t ∈ [0,1] → parameter value (clamped, snapped). */
export function sliderToValue(t: number, spec: NumericControl): number {
  const tt = Math.min(1, Math.max(0, t));
  let v: number;
  if (spec.scale === 'log') {
    v = Math.exp(Math.log(spec.min) + tt * (Math.log(spec.max) - Math.log(spec.min)));
  } else {
    v = spec.min + tt * (spec.max - spec.min);
  }
  if (spec.step) v = spec.min + Math.round((v - spec.min) / spec.step) * spec.step;
  return Math.min(spec.max, Math.max(spec.min, v));
}

/** Parameter value → normalized position t ∈ [0,1]. */
export function valueToSlider(value: number, spec: NumericControl): number {
  const v = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.scale === 'log') {
    return (Math.log(v) - Math.log(spec.min)) / (Math.log(spec.max) - Math.log(spec.min));
  }
  return (v - spec.min) / (spec.max - spec.min);
}
