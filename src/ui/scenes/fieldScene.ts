/**
 * Field-lab scene runtime (Ch2 prologue — the dimension ladder). Canvas 2D
 * + DOM HUD; all game state in scene/fieldlab.ts (pure), tutor beats in
 * ui/tutor.ts. Three modes:
 * - heightmap: contour landscape, tap to drop balls that roll along −∇V
 * - volume:    cut-plane slider + shell rings on the face, tap to probe |E|
 * - tensor:    drag to rotate the strained slab, measure J vs E
 * Win conditions are visible instruments: the HUD counts balls home,
 * probes, distinct angles — never a hidden boolean.
 */

import type { LevelV2 } from '../../engine/levels2';
import { evaluateMetrics, type GenericEvaluation } from '../../engine/scoring';
import { gridGradient, gridValue, isolines, sampleField, type GridField } from '../../physics/contours';
import { potentialAt } from '../../physics/em';
import {
  descentPathForDrop,
  dropBall,
  facePeak,
  fieldLabMetrics,
  heightmapEnv,
  initialFieldLabState,
  parseFieldLabSetup,
  probeOrientation,
  probeVolume,
  setCut,
  volumeFieldAt,
  volumePotentialAt,
  type CutAxis,
  type FieldLabSetup,
  type FieldLabState,
  type HeightmapSetup,
  type TensorSetup,
  type VolumeSetup,
} from '../../scene/fieldlab';
import { theme } from '../../render/theme';
import type { GestureEvent } from '../gestures';
import { scoreChoose, scoreMark, scoreSketch, type Pt } from '../predict';
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
import { attachGesturePump, btnCss, esc, overlayCard, type SceneCallbacks } from './common';

export interface FieldHooks {
  drop(x: number, y: number): void;
  cut(axis: CutAxis, frac: number): void;
  probeAt(u: number, v: number): void;
  rotate(theta: number): void;
  measure(): void;
  sketch(points: Pt[]): void;
  mark(x: number, y: number): void;
  choose(i: number): void;
  commitPrediction(): void;
  dismissIntro(): void;
  state(): { beat: string; metrics: Record<string, number>; passed: boolean; stars: number };
}

