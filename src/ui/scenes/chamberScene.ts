/**
 * Particle-chamber scene runtime (Ch1). Canvas 2D scene + DOM HUD; all
 * physics/game state in scene/chamber.ts (pure), tutor beats in ui/tutor.ts.
 * Interaction verbs: launch (slingshot from the launcher), place (steering
 * charges), draw/mark (predictions), probe (long-press field inspector).
 */

import type { LevelV2 } from '../../engine/levels2';
import { evaluateMetrics, type GenericEvaluation } from '../../engine/scoring';
import {
  CHAMBER_H,
  CHAMBER_W,
  chamberMetrics,
  fireShot,
  initialChamberState,
  parseChamberSetup,
  placeCharge,
  probeField,
  simulateShot,
  type ChamberSetup,
  type ChamberState,
} from '../../scene/chamber';
import { theme } from '../../render/theme';
import { GestureMachine, type GestureEvent } from '../gestures';
import { scoreMark, scoreSketch, type Pt } from '../predict';
import {
  cleared,
  commitPrediction,
  dismissIntro,
  keepPlaying,
  reveal,
  skipPrediction,
  startTutor,
  type TutorState,
} from '../tutor';

export interface SceneResult {
  stars: number;
  predictionScore: number | null;
  conceptNodes: string[];
}

export interface ChamberHooks {
  launch(vx: number, vy: number): void;
  place(x: number, y: number): void;
  togglePolarity(): void;
  sketch(points: Pt[]): void;
  mark(x: number, y: number): void;
  commitPrediction(): void;
  dismissIntro(): void;
  state(): { beat: string; shots: number; hits: number; passed: boolean; stars: number };
}

