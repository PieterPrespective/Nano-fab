/**
 * Wafer → DeviceParams bridge (prompts/nf03/04 §4): measures the geometry
 * the player actually built so the phase-1 device physics can score it.
 * This is what closes the loop between Ch6 (build it) and Ch2 (why it
 * switches).
 */

import { DEFAULT_PARAMS } from '../engine/levels';
import type { DeviceParams } from '../physics/device';
import { colTop, type Column, type WaferModel } from './wafer';

const GATE_MATERIALS = new Set(['poly', 'metal']);
const DIELECTRICS = new Set(['sio2', 'highk', 'si3n4']);

function findGateSeg(col: Column) {
  // topmost gate-material segment that has dielectric directly beneath it
  for (let k = col.length - 1; k >= 0; k--) {
    const s = col[k]!;
    if (!GATE_MATERIALS.has(s.m)) continue;
    const below = col[k - 1];
    if (below && DIELECTRICS.has(below.m) && Math.abs(below.z1_m - s.z0_m) < 1e-12) {
      return { gate: s, dielectric: below };
    }
  }
  return null;
}

/** Count channel sheets: si segments fully wrapped (not the substrate). */
function countSheets(col: Column): number {
  let sheets = 0;
  for (const s of col) {
    if (s.m !== 'si') continue;
    if (s.z0_m < 1e-12) continue; // substrate sits on z = 0
    sheets++;
  }
  return sheets;
}

export interface ExtractedDevice {
  params: DeviceParams;
  /** Where the gate was found (normalized x), for UI highlighting. */
  gateAt: { i: number; j0: number; j1: number } | null;
}

/**
 * Measure the device at the column with the strongest gate signature.
 * Falls back to phase-1 defaults for anything the wafer can't express yet
 * (vth0, vdd, temperature) — those remain level-fixed knobs.
 */
export function extractDevice(w: WaferModel): ExtractedDevice {
  // The gate is where the dielectric under a gate material is THINNEST
  // (thick dielectric under poly is just wiring crossing field oxide);
  // among equals, where the most channel sheets are wrapped (GAA fin).
  const candidates: Array<{ k: number; eot: number; sheets: number }> = [];
  for (let k = 0; k < w.columns.length; k++) {
    const g = findGateSeg(w.columns[k]!);
    if (!g) continue;
    candidates.push({
      k,
      eot: g.dielectric.z1_m - g.dielectric.z0_m,
      sheets: countSheets(w.columns[k]!),
    });
  }
  if (candidates.length === 0) return { params: { ...DEFAULT_PARAMS }, gateAt: null };
  const eotMin = Math.min(...candidates.map((c) => c.eot));
  const best = candidates
    .filter((c) => c.eot <= eotMin * 1.5)
    .reduce((a, b) => (b.sheets > a.sheets ? b : a));

  const i = best.k % w.nx;
  const j = (best.k - i) / w.nx;
  /** A neighbor continues the gate only with a comparably thin dielectric. */
  const isGate = (col: Column | undefined): boolean => {
    if (!col) return false;
    const g = findGateSeg(col);
    return g !== null && g.dielectric.z1_m - g.dielectric.z0_m <= eotMin * 2;
  };

  // gate length: contiguous run of gated columns along y at this x
  let j0 = j;
  let j1 = j;
  while (j0 > 0 && isGate(w.columns[(j0 - 1) * w.nx + i])) j0--;
  while (j1 < w.ny - 1 && isGate(w.columns[(j1 + 1) * w.nx + i])) j1++;
  const gateLength_m = (j1 - j0 + 1) * w.pitch_m;

  // sheet width: contiguous gated run along x
  let i0 = i;
  let i1 = i;
  while (i0 > 0 && isGate(w.columns[j * w.nx + i0 - 1])) i0--;
  while (i1 < w.nx - 1 && isGate(w.columns[j * w.nx + i1 + 1])) i1++;
  const sheetWidth_m = (i1 - i0 + 1) * w.pitch_m;

  const col = w.columns[best.k]!;
  const dielectric = findGateSeg(col)!.dielectric;
  const eot_m = dielectric.z1_m - dielectric.z0_m;
  const sheets = countSheets(col);
  const arch: DeviceParams['arch'] = sheets >= 2 ? 'gaa' : 'planar';
  const sheetTh = sheets
    ? col.filter((s) => s.m === 'si' && s.z0_m > 1e-12).reduce((a, s) => a + (s.z1_m - s.z0_m), 0) / sheets
    : DEFAULT_PARAMS.bodyThickness_m;

  return {
    params: {
      ...DEFAULT_PARAMS,
      arch,
      gateLength_m,
      eot_m,
      sheetWidth_m,
      nStack: arch === 'gaa' ? sheets : 1,
      bodyThickness_m: arch === 'gaa' ? sheetTh : DEFAULT_PARAMS.bodyThickness_m,
    },
    gateAt: { i, j0, j1 },
  };
}

/** Highest structure on the wafer (camera framing helper). */
export function waferHeight(w: WaferModel): number {
  let h = 0;
  for (const col of w.columns) h = Math.max(h, colTop(col));
  return h;
}
