/**
 * Level + codex data entry point. Levels are bundled (not fetched), so they
 * are offline for free; the service worker precache is belt-and-braces.
 */

import codexJson from './codex.json';

const levelModules = import.meta.glob('./l1-*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

/** Raw (unvalidated) level JSON, in filename order. Parse via engine/levels. */
export const rawLevels: unknown[] = Object.keys(levelModules)
  .sort()
  .map((k) => levelModules[k]!.default);

/** Raw (unvalidated) codex JSON. Parse via engine/codex. */
export const rawCodex: unknown = codexJson;
