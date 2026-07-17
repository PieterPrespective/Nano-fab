/**
 * NF03 shell: the chapter map. Hosts schema-v2 scene runtimes, dispatching
 * by scene type (particle-chamber / field-lab / energy-terrain). The
 * phase-1 canvas app is gone — Chapter 2 re-stages its six levels on the
 * energy terrain (strangler step 3 complete).
 */

import { parseCodex } from '../engine/codex';
import { parseLevelV2, type LevelV2 } from '../engine/levels2';
import {
  loadProgress,
  recordPrediction,
  recordResult,
  saveProgress,
  type Progress,
  type ProgressStore,
} from '../engine/progress';
import { rawCodex, rawLevelsV2 } from '../levels/index';
import { theme } from '../render/theme';
import { chapterMastery, chapterUnlocked } from './mastery';
import { mountChamberScene, type ChamberHooks } from './scenes/chamberScene';
import { mountFieldScene, type FieldHooks } from './scenes/fieldScene';
import { mountInverterScene, type InverterHooks } from './scenes/inverterScene';
import { mountTerrainScene, type TerrainHooks } from './scenes/terrainScene';

const CHAPTERS: Array<{ n: number; title: string; blurb: string; ready: boolean }> = [
  { n: 1, title: 'Motion & Charge', blurb: 'Fields move electrons like gravity moves planets — steer them.', ready: true },
  { n: 2, title: 'Hills & Barriers', blurb: 'Potential is a landscape; the transistor is a hill you can grab.', ready: true },
  { n: 3, title: 'Waves & Light', blurb: 'Why 13.5 nm — interference, diffraction, the blur limit.', ready: false },
  { n: 4, title: 'Counting Photons', blurb: 'Dose, shot noise, and the ragged edge.', ready: false },
  { n: 5, title: 'The Machine', blurb: 'Jerk, settling, and wafers per hour — your home turf.', ready: false },
  { n: 6, title: 'The Fab', blurb: 'Build a transistor from blank silicon, step by step in 3D.', ready: false },
];

export type AnySceneHooks = ChamberHooks | FieldHooks | TerrainHooks | InverterHooks;

export interface ShellHooks {
  openChapter(n: number): void;
  openLevel(id: string): AnySceneHooks | null;
  openCompendium(): void;
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

  let screen: 'chapters' | 'levels' | 'scene' | 'compendium' = 'chapters';
  let currentChapter = 1;
  let currentLevel: string | undefined;
  let sceneHooks: AnySceneHooks | null = null;

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
          <div style="font-size:12px;font-weight:600;color:${unlocked ? theme.accent : theme.textDim}">CHAPTER ${c.n}${c.ready ? (unlocked ? '' : ' · locked') : ' · coming soon'}</div>
          <div style="font-size:17px;font-weight:700;margin:4px 0">${c.title}</div>
          <div style="font-size:13px;color:${theme.textDim}">${c.blurb}</div>
          ${total ? `<div style="font-size:12px;margin-top:6px;color:${theme.textDim}">${cleared}/${total} cleared · understanding ${mastery}%</div>` : ''}
        </button>`;
    }).join('');
    root.innerHTML = `
      <div style="min-height:100%;background:${theme.bg};color:${theme.text};font-family:system-ui;padding:18px;box-sizing:border-box;overflow:auto">
        <div style="display:flex;align-items:baseline;gap:12px">
          <div style="font-size:26px;font-weight:700">NanoFab</div>
          <div style="color:${theme.textDim};font-size:13px;flex:1">from a thrown ball to an EUV scanner</div>
          <button data-compendium style="background:${theme.panelRaised};color:${theme.accent};border:1px solid ${theme.stroke};border-radius:8px;padding:8px 14px;font-weight:600">📖 Compendium</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:16px">
          ${cards}
        </div>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('button[data-ch]').forEach((b) => {
      b.onclick = () => hooks.openChapter(Number(b.dataset.ch));
    });
    (root.querySelector('button[data-compendium]') as HTMLButtonElement).onclick = () => hooks.openCompendium();
  }

  function renderCompendium(): void {
    screen = 'compendium';
    const entries = parseCodex(rawCodex);
    const cards = entries
      .map(
        (e) => `
        <div style="background:${theme.panelRaised};border:1px solid ${theme.stroke};border-radius:12px;padding:16px 18px">
          <div style="font-size:16px;font-weight:700;color:${theme.accent};margin-bottom:8px">${e.title}</div>
          <div style="font-size:14px;line-height:1.55;color:${theme.text}">${e.body}</div>
          ${e.realNumbers.length ? `<ul style="margin:10px 0 0;padding-left:18px;color:${theme.textDim};font-size:12.5px;line-height:1.6">${e.realNumbers.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
        </div>`,
      )
      .join('');
    root.innerHTML = `
      <div style="min-height:100%;background:${theme.bg};color:${theme.text};font-family:system-ui;padding:18px;box-sizing:border-box;overflow:auto">
        <div style="display:flex;align-items:center;gap:12px">
          <button data-back style="background:${theme.panelRaised};color:${theme.text};border:1px solid ${theme.stroke};border-radius:8px;padding:8px 14px;font-weight:600">‹ Chapters</button>
          <div style="font-size:20px;font-weight:700">📖 Compendium</div>
          <div style="color:${theme.textDim};font-size:13px">the terms, what they mean, and the real numbers behind them</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-top:16px;padding-bottom:24px">${cards}</div>
      </div>`;
    (root.querySelector('button[data-back]') as HTMLButtonElement).onclick = () => renderChapters();
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

  function openScene(level: LevelV2): AnySceneHooks {
    screen = 'scene';
    currentLevel = level.id;
    const callbacks = {
      onResult: ({ stars }: { stars: number }) => {
        progress = recordResult(progress, level.id, stars, {});
        persist();
      },
      onPrediction: (nodes: string[], score: number) => {
        progress = recordPrediction(progress, nodes, score);
        persist();
      },
      onExit: () => renderLevels(level.chapter),
    };
    switch (level.scene.type) {
      case 'field-lab':
        sceneHooks = mountFieldScene(root, level, callbacks);
        break;
      case 'energy-terrain':
        sceneHooks = mountTerrainScene(root, level, callbacks);
        break;
      case 'logic-inverter':
        sceneHooks = mountInverterScene(root, level, callbacks);
        break;
      default:
        sceneHooks = mountChamberScene(root, level, callbacks);
    }
    return sceneHooks;
  }

  const hooks: ShellHooks = {
    openChapter: (n) => renderLevels(n),
    openLevel: (id) => {
      const level = levels.find((l) => l.id === id);
      return level ? openScene(level) : null;
    },
    openCompendium: () => renderCompendium(),
    home: () => renderChapters(),
    state: () => ({ screen, levelId: currentLevel }),
  };

  renderChapters();
  (window as unknown as { __nanofab2?: ShellHooks & { scene: () => AnySceneHooks | null } }).__nanofab2 = {
    ...hooks,
    scene: () => sceneHooks,
  };
  return hooks;
}
