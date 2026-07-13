/**
 * Player progress persistence, save format v2 (NF03).
 *
 * v2 adds the mastery model on top of v1's per-level stars: per-concept-node
 * mastery scores, prediction insight tracking, and notebook snapshots.
 * v1 saves migrate in memory on load (written back only on the next real
 * change). A save written by a NEWER version is never overwritten.
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
  version: 2;
  levels: Record<string, LevelProgress>;
  /** Concept-node mastery 0..1 (EMA of level stars + prediction accuracy). */
  mastery: Record<string, number>;
  /** Prediction insight: current streak of good predictions + lifetime total. */
  insight: { streak: number; total: number };
}

/** The phase-1 on-disk shape, accepted for migration. */
interface ProgressV1 {
  version: 1;
  levels: Record<string, LevelProgress>;
}

export const PROGRESS_KEY = 'nanofab-progress';

export function freshProgress(): Progress {
  return { version: 2, levels: {}, mastery: {}, insight: { streak: 0, total: 0 } };
}

export function migrateV1(v1: ProgressV1): Progress {
  return { ...freshProgress(), levels: v1.levels };
}

function cleanLevels(levels: unknown): Record<string, LevelProgress> {
  const out: Record<string, LevelProgress> = {};
  if (typeof levels !== 'object' || levels === null) return out;
  for (const [id, lp] of Object.entries(levels as Record<string, unknown>)) {
    if (typeof lp !== 'object' || lp === null) continue;
    const stars = (lp as { stars?: unknown }).stars;
    const bestValues = (lp as { bestValues?: unknown }).bestValues;
    if (typeof stars !== 'number' || stars < 0 || stars > 3) continue;
    out[id] = {
      stars: Math.floor(stars),
      bestValues:
        typeof bestValues === 'object' && bestValues !== null ? (bestValues as PlayerValues) : {},
    };
  }
  return out;
}

/**
 * Load progress. Corrupt data ⇒ fresh start (never throws); v1 ⇒ migrated;
 * newer than v2 ⇒ fresh in-memory progress flagged readOnly so the caller
 * must not save over data it doesn't understand.
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
    if (typeof version === 'number' && version > 2) {
      return { progress: freshProgress(), readOnly: true };
    }
    if (version === 1) {
      return {
        progress: migrateV1({ version: 1, levels: cleanLevels((parsed as ProgressV1).levels) }),
        readOnly: false,
      };
    }
    if (version !== 2) throw new Error('unknown version');
    const p = parsed as Partial<Progress>;
    const mastery: Record<string, number> = {};
    if (typeof p.mastery === 'object' && p.mastery !== null) {
      for (const [k, v] of Object.entries(p.mastery)) {
        if (typeof v === 'number' && v >= 0 && v <= 1) mastery[k] = v;
      }
    }
    const insight =
      typeof p.insight === 'object' &&
      p.insight !== null &&
      typeof p.insight.streak === 'number' &&
      typeof p.insight.total === 'number'
        ? { streak: p.insight.streak, total: p.insight.total }
        : { streak: 0, total: 0 };
    return {
      progress: { version: 2, levels: cleanLevels(p.levels), mastery, insight },
      readOnly: false,
    };
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

/** Record a level result immutably; keeps max stars, best values follow the max. */
export function recordResult(
  progress: Progress,
  levelId: string,
  stars: number,
  values: PlayerValues,
): Progress {
  const prev = progress.levels[levelId];
  if (prev && prev.stars >= stars) return progress;
  return {
    ...progress,
    levels: { ...progress.levels, [levelId]: { stars, bestValues: { ...values } } },
  };
}

/** Mastery update weight: recent evidence counts ~1/4 (slow, forgiving EMA). */
const MASTERY_ALPHA = 0.25;
/** A prediction scoring at or above this counts as an insight hit. */
export const INSIGHT_THRESHOLD = 0.6;

/**
 * Record a prediction outcome: updates each exercised concept node's mastery
 * (EMA toward the score) and the insight streak. Unscored misconception
 * probes should not call this (they teach; they don't measure).
 */
export function recordPrediction(
  progress: Progress,
  conceptNodes: string[],
  score: number, // 0..1 from the prediction scorer
): Progress {
  const s = Math.min(1, Math.max(0, score));
  const mastery = { ...progress.mastery };
  for (const node of conceptNodes) {
    const prev = mastery[node] ?? 0;
    mastery[node] = prev + MASTERY_ALPHA * (s - prev);
  }
  const hit = s >= INSIGHT_THRESHOLD;
  return {
    ...progress,
    mastery,
    insight: {
      streak: hit ? progress.insight.streak + 1 : 0,
      total: progress.insight.total + (hit ? 1 : 0),
    },
  };
}
