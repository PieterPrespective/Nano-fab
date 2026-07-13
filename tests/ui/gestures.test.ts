import { describe, expect, it } from 'vitest';
import { GestureMachine, type GestureEvent, type InputEvent } from '../../src/ui/gestures';

/** Feed a sequence, collect all emitted gestures. */
function run(events: InputEvent[]): GestureEvent[] {
  const m = new GestureMachine({ slopPx: 8, longPressMs: 350 });
  return events.flatMap((e) => m.handle(e));
}
const kinds = (gs: GestureEvent[]) => gs.map((g) => g.kind);

const down = (id: number, x: number, y: number, t: number): InputEvent => ({ type: 'down', id, x, y, t });
const move = (id: number, x: number, y: number, t: number): InputEvent => ({ type: 'move', id, x, y, t });
const up = (id: number, x: number, y: number, t: number): InputEvent => ({ type: 'up', id, x, y, t });

describe('GestureMachine', () => {
  it('tap: down-up within slop and time', () => {
    const gs = run([down(1, 10, 10, 0), move(1, 12, 11, 50), up(1, 12, 11, 100)]);
    expect(kinds(gs)).toEqual(['tap']);
    expect(gs[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('micro-jitter within slop stays a tap, not a drag', () => {
    const gs = run([down(1, 10, 10, 0), move(1, 14, 13, 20), move(1, 9, 8, 40), up(1, 9, 8, 80)]);
    expect(kinds(gs)).toEqual(['tap']);
  });

  it('drag: crossing slop emits drag-start with original anchor, then moves with deltas', () => {
    const gs = run([down(1, 10, 10, 0), move(1, 30, 10, 30), move(1, 40, 15, 60), up(1, 40, 15, 90)]);
    expect(kinds(gs)).toEqual(['drag-start', 'drag-move', 'drag-end']);
    expect(gs[0]).toMatchObject({ startX: 10, startY: 10, x: 30 });
    expect(gs[1]).toMatchObject({ dx: 10, dy: 5 });
    expect(gs[2]).toMatchObject({ x: 40, y: 15 });
  });

  it('long-press via timer event; up afterwards emits nothing more', () => {
    const m = new GestureMachine({ slopPx: 8, longPressMs: 350 });
    expect(m.handle(down(1, 5, 5, 0))).toEqual([]);
    expect(m.deadline()).toBe(350);
    const atTimer = m.handle({ type: 'timer', t: 360 });
    expect(kinds(atTimer)).toEqual(['long-press']);
    expect(m.handle(up(1, 5, 5, 400))).toEqual([]);
    expect(m.deadline()).toBeNull();
  });

  it('long-press without a timer event still resolves on late release', () => {
    const gs = run([down(1, 5, 5, 0), up(1, 5, 5, 500)]);
    expect(kinds(gs)).toEqual(['long-press']);
  });

  it('early timer tick does not fire long-press', () => {
    const m = new GestureMachine({ slopPx: 8, longPressMs: 350 });
    m.handle(down(1, 5, 5, 0));
    expect(m.handle({ type: 'timer', t: 200 })).toEqual([]);
    expect(kinds(m.handle(up(1, 5, 5, 250)))).toEqual(['tap']);
  });

  it('drag cancels the pending long-press', () => {
    const m = new GestureMachine({ slopPx: 8, longPressMs: 350 });
    m.handle(down(1, 5, 5, 0));
    m.handle(move(1, 50, 5, 100));
    expect(m.deadline()).toBeNull(); // dragging: no long-press pending
    expect(m.handle({ type: 'timer', t: 400 })).toEqual([]);
  });

  it('pinch: two downs then moves emit centroid deltas and scale', () => {
    const gs = run([
      down(1, 0, 0, 0),
      down(2, 100, 0, 10),
      move(2, 200, 0, 30), // distance 100 → 200: scale 2, centroid +50
    ]);
    expect(kinds(gs)).toEqual(['pinch-start', 'pinch-move']);
    expect(gs[0]).toMatchObject({ cx: 50, cy: 0, dist: 100 });
    expect(gs[1]).toMatchObject({ dcx: 50, scale: 2 });
  });

  it('THE nasty case: second finger mid-drag ends the drag and starts a pinch', () => {
    const gs = run([
      down(1, 10, 10, 0),
      move(1, 60, 10, 30), // drag
      down(2, 100, 100, 60),
      move(2, 120, 100, 90),
    ]);
    expect(kinds(gs)).toEqual(['drag-start', 'drag-end', 'pinch-start', 'pinch-move']);
  });

  it('lifting one pinch finger continues as a drag with the survivor', () => {
    const gs = run([
      down(1, 0, 0, 0),
      down(2, 100, 0, 10),
      up(1, 0, 0, 50),
      move(2, 110, 5, 80),
      up(2, 110, 5, 120),
    ]);
    expect(kinds(gs)).toEqual(['pinch-start', 'pinch-end', 'drag-start', 'drag-move', 'drag-end']);
    expect(gs[2]).toMatchObject({ x: 100, y: 0 }); // survivor position
  });

  it('third finger during pinch is ignored', () => {
    const gs = run([down(1, 0, 0, 0), down(2, 100, 0, 10), down(3, 50, 50, 20), move(1, 10, 0, 30)]);
    expect(kinds(gs)).toEqual(['pinch-start', 'pinch-move']);
  });

  it('cancel aborts a pending tap silently and ends a drag cleanly', () => {
    expect(kinds(run([down(1, 5, 5, 0), { type: 'cancel', id: 1, t: 50 }]))).toEqual([]);
    expect(
      kinds(run([down(1, 5, 5, 0), move(1, 60, 5, 30), { type: 'cancel', id: 1, t: 60 }])),
    ).toEqual(['drag-start', 'drag-end']);
  });

  it('moves from unrelated pointer ids are ignored while tracking', () => {
    const gs = run([down(1, 10, 10, 0), move(9, 500, 500, 20), up(1, 10, 10, 80)]);
    expect(kinds(gs)).toEqual(['tap']);
  });
});
