/**
 * NF3-0 SPIKE — WebGL2 wafer-over-time renderer perf probe.
 *
 * Measures on-device (Tab S8): fps while orbiting / scrubbing, remesh time,
 * triangle count, at grid 64/96/128. Gesture probe: one-finger = tool
 * (scrub/cut strips), two-finger = orbit/pinch. THROWAWAY CODE.
 */

import { buildWafer, type Wafer } from './wafer';
import { meshWafer, sectionMesh, type Mesh } from './mesh';

// ---------- on-page error log (no USB debugging needed on mobile) ----------
function showError(msg: string): void {
  let el = document.getElementById('errlog');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'errlog';
    el.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;max-height:45%;overflow:auto;' +
      'background:rgba(127,29,29,0.92);color:#fecaca;padding:10px 12px;border-radius:10px;' +
      'font:12px/1.5 monospace;white-space:pre-wrap;margin:0;';
    document.body.appendChild(el);
  }
  el.textContent += (el.textContent ? '\n' : '') + msg;
}
window.addEventListener('error', (e) =>
  showError(`${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`),
);
window.addEventListener('unhandledrejection', (e) => showError(`unhandled: ${String(e.reason)}`));

// ---------- tiny mat4 ----------
type M4 = Float32Array;
const m4 = {
  perspective(fovy: number, aspect: number, near: number, far: number): M4 {
    const f = 1 / Math.tan(fovy / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  lookAt(eye: number[], c: number[], up: number[]): M4 {
    const z = norm3(sub3(eye, c));
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
      x[0]!, y[0]!, z[0]!, 0,
      x[1]!, y[1]!, z[1]!, 0,
      x[2]!, y[2]!, z[2]!, 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
    ]);
  },
};
const sub3 = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross3 = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot3 = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm3 = (a: number[]) => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

// ---------- shaders ----------
const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uProj, uView;
out vec3 vNormal; out vec3 vWorld; out vec3 vColor;
void main(){ vWorld=aPos; vNormal=aNormal; vColor=aColor;
  gl_Position = uProj*uView*vec4(aPos,1.0); }`;

// NOTE: colors arrive as a vertex attribute. The first version indexed a
// uniform array with a flat varying int — fine on desktop ANGLE, rejected by
// mobile GLSL compilers (not dynamically uniform) => black canvas on device.
const FS = `#version 300 es
precision mediump float;
in vec3 vNormal; in vec3 vWorld; in vec3 vColor;
uniform float uClipX; uniform int uIsSection;
out vec4 outColor;
void main(){
  if (uIsSection==0 && vWorld.x > uClipX) discard;
  vec3 base = vColor;
  float light = 0.5 + 0.5*max(dot(normalize(vNormal), normalize(vec3(0.45,0.35,0.82))), 0.0);
  if (uIsSection==1) { light = 1.05; }
  else if (!gl_FrontFacing) { base *= 0.30; light = 1.0; }
  outColor = vec4(base*light, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  }
  return s;
}

// ---------- app ----------
const app = document.getElementById('spike')!;
app.innerHTML = `
  <canvas id="gl"></canvas>
  <div id="hud">
    <div id="stats">…</div>
    <div id="grids">
      <button data-n="64">64²</button><button data-n="96" class="on">96²</button><button data-n="128">128²</button>
    </div>
  </div>
  <div id="cutbar"><div id="cuthandle"></div></div>
  <div id="timebar"><div id="timehead"></div><span id="phaselabel"></span></div>`;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: true })!;
if (!gl) throw new Error('WebGL2 unavailable');

const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
}
gl.useProgram(prog);
const U = {
  proj: gl.getUniformLocation(prog, 'uProj'),
  view: gl.getUniformLocation(prog, 'uView'),
  clipX: gl.getUniformLocation(prog, 'uClipX'),
  isSection: gl.getUniformLocation(prog, 'uIsSection'),
};
gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.043, 0.07, 0.125, 1);

function makeVao(): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; count: number } {
  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 9 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
  return { vao, vbo, count: 0 };
}
const waferBuf = makeVao();
const sectionBuf = makeVao();

function upload(buf: ReturnType<typeof makeVao>, mesh: Mesh): void {
  gl.bindVertexArray(buf.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.DYNAMIC_DRAW);
  buf.count = mesh.vertexCount;
}

// ---------- state ----------
let gridN = 96;
let t = 1; // scrub position (start fully built)
let wafer: Wafer = buildWafer(gridN, t);
let clipFrac = 0.55;
let yaw = -0.7;
let pitch = 0.9; // rad from vertical
let dist = 2.2; // × wafer extent
let remeshMs = 0;
let triCount = 0;

const PHASES = ['etch STI', 'deposit oxide', 'CMP', 'gate stack', 'contacts'];

function rebuild(): void {
  const t0 = performance.now();
  wafer = buildWafer(gridN, t);
  const mesh = meshWafer(wafer);
  upload(waferBuf, mesh);
  rebuildSection();
  remeshMs = performance.now() - t0;
  triCount = mesh.triangles;
}
function rebuildSection(): void {
  upload(sectionBuf, sectionMesh(wafer, clipFrac * wafer.n * wafer.pitch));
}
rebuild();

