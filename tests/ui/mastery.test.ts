import { describe, expect, it } from 'vitest';
import { freshProgress, recordPrediction, recordResult } from '../../src/engine/progress';
import { CHAPTER_NODES, GATE_MASTERY, chapterMastery, chapterUnlocked } from '../../src/ui/mastery';

const LEVELS: Record<number, string[]> = { 1: ['c1-01', 'c1-02'], 2: ['c2-01'] };

describe('chapter gates', () => {
  it('chapter 1 is always open; chapter 2 locked on fresh progress', () => {
    const p = freshProgress();
    expect(chapterUnlocked(1, p, LEVELS)).toBe(true);
    expect(chapterUnlocked(2, p, LEVELS)).toBe(false);
  });

  it('unlocks via UNDERSTANDING: good predictions on ch1 nodes open ch2', () => {
    let p = freshProgress();
    // three strong predictions push EMA past the gate: 0.25→0.4375→0.578
    for (let i = 0; i < 3; i++) p = recordPrediction(p, CHAPTER_NODES[1]!, 1);
    expect(chapterMastery(1, p)).toBeGreaterThan(GATE_MASTERY);
    expect(chapterUnlocked(2, p, LEVELS)).toBe(true);
  });

  it('unlocks via COMPLETION: clearing every ch1 level opens ch2 without predictions', () => {
    let p = freshProgress();
    p = recordResult(p, 'c1-01', 1, {});
    expect(chapterUnlocked(2, p, LEVELS)).toBe(false); // one level missing
    p = recordResult(p, 'c1-02', 1, {});
    expect(chapterUnlocked(2, p, LEVELS)).toBe(true);
  });

  it('mastery averages only the chapter’s own nodes', () => {
    let p = freshProgress();
    p = recordPrediction(p, ['photon-shot-noise'], 1); // a ch4 node
    expect(chapterMastery(1, p)).toBe(0);
  });
});
