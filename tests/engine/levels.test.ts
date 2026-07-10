import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  LevelValidationError,
  loadLevelList,
  parseLevel,
  resolveParams,
} from '../../src/engine/levels';

export const VALID_LEVEL = {
  schema: 1,
  id: 'l1-04',
  layer: 1,
  title: 'Drain-Induced Bullying',
  intro: 'Short setup text.',
  explain: 'Your gate is 18 nm — the real gate length of the "5nm" node.',
  controls: {
    gateLength_m: { min: 10e-9, max: 40e-9, init: 25e-9, scale: 'log' },
    eot_m: { min: 0.6e-9, max: 2e-9, init: 1e-9 },
    arch: { options: ['planar', 'finfet', 'gaa'], init: 'planar' },
    nStack: { min: 1, max: 4, step: 1, init: 1 },
  },
  fixed: { vdd_V: 0.7, vth0_V: 0.25, temperature_K: 300 },
  targets: [
    { metric: 'dibl_VperV', op: '<=', value: 0.05, label: 'DIBL ≤ 50 mV/V' },
    { metric: 'ion_A', op: '>=', value: 40e-6, label: 'Ion ≥ 40 µA' },
  ],
  stars: { metric: 'leakagePower_W', direction: 'min', two: 50e-9, three: 10e-9 },
  codex: ['dibl'],
};

function expectRejects(mutate: (l: Record<string, unknown>) => void, pathFragment: string) {
  const bad = JSON.parse(JSON.stringify(VALID_LEVEL)) as Record<string, unknown>;
  mutate(bad);
  try {
    parseLevel(bad);
  } catch (e) {
    expect(e).toBeInstanceOf(LevelValidationError);
    expect((e as LevelValidationError).message).toContain(pathFragment);
    return;
  }
  throw new Error(`expected rejection mentioning ${pathFragment}`);
}

describe('parseLevel', () => {
  it('L1: the schema example parses and round-trips its fields', () => {
    const level = parseLevel(VALID_LEVEL);
    expect(level.id).toBe('l1-04');
    expect(level.controls.gateLength_m).toEqual({
      kind: 'numeric',
      min: 10e-9,
      max: 40e-9,
      init: 25e-9,
      scale: 'log',
      step: undefined,
    });
    expect(level.controls.eot_m).toMatchObject({ scale: 'linear' }); // default
    expect(level.controls.arch).toEqual({
      kind: 'enum',
      options: ['planar', 'finfet', 'gaa'],
      init: 'planar',
    });
    expect(level.targets).toHaveLength(2);
    expect(level.stars.direction).toBe('min');
  });

  it('L2: rejects each schema violation with a path-precise error', () => {
    expectRejects((l) => (l.schema = 2), '$.schema');
    expectRejects((l) => (l.bogus = true), '$.bogus');
    expectRejects((l) => (l.id = 'level-one'), '$.id');
    expectRejects((l) => delete l.title, '$.title');
    expectRejects((l) => (l.controls = {}), '$.controls');
    expectRejects(
      (l) => ((l.controls as Record<string, unknown>).notAParam = { min: 0, max: 1, init: 0 }),
      '$.controls.notAParam',
    );
    expectRejects(
      (l) => ((l.controls as Record<string, unknown>).gateLength_m = { min: 5, max: 2, init: 3 }),
      '$.controls.gateLength_m',
    );
    expectRejects(
      (l) =>
        ((l.controls as Record<string, unknown>).gateLength_m = {
          min: 1e-9,
          max: 4e-9,
          init: 9e-9,
        }),
      '$.controls.gateLength_m.init',
    );
    expectRejects(
      (l) =>
        ((l.controls as Record<string, unknown>).gateLength_m = {
          min: -1,
          max: 4,
          init: 1,
          scale: 'log',
        }),
      '$.controls.gateLength_m.scale',
    );
    expectRejects(
      (l) => ((l.controls as Record<string, unknown>).arch = { options: ['planar'], init: 'planar' }),
      '$.controls.arch.options',
    );
    expectRejects((l) => ((l.fixed as Record<string, unknown>).vdd_V = 'high'), '$.fixed.vdd_V');
    expectRejects((l) => ((l.fixed as Record<string, unknown>).eot_m = 1e-9), '$.fixed.eot_m'); // also a control
    expectRejects((l) => (l.targets = []), '$.targets');
    expectRejects(
      (l) => ((l.targets as unknown[])[0] = { metric: 'vibes', op: '<=', value: 1, label: 'x' }),
      '$.targets[0].metric',
    );
    expectRejects(
      (l) => ((l.targets as unknown[])[0] = { metric: 'ion_A', op: '==', value: 1, label: 'x' }),
      '$.targets[0].op',
    );
    expectRejects(
      (l) => (l.stars = { metric: 'ion_A', direction: 'min', two: 1, three: 2 }),
      '$.stars',
    ); // min requires two >= three
    expectRejects(
      (l) => (l.stars = { metric: 'ion_A', direction: 'max', two: 2, three: 1 }),
      '$.stars',
    );
    expectRejects((l) => (l.codex = [1]), '$.codex');
  });

  it('rejects duplicate ids in a level list', () => {
    expect(() => loadLevelList([VALID_LEVEL, VALID_LEVEL])).toThrow(/duplicate/);
  });
});

describe('resolveParams', () => {
  const level = parseLevel(VALID_LEVEL);

  it('L4: clamps out-of-range player values instead of throwing', () => {
    const p = resolveParams(level, { gateLength_m: 1, eot_m: -5, nStack: 99 });
    expect(p.gateLength_m).toBe(40e-9);
    expect(p.eot_m).toBe(0.6e-9);
    expect(p.nStack).toBe(4);
  });

  it('L4b: snaps stepped controls and ignores invalid enum values', () => {
    const p = resolveParams(level, { nStack: 2.4, arch: 'quantum' });
    expect(p.nStack).toBe(2);
    expect(p.arch).toBe('planar'); // falls back to init
  });

  it('L5: precedence — fixed beats default, player beats init, locked ignores player', () => {
    const p = resolveParams(level, { arch: 'gaa', vdd_V: 1.2, sheetWidth_m: 99e-9 });
    expect(p.vdd_V).toBe(0.7); // fixed wins over player (vdd_V is not a control)
    expect(p.arch).toBe('gaa'); // player wins over init
    expect(p.sheetWidth_m).toBe(DEFAULT_PARAMS.sheetWidth_m); // not a control ⇒ default
    const q = resolveParams(level, {});
    expect(q.gateLength_m).toBe(25e-9); // init when player silent
  });
});
