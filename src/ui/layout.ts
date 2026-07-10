/**
 * Play-screen layout: pure function of canvas size + control count.
 * Portrait stacks plot/metrics/controls; landscape puts controls in a right
 * column so thumbs reach them. All touch rows must stay ≥ 44 px tall.
 */

import type { Rect } from '../render/plot';

export interface PlayLayout {
  plot: Rect;
  metrics: Rect;
  controls: Rect;
  controlRows: Rect[];
}

const PAD = 10;
const METRICS_H = 92;
const HEADER_H = 48; // back button / title strip above the plot

function rows(controls: Rect, n: number): Rect[] {
  const inner = { x: controls.x + PAD, y: controls.y + PAD, w: controls.w - 2 * PAD, h: controls.h - 2 * PAD };
  const rowH = inner.h / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({
    x: inner.x,
    y: inner.y + i * rowH,
    w: inner.w,
    h: rowH,
  }));
}

export function playLayout(w: number, h: number, nControls: number): PlayLayout {
  const n = Math.max(1, nControls);
  if (w >= h) {
    // Landscape: controls column on the right.
    const ctrlW = Math.max(300, Math.min(420, w * 0.38));
    const controls = { x: w - ctrlW, y: HEADER_H, w: ctrlW, h: h - HEADER_H };
    const metrics = { x: 0, y: h - METRICS_H, w: w - ctrlW, h: METRICS_H };
    const plot = { x: 0, y: HEADER_H, w: w - ctrlW, h: h - HEADER_H - METRICS_H };
    return { plot, metrics, controls, controlRows: rows(controls, n) };
  }
  // Portrait: plot on top, controls at the bottom (thumb-reachable).
  const wanted = n * 64 + 2 * PAD;
  const ctrlH = Math.min(Math.max(wanted, 180), h * 0.5);
  const controls = { x: 0, y: h - ctrlH, w, h: ctrlH };
  const metrics = { x: 0, y: h - ctrlH - METRICS_H, w, h: METRICS_H };
  const plot = { x: 0, y: HEADER_H, w, h: h - ctrlH - METRICS_H - HEADER_H };
  return { plot, metrics, controls, controlRows: rows(controls, n) };
}
