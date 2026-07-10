/**
 * Post-build step: inject the precache manifest into dist/sw.js.
 *
 * Scans dist/ for every built file, computes a content-hash version, and
 * replaces the __PRECACHE_MANIFEST__ token. File URLs are relative ('./…')
 * so they resolve against the service-worker scope and work under any base
 * path (GitHub Pages serves from /Nano-fab/). No dependencies.
 *
 * Usage: node scripts/inject-sw-precache.mjs [distDir]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TOKEN = '__PRECACHE_MANIFEST__';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function injectPrecache(distDir) {
  const swPath = join(distDir, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  if (!sw.includes(TOKEN)) {
    throw new Error(`${swPath} does not contain ${TOKEN} — already injected, or wrong file`);
  }

  const files = walk(distDir)
    .map((f) => relative(distDir, f).split(sep).join('/'))
    .filter((f) => f !== 'sw.js') // the SW itself must never be cached by itself
    .sort();

  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(readFileSync(join(distDir, f)));
  }
  const version = hash.digest('hex').slice(0, 8);

  const urls = ['./', ...files.map((f) => `./${f}`)];
  const manifest = { version, files: urls };
  // replaceAll: the token must not survive anywhere (a stray occurrence in a
  // comment once shadowed the real one and broke the SW at runtime).
  writeFileSync(swPath, sw.replaceAll(TOKEN, JSON.stringify(manifest)));
  return manifest;
}

// CLI entry (skipped when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? 'dist';
  const manifest = injectPrecache(dist);
  console.log(`sw.js precache injected: version ${manifest.version}, ${manifest.files.length} URLs`);
}
