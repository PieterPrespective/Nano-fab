import { describe, expect, it } from 'vitest';
import { playLayout } from '../../src/ui/layout';
import type { Rect } from '../../src/render/plot';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function within(inner: Rect, w: number, h: number): boolean {
  return inner.x >= 0 && inner.y >= 0 && inner.x + inner.w <= w + 0.5 && inner.y + inner.h <= h + 0.5;
}

// Realistic CSS-pixel viewports: phones, tablets (Tab S8 is 1600×2560 @ dpr 2
// ⇒ 800×1280 CSS), laptop windows; both orientations.
const VIEWPORTS: Array<[number, number]> = [
  [800, 1280],
  [1280, 800],
  [360, 740],
  [740, 360],
  [768, 1024],
  [1024, 768],
  [720, 1600],
  [1600, 720],
];

describe('playLayout', () => {
  it('regions never overlap and stay in-bounds for all viewports & control counts', () => {
    for (const [w, h] of VIEWPORTS) {
      for (const n of [1, 2, 3, 6]) {
        const l = playLayout(w, h, n);
        for (const r of [l.plot, l.metrics, l.controls]) {
          expect(within(r, w, h), `${w}x${h} n=${n}`).toBe(true);
        }
        expect(overlaps(l.plot, l.metrics)).toBe(false);
        expect(overlaps(l.plot, l.controls)).toBe(false);
        expect(overlaps(l.metrics, l.controls)).toBe(false);
      }
    }
  });

  it('touch targets: every control row ≥ 44 px tall; plot keeps ≥ 160 px', () => {
    for (const [w, h] of VIEWPORTS) {
      for (const n of [1, 2, 3, 6]) {
        const l = playLayout(w, h, n);
        for (const row of l.controlRows) {
          expect(row.h, `${w}x${h} n=${n}`).toBeGreaterThanOrEqual(44);
        }
        expect(l.plot.h, `${w}x${h} n=${n}`).toBeGreaterThanOrEqual(160);
        expect(l.controlRows).toHaveLength(n);
      }
    }
  });
});
