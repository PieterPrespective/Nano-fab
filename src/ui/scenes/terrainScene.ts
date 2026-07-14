/**
 * Energy-terrain scene runtime (Ch2 — the transistor as a landscape).
 * The terrain IS the device: barrier height tracks Vg, the drain floor
 * tilts with Vds, DIBL erodes the hilltop, and the thermal ball crowd's
 * arrival rate is the drain current (physics/terrain.ts derives all of it
 * from the phase-1 compact model, consistency-tested to ±10%).
 *
 * Direct manipulation: drag the HILLTOP down = raise Vg; drag the DRAIN
 * FLOOR down = raise Vds; drag the hill's BASE sideways = gate length.
 * Everything scored is a visible instrument: target chips with live values,
 * an exact Id readout, the barrier height in eV, and the Id–Vg inset.
 *
 * Honesty note (fidelity rule): the crowd's crossing pace on screen is
 * cube-root compressed so 10⁻⁴× rates still show a ball now and then —
 * the meters next to it are exact.
 */

import type { LevelV2 } from '../../engine/levels2';
import { evaluateMetrics, type GenericEvaluation } from '../../engine/scoring';
import {
  drainCurrent,
  idVgCurve,
  thermalVoltage,
  type DeviceParams,
} from '../../physics/device';
import { createRng } from '../../physics/rng';
import {
  arrivalRate,
  barrierHeight_eV,
  sampleCrowdEnergies_eV,
  terrainProfile,
} from '../../physics/terrain';
import {
  initialTerrainValues,
  parseTerrainSetup,
  resolveTerrainParams,
  terrainMetrics,
  type TerrainLabSetup,
} from '../../scene/terrainlab';
import type { NumericControl } from '../../engine/levels';
import { perDecade, perVolt, ratio, si } from '../format';
import { sliderToValue, valueToSlider } from '../slider';
import { theme } from '../../render/theme';
import type { GestureEvent } from '../gestures';
import { scoreChoose } from '../predict';
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

export interface TerrainHooks {
  setValue(key: string, value: number | string): void;
  setBias(vg: number, vds: number): void;
  choose(i: number): void;
  commitPrediction(): void;
  dismissIntro(): void;
  state(): {
    beat: string;
    metrics: Record<string, number>;
    passed: boolean;
    stars: number;
    values: Record<string, number | string>;
    bias: { vg: number; vds: number };
  };
}

const CROWD_N = 90;

