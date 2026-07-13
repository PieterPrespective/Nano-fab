/**
 * S3 for schema-v2 content: every shipped chapter level parses, is winnable
 * by its recorded solution script, and is not pre-solved by doing nothing.
 */
import { describe, expect, it } from 'vitest';
import { parseLevelV2, type LevelV2 } from '../../src/engine/levels2';
import { evaluateMetrics } from '../../src/engine/scoring';
import { rawLevelsV2 } from '../../src/levels/index';
import {
  chamberMetrics,
  fireShot,
  initialChamberState,
  parseChamberSetup,
  placeCharge,
  type ChamberState,
} from '../../src/scene/chamber';
import solutions from '../fixtures/levels/solutions2.json';

interface Solution {
  polarity?: -1;
  place?: Array<{ x: number; y: number }>;
  shots: Array<{ vx: number; vy: number }>;
}

const levels = rawLevelsV2.map(parseLevelV2);

function runSolution(level: LevelV2, sol: Solution): Record<string, number> {
  const setup = parseChamberSetup(level.scene.setup);
  let st: ChamberState = { ...initialChamberState(), polarity: sol.polarity ?? 1 };
  for (const p of sol.place ?? []) st = placeCharge(setup, st, p.x, p.y);
  for (const s of sol.shots) st = fireShot(setup, st, s.vx, s.vy);
  return chamberMetrics(setup, st);
}

describe('chapter 1 content', () => {
  it('ids are unique and sequential; all levels are particle-chamber', () => {
    expect(levels.map((l) => l.id)).toEqual(['c1-01', 'c1-02', 'c1-03', 'c1-04']);
    for (const l of levels) expect(l.scene.type).toBe('particle-chamber');
  });

  it('S3: every level is winnable by its recorded solution', () => {
    for (const level of levels) {
      const sol = (solutions as Record<string, Solution>)[level.id];
      expect(sol, `no solution for ${level.id}`).toBeDefined();
      const ev = evaluateMetrics(level.targets, level.stars, runSolution(level, sol!));
      const failed = ev.targets.filter((t) => !t.pass).map((t) => `${t.label} (${t.actual})`);
      expect(failed, `${level.id}: ${failed.join('; ')}`).toEqual([]);
      expect(ev.stars).toBeGreaterThanOrEqual(1);
    }
  });

  it('S3b: doing nothing wins nothing', () => {
    for (const level of levels) {
      const setup = parseChamberSetup(level.scene.setup);
      const ev = evaluateMetrics(level.targets, level.stars, chamberMetrics(setup, initialChamberState()));
      expect(ev.passed, `${level.id} pre-solved`).toBe(false);
    }
  });

  it('S3c: the lazy wrong answer fails where it should', () => {
    // c1-02 without the polarity flip, c1-03 without placing: both miss
    const wrong = (id: string) => {
      const level = levels.find((l) => l.id === id)!;
      const setup = parseChamberSetup(level.scene.setup);
      const st = fireShot(setup, initialChamberState(), setup.launcher.speed_ms, 0);
      return evaluateMetrics(level.targets, level.stars, chamberMetrics(setup, st)).passed;
    };
    expect(wrong('c1-02')).toBe(false);
    expect(wrong('c1-03')).toBe(false);
  });

  it('intros and explains carry real substance (fidelity rule)', () => {
    for (const level of levels) {
      expect(level.intro.length).toBeGreaterThan(80);
      expect(level.explain.length).toBeGreaterThan(120);
    }
  });
});
