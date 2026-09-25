import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';

/* A continuous chrome surface behind the capture. Points can be shaded, but a
   scatter of points can never read as poured metal: a reflection needs a
   surface to sit on. This is that surface. Domain-warped noise gives the
   liquid shape, the normal comes from its slope, and the colour is a fake
   environment sampled through the reflected direction, which is what makes
   chrome look like chrome rather than like grey plastic. */
const FRAG = /* glsl */`
  precision mediump float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uQuality;   // 1 desktop, 0 mobile
  uniform float uLevel;     // overall brightness, kept low so type stays readable

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03; a *= 0.5;
      if (i == 2 && uQuality < 0.5) break;
    }
    return v;
  }


  void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uTime * 0.045;

    // the warp is the expensive part, so it is computed once and the three
    // height samples share it: five noise walks per pixel instead of nine
    vec2 q = vec2(fbm(uv * 1.6 + t), fbm(uv * 1.6 + vec2(4.2, 1.3) - t));
    vec2 base = uv * 1.6 + 2.6 * q;
    float e = 0.007;
    float h  = fbm(base);
    float hx = fbm(base + vec2(e, 0.0));
    float hy = fbm(base + vec2(0.0, e));
    vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 2.2));

    // reflect the view direction and read a procedural room off it: one bright
    // overhead strip, one soft bounce below, which is all chrome really is
    vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
    float strip = smoothstep(0.16, 0.0, abs(refl.y - 0.30));
    float bounce = smoothstep(0.55, 0.0, abs(refl.y + 0.50));
    float sky = pow(max(refl.y, 0.0), 5.0);

    float env = 0.05 + strip * 1.15 + bounce * 0.30 + sky * 0.35;
    env += pow(max(dot(n, normalize(vec3(0.5, 0.7, 0.6))), 0.0), 26.0) * 0.8;

    vec3 col = vec3(env) * vec3(0.96, 0.98, 1.04);
    // hold the edges down so the copy on top keeps its contrast
    float vig = smoothstep(1.45, 0.25, length(uv * vec2(0.85, 1.0)));
    gl_FragColor = vec4(col * uLevel * mix(0.55, 1.0, vig), 1.0);
  }
`;

export class MetalBackdrop {
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;

  constructor(mobile: boolean) {
    this.mat = new ShaderMaterial({
      fragmentShader: FRAG,
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uQuality: { value: mobile ? 0 : 1 },
        uLevel: { value: 0.62 },
      },
    });
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.mat));
  }

  resize(w: number, h: number, pr: number) {
    this.mat.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(renderer: WebGLRenderer, time: number) {
    this.mat.uniforms.uTime.value = time;
    renderer.render(this.scene, this.camera);
  }

  dispose() { this.mat.dispose(); }
}
