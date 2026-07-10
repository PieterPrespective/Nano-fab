import { describe, expect, it } from 'vitest';
import { perDecade, perVolt, ratio, si } from '../../src/ui/format';

describe('si formatting', () => {
  it('formats the doc examples', () => {
    expect(si(1.8e-8, 'm')).toBe('18 nm');
    expect(si(6.2e-5, 'A')).toBe('62 µA');
  });

  it('covers the metric display range', () => {
    expect(si(0.7, 'V')).toBe('700 mV');
    expect(si(5e-10, 'W')).toBe('500 pW');
    expect(si(2.5e-9, 'W')).toBe('2.5 nW');
    expect(si(1.05e-4, 'A')).toBe('105 µA');
    expect(si(45e-9, 'm')).toBe('45 nm');
    expect(si(0.9e-9, 'm')).toBe('900 pm');
    expect(si(1200, 'Ω')).toBe('1.2 kΩ');
  });

  it('handles zero, negatives, non-finite, and rounding overflow', () => {
    expect(si(0, 'A')).toBe('0 A');
    expect(si(-1.8e-8, 'm')).toBe('-18 nm');
    expect(si(Number.NaN, 'A')).toBe('— A');
    expect(si(9.997e-7, 'A')).toBe('1 µA'); // 999.7 nA rounds up a prefix group
    expect(si(1e-30, 'A')).toContain('e-30'); // beyond prefixes → exponent form
  });

  it('formats device-specific units', () => {
    expect(perDecade(0.0596)).toBe('59.6 mV/dec');
    expect(perVolt(0.0431)).toBe('43.1 mV/V');
    expect(ratio(1.64e5)).toBe('1.6×10⁵');
    expect(ratio(11.7)).toBe('12');
    expect(ratio(1.6e-5)).toBe('1.6×10⁻⁵');
  });
});
