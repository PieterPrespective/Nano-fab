import { describe, expect, it } from 'vitest';

// Sanity check that the Vitest + TypeScript toolchain works. Replaced by real
// physics/engine suites as phase 1 proceeds (see prompts/nf01/).
describe('toolchain scaffold', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });
});
