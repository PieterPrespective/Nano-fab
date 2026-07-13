/**
 * NF03 shell: the chapter map. Hosts schema-v2 scene runtimes (Ch1 particle
 * chamber for now) and hands off to the phase-1 canvas app for the classic
 * device lab (strangler pattern — the legacy path dies when Ch2 re-stages
 * land). Menus are plain DOM; scenes own their canvases.
 */

import { parseLevelV2, type LevelV2 } from '../engine/levels2';
import {
  loadProgress,
  recordPrediction,
  recordResult,
  saveProgress,
  type Progress,
  type ProgressStore,
} from '../engine/progress';
import { rawLevelsV2 } from '../levels/index';
import { theme } from '../render/theme';
import { startApp } from './app';
import { chapterMastery, chapterUnlocked } from './mastery';
import { mountChamberScene, type ChamberHooks } from './scenes/chamberScene';

const CHAPTERS: Array<{ n: number; title: string; blurb: string; ready: boolean }> = [
  { n: 1, title: 'Motion & Charge', blurb: 'Fields move electrons like gravity moves planets — steer them.', ready: true },
  { n: 2, title: 'Hills & Barriers', blurb: 'The transistor as a landscape you can grab. (in development)', ready: false },
  { n: 3, title: 'Waves & Light', blurb: 'Why 13.5 nm — interference, diffraction, the blur limit.', ready: false },
  { n: 4, title: 'Counting Photons', blurb: 'Dose, shot noise, and the ragged edge.', ready: false },
  { n: 5, title: 'The Machine', blurb: 'Jerk, settling, and wafers per hour — your home turf.', ready: false },
  { n: 6, title: 'The Fab', blurb: 'Build a transistor from blank silicon, step by step in 3D.', ready: false },
];

export interface ShellHooks {
  openChapter(n: number): void;
  openLevel(id: string): ChamberHooks | null;
  openLegacy(): void;
  home(): void;
  state(): { screen: string; levelId?: string };
}

