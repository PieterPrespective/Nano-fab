/**
 * Seeded deterministic RNG for every stochastic model in the game.
 *
 * Rule (prompts/nf03/06 §1): no model may call Math.random — randomness is
 * always injected so replays, tests, and level fairness are deterministic.
 * mulberry32: tiny, fast, passes practical uniformity tests; not
 * cryptographic (doesn't need to be).
 */

export type Rng = () => number; // uniform in [0, 1)

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive an independent stream seed (e.g. per level attempt, per grid row). */
export function deriveSeed(seed: number, streamId: number): number {
  // splitmix-style avalanche so nearby ids give unrelated streams
  let z = (seed ^ Math.imul(streamId + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** Standard normal via Box-Muller (used by implant profiles, LER, WFV). */
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng(); // avoid log(0)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Poisson sample (Knuth for small λ, normal approximation for large λ). */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  }
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}
