/**
 * Concept-mastery chapter gates (prompts/nf03/01 §5): chapters unlock on
 * understanding, not raw completion — but clearing every level of the
 * previous chapter always works too (predictions must never hard-gate).
 */

import type { ConceptNode } from '../engine/levels2';
import type { Progress } from '../engine/progress';

export const CHAPTER_NODES: Record<number, ConceptNode[]> = {
  1: ['charge-force', 'field-map'],
  2: ['scalar-field-gradient', 'potential-terrain', 'boltzmann-tail', 'tunneling', 'switch-logic'],
  3: ['superposition', 'diffraction-limit'],
  4: ['photon-shot-noise', 'rls-triangle'],
  5: ['scurve-motion', 'settling', 'overlay'],
  6: ['deposition', 'etch-anisotropy', 'implant', 'cmp', 'masking', 'yield'],
};

/** Mean mastery over a chapter's concept nodes (missing nodes count as 0). */
export function chapterMastery(chapter: number, progress: Progress): number {
  const nodes = CHAPTER_NODES[chapter] ?? [];
  if (nodes.length === 0) return 0;
  return nodes.reduce((a, n) => a + (progress.mastery[n] ?? 0), 0) / nodes.length;
}

export const GATE_MASTERY = 0.35;

/**
 * Chapter N unlocks when the previous chapter is *understood* (mastery ≥
 * GATE_MASTERY) OR fully cleared (≥1 star on every one of its levels).
 */
export function chapterUnlocked(
  chapter: number,
  progress: Progress,
  levelIdsByChapter: Record<number, string[]>,
): boolean {
  if (chapter <= 1) return true;
  const prev = chapter - 1;
  if (chapterMastery(prev, progress) >= GATE_MASTERY) return true;
  const prevLevels = levelIdsByChapter[prev] ?? [];
  return prevLevels.length > 0 && prevLevels.every((id) => (progress.levels[id]?.stars ?? 0) >= 1);
}
