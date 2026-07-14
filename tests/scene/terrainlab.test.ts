import { describe, expect, it } from 'vitest';
import { deviceMetrics } from '../../src/physics/device';
import {
  initialTerrainValues,
  parseTerrainSetup,
  resolveTerrainParams,
  terrainMetrics,
} from '../../src/scene/terrainlab';

/** c2-04 shape: the l1-01 re-stage — gate length is the only knob. */
const SETUP = {
  controls: {
    gateLength_m: { min: 12e-9, max: 60e-9, init: 12e-9, scale: 'log' },
  },
  fixed: {
    arch: 'planar',
    eot_m: 1e-9,
    bodyThickness_m: 6e-9,
    sheetWidth_m: 25e-9,
    vdd_V: 0.7,
    vth0_V: 0.25,
    temperature_K: 300,
  },
  crowdSeed: 7,
  choices: ['A few more balls', 'Twice the balls', 'Ten-plus times the balls'],
  correctChoice: 2,
};

describe('parseTerrainSetup', () => {
  it('parses controls, fixed, seed and choices', () => {
    const s = parseTerrainSetup(SETUP);
    expect(s.controls.gateLength_m!.kind).toBe('numeric');
    expect(s.fixed.arch).toBe('planar');
    expect(s.crowdSeed).toBe(7);
    expect(s.choices).toHaveLength(3);
    expect(s.correctChoice).toBe(2);
  });

  it('rejects invalid controls via the shared v1 validator', () => {
    expect(() =>
      parseTerrainSetup({ ...SETUP, controls: { gateLength_m: { min: 5, max: 1, init: 2 } } }),
    ).toThrow(/min must be < max/);
    expect(() => parseTerrainSetup({ ...SETUP, controls: {} })).toThrow();
  });

  it('rejects a correctChoice outside the list', () => {
    expect(() => parseTerrainSetup({ ...SETUP, correctChoice: 9 })).toThrow(/correctChoice/);
  });
});

describe('resolve + metrics', () => {
  const setup = parseTerrainSetup(SETUP);

  it('initial values are the control inits (the do-nothing baseline)', () => {
    expect(initialTerrainValues(setup)).toEqual({ gateLength_m: 12e-9 });
  });

  it('player values are clamped and merged over fixed + defaults', () => {
    const p = resolveTerrainParams(setup, { gateLength_m: 45e-9 });
    expect(p.gateLength_m).toBe(45e-9);
    expect(p.arch).toBe('planar');
    expect(p.eot_m).toBe(1e-9);
    const clamped = resolveTerrainParams(setup, { gateLength_m: 1 });
    expect(clamped.gateLength_m).toBe(60e-9);
  });

  it('metrics ARE the phase-1 device metrics (the terrain cannot disagree)', () => {
    const m = terrainMetrics(setup, { gateLength_m: 45e-9 });
    const expected = deviceMetrics(resolveTerrainParams(setup, { gateLength_m: 45e-9 }));
    expect(m.ionOverIoff).toBe(expected.ionOverIoff);
    expect(m.ss_VperDec).toBe(expected.ss_VperDec);
  });
});
