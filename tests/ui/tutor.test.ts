import { describe, expect, it } from 'vitest';
import { parseLevelV2 } from '../../src/engine/levels2';
import {
  cleared,
  commitPrediction,
  dismissIntro,
  keepPlaying,
  reveal,
  showGhost,
  skipPrediction,
  startTutor,
} from '../../src/ui/tutor';
import { VALID_LEVEL_V2 } from '../engine/levels2.test';

const withPrediction = parseLevelV2(VALID_LEVEL_V2);
const noPrediction = (() => {
  const j = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as Record<string, unknown>;
  delete j.prediction;
  return parseLevelV2(j);
})();

describe('tutor beats', () => {
  it('intro → predict → play → formalize with a prediction', () => {
    let s = startTutor(withPrediction);
    expect(s.beat).toBe('intro');
    s = dismissIntro(withPrediction, s);
    expect(s.beat).toBe('predict');
    s = commitPrediction(s, { sketch: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, 'sketch');
    expect(s.beat).toBe('play');
    expect(showGhost(s)).toBe(true);
    expect(s.prediction?.revealed).toBe(false);
    s = reveal(s, 0.8);
    expect(s.prediction).toMatchObject({ revealed: true, score: 0.8 });
    s = cleared(s);
    expect(s.beat).toBe('formalize');
    s = keepPlaying(s);
    expect(s.beat).toBe('play');
    expect(showGhost(s)).toBe(true); // ghost persists through the whole level
  });

  it('levels without a prediction skip straight to play', () => {
    let s = startTutor(noPrediction);
    s = dismissIntro(noPrediction, s);
    expect(s.beat).toBe('play');
    expect(showGhost(s)).toBe(false);
  });

  it('predictions can be skipped and never block progress', () => {
    let s = dismissIntro(withPrediction, startTutor(withPrediction));
    s = skipPrediction(s);
    expect(s.beat).toBe('play');
    expect(showGhost(s)).toBe(false);
    expect(reveal(s, 1)).toBe(s); // nothing to reveal
  });

  it('reveal fires exactly once and clamps the score', () => {
    let s = dismissIntro(withPrediction, startTutor(withPrediction));
    s = commitPrediction(s, { mark: { x: 1, y: 2 } }, 'mark');
    s = reveal(s, 7);
    expect(s.prediction?.score).toBe(1);
    const again = reveal(s, 0.1);
    expect(again.prediction?.score).toBe(1); // frozen forever
  });

  it('out-of-beat calls are no-ops', () => {
    const s = startTutor(withPrediction);
    expect(commitPrediction(s, {}, 'sketch')).toBe(s);
    expect(skipPrediction(s)).toBe(s);
  });
});
