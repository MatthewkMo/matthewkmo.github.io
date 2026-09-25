import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Fog, PerspectiveCamera,
  Points, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import { buildVolumes, type Volume } from './clouds';

const VERT = /* glsl */`
  precision mediump float;
  attribute vec3 aScatter;
  attribute float aSize;
  attribute float aSeed;
  attribute float aAnn;

  uniform float uResolve;   // 0 = raw sensor noise, 1 = resolved geometry
  uniform float uActive;    // annotation pass strength
  uniform float uTime;
  uniform float uPR;
  uniform float uSize;
  uniform float uLiquid;   // only the closing slab is a liquid surface

  varying float vDepth;
  varying float vAnn;
  varying float vSeed;
  varying float vSheen;

  void main() {
    float r = uResolve;
    vec3 p = position + aScatter * (1.0 - r);

    // residual sensor jitter: never fully still, never distracting
    float j = (1.0 - r) * 0.55 + 0.045;
    p.x += sin(uTime * 0.42 + aSeed * 31.4) * j;
    p.y += cos(uTime * 0.37 + aSeed * 17.1) * j;
    p.z += sin(uTime * 0.29 + aSeed * 11.7) * j;

    // the one fully resolved surface in the session keeps moving: three slow
    // crossing waves, with the sheen taken from the slope of the height field
    // so the crests catch the light the way poured metal does
    vSheen = 0.0;
    if (uLiquid > 0.5) {
      float t = uTime * 0.28;
      vec2 q = p.xy * vec2(0.80, 1.15);
      float A = 0.50, B = 0.35, C = 0.25;
      float w1 = q.x + t;
      float w2 = q.y * 1.3 - t * 0.8;
      float w3 = (q.x + q.y) * 0.7 + t * 1.3;
      float h = A * sin(w1) + B * sin(w2) + C * sin(w3);
      float dhx = 0.80 * (A * cos(w1) + 0.7 * C * cos(w3));
      float dhy = 1.15 * (1.3 * B * cos(w2) + 0.7 * C * cos(w3));
      p.z += h * 0.55 * r;
      vec3 n = normalize(vec3(-dhx, -dhy, 2.0));
      vec3 L = normalize(vec3(0.34, 0.62, 0.71));
      vSheen = pow(max(dot(n, L), 0.0), 7.0) * r;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;

    vDepth = clamp((dist - 9.0) / 34.0, 0.0, 1.0);
    vAnn = aAnn * uActive * r;
    vSeed = aSeed;

    gl_Position = projectionMatrix * mv;
    // size attenuation in the shader, as the sensor would report it
    gl_PointSize = uSize * aSize * uPR * (30.0 / max(dist, 1.0));
    gl_PointSize *= 1.0 + vSheen * 0.45;
    gl_PointSize = clamp(gl_PointSize, 0.6, 9.0);
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  uniform vec3 uFar;
  uniform vec3 uMid;
  uniform vec3 uNear;
  uniform vec3 uAnn;
  uniform float uOpacity;

  varying float vDepth;
  varying float vAnn;
  varying float vSeed;
  varying float vSheen;

  void main() {
    // round, soft-edged return
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float mask = smoothstep(0.25, 0.045, d);

    // depth ramp: near returns resolve toward white, far ones fall to noise
    vec3 col = mix(uNear, uMid, smoothstep(0.0, 0.45, vDepth));
    col = mix(col, uFar, smoothstep(0.4, 1.0, vDepth));
    col = mix(col, uAnn, vAnn);

    col = mix(col, vec3(0.97, 0.98, 1.0), vSheen * 0.8);

    float a = mask * uOpacity * mix(1.0, 0.34, vDepth);
    a *= mix(0.62, 1.0, vSeed);
    a *= 1.0 + vSheen * 0.7;
    if (a < 0.008) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export interface Anchor { center: Vector3; eye: Vector3 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CaptureScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly volumes: Volume[];
  readonly anchors: Anchor[] = [];
  readonly pointTotal: number;

  private meshes: Points[] = [];
  private mats: ShaderMaterial[] = [];
  private pr = 1;
  private time = 0;
  private look = { on: false, yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, dist: 1 };
  private parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  private eye = new Vector3();
  private target = new Vector3();
  private aim = new Vector3();
  private frameShift = 0;

  constructor(canvas: HTMLCanvasElement, opts: { mobile: boolean }) {
    const budget = opts.mobile ? 16000 : 46000;
    this.volumes = buildVolumes(budget);
    this.pointTotal = this.volumes.reduce((n, v) => n + v.count, 0);

    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.pr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setClearColor(new Color('#08090B'), 1);

    this.camera = new PerspectiveCamera(52, 1, 0.5, 340);
    this.scene.fog = new Fog(new Color('#08090B').getHex(), 34, 128);

    // the last leg is shorter: while the index section reads, the closing slab
    // is already visible ahead as unresolved noise
    const POS = [0, -46, -92, -138, -184, -224, -253];
    // per-volume framing: each scene is looked at the way its subject reads , 
    // down at a lawn, level with a person, straight on at the closing slab
    const FRAME: { eye: [number, number, number]; look: [number, number, number] }[] = [
      { eye: [0, 1.2, 17.5], look: [0, 0.4, 0] },      // boot noise
      { eye: [4.5, 1.6, 12.5], look: [0, 0.1, 1.0] },  // 01 figure    · Trace AI Labs
      { eye: [-5.5, 5.0, 15.5], look: [0, -2.0, 0] },  // 02 classroom · Simplify Tech
      { eye: [5.0, 5.2, 15.0], look: [0, -2.6, 0] },   // 03 lawn      · Community Butler
      { eye: [5.5, 3.0, 16.0], look: [0, -0.6, 0] },   // 04 crates    · Mo Luxury Goods
      { eye: [1.5, 0.6, 18.0], look: [0, 0, 0] },      // 05 annotation pass
      { eye: [0, 0.2, 17.0], look: [0, -0.5, 0] },     // contact slab
    ];
    this.volumes.forEach((vol, i) => {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(vol.position, 3));
      geo.setAttribute('aScatter', new BufferAttribute(vol.scatter, 3));
      geo.setAttribute('aSize', new BufferAttribute(vol.size, 1));
      geo.setAttribute('aSeed', new BufferAttribute(vol.seed, 1));
      geo.setAttribute('aAnn', new BufferAttribute(vol.ann, 1));
      geo.computeBoundingSphere();

      const mat = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uResolve: { value: 0 },
          uActive: { value: 0 },
          uTime: { value: 0 },
          uPR: { value: this.pr },
          uSize: { value: opts.mobile ? 1.5 : 1.75 },
          uOpacity: { value: 1 },
          uLiquid: { value: i === this.volumes.length - 1 ? 1 : 0 },
          uFar: { value: new Color('#2E3A4A') },
          uMid: { value: new Color('#7C8794') },
          uNear: { value: new Color('#E8EAED') },
          uAnn: { value: new Color('#4ADE9B') },
        },
      });

      const pts = new Points(geo, mat);
      const z = POS[Math.min(i, POS.length - 1)];
      const x = i === 0 || i === this.volumes.length - 1 ? 0 : (i % 2 ? -4.5 : 4.5);
      pts.position.set(x, 0, z);
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.meshes.push(pts);
      this.mats.push(mat);

      const f = FRAME[Math.min(i, FRAME.length - 1)];
      this.anchors.push({
        center: new Vector3(x + f.look[0], f.look[1], z + f.look[2]),
        eye: new Vector3(x + f.eye[0], f.eye[1], z + f.eye[2]),
      });
    });

    this.eye.copy(this.anchors[0].eye);
    this.target.copy(this.anchors[0].center);
    this.aim.copy(this.target);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // on wide screens the volume is pushed right of the text column; on narrow
    // screens it stays centred behind the copy
    this.frameShift = w > 900 ? -5.4 : w > 560 ? -2.8 : 0;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setPointer(nx: number, ny: number) { this.parallax.tx = nx; this.parallax.ty = ny; }

  setFreeLook(on: boolean) {
    this.look.on = on;
    if (!on) { this.look.tYaw = 0; this.look.tPitch = 0; }
  }

  orbit(dx: number, dy: number) {
    if (!this.look.on) return;
    this.look.tYaw = Math.max(-1.35, Math.min(1.35, this.look.tYaw + dx * 0.0055));
    this.look.tPitch = Math.max(-0.6, Math.min(0.75, this.look.tPitch + dy * 0.0042));
  }

  /** progress: continuous position along the anchor chain, e.g. 2.4 = between volume 2 and 3. */
  update(progress: number, dt: number) {
    this.time += dt;
    const last = this.anchors.length - 1;
    const p = Math.max(0, Math.min(last, progress));
    const i = Math.min(last - 1, Math.floor(p));
    const t = last === 0 ? 0 : p - i;
    const ease = t * t * (3 - 2 * t);
    const a = this.anchors[i], b = this.anchors[Math.min(last, i + 1)];

    this.parallax.x = lerp(this.parallax.x, this.parallax.tx, 0.05);
    this.parallax.y = lerp(this.parallax.y, this.parallax.ty, 0.05);
    this.look.yaw = lerp(this.look.yaw, this.look.tYaw, 0.075);
    this.look.pitch = lerp(this.look.pitch, this.look.tPitch, 0.075);

    this.target.set(
      lerp(a.center.x, b.center.x, ease),
      lerp(a.center.y, b.center.y, ease),
      lerp(a.center.z, b.center.z, ease),
    );

    const ex = lerp(a.eye.x, b.eye.x, ease);
    const ey = lerp(a.eye.y, b.eye.y, ease);
    const ez = lerp(a.eye.z, b.eye.z, ease);

    // orbit is applied around the current target, so free look never leaves the episode
    const ox = ex - this.target.x, oz = ez - this.target.z, oy = ey - this.target.y;
    const rad = Math.hypot(ox, oz);
    const base = Math.atan2(ox, oz);
    const yaw = base + this.look.yaw + this.parallax.x * 0.09;
    const pitch = this.look.pitch + this.parallax.y * 0.07;

    this.eye.set(
      this.target.x + Math.sin(yaw) * rad * Math.cos(pitch),
      this.target.y + oy + Math.sin(pitch) * rad * 0.55,
      this.target.z + Math.cos(yaw) * rad * Math.cos(pitch),
    );

    this.camera.position.lerp(this.eye, 0.16);
    this.aim.set(this.target.x + this.frameShift, this.target.y, this.target.z);
    this.camera.lookAt(this.aim);

    for (let k = 0; k < this.mats.length; k++) {
      const d = Math.abs(p - k);
      // resolution is a function of proximity, both position and opacity lerped
      const want = Math.max(0, Math.min(1, 1 - (d - 0.12) * 1.25));
      const m = this.mats[k];
      m.uniforms.uResolve.value = lerp(m.uniforms.uResolve.value, want, 0.085);
      m.uniforms.uActive.value = lerp(m.uniforms.uActive.value, d < 0.5 ? 1 : 0, 0.06);
      m.uniforms.uOpacity.value = lerp(m.uniforms.uOpacity.value, d > 2.1 ? 0 : 1, 0.06);
      m.uniforms.uTime.value = this.time;
      this.meshes[k].visible = m.uniforms.uOpacity.value > 0.01;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** dev-only: what each volume is doing right now */
  debugVolumes() {
    return this.mats.map((m, i) => ({
      key: this.volumes[i].key,
      resolve: +m.uniforms.uResolve.value.toFixed(3),
      opacity: +m.uniforms.uOpacity.value.toFixed(3),
      visible: this.meshes[i].visible,
      count: this.volumes[i].count,
    }));
  }

  dispose() {
    this.meshes.forEach((m) => { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); });
    this.renderer.dispose();
  }
}
