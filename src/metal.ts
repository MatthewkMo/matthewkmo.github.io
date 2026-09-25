/* One continuous liquid-metal surface. Six blobs define a shape; the metal is
   whatever their combined field encloses. Each segment has its own set, and the
   blobs lerp toward the incoming set, so the metal flows out of one object and
   into the next rather than cutting. No scene graph, no meshes: this is a
   single fullscreen pass. */

export type Shape = number[];           // 6 blobs, flat: x, y, radius, weight

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uQuality;
uniform float uLevel;
uniform vec2 uPointer;
uniform vec2 uCenter;
uniform vec4 uBlobs[6];

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * noise(p);
    p *= 2.03; a *= 0.5;
    if (i == 2 && uQuality < 0.5) break;
  }
  return v;
}

/* the shape, plus a slow wobble. The wobble has to be sampled inside the
   field, not added outside it: added outside it cancels out of the gradient
   and the surface comes out flat, lit only at its rim. */
float field(vec2 p, float t){
  float f = 0.0;
  for (int i = 0; i < 6; i++){
    vec4 b = uBlobs[i];
    vec2 d = p - (b.xy + uCenter);
    f += b.w * exp(-dot(d, d) / max(b.z * b.z, 0.0001));
  }
  return f + (fbm(p * 2.4 + vec2(t, -t)) - 0.5) * 0.60;
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.05;

  float e  = 0.006;
  float f  = field(p, t);
  float fx = field(p + vec2(e, 0.0), t);
  float fy = field(p + vec2(0.0, e), t);

  float mask = smoothstep(0.46, 0.80, f);
  if (mask <= 0.002) discard;

  vec3 n = normalize(vec3((f - fx) / e, (f - fy) / e, 1.5));

  /* a procedural room read through the reflected direction: one overhead
     strip, a soft bounce below, a little sky. That is what reads as chrome. */
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
  float strip  = smoothstep(0.20, 0.0, abs(refl.y - 0.30 + uPointer.y * 0.12));
  float bounce = smoothstep(0.60, 0.0, abs(refl.y + 0.52));
  float sky    = pow(max(refl.y, 0.0), 5.0);

  float env = 0.05 + strip * 1.30 + bounce * 0.32 + sky * 0.40;
  env += pow(max(dot(n, normalize(vec3(0.45 + uPointer.x * 0.3, 0.75, 0.5))), 0.0), 30.0) * 1.3;

  vec3 col = vec3(env) * vec3(0.95, 0.975, 1.06);
  gl_FragColor = vec4(col * uLevel, mask);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader failed');
  }
  return sh;
}

export class MetalSurface {
  private gl: WebGLRenderingContext;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private cur: Float32Array;
  private target: Float32Array;
  private pr: number;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  constructor(private canvas: HTMLCanvasElement, opts: { mobile: boolean }, first: Shape) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    this.pr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 2);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const k of ['uRes', 'uTime', 'uQuality', 'uLevel', 'uPointer', 'uCenter', 'uBlobs[0]']) {
      this.loc[k] = gl.getUniformLocation(prog, k);
    }
    gl.uniform1f(this.loc.uQuality, opts.mobile ? 0 : 1);
    gl.uniform1f(this.loc.uLevel, 0.85);
    gl.clearColor(0, 0, 0, 0);

    this.cur = new Float32Array(first);
    this.target = new Float32Array(first);
    this.resize();
  }

  resize() {
    const w = Math.floor(window.innerWidth * this.pr);
    const h = Math.floor(window.innerHeight * this.pr);
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.loc.uRes, w, h);
    // on a wide screen the object sits clear of the text column; on a narrow
    // one it centres, because there is no clear side left
    const aspect = w / h;
    this.gl.uniform2f(this.loc.uCenter, Math.min(aspect * 0.5 - 0.30, 0.40), 0);
  }

  /** the shape the metal is flowing toward */
  setTarget(shape: Shape) { this.target.set(shape); }

  setPointer(nx: number, ny: number) { this.pointer.tx = nx; this.pointer.ty = ny; }

  render(timeMs: number) {
    const gl = this.gl;
    // the metal does not snap between shapes, it runs into the next one
    for (let i = 0; i < this.cur.length; i++) {
      this.cur[i] += (this.target[i] - this.cur[i]) * 0.035;
    }
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.04;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.04;

    gl.uniform1f(this.loc.uTime, timeMs / 1000);
    gl.uniform2f(this.loc.uPointer, this.pointer.x, this.pointer.y);
    gl.uniform4fv(this.loc['uBlobs[0]'], this.cur);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
