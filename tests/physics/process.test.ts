import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  cmp,
  deposit,
  develop,
  etch,
  expose,
  implant,
  anneal,
  spinResist,
  strip,
  thermalOxide,
} from '../../src/physics/process';
import { applyStep, Timeline, type ProcessStep } from '../../src/scene/timeline';
import {
  airGaps,
  checkInvariants,
  colTop,
  createSubstrate,
  matAtZ,
  materialVolume,
  topMaterial,
  type WaferModel,
} from '../../src/scene/wafer';
import { createRng } from '../../src/physics/rng';
import { GAA_RELEASE, PLANAR_MOSFET, substrate } from '../helpers/recipes';

const NM = 1e-9;

function small(n = 6): WaferModel {
  return createSubstrate(n, n, 8 * NM, 100 * NM);
}
/** Column at normalized coords. */
function colAt(w: WaferModel, fx: number, fy: number) {
  const i = Math.min(w.nx - 1, Math.floor(fx * w.nx));
  const j = Math.min(w.ny - 1, Math.floor(fy * w.ny));
  return w.columns[j * w.nx + i]!;
}

function golden(name: string, actual: unknown): void {
  const path = join(__dirname, '..', 'fixtures', 'process', name);
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(actual));
    return;
  }
  if (!existsSync(path)) throw new Error(`missing golden ${name}; run UPDATE_GOLDEN=1 npm test`);
  expect(actual).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

