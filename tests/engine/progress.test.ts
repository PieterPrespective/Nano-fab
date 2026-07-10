import { describe, expect, it } from 'vitest';
import {
  PROGRESS_KEY,
  freshProgress,
  loadProgress,
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

describe('progress persistence', () => {
  it('P1: save → load round-trips', () => {
    const store = fakeStore();
    const p = recordResult(freshProgress(), 'l1-01', 2, { gateLength_m: 3e-8 });
    saveProgress(store, p);
    const { progress, readOnly } = loadProgress(store);
    expect(readOnly).toBe(false);
    expect(progress).toEqual(p);
  });

  it('P2: corrupt JSON yields fresh progress, nothing thrown', () => {
    const { progress } = loadProgress(fakeStore({ [PROGRESS_KEY]: '{not json' }));
    expect(progress).toEqual(freshProgress());
    const { progress: p2 } = loadProgress(
      fakeStore({ [PROGRESS_KEY]: JSON.stringify({ version: 'x' }) }),
    );
    expect(p2).toEqual(freshProgress());
  });

  it('P2b: a newer save version is never overwritten', () => {
    const newer = JSON.stringify({ version: 2, levels: {}, futureField: true });
    const store = fakeStore({ [PROGRESS_KEY]: newer });
    const { progress, readOnly } = loadProgress(store);
    expect(readOnly).toBe(true);
    expect(progress).toEqual(freshProgress());
    // The app must not save when readOnly — verify the data is intact if it obeys.
    expect(store.data.get(PROGRESS_KEY)).toBe(newer);
  });

  it('P2c: malformed level entries are dropped, valid ones kept', () => {
    const mixed = JSON.stringify({
      version: 1,
      levels: {
        'l1-01': { stars: 2, bestValues: { a: 1 } },
        'l1-02': { stars: 99 },
        'l1-03': 'nope',
      },
    });
    const { progress } = loadProgress(fakeStore({ [PROGRESS_KEY]: mixed }));
    expect(Object.keys(progress.levels)).toEqual(['l1-01']);
  });

  it('P3: recordResult keeps max stars and best values follow the max', () => {
    let p = freshProgress();
    p = recordResult(p, 'l1-01', 2, { gateLength_m: 1 });
    p = recordResult(p, 'l1-01', 1, { gateLength_m: 2 }); // worse ⇒ ignored
    expect(p.levels['l1-01']).toEqual({ stars: 2, bestValues: { gateLength_m: 1 } });
    p = recordResult(p, 'l1-01', 3, { gateLength_m: 3 }); // better ⇒ replaces
    expect(p.levels['l1-01']).toEqual({ stars: 3, bestValues: { gateLength_m: 3 } });
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