// ---------- render loop + fps ----------
let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;
const stats = document.getElementById('stats')!;
const phaseLabel = document.getElementById('phaselabel')!;

function resize(): void {
  const dpr = Math.min(devicePixelRatio, 1.5); // plan budget: 3D dpr cap 1.5
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas);
resize();

function draw(): void {
  const ext = wafer.n * wafer.pitch;
  const c = [ext / 2, ext / 2, wafer.zMax / 2];
  const r = dist * ext * 0.75;
  const eye = [
    c[0]! + r * Math.sin(pitch) * Math.cos(yaw),
    c[1]! + r * Math.sin(pitch) * Math.sin(yaw),
    c[2]! + r * Math.cos(pitch),
  ];
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(U.proj, false, m4.perspective(0.9, canvas.width / canvas.height, ext * 0.05, ext * 10));
  gl.uniformMatrix4fv(U.view, false, m4.lookAt(eye, c, [0, 0, 1]));
  gl.uniform1f(U.clipX, clipFrac * ext);

  gl.uniform1i(U.isSection, 0);
  gl.bindVertexArray(waferBuf.vao);
  gl.drawArrays(gl.TRIANGLES, 0, waferBuf.count);

  gl.uniform1i(U.isSection, 1);
  gl.bindVertexArray(sectionBuf.vao);
  gl.drawArrays(gl.TRIANGLES, 0, sectionBuf.count);

  frames++;
  const now = performance.now();
  if (now - fpsWindowStart >= 500) {
    fps = (frames * 1000) / (now - fpsWindowStart);
    frames = 0;
    fpsWindowStart = now;
    stats.textContent =
      `${fps.toFixed(0)} fps · ${(triCount / 1000).toFixed(1)}k tris · remesh ${remeshMs.toFixed(1)} ms · ${gridN}²`;
  }
  const ph = Math.min(4, Math.floor(t * 5));
  phaseLabel.textContent = t >= 1 ? 'done' : `${PHASES[ph]}`;
  (document.getElementById('timehead') as HTMLElement).style.left = `${t * 100}%`;
  (document.getElementById('cuthandle') as HTMLElement).style.top = `${(1 - clipFrac) * 100}%`;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------- input: one finger = tool strips, two fingers = orbit ----------
const pointers = new Map<number, { x: number; y: number }>();
let lastPinch = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    lastPinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // orbit with the average motion; pinch zoom with distance change
    yaw -= dx * 0.005;
    pitch = Math.min(1.5, Math.max(0.15, pitch - dy * 0.005));
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (lastPinch > 0) dist = Math.min(5, Math.max(0.8, dist * (lastPinch / d)));
    lastPinch = d;
  } else if (pointers.size === 1 && e.pointerType === 'mouse') {
    // desktop convenience: mouse drag orbits
    yaw -= dx * 0.005;
    pitch = Math.min(1.5, Math.max(0.15, pitch - dy * 0.005));
  }
});
const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  lastPinch = 0;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  dist = Math.min(5, Math.max(0.8, dist * (1 + e.deltaY * 0.001)));
  e.preventDefault();
}, { passive: false });

// scrub strip (one finger)
const timebar = document.getElementById('timebar')!;
const scrubTo = (clientX: number) => {
  const r = timebar.getBoundingClientRect();
  t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  rebuild(); // deliberate: measures live-remesh cost while scrubbing
};
timebar.addEventListener('pointerdown', (e) => {
  timebar.setPointerCapture(e.pointerId);
  scrubTo(e.clientX);
});
timebar.addEventListener('pointermove', (e) => {
  if (timebar.hasPointerCapture(e.pointerId)) scrubTo(e.clientX);
});

// cut strip (one finger, vertical)
const cutbar = document.getElementById('cutbar')!;
const cutTo = (clientY: number) => {
  const r = cutbar.getBoundingClientRect();
  clipFrac = Math.min(1, Math.max(0.02, 1 - (clientY - r.top) / r.height));
  rebuildSection();
};
cutbar.addEventListener('pointerdown', (e) => {
  cutbar.setPointerCapture(e.pointerId);
  cutTo(e.clientY);
});
cutbar.addEventListener('pointermove', (e) => {
  if (cutbar.hasPointerCapture(e.pointerId)) cutTo(e.clientY);
});

// grid buttons
document.getElementById('grids')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  gridN = Number(btn.dataset.n);
  document.querySelectorAll('#grids button').forEach((b) => b.classList.toggle('on', b === btn));
  rebuild();
});

// debug hook for e2e
(window as unknown as { __spike?: object }).__spike = {
  get stats() {
    return { fps, triCount, remeshMs, gridN };
  },
  setT(v: number) {
    t = v;
    rebuild();
  },
  setClip(v: number) {
    clipFrac = v;
    rebuildSection();
  },
  orbit(dyaw: number, dpitch: number) {
    yaw += dyaw;
    pitch = Math.min(1.5, Math.max(0.15, pitch + dpitch));
  },
};
