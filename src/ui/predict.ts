/**
 * Prediction scorers (tutor loop beat 2 → 3, prompts/nf03/02 §3).
 * All pure: player input + simulation result → score ∈ [0,1].
 * Being wrong is informative, not punished — scores feed the mastery EMA
 * and insight streaks, never level stars.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Resample a polyline to n points equally spaced by arc length. */
export function resample(line: Pt[], n: number): Pt[] {
  if (line.length === 0 || n <= 0) return [];
  if (line.length === 1) return Array.from({ length: n }, () => ({ ...line[0]! }));
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  }
  const total = cum[cum.length - 1]!;
  if (total === 0) return Array.from({ length: n }, () => ({ ...line[0]! }));
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < line.length - 2 && cum[seg + 1]! < target) seg++;
    const span = cum[seg + 1]! - cum[seg]!;
    const t = span > 0 ? (target - cum[seg]!) / span : 0;
    out.push({
      x: line[seg]!.x + t * (line[seg + 1]!.x - line[seg]!.x),
      y: line[seg]!.y + t * (line[seg + 1]!.y - line[seg]!.y),
    });
  }
  return out;
}

const SAMPLES = 32;
/** Mean deviation of `tolFrac`×diag scores 0.5; smaller is better. */
const SKETCH_TOL_FRAC = 0.12;

/**
 * Score a sketched trajectory against the simulated one: mean distance
 * between arclength-matched samples, normalized by the scene diagonal.
 */
export function scoreSketch(sketch: Pt[], truth: Pt[], sceneDiag: number): number {
  if (sketch.length < 2 || truth.length < 2 || sceneDiag <= 0) return 0;
  const a = resample(sketch, SAMPLES);
  const b = resample(truth, SAMPLES);
  let sum = 0;
  for (let i = 0; i < SAMPLES; i++) sum += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
  const mean = sum / SAMPLES;
  const normalized = mean / (SKETCH_TOL_FRAC * sceneDiag);
  return Math.min(1, Math.max(0, 1 - normalized / 2)); // 0 dev → 1; tol → 0.5; 2×tol → 0
}

/**
 * Score a placed marker against the true point: full credit within
 * `radius`, linear falloff to zero at 3×radius.
 */
export function scoreMark(mark: Pt, truth: Pt, radius: number): number {
  if (radius <= 0) return 0;
  const d = Math.hypot(mark.x - truth.x, mark.y - truth.y);
  if (d <= radius) return 1;
  return Math.min(1, Math.max(0, 1 - (d - radius) / (2 * radius)));
}

/** Multiple-choice prediction (misconception probes use these unscored). */
export function scoreChoose(chosen: number, correct: number): number {
  return chosen === correct ? 1 : 0;
}
