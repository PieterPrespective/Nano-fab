/**
 * Shared scaffolding for scene runtimes: result types, overlay/button
 * markup, HTML escaping, and the gesture pump that feeds pointer events
 * (plus the timer events long-press needs) into a GestureMachine.
 */

import { theme } from '../../render/theme';
import { GestureMachine, type GestureEvent } from '../gestures';

export interface SceneResult {
  stars: number;
  predictionScore: number | null;
  conceptNodes: string[];
}

export interface SceneCallbacks {
  onResult(result: SceneResult): void; // fired on every improvement
  onPrediction(nodes: string[], score: number): void;
  onExit(): void;
}

export function btnCss(primary = false): string {
  return `background:${primary ? theme.accent : theme.panelRaised};color:${primary ? '#08121f' : theme.text};border:1px solid ${theme.stroke};border-radius:8px;padding:8px 14px;font-size:14px;font-weight:600`;
}

export function overlayCard(title: string, body: string, buttons: string): string {
  return `
    <div style="position:absolute;inset:0;background:rgba(4,8,16,0.82);display:grid;place-items:center">
      <div style="max-width:600px;width:calc(100% - 32px);background:${theme.panelRaised};border-radius:14px;padding:20px">
        <div style="font-size:20px;font-weight:700;margin-bottom:10px">${title}</div>
        ${body}
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">${buttons}</div>
      </div>
    </div>`;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wire pointer events + long-press timers from `canvas` into `onGesture`. */
export function attachGesturePump(
  canvas: HTMLCanvasElement,
  onGesture: (g: GestureEvent) => void,
): void {
  const machine = new GestureMachine();
  let timerId: ReturnType<typeof setTimeout> | null = null;
  function feed(e: Parameters<GestureMachine['handle']>[0]): void {
    for (const g of machine.handle(e)) onGesture(g);
    if (timerId) clearTimeout(timerId);
    const dl = machine.deadline();
    if (dl !== null) {
      timerId = setTimeout(() => feed({ type: 'timer', t: performance.now() }), dl - performance.now() + 5);
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    feed({ type: 'down', id: e.pointerId, x: e.offsetX, y: e.offsetY, t: performance.now() });
  });
  canvas.addEventListener('pointermove', (e) =>
    feed({ type: 'move', id: e.pointerId, x: e.offsetX, y: e.offsetY, t: performance.now() }),
  );
  canvas.addEventListener('pointerup', (e) =>
    feed({ type: 'up', id: e.pointerId, x: e.offsetX, y: e.offsetY, t: performance.now() }),
  );
  canvas.addEventListener('pointercancel', (e) =>
    feed({ type: 'cancel', id: e.pointerId, t: performance.now() }),
  );
}
