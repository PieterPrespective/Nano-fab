/**
 * Material palette for the 3D wafer. Colors are baked into vertex data at
 * mesh time — never indexed in shaders (mobile GLSL rejects uniform-array
 * indexing by flat varyings; learned on the Tab S8 during NF3-0).
 */

import type { Material } from '../scene/wafer';

export type Rgb = readonly [number, number, number];

export const MATERIAL_COLORS: Record<Material, Rgb> = {
  si: [0.42, 0.45, 0.52],
  'doped-n': [0.35, 0.62, 0.95],
  'doped-p': [0.93, 0.5, 0.42],
  sio2: [0.65, 0.78, 0.92],
  si3n4: [0.55, 0.85, 0.7],
  highk: [0.4, 0.9, 0.82],
  poly: [0.95, 0.62, 0.35],
  metal: [0.98, 0.83, 0.3],
  resist: [0.85, 0.45, 0.75],
};