export function startShell(root: HTMLElement): ShellHooks {
  const store: ProgressStore = {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
  };
  const loaded = loadProgress(store);
  let progress: Progress = loaded.progress;
  const readOnly = loaded.readOnly;
  const persist = (): void => {
    if (!readOnly) saveProgress(store, progress);
  };

  const levels: LevelV2[] = rawLevelsV2.map(parseLevelV2);
  const byChapter: Record<number, string[]> = {};
  for (const l of levels) (byChapter[l.chapter] ??= []).push(l.id);

  let screen: 'chapters' | 'levels' | 'scene' | 'legacy' = 'chapters';
  let currentChapter = 1;
  let currentLevel: string | undefined;
  let sceneHooks: ChamberHooks | null = null;

  function renderChapters(): void {
    screen = 'chapters';
    currentLevel = undefined;
    sceneHooks = null;
    const cards = CHAPTERS.map((c) => {
      const unlocked = c.ready && chapterUnlocked(c.n, progress, byChapter);
      const mastery = Math.round(chapterMastery(c.n, progress) * 100);
      const cleared = (byChapter[c.n] ?? []).filter((id) => (progress.levels[id]?.stars ?? 0) > 0).length;
      const total = (byChapter[c.n] ?? []).length;
      return `
        <button data-ch="${c.n}" ${unlocked ? '' : 'disabled'}
          style="text-align:left;background:${unlocked ? theme.panelRaised : theme.panel};border:1px solid ${theme.stroke};
                 border-radius:12px;padding:14px 16px;color:${unlocked ? theme.text : theme.textDim};cursor:${unlocked ? 'pointer' : 'default'}">
          <div style="font-size:12px;font-weight:600;color:${unlocked ? theme.accent : theme.textDim}">CHAPTER ${c.n}${c.ready ? '' : ' · coming soon'}</div>
          <div style="font-size:17px;font-weight:700;margin:4px 0">${c.title}</div>
          <div style="font-size:13px;color:${theme.textDim}">${c.blurb}</div>
          ${total ? `<div style="font-size:12px;margin-top:6px;color:${theme.textDim}">${cleared}/${total} cleared · understanding ${mastery}%</div>` : ''}
        </button>`;
    }).join('');
    root.innerHTML = `
      <div style="min-height:100%;background:${theme.bg};color:${theme.text};font-family:system-ui;padding:18px;box-sizing:border-box;overflow:auto">
        <div style="display:flex;align-items:baseline;gap:12px">
          <div style="font-size:26px;font-weight:700">NanoFab</div>
          <div style="color:${theme.textDim};font-size:13px">from a thrown ball to an EUV scanner</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:16px">
          ${cards}
          <button data-legacy style="text-align:left;background:${theme.panelRaised};border:1px solid ${theme.stroke};border-radius:12px;padding:14px 16px;color:${theme.text};cursor:pointer">
            <div style="font-size:12px;font-weight:600;color:${theme.accentWarm}">DEVICE LAB</div>
            <div style="font-size:17px;font-weight:700;margin:4px 0">Classic Layer 1 (phase 1)</div>
            <div style="font-size:13px;color:${theme.textDim}">The original six Id–Vg puzzles, until Chapter 2 re-stages them.</div>
          </button>
        </div>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('button[data-ch]').forEach((b) => {
      b.onclick = () => hooks.openChapter(Number(b.dataset.ch));
    });
    (root.querySelector('button[data-legacy]') as HTMLButtonElement).onclick = () => hooks.openLegacy();
  }

  function renderLevels(chapter: number): void {
    screen = 'levels';
    currentChapter = chapter;
    const chapterLevels = levels.filter((l) => l.chapter === chapter);
    const items = chapterLevels
      .map((l, i) => {
        const stars = progress.levels[l.id]?.stars ?? 0;
        const locked = i > 0 && (progress.levels[chapterLevels[i - 1]!.id]?.stars ?? 0) === 0;
        return `
          <button data-level="${l.id}" ${locked ? 'disabled' : ''}
            style="text-align:left;background:${locked ? theme.panel : theme.panelRaised};border:1px solid ${theme.stroke};
                   border-radius:12px;padding:14px 16px;color:${locked ? theme.textDim : theme.text};cursor:${locked ? 'default' : 'pointer'}">
            <div style="font-size:12px;font-weight:600;color:${locked ? theme.textDim : theme.accent}">LEVEL ${i + 1}</div>
            <div style="font-size:16px;font-weight:700;margin:4px 0">${locked ? 'Locked' : l.title}</div>
            <div style="color:${theme.star};font-size:15px">${'★'.repeat(stars)}<span style="color:${theme.stroke}">${'★'.repeat(3 - stars)}</span></div>
          </button>`;
      })
      .join('');
    root.innerHTML = `
      <div style="min-height:100%;background:${theme.bg};color:${theme.text};font-family:system-ui;padding:18px;box-sizing:border-box;overflow:auto">
        <div style="display:flex;align-items:center;gap:12px">
          <button data-back style="background:${theme.panelRaised};color:${theme.text};border:1px solid ${theme.stroke};border-radius:8px;padding:8px 14px;font-weight:600">‹ Chapters</button>
          <div style="font-size:20px;font-weight:700">Chapter ${chapter} — ${CHAPTERS[chapter - 1]?.title ?? ''}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px">${items}</div>
      </div>`;
    (root.querySelector('button[data-back]') as HTMLButtonElement).onclick = () => renderChapters();
    root.querySelectorAll<HTMLButtonElement>('button[data-level]').forEach((b) => {
      b.onclick = () => hooks.openLevel(b.dataset.level!);
    });
  }

  function openScene(level: LevelV2): ChamberHooks {
    screen = 'scene';
    currentLevel = level.id;
    sceneHooks = mountChamberScene(root, level, {
      onResult: ({ stars }) => {
        progress = recordResult(progress, level.id, stars, {});
        persist();
      },
      onPrediction: (nodes, score) => {
        progress = recordPrediction(progress, nodes, score);
        persist();
      },
      onExit: () => renderLevels(level.chapter),
    });
    return sceneHooks;
  }

  const hooks: ShellHooks = {
    openChapter: (n) => renderLevels(n),
    openLevel: (id) => {
      const level = levels.find((l) => l.id === id);
      return level ? openScene(level) : null;
    },
    openLegacy: () => {
      screen = 'legacy';
      startApp(root, () => {
        // reload progress: the legacy app writes to the same store
        progress = loadProgress(store).progress;
        renderChapters();
      });
    },
    home: () => renderChapters(),
    state: () => ({ screen, levelId: currentLevel }),
  };

  renderChapters();
  (window as unknown as { __nanofab2?: ShellHooks & { scene: () => ChamberHooks | null } }).__nanofab2 = {
    ...hooks,
    scene: () => sceneHooks,
  };
  return hooks;
}
