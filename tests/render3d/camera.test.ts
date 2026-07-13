import { describe, expect, it } from 'vitest';
import {
  PITCH_MAX,
  PITCH_MIN,
  createCamera,
  eye,
  lookAt,
  orbit,
  perspective,
  transform,
  viewMatrix,
  zoom,
} from '../../src/render3d/camera';

describe('orbit camera', () => {
  it('eye sits at dist from target for any orbit', () => {
    let cam = createCamera([10, 20, 5], 100);
    for (let i = 0; i < 20; i++) {
      cam = orbit(cam, 0.37, 0.11);
      const e = eye(cam);
      const d = Math.hypot(e[0] - 10, e[1] - 20, e[2] - 5);
      expect(d).toBeCloseTo(100, 9);
    }
  });

  it('pitch clamps to [PITCH_MIN, PITCH_MAX]; zoom clamps to given range', () => {
    let cam = createCamera([0, 0, 0], 10);
    cam = orbit(cam, 0, 100);
    expect(cam.pitch).toBe(PITCH_MAX);
    cam = orbit(cam, 0, -100);
    expect(cam.pitch).toBe(PITCH_MIN);
    cam = zoom(cam, 1e9, 5, 50);
    expect(cam.dist).toBe(50);
    cam = zoom(cam, 1e-9, 5, 50);
    expect(cam.dist).toBe(5);
  });

  it('top-down at yaw 0: eye along +x/+z of target as pitch opens', () => {
    const cam = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: Math.PI / 2, dist: 7 };
    const e = eye(cam);
    expect(e[0]).toBeCloseTo(7, 9); // sin(π/2)·cos(0)
    expect(e[1]).toBeCloseTo(0, 9);
    expect(e[2]).toBeCloseTo(0, 9);
  });
});

describe('matrices', () => {
  it('viewMatrix maps the eye to the origin and the target onto -z', () => {
    const cam = createCamera([3, -2, 8], 25);
    const v = viewMatrix(cam);
    const e = transform(v, eye(cam));
    expect(Math.hypot(e[0], e[1], e[2])).toBeLessThan(1e-6);
    const t = transform(v, [3, -2, 8]);
    expect(t[0]).toBeCloseTo(0, 6);
    expect(t[1]).toBeCloseTo(0, 6);
    expect(t[2]).toBeCloseTo(-25, 6);
  });

  it('lookAt rotation block is orthonormal', () => {
    const m = lookAt([5, 4, 3], [0, 0, 0], [0, 0, 1]);
    const r = [
      [m[0]!, m[4]!, m[8]!],
      [m[1]!, m[5]!, m[9]!],
      [m[2]!, m[6]!, m[10]!],
    ];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const dot = r[a]![0]! * r[b]![0]! + r[a]![1]! * r[b]![1]! + r[a]![2]! * r[b]![2]!;
        expect(dot).toBeCloseTo(a === b ? 1 : 0, 5); // f32 storage precision
      }
    }
  });

  it('perspective maps -near to clip z/w = -1 and -far to +1', () => {
    const p = perspective(0.9, 1.5, 1, 100);
    const nearPt = transform(p, [0, 0, -1]);
    expect(nearPt[2] / nearPt[3]).toBeCloseTo(-1, 5);
    const farPt = transform(p, [0, 0, -100]);
    expect(farPt[2] / farPt[3]).toBeCloseTo(1, 4); // f32 rounding × far/near ratio
  });
});
