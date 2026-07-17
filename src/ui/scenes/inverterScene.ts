/**
 * Logic-inverter scene runtime (Ch2 capstone). Two complementary energy
 * terrains — the n-type pull-down and its p-type mirror — over a live
 * voltage transfer curve. Slide the input: the hills trade places and the
 * output lamp flips. Every scored number (gain, noise margins) is drawn on
 * the curve itself; the lamp shows the Boolean payoff.
 */

import type { NumericControl } from '../../engine/levels';
import type { LevelV2 } from '../../engine/levels2';
import { evaluateMetrics, type GenericEvaluation } from '../../engine/scoring';
import type { DeviceParams } from '../../physics/device';
import { inverterMetrics, inverterVout, inverterVTC, type VtcPoint } from '../../physics/inverter';
import { barrierHeight_eV, terrainProfile } from '../../physics/terrain';
import {
  initialInverterValues,
  inverterLabMetrics,
  parseInverterSetup,
  resolveInverterParams,
  type InverterLabSetup,
} from '../../scene/inverterlab';
import { theme } from '../../render/theme';
import type { GestureEvent } from '../gestures';
import { scoreChoose } from '../predict';
import { sliderToValue, valueToSlider } from '../slider';
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

export interface InverterHooks {
  setValue(key: string, value: number | string): void;
  setVin(vin: number): void;
  choose(i: number): void;
  commitPrediction(): void;
  dismissIntro(): void;
  state(): {
    beat: string;
    metrics: Record<string, number>;
    passed: boolean;
    stars: number;
    vin: number;
    vout: number;
  };
}

