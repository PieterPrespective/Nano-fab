/**
 * L3 + S3: every SHIPPED level must parse, be winnable by its documented
 * solution, and not be pre-solved by its initial values. This is the guard
 * that keeps content correct whenever physics constants change.
 */
import { describe, expect, it } from 'vitest';
import { parseCodex } from '../../src/engine/codex';
import { loadLevelList, resolveParams, type PlayerValues } from '../../src/engine/levels';
import { evaluate } from '../../src/engine/scoring';
import { rawCodex, rawLevels } from '../../src/levels/index';
import solutions from '../fixtures/levels/solutions.json';

const levels = loadLevelList(rawLevels);
const codex = parseCodex(rawCodex);

describe('shipped content', () => {
  it('L3: all levels parse, ids are unique and sequential from l1-01', () => {
    expect(levels.length).toBeGreaterThanOrEqual(6);
    const ids = levels.map((l) => l.id);
    expect(ids).toEqual(ids.map((_, i) => `l1-${String(i + 1).padStart(2, '0')}`));
  });

  it('codex: entries parse; every level codex reference resolves', () => {
    const known = new Set(codex.map((c) => c.id));
    for (const level of levels) {
      expect(level.codex.length).toBeGreaterThan(0);
      for (const ref of level.codex) {
        expect(known, `level ${level.id} references unknown codex "${ref}"`).toContain(ref);
      }
    }
    // Fidelity rule: every codex entry cites at least one real number.
    for (const entry of codex) {
      expect(entry.realNumbers.length, `codex "${entry.id}" cites no real numbers`).toBeGreaterThan(0);
    }
  });

  it('S3: every level is winnable by its solution sidecar…', () => {
    for (const level of levels) {
      const solution = (solutions as Record<string, PlayerValues>)[level.id];
      expect(solution, `no solution recorded for ${level.id}`).toBeDefined();
      const ev = evaluate(level, resolveParams(level, solution!));
      const failed = ev.targets.filter((t) => !t.pass).map((t) => `${t.label} (actual ${t.actual})`);
      expect(failed, `${level.id} solution fails: ${failed.join('; ')}`).toEqual([]);
      expect(ev.stars).toBeGreaterThanOrEqual(1);
    }
  });

  it('S3b: …and no level is pre-solved by its initial values', () => {
    for (const level of levels) {
      const ev = evaluate(level, resolveParams(level, {}));
      expect(ev.passed, `${level.id} passes with init values — not a puzzle`).toBe(false);
      expect(ev.stars).toBe(0);
    }
  });

  it('every level explains its physics with enough substance', () => {
    for (const level of levels) {
      expect(level.intro.length).toBeGreaterThan(80);
      expect(level.explain.length).toBeGreaterThan(120);
    }
  });
});