export function mountTerrainScene(root: HTMLElement, level: LevelV2, callbacks: SceneCallbacks): TerrainHooks {
  const setup: TerrainLabSetup = parseTerrainSetup(level.scene.setup);
  let values: Record<string, number | string> = initialTerrainValues(setup);
  let params: DeviceParams = resolveTerrainParams(setup, values);
  let bias = { vg: 0, vds: params.vdd_V };
  let tutor: TutorState = startTutor(level);
  let evaln: GenericEvaluation = evaluateMetrics(level.targets, level.stars, terrainMetrics(setup, values));
  let bestStars = 0;
  let chosen: number | null = null;
  let revealedChoice = false;
  let formalizeDismissed = false;
  let arrivals = 0;

  // deterministic thermal crowd (energies in eV, exponential with mean kT)
  const energies = sampleCrowdEnergies_eV(setup.crowdSeed, CROWD_N, params.temperature_K);
  const jitterRng = createRng(setup.crowdSeed ^ 0x9e3779b9);
  interface Ball {
    e_eV: number;
    baseX: number; // jitter anchor 0..0.16
    phase: number;
    crossing: number | null; // progress 0..1 along the profile, null = at source
  }
  const balls: Ball[] = energies.map((e) => ({
    e_eV: e,
    baseX: 0.02 + jitterRng() * 0.14,
    phase: jitterRng() * Math.PI * 2,
    crossing: null,
  }));
  let crossAcc = 0;
  let nextCross = 0;

  // ---------- DOM scaffold ----------
  const controlRow = Object.entries(setup.controls)
    .map(([key, spec]) => {
      if (spec.kind === 'enum') {
        return `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:${theme.textDim}">gate wrap</span>
          ${spec.options.map((o) => `<button data-arch="${o}" style="${btnCss()};padding:6px 10px;font-size:12px">${archLabel(o)}</button>`).join('')}
        </div>`;
      }
      if (key === 'nStack') {
        return `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:${theme.textDim}">sheets</span>
          <button data-stack="-1" style="${btnCss()};padding:6px 12px">−</button>
          <span id="ts-nstack" style="font-weight:700;min-width:16px;text-align:center">${spec.init}</span>
          <button data-stack="1" style="${btnCss()};padding:6px 12px">+</button>
        </div>`;
      }
      return `<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:170px">
        <span style="font-size:12px;color:${theme.textDim};white-space:nowrap">${controlLabel(key)}</span>
        <input data-ctl="${key}" type="range" min="0" max="1000" value="${numToSlider(spec, spec.init)}" style="flex:1;accent-color:${theme.accent}">
        <span data-ctl-label="${key}" style="font-size:12px;min-width:56px;text-align:right">${fmtParam(key, spec.init)}</span>
      </div>`;
    })
    .join('');
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;background:${theme.bg};color:${theme.text};font-family:system-ui">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap">
        <button id="ts-back" style="${btnCss()}">‹ Levels</button>
        <div style="font-weight:700;font-size:16px;flex:1;min-width:120px">${esc(level.title)}</div>
        <div id="ts-targets" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        <button id="ts-reset" style="${btnCss()}">reset</button>
      </div>
      <div style="position:relative;flex:1">
        <canvas id="ts-canvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
        <div id="ts-overlay"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;padding:10px 16px;background:${theme.panel}">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:180px">
            <span style="font-size:12px;color:${theme.accent};font-weight:700;white-space:nowrap">gate Vg</span>
            <input id="ts-vg" type="range" min="0" max="1000" value="0" style="flex:1;accent-color:${theme.accent}">
            <span id="ts-vg-label" style="font-size:12px;min-width:52px;text-align:right"></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:180px">
            <span style="font-size:12px;color:${theme.accentWarm};font-weight:700;white-space:nowrap">drain Vds</span>
            <input id="ts-vds" type="range" min="0" max="1000" value="1000" style="flex:1;accent-color:${theme.accentWarm}">
            <span id="ts-vds-label" style="font-size:12px;min-width:52px;text-align:right"></span>
          </div>
        </div>
        ${controlRow ? `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${controlRow}</div>` : ''}
      </div>
    </div>`;
  const canvas = root.querySelector('#ts-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const overlay = root.querySelector('#ts-overlay') as HTMLElement;
  const targetsEl = root.querySelector('#ts-targets') as HTMLElement;
  (root.querySelector('#ts-back') as HTMLElement).onclick = () => callbacks.onExit();
  (root.querySelector('#ts-reset') as HTMLElement).onclick = () => {
    values = initialTerrainValues(setup);
    bias = { vg: 0, vds: params.vdd_V };
    arrivals = 0;
    applyValues();
  };
  const vgSlider = root.querySelector('#ts-vg') as HTMLInputElement;
  const vdsSlider = root.querySelector('#ts-vds') as HTMLInputElement;
  const vgLabel = root.querySelector('#ts-vg-label') as HTMLElement;
  const vdsLabel = root.querySelector('#ts-vds-label') as HTMLElement;
  vgSlider.addEventListener('input', () => {
    bias.vg = (Number(vgSlider.value) / 1000) * params.vdd_V;
    biasChanged();
  });
  vdsSlider.addEventListener('input', () => {
    bias.vds = Math.max(0.02, (Number(vdsSlider.value) / 1000) * params.vdd_V);
    biasChanged();
  });
  root.querySelectorAll<HTMLButtonElement>('button[data-arch]').forEach((b) => {
    b.onclick = () => hooks.setValue('arch', b.dataset.arch!);
  });
  root.querySelectorAll<HTMLButtonElement>('button[data-stack]').forEach((b) => {
    b.onclick = () => {
      const spec = setup.controls.nStack;
      if (!spec || spec.kind !== 'numeric') return;
      const cur = Number(values.nStack ?? spec.init);
      hooks.setValue('nStack', Math.min(spec.max, Math.max(spec.min, cur + Number(b.dataset.stack))));
    };
  });
  root.querySelectorAll<HTMLInputElement>('input[data-ctl]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const key = inp.dataset.ctl!;
      const spec = setup.controls[key];
      if (!spec || spec.kind !== 'numeric') return;
      hooks.setValue(key, sliderToNum(spec, Number(inp.value)));
    });
  });

  // ---------- layout ----------
  let W = 0;
  let H = 0;
  const M = { l: 56, r: 16, t: 48, b: 30 };
  function resize(): void {
    const dpr = Math.min(devicePixelRatio, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);

  // energy → screen mapping (recomputed per frame). The visible window is
  // clamped: the drain cliff runs off the bottom edge on purpose — the
  // action lives near the hilltop, and the meV labels stay exact.
  function eRange(): { eMin: number; eMax: number } {
    const ebMax = barrierHeight_eV(params, { vg_V: 0, vds_V: 0.02 });
    return { eMin: -Math.min(0.42, params.vdd_V * 0.62), eMax: Math.max(0.28, ebMax + 0.12) };
  }
  /** Where the Vds grab handle sits — the drain ledge, kept on-screen. */
  function drainHandleE(): number {
    return Math.max(-bias.vds, eRange().eMin + 0.05);
  }
  const px = (frac: number): number => M.l + frac * (W - M.l - M.r);
  function py(e: number): number {
    const { eMin, eMax } = eRange();
    return M.t + ((eMax - e) / (eMax - eMin)) * (H - M.t - M.b);
  }

  // ---------- game flow ----------
  function refreshEval(): void {
    params = resolveTerrainParams(setup, values);
    const metrics = terrainMetrics(setup, values);
    evaln = evaluateMetrics(level.targets, level.stars, metrics);
    targetsEl.innerHTML = evaln.targets
      .map(
        (t) => `<span style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid ${t.pass ? theme.good : theme.stroke};color:${t.pass ? theme.good : theme.textDim}">
          ${t.pass ? '✓' : '·'} ${esc(t.label)} <b style="color:${t.pass ? theme.good : theme.text}">${fmtMetric(String(t.metric), t.actual)}</b></span>`,
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
    // sync every DOM control to `values` (canvas drags move sliders too)
    for (const [key, spec] of Object.entries(setup.controls)) {
      if (spec.kind === 'enum') {
        root.querySelectorAll<HTMLButtonElement>('button[data-arch]').forEach((b) => {
          const on = b.dataset.arch === (values.arch ?? spec.init);
          b.style.background = on ? theme.accent : theme.panelRaised;
          b.style.color = on ? '#08121f' : theme.text;
        });
      } else if (key === 'nStack') {
        const el = root.querySelector('#ts-nstack');
        if (el) el.textContent = String(values.nStack ?? spec.init);
      } else {
        const inp = root.querySelector<HTMLInputElement>(`input[data-ctl="${key}"]`);
        const lab = root.querySelector<HTMLElement>(`span[data-ctl-label="${key}"]`);
        const v = Number(values[key] ?? spec.init);
        if (inp) inp.value = String(numToSlider(spec, v));
        if (lab) lab.textContent = fmtParam(key, v);
      }
    }
    refreshEval();
  }

  function biasChanged(): void {
    vgLabel.textContent = `${(bias.vg * 1000).toFixed(0)} mV`;
    vdsLabel.textContent = `${(bias.vds * 1000).toFixed(0)} mV`;
    vgSlider.value = String(Math.round((bias.vg / params.vdd_V) * 1000));
    vdsSlider.value = String(Math.round((bias.vds / params.vdd_V) * 1000));
  }

  function maybeReveal(): void {
    if (!tutor.prediction || tutor.prediction.revealed) return;
    const score = scoreChoose(tutor.prediction.choice ?? -1, setup.correctChoice ?? 0);
    tutor = reveal(tutor, score);
    revealedChoice = true;
    if (level.prediction?.scored) callbacks.onPrediction(level.prediction.conceptNodes, score);
  }

  function insetVisible(): boolean {
    const inset = level.insets.find((i) => i.kind === 'idvg');
    if (!inset) return false;
    if (inset.unlockOn === 'always') return true;
    if (inset.unlockOn === 'reveal') return revealedChoice || !level.prediction || tutor.prediction?.revealed === true || bestStars > 0;
    return bestStars > 0;
  }

  // ---------- gestures: grab the terrain itself ----------
  interface Grab {
    kind: 'hilltop' | 'drain' | 'base';
    startVg: number;
    startVds: number;
    startLg: number;
    x0: number;
    y0: number;
  }
  let grab: Grab | null = null;
  attachGesturePump(canvas, onGesture);
  function onGesture(g: GestureEvent): void {
    const beat = tutor.beat;
    if (g.kind === 'long-press') {
      probeUntil = performance.now() + 2200;
      return;
    }
    if (beat !== 'play' && beat !== 'formalize') return;
    if (g.kind === 'drag-start') {
      const peakS = { x: px(0.5), y: py(barrierHeight_eV(params, { vg_V: bias.vg, vds_V: bias.vds })) };
      const drainS = { x: px(0.93), y: py(drainHandleE()) };
      const baseY = py(0);
      const nearHill = Math.hypot(g.startX - peakS.x, g.startY - peakS.y) < 70;
      const nearDrain = Math.hypot(g.startX - drainS.x, g.startY - drainS.y) < 70;
      const nearBase = Math.abs(g.startY - baseY) < 60 && Math.abs(g.startX - px(0.5)) < (W - M.l - M.r) * 0.28;
      const kind = nearHill ? 'hilltop' : nearDrain ? 'drain' : nearBase && setup.controls.gateLength_m ? 'base' : null;
      if (kind) {
        grab = { kind, startVg: bias.vg, startVds: bias.vds, startLg: Number(values.gateLength_m ?? NaN), x0: g.startX, y0: g.startY };
      }
    } else if ((g.kind === 'drag-move' || g.kind === 'drag-end') && grab) {
      const dy = g.y - grab.y0;
      const dx = g.x - grab.x0;
      if (grab.kind === 'hilltop') {
        // dragging the hilltop DOWN = opening the gate = raising Vg
        bias.vg = Math.min(params.vdd_V, Math.max(0, grab.startVg + (dy / (H * 0.45)) * params.vdd_V));
        biasChanged();
      } else if (grab.kind === 'drain') {
        bias.vds = Math.min(params.vdd_V, Math.max(0.02, grab.startVds + (dy / (H * 0.45)) * params.vdd_V));
        biasChanged();
      } else {
        const spec = setup.controls.gateLength_m;
        if (spec && spec.kind === 'numeric' && Number.isFinite(grab.startLg)) {
          // sideways stretch: exponential so nm-scale knobs feel uniform
          const lg = grab.startLg * Math.exp(dx / 220);
          hooks.setValue('gateLength_m', Math.min(spec.max, Math.max(spec.min, lg)));
        }
      }
      if (g.kind === 'drag-end') grab = null;
    }
  }
  let probeUntil = 0;

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
          The answer: <b>${esc(setup.choices[setup.correctChoice]!)}</b> — now make the terrain prove it.</div>
          <button id="ov-ok" style="${btnCss()}">OK</button>
        </div>`;
      (overlay.querySelector('#ov-ok') as HTMLElement).onclick = () => {
        revealDismissed = true;
        renderOverlays();
      };
    } else if (tutor.beat === 'play' && interactionCount === 0) {
      const hasLg = setup.controls.gateLength_m !== undefined;
      overlay.innerHTML = `
        <div style="position:absolute;left:12px;right:12px;bottom:12px;background:rgba(20,29,48,0.92);border-radius:12px;padding:12px 16px;text-align:center;font-size:14px;pointer-events:none">
          <b style="color:${theme.accent}">Grab the landscape:</b> drag the <b>hilltop</b> down to open the gate (Vg), the <b>drain ledge</b> to tilt it (Vds)${hasLg ? ', or <b>stretch the hill base</b> sideways to change gate length' : ''}. Sliders below do the same.
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
  let revealDismissed = false;
  let interactionCount = 0;

  // ---------- animation loop ----------
  let lastT = performance.now();
  function frame(now: number): void {
    if (!canvas.isConnected) return; // scene unmounted
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    stepCrowd(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  function stepCrowd(dt: number): void {
    const eb = barrierHeight_eV(params, { vg_V: bias.vg, vds_V: bias.vds });
    const rate = arrivalRate(params, { vg_V: bias.vg, vds_V: bias.vds });
    // cube-root compression: rate 1 → 6 balls/s, 1e-4 → ~0.3/s, 1e-9 → ~0.006/s
    const visRate = 6 * Math.cbrt(rate);
    crossAcc += visRate * dt;
    while (crossAcc >= 1) {
      crossAcc -= 1;
      // launch the next ball whose energy clears the barrier (round-robin)
      for (let k = 0; k < balls.length; k++) {
        const b = balls[(nextCross + k) % balls.length]!;
        if (b.crossing === null && b.e_eV > eb) {
          b.crossing = 0;
          nextCross = (nextCross + k + 1) % balls.length;
          break;
        }
      }
    }
    for (const b of balls) {
      if (b.crossing !== null) {
        b.crossing += dt * 0.9;
        if (b.crossing >= 1) {
          b.crossing = null;
          arrivals++;
        }
      }
    }
  }

  // ---------- drawing ----------
  function draw(now: number): void {
    if (W < 60 || H < 60) return;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    const biasNow = { vg_V: bias.vg, vds_V: bias.vds };
    const prof = terrainProfile(params, biasNow, 101);
    const eb = barrierHeight_eV(params, biasNow);
    const { eMin } = eRange();

    // clip the landscape to the plot area (the drain cliff exits below)
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, W - M.l - M.r, H - M.t - M.b);
    ctx.clip();
    // depth strips (pseudo-3D extrusion, back to front)
    for (let d = 3; d >= 0; d--) {
      const off = { x: d * 9, y: -d * 11 };
      const shade = 0.32 + 0.17 * (3 - d);
      ctx.fillStyle = `rgba(${Math.round(34 * shade * 2)},${Math.round(48 * shade * 2)},${Math.round(79 * shade * 2)},1)`;
      ctx.beginPath();
      ctx.moveTo(px(0) + off.x, py(eMin - 0.3) + off.y);
      for (const p of prof) ctx.lineTo(px(p.x_frac) + off.x, py(p.e_eV) + off.y);
      ctx.lineTo(px(1) + off.x, py(eMin - 0.3) + off.y);
      ctx.closePath();
      ctx.fill();
      if (d === 0) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        prof.forEach((p, i) => {
          const s = { x: px(p.x_frac), y: py(p.e_eV) };
          i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
    }
    ctx.restore(); // end plot clip
    // energy axis
    ctx.strokeStyle = theme.stroke;
    ctx.fillStyle = theme.textDim;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    const { eMax } = eRange();
    for (let e = Math.ceil(eMin * 10) / 10; e <= eMax; e += 0.1) {
      const y = py(e);
      ctx.fillText(`${(e * 1000).toFixed(0)}`, M.l - 6, y + 3);
      ctx.beginPath();
      ctx.moveTo(M.l - 3, y);
      ctx.lineTo(M.l, y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(14, (H - M.t - M.b) / 2 + M.t);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('electron energy (meV)', 0, 0);
    ctx.restore();
    // region labels
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.textDim;
    ctx.font = '12px system-ui';
    ctx.fillText('SOURCE — thermal crowd', px(0.13), py(0) - 10);
    ctx.fillText(`DRAIN (floor −${(bias.vds * 1000).toFixed(0)} meV)`, px(0.88), py(drainHandleE()) - 24);
    // barrier annotation (the scored physics, visible)
    const peakY = py(eb);
    ctx.strokeStyle = 'rgba(230,237,243,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px(0.5), peakY);
    ctx.lineTo(px(0.72), peakY);
    ctx.moveTo(px(0.5), py(0));
    ctx.lineTo(px(0.72), py(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui';
    ctx.fillText(`barrier ${(eb * 1000).toFixed(0)} meV = ${(eb / (thermalVoltage(params.temperature_K) * Math.LN10)).toFixed(1)} decades`, px(0.73), (peakY + py(0)) / 2);
    // gate-wrap walls around the hill
    drawWalls();
    // hilltop + drain grab handles
    handle(px(0.5), peakY, theme.accent, '↕ Vg');
    handle(px(0.93), py(drainHandleE()), theme.accentWarm, '↕ Vds');
    if (setup.controls.gateLength_m) {
      ctx.fillStyle = 'rgba(230,237,243,0.75)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`↔ gate ${si(Number(values.gateLength_m ?? params.gateLength_m), 'm')}`, px(0.5), py(0) + 20);
    }
    // ball crowd
    const jitterY = py(0);
    for (const b of balls) {
      let sx: number;
      let sy: number;
      if (b.crossing === null) {
        const jx = b.baseX + 0.012 * Math.sin(now / 300 + b.phase);
        // hotter balls bounce higher (energy is real, motion is theater)
        const bounce = Math.min(34, 340 * b.e_eV) * Math.abs(Math.sin(now / (260 + 40 * Math.sin(b.phase)) + b.phase));
        sx = px(jx);
        sy = jitterY - 4 - bounce;
      } else {
        const xf = 0.16 + b.crossing * 0.84;
        const idx = Math.min(100, Math.max(0, Math.round(xf * 100)));
        sx = px(xf);
        sy = Math.min(py(prof[idx]!.e_eV) - 5, H - M.b - 6); // cliff exits the window
      }
      ctx.fillStyle = b.crossing !== null ? theme.good : 'rgba(230,237,243,0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // instruments: exact numbers next to the theater
    const id = drainCurrent(params, bias.vg, bias.vds);
    ctx.fillStyle = 'rgba(20,29,48,0.92)';
    ctx.fillRect(M.l, 6, Math.min(340, W - M.l - M.r), 40);
    ctx.fillStyle = theme.text;
    ctx.font = '700 13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Id = ${si(id, 'A')} at Vg ${(bias.vg * 1000).toFixed(0)} mV, Vds ${(bias.vds * 1000).toFixed(0)} mV`, M.l + 10, 22);
    ctx.fillStyle = theme.textDim;
    ctx.font = '11px system-ui';
    ctx.fillText(`arrivals ${arrivals} · crowd pace compressed, meters exact`, M.l + 10, 39);
    // tunneling theater: when gate leakage dominates, balls cheat through the wall
    const m = evaln.metrics;
    if ((m.gateLeakage_A ?? 0) > 0.2 * (m.ioff_A ?? 1) && Math.floor(now / 900) % 3 === 0) {
      const tx = px(0.5 + 0.06 * Math.sin(now / 900));
      const ty = py(eb * 0.4);
      ctx.strokeStyle = theme.accentWarm;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 8 + 4 * Math.sin(now / 90), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = theme.accentWarm;
      ctx.font = '700 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('tunneled!', tx, ty - 14);
    }
    // probe tooltip: the Boltzmann arithmetic at the current barrier
    if (performance.now() < probeUntil) {
      const kt = thermalVoltage(params.temperature_K);
      const frac = Math.exp(-eb / kt);
      ctx.fillStyle = 'rgba(20,29,48,0.95)';
      ctx.fillRect(px(0.32), peakY - 66, 300, 52);
      ctx.fillStyle = theme.text;
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`P(ball over barrier) = exp(−Eb/kT) = ${frac < 0.001 ? frac.toExponential(1) : frac.toFixed(3)}`, px(0.32) + 8, peakY - 48);
      ctx.fillText(`Eb = ${(eb * 1000).toFixed(0)} meV, kT = ${(kt * 1000).toFixed(1)} meV`, px(0.32) + 8, peakY - 30);
    }
    if (insetVisible()) drawIdVgInset();
  }

  function drawWalls(): void {
    const arch = params.arch;
    const sides = arch === 'planar' ? 1 : arch === 'finfet' ? 3 : 4;
    const cx = px(0.5);
    const hw = 54;
    const topY = py(barrierHeight_eV(params, { vg_V: bias.vg, vds_V: bias.vds })) - 16;
    ctx.strokeStyle = 'rgba(76,201,240,0.65)';
    ctx.lineWidth = 3;
    // bottom gate (always)
    ctx.beginPath();
    ctx.moveTo(cx - hw, py(0) + 26);
    ctx.lineTo(cx + hw, py(0) + 26);
    ctx.stroke();
    if (sides >= 3) {
      ctx.beginPath();
      ctx.moveTo(cx - hw, py(0) + 26);
      ctx.lineTo(cx - hw, topY);
      ctx.moveTo(cx + hw, py(0) + 26);
      ctx.lineTo(cx + hw, topY);
      ctx.stroke();
    }
    if (sides === 4) {
      ctx.beginPath();
      ctx.moveTo(cx - hw, topY);
      ctx.lineTo(cx + hw, topY);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(76,201,240,0.8)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`gate fences ${sides} side${sides > 1 ? 's' : ''} (${archLabel(arch)})`, cx, py(0) + 42);
  }

  function handle(x: number, y: number, color: string, label: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 19);
  }

  function drawIdVgInset(): void {
    const iw = Math.min(230, W * 0.32);
    const ih = 130;
    const x0 = W - iw - 14;
    const y0 = 52; // top-right: the drain ledge + Vds handle own the bottom-right
    ctx.fillStyle = 'rgba(14,23,48,0.94)';
    ctx.fillRect(x0, y0, iw, ih);
    ctx.strokeStyle = theme.stroke;
    ctx.strokeRect(x0, y0, iw, ih);
    const curve = idVgCurve(params, bias.vds, { from_V: 0, to_V: params.vdd_V, points: 50 });
    const logs = curve.map((p) => Math.log10(Math.max(p.id_A, 1e-14)));
    const lmin = Math.min(...logs);
    const lmax = Math.max(...logs);
    ctx.strokeStyle = theme.curveHigh;
    ctx.lineWidth = 2;
    ctx.beginPath();
    curve.forEach((p, i) => {
      const sx = x0 + 10 + ((iw - 20) * p.vg_V) / params.vdd_V;
      const sy = y0 + ih - 22 - ((ih - 40) * (logs[i]! - lmin)) / (lmax - lmin || 1);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.stroke();
    // operating point
    const opx = x0 + 10 + ((iw - 20) * bias.vg) / params.vdd_V;
    const opl = Math.log10(Math.max(drainCurrent(params, bias.vg, bias.vds), 1e-14));
    const opy = y0 + ih - 22 - ((ih - 40) * (opl - lmin)) / (lmax - lmin || 1);
    ctx.fillStyle = theme.accentWarm;
    ctx.beginPath();
    ctx.arc(opx, opy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.textDim;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('log Id vs Vg — you are the orange dot', x0 + 10, y0 + 14);
  }

  // ---------- hooks ----------
  const hooks: TerrainHooks = {
    setValue: (key, value) => {
      if (tutor.beat === 'intro' || tutor.beat === 'predict') return;
      maybeReveal();
      interactionCount++;
      values = { ...values, [key]: value };
      applyValues();
      renderOverlays();
    },
    setBias: (vg, vds) => {
      interactionCount++;
      bias = { vg: Math.max(0, Math.min(params.vdd_V, vg)), vds: Math.max(0.02, Math.min(params.vdd_V, vds)) };
      biasChanged();
      renderOverlays();
    },
    choose: (i) => {
      if (tutor.beat !== 'predict') return;
      chosen = i;
      tutor = commitPrediction(tutor, { choice: i }, 'choose');
      maybeReveal();
      renderOverlays();
    },
    commitPrediction: () => {
      if (tutor.beat !== 'predict') return;
      tutor = commitPrediction(tutor, { choice: chosen ?? -1 }, level.prediction!.kind);
      renderOverlays();
    },
    dismissIntro: () => {
      tutor = dismissIntro(level, tutor);
      renderOverlays();
    },
    state: () => ({
      beat: tutor.beat,
      metrics: { ...evaln.metrics },
      passed: evaln.passed,
      stars: evaln.stars,
      values: { ...values },
      bias: { vg: bias.vg, vds: bias.vds },
    }),
  };

  applyValues();
  biasChanged();
  renderOverlays();
  resize();
  requestAnimationFrame(frame);
  return hooks;
}

// ---------- module helpers ----------
function archLabel(a: string): string {
  return a === 'planar' ? 'planar ▁' : a === 'finfet' ? 'FinFET ⊓' : 'GAA ▣';
}
function controlLabel(key: string): string {
  const names: Record<string, string> = {
    gateLength_m: 'gate length',
    eot_m: 'oxide (EOT)',
    bodyThickness_m: 'body thickness',
    sheetWidth_m: 'sheet width',
    vth0_V: 'Vth0',
    vdd_V: 'Vdd',
    temperature_K: 'temperature',
  };
  return names[key] ?? key;
}
function fmtParam(key: string, v: number): string {
  if (key === 'temperature_K') return `${v.toFixed(0)} K`;
  if (key.endsWith('_V')) return `${(v * 1000).toFixed(0)} mV`;
  return si(v, 'm');
}
function fmtMetric(metric: string, v: number): string {
  switch (metric) {
    case 'ionOverIoff':
      return ratio(v);
    case 'ss_VperDec':
      return perDecade(v);
    case 'dibl_VperV':
      return perVolt(v);
    case 'leakagePower_W':
      return si(v, 'W');
    default:
      return si(v, 'A');
  }
}
/** Numeric control ↔ 0..1000 range input (ui/slider.ts does the scales). */
function numToSlider(spec: NumericControl, v: number): number {
  return Math.round(valueToSlider(v, spec) * 1000);
}
function sliderToNum(spec: NumericControl, s: number): number {
  return sliderToValue(s / 1000, spec);
}
