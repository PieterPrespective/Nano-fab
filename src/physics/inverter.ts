/**
 * CMOS inverter — the bridge from device physics to Boolean logic
 * (Ch2 capstone). Two of the phase-1 transistors: an n-type pull-down and
 * a p-type pull-up modeled as its perfect mirror (same parameters, gate at
 * Vdd−Vin, channel at Vdd−Vout). The output settles where the two device
 * currents balance — found by bisection on the SAME `drainCurrent` the
 * rest of the game scores with, so the NOT gate can never disagree with
 * the terrain.
 *
 * Fidelity: the symmetric-PMOS assumption is a stated simplification (real
 * p-channels have ~2× lower mobility and are widened to compensate — which
 * restores the symmetry we assume). Anchors: a static CMOS gate conducts
 * only while switching; VTC gain > 1 at the midpoint is what makes logic
 * levels REGENERATE down a chain, and noise margins NM_L = V_IL−V_OL,
 * NM_H = V_OH−V_IH are the standard datasheet definition.
 */

import { drainCurrent, type DeviceParams } from './device';

/**
 * Output voltage where pull-down and pull-up currents balance (V).
 * f(vout) = Id_n(vin, vout) − Id_p(vdd−vin, vdd−vout) is monotonically
 * increasing in vout with f(0) ≤ 0 ≤ f(vdd), so bisection is exact.
 */
export function inverterVout(p: DeviceParams, vin_V: number, vdd_V: number): number {
  const f = (vout: number): number =>
    drainCurrent(p, vin_V, vout) - drainCurrent(p, vdd_V - vin_V, vdd_V - vout);
  let lo = 0;
  let hi = vdd_V;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface VtcPoint {
  vin_V: number;
  vout_V: number;
}

/** Voltage transfer curve, `points` samples across vin ∈ [0, vdd]. */
export function inverterVTC(p: DeviceParams, vdd_V: number, points = 121): VtcPoint[] {
  const out: VtcPoint[] = [];
  for (let i = 0; i < points; i++) {
    const vin = (vdd_V * i) / (points - 1);
    out.push({ vin_V: vin, vout_V: inverterVout(p, vin, vdd_V) });
  }
  return out;
}

export interface InverterMetrics {
  /** Switching midpoint: vin where vout crosses vdd/2 (V). */
  vm_V: number;
  /** Peak |dVout/dVin| — must exceed 1 for logic levels to regenerate. */
  gain: number;
  /** Low noise margin NM_L = V_IL − V_OL (V). */
  nmLow_V: number;
  /** High noise margin NM_H = V_OH − V_IH (V). */
  nmHigh_V: number;
  /** Output swing V_OH − V_OL (V). */
  swing_V: number;
}

/** Standard static VTC figures of merit (unity-gain-point definition). */
export function inverterMetrics(p: DeviceParams, vdd_V: number): InverterMetrics {
  const vtc = inverterVTC(p, vdd_V, 241);
  const voh = vtc[0]!.vout_V;
  const vol = vtc[vtc.length - 1]!.vout_V;

  // switching midpoint by interpolation
  let vm = vdd_V / 2;
  for (let i = 1; i < vtc.length; i++) {
    const a = vtc[i - 1]!;
    const b = vtc[i]!;
    if (a.vout_V >= vdd_V / 2 && b.vout_V < vdd_V / 2) {
      const t = (a.vout_V - vdd_V / 2) / (a.vout_V - b.vout_V || 1);
      vm = a.vin_V + t * (b.vin_V - a.vin_V);
      break;
    }
  }

  // slope and unity-gain points (central differences)
  let gain = 0;
  let vil = 0;
  let vih = vdd_V;
  let seenUnity = false;
  for (let i = 1; i < vtc.length - 1; i++) {
    const slope =
      (vtc[i + 1]!.vout_V - vtc[i - 1]!.vout_V) / (vtc[i + 1]!.vin_V - vtc[i - 1]!.vin_V);
    const g = Math.abs(slope);
    if (g > gain) gain = g;
    if (!seenUnity && g >= 1) {
      vil = vtc[i]!.vin_V;
      seenUnity = true;
    }
    if (seenUnity && g >= 1) vih = vtc[i]!.vin_V;
  }
  if (!seenUnity) {
    // gain never reaches 1: not a logic gate; margins collapse to zero
    vil = vm;
    vih = vm;
  }

  return {
    vm_V: vm,
    gain,
    nmLow_V: Math.max(0, vil - vol),
    nmHigh_V: Math.max(0, voh - vih),
    swing_V: voh - vol,
  };
}
