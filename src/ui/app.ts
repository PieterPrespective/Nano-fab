/**
 * NanoFab application shell: screen state machine, canvas rendering, and
 * touch-first pointer input. Deliberately thin — physics lives in
 * src/physics, game rules in src/engine; this file owns pixels and events.
 */

import {
  evaluate,
  loadLevelList,
  loadProgress,
  parseCodex,
  recordResult,
  resolveParams,
  saveProgress,
  type CodexEntry,
  type Evaluation,
  type Level,
  type NumericControl,
  type PlayerValues,
  type Progress,
  type ProgressStore,
} from '../engine/index';
import { idVgCurve, type DeviceParams } from '../physics/device';
import { currentRange, logTicks, projectCurve, projectPoint, type Rect } from '../render/plot';
import { theme } from '../render/theme';
import { ellipsize, wrapText } from '../render/text';
import { rawCodex, rawLevels } from '../levels/index';
import { perDecade, perVolt, ratio, si } from './format';
import { playLayout } from './layout';
import { sliderToValue, valueToSlider } from './slider';

// --- display names -------------------------------------------------------

const PARAM_LABEL: Record<string, string> = {
  gateLength_m: 'Gate length',
  eot_m: 'Oxide (EOT)',
  bodyThickness_m: 'Body thickness',
  sheetWidth_m: 'Sheet width',
  nStack: 'Sheets / fins',
  vth0_V: 'Vth0',
  vdd_V: 'VDD',
  temperature_K: 'Temperature',
};

const ARCH_LABEL: Record<string, string> = { planar: 'Planar', finfet: 'FinFET', gaa: 'GAA' };

function formatParam(key: string, value: number): string {
  if (key === 'nStack') return String(Math.round(value));
  if (key.endsWith('_m')) return si(value, 'm');
  if (key.endsWith('_V')) return si(value, 'V');
  if (key.endsWith('_K')) return `${Math.round(value)} K`;
  return si(value, '');
}

function formatMetric(key: string, value: number): string {
  switch (key) {
    case 'ionOverIoff':
      return ratio(value);
    case 'ss_VperDec':
      return perDecade(value);
    case 'dibl_VperV':
      return perVolt(value);
    case 'leakagePower_W':
      return si(value, 'W');
    default:
      return si(value, 'A');
  }
}

// --- input plumbing ------------------------------------------------------

type HitRegion =
  | { kind: 'tap'; rect: Rect; action: () => void }
  | { kind: 'slider'; rect: Rect; key: string; spec: NumericControl }
  | { kind: 'vscroll'; rect: Rect };

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// --- screens -------------------------------------------------------------

interface PlayState {
  kind: 'play';
  level: Level;
  values: PlayerValues;
  evaln: Evaluation;
  showIntro: boolean;
  overlayDismissed: boolean;
}

type Screen = { kind: 'select' } | { kind: 'codex'; scrollY: number } | PlayState;

export interface AppDebugHooks {
  openLevel(id: string): void;
  setValue(key: string, value: number | string): void;
  getState(): { screen: string; levelId?: string; passed?: boolean; stars?: number };
  regions(): Array<{ kind: string; rect: Rect; key?: string }>;
}

