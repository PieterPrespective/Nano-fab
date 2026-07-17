/**
 * S3 for schema-v2 content: every shipped chapter level parses, is winnable
 * by its recorded solution script, and is not pre-solved by doing nothing.
 * Ch2 re-stages must be winnable by the ORIGINAL v1 solutions verbatim.
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
import {
  dropBall,
  fieldLabMetrics,
  initialFieldLabState,
  parseFieldLabSetup,
  placeChargeHM,
  probeOrientation,
  probeVolume,
  setCut,
  type CutAxis,
  type FieldLabState,
  type HeightmapSetup,
  type TensorSetup,
  type VolumeSetup,
} from '../../src/scene/fieldlab';
import {
  initialInverterValues,
  inverterLabMetrics,
  parseInverterSetup,
} from '../../src/scene/inverterlab';
import {
  initialTerrainValues,
  parseTerrainSetup,
  terrainMetrics,
} from '../../src/scene/terrainlab';
import v1solutions from '../fixtures/levels/solutions.json';
import solutions from '../fixtures/levels/solutions2.json';

interface Solution {
  polarity?: -1;
  place?: Array<{ x: number; y: number }>;
  shots?: Array<{ vx: number; vy: number }>;
  drops?: Array<{ x: number; y: number }>;
  ridges?: Array<{ x: number; y: number }>;
  cut?: { axis: CutAxis; frac: number };
  probes?: Array<{ u: number; v: number }>;
  angles_deg?: number[];
  values?: Record<string, number | string>;
}

const levels = rawLevelsV2.map(parseLevelV2);

function runSolution(level: LevelV2, sol: Solution): Record<string, number> {
  switch (level.scene.type) {
    case 'particle-chamber': {
      const setup = parseChamberSetup(level.scene.setup);
      let st: ChamberState = { ...initialChamberState(), polarity: sol.polarity ?? 1 };
      for (const p of sol.place ?? []) st = placeCharge(setup, st, p.x, p.y);
      for (const s of sol.shots ?? []) st = fireShot(setup, st, s.vx, s.vy);
      return chamberMetrics(setup, st);
    }
    case 'field-lab': {
      const setup = parseFieldLabSetup(level.scene.setup);
      let st: FieldLabState = initialFieldLabState();
      if (sol.cut) st = setCut(st, sol.cut.axis, sol.cut.frac);
      for (const r of sol.ridges ?? []) st = placeChargeHM(setup as HeightmapSetup, st, r.x, r.y);
      for (const d of sol.drops ?? []) st = dropBall(setup as HeightmapSetup, st, d.x, d.y);
      for (const p of sol.probes ?? []) st = probeVolume(setup as VolumeSetup, st, p.u, p.v);
      for (const a of sol.angles_deg ?? []) {
        st = probeOrientation(setup as TensorSetup, st, (a * Math.PI) / 180);
      }
      return fieldLabMetrics(setup, st);
    }
    case 'energy-terrain': {
      const setup = parseTerrainSetup(level.scene.setup);
      return terrainMetrics(setup, { ...initialTerrainValues(setup), ...(sol.values ?? {}) });
    }
    case 'logic-inverter': {
      const setup = parseInverterSetup(level.scene.setup);
      return inverterLabMetrics(setup, { ...initialInverterValues(setup), ...(sol.values ?? {}) });
    }
    default:
      throw new Error(`no runner for scene "${level.scene.type}"`);
  }
}

/** The do-nothing baseline per scene type. */
function baseline(level: LevelV2): Record<string, number> {
  switch (level.scene.type) {
    case 'particle-chamber':
      return chamberMetrics(parseChamberSetup(level.scene.setup), initialChamberState());
    case 'field-lab':
      return fieldLabMetrics(parseFieldLabSetup(level.scene.setup), initialFieldLabState());
    case 'energy-terrain': {
      const setup = parseTerrainSetup(level.scene.setup);
      return terrainMetrics(setup, initialTerrainValues(setup));
    }
    case 'logic-inverter': {
      const setup = parseInverterSetup(level.scene.setup);
      return inverterLabMetrics(setup, initialInverterValues(setup));
    }
    default:
      throw new Error(`no baseline for scene "${level.scene.type}"`);
  }
}

describe('chapter content (v2)', () => {
  it('ids are unique and in play order; scene types match the chapter design', () => {
    expect(levels.map((l) => l.id)).toEqual([
      'c1-01', 'c1-02', 'c1-03', 'c1-04',
      'c2-01', 'c2-01b', 'c2-02', 'c2-03', 'c2-04', 'c2-05',
      'c2-06', 'c2-07', 'c2-08', 'c2-09', 'c2-10', 'c2-11',
    ]);
    for (const l of levels.filter((x) => x.chapter === 1)) {
      expect(l.scene.type).toBe('particle-chamber');
    }
    const ch2Types = levels.filter((x) => x.chapter === 2).map((l) => l.scene.type);
    expect(ch2Types).toEqual([
      'field-lab', 'field-lab', 'field-lab', 'field-lab',
      'energy-terrain', 'energy-terrain', 'field-lab',
      'energy-terrain', 'energy-terrain', 'energy-terrain', 'energy-terrain',
      'logic-inverter',
    ]);
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
      const ev = evaluateMetrics(level.targets, level.stars, baseline(level));
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
    // c2-01: three balls dumped into the decoy valley win nothing
    const c201 = levels.find((l) => l.id === 'c2-01')!;
    const hm = parseFieldLabSetup(c201.scene.setup) as HeightmapSetup;
    let st: FieldLabState = initialFieldLabState();
    for (const d of [{ x: 0.15, y: 0.65 }, { x: 0.1, y: 0.7 }, { x: 0.3, y: 0.7 }]) {
      st = dropBall(hm, st, d.x, d.y);
    }
    expect(evaluateMetrics(c201.targets, c201.stars, fieldLabMetrics(hm, st)).passed).toBe(false);
  });

  it('re-stages: the ORIGINAL v1 solutions win the v2 wrappers verbatim', () => {
    const restages: Record<string, string> = {
      'c2-04': 'l1-01',
      'c2-05': 'l1-04',
      'c2-07': 'l1-03',
      'c2-08': 'l1-02',
      'c2-09': 'l1-05',
      'c2-10': 'l1-06',
    };
    for (const [c2id, l1id] of Object.entries(restages)) {
      const level = levels.find((l) => l.id === c2id)!;
      const v1sol = (v1solutions as Record<string, Record<string, number | string>>)[l1id];
      expect(v1sol, `no v1 solution for ${l1id}`).toBeDefined();
      const setup = parseTerrainSetup(level.scene.setup);
      const metrics = terrainMetrics(setup, { ...initialTerrainValues(setup), ...v1sol });
      const ev = evaluateMetrics(level.targets, level.stars, metrics);
      expect(ev.passed, `${c2id} not winnable by ${l1id}'s solution`).toBe(true);
    }
  });

  it('intros and explains carry real substance (fidelity rule)', () => {
    for (const level of levels) {
      expect(level.intro.length).toBeGreaterThan(80);
      expect(level.explain.length).toBeGreaterThan(120);
    }
  });

  it('every level teaches nodes its chapter gates on', () => {
    const ch2 = levels.filter((l) => l.chapter === 2);
    const nodes = new Set(ch2.flatMap((l) => l.conceptNodes));
    for (const n of ['scalar-field-gradient', 'potential-terrain', 'boltzmann-tail', 'tunneling']) {
      expect(nodes.has(n as never), `chapter 2 never teaches ${n}`).toBe(true);
    }
  });
});
