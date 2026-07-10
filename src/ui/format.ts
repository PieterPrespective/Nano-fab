/**
 * SI → display-unit formatting. The ONLY place where internal SI values
 * become human units (nm, mV/dec, µA, nW). Pure functions.
 */

const PREFIXES: Record<number, string> = {
  [-15]: 'f',
  [-12]: 'p',
  [-9]: 'n',
  [-6]: 'µ',
  [-3]: 'm',
  [0]: '',
  [3]: 'k',
  [6]: 'M',
  [9]: 'G',
};

/** Round to `sig` significant digits and strip trailing zeros. */
function mantissa(value: number, sig: number): string {
  const s = value.toPrecision(sig);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Engineering notation with SI prefix: si(1.8e-8, 'm') → "18 nm",
 * si(6.2e-5, 'A') → "62 µA". Falls back to exponent notation outside the
 * prefix table.
 */
export function si(value: number, unit: string, sig = 3): string {
  if (value === 0) return `0 ${unit}`;
  if (!Number.isFinite(value)) return `— ${unit}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let group = Math.floor(Math.log10(abs) / 3) * 3;
  let m = abs / 10 ** group;
  // Rounding can push the mantissa to 1000 (e.g. 999.7 → "1000"); renormalize.
  if (Number(mantissa(m, sig)) >= 1000) {
    group += 3;
    m = abs / 10 ** group;
  }
  const prefix = PREFIXES[group];
  if (prefix === undefined) return `${sign}${abs.toExponential(Math.max(0, sig - 1))} ${unit}`;
  return `${sign}${mantissa(m, sig)} ${prefix}${unit}`;
}

/** Subthreshold swing: V/dec → "59.6 mV/dec". */
export function perDecade(ss_VperDec: number, sig = 3): string {
  return `${mantissa(ss_VperDec * 1000, sig)} mV/dec`;
}

/** DIBL: V/V → "43.1 mV/V". */
export function perVolt(dibl_VperV: number, sig = 3): string {
  return `${mantissa(dibl_VperV * 1000, sig)} mV/V`;
}

/** Dimensionless ratios like Ion/Ioff: "1.6×10⁵". */
export function ratio(value: number, sig = 2): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp >= -2 && exp < 4) return mantissa(value, sig);
  const m = mantissa(value / 10 ** exp, sig);
  const sup = String(exp).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]!);
  return `${m}×10${sup}`;
}
