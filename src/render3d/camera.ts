/**
 * Orbit camera math — pure and unit-tested; the GL layer only consumes the
 * matrices. Two-finger gestures map to orbit(dyaw,dpitch) and zoom(factor).
 */

export interface OrbitCamera {
  target: [number, number, number];
  yaw: number; // rad around +z
  pitch: number; // rad from +z (0 = top-down)
  dist: number; // world units from target
}

export const PITCH_MIN = 0.15;
export const PITCH_MAX = 1.5;

export function createCamera(target: [number, number, number], dist: number): OrbitCamera {
  return { target, yaw: -0.7, pitch: 0.9, dist };
}

export function orbit(cam: OrbitCamera, dyaw: number, dpitch: number): OrbitCamera {
  return {
    ...cam,
    yaw: cam.yaw + dyaw,
    pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch + dpitch)),
  };
}

export function zoom(cam: OrbitCamera, factor: number, minDist: number, maxDist: number): OrbitCamera {
  return { ...cam, dist: Math.min(maxDist, Math.max(minDist, cam.dist * factor)) };
}

export function eye(cam: OrbitCamera): [number, number, number] {
  return [
    cam.target[0] + cam.dist * Math.sin(cam.pitch) * Math.cos(cam.yaw),
    cam.target[1] + cam.dist * Math.sin(cam.pitch) * Math.sin(cam.yaw),
    cam.target[2] + cam.dist * Math.cos(cam.pitch),
  ];
}

// ---- minimal mat4 (column-major, WebGL convention) ----

export function perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovyRad / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function lookAt(eyeP: number[], center: number[], up: number[]): Float32Array {
  const z = norm(sub(eyeP, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -dot(x, eyeP), -dot(y, eyeP), -dot(z, eyeP), 1,
  ]);
}

export function viewMatrix(cam: OrbitCamera): Float32Array {
  return lookAt(eye(cam), [...cam.target], [0, 0, 1]);
}

/** M · [v,1] for tests and picking. */
export function transform(m: Float32Array, v: [number, number, number]): [number, number, number, number] {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!,
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!,
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!,
    m[3]! * v[0] + m[7]! * v[1] + m[11]! * v[2] + m[15]!,
  ];
}

const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm = (a: number[]) => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};
