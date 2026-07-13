/**
 * Thin WebGL2 wafer renderer (canvas glue — covered by e2e screenshots, not
 * unit tests). Consumes meshes from scene/mesher.ts and matrices from
 * camera.ts. Derived from the NF3-0 spike, which measured >80 fps on the
 * Tab S8 at 128² — the perf envelope this module must stay inside.
 */

import type { Mesh } from '../scene/mesher';
import { perspective, viewMatrix, type OrbitCamera } from './camera';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uProj, uView;
out vec3 vNormal; out vec3 vWorld; out vec3 vColor;
void main(){ vWorld=aPos; vNormal=aNormal; vColor=aColor;
  gl_Position = uProj*uView*vec4(aPos,1.0); }`;

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

interface Buf {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  count: number;
}

export class WaferRenderer {
  private gl: WebGL2RenderingContext;
  private uProj: WebGLUniformLocation | null;
  private uView: WebGLUniformLocation | null;
  private uClipX: WebGLUniformLocation | null;
  private uIsSection: WebGLUniformLocation | null;
  private wafer: Buf;
  private section: Buf;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, this.compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, this.compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    }
    gl.useProgram(prog);
    this.uProj = gl.getUniformLocation(prog, 'uProj');
    this.uView = gl.getUniformLocation(prog, 'uView');
    this.uClipX = gl.getUniformLocation(prog, 'uClipX');
    this.uIsSection = gl.getUniformLocation(prog, 'uIsSection');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.043, 0.07, 0.125, 1);
    this.wafer = this.makeBuf();
    this.section = this.makeBuf();
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
    }
    return s;
  }

  private makeBuf(): Buf {
    const gl = this.gl;
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

  private upload(buf: Buf, mesh: Mesh): void {
    const gl = this.gl;
    gl.bindVertexArray(buf.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.DYNAMIC_DRAW);
    buf.count = mesh.vertexCount;
  }

  setWaferMesh(mesh: Mesh): void {
    this.upload(this.wafer, mesh);
  }

  setSectionMesh(mesh: Mesh): void {
    this.upload(this.section, mesh);
  }

  resize(dprCap = 1.5): void {
    const dpr = Math.min(devicePixelRatio, dprCap); // NF03 budget: 3D dpr ≤ 1.5
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** clipX in mesh units (nm); pass Infinity for no cut. */
  draw(cam: OrbitCamera, clipX_nm: number, near: number, far: number): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(
      this.uProj,
      false,
      perspective(0.9, this.canvas.width / Math.max(1, this.canvas.height), near, far),
    );
    gl.uniformMatrix4fv(this.uView, false, viewMatrix(cam));
    gl.uniform1f(this.uClipX, clipX_nm);
    gl.uniform1i(this.uIsSection, 0);
    gl.bindVertexArray(this.wafer.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.wafer.count);
    gl.uniform1i(this.uIsSection, 1);
    gl.bindVertexArray(this.section.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.section.count);
  }
}