export function mountChamberScene(
  root: HTMLElement,
  level: LevelV2,
  callbacks: {
    onResult(result: SceneResult): void; // fired on every improvement
    onPrediction(nodes: string[], score: number): void;
    onExit(): void;
  },
): ChamberHooks {
  const setup: ChamberSetup = parseChamberSetup(level.scene.setup);
  let state: ChamberState = initialChamberState();
  let tutor: TutorState = startTutor(level);
  let evaln: GenericEvaluation = evaluateMetrics(level.targets, level.stars, chamberMetrics(setup, state));
  let bestStars = 0;
  let sketchPts: Pt[] = [];
  let markPt: Pt | null = null;
  let truthPts: Pt[] | null = null; // revealed prediction truth (world coords)
  let probe: { x: number; y: number; ex: number; ey: number; until: number } | null = null;
  let pull: { x: number; y: number } | null = null; // active slingshot pull (world)
  let placing = false;
  let animHead = 1; // 0..1 animation of the newest shot
  let formalizeDismissed = false;

  // ---------- DOM scaffold ----------
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;background:${theme.bg};color:${theme.text};font-family:system-ui">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px">
        <button id="cs-back" style="${btnCss()}">‹ Levels</button>
        <div style="font-weight:700;font-size:16px;flex:1">${esc(level.title)}</div>
        <div id="cs-stats" style="color:${theme.textDim};font-size:13px"></div>
        <button id="cs-polarity" style="${btnCss()};display:none">charge: −</button>
        <button id="cs-place" style="${btnCss()};display:none">place ⊕</button>
        <button id="cs-reset" style="${btnCss()}">reset</button>
      </div>
      <div style="position:relative;flex:1">
        <canvas id="cs-canvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
        <div id="cs-overlay"></div>
      </div>
    </div>`;
  const canvas = root.querySelector('#cs-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const overlay = root.querySelector('#cs-overlay') as HTMLElement;
  const statsEl = root.querySelector('#cs-stats') as HTMLElement;
  (root.querySelector('#cs-back') as HTMLElement).onclick = () => callbacks.onExit();
  (root.querySelector('#cs-reset') as HTMLElement).onclick = () => {
    state = { ...initialChamberState(), polarity: state.polarity };
    refreshEval();
    draw();
  };
  const polarityBtn = root.querySelector('#cs-polarity') as HTMLButtonElement;
  if (setup.polarityToggle) {
    polarityBtn.style.display = '';
    polarityBtn.onclick = () => hooks.togglePolarity();
  }
  const placeBtn = root.querySelector('#cs-place') as HTMLButtonElement;
  if (setup.placeable) {
    placeBtn.style.display = '';
    placeBtn.onclick = () => {
      placing = !placing;
      placeBtn.style.background = placing ? theme.accent : theme.panelRaised;
      placeBtn.style.color = placing ? '#08121f' : theme.text;
    };
  }

  // ---------- coordinate mapping ----------
  let W = 0;
  let H = 0;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  function resize(): void {
    const dpr = Math.min(devicePixelRatio, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min((W - 32) / CHAMBER_W, (H - 32) / CHAMBER_H);
    ox = (W - CHAMBER_W * scale) / 2;
    oy = (H - CHAMBER_H * scale) / 2;
    draw();
  }
  const toScreen = (x: number, y: number): Pt => ({ x: ox + x * scale, y: oy + (CHAMBER_H - y) * scale });
  const toWorld = (sx: number, sy: number): Pt => ({ x: (sx - ox) / scale, y: CHAMBER_H - (sy - oy) / scale });
  new ResizeObserver(resize).observe(canvas);

  // ---------- game flow ----------
  function refreshEval(): void {
    evaln = evaluateMetrics(level.targets, level.stars, chamberMetrics(setup, state));
    statsEl.textContent = `shots ${state.shots.length} · hits ${evaln.metrics.hits ?? 0}`;
    if (evaln.passed && evaln.stars > bestStars) {
      bestStars = evaln.stars;
      callbacks.onResult({
        stars: evaln.stars,
        predictionScore: tutor.prediction?.score ?? null,
        conceptNodes: level.conceptNodes,
      });
      tutor = cleared(tutor);
      formalizeDismissed = false;
      renderOverlays();
    }
  }

  function predictionTruth(): Pt[] {
    // c1-02's lesson: the prompt asks about the flipped particle
    const st: ChamberState = {
      ...initialChamberState(),
      polarity: setup.polarityToggle ? -1 : 1,
    };
    const shot = simulateShot(setup, st, setup.predictionShot.vx_ms, setup.predictionShot.vy_ms);
    return shot.points.map((p) => ({ x: p.x_m, y: p.y_m }));
  }

  function maybeReveal(): void {
    if (!tutor.prediction || tutor.prediction.revealed) return;
    truthPts = predictionTruth();
    const diag = Math.hypot(CHAMBER_W, CHAMBER_H);
    let score = 0;
    if (tutor.prediction.kind === 'sketch' && tutor.prediction.sketch) {
      score = scoreSketch(tutor.prediction.sketch, truthPts, diag);
    } else if (tutor.prediction.kind === 'mark' && tutor.prediction.mark) {
      const end = truthPts[truthPts.length - 1]!;
      score = scoreMark(tutor.prediction.mark, end, setup.target.r * 1.5);
    }
    tutor = reveal(tutor, score);
    if (level.prediction?.scored) callbacks.onPrediction(level.prediction.conceptNodes, score);
  }

  function doLaunch(vx: number, vy: number): void {
    if (tutor.beat === 'intro' || tutor.beat === 'predict') return;
    maybeReveal();
    state = fireShot(setup, state, vx, vy);
    animHead = 0;
    animate();
    refreshEval();
    renderOverlays(); // retires the first-launch coaching bar
  }

  function animate(): void {
    animHead = Math.min(1, animHead + 0.05);
    draw();
    if (animHead < 1) requestAnimationFrame(animate);
  }

  // ---------- gestures ----------
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

  function onGesture(g: GestureEvent): void {
    const beat = tutor.beat;
    if (g.kind === 'long-press') {
      const w = toWorld(g.x, g.y);
      const [ex, ey] = probeField(setup, state, w.x, w.y);
      probe = { ...w, ex, ey, until: performance.now() + 1800 };
      draw();
      setTimeout(draw, 1900);
      return;
    }
    if (beat === 'predict') {
      const kind = level.prediction?.kind;
      if (kind === 'sketch') {
        if (g.kind === 'drag-start') sketchPts = [toWorld(g.startX, g.startY), toWorld(g.x, g.y)];
        else if (g.kind === 'drag-move') sketchPts.push(toWorld(g.x, g.y));
      } else if (kind === 'mark' && g.kind === 'tap') {
        markPt = toWorld(g.x, g.y);
      }
      draw();
      return;
    }
    if (beat !== 'play' && beat !== 'formalize') return;
    if (g.kind === 'tap' && placing && setup.placeable) {
      const w = toWorld(g.x, g.y);
      state = placeCharge(setup, state, w.x, w.y);
      if (state.placed.length >= setup.placeable.count) placing = false;
      draw();
      return;
    }
    const launcherS = toScreen(setup.launcher.x, setup.launcher.y);
    if (g.kind === 'drag-start' && Math.hypot(g.startX - launcherS.x, g.startY - launcherS.y) < 90) {
      pull = toWorld(g.x, g.y);
      draw();
    } else if (g.kind === 'drag-move' && pull) {
      pull = toWorld(g.x, g.y);
      draw();
    } else if (g.kind === 'drag-end' && pull) {
      const dx = pull.x - setup.launcher.x;
      const dy = pull.y - setup.launcher.y;
      const len = Math.hypot(dx, dy);
      pull = null;
      if (len > 0.02) {
        // pull magnitude sets speed (25%..100% of max); direction = pull direction
        const frac = setup.energyWindow ? Math.min(1, Math.max(0.25, len / 0.3)) : 1;
        const v = setup.launcher.speed_ms * frac;
        doLaunch((dx / len) * v, (dy / len) * v);
      } else {
        draw();
      }
    }
  }

  // ---------- overlays (DOM) ----------
  function renderOverlays(): void {
    if (tutor.beat === 'intro') {
      overlay.innerHTML = overlayCard(
        level.title,
        `<p style="color:${theme.textDim};line-height:1.5">${esc(level.intro)}</p>
         <ul style="color:${theme.text};font-size:14px">${level.targets.map((t) => `<li>${esc(t.label)}</li>`).join('')}</ul>`,
        `<button id="ov-start" style="${btnCss(true)}">Start</button>`,
      );
      (overlay.querySelector('#ov-start') as HTMLElement).onclick = () => hooks.dismissIntro();
    } else if (tutor.beat === 'predict') {
      const kind = level.prediction?.kind;
      const how = kind === 'sketch' ? 'Draw it with your finger on the chamber' : 'Tap the spot on the chamber';
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;top:8px;background:rgba(20,29,48,0.95);border:1px solid ${theme.accent};border-radius:12px;padding:12px 14px">
          <div style="font-size:15px;margin-bottom:4px"><b style="color:${theme.accent}">PREDICT FIRST:</b> ${esc(level.prediction?.prompt ?? '')}</div>
          <div style="font-size:13px;color:${theme.textDim};margin-bottom:10px">${how}, then press <b>Lock it in</b> — the launch comes after.</div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="ov-clear" style="${btnCss()}">Clear</button>
            <button id="ov-skip" style="${btnCss()}">Skip</button>
            <button id="ov-commit" style="${btnCss(true)};padding:10px 22px">Lock it in ›</button>
          </div>
        </div>`;
      (overlay.querySelector('#ov-clear') as HTMLElement).onclick = () => {
        sketchPts = [];
        markPt = null;
        draw();
      };
      (overlay.querySelector('#ov-skip') as HTMLElement).onclick = () => {
        tutor = skipPrediction(tutor);
        renderOverlays();
        draw();
      };
      (overlay.querySelector('#ov-commit') as HTMLElement).onclick = () => hooks.commitPrediction();
    } else if (tutor.beat === 'play' && state.shots.length === 0) {
      // first-launch coaching: the launcher IS the slingshot
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;bottom:12px;background:rgba(20,29,48,0.92);border-radius:12px;padding:12px 16px;text-align:center;font-size:14px;pointer-events:none">
          <b style="color:${theme.accent}">Now fire:</b> put your finger on the glowing launcher,
          <b>drag in the direction you want to shoot</b>, and release.${setup.energyWindow ? ' Pull further for a faster launch.' : ''}
        </div>`;
    } else if (tutor.beat === 'formalize' && !formalizeDismissed) {
      const insight =
        tutor.prediction?.score !== undefined
          ? `<div style="color:${theme.accent};font-size:13px;margin-top:8px">Prediction insight: ${Math.round(
              (tutor.prediction.score ?? 0) * 100,
            )}%</div>`
          : '';
      overlay.innerHTML = overlayCard(
        `Cleared! ${'★'.repeat(evaln.stars)}${'☆'.repeat(3 - evaln.stars)}`,
        `<div style="color:${theme.accent};font-size:12px;font-weight:600">THE PHYSICS</div>
         <p style="color:${theme.text};line-height:1.55;font-size:14.5px">${esc(level.explain)}</p>${insight}`,
        `<button id="ov-keep" style="${btnCss()}">Keep playing</button>
         <button id="ov-exit" style="${btnCss(true)}">Level select</button>`,
      );
      (overlay.querySelector('#ov-keep') as HTMLElement).onclick = () => {
        formalizeDismissed = true;
        tutor = keepPlaying(tutor);
        renderOverlays();
      };
      (overlay.querySelector('#ov-exit') as HTMLElement).onclick = () => callbacks.onExit();
    } else {
      overlay.innerHTML = '';
    }
  }

  // ---------- canvas drawing ----------
  function draw(): void {
    if (W < 60 || H < 60) return; // pre-layout mount: ResizeObserver redraws
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    const tl = toScreen(0, CHAMBER_H);
    // chamber box
    ctx.fillStyle = '#0e1730';
    ctx.fillRect(tl.x, tl.y, CHAMBER_W * scale, CHAMBER_H * scale);
    // field regions tint
    for (const r of setup.regions) {
      const a = toScreen(r.x0_m, r.y1_m);
      ctx.fillStyle = 'rgba(76,201,240,0.06)';
      ctx.fillRect(a.x, a.y, (r.x1_m - r.x0_m) * scale, (r.y1_m - r.y0_m) * scale);
    }
    // field arrows
    ctx.strokeStyle = 'rgba(124,141,181,0.45)';
    ctx.fillStyle = 'rgba(124,141,181,0.45)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      for (let j = 1; j < 9; j++) {
        const wx = (i / 12) * CHAMBER_W;
        const wy = (j / 9) * CHAMBER_H;
        const [ex, ey] = probeField(setup, state, wx, wy);
        const mag = Math.hypot(ex, ey);
        if (mag < 1e-9) continue;
        const len = Math.min(16, 4 + 3 * Math.log10(1 + mag));
        const s = toScreen(wx, wy);
        const ux = ex / mag;
        const uy = -ey / mag; // screen y flips
        arrow(s.x, s.y, s.x + ux * len, s.y + uy * len);
      }
    }
    // obstacles
    for (const b of setup.obstacles) {
      const a = toScreen(b.x0, b.y1);
      ctx.fillStyle = '#2a3a5c';
      ctx.fillRect(a.x, a.y, (b.x1 - b.x0) * scale, (b.y1 - b.y0) * scale);
    }
    // target
    const t = toScreen(setup.target.x, setup.target.y);
    ctx.strokeStyle = theme.good;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, setup.target.r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(74,222,128,0.3)';
    ctx.beginPath();
    ctx.arc(t.x, t.y, setup.target.r * scale * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    // charges
    for (const c of [...setup.charges, ...state.placed]) {
      drawCharge(toScreen(c.x_m, c.y_m), c.q_C > 0);
    }
    // launcher (pulsing halo until the first shot makes it obvious)
    const l = toScreen(setup.launcher.x, setup.launcher.y);
    if (state.shots.length === 0 && (tutor.beat === 'play' || tutor.beat === 'predict')) {
      const pulse = 18 + 7 * Math.sin(performance.now() / 280);
      ctx.strokeStyle = 'rgba(76,201,240,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(l.x, l.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      if (tutor.beat === 'play') requestAnimationFrame(() => draw());
    }
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#08121f';
    ctx.font = '700 13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.polarity === 1 ? '−' : '+', l.x, l.y + 0.5);
    // pull rubber band + projected aim arrow
    if (pull) {
      const p = toScreen(pull.x, pull.y);
      ctx.strokeStyle = theme.accentWarm;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const dx = p.x - l.x;
      const dy = p.y - l.y;
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        const hx = p.x + (dx / len) * 18;
        const hy = p.y + (dy / len) * 18;
        const a = Math.atan2(dy, dx);
        ctx.fillStyle = theme.accentWarm;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - 12 * Math.cos(a - 0.45), hy - 12 * Math.sin(a - 0.45));
        ctx.lineTo(hx - 12 * Math.cos(a + 0.45), hy - 12 * Math.sin(a + 0.45));
        ctx.fill();
      }
    }
    // past shots
    state.shots.forEach((shot, idx) => {
      const isLast = idx === state.shots.length - 1;
      const n = isLast ? Math.max(2, Math.floor(shot.points.length * animHead)) : shot.points.length;
      ctx.strokeStyle = isLast ? theme.curveHigh : 'rgba(76,201,240,0.25)';
      ctx.lineWidth = isLast ? 2.5 : 1.5;
      ctx.beginPath();
      shot.points.slice(0, n).forEach((p, i) => {
        const s = toScreen(p.x_m, p.y_m);
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      if (isLast && animHead >= 1 && shot.hit) {
        ctx.fillStyle = theme.good;
        ctx.font = '700 15px system-ui';
        ctx.fillText('HIT', t.x, t.y - setup.target.r * scale - 12);
      }
    });
    // prediction ghosts
    if (tutor.prediction?.sketch || sketchPts.length > 1) {
      const pts = tutor.prediction?.sketch ?? sketchPts;
      ghostLine(pts, 'rgba(230,237,243,0.7)');
    }
    const mk = tutor.prediction?.mark ?? markPt;
    if (mk) {
      const s = toScreen(mk.x, mk.y);
      ctx.strokeStyle = 'rgba(230,237,243,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.moveTo(s.x - 13, s.y);
      ctx.lineTo(s.x + 13, s.y);
      ctx.moveTo(s.x, s.y - 13);
      ctx.lineTo(s.x, s.y + 13);
      ctx.stroke();
    }
    if (truthPts) ghostLine(truthPts, 'rgba(74,222,128,0.65)');
    // probe tooltip
    if (probe && performance.now() < probe.until) {
      const s = toScreen(probe.x, probe.y);
      const mag = Math.hypot(probe.ex, probe.ey);
      ctx.strokeStyle = theme.accentWarm;
      ctx.lineWidth = 2.5;
      if (mag > 1e-9) {
        arrow(s.x, s.y, s.x + (probe.ex / mag) * 30, s.y - (probe.ey / mag) * 30);
      }
      ctx.fillStyle = 'rgba(20,29,48,0.95)';
      ctx.fillRect(s.x + 12, s.y - 34, 150, 24);
      ctx.fillStyle = theme.text;
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`|E| = ${mag < 1 ? mag.toExponential(1) : mag.toFixed(0)} V/m`, s.x + 18, s.y - 22);
    }

    function arrow(x0: number, y0: number, x1: number, y1: number): void {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 5 * Math.cos(a - 0.4), y1 - 5 * Math.sin(a - 0.4));
      ctx.lineTo(x1 - 5 * Math.cos(a + 0.4), y1 - 5 * Math.sin(a + 0.4));
      ctx.fill();
    }
    function ghostLine(pts: Pt[], color: string): void {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const s = toScreen(p.x, p.y);
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    function drawCharge(s: Pt, positive: boolean): void {
      ctx.fillStyle = positive ? '#e05d5d' : '#4f7bd9';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(positive ? '+' : '−', s.x, s.y + 0.5);
    }
  }

  // ---------- hooks (UI buttons + e2e) ----------
  const hooks: ChamberHooks = {
    launch: (vx, vy) => doLaunch(vx, vy),
    place: (x, y) => {
      state = placeCharge(setup, state, x, y);
      draw();
    },
    togglePolarity: () => {
      state = { ...state, polarity: state.polarity === 1 ? -1 : 1 };
      polarityBtn.textContent = state.polarity === 1 ? 'charge: −' : 'charge: +';
      draw();
    },
    sketch: (points) => {
      sketchPts = points;
      draw();
    },
    mark: (x, y) => {
      markPt = { x, y };
      draw();
    },
    commitPrediction: () => {
      if (tutor.beat !== 'predict') return;
      const kind = level.prediction!.kind;
      tutor = commitPrediction(
        tutor,
        kind === 'sketch' ? { sketch: sketchPts } : kind === 'mark' ? { mark: markPt ?? undefined } : {},
        kind,
      );
      renderOverlays();
      draw();
    },
    dismissIntro: () => {
      tutor = dismissIntro(level, tutor);
      renderOverlays();
      draw();
    },
    state: () => ({
      beat: tutor.beat,
      shots: state.shots.length,
      hits: (evaln.metrics.hits as number) ?? 0,
      passed: evaln.passed,
      stars: evaln.stars,
    }),
  };

  refreshEval();
  renderOverlays();
  resize();
  return hooks;
}

function btnCss(primary = false): string {
  return `background:${primary ? theme.accent : theme.panelRaised};color:${primary ? '#08121f' : theme.text};border:1px solid ${theme.stroke};border-radius:8px;padding:8px 14px;font-size:14px;font-weight:600`;
}

function overlayCard(title: string, body: string, buttons: string): string {
  return `
    <div style="position:absolute;inset:0;background:rgba(4,8,16,0.82);display:grid;place-items:center">
      <div style="max-width:600px;width:calc(100% - 32px);background:${theme.panelRaised};border-radius:14px;padding:20px">
        <div style="font-size:20px;font-weight:700;margin-bottom:10px">${title}</div>
        ${body}
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">${buttons}</div>
      </div>
    </div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
