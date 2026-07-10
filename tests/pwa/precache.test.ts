import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line -- plain .mjs module, typed loosely on purpose
// @ts-expect-error no type declarations for the build script
import { injectPrecache } from '../../scripts/inject-sw-precache.mjs';

// Regression guard: a comment mentioning the token must not absorb the
// injection meant for the code line (String.replace vs replaceAll).
const SW_SOURCE = `/* __PRECACHE_MANIFEST__ is injected below */\nconst MANIFEST = __PRECACHE_MANIFEST__;\nconsole.log(MANIFEST.version);\n`;

function makeDist(): string {
  const dist = mkdtempSync(join(tmpdir(), 'nanofab-dist-'));
  writeFileSync(join(dist, 'index.html'), '<html>app</html>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(dist, 'manifest.webmanifest'), '{}');
  writeFileSync(join(dist, 'sw.js'), SW_SOURCE);
  return dist;
}

describe('inject-sw-precache', () => {
  it('lists every dist file (relative URLs), excluding sw.js itself, plus the scope root', () => {
    const dist = makeDist();
    const manifest = injectPrecache(dist) as { version: string; files: string[] };
    expect(manifest.files).toEqual([
      './',
      './assets/app-abc123.js',
      './index.html',
      './manifest.webmanifest',
    ]);
    expect(manifest.version).toMatch(/^[0-9a-f]{8}$/);
  });

  it('replaces the token with valid JS and leaves no token behind', () => {
    const dist = makeDist();
    injectPrecache(dist);
    const out = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(out).not.toContain('__PRECACHE_MANIFEST__');
    // The injected value must parse as JSON when extracted.
    const match = out.match(/const MANIFEST = (.*);/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!) as { version: string; files: string[] };
    expect(parsed.files.length).toBeGreaterThan(0);
  });

  it('version is stable for identical content and changes when a byte changes', () => {
    const a = makeDist();
    const b = makeDist();
    const va = (injectPrecache(a) as { version: string }).version;
    const vb = (injectPrecache(b) as { version: string }).version;
    expect(va).toBe(vb);

    const c = makeDist();
    writeFileSync(join(c, 'assets', 'app-abc123.js'), 'console.log(2)');
    const vc = (injectPrecache(c) as { version: string }).version;
    expect(vc).not.toBe(va);
  });

  it('refuses to run twice (token gone ⇒ loud failure, not silent corruption)', () => {
    const dist = makeDist();
    injectPrecache(dist);
    expect(() => injectPrecache(dist)).toThrow(/__PRECACHE_MANIFEST__/);
  });
});