export function mountFieldScene(root: HTMLElement, level: LevelV2, callbacks: SceneCallbacks): FieldHooks {
  const setup: FieldLabSetup = parseFieldLabSetup(level.scene.setup);
  let state: FieldLabState = initialFieldLabState();
  let tutor: TutorState = startTutor(level);
  let evaln: GenericEvaluation = evaluateMetrics(level.targets, level.stars, fieldLabMetrics(setup, state));
  let bestStars = 0;
  let sketchPts: Pt[] = [];
  let markPt: Pt | null = null;
  let chosen: number | null = null;
  let truthPath: Pt[] | null = null; // revealed sketch truth (heightmap)
  let truthMark: Pt | null = null; // revealed mark truth (volume)
  let probeTip: { x: number; y: number; lines: string[]; until: number } | null = null;
  let slabTheta = 0; // tensor slab angle (rad)
  let dragStartTheta = 0;
  let previewFrac: number | null = null; // volume slider live preview
  let animT = 1; // newest drop path animation 0..1
  let formalizeDismissed = false;

  // ---------- DOM scaffold ----------
  const isVolume = setup.mode === 'volume';
  const isTensor = setup.mode === 'tensor';
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;background:${theme.bg};color:${theme.text};font-family:system-ui">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap">
        <button id="fs-back" style="${btnCss()}">‹ Levels</button>
        <div style="font-weight:700;font-size:16px;flex:1;min-width:120px">${esc(level.title)}</div>
        <div id="fs-stats" style="color:${theme.textDim};font-size:13px"></div>
        ${isTensor ? `<button id="fs-measure" style="${btnCss(true)}">⚡ measure</button>` : ''}
        <button id="fs-reset" style="${btnCss()}">reset</button>
      </div>
      <div style="position:relative;flex:1">
        <canvas id="fs-canvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
        <div id="fs-overlay"></div>
      </div>
      ${isVolume ? `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:${theme.panel}">
        <span style="font-size:13px;color:${theme.textDim}">cut plane</span>
        <div id="fs-axes" style="display:flex;gap:6px">
          ${(['x', 'y', 'z'] as const).map((a) => `<button data-axis="${a}" style="${btnCss()};padding:6px 12px">${a.toUpperCase()}</button>`).join('')}
        </div>
        <input id="fs-cut" type="range" min="0" max="100" value="50" style="flex:1;accent-color:${theme.accent}">
      </div>` : ''}
    </div>`;
  const canvas = root.querySelector('#fs-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const overlay = root.querySelector('#fs-overlay') as HTMLElement;
  const statsEl = root.querySelector('#fs-stats') as HTMLElement;
  (root.querySelector('#fs-back') as HTMLElement).onclick = () => callbacks.onExit();
  (root.querySelector('#fs-reset') as HTMLElement).onclick = () => {
    state = initialFieldLabState();
    slabTheta = 0;
    refreshEval();
    draw();
  };
  (root.querySelector('#fs-measure') as HTMLElement | null)?.addEventListener('click', () => hooks.measure());
  const cutSlider = root.querySelector('#fs-cut') as HTMLInputElement | null;
  cutSlider?.addEventListener('input', () => {
    previewFrac = Number(cutSlider.value) / 100;
    draw();
  });
  cutSlider?.addEventListener('change', () => {
    previewFrac = null;
    hooks.cut(state.cutAxis, Number(cutSlider.value) / 100);
  });
  root.querySelectorAll<HTMLButtonElement>('#fs-axes button').forEach((b) => {
    b.onclick = () => hooks.cut(b.dataset.axis as CutAxis, state.cutFrac);
  });

  // ---------- world windows + coordinate mapping ----------
  // heightmap: the setup window. volume: the current cut face. tensor: ±1 square.
  function worldWindow(): { x0: number; y0: number; x1: number; y1: number } {
    if (setup.mode === 'heightmap') return setup.window;
    if (setup.mode === 'volume') {
      const b = setup.box;
      return state.cutAxis === 'x'
        ? { x0: b.y0, y0: b.z0, x1: b.y1, y1: b.z1 }
        : state.cutAxis === 'y'
          ? { x0: b.x0, y0: b.z0, x1: b.x1, y1: b.z1 }
          : { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    }
    return { x0: -1, y0: -0.75, x1: 1, y1: 0.75 };
  }
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
    const win = worldWindow();
    scale = Math.min((W - 32) / (win.x1 - win.x0), (H - 32) / (win.y1 - win.y0));
    ox = (W - (win.x1 - win.x0) * scale) / 2;
    oy = (H - (win.y1 - win.y0) * scale) / 2;
    fieldCache = null;
    draw();
  }
  const toScreen = (x: number, y: number): Pt => {
    const win = worldWindow();
    return { x: ox + (x - win.x0) * scale, y: oy + (win.y1 - y) * scale };
  };
  const toWorld = (sx: number, sy: number): Pt => {
    const win = worldWindow();
    return { x: win.x0 + (sx - ox) / scale, y: win.y1 - (sy - oy) / scale };
  };
  new ResizeObserver(resize).observe(canvas);

  // ---------- sampled field + shading cache ----------
  const GRID = 81;
  let fieldCache: { f: GridField; img: HTMLCanvasElement; levels: number[]; frac: number; axis: CutAxis } | null = null;

  function faceValue(u: number, v: number, frac: number): number {
    const s = setup as VolumeSetup;
    const b = s.box;
    switch (state.cutAxis) {
      case 'x':
        return volumePotentialAt(s, b.x0 + frac * (b.x1 - b.x0), u, v);
      case 'y':
        return volumePotentialAt(s, u, b.y0 + frac * (b.y1 - b.y0), v);
      case 'z':
        return volumePotentialAt(s, u, v, b.z0 + frac * (b.z1 - b.z0));
    }
  }

  function ensureField(): NonNullable<typeof fieldCache> {
    const frac = previewFrac ?? state.cutFrac;
    if (fieldCache && fieldCache.frac === frac && fieldCache.axis === state.cutAxis) return fieldCache;
    const win = worldWindow();
    const fn =
      setup.mode === 'heightmap'
        ? (x: number, y: number) => potentialAt(x, y, heightmapEnv(setup))
        : (u: number, v: number) => faceValue(u, v, frac);
    const f = sampleField(fn, win.x0, win.y0, win.x1, win.y1, GRID, GRID);
    // percentile anchors: the singular 1/r peak must not blow out the range
    const sorted = Array.from(f.v).sort((x, y) => x - y);
    const lo = sorted[Math.floor(sorted.length * 0.03)]!;
    const hi = sorted[Math.floor(sorted.length * 0.97)]!;
    const s = Math.max((hi - lo) / 10, 1e-9);
    const aHi = Math.asinh((hi - lo) / s);
    const shade = (v: number): number =>
      Math.min(1, Math.max(0, Math.asinh((v - lo) / s) / (aHi || 1)));
    const img = document.createElement('canvas');
    img.width = GRID;
    img.height = GRID;
    const ictx = img.getContext('2d')!;
    const data = ictx.createImageData(GRID, GRID);
    for (let iy = 0; iy < GRID; iy++) {
      for (let ix = 0; ix < GRID; ix++) {
        const t = shade(f.v[iy * GRID + ix]!);
        // canvas rows top-down vs world rows bottom-up
        const o = ((GRID - 1 - iy) * GRID + ix) * 4;
        data.data[o] = 14 + 76 * t;
        data.data[o + 1] = 23 + 68 * t;
        data.data[o + 2] = 48 + 96 * t;
        data.data[o + 3] = 255;
      }
    }
    ictx.putImageData(data, 0, 0);
    // linear-in-V levels: ring spacing then shows ΔV/E — shells crowd where
    // the field is strong, which is the lesson the probe verifies
    const N_LEVELS = 12;
    const levels: number[] = [];
    for (let i = 1; i < N_LEVELS; i++) {
      levels.push(lo + ((hi - lo) * i) / N_LEVELS);
    }
    fieldCache = { f, img, levels, frac, axis: state.cutAxis };
    return fieldCache;
  }

  // ---------- game flow ----------
  function refreshEval(): void {
    const metrics = fieldLabMetrics(setup, state);
    evaln = evaluateMetrics(level.targets, level.stars, metrics);
    if (setup.mode === 'heightmap') {
      statsEl.textContent = `balls home ${metrics.ballsHome}/${setup.ballsRequired} · drops ${metrics.dropsUsed}`;
    } else if (setup.mode === 'volume') {
      statsEl.textContent = `peak ${metrics.peakFound ? 'FOUND ✓' : 'not yet'} · probes ${metrics.probesUsed} · cuts ${metrics.cutsMade}`;
    } else {
      statsEl.textContent = `angles probed ${metrics.orientationsProbed} (need 3+)`;
    }
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

  function maybeReveal(): void {
    if (!tutor.prediction || tutor.prediction.revealed) return;
    let score = 0;
    if (setup.mode === 'heightmap' && tutor.prediction.kind === 'sketch') {
      const start = setup.predictionStart ?? { x: 0.5, y: 0.5 };
      truthPath = descentPathForDrop(setup, start.x, start.y);
      const win = setup.window;
      const diag = Math.hypot(win.x1 - win.x0, win.y1 - win.y0);
      if (tutor.prediction.sketch) score = scoreSketch(tutor.prediction.sketch, truthPath, diag);
    } else if (setup.mode === 'volume' && tutor.prediction.kind === 'mark') {
      const s = setup as VolumeSetup;
      const peak = facePeak(s, state);
      truthMark = { x: peak.u, y: peak.v };
      const win = worldWindow();
      const diag = Math.hypot(win.x1 - win.x0, win.y1 - win.y0);
      if (tutor.prediction.mark) score = scoreMark(tutor.prediction.mark, truthMark, 0.08 * diag * 1.5);
    } else if (tutor.prediction.kind === 'choose') {
      const correct = (setup.mode === 'tensor' ? setup.correctChoice : undefined) ?? 0;
      score = scoreChoose(tutor.prediction.choice ?? -1, correct);
    }
    tutor = reveal(tutor, score);
    if (level.prediction?.scored) callbacks.onPrediction(level.prediction.conceptNodes, score);
  }

  function animate(): void {
    animT = Math.min(1, animT + 0.03);
    draw();
    if (animT < 1) requestAnimationFrame(animate);
  }

  // ---------- gestures ----------
  attachGesturePump(canvas, onGesture);
  function onGesture(g: GestureEvent): void {
    const beat = tutor.beat;
    if (g.kind === 'long-press') {
      showProbe(g.x, g.y);
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
    if (setup.mode === 'heightmap' && g.kind === 'tap') {
      const w = toWorld(g.x, g.y);
      hooks.drop(w.x, w.y);
    } else if (setup.mode === 'volume' && g.kind === 'tap') {
      const w = toWorld(g.x, g.y);
      hooks.probeAt(w.x, w.y);
    } else if (setup.mode === 'tensor') {
      const cx = W / 2;
      const cy = H / 2;
      if (g.kind === 'drag-start') {
        dragStartTheta = slabTheta - Math.atan2(cy - g.y, g.x - cx);
        draw();
      } else if (g.kind === 'drag-move' || g.kind === 'drag-end') {
        slabTheta = dragStartTheta + Math.atan2(cy - g.y, g.x - cx);
        draw();
      } else if (g.kind === 'tap') {
        hooks.measure();
      }
    }
  }

  function showProbe(sx: number, sy: number): void {
    const w = toWorld(sx, sy);
    const lines: string[] = [];
    if (setup.mode === 'heightmap') {
      const { f } = ensureField();
      const v = gridValue(f, w.x, w.y);
      const [gx, gy] = gridGradient(f, w.x, w.y);
      lines.push(`V = ${fmtV(v)} (one number)`, `downhill = −∇V ${dirArrow(-gx, -gy)}`);
    } else if (setup.mode === 'volume') {
      const s = setup as VolumeSetup;
      const frac = previewFrac ?? state.cutFrac;
      const [x, y, z] =
        state.cutAxis === 'x'
          ? [s.box.x0 + frac * (s.box.x1 - s.box.x0), w.x, w.y]
          : state.cutAxis === 'y'
            ? [w.x, s.box.y0 + frac * (s.box.y1 - s.box.y0), w.y]
            : [w.x, w.y, s.box.z0 + frac * (s.box.z1 - s.box.z0)];
      lines.push(`V = ${fmtV(volumePotentialAt(s, x, y, z))} (still one number)`, `|E| = ${fmtE(volumeFieldAt(s, x, y, z))} ⊥ shells`);
    } else {
      lines.push(`slab at ${Math.round((slabTheta * 180) / Math.PI)}°`, 'tap ⚡ measure to probe J');
    }
    probeTip = { x: sx, y: sy, lines, until: performance.now() + 2000 };
    draw();
    setTimeout(draw, 2100);
  }

  // ---------- overlays ----------
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
      if (kind === 'choose') {
        const choices = (setup.mode === 'tensor' ? setup.choices : undefined) ?? [];
        overlay.innerHTML = `
          <div style="position:absolute;left:12px;right:12px;top:8px;background:rgba(20,29,48,0.95);border:1px solid ${theme.accent};border-radius:12px;padding:12px 14px">
            <div style="font-size:15px;margin-bottom:10px"><b style="color:${theme.accent}">PREDICT FIRST:</b> ${esc(level.prediction?.prompt ?? '')}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${choices.map((c, i) => `<button data-choice="${i}" style="${btnCss()};text-align:left">${esc(c)}</button>`).join('')}
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">
              <button id="ov-skip" style="${btnCss()}">Skip</button>
            </div>
          </div>`;
        overlay.querySelectorAll<HTMLButtonElement>('button[data-choice]').forEach((b) => {
          b.onclick = () => hooks.choose(Number(b.dataset.choice));
        });
      } else {
        const how = kind === 'sketch' ? 'Draw it with your finger' : 'Tap the spot';
        overlay.innerHTML = `
          <div style="position:absolute;left:12px;right:12px;top:8px;background:rgba(20,29,48,0.95);border:1px solid ${theme.accent};border-radius:12px;padding:12px 14px">
            <div style="font-size:15px;margin-bottom:4px"><b style="color:${theme.accent}">PREDICT FIRST:</b> ${esc(level.prediction?.prompt ?? '')}</div>
            <div style="font-size:13px;color:${theme.textDim};margin-bottom:10px">${how}, then press <b>Lock it in</b>.</div>
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
        (overlay.querySelector('#ov-commit') as HTMLElement).onclick = () => hooks.commitPrediction();
      }
      (overlay.querySelector('#ov-skip') as HTMLElement).onclick = () => {
        tutor = skipPrediction(tutor);
        renderOverlays();
        draw();
      };
    } else if (tutor.beat === 'play' && actionsTaken() === 0) {
      const coach =
        setup.mode === 'heightmap'
          ? '<b>Tap anywhere</b> to drop a ball — it rolls straight downhill (−∇V). Long-press to probe the landscape.'
          : setup.mode === 'volume'
            ? 'Drag the <b>cut plane slider</b> below, then <b>tap the face</b> to probe the field. Shells crowd where E is strong.'
            : '<b>Drag</b> to rotate the slab, then hit <b>⚡ measure</b>. Try at least 3 angles.';
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;bottom:12px;background:rgba(20,29,48,0.92);border-radius:12px;padding:12px 16px;text-align:center;font-size:14px;pointer-events:none">
          ${coach}
        </div>`;
    } else if (tutor.beat === 'formalize' && !formalizeDismissed) {
      const insight =
        tutor.prediction?.score !== undefined
          ? `<div style="color:${theme.accent};font-size:13px;margin-top:8px">Prediction insight: ${Math.round((tutor.prediction.score ?? 0) * 100)}%</div>`
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

  function actionsTaken(): number {
    return state.drops.length + state.probesV.length + state.probesT.length + state.cutsMade;
  }

  // ---------- drawing ----------
  function draw(): void {
    if (W < 60 || H < 60) return; // pre-layout mount: ResizeObserver redraws
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    if (setup.mode === 'tensor') {
      drawTensor();
    } else {
      drawFieldPane();
    }
    // prediction ghosts (world coords)
    if (sketchPts.length > 1 || tutor.prediction?.sketch) {
      ghostLine(tutor.prediction?.sketch ?? sketchPts, 'rgba(230,237,243,0.7)');
    }
    const mk = tutor.prediction?.mark ?? markPt;
    if (mk) crosshair(toScreen(mk.x, mk.y), 'rgba(230,237,243,0.8)');
    if (truthPath) ghostLine(truthPath, 'rgba(74,222,128,0.7)');
    if (truthMark) {
      crosshair(toScreen(truthMark.x, truthMark.y), 'rgba(74,222,128,0.85)');
      const s = toScreen(truthMark.x, truthMark.y);
      ctx.fillStyle = theme.good;
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('strongest field', s.x, s.y - 18);
    }
    // probe tooltip
    if (probeTip && performance.now() < probeTip.until) {
      ctx.fillStyle = 'rgba(20,29,48,0.95)';
      const w = Math.max(...probeTip.lines.map((l) => l.length)) * 7 + 16;
      ctx.fillRect(probeTip.x + 12, probeTip.y - 20 - 16 * probeTip.lines.length, w, 16 * probeTip.lines.length + 10);
      ctx.fillStyle = theme.text;
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      probeTip.lines.forEach((l, i) => {
        ctx.fillText(l, probeTip!.x + 18, probeTip!.y - 10 - 16 * (probeTip!.lines.length - i - 1) - 12);
      });
    }
  }

  function drawFieldPane(): void {
    const { f, img, levels } = ensureField();
    const win = worldWindow();
    const tl = toScreen(win.x0, win.y1);
    const pw = (win.x1 - win.x0) * scale;
    const ph = (win.y1 - win.y0) * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, tl.x, tl.y, pw, ph);
    ctx.strokeStyle = theme.stroke;
    ctx.strokeRect(tl.x, tl.y, pw, ph);
    // contour shells
    for (const lv of levels) {
      for (const line of isolines(f, lv)) {
        ctx.strokeStyle = 'rgba(124,141,181,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        line.forEach((p, i) => {
          const s = toScreen(p.x, p.y);
          i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
    }
    if (setup.mode === 'heightmap') {
      // home basin ring
      const hs = toScreen(setup.home.x, setup.home.y);
      ctx.strokeStyle = theme.good;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, setup.home.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = theme.good;
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('HOME', hs.x, hs.y - setup.home.r * scale - 8);
      // prediction start marker
      if (setup.predictionStart && (tutor.beat === 'predict' || truthPath)) {
        const ps = toScreen(setup.predictionStart.x, setup.predictionStart.y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      // drops
      state.drops.forEach((d, idx) => {
        const isLast = idx === state.drops.length - 1;
        const frac = isLast ? animT : 1;
        const n = Math.max(1, Math.floor(d.path.length * frac));
        ctx.strokeStyle = d.home ? 'rgba(74,222,128,0.6)' : 'rgba(224,93,93,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        d.path.slice(0, n).forEach((p, i) => {
          const s = toScreen(p.x, p.y);
          i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
        const end = d.path[n - 1]!;
        const es = toScreen(end.x, end.y);
        ctx.fillStyle = d.home && frac >= 1 ? theme.good : '#e6edf3';
        ctx.beginPath();
        ctx.arc(es.x, es.y, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (setup.mode === 'volume') {
      const s = setup as VolumeSetup;
      const frac = previewFrac ?? state.cutFrac;
      // charges projected onto the face (size shrinks with distance to plane)
      const b = s.box;
      for (const c of s.charges) {
        const [u, v, dist, span] =
          state.cutAxis === 'x'
            ? [c.y_m, c.z_m, Math.abs(c.x_m - (b.x0 + frac * (b.x1 - b.x0))), b.x1 - b.x0]
            : state.cutAxis === 'y'
              ? [c.x_m, c.z_m, Math.abs(c.y_m - (b.y0 + frac * (b.y1 - b.y0))), b.y1 - b.y0]
              : [c.x_m, c.y_m, Math.abs(c.z_m - (b.z0 + frac * (b.z1 - b.z0))), b.z1 - b.z0];
        const sp = toScreen(u, v);
        const r = Math.max(4, 14 * (1 - dist / span));
        ctx.fillStyle = c.q_C > 0 ? 'rgba(224,93,93,0.85)' : 'rgba(79,123,217,0.85)';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(10, r)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.q_C > 0 ? '+' : '−', sp.x, sp.y + 0.5);
      }
      // probes
      for (const p of state.probesV) {
        const sp = toScreen(p.u, p.v);
        ctx.strokeStyle = p.nearPeak ? theme.good : theme.accentWarm;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = p.nearPeak ? theme.good : theme.textDim;
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(p.nearPeak ? 'PEAK!' : fmtE(p.e_mag), sp.x, sp.y - 14);
      }
      // cut position gauge
      ctx.fillStyle = theme.textDim;
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`cut: ${state.cutAxis.toUpperCase()} @ ${(frac * 100).toFixed(0)}%`, tl.x + 8, tl.y + 18);
    }
  }

  function drawTensor(): void {
    const s = setup as TensorSetup;
    const cx = W / 2;
    const cy = H / 2;
    // applied field arrows
    ctx.strokeStyle = 'rgba(124,141,181,0.5)';
    ctx.fillStyle = 'rgba(124,141,181,0.5)';
    ctx.lineWidth = 1.5;
    for (let j = 1; j < 7; j++) {
      const y = (H * j) / 7;
      arrow(24, y, 64, y);
    }
    ctx.fillStyle = theme.textDim;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('E (fixed)', 24, H / 7 - 10);
    // slab
    const sw = Math.min(W, H) * 0.42;
    const sh = sw * 0.62;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-slabTheta);
    ctx.fillStyle = '#22304f';
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
    // strain axis hatches
    ctx.strokeStyle = 'rgba(76,201,240,0.4)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-sw / 2 + 10, (i * sh) / 8);
      ctx.lineTo(sw / 2 - 10, (i * sh) / 8);
      ctx.stroke();
    }
    ctx.fillStyle = theme.textDim;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('strain axis →', 0, -sh / 2 - 8);
    ctx.restore();
    // measured J arrows
    const last = state.probesT[state.probesT.length - 1];
    for (const p of state.probesT) {
      const isLast = p === last;
      const len = 40 + 60 * (p.j_mag / (s.sigmaMajor * s.e0));
      ctx.strokeStyle = isLast ? theme.accentWarm : 'rgba(240,171,80,0.35)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = isLast ? 3 : 1.5;
      arrow(cx, cy, cx + len * Math.cos(p.deflection_rad), cy - len * Math.sin(p.deflection_rad));
    }
    if (last) {
      ctx.fillStyle = theme.accentWarm;
      ctx.font = '700 13px system-ui';
      ctx.textAlign = 'center';
      const deg = Math.round((last.deflection_rad * 180) / Math.PI);
      ctx.fillText(`|J| = ${last.j_mag.toFixed(2)} · J is ${Math.abs(deg)}° off E`, cx, cy + Math.min(W, H) * 0.3);
    }
    ctx.fillStyle = theme.textDim;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`slab angle ${Math.round((slabTheta * 180) / Math.PI)}° — drag to rotate`, cx, H - 16);
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
  function crosshair(s: Pt, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
    ctx.moveTo(s.x - 13, s.y);
    ctx.lineTo(s.x + 13, s.y);
    ctx.moveTo(s.x, s.y - 13);
    ctx.lineTo(s.x, s.y + 13);
    ctx.stroke();
  }
  function arrow(x0: number, y0: number, x1: number, y1: number): void {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 7 * Math.cos(a - 0.4), y1 - 7 * Math.sin(a - 0.4));
    ctx.lineTo(x1 - 7 * Math.cos(a + 0.4), y1 - 7 * Math.sin(a + 0.4));
    ctx.fill();
  }
  function fmtV(v: number): string {
    const av = Math.abs(v);
    return av >= 1000 || (av < 0.01 && av > 0) ? `${v.toExponential(1)} V` : `${v.toFixed(1)} V`;
  }
  function fmtE(e: number): string {
    return e >= 1000 ? `${e.toExponential(1)} V/m` : `${e.toFixed(0)} V/m`;
  }
  function dirArrow(dx: number, dy: number): string {
    const a = Math.atan2(dy, dx);
    const dirs = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
    return dirs[((Math.round((a / Math.PI) * 4) % 8) + 8) % 8]!;
  }

  // ---------- hooks ----------
  const hooks: FieldHooks = {
    drop: (x, y) => {
      if (setup.mode !== 'heightmap' || tutor.beat === 'intro' || tutor.beat === 'predict') return;
      maybeReveal();
      state = dropBall(setup, state, x, y);
      animT = 0;
      animate();
      refreshEval();
      renderOverlays();
    },
    cut: (axis, frac) => {
      if (setup.mode !== 'volume' || tutor.beat === 'intro') return;
      state = setCut(state, axis, frac);
      fieldCache = null;
      refreshEval();
      renderOverlays();
      resize(); // axis change can alter the window aspect
    },
    probeAt: (u, v) => {
      if (setup.mode !== 'volume' || tutor.beat === 'intro' || tutor.beat === 'predict') return;
      maybeReveal();
      state = probeVolume(setup, state, u, v);
      refreshEval();
      renderOverlays();
      draw();
    },
    rotate: (theta) => {
      slabTheta = theta;
      draw();
    },
    measure: () => {
      if (setup.mode !== 'tensor' || tutor.beat === 'intro' || tutor.beat === 'predict') return;
      maybeReveal();
      state = probeOrientation(setup, state, slabTheta);
      refreshEval();
      renderOverlays();
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
    choose: (i) => {
      if (tutor.beat !== 'predict') return;
      chosen = i;
      tutor = commitPrediction(tutor, { choice: i }, 'choose');
      maybeReveal(); // choose reveals immediately — the truth is a fact, not a run
      renderOverlays();
      draw();
    },
    commitPrediction: () => {
      if (tutor.beat !== 'predict') return;
      const kind = level.prediction!.kind;
      tutor = commitPrediction(
        tutor,
        kind === 'sketch' ? { sketch: sketchPts } : kind === 'mark' ? { mark: markPt ?? undefined } : { choice: chosen ?? -1 },
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
      metrics: { ...fieldLabMetrics(setup, state) },
      passed: evaln.passed,
      stars: evaln.stars,
    }),
  };

  refreshEval();
  renderOverlays();
  resize();
  return hooks;
}
