import { describe, expect, it } from 'vitest';
import {
  INSIGHT_THRESHOLD,
  PROGRESS_KEY,
  freshProgress,
  loadProgress,
  migrateV1,
  recordPrediction,
  recordResult,
  saveProgress,
  type ProgressStore,
} from '../../src/engine/progress';

function fakeStore(initial?: Record<string, string>): ProgressStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
  };
}

describe('progress persistence (save v2)', () => {
  it('P1: save → load round-trips including mastery and insight', () => {
    const store = fakeStore();
    let p = recordResult(freshProgress(), 'l1-01', 2, { gateLength_m: 3e-8 });
    p = recordPrediction(p, ['charge-force'], 0.8);
    saveProgress(store, p);
    const { progress, readOnly } = loadProgress(store);
    expect(readOnly).toBe(false);
    expect(progress).toEqual(p);
    expect(progress.version).toBe(2);
  });

  it('P2: corrupt JSON / unknown shape yields fresh progress, nothing thrown', () => {
    expect(loadProgress(fakeStore({ [PROGRESS_KEY]: '{not json' })).progress).toEqual(freshProgress());
    expect(
      loadProgress(fakeStore({ [PROGRESS_KEY]: JSON.stringify({ version: 'x' }) })).progress,
    ).toEqual(freshProgress());
  });

  it('P2b: a NEWER save version is read-only and never overwritten', () => {
    const newer = JSON.stringify({ version: 3, levels: {}, futureField: true });
    const store = fakeStore({ [PROGRESS_KEY]: newer });
    const { progress, readOnly } = loadProgress(store);
    expect(readOnly).toBe(true);
    expect(progress).toEqual(freshProgress());
    expect(store.data.get(PROGRESS_KEY)).toBe(newer);
  });

  it('P2c: malformed level entries and mastery values are dropped, valid kept', () => {
    const mixed = JSON.stringify({
      version: 2,
      levels: { 'l1-01': { stars: 2, bestValues: { a: 1 } }, 'l1-02': { stars: 99 }, 'l1-03': 'no' },
      mastery: { 'charge-force': 0.5, bogus: 7 },
      insight: 'nope',
    });
    const { progress } = loadProgress(fakeStore({ [PROGRESS_KEY]: mixed }));
    expect(Object.keys(progress.levels)).toEqual(['l1-01']);
    expect(progress.mastery).toEqual({ 'charge-force': 0.5 });
    expect(progress.insight).toEqual({ streak: 0, total: 0 });
  });

  it('M1: a phase-1 (v1) save migrates in memory, stars preserved', () => {
    const v1 = JSON.stringify({
      version: 1,
      levels: { 'l1-01': { stars: 3, bestValues: { gateLength_m: 4.5e-8 } } },
    });
    const { progress, readOnly } = loadProgress(fakeStore({ [PROGRESS_KEY]: v1 }));
    expect(readOnly).toBe(false);
    expect(progress.version).toBe(2);
    expect(progress.levels['l1-01']).toEqual({ stars: 3, bestValues: { gateLength_m: 4.5e-8 } });
    expect(progress.mastery).toEqual({});
    // pure migrate helper agrees
    expect(migrateV1({ version: 1, levels: progress.levels }).levels).toEqual(progress.levels);
  });

  it('P3: recordResult keeps max stars and best values follow the max', () => {
    let p = freshProgress();
    p = recordResult(p, 'l1-01', 2, { gateLength_m: 1 });
    p = recordResult(p, 'l1-01', 1, { gateLength_m: 2 });
    expect(p.levels['l1-01']).toEqual({ stars: 2, bestValues: { gateLength_m: 1 } });
    p = recordResult(p, 'l1-01', 3, { gateLength_m: 3 });
    expect(p.levels['l1-01']).toEqual({ stars: 3, bestValues: { gateLength_m: 3 } });
  });

  it('P4: recordPrediction moves mastery as an EMA and tracks the streak', () => {
    let p = freshProgress();
    p = recordPrediction(p, ['charge-force', 'field-map'], 1);
    expect(p.mastery['charge-force']).toBeCloseTo(0.25, 10); // 0 + 0.25·(1−0)
    expect(p.insight).toEqual({ streak: 1, total: 1 });
    p = recordPrediction(p, ['charge-force'], 1);
    expect(p.mastery['charge-force']).toBeCloseTo(0.4375, 10);
    expect(p.insight.streak).toBe(2);
    // a poor prediction breaks the streak but not the total
    p = recordPrediction(p, ['charge-force'], INSIGHT_THRESHOLD - 0.2);
    expect(p.insight).toEqual({ streak: 0, total: 2 });
    // scores clamp to [0,1]
    p = recordPrediction(p, ['tunneling'], 7);
    expect(p.mastery['tunneling']).toBeCloseTo(0.25, 10);
  });

  it('storage failures never throw', () => {
    const broken: ProgressStore = {
      get: () => {
        throw new Error('denied');
      },
      set: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveProgress(broken, freshProgress())).not.toThrow();
    expect(loadProgress(broken).progress).toEqual(freshProgress());
  });
});
