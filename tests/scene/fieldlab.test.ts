import { describe, expect, it } from 'vitest';
import {
  dropBall,
  fieldLabMetrics,
  initialFieldLabState,
  parseFieldLabSetup,
  probeOrientation,
  probeVolume,
  setCut,
  volumeFieldAt,
  type FieldLabState,
  type HeightmapSetup,
  type TensorSetup,
  type VolumeSetup,
} from '../../src/scene/fieldlab';

/**
 * P1 landscape: a deep home well right of center and a decoy well lower-left.
 * The watershed between them is what the contour-reading lesson is about.
 */
const HEIGHTMAP_JSON = {
  mode: 'heightmap',
  charges: [
    { q_nC: -3, x: 0.7, y: 0.5 },
    { q_nC: -1.2, x: 0.25, y: 0.75 },
  ],
  window: { x0: 0, y0: 0, x1: 1, y1: 1 },
  home: { x: 0.7, y: 0.5, r: 0.06 },
  ballsRequired: 3,
};

/** P2: one positive charge floating in a box. */
const VOLUME_JSON = {
  mode: 'volume',
  charges: [{ q_nC: 2, x: 0.5, y: 0.4, z: 0.45 }],
  box: { x0: 0, y0: 0, z0: 0, x1: 1, y1: 0.8, z1: 0.9 },
};

/** P3: strained-Si slab — conducts 1.8× better along the strain axis. */
const TENSOR_JSON = { mode: 'tensor', sigmaMajor: 1.8, sigmaMinor: 1.0, e0: 1 };

describe('parseFieldLabSetup', () => {
  it('parses all three modes', () => {
    expect(parseFieldLabSetup(HEIGHTMAP_JSON).mode).toBe('heightmap');
    expect(parseFieldLabSetup(VOLUME_JSON).mode).toBe('volume');
    expect(parseFieldLabSetup(TENSOR_JSON).mode).toBe('tensor');
  });

  it('rejects unknown modes and missing fields', () => {
    expect(() => parseFieldLabSetup({ mode: 'nope' })).toThrow();
    expect(() => parseFieldLabSetup({ ...HEIGHTMAP_JSON, home: undefined })).toThrow();
    expect(() => parseFieldLabSetup({ ...VOLUME_JSON, box: undefined })).toThrow();
  });
});

describe('heightmap mode (P1: balls roll along −∇V)', () => {
  const setup = parseFieldLabSetup(HEIGHTMAP_JSON) as HeightmapSetup;

  it('a ball dropped near the home well rolls home', () => {
    const st = dropBall(setup, initialFieldLabState(), 0.85, 0.45);
    expect(st.drops).toHaveLength(1);
    expect(st.drops[0]!.home).toBe(true);
    expect(st.drops[0]!.path.length).toBeGreaterThan(3);
  });

  it('a ball dropped in the decoy watershed does NOT reach home', () => {
    const st = dropBall(setup, initialFieldLabState(), 0.15, 0.85);
    expect(st.drops[0]!.home).toBe(false);
  });

  it('metrics count home balls and drops', () => {
    let st: FieldLabState = initialFieldLabState();
    st = dropBall(setup, st, 0.85, 0.45);
    st = dropBall(setup, st, 0.6, 0.35);
    st = dropBall(setup, st, 0.15, 0.85);
    const m = fieldLabMetrics(setup, st);
    expect(m.dropsUsed).toBe(3);
    expect(m.ballsHome).toBe(2);
  });
});

describe('volume mode (P2: the cut plane and the shells)', () => {
  const setup = parseFieldLabSetup(VOLUME_JSON) as VolumeSetup;

  it('|E| falls as 1/r² from the charge (3-D Coulomb)', () => {
    const e1 = volumeFieldAt(setup, 0.5, 0.4, 0.65); // r = 0.2
    const e2 = volumeFieldAt(setup, 0.5, 0.4, 0.85); // r = 0.4
    expect(e1 / e2).toBeCloseTo(4, 1);
  });

  it('cut changes are counted; probing near the charge on the cut face finds the peak', () => {
    let st = setCut(initialFieldLabState(), 'z', 0.5); // plane z = 0.45 → through the charge
    st = setCut(st, 'z', 0.5 + 1e-9);
    // probe right next to the charge's (x,y) on this plane
    st = probeVolume(setup, st, 0.52, 0.42);
    const m = fieldLabMetrics(setup, st);
    expect(m.cutsMade).toBe(2);
    expect(m.probesUsed).toBe(1);
    expect(m.peakFound).toBe(1);
  });

  it('probing far from the charge does not count as finding the peak', () => {
    let st = setCut(initialFieldLabState(), 'z', 0.5);
    st = probeVolume(setup, st, 0.05, 0.75);
    expect(fieldLabMetrics(setup, st).peakFound).toBe(0);
  });
});

describe('tensor mode (P3: two dials, not one)', () => {
  const setup = parseFieldLabSetup(TENSOR_JSON) as TensorSetup;

  it('response aligns with E only along principal axes', () => {
    const along = probeOrientation(setup, initialFieldLabState(), 0);
    const tilted = probeOrientation(setup, initialFieldLabState(), Math.PI / 4);
    expect(Math.abs(along.probesT[0]!.deflection_rad)).toBeLessThan(1e-9);
    expect(Math.abs(tilted.probesT[0]!.deflection_rad)).toBeGreaterThan(0.1);
  });

  it('response magnitude varies with orientation — the rank-2 signature', () => {
    const a = probeOrientation(setup, initialFieldLabState(), 0).probesT[0]!.j_mag;
    const b = probeOrientation(setup, initialFieldLabState(), Math.PI / 2).probesT[0]!.j_mag;
    expect(a / b).toBeCloseTo(1.8, 5);
  });

  it('orientationsProbed counts distinct angles (15° buckets)', () => {
    let st = initialFieldLabState();
    st = probeOrientation(setup, st, 0);
    st = probeOrientation(setup, st, 0.01); // same bucket
    st = probeOrientation(setup, st, Math.PI / 4);
    st = probeOrientation(setup, st, Math.PI / 2);
    expect(fieldLabMetrics(setup, st).orientationsProbed).toBe(3);
  });
});