export function mountInverterScene(root: HTMLElement, level: LevelV2, callbacks: SceneCallbacks): InverterHooks {
  const setup: InverterLabSetup = parseInverterSetup(level.scene.setup);
  let values: Record<string, number | string> = initialInverterValues(setup);
  let params: DeviceParams = resolveInverterParams(setup, values);
  let vin = 0;
  let tutor: TutorState = startTutor(level);
  let evaln: GenericEvaluation = evaluateMetrics(level.targets, level.stars, inverterLabMetrics(setup, values));
  let bestStars = 0;
  let chosen: number | null = null;
  let revealedChoice = false;
  let revealDismissed = false;
  let formalizeDismissed = false;
  let interactionCount = 0;
  let vtc: VtcPoint[] = [];
  let dragging: 'vin' | null = null;

  // ---------- DOM ----------
  const controlRow = Object.entries(setup.controls)
    .map(([key, spec]) => {
      if (spec.kind === 'enum') {
        return `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:${theme.textDim}">architecture</span>
          ${spec.options.map((o) => `<button data-arch="${o}" style="${btnCss()};padding:6px 10px;font-size:12px">${o}</button>`).join('')}
        </div>`;
      }
      return `<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:170px">
        <span style="font-size:12px;color:${theme.textDim};white-space:nowrap">${key === 'gateLength_m' ? 'gate length' : key}</span>
        <input data-ctl="${key}" type="range" min="0" max="1000" value="${Math.round(valueToSlider(spec.init, spec) * 1000)}" style="flex:1;accent-color:${theme.accent}">
        <span data-ctl-label="${key}" style="font-size:12px;min-width:52px;text-align:right"></span>
      </div>`;
    })
    .join('');
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;background:${theme.bg};color:${theme.text};font-family:system-ui">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap">
        <button id="iv-back" style="${btnCss()}">‹ Levels</button>
        <div style="font-weight:700;font-size:16px;flex:1;min-width:120px">${esc(level.title)}</div>
        <div id="iv-targets" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        <button id="iv-reset" style="${btnCss()}">reset</button>
      </div>
      <div style="position:relative;flex:1">
        <canvas id="iv-canvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
        <div id="iv-overlay"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;padding:10px 16px;background:${theme.panel}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:${theme.accent};font-weight:700;white-space:nowrap">input Vin</span>
          <input id="iv-vin" type="range" min="0" max="1000" value="0" style="flex:1;accent-color:${theme.accent}">
          <span id="iv-vin-label" style="font-size:12px;min-width:52px;text-align:right"></span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${controlRow}</div>
      </div>
    </div>`;
  const canvas = root.querySelector('#iv-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const overlay = root.querySelector('#iv-overlay') as HTMLElement;
  const targetsEl = root.querySelector('#iv-targets') as HTMLElement;
  (root.querySelector('#iv-back') as HTMLElement).onclick = () => callbacks.onExit();
  (root.querySelector('#iv-reset') as HTMLElement).onclick = () => {
    values = initialInverterValues(setup);
    vin = 0;
    applyValues();
  };
  const vinSlider = root.querySelector('#iv-vin') as HTMLInputElement;
  const vinLabel = root.querySelector('#iv-vin-label') as HTMLElement;
  vinSlider.addEventListener('input', () => {
    vin = (Number(vinSlider.value) / 1000) * params.vdd_V;
    vinChanged();
    draw();
  });
  root.querySelectorAll<HTMLButtonElement>('button[data-arch]').forEach((b) => {
    b.onclick = () => hooks.setValue('arch', b.dataset.arch!);
  });
  root.querySelectorAll<HTMLInputElement>('input[data-ctl]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const key = inp.dataset.ctl!;
      const spec = setup.controls[key];
      if (!spec || spec.kind !== 'numeric') return;
      hooks.setValue(key, sliderToValue(Number(inp.value) / 1000, spec));
    });
  });

  // ---------- layout ----------
  let W = 0;
  let H = 0;
  function resize(): void {
    const dpr = Math.min(devicePixelRatio, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  new ResizeObserver(resize).observe(canvas);

  // VTC plot rect (bottom ~55% of canvas)
  const plot = (): { x: number; y: number; w: number; h: number } => ({
    x: 60,
    y: H * 0.42,
    w: W - 84,
    h: H * 0.52,
  });
  const vtcToScreen = (p: VtcPoint): { x: number; y: number } => {
    const r = plot();
    return {
      x: r.x + (p.vin_V / params.vdd_V) * r.w,
      y: r.y + (1 - p.vout_V / params.vdd_V) * r.h,
    };
  };

  // ---------- game flow ----------
  function refreshEval(): void {
    params = resolveInverterParams(setup, values);
    vtc = inverterVTC(params, params.vdd_V, 81);
    const metrics = inverterLabMetrics(setup, values);
    evaln = evaluateMetrics(level.targets, level.stars, metrics);
    targetsEl.innerHTML = evaln.targets
      .map(
        (t) => `<span style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid ${t.pass ? theme.good : theme.stroke};color:${t.pass ? theme.good : theme.textDim}">
          ${t.pass ? '✓' : '·'} ${esc(t.label)} <b style="color:${t.pass ? theme.good : theme.text}">${String(t.metric) === 'gain' ? t.actual.toFixed(1) : `${(t.actual * 1000).toFixed(0)} mV`}</b></span>`,
      )
      .join('');
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

  function applyValues(): void {
    for (const [key, spec] of Object.entries(setup.controls)) {
      if (spec.kind === 'enum') {
        root.querySelectorAll<HTMLButtonElement>('button[data-arch]').forEach((b) => {
          const on = b.dataset.arch === (values.arch ?? spec.init);
          b.style.background = on ? theme.accent : theme.panelRaised;
          b.style.color = on ? '#08121f' : theme.text;
        });
      } else {
        const inp = root.querySelector<HTMLInputElement>(`input[data-ctl="${key}"]`);
        const lab = root.querySelector<HTMLElement>(`span[data-ctl-label="${key}"]`);
        const v = Number(values[key] ?? spec.init);
        if (inp) inp.value = String(Math.round(valueToSlider(v, spec as NumericControl) * 1000));
        if (lab) lab.textContent = `${(v * 1e9).toFixed(0)} nm`;
      }
    }
    refreshEval();
    vinChanged();
    draw();
  }
  function vinChanged(): void {
    vinLabel.textContent = `${(vin * 1000).toFixed(0)} mV`;
    vinSlider.value = String(Math.round((vin / params.vdd_V) * 1000));
  }

  function maybeReveal(): void {
    if (!tutor.prediction || tutor.prediction.revealed) return;
    const score = scoreChoose(tutor.prediction.choice ?? -1, setup.correctChoice ?? 0);
    tutor = reveal(tutor, score);
    revealedChoice = true;
    if (level.prediction?.scored) callbacks.onPrediction(level.prediction.conceptNodes, score);
  }

  // ---------- gestures: drag the operating dot ----------
  attachGesturePump(canvas, onGesture);
  function onGesture(g: GestureEvent): void {
    if (tutor.beat !== 'play' && tutor.beat !== 'formalize') return;
    const r = plot();
    if (g.kind === 'drag-start') {
      const dotX = r.x + (vin / params.vdd_V) * r.w;
      if (g.startY > r.y - 30 && Math.abs(g.startX - dotX) < 60) dragging = 'vin';
    } else if ((g.kind === 'drag-move' || g.kind === 'drag-end') && dragging === 'vin') {
      vin = Math.min(params.vdd_V, Math.max(0, ((g.x - r.x) / r.w) * params.vdd_V));
      vinChanged();
      draw();
      if (g.kind === 'drag-end') dragging = null;
    } else if (g.kind === 'tap' && g.y > r.y - 20) {
      vin = Math.min(params.vdd_V, Math.max(0, ((g.x - r.x) / r.w) * params.vdd_V));
      vinChanged();
      draw();
    }
  }

  // ---------- overlays (intro / choose-predict / reveal / formalize) ----------
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
      const choices = setup.choices ?? [];
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
      (overlay.querySelector('#ov-skip') as HTMLElement).onclick = () => {
        tutor = skipPrediction(tutor);
        renderOverlays();
      };
    } else if (revealedChoice && tutor.beat === 'play' && setup.choices && setup.correctChoice !== undefined && !revealDismissed) {
      const right = (tutor.prediction?.choice ?? -1) === setup.correctChoice;
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;top:8px;background:rgba(20,29,48,0.95);border:1px solid ${right ? theme.good : theme.accentWarm};border-radius:12px;padding:10px 14px;display:flex;gap:10px;align-items:center">
          <div style="flex:1;font-size:13.5px">${right ? '<b style="color:' + theme.good + '">Called it.</b>' : '<b style="color:' + theme.accentWarm + '">Not quite.</b>'}
          <b>${esc(setup.choices[setup.correctChoice]!)}</b> — slide the input and watch the lamp.</div>
          <button id="ov-ok" style="${btnCss()}">OK</button>
        </div>`;
      (overlay.querySelector('#ov-ok') as HTMLElement).onclick = () => {
        revealDismissed = true;
        renderOverlays();
      };
    } else if (tutor.beat === 'play' && interactionCount === 0) {
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;bottom:12px;background:rgba(20,29,48,0.92);border-radius:12px;padding:12px 16px;text-align:center;font-size:14px;pointer-events:none">
          <b style="color:${theme.accent}">Slide the input</b> (or drag the dot on the curve) and watch the two hills trade places.
          Then fix the device with the controls below until the curve is a cliff, not a slope.
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

  // ---------- drawing ----------
  function draw(): void {
    if (W < 60 || H < 60) return;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    const vdd = params.vdd_V;
    const vout = inverterVout(params, vin, vdd);

    // --- two complementary mini terrains ---
    const stripW = (W - 100) / 2;
    const stripH = H * 0.26;
    const stripY = 34;
    const drawStrip = (x0: number, vg: number, vds: number, label: string, pulls: string): void => {
      const prof = terrainProfile(params, { vg_V: vg, vds_V: Math.max(0.02, vds) }, 61);
      const eb = barrierHeight_eV(params, { vg_V: vg, vds_V: Math.max(0.02, vds) });
      const eMax = 0.32;
      const eMin = -0.3;
      const py = (e: number): number =>
        stripY + ((eMax - Math.max(eMin, Math.min(eMax, e))) / (eMax - eMin)) * stripH;
      ctx.fillStyle = '#16223c';
      ctx.beginPath();
      ctx.moveTo(x0, stripY + stripH);
      prof.forEach((p) => ctx.lineTo(x0 + p.x_frac * stripW, py(p.e_eV)));
      ctx.lineTo(x0 + stripW, stripY + stripH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      prof.forEach((p, i) => {
        const s = { x: x0 + p.x_frac * stripW, y: py(p.e_eV) };
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      const open = eb < 0.05;
      ctx.fillStyle = open ? theme.good : theme.textDim;
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`${label} — ${open ? 'OPEN (hill flat)' : `blocked: ${(eb * 1000).toFixed(0)} meV`}`, x0, stripY - 8);
      ctx.fillStyle = theme.textDim;
      ctx.font = '11px system-ui';
      ctx.fillText(pulls, x0, stripY + stripH + 14);
    };
    drawStrip(50, vin, vout, 'n-type', 'pulls output DOWN to 0');
    drawStrip(70 + stripW, vdd - vin, vdd - vout, 'p-type (mirror)', 'pulls output UP to Vdd');

    // --- output lamp ---
    const lampX = W / 2;
    const lampY = stripY + stripH + 34;
    const logic = vout > 0.7 * vdd ? '1' : vout < 0.3 * vdd ? '0' : '?';
    ctx.fillStyle = logic === '?' ? theme.accentWarm : theme.good;
    ctx.font = '700 17px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`OUT = ${logic}  (${(vout * 1000).toFixed(0)} mV)`, lampX, lampY);

    // --- VTC plot ---
    const r = plot();
    ctx.fillStyle = '#0e1730';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = theme.stroke;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = theme.textDim;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('input Vin →', r.x + r.w / 2, r.y + r.h + 18);
    ctx.save();
    ctx.translate(r.x - 34, r.y + r.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('output Vout →', 0, 0);
    ctx.restore();
    // ideal-inverter ghost (the goal shape)
    ctx.strokeStyle = 'rgba(124,141,181,0.35)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + r.w / 2, r.y);
    ctx.lineTo(r.x + r.w / 2, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // the actual curve
    ctx.strokeStyle = theme.curveHigh;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    vtc.forEach((p, i) => {
      const s = vtcToScreen(p);
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    // operating point
    const op = vtcToScreen({ vin_V: vin, vout_V: vout });
    ctx.fillStyle = theme.accentWarm;
    ctx.beginPath();
    ctx.arc(op.x, op.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,171,80,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(op.x, r.y + r.h);
    ctx.lineTo(op.x, op.y);
    ctx.lineTo(r.x, op.y);
    ctx.stroke();
    // gain annotation at the steepest point
    const m = evaln.metrics;
    ctx.fillStyle = theme.text;
    ctx.font = '700 12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`gain ${(m.gain ?? 0).toFixed(1)}  ·  noise margin ${((m.nmLow_V ?? 0) * 1000).toFixed(0)} mV`, r.x + 10, r.y + 18);
  }

  // ---------- hooks ----------
  const hooks: InverterHooks = {
    setValue: (key, value) => {
      if (tutor.beat === 'intro' || tutor.beat === 'predict') return;
      maybeReveal();
      interactionCount++;
      values = { ...values, [key]: value };
      applyValues();
      renderOverlays();
    },
    setVin: (v) => {
      interactionCount++;
      vin = Math.max(0, Math.min(params.vdd_V, v));
      vinChanged();
      draw();
      renderOverlays();
    },
    choose: (i) => {
      if (tutor.beat !== 'predict') return;
      chosen = i;
      tutor = commitPrediction(tutor, { choice: i }, 'choose');
      maybeReveal();
      renderOverlays();
      draw();
    },
    commitPrediction: () => {
      if (tutor.beat !== 'predict') return;
      tutor = commitPrediction(tutor, { choice: chosen ?? -1 }, level.prediction!.kind);
      renderOverlays();
    },
    dismissIntro: () => {
      tutor = dismissIntro(level, tutor);
      renderOverlays();
      draw();
    },
    state: () => ({
      beat: tutor.beat,
      metrics: { ...evaln.metrics },
      passed: evaln.passed,
      stars: evaln.stars,
      vin,
      vout: inverterVout(params, vin, params.vdd_V),
    }),
  };

  applyValues();
  renderOverlays();
  resize();
  return hooks;
}
