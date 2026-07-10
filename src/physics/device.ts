/**
 * Layer 1 — compact transistor model.
 *
 * Pure functions of plain data; SI units throughout (m, V, A, K).
 *
 * Fidelity (see CLAUDE.md fidelity rule and prompts/nf01/02-device-physics-model.md):
 * - Subthreshold swing is floored at the Boltzmann limit kT/q·ln10
 *   (≈ 59.6 mV/dec at 300 K) — conventional MOSFETs cannot beat it.
 * - Short-channel degradation (SS, DIBL) follows multi-gate scale-length
 *   theory: severity ~ exp(−Lg/2λ), with λ shrinking as the gate wraps the
 *   channel more fully (planar → FinFET → GAA) — the real reason for the
 *   architecture roadmap.
 * - The I–V core is an EKV-flavored single-piece charge model: exponential
 *   subthreshold, square-law strong inversion, smooth in between.
 * - Gate tunneling grows ~10× per 0.25 nm of (SiO2-equivalent) oxide
 *   thinning; GIDL uses a Hurkx-style band-to-band exp(−B/E) form.
 *
 * Simplifications (the game says so): calibrated constants rather than TCAD;
 * no quantum confinement, self-heating, or mobility/vsat model — the
 * transconductance factor K0 is calibrated to give realistic on-current
 * density (~500 µA/µm at "5nm"-like geometry).
 */

export const K_B = 1.380649e-23; // Boltzmann constant, J/K (exact, SI 2019)
export const Q_E = 1.602176634e-19; // elementary charge, C (exact, SI 2019)

/** εSi/εSiO2 = 11.7/3.9 — enters the scale length. */
const EPS_SI_OVER_EPS_OX = 11.7 / 3.9;

// --- Game-calibrated constants (frozen by golden fixtures) ---------------
/** SS degradation amplitude vs. exp(−Lg/2λ). */
const ALPHA_SS = 7;
/** DIBL amplitude (V/V) vs. exp(−Lg/2λ). */
const ALPHA_DIBL = 3.0;
/** Effective transconductance factor (A/V²), calibrated for ~500 µA/µm Ion. */
const K0_A_PER_V2 = 2e-4;
/** Gate direct tunneling: J = J0·exp(−eot/T0); T0 gives 10×/0.25 nm. */
const J0_GATE_A_PER_M2 = 4e8;
const T0_GATE_M = 0.25e-9 / Math.LN10;
/** GIDL (band-to-band, Hurkx-style): I = W·A·E·exp(−B/E). */
const A_GIDL_A_PER_V = 4e-9;
const B_GIDL_V_PER_M = 3e9; // ~BTBT critical field scale in Si

export type Architecture = 'planar' | 'finfet' | 'gaa';

/** Player-controllable device configuration. All SI units. */
export interface DeviceParams {
  arch: Architecture;
  /** Gate length Lg (m). "5nm" node ⇒ ~18e-9. */
  gateLength_m: number;
  /** Equivalent oxide thickness (m). */
  eot_m: number;
  /** Channel/fin/sheet thickness t_body (m). */
  bodyThickness_m: number;
  /** Nanosheet (or fin top) width (m). */
  sheetWidth_m: number;
  /** Stacked sheets (GAA) or fins (FinFET); 1 for planar. */
  nStack: number;
  /** Long-channel threshold voltage (V). */
  vth0_V: number;
  /** Supply voltage (V). */
  vdd_V: number;
  /** Lattice temperature (K). */
  temperature_K: number;
}

/** Derived electrostatic quality of the geometry. */
export interface Electrostatics {
  /** Natural (scale) length λ (m). */
  scaleLength_m: number;
  /** Subthreshold swing (V/dec). ≥ kT/q·ln10 always. */
  ss_VperDec: number;
  /** Drain-induced barrier lowering (V of Vth shift per V of Vds). */
  dibl_VperV: number;
}

/** Figures of merit the game scores on. */
export interface DeviceMetrics {
  /** Drive current at Vg = Vds = Vdd (A). */
  ion_A: number;
  /** Total off-state current at Vg = 0, Vds = Vdd (A). */
  ioff_A: number;
  ionOverIoff: number;
  ss_VperDec: number;
  dibl_VperV: number;
  /** Static power = ioff · vdd (W). */
  leakagePower_W: number;
  /** Gate direct-tunneling component of ioff (A). */
  gateLeakage_A: number;
  /** Band-to-band (GIDL) component of ioff (A). */
  gidl_A: number;
}

export const METRIC_KEYS: ReadonlyArray<keyof DeviceMetrics> = [
  'ion_A',
  'ioff_A',
  'ionOverIoff',
  'ss_VperDec',
  'dibl_VperV',
  'leakagePower_W',
  'gateLeakage_A',
  'gidl_A',
];

/** Thermal voltage kT/q (V). 0.02585 V at 300 K. */
export function thermalVoltage(temperature_K: number): number {
  return (K_B * temperature_K) / Q_E;
}

/** Gates effectively wrapping the channel: 1 planar, 2 FinFET, 3 GAA. */
function gateWrapFactor(arch: Architecture): number {
  switch (arch) {
    case 'planar':
      return 1;
    case 'finfet':
      return 2;
    case 'gaa':
      return 3;
  }
}

