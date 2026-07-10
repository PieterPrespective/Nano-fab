import { describe, expect, it } from 'vitest';
import { currentRange, logTicks, projectCurve } from '../../src/render/plot';

describe('logTicks', () => {
  it('covers [1e-12, 1e-3] with decade ticks, ≤ 12 labeled', () => {
    const ticks = logTicks(1e-12, 1e-3);
    expect(ticks).toHaveLength(10);
    expect(ticks[0]!.value).toBe(1e-12);
    expect(ticks.at(-1)!.value).toBe(1e-3);
    expect(ticks.filter((t) => t.labeled).length).toBeLessThanOrEqual(12);
  });

  it('skips labels evenly on very wide ranges', () => {
    const ticks = logTicks(1e-15, 1e3);
    expect(ticks.filter((t) => t.labeled).length).toBeLessThanOrEqual(12);
    expect(ticks.filter((t) => t.labeled).length).toBeGreaterThan(5);
  });

  it('degenerate ranges yield no ticks instead of crashing', () => {
    expect(logTicks(1, 1)).toEqual([]);
    expect(logTicks(-1, 10)).toEqual([]);
    expect(logTicks(0, 0)).toEqual([]);
  });
});

describe('projectCurve', () => {
  const vp = {
    rect: { x: 10, y: 20, w: 100, h: 200 },
    vgMin: 0,
    vgMax: 1,
    idMin: 1e-12,
    idMax: 1e-4,
  };

  it('maps corners of the viewport', () => {
    const pts = projectCurve(
      [
        { vg_V: 0, id_A: 1e-12 },
        { vg_V: 1, id_A: 1e-4 },
      ],
      vp,
    );
    expect(pts[0]).toEqual({ x: 10, y: 220 }); // bottom-left
    expect(pts[1]).toEqual({ x: 110, y: 20 }); // top-right
  });

  it('clamps zero/negative currents to the log floor instead of NaN', () => {
    const pts = projectCurve(
      [
        { vg_V: 0.5, id_A: 0 },
        { vg_V: 0.6, id_A: -1 },
        { vg_V: 0.7, id_A: 1e-30 },
      ],
      vp,
    );
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBe(220); // pinned to the floor
    }
  });
});

describe('currentRange', () => {
  it('rounds outward to decades and caps at 12 decades', () => {
    const r = currentRange([3e-11, 8e-5]);
    expect(Math.log10(r.idMin)).toBeCloseTo(-11, 9);
    expect(Math.log10(r.idMax)).toBeCloseTo(-4, 9);
    const wide = currentRange([1e-30, 1e-3]);
    expect(Math.log10(wide.idMax / wide.idMin)).toBeLessThanOrEqual(12);
  });

  it('survives empty/degenerate inputs', () => {
    const r = currentRange([]);
    expect(r.idMax).toBeGreaterThan(r.idMin);
    const r2 = currentRange([0, -5]);
    expect(r2.idMax).toBeGreaterThan(r2.idMin);
  });
});
