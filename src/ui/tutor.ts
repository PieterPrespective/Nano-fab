/**
 * Tutor beat sequencing (prompts/nf03/01 §4): hook → predict → reveal →
 * play → formalize. Pure state machine; scene runtimes drive it and render
 * whatever beat it says. Predictions are committed BEFORE any simulation is
 * shown; the ghost overlay persists through the reveal.
 */

import type { LevelV2 } from '../engine/levels2';
import type { Pt } from './predict';

export type Beat = 'intro' | 'predict' | 'play' | 'formalize';

export interface PredictionRecord {
  kind: 'sketch' | 'mark' | 'choose';
  sketch?: Pt[];
  mark?: Pt;
  choice?: number;
  /** Set at reveal time by the scene (0..1); undefined until revealed. */
  score?: number;
  revealed: boolean;
}

export interface TutorState {
  beat: Beat;
  prediction: PredictionRecord | null;
}

export function startTutor(level: LevelV2): TutorState {
  return { beat: 'intro', prediction: null };
}

export function dismissIntro(level: LevelV2, s: TutorState): TutorState {
  if (s.beat !== 'intro') return s;
  return level.prediction ? { ...s, beat: 'predict' } : { ...s, beat: 'play' };
}

/** Commit the prediction input; the scene may now simulate and reveal. */
export function commitPrediction(
  s: TutorState,
  input: { sketch?: Pt[]; mark?: Pt; choice?: number },
  kind: PredictionRecord['kind'],
): TutorState {
  if (s.beat !== 'predict') return s;
  return {
    beat: 'play',
    prediction: { kind, ...input, revealed: false },
  };
}

/** Skipping is allowed (predictions must never gate progress). */
export function skipPrediction(s: TutorState): TutorState {
  if (s.beat !== 'predict') return s;
  return { ...s, beat: 'play' };
}

/**
 * The scene calls this the first time the relevant simulation runs: the
 * ghost + truth go on screen together and the score is fixed forever.
 */
export function reveal(s: TutorState, score: number): TutorState {
  if (!s.prediction || s.prediction.revealed) return s;
  return {
    ...s,
    prediction: { ...s.prediction, revealed: true, score: Math.min(1, Math.max(0, score)) },
  };
}

export function cleared(s: TutorState): TutorState {
  return s.beat === 'formalize' ? s : { ...s, beat: 'formalize' };
}

/** Back to tuning after the formalize overlay (stars can still improve). */
export function keepPlaying(s: TutorState): TutorState {
  return s.beat === 'formalize' ? { ...s, beat: 'play' } : s;
}

/** Ghost overlays persist from commit until the level is left. */
export function showGhost(s: TutorState): boolean {
  return s.prediction !== null;
}