describe('lithography heartbeat: spin → expose → develop → etch → strip', () => {
  const mask = [{ x0: 0.5, y0: 0, x1: 1, y1: 1 }]; // open the right half

  it('spinResist planarizes to a flat plane over topography', () => {
    let w = small();
    w = etch(w, { depth_m: 30 * NM, anisotropy: 1, rates: { si: 1 } }); // uniform dig
    w = spinResist(w, { thickness_m: 40 * NM });
    const tops = w.columns.map(colTop);
    for (const t of tops) expect(t).toBeCloseTo(tops[0]!, 12); // flat
    checkInvariants(w);
  });

  it('expose+develop opens resist only where the mask (blurred) clears threshold', () => {
    let w = spinResist(small(), { thickness_m: 40 * NM });
    w = expose(w, { mask, dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    expect(topMaterial(colAt(w, 0.2, 0.5))).toBe('resist'); // protected
    expect(topMaterial(colAt(w, 0.8, 0.5))).toBe('si'); // opened
    expect(w.latent).toBeUndefined(); // consumed
  });

  it('anisotropic etch digs only unmasked columns; strip removes the mask', () => {
    let w = spinResist(small(), { thickness_m: 40 * NM });
    w = expose(w, { mask, dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    w = etch(w, { depth_m: 30 * NM, anisotropy: 1, rates: { si: 1 } });
    w = strip(w);
    expect(colTop(colAt(w, 0.2, 0.5))).toBeCloseTo(100 * NM, 12);
    expect(colTop(colAt(w, 0.8, 0.5))).toBeCloseTo(70 * NM, 12);
    checkInvariants(w);
  });

  it('selectivity: an etch with no rate for the top material does nothing', () => {
    const w = spinResist(small(), { thickness_m: 40 * NM });
    const etched = etch(w, { depth_m: 50 * NM, anisotropy: 1, rates: { si: 1 } }); // resist not listed
    expect(etched.columns.map(colTop)).toEqual(w.columns.map(colTop));
  });
});

describe('the undercut (wet etch) and the keyhole (directional fill)', () => {
  it('isotropic etch eats sideways under the mask; anisotropic does not', () => {
    const mask = [{ x0: 0, y0: 0, x1: 0.5, y1: 1 }]; // open LEFT half
    const build = (anisotropy: number) => {
      let w = spinResist(createSubstrate(8, 8, 8 * NM, 100 * NM), { thickness_m: 40 * NM });
      w = expose(w, { mask, dose: 1, blurCells: 0 });
      w = develop(w, { threshold: 0.5 });
      return etch(w, { depth_m: 40 * NM, anisotropy, rates: { si: 1 } });
    };
    // masked column just right of the mask edge (x=0.5): first protected column
    const dry = build(1);
    const wet = build(0);
    const dryCol = colAt(dry, 0.5, 0.5);
    const wetCol = colAt(wet, 0.5, 0.5);
    expect(airGaps(dryCol).length).toBe(0); // intact under mask
    expect(airGaps(wetCol).length).toBeGreaterThan(0); // cavity under resist!
    expect(topMaterial(wetCol)).toBe('resist'); // resist left perched
    checkInvariants(wet);
  });

  it('directional deposit bridges a deep narrow slot, trapping a void', () => {
    // dig a single-column-wide deep slot at the center line x∈[0.5,0.625)
    let w = createSubstrate(8, 8, 8 * NM, 200 * NM);
    w = spinResist(w, { thickness_m: 40 * NM });
    w = expose(w, { mask: [{ x0: 0.5, y0: 0, x1: 0.625, y1: 1 }], dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    w = etch(w, { depth_m: 100 * NM, anisotropy: 1, rates: { si: 1 } });
    w = strip(w);
    const conformal = deposit(w, { material: 'sio2', thickness_m: 60 * NM, conformality: 1 });
    const directional = deposit(w, { material: 'metal', thickness_m: 20 * NM, conformality: 0 });
    expect(airGaps(colAt(conformal, 0.55, 0.5)).length).toBe(0); // ALD fills
    const voids = airGaps(colAt(directional, 0.55, 0.5));
    expect(voids.length).toBeGreaterThan(0); // PVD keyhole
    checkInvariants(directional);
  });
});

describe('implant, anneal, cmp, thermal oxide', () => {
  it('implant converts a buried band of si; a thick mask stack blocks it', () => {
    let w = small();
    w = spinResist(w, { thickness_m: 80 * NM });
    w = expose(w, { mask: [{ x0: 0.5, y0: 0, x1: 1, y1: 1 }], dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    w = implant(w, { species: 'n', range_m: 25 * NM, straggle_m: 8 * NM });
    const open = colAt(w, 0.8, 0.5);
    const masked = colAt(w, 0.2, 0.5);
    expect(matAtZ(open, (100 - 25) * NM)).toBe('doped-n'); // band at range below surface
    expect(matAtZ(open, 50 * NM)).toBe('si'); // deeper si untouched
    expect(masked.every((s) => s.m !== 'doped-n')).toBe(true); // blocked
    checkInvariants(w);
  });

  it('anneal spreads the doped band vertically and laterally', () => {
    let w = small();
    w = spinResist(w, { thickness_m: 80 * NM });
    w = expose(w, { mask: [{ x0: 0.5, y0: 0, x1: 1, y1: 1 }], dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    w = implant(w, { species: 'n', range_m: 25 * NM, straggle_m: 8 * NM });
    w = strip(w);
    const before = materialVolume(w, 'doped-n');
    const annealed = anneal(w, { spread_m: 8 * NM });
    expect(materialVolume(annealed, 'doped-n')).toBeGreaterThan(before);
    // lateral: the column just left of the mask edge now carries dopant
    const i = Math.floor(0.5 * annealed.nx) - 1;
    const col = annealed.columns[Math.floor(0.5 * annealed.ny) * annealed.nx + i]!;
    expect(col.some((s) => s.m === 'doped-n')).toBe(true);
    checkInvariants(annealed);
  });

  it('cmp planarizes overburden down to the stop layer (damascene)', () => {
    let w = small();
    w = spinResist(w, { thickness_m: 40 * NM });
    w = expose(w, { mask: [{ x0: 0.3, y0: 0, x1: 0.7, y1: 1 }], dose: 1, blurCells: 0 });
    w = develop(w, { threshold: 0.5 });
    w = etch(w, { depth_m: 40 * NM, anisotropy: 1, rates: { si: 1 } });
    w = strip(w);
    w = deposit(w, { material: 'metal', thickness_m: 60 * NM, conformality: 1 });
    w = cmp(w, { stopMaterial: 'si' });
    expect(topMaterial(colAt(w, 0.1, 0.5))).toBe('si'); // field cleared
    expect(topMaterial(colAt(w, 0.5, 0.5))).toBe('metal'); // wire buried flush
    expect(colTop(colAt(w, 0.5, 0.5))).toBeCloseTo(colTop(colAt(w, 0.1, 0.5)), 12);
    checkInvariants(w);
  });

  it('thermal oxide consumes 0.45× of the silicon it grows on', () => {
    const w = thermalOxide(small(), { thickness_m: 10 * NM });
    const col = colAt(w, 0.5, 0.5);
    expect(topMaterial(col)).toBe('sio2');
    expect(colTop(col)).toBeCloseTo((100 - 4.5 + 10) * NM, 12);
    expect(matAtZ(col, 95 * NM)).toBe('si');
    // does not grow on non-silicon
    const coated = thermalOxide(deposit(small(), { material: 'metal', thickness_m: 5 * NM }), {
      thickness_m: 10 * NM,
    });
    expect(topMaterial(colAt(coated, 0.5, 0.5))).toBe('metal');
  });
});

describe('property fuzz: any op sequence preserves wafer invariants', () => {
  it('200 random ops across 8 runs never violate column structure', () => {
    const rng = createRng(20260713);
    for (let run = 0; run < 8; run++) {
      let w = createSubstrate(6, 6, 8 * NM, 120 * NM);
      for (let s = 0; s < 25; s++) {
        const roll = rng();
        const step: ProcessStep =
          roll < 0.15
            ? { op: 'spinResist', thickness_m: (10 + rng() * 40) * NM }
            : roll < 0.3
              ? {
                  op: 'expose',
                  dose: 1,
                  blurCells: Math.floor(rng() * 2),
                  mask: [{ x0: rng() * 0.5, y0: rng() * 0.5, x1: 0.5 + rng() * 0.5, y1: 0.5 + rng() * 0.5 }],
                }
              : roll < 0.4
                ? { op: 'develop', threshold: 0.3 + rng() * 0.4 }
                : roll < 0.55
                  ? {
                      op: 'etch',
                      depth_m: rng() * 60 * NM,
                      anisotropy: rng(),
                      rates: { si: 1, sio2: rng(), poly: 1, 'doped-n': 1 },
                    }
                  : roll < 0.7
                    ? {
                        op: 'deposit',
                        material: (['sio2', 'poly', 'metal', 'si3n4'] as const)[Math.floor(rng() * 4)]!,
                        thickness_m: (2 + rng() * 30) * NM,
                        conformality: rng(),
                      }
                    : roll < 0.8
                      ? { op: 'implant', species: rng() < 0.5 ? 'n' : 'p', range_m: rng() * 40 * NM, straggle_m: 5 * NM }
                      : roll < 0.87
                        ? { op: 'anneal', spread_m: rng() * 10 * NM }
                        : roll < 0.94
                          ? { op: 'strip' }
                          : { op: 'cmp', targetZ_m: (60 + rng() * 80) * NM };
        w = applyStep(w, step);
        checkInvariants(w);
      }
    }
  });
});

describe('golden recipes', () => {
  it('planar MOSFET: gate on thin oxide, self-aligned S/D, STI isolation', () => {
    const tl = new Timeline(substrate());
    const snaps = tl.run(PLANAR_MOSFET);
    const w = snaps[snaps.length - 1]!;
    checkInvariants(w);
    // gate center: poly on 2 nm oxide on channel si
    const gate = colAt(w, 0.5, 0.5);
    expect(topMaterial(gate)).toBe('poly');
    const polyBottom = gate.find((s) => s.m === 'poly')!.z0_m;
    expect(matAtZ(gate, polyBottom - 1 * NM)).toBe('sio2');
    expect(matAtZ(gate, polyBottom - 3 * NM)).toBe('si'); // channel NOT doped (self-aligned!)
    // source/drain: doped, no poly
    const source = colAt(w, 0.5, 0.2);
    expect(source.some((s) => s.m === 'doped-n')).toBe(true);
    expect(source.some((s) => s.m === 'poly')).toBe(false);
    // STI: oxide-filled trench flush with the field
    const sti = colAt(w, 0.1, 0.5);
    expect(sti.some((s) => s.m === 'sio2')).toBe(true);
    golden('planar-mosfet.json', w.columns);
  });

  it('GAA: selective release suspends the sheets; conformal wrap re-fills around them', () => {
    const tl = new Timeline(substrate());
    const steps = GAA_RELEASE;
    // state after the release etch (3rd from last): cavities under each sheet
    const released = tl.run(steps.slice(0, steps.length - 2)).at(-1)!;
    const fin = colAt(released, 0.5, 0.5);
    expect(airGaps(fin).length).toBeGreaterThanOrEqual(3); // suspended sheets
    expect(fin.filter((s) => s.m === 'si').length).toBeGreaterThanOrEqual(3);
    // after wrap: cavities filled by high-k + metal (gate all around)
    const wrapped = tl.run(steps).at(-1)!;
    const finW = colAt(wrapped, 0.5, 0.5);
    expect(airGaps(finW).length).toBe(0);
    expect(finW.some((s) => s.m === 'metal')).toBe(true);
    checkInvariants(wrapped);
    golden('gaa-release.json', wrapped.columns);
  });

  it('order sensitivity: implanting BEFORE the gate dopes the channel (wrong!)', () => {
    // Move the implant+anneal before the gate-stack steps: the channel under
    // the future gate ends up doped — the level-6 lesson has teeth.
    const implantIdx = PLANAR_MOSFET.findIndex((s) => s.op === 'implant');
    const gateIdx = PLANAR_MOSFET.findIndex((s) => s.op === 'thermalOxide');
    const wrong: ProcessStep[] = [
      ...PLANAR_MOSFET.slice(0, gateIdx),
      ...PLANAR_MOSFET.slice(implantIdx), // implant + anneal first…
      ...PLANAR_MOSFET.slice(gateIdx, implantIdx), // …then the gate stack
    ];
    const w = new Timeline(substrate()).run(wrong).at(-1)!;
    const gate = colAt(w, 0.5, 0.5);
    const polyBottom = gate.find((s) => s.m === 'poly')!.z0_m;
    // probe mid-band: the implant centered 25 nm below the (pre-gate) surface
    expect(matAtZ(gate, polyBottom - 20 * NM)).toBe('doped-n'); // channel ruined
  });
});

describe('timeline mechanics', () => {
  const steps: ProcessStep[] = [
    { op: 'spinResist', thickness_m: 40 * NM },
    { op: 'expose', dose: 1, blurCells: 0, mask: [{ x0: 0.5, y0: 0, x1: 1, y1: 1 }] },
    { op: 'develop', threshold: 0.5 },
    { op: 'etch', depth_m: 40 * NM, anisotropy: 1, rates: { si: 1 } },
    { op: 'strip' },
  ];

  it('prefix memoization: editing step k reuses snapshots < k (identity check)', () => {
    const tl = new Timeline(small());
    const first = tl.run(steps);
    const edited = [...steps];
    edited[3] = { op: 'etch', depth_m: 20 * NM, anisotropy: 1, rates: { si: 1 } };
    const second = tl.run(edited);
    expect(second[0]).toBe(first[0]); // shared prefix: same object
    expect(second[2]).toBe(first[2]);
    expect(second[3]).not.toBe(first[3]);
  });

  it('interpolation: etch front descends monotonically with t', () => {
    const tl = new Timeline(small());
    let prevDepth = -1;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const w = tl.at(steps, 3, t);
      const depth = 100 * NM - colTop(colAt(w, 0.8, 0.5)) + 0; // dug depth in open half
      expect(depth).toBeGreaterThanOrEqual(prevDepth - 1e-15);
      prevDepth = depth;
      checkInvariants(w);
    }
    expect(prevDepth).toBeCloseTo(40 * NM, 12);
  });

  it('interpolated t=1 equals the applied step exactly', () => {
    const tl = new Timeline(small());
    const full = tl.run(steps)[3]!;
    expect(tl.at(steps, 3, 1)).toEqual(full);
  });

  it('bench guard: full planar recipe at 24×24 stays interactive', () => {
    const tl = new Timeline(substrate());
    const t0 = performance.now();
    tl.run(PLANAR_MOSFET);
    const ms = performance.now() - t0;
    // CI-safe bound (desktop budget is 50 ms; CI machines are slower/noisier)
    expect(ms).toBeLessThan(250);
  });
});
