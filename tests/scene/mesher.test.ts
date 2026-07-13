import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { MESH_STRIDE, meshWafer, sectionMesh, type Mesh } from '../../src/scene/mesher';
import { etch, deposit } from '../../src/physics/process';
import { Timeline } from '../../src/scene/timeline';
import { createSubstrate, type WaferModel } from '../../src/scene/wafer';
import { GAA_RELEASE, substrate } from '../helpers/recipes';

const NM = 1e-9;

/** Compact golden: triangle count + SHA-256 of the raw vertex bytes.
 * Float ops are IEEE-754 deterministic, so the hash is stable across
 * platforms; full buffers would bloat the repo (~700 kB). */
function golden(name: string, mesh: Mesh): void {
  const path = join(__dirname, '..', 'fixtures', 'mesh', name);
  const hash = createHash('sha256').update(new Uint8Array(mesh.data.buffer)).digest('hex');
  const actual = { triangles: mesh.triangles, sha256: hash };
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(actual, null, 1));
    return;
  }
  if (!existsSync(path)) throw new Error(`missing golden ${name}; run UPDATE_GOLDEN=1 npm test`);
  expect(actual).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

function sane(mesh: Mesh): void {
  expect(mesh.data.length % (MESH_STRIDE * 3)).toBe(0);
  for (const v of mesh.data) expect(Number.isFinite(v)).toBe(true);
}

describe('meshWafer', () => {
  it('blank substrate: exactly tops + outer walls, nothing interior', () => {
    const w = createSubstrate(4, 4, 8 * NM, 100 * NM);
    const mesh = meshWafer(w);
    // 16 top quads + 16 boundary wall quads (4 per side), 2 tris each
    expect(mesh.triangles).toBe((16 + 16) * 2);
    sane(mesh);
    golden('blank.json', mesh);
  });

  it('etched trench adds step walls; triangle count stays bounded', () => {
    let w = createSubstrate(8, 8, 8 * NM, 100 * NM);
    // dig a stripe without lithography: etch everything, then re-check —
    // use a masked etch via a resist-free trick: etch full wafer shallowly
    w = etch(w, { depth_m: 30 * NM, anisotropy: 1, rates: { si: 1 } });
    const flat = meshWafer(w);
    const before = flat.triangles;
    // now a real trench via the timeline litho steps
    const tl = new Timeline(createSubstrate(8, 8, 8 * NM, 100 * NM));
    const trench = tl.run([
      { op: 'spinResist', thickness_m: 30 * NM },
      { op: 'expose', dose: 1, blurCells: 0, mask: [{ x0: 0.375, y0: 0, x1: 0.625, y1: 1 }] },
      { op: 'develop', threshold: 0.5 },
      { op: 'etch', depth_m: 40 * NM, anisotropy: 1, rates: { si: 1 } },
      { op: 'strip' },
    ]).at(-1)!;
    const mesh = meshWafer(trench);
    expect(mesh.triangles).toBeGreaterThan(before); // trench walls exist
    expect(mesh.triangles).toBeLessThan(before * 3); // and stay bounded
    sane(mesh);
    golden('trench.json', mesh);
  });

  it('cavities are meshed: released GAA sheets get ceilings and floors', () => {
    const released = new Timeline(substrate())
      .run(GAA_RELEASE.slice(0, GAA_RELEASE.length - 2))
      .at(-1)!;
    const mesh = meshWafer(released);
    sane(mesh);
    // downward-facing faces (nz = -1) exist only above air: suspended sheets
    let downFaces = 0;
    for (let v = 0; v < mesh.data.length; v += MESH_STRIDE) {
      if (mesh.data[v + 5] === -1) downFaces++;
    }
    expect(downFaces).toBeGreaterThan(0);
    golden('gaa-released.json', mesh);
  });

  it('per-face material colors come from the palette (deposit shows on top)', () => {
    const w = deposit(createSubstrate(2, 2, 8 * NM, 50 * NM), {
      material: 'metal',
      thickness_m: 10 * NM,
    });
    const mesh = meshWafer(w);
    // find an upward face at the new top (z = 60 nm) and check it's metal-gold
    let found = false;
    for (let v = 0; v < mesh.data.length; v += MESH_STRIDE) {
      if (mesh.data[v + 5] === 1 && Math.abs(mesh.data[v + 2]! - 60) < 1e-6) {
        expect(mesh.data[v + 6]).toBeCloseTo(0.98, 5);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('degenerate wafers do not crash', () => {
    sane(meshWafer(createSubstrate(1, 1, 8 * NM, 10 * NM)));
    const empty: WaferModel = { nx: 2, ny: 2, pitch_m: 8 * NM, columns: [[], [], [], []] };
    expect(meshWafer(empty).triangles).toBe(0);
  });
});

describe('sectionMesh', () => {
  it('cuts through the intersected column line with one quad per segment', () => {
    const w = deposit(createSubstrate(4, 4, 8 * NM, 50 * NM), {
      material: 'sio2',
      thickness_m: 10 * NM,
    });
    const mesh = sectionMesh(w, 0.5, 'x');
    // 4 columns × 2 segments × 2 tris
    expect(mesh.triangles).toBe(16);
    sane(mesh);
    // all vertices share the same x (the cut plane)
    const x0 = mesh.data[0]!;
    for (let v = 0; v < mesh.data.length; v += MESH_STRIDE) {
      expect(mesh.data[v]).toBeCloseTo(x0, 6);
    }
  });

  it('y-axis sections work symmetrically', () => {
    const w = createSubstrate(4, 4, 8 * NM, 50 * NM);
    const mesh = sectionMesh(w, 0.25, 'y');
    expect(mesh.triangles).toBe(8);
    const y0 = mesh.data[1]!;
    for (let v = 0; v < mesh.data.length; v += MESH_STRIDE) {
      expect(mesh.data[v + 1]).toBeCloseTo(y0, 6);
    }
  });

  it('clamps out-of-range fractions', () => {
    const w = createSubstrate(4, 4, 8 * NM, 50 * NM);
    expect(sectionMesh(w, -1).triangles).toBe(8);
    expect(sectionMesh(w, 2).triangles).toBe(8);
  });
});