/**
 * Scale-length electrostatics.
 *
 * λ = sqrt(εsi/εox · t_body · eot / g); severity u = exp(−Lg/2λ);
 * SS = kT/q·ln10 · (1 + αss·u); DIBL = αdibl·u.
 *
 * Anchors: 59.6 mV/dec Boltzmann floor at 300 K; planar > FinFET > GAA
 * degradation at equal dimensions (why the industry moved to GAA).
 */
export function electrostatics(p: DeviceParams): Electrostatics {
  const lambda = Math.sqrt(
    (EPS_SI_OVER_EPS_OX * p.bodyThickness_m * p.eot_m) / gateWrapFactor(p.arch),
  );
  const u = Math.exp(-p.gateLength_m / (2 * lambda));
  const boltzmann = thermalVoltage(p.temperature_K) * Math.LN10;
  return {
    scaleLength_m: lambda,
    ss_VperDec: boltzmann * (1 + ALPHA_SS * u),
    dibl_VperV: ALPHA_DIBL * u,
  };
}

/**
 * Effective electrical width (m).
 *
 * GAA's drive advantage is that width scales with the stack, not the
 * footprint: each sheet contributes its full perimeter (real N3/N2 devices
 * stack 3–4 nanosheets).
 */
export function effectiveWidth(p: DeviceParams): number {
  switch (p.arch) {
    case 'planar':
      return p.sheetWidth_m;
    case 'finfet':
      // 3-sided gate: two sidewalls + top, per fin.
      return p.nStack * (2 * p.bodyThickness_m + p.sheetWidth_m);
    case 'gaa':
      // Full perimeter per stacked sheet.
      return p.nStack * 2 * (p.bodyThickness_m + p.sheetWidth_m);
  }
}

/** Overflow-safe softplus ln(1+e^x). */
function softplus(x: number): number {
  if (x > 40) return x;
  if (x < -40) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

/**
 * Drain current (A) at gate/drain bias (source grounded), vg,vds ≥ 0.
 *
 * EKV-flavored forward-minus-reverse charge model:
 *   Id = Ispec · [sp(xf)² − sp(xr)²],  sp = softplus
 *   xf = (vg − vth)/(2nφt),  xr = xf − vds/(2φt)
 * giving exp((vg−vth)/nφt)·(1−e^(−vds/φt)) in subthreshold (Boltzmann tail,
 * physical drain saturation) and a square law in strong inversion.
 */
export function drainCurrent(p: DeviceParams, vg_V: number, vds_V: number): number {
  const { ss_VperDec, dibl_VperV } = electrostatics(p);
  const phit = thermalVoltage(p.temperature_K);
  const n = ss_VperDec / (phit * Math.LN10); // ideality ≥ 1
  const vth = p.vth0_V - dibl_VperV * vds_V;
  const xf = (vg_V - vth) / (2 * n * phit);
  const xr = xf - vds_V / (2 * phit);
  const ispec = K0_A_PER_V2 * (effectiveWidth(p) / p.gateLength_m) * n * phit * phit;
  const f = softplus(xf);
  const r = softplus(xr);
  return ispec * (f * f - r * r);
}

/**
 * Gate direct-tunneling leakage (A) across the whole gate area.
 * Anchor: leakage grows ~10× per 0.25 nm of oxide thinning — the reason
 * high-k metal gate (HKMG) arrived at 45 nm.
 */
export function gateLeakage(p: DeviceParams): number {
  const area = effectiveWidth(p) * p.gateLength_m;
  return J0_GATE_A_PER_M2 * Math.exp(-p.eot_m / T0_GATE_M) * area;
}

/**
 * Gate-induced drain leakage (A): band-to-band tunneling at the gate–drain
 * overlap, Hurkx-style E·exp(−B/E) with E ≈ (Vdd + Vth0)/(3·eot).
 */
export function gidl(p: DeviceParams): number {
  const eField = (p.vdd_V + p.vth0_V) / (3 * p.eot_m);
  return effectiveWidth(p) * A_GIDL_A_PER_V * eField * Math.exp(-B_GIDL_V_PER_M / eField);
}

/** All scored figures of merit for a configuration. */
export function deviceMetrics(p: DeviceParams): DeviceMetrics {
  const es = electrostatics(p);
  const ion = drainCurrent(p, p.vdd_V, p.vdd_V);
  const isub = drainCurrent(p, 0, p.vdd_V);
  const ig = gateLeakage(p);
  const igidl = gidl(p);
  const ioff = isub + ig + igidl;
  return {
    ion_A: ion,
    ioff_A: ioff,
    ionOverIoff: ion / ioff,
    ss_VperDec: es.ss_VperDec,
    dibl_VperV: es.dibl_VperV,
    leakagePower_W: ioff * p.vdd_V,
    gateLeakage_A: ig,
    gidl_A: igidl,
  };
}

export interface CurvePoint {
  vg_V: number;
  id_A: number;
}

/** Id–Vg sweep at fixed Vds, for plotting. Pure; the renderer just draws it. */
export function idVgCurve(
  p: DeviceParams,
  vds_V: number,
  sweep: { from_V: number; to_V: number; points: number },
): CurvePoint[] {
  const { from_V, to_V, points } = sweep;
  const out: CurvePoint[] = [];
  for (let i = 0; i < points; i++) {
    const vg = from_V + ((to_V - from_V) * i) / (points - 1);
    out.push({ vg_V: vg, id_A: drainCurrent(p, vg, vds_V) });
  }
  return out;
}