export function startApp(root: HTMLElement, onExit?: () => void): AppDebugHooks {
  const levels = loadLevelList(rawLevels);
  const codex: CodexEntry[] = parseCodex(rawCodex);

  const store: ProgressStore = {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
  };
  const loaded = loadProgress(store);
  let progress: Progress = loaded.progress;
  const progressReadOnly = loaded.readOnly;

  root.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  let screen: Screen = { kind: 'select' };
  let regions: HitRegion[] = [];
  let dragging: { key: string; spec: NumericControl; rect: Rect } | null = null;
  let scrollDrag: { startY: number; startScroll: number } | null = null;
  let width = 0;
  let height = 0;
  let renderQueued = false;

  // ----- helpers ----------------------------------------------------------

  function unlockedCount(): number {
    let n = 1;
    while (n < levels.length && (progress.levels[levels[n - 1]!.id]?.stars ?? 0) > 0) n++;
    return n;
  }

  function unlockedCodexIds(): Set<string> {
    const ids = new Set<string>();
    for (const level of levels) {
      if ((progress.levels[level.id]?.stars ?? 0) > 0) level.codex.forEach((c) => ids.add(c));
    }
    return ids;
  }

  function openLevel(level: Level): void {
    const best = progress.levels[level.id]?.bestValues;
    const values: PlayerValues = {};
    for (const [key, spec] of Object.entries(level.controls)) {
      const remembered = best?.[key];
      values[key] = remembered !== undefined ? remembered : spec.kind === 'enum' ? spec.init : spec.init;
    }
    const params = resolveParams(level, values);
    screen = {
      kind: 'play',
      level,
      values,
      evaln: evaluate(level, params),
      showIntro: true,
      overlayDismissed: false,
    };
    requestRender();
  }

  function setValue(s: PlayState, key: string, value: number | string): void {
    s.values[key] = value;
    const wasPassed = s.evaln.passed;
    s.evaln = evaluate(s.level, resolveParams(s.level, s.values));
    if (s.evaln.passed) {
      if (!progressReadOnly) {
        const next = recordResult(progress, s.level.id, s.evaln.stars, s.values);
        if (next !== progress) {
          progress = next;
          saveProgress(store, progress);
        }
      }
      if (!wasPassed) s.overlayDismissed = false; // fresh pass ⇒ celebrate
    }
    requestRender();
  }

  // ----- drawing primitives -----------------------------------------------

  function panel(r: Rect, fill: string = theme.panel): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
  }

  function button(r: Rect, label: string, action: () => void, opts?: { primary?: boolean }): void {
    panel(r, opts?.primary ? theme.accent : theme.panelRaised);
    ctx.fillStyle = opts?.primary ? '#08121f' : theme.text;
    ctx.font = theme.font(15, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    regions.push({ kind: 'tap', rect: r, action });
  }

  function stars(n: number, x: number, y: number, size = 16): void {
    ctx.font = theme.font(size);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < n ? theme.star : theme.stroke;
      ctx.fillText('★', x + i * (size + 2), y);
    }
  }

  // ----- select screen ----------------------------------------------------

  function renderSelect(): void {
    const unlocked = unlockedCount();
    let titleX = 20;
    if (onExit) {
      button({ x: 16, y: 16, w: 44, h: 40 }, '‹', onExit);
      titleX = 72;
    }
    ctx.fillStyle = theme.text;
    ctx.font = theme.font(26, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('NanoFab', titleX, 18);
    ctx.font = theme.font(14);
    ctx.fillStyle = theme.textDim;
    ctx.fillText('Layer 1 — build a transistor that actually switches', titleX, 52);

    const codexBtn: Rect = { x: width - 110, y: 16, w: 94, h: 40 };
    button(codexBtn, 'Codex', () => {
      screen = { kind: 'codex', scrollY: 0 };
      requestRender();
    });

    const cols = Math.max(1, Math.min(3, Math.floor(width / 340)));
    const gap = 14;
    const cardW = (width - 40 - gap * (cols - 1)) / cols;
    const cardH = 116;
    levels.forEach((level, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r: Rect = { x: 20 + col * (cardW + gap), y: 86 + row * (cardH + gap), w: cardW, h: cardH };
      const isUnlocked = i < unlocked;
      panel(r, isUnlocked ? theme.panelRaised : theme.panel);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = theme.font(13, 600);
      ctx.fillStyle = isUnlocked ? theme.accent : theme.textDim;
      ctx.fillText(`LEVEL ${i + 1}`, r.x + 16, r.y + 14);
      ctx.font = theme.font(17, 600);
      ctx.fillStyle = isUnlocked ? theme.text : theme.textDim;
      ctx.fillText(ellipsize(ctx, isUnlocked ? level.title : 'Locked', r.w - 32), r.x + 16, r.y + 36);
      if (isUnlocked) {
        stars(progress.levels[level.id]?.stars ?? 0, r.x + 16, r.y + 78);
        regions.push({ kind: 'tap', rect: r, action: () => openLevel(level) });
      } else {
        ctx.font = theme.font(13);
        ctx.fillStyle = theme.textDim;
        ctx.fillText(`Clear level ${i} to unlock`, r.x + 16, r.y + 72);
      }
    });
  }

  // ----- codex screen -----------------------------------------------------

  function renderCodex(s: { kind: 'codex'; scrollY: number }): void {
    const backBtn: Rect = { x: 16, y: 16, w: 94, h: 40 };
    const unlockedIds = unlockedCodexIds();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 68, width, height - 68);
    ctx.clip();

    let y = 84 - s.scrollY;
    const textW = Math.min(width - 72, 640);
    for (const entry of codex) {
      const isOpen = unlockedIds.has(entry.id);
      ctx.font = theme.font(17, 700);
      const bodyLines = isOpen ? wrapText(ctx2(14), entry.body, textW) : [];
      const nums = isOpen ? entry.realNumbers : [];
      const cardH = 46 + bodyLines.length * 20 + nums.length * 22 + (isOpen ? 16 : 0);
      const r: Rect = { x: 20, y, w: width - 40, h: cardH };
      panel(r, isOpen ? theme.panelRaised : theme.panel);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = theme.font(17, 700);
      ctx.fillStyle = isOpen ? theme.text : theme.textDim;
      ctx.fillText(isOpen ? entry.title : '??? — clear more levels', r.x + 16, r.y + 14);
      if (isOpen) {
        ctx.font = theme.font(14);
        ctx.fillStyle = theme.textDim;
        bodyLines.forEach((line, i) => ctx.fillText(line, r.x + 16, r.y + 44 + i * 20));
        ctx.font = theme.font(13, 600);
        ctx.fillStyle = theme.accent;
        nums.forEach((n, i) =>
          ctx.fillText(`▸ ${n}`, r.x + 16, r.y + 48 + bodyLines.length * 20 + i * 22),
        );
      }
      y += cardH + 12;
    }
    ctx.restore();

    const contentH = y + s.scrollY;
    regions.push({ kind: 'vscroll', rect: { x: 0, y: 68, w: width, h: height - 68 } });
    (s as { scrollMax?: number }).scrollMax = Math.max(0, contentH - height + 20);

    // Header drawn last so scrolled content passes under it.
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, 68);
    button(backBtn, '‹ Back', () => {
      screen = { kind: 'select' };
      requestRender();
    });
    ctx.fillStyle = theme.text;
    ctx.font = theme.font(20, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Codex — real numbers', 126, 36);

    function ctx2(px: number): CanvasRenderingContext2D {
      ctx.font = theme.font(px);
      return ctx;
    }
  }

  // ----- play screen ------------------------------------------------------

  function renderPlay(s: PlayState): void {
    const nControls = Object.keys(s.level.controls).length;
    const layout = playLayout(width, height, nControls);
    const params = resolveParams(s.level, s.values);

    // Header
    button({ x: 16, y: 6, w: 92, h: 36 }, '‹ Levels', () => {
      screen = { kind: 'select' };
      requestRender();
    });
    ctx.fillStyle = theme.text;
    ctx.font = theme.font(17, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ellipsize(ctx, s.level.title, width - 240), 122, 24);
    stars(progress.levels[s.level.id]?.stars ?? 0, width - 76, 24);

    renderPlot(s, params, insetRect(layout.plot, 10));
    renderMetrics(s, insetRect(layout.metrics, 10));
    renderControls(s, layout.controlRows);

    if (s.showIntro) renderIntroOverlay(s);
    else if (s.evaln.passed && !s.overlayDismissed) renderResultOverlay(s);
  }

  function insetRect(r: Rect, pad: number): Rect {
    return { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad };
  }

  function renderPlot(s: PlayState, params: DeviceParams, r: Rect): void {
    panel(r);
    const margin = { left: 64, right: 14, top: 26, bottom: 34 };
    const inner: Rect = {
      x: r.x + margin.left,
      y: r.y + margin.top,
      w: r.w - margin.left - margin.right,
      h: r.h - margin.top - margin.bottom,
    };
    const vdd = params.vdd_V;
    const high = idVgCurve(params, vdd, { from_V: 0, to_V: vdd, points: 80 });
    const low = idVgCurve(params, 0.05, { from_V: 0, to_V: vdd, points: 80 });
    const range = currentRange([
      ...high.map((p) => p.id_A),
      ...low.map((p) => p.id_A),
      s.evaln.metrics.ioff_A,
    ]);
    const vp = { rect: inner, vgMin: 0, vgMax: vdd, ...range };

    // Grid + y ticks
    ctx.strokeStyle = theme.stroke;
    ctx.fillStyle = theme.textDim;
    ctx.font = theme.font(11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (const tick of logTicks(range.idMin, range.idMax)) {
      const y = projectPoint(0, tick.value, vp).y;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(inner.x, y);
      ctx.lineTo(inner.x + inner.w, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (tick.labeled) ctx.fillText(si(tick.value, 'A', 1), inner.x - 6, y);
    }
    // x ticks: 0 … vdd (end labels align inward so nothing clips)
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const vg = (vdd * i) / 4;
      const x = inner.x + (inner.w * i) / 4;
      ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
      ctx.fillText(si(vg, 'V', 2), x, inner.y + inner.h + 8);
    }
    ctx.fillText('Vg', inner.x + inner.w / 2, r.y + r.h - 16);
    ctx.save();
    ctx.translate(r.x + 14, inner.y + inner.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText('Id (log)', 0, 0);
    ctx.restore();

    // Curves
    const drawCurve = (curve: typeof high, color: string, widthPx: number) => {
      const pts = projectCurve(curve, vp);
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    };
    drawCurve(low, theme.curveLow, 1.5);
    drawCurve(high, theme.curveHigh, 2.5);

    // Ion / Ioff markers
    const ion = projectPoint(vdd, s.evaln.metrics.ion_A, vp);
    const ioff = projectPoint(0, s.evaln.metrics.ioff_A, vp);
    ctx.fillStyle = theme.good;
    ctx.beginPath();
    ctx.arc(ion.x, ion.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.bad;
    ctx.beginPath();
    ctx.arc(ioff.x, ioff.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = theme.font(12, 600);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.good;
    ctx.fillText(`Ion ${si(s.evaln.metrics.ion_A, 'A')}`, ion.x - 6, ion.y - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.bad;
    ctx.fillText(`Ioff ${si(s.evaln.metrics.ioff_A, 'A')}`, ioff.x + 8, ioff.y - 2);

    // Legend (stacked, right-aligned)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = theme.font(11);
    ctx.fillStyle = theme.curveHigh;
    ctx.fillText(`Vds = ${si(vdd, 'V', 2)}`, inner.x + inner.w, r.y + 8);
    ctx.fillStyle = theme.curveLow;
    ctx.fillText('Vds = 50 mV', inner.x + inner.w, r.y + 24);
  }

  function renderMetrics(s: PlayState, r: Rect): void {
    const chips = s.evaln.targets;
    const gap = 8;
    const chipW = (r.w - gap * (chips.length - 1)) / chips.length;
    chips.forEach((t, i) => {
      const cr: Rect = { x: r.x + i * (chipW + gap), y: r.y, w: chipW, h: r.h };
      panel(cr, theme.panelRaised);
      ctx.strokeStyle = t.pass ? theme.good : theme.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2, 10);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = theme.font(12);
      ctx.fillStyle = theme.textDim;
      ctx.fillText(ellipsize(ctx, t.label, cr.w - 20), cr.x + 10, cr.y + 10);
      ctx.font = theme.font(16, 700);
      ctx.fillStyle = t.pass ? theme.good : theme.bad;
      ctx.fillText(
        `${formatMetric(t.metric, t.actual)} ${t.pass ? '✓' : '✗'}`,
        cr.x + 10,
        cr.y + 32,
      );
      ctx.font = theme.font(11);
      ctx.fillStyle = theme.textDim;
      const ssNote = `SS ${perDecade(s.evaln.metrics.ss_VperDec)} · DIBL ${perVolt(s.evaln.metrics.dibl_VperV)}`;
      if (i === 0) ctx.fillText(ellipsize(ctx, ssNote, cr.w - 20), cr.x + 10, cr.y + r.h - 20);
    });
  }

  function renderControls(s: PlayState, rows: Rect[]): void {
    const entries = Object.entries(s.level.controls);
    entries.forEach(([key, spec], i) => {
      const row = rows[i]!;
      const r = insetRect(row, 4);
      if (spec.kind === 'enum') {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = theme.font(13, 600);
        ctx.fillStyle = theme.textDim;
        ctx.fillText('Architecture', r.x + 4, r.y + 2);
        const btnW = (r.w - 8 * (spec.options.length - 1)) / spec.options.length;
        const btnH = Math.max(36, r.h - 26);
        spec.options.forEach((opt, j) => {
          const br: Rect = { x: r.x + j * (btnW + 8), y: r.y + 22, w: btnW, h: btnH };
          const active = (s.values[key] ?? spec.init) === opt;
          panel(br, active ? theme.accent : theme.panelRaised);
          ctx.fillStyle = active ? '#08121f' : theme.text;
          ctx.font = theme.font(14, 600);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ARCH_LABEL[opt] ?? opt, br.x + br.w / 2, br.y + br.h / 2);
          regions.push({ kind: 'tap', rect: br, action: () => setValue(s, key, opt) });
        });
      } else {
        const value = typeof s.values[key] === 'number' ? (s.values[key] as number) : spec.init;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = theme.font(13, 600);
        ctx.fillStyle = theme.textDim;
        ctx.fillText(PARAM_LABEL[key] ?? key, r.x + 4, r.y + 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = theme.accent;
        ctx.font = theme.font(14, 700);
        ctx.fillText(formatParam(key, value), r.x + r.w - 4, r.y + 2);

        const trackY = r.y + Math.max(30, r.h * 0.62);
        const track: Rect = { x: r.x + 8, y: trackY - 2, w: r.w - 16, h: 4 };
        ctx.fillStyle = theme.stroke;
        ctx.beginPath();
        ctx.roundRect(track.x, track.y, track.w, track.h, 2);
        ctx.fill();
        const t = valueToSlider(value, spec);
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.roundRect(track.x, track.y, track.w * t, track.h, 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(track.x + track.w * t, trackY, 13, 0, Math.PI * 2);
        ctx.fill();
        // Generous hit box around the whole row for fat fingers.
        regions.push({
          kind: 'slider',
          rect: { x: r.x, y: r.y, w: r.w, h: r.h },
          key,
          spec,
        });
      }
    });
  }

  function overlayPanel(maxW: number, contentH: number): Rect {
    const w = Math.min(maxW, width - 32);
    const h = Math.min(height - 64, contentH);
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
  }

  function renderIntroOverlay(s: PlayState): void {
    ctx.fillStyle = 'rgba(4,8,16,0.82)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = theme.font(15);
    const introLines = wrapText(ctx, s.level.intro, Math.min(620, width - 32) - 40);
    const contentH = 58 + introLines.length * 22 + 12 + s.level.targets.length * 24 + 76;
    const r = overlayPanel(620, contentH);
    panel(r, theme.panelRaised);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = theme.font(20, 700);
    ctx.fillStyle = theme.text;
    ctx.fillText(s.level.title, r.x + 20, r.y + 20);
    ctx.font = theme.font(15);
    ctx.fillStyle = theme.textDim;
    const lines = wrapText(ctx, s.level.intro, r.w - 40);
    lines.forEach((line, i) => ctx.fillText(line, r.x + 20, r.y + 58 + i * 22));
    const targetY = r.y + 66 + lines.length * 22;
    ctx.font = theme.font(14, 600);
    ctx.fillStyle = theme.text;
    s.level.targets.forEach((t, i) => ctx.fillText(`◦ ${t.label}`, r.x + 20, targetY + i * 24));
    button(
      { x: r.x + r.w - 140, y: r.y + r.h - 60, w: 120, h: 44 },
      'Start',
      () => {
        s.showIntro = false;
        requestRender();
      },
      { primary: true },
    );
  }

  function renderResultOverlay(s: PlayState): void {
    ctx.fillStyle = 'rgba(4,8,16,0.82)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = theme.font(14.5);
    const explainLines = wrapText(ctx, s.level.explain, Math.min(680, width - 32) - 40);
    const contentH = 82 + explainLines.length * 21 + 130;
    const r = overlayPanel(680, contentH);
    panel(r, theme.panelRaised);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = theme.font(22, 700);
    ctx.fillStyle = theme.good;
    ctx.fillText('Cleared!', r.x + 20, r.y + 18);
    stars(s.evaln.stars, r.x + 130, r.y + 32, 22);
    ctx.font = theme.font(13, 600);
    ctx.fillStyle = theme.accent;
    ctx.fillText('THE PHYSICS', r.x + 20, r.y + 58);
    ctx.font = theme.font(14.5);
    ctx.fillStyle = theme.text;
    const lines = wrapText(ctx, s.level.explain, r.w - 40);
    const maxLines = Math.floor((r.h - 170) / 21);
    lines.slice(0, maxLines).forEach((line, i) => ctx.fillText(line, r.x + 20, r.y + 82 + i * 21));
    ctx.font = theme.font(13);
    ctx.fillStyle = theme.textDim;
    const codexTitle = codex.find((c) => c.id === s.level.codex[0])?.title ?? s.level.codex[0];
    ctx.fillText(
      ellipsize(ctx, `Codex unlocked — “${codexTitle}” has the real numbers.`, r.w - 40),
      r.x + 20,
      r.y + r.h - 96,
    );
    button({ x: r.x + 20, y: r.y + r.h - 60, w: 150, h: 44 }, 'Keep tuning', () => {
      s.overlayDismissed = true;
      requestRender();
    });
    button(
      { x: r.x + r.w - 170, y: r.y + r.h - 60, w: 150, h: 44 },
      'Level select',
      () => {
        screen = { kind: 'select' };
        requestRender();
      },
      { primary: true },
    );
  }

  // ----- render loop -------------------------------------------------------

  function render(): void {
    regions = [];
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    if (screen.kind === 'select') renderSelect();
    else if (screen.kind === 'codex') renderCodex(screen);
    else renderPlay(screen);
  }

  function requestRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function resize(): void {
    width = root.clientWidth;
    height = root.clientHeight;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    requestRender();
  }
  new ResizeObserver(resize).observe(root);
  resize();

  // ----- pointer input -----------------------------------------------------

  function sliderUpdate(x: number): void {
    if (!dragging || screen.kind !== 'play') return;
    const track = { x: dragging.rect.x + 8, w: dragging.rect.w - 16 };
    const t = (x - track.x) / track.w;
    setValue(screen, dragging.key, sliderToValue(t, dragging.spec));
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const x = e.offsetX;
    const y = e.offsetY;
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i]!;
      if (!inRect(region.rect, x, y)) continue;
      if (region.kind === 'tap') {
        region.action();
        return;
      }
      if (region.kind === 'slider') {
        dragging = { key: region.key, spec: region.spec, rect: region.rect };
        sliderUpdate(x);
        return;
      }
      if (region.kind === 'vscroll' && screen.kind === 'codex') {
        scrollDrag = { startY: y, startScroll: screen.scrollY };
        return;
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      sliderUpdate(e.offsetX);
    } else if (scrollDrag && screen.kind === 'codex') {
      const max = (screen as unknown as { scrollMax?: number }).scrollMax ?? 0;
      screen.scrollY = Math.min(max, Math.max(0, scrollDrag.startScroll - (e.offsetY - scrollDrag.startY)));
      requestRender();
    }
  });

  const endDrag = () => {
    dragging = null;
    scrollDrag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (screen.kind !== 'codex') return;
      const max = (screen as unknown as { scrollMax?: number }).scrollMax ?? 0;
      screen.scrollY = Math.min(max, Math.max(0, screen.scrollY + e.deltaY));
      requestRender();
      e.preventDefault();
    },
    { passive: false },
  );

  // ----- debug hooks (used by the e2e harness; harmless in production) -----

  const hooks: AppDebugHooks = {
    openLevel: (id) => {
      const level = levels.find((l) => l.id === id);
      if (level) openLevel(level);
    },
    setValue: (key, value) => {
      if (screen.kind === 'play') {
        if (screen.showIntro) screen.showIntro = false;
        setValue(screen, key, value);
      }
    },
    getState: () =>
      screen.kind === 'play'
        ? {
            screen: 'play',
            levelId: screen.level.id,
            passed: screen.evaln.passed,
            stars: screen.evaln.stars,
          }
        : { screen: screen.kind },
    regions: () => regions.map((r) => ({ kind: r.kind, rect: r.rect, key: 'key' in r ? r.key : undefined })),
  };
  (window as unknown as { __nanofab?: AppDebugHooks }).__nanofab = hooks;
  return hooks;
}
