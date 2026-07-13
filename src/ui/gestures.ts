/**
 * Pure gesture state machine: pointer events in → gesture events out.
 *
 * All touch-feel constants live in GESTURE_DEFAULTS (one tuning point, per
 * the NF03 risk register). The machine owns no timers — the binding layer
 * schedules a callback for `deadline()` and feeds a {type:'timer'} event.
 * That keeps every disambiguation case unit-testable with synthetic events.
 *
 * Contract (see prompts/nf03/02 §1-2):
 * - one pointer  → tap | long-press | drag (tool gestures)
 * - two pointers → pinch (camera orbit/zoom); a second finger landing
 *   mid-drag ends the drag and starts a pinch; lifting one finger of a
 *   pinch continues as a fresh drag with the survivor.
 */

export interface GestureConfig {
  /** Movement beyond this (px) turns a potential tap/long-press into a drag. */
  slopPx: number;
  /** Hold duration (ms) for long-press (probe/inspect). */
  longPressMs: number;
}

export const GESTURE_DEFAULTS: GestureConfig = { slopPx: 8, longPressMs: 350 };

export type InputEvent =
  | { type: 'down'; id: number; x: number; y: number; t: number }
  | { type: 'move'; id: number; x: number; y: number; t: number }
  | { type: 'up'; id: number; x: number; y: number; t: number }
  | { type: 'cancel'; id: number; t: number }
  | { type: 'timer'; t: number };

export type GestureEvent =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'long-press'; x: number; y: number }
  | { kind: 'drag-start'; x: number; y: number; startX: number; startY: number }
  | { kind: 'drag-move'; x: number; y: number; dx: number; dy: number }
  | { kind: 'drag-end'; x: number; y: number }
  | { kind: 'pinch-start'; cx: number; cy: number; dist: number }
  | { kind: 'pinch-move'; cx: number; cy: number; dcx: number; dcy: number; scale: number }
  | { kind: 'pinch-end' };

interface Pt {
  x: number;
  y: number;
}

type State =
  | { s: 'idle' }
  | { s: 'pending'; id: number; start: Pt; last: Pt; t0: number }
  | { s: 'pressed'; id: number } // long-press fired, waiting for up
  | { s: 'dragging'; id: number; last: Pt }
  | { s: 'pinching'; a: number; b: number; pa: Pt; pb: Pt };

export class GestureMachine {
  private st: State = { s: 'idle' };

  constructor(private cfg: GestureConfig = GESTURE_DEFAULTS) {}

  /** When the binding should feed a timer event (long-press), or null. */
  deadline(): number | null {
    return this.st.s === 'pending' ? this.st.t0 + this.cfg.longPressMs : null;
  }

  handle(e: InputEvent): GestureEvent[] {
    const out: GestureEvent[] = [];
    const st = this.st;

    switch (st.s) {
      case 'idle': {
        if (e.type === 'down') {
          this.st = { s: 'pending', id: e.id, start: { x: e.x, y: e.y }, last: { x: e.x, y: e.y }, t0: e.t };
        }
        break;
      }

      case 'pending': {
        if (e.type === 'timer') {
          if (e.t >= st.t0 + this.cfg.longPressMs) {
            out.push({ kind: 'long-press', x: st.start.x, y: st.start.y });
            this.st = { s: 'pressed', id: st.id };
          }
        } else if (e.type === 'down') {
          // second finger before anything resolved → pinch
          this.st = this.startPinch(st.id, st.last, e.id, { x: e.x, y: e.y }, out);
        } else if (e.type === 'move' && e.id === st.id) {
          st.last = { x: e.x, y: e.y };
          if (Math.hypot(e.x - st.start.x, e.y - st.start.y) > this.cfg.slopPx) {
            out.push({ kind: 'drag-start', x: e.x, y: e.y, startX: st.start.x, startY: st.start.y });
            this.st = { s: 'dragging', id: st.id, last: { x: e.x, y: e.y } };
          }
        } else if (e.type === 'up' && e.id === st.id) {
          if (e.t - st.t0 < this.cfg.longPressMs) {
            out.push({ kind: 'tap', x: st.start.x, y: st.start.y });
          } else {
            // never got a timer event but held long enough: still a long-press
            out.push({ kind: 'long-press', x: st.start.x, y: st.start.y });
          }
          this.st = { s: 'idle' };
        } else if (e.type === 'cancel' && e.id === st.id) {
          this.st = { s: 'idle' };
        }
        break;
      }

      case 'pressed': {
        if ((e.type === 'up' || e.type === 'cancel') && e.id === st.id) this.st = { s: 'idle' };
        break;
      }

      case 'dragging': {
        if (e.type === 'move' && e.id === st.id) {
          out.push({ kind: 'drag-move', x: e.x, y: e.y, dx: e.x - st.last.x, dy: e.y - st.last.y });
          st.last = { x: e.x, y: e.y };
        } else if ((e.type === 'up' || e.type === 'cancel') && e.id === st.id) {
          out.push({ kind: 'drag-end', x: st.last.x, y: st.last.y });
          this.st = { s: 'idle' };
        } else if (e.type === 'down') {
          // the nasty case: second finger mid-drag ⇒ drag ends, pinch begins
          out.push({ kind: 'drag-end', x: st.last.x, y: st.last.y });
          this.st = this.startPinch(st.id, st.last, e.id, { x: e.x, y: e.y }, out);
        }
        break;
      }

      case 'pinching': {
        if (e.type === 'move' && (e.id === st.a || e.id === st.b)) {
          const prevDist = Math.hypot(st.pa.x - st.pb.x, st.pa.y - st.pb.y);
          const prevC = { x: (st.pa.x + st.pb.x) / 2, y: (st.pa.y + st.pb.y) / 2 };
          if (e.id === st.a) st.pa = { x: e.x, y: e.y };
          else st.pb = { x: e.x, y: e.y };
          const dist = Math.hypot(st.pa.x - st.pb.x, st.pa.y - st.pb.y);
          const c = { x: (st.pa.x + st.pb.x) / 2, y: (st.pa.y + st.pb.y) / 2 };
          out.push({
            kind: 'pinch-move',
            cx: c.x,
            cy: c.y,
            dcx: c.x - prevC.x,
            dcy: c.y - prevC.y,
            scale: prevDist > 0 ? dist / prevDist : 1,
          });
        } else if ((e.type === 'up' || e.type === 'cancel') && (e.id === st.a || e.id === st.b)) {
          out.push({ kind: 'pinch-end' });
          const survivorId = e.id === st.a ? st.b : st.a;
          const survivorPt = e.id === st.a ? st.pb : st.pa;
          out.push({
            kind: 'drag-start',
            x: survivorPt.x,
            y: survivorPt.y,
            startX: survivorPt.x,
            startY: survivorPt.y,
          });
          this.st = { s: 'dragging', id: survivorId, last: survivorPt };
        } else if (e.type === 'down') {
          // third finger: ignored (camera stays two-finger)
        }
        break;
      }
    }
    return out;
  }

  private startPinch(idA: number, pa: Pt, idB: number, pb: Pt, out: GestureEvent[]): State {
    out.push({
      kind: 'pinch-start',
      cx: (pa.x + pb.x) / 2,
      cy: (pa.y + pb.y) / 2,
      dist: Math.hypot(pa.x - pb.x, pa.y - pb.y),
    });
    return { s: 'pinching', a: idA, b: idB, pa, pb };
  }
}
