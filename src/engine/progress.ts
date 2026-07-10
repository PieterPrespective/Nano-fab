/**
 * Player progress persistence (versioned, tolerant of corruption).
 *
 * ProgressStore abstracts localStorage so engine tests inject a Map-backed
 * fake — no DOM in the engine.
 */

import type { PlayerValues } from './levels';

export interface ProgressStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface LevelProgress {
  stars: number;
  bestValues: PlayerValues;
}

export interface Progress {
  version: 1;
  levels: Record<string, LevelProgress>;
}

export const PROGRESS_KEY = 'nanofab-progress';

export function freshProgress(): Progress {
  return { version: 1, levels: {} };
}

/**
 * Load progress. Corrupt data ⇒ fresh start (never throws). A save written
 * by a NEWER app version is left untouched and a fresh in-memory progress is
 * returned — we must not destroy data we don't understand.
 */
export function loadProgress(store: ProgressStore): { progress: Progress; readOnly: boolean } {
  let raw: string | null = null;
  try {
    raw = store.get(PROGRESS_KEY);
  } catch {
    return { progress: freshProgress(), readOnly: false };
  }
  if (raw === null) return { progress: freshProgress(), readOnly: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    const version = (parsed as { version?: unknown }).version;
    if (typeof version === 'number' && version > 1) {
      return { progress: freshProgress(), readOnly: true };
    }
    if (version !== 1) throw new Error('unknown version');
    const levels = (parsed as { levels?: unknown }).levels;
    if (typeof levels !== 'object' || levels === null) throw new Error('bad levels');
    const clean: Progress = { version: 1, levels: {} };
    for (const [id, lp] of Object.entries(levels as Record<string, unknown>)) {
      if (typeof lp !== 'object' || lp === null) continue;
      const stars = (lp as { stars?: unknown }).stars;
      const bestValues = (lp as { bestValues?: unknown }).bestValues;
      if (typeof stars !== 'number' || stars < 0 || stars > 3) continue;
      clean.levels[id] = {
        stars: Math.floor(stars),
        bestValues:
          typeof bestValues === 'object' && bestValues !== null ? (bestValues as PlayerValues) : {},
      };
    }
    return { progress: clean, readOnly: false };
  } catch {
    return { progress: freshProgress(), readOnly: false };
  }
}

export function saveProgress(store: ProgressStore, progress: Progress): void {
  try {
    store.set(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full/unavailable: gameplay continues, progress is in-memory only.
  }
}

/** Record a result immutably; keeps max stars, best values follow the max. */
export function recordResult(
  progress: Progress,
  levelId: string,
  stars: number,
  values: PlayerValues,
): Progress {
  const prev = progress.levels[levelId];
  if (prev && prev.stars >= stars) return progress;
  return {
    version: 1,
    levels: {
      ...progress.levels,
      [levelId]: { stars, bestValues: { ...values } },
    },
  };
}
