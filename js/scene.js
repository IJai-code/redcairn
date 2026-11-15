// REDCAIRN — the stage. One WebGL canvas, two worlds:
//   globe  Mars in true colour (Viking, via Mars Trek), seen from the lander on approach
//   walk   the real ground at true scale: HiRISE photo on the 1 m elevation model, the real horizon
//          rendered in Blender from the crater-wide elevation, scattered rocks, your rover, and you
import * as THREE from './vendor/three.module.min.js';
import { classify } from './terrain.js';

const EX = 1;            // true scale: this is what a person standing there would see
const DEG = Math.PI / 180;
const EYE = 1.7;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function sph(lon, lat, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2, th = (90 - lat) * DEG;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}

function loadTexture(url) {
  return new Promise((res) => {
    new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null));
  });
}

const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ROVER_PAINT = {
  graphite: new THREE.Color(0x3a3936), orange: new THREE.Color(0xd9d2c3), pearl: new THREE.Color(0xeee9de),
  steel: new THREE.Color(0x8f9296), tyre: new THREE.Color(0xa7a9aa), ring: new THREE.Color(0x7f8285),
};

// A stone: a subdivided sphere pushed in and out by layered waves so it has crags and planes, not a ball.
// `flat` squashes it into a slab. Vertex colours darken the crevices so it reads as rock without a texture.
function stoneGeometry(detail, seed, flat, tint) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const t = tint || new THREE.Color(1, 1, 1);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const w = (a, b, c) => Math.sin(x * a + y * b + z * c + seed);
    const d = 1 + 0.2 * w(2.3, 3.1, 1.7) + 0.13 * w(5.1, 4.3, 6.2) + 0.06 * w(11, 9, 13);
    x *= d; y *= d; z *= d;
    if (flat) { y *= 0.34; if (y > 0.16) y = 0.16 + (y - 0.16) * 0.2; }
    p.setXYZ(i, x, y, z);
    const sh = clamp(0.62 + (d - 0.7) * 0.9 + (flat ? 0 : y * 0.12), 0.45, 1.05) * (0.94 + 0.06 * w(21, 17, 19));
    col[i * 3] = t.r * sh; col[i * 3 + 1] = t.g * sh; col[i * 3 + 2] = t.b * sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Average colour of a horizontal band of an image (fractions of its height), as a three.js colour.
function averageColour(img, f0, f1) {
  try {
    const w = 48, h = 6, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const sy = img.height * f0, sh = Math.max(1, img.height * (f1 - f0));
    ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch (e) { return null; }
}

// The surface of Mars underfoot, built in the shader so it holds up from a hand's breadth to the horizon:
// wind ripples, drifted dust, dark basaltic sand, gravel and pebbles, desiccation cracks and wind scratches.
// Every layer fades out as it gets smaller than a pixel, so nothing shimmers. `broad` is the plain apron beyond the photo.
const SURFACE_GLSL = `
varying vec3 vWP;
float gPeb, gCrack, gScr, gRip, mH, gNear;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 4; i++){ s += a * vn(p); p = m * p; a *= 0.5; } return s / 0.9375; }
vec3 vor(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(h21(i + g), h21(i + g + vec2(17.3, 9.1)));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = h21(i + g + vec2(5.1, 2.7)); } else if (d < d2){ d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float wOct(float f, float fp){ return 1.0 - smoothstep(0.2, 0.55, fp * f); }
float surfH(vec2 p, float fp){
  float h = 0.0;
  vec2 dir = vec2(0.83, 0.56);
  float warp = fbm(p * 0.3) * 3.0;
  float w = wOct(0.3, fp);
  if (w > 0.001) h += (sin((dot(p, dir) + warp) * 1.7) * 0.5 + 0.5) * 0.09 * w;
  w = wOct(1.0, fp);
  gRip = 0.0;
  if (w > 0.001){ gRip = sin((dot(p, dir) + warp * 1.3) * 6.0); h += gRip * 0.018 * w * (0.4 + 0.6 * fbm(p * 0.15)); }
  w = wOct(9.0, fp);   if (w > 0.001) h += (vn(p * 9.0) - 0.5) * 0.03 * w;
  w = wOct(38.0, fp);  if (w > 0.001) h += (vn(p * 38.0) - 0.5) * 0.016 * w;
  w = wOct(130.0, fp); if (w > 0.001) h += (vn(p * 130.0) - 0.5) * 0.008 * w;
  gPeb = 0.0;
  w = wOct(6.0, fp);
  if (w > 0.001){
    float zone = 0.3 + 0.7 * smoothstep(0.3, 0.6, fbm(p * 0.07 + 4.0));
    vec3 v = vor(p * 6.0);
    float r = 0.16 + 0.22 * v.z;
    gPeb = smoothstep(r, r * 0.55, v.x) * step(0.42, v.z) * w * zone;
    vec3 u = vor(p * 17.0 + 3.0);
    gPeb = max(gPeb, smoothstep(0.3, 0.12, u.x) * step(0.5, u.z) * wOct(17.0, fp) * zone * 0.8);
    h += gPeb * 0.045;
  }
  gCrack = 0.0;
  w = wOct(10.0, fp);
  if (w > 0.001){
    vec3 v = vor(p * 1.25 + warp * 0.1);
    float m = smoothstep(0.42, 0.62, fbm(p * 0.06 + 11.0));
    gCrack = 0.0 * m * w * v.x;   // no desiccation cracks: HiRISE shows none at this site
    h -= gCrack * 0.05;
  }
  gScr = 0.0;
  w = wOct(45.0, fp);
  if (w > 0.001){
    float s = 0.0;
    vec2 q1 = mat2(0.8776, -0.4794, 0.4794, 0.8776) * p;
    vec2 q2 = mat2(0.6216, 0.7833, -0.7833, 0.6216) * p;
    s += smoothstep(0.86, 0.97, vn(vec2(q1.x * 55.0, q1.y * 1.8)));
    s += smoothstep(0.88, 0.98, vn(vec2(q2.x * 40.0, q2.y * 1.3 + 7.0)));
    gScr = min(1.0, s) * w * smoothstep(0.35, 0.6, fbm(p * 0.2 + 2.0));
    h -= gScr * 0.006;
  }
  return h;
}`;

function grainShader(mat, broad) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${SURFACE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 P = vWP.xz;
  float fp = length(fwidth(P));
  mH = surfH(P, fp);
  float pch = fbm(P * 0.035 + 3.7);
  float dust = smoothstep(0.3, 0.7, fbm(P * 0.11 + 8.1));
  float sand = smoothstep(0.58, 0.72, fbm(P * 0.05 + 21.0));
  vec3 c = diffuseColor.rgb, photo = c;
  c *= ${broad ? '0.74 + 0.52' : '0.86 + 0.28'} * pch + ${broad ? '0.0' : '0.0'};
  c = mix(c, c * vec3(1.2, 1.03, 0.86) + 0.02, dust * 0.5);
  c = mix(c, c * vec3(0.62, 0.6, 0.66), sand * 0.7);
  c *= 1.0 + mH * 1.4;
  c *= 1.0 - gCrack * 0.55;
  c *= 1.0 - gPeb * 0.38 * (0.6 + 0.8 * vn(P * 23.0));
  c += gScr * 0.05 * vec3(1.0, 0.8, 0.6);
  c *= mix(1.0, 0.84 + 0.32 * vn(P * 38.0), wOct(38.0, fp));
  // The orbital photograph is the truth; invented grain only where HiRISE runs out of pixels, right underfoot.
  gNear = ${broad ? '1.0' : '1.0 - smoothstep(12.0, 45.0, length(vWP - cameraPosition))'};
  diffuseColor.rgb = mix(photo, c, gNear);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(mH) * r1 + dFdy(mH) * r2);
  normal = normalize(abs(det) * normal - grad * 1.7 * gNear);
}`);
  };
}

// ---------------------------------------------------------------- the ink style
// The walk is drawn like the opening's plates: three flat tones from the sun and the real photo, ink contour lines
// every 2 m of real height, and the data drawn the way a mapmaker draws it: hachures on steep ground, stipple for
// radiation shelter. Same palette as tools/blender_plates.py.
const PAL = {
  t0: new THREE.Color(0x6e3424), t1: new THREE.Color(0xb86a42), t2: new THREE.Color(0xe7a473),
  ink: new THREE.Color(0x2b160f), paper: new THREE.Color(0xf3dfc2), paperHi: new THREE.Color(0xfbeedb),
  care: new THREE.Color(0xc77e1c), nogo: new THREE.Color(0x9e2a17), shelter: new THREE.Color(0x4a2f86),
};
let TOON_RAMP = null;
function toonRamp() {
  if (TOON_RAMP) return TOON_RAMP;
  TOON_RAMP = new THREE.DataTexture(new Uint8Array([60, 140, 255]), 3, 1, THREE.RedFormat);
  TOON_RAMP.minFilter = TOON_RAMP.magFilter = THREE.NearestFilter;
  TOON_RAMP.needsUpdate = true;
  return TOON_RAMP;
}
function toon(color, vertexColors = false) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), vertexColors });
}
// Ink outline: the back faces, pushed out along their normals and drawn flat (an "inverted hull").
function inkOutline(geometry, width) {
  const m = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  const o = new THREE.Mesh(geometry, m);
  o.castShadow = false;
  return o;
}

const INK_GROUND_VS = `varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const INK_GROUND_FS = `uniform sampler2D photo, cls, shield; uniform float has, showSlope, showShield, fogD, y0;
uniform vec3 sun, t0, t1, t2, ink, fogC, care, nogo, shelter;
varying vec3 vWP; varying vec3 vN; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lineAt(float v, float px){ float d = abs(fract(v + 0.5) - 0.5); return 1.0 - smoothstep(px * 0.5, px * 1.3, d); }
void main(){
  vec3 n = normalize(vN);
  float ndl = max(0.0, dot(n, normalize(sun)));
  float lum = has > 0.5 ? pow(dot(texture2D(photo, vUv).rgb, vec3(0.299, 0.587, 0.114)), 0.4545) : 0.5;
  float s = 0.3 + ndl * 0.62 + (lum - 0.5) * 0.38;
  vec3 c = s < 0.36 ? t0 : (s < 0.7 ? t1 : t2);
  // contour lines every 2 m of real height, bold every 10 m; they fade where they would crowd into grey
  float h = vWP.y + y0;
  float f2 = fwidth(h / 2.0), f10 = fwidth(h / 10.0);
  float k = max(lineAt(h / 2.0, f2) * (1.0 - smoothstep(0.12, 0.3, f2)) * 0.5,
                lineAt(h / 10.0, f10 * 1.7) * (1.0 - smoothstep(0.08, 0.2, f10)) * 0.85);
  // hachures: ground that needs care is hatched; ground too steep for a suit is cross-hatched
  if (showSlope > 0.5) {
    float cl = floor(texture2D(cls, vUv).r * 255.0 + 0.5);
    vec2 P = vWP.xz / 0.8;
    float fa = fwidth(P.x + P.y), fb = fwidth(P.x - P.y);
    float fade = 1.0 - smoothstep(0.3, 0.6, fa);
    float a = lineAt(P.x + P.y, fa), b = lineAt(P.x - P.y, fb);
    if (cl > 0.5 && cl < 1.5) c = mix(mix(c, care, 0.18), care * 0.75, a * fade);
    if (cl > 1.5) c = mix(mix(c, nogo, 0.3), nogo * 0.7, max(a, b) * fade);
  }
  // shelter from radiation: stipple, denser where the hills hide more of the sky
  if (showShield > 0.5) {
    float v = texture2D(shield, vUv).r;
    vec2 q = vWP.xz / 0.6;
    vec2 g = floor(q), f = fract(q) - 0.5 + (vec2(hash(g), hash(g + 7.3)) - 0.5) * 0.4;
    float fd = fwidth(q.x);
    float d = (1.0 - smoothstep(0.07, 0.07 + fd, length(f))) * step(hash(g + 3.1), v * 1.4);
    c = mix(c, shelter, d * 0.85 * (1.0 - smoothstep(0.35, 0.7, fd)));
  }
  c = mix(c, ink, k);
  float dist = length(vWP - cameraPosition);
  c = mix(c, fogC, 1.0 - exp(-fogD * fogD * dist * dist));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function paintCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  fn(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  return c;
}

// Small deterministic random numbers, so the rocks are the same on every visit.
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export class Stage {
  constructor(canvas, pinRoot, data) {
    this.canvas = canvas;
    this.pinRoot = pinRoot;
    this.data = data;
    this.t = data.terrain;
    this.mode = 'none';
    this.want = 'none';
    this.pins = [];
    this.modeToken = 0;
    this.onPick = () => {};
    this.onStop = () => {};
    this.layers = new Set();
    this.look = { yaw: 0, pitch: 0 };       // the user's own head turn, added to the scripted view
    this.heading = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.setClearColor(0x0b0907);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.gCam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.gCam.position.z = 6;   // start outside the planet (and its haze), then ease in
    this.wCam = new THREE.PerspectiveCamera(62, 1, 0.1, 9000);
    this.#buildGlobe();
    this.#buildWalk();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // The canvas also lives inside the story card's window; follow whatever box it is in.
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.#bindDrag();
    this.last = performance.now();
    requestAnimationFrame((n) => this.#frame(n));
  }

  // ------------------------------------------------------------ globe
  #buildGlobe() {
    const s = this.gScene = new THREE.Scene();
    this.g = { dist: 3.7, focus: null, base: 3.7 };
    this.globe = new THREE.Group();
    this.globe.rotation.set(0.3, 2.2, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat));
    s.add(this.globe);
    loadTexture('assets/img/mars-viking.jpg').then((t) => { if (t) { mat.map = t; mat.needsUpdate = true; } });
    const haze = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.74 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.86, 0.46, 0.27, 1.0) * i; }',
    }));
    s.add(haze);
    s.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffe2c4, 3.3);
    sun.position.set(-3, 1.4, 3);
    s.add(sun);
    const n = 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 10);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd9cdbb, size: 0.07, transparent: true, opacity: 0.55 })));
  }

  setGhosts(ghosts, onPick) {
    this.onPick = onPick;
    for (const gh of ghosts) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ghost';
      el.innerHTML = `<i></i><span>${gh.name}</span>`;
      el.addEventListener('click', () => this.onPick(gh.id));
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'globe', local: sph(gh.lon, gh.lat, 1.006), id: gh.id });
    }
  }

  focusGlobe(place, dist) {
    this.g.focus = place;
    this.g.dist = dist || this.g.base;
  }

  #tickGlobe(dt) {
    const g = this.g, rot = this.globe.rotation;
    if (g.focus) {
      const m = sph(g.focus.lon, g.focus.lat);
      const ty = -Math.atan2(m.x, m.z), tx = Math.atan2(m.y, Math.hypot(m.x, m.z));
      let d = ty - rot.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const k = 1 - Math.exp(-2.2 * dt);
      rot.y += d * k;
      rot.x += (tx - rot.x) * k;
    } else {
      rot.y += dt * (reduce ? 0 : 0.045);
    }
    this.gCam.position.z += (g.dist - this.gCam.position.z) * (1 - Math.exp(-1.6 * dt));
    this.gCam.lookAt(0, 0, 0);
    this.globe.updateMatrixWorld();
  }

  // ------------------------------------------------------------ walk world
  worldOf(lon, lat, lift = 0) {
    const t = this.t;
    return new THREE.Vector3(
      (t.fx(lon) - (t.cols - 1) / 2) * t.cellX,
      (t.elevAt(lon, lat) - this.y0) * EX + lift,
      (t.fy(lat) - (t.rows - 1) / 2) * t.cellY,
    );
  }

  // Ground height under a world x/z point (metres above the scene floor).
  heightAt(x, z) {
    const t = this.t;
    const fx = clamp(x / t.cellX + (t.cols - 1) / 2, 0, t.cols - 1.001), fy = clamp(z / t.cellY + (t.rows - 1) / 2, 0, t.rows - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, c = t.cols, Z = t.z;
    const h = (Z[y0 * c + x0] * (1 - tx) + Z[y0 * c + x0 + 1] * tx) * (1 - ty) + (Z[(y0 + 1) * c + x0] * (1 - tx) + Z[(y0 + 1) * c + x0 + 1] * tx) * ty;
    return (h - this.y0) * EX;
  }

  #buildWalk() {
    const t = this.t, { cols, rows } = t;
    const s = this.wScene = new THREE.Scene();
    this.y0 = t.meta.minElevM;
    this.haze = new THREE.Color(0xb48a6a);
    s.fog = new THREE.FogExp2(this.haze, 0.00055);

    // The 1 m ground, with the HiRISE photograph and a fine procedural grain for eye-level detail.
    const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        pos[i * 3] = (c - (cols - 1) / 2) * t.cellX;
        pos[i * 3 + 1] = (t.z[i] - this.y0) * EX;
        pos[i * 3 + 2] = (r - (rows - 1) / 2) * t.cellY;
        uv[i * 2] = c / (cols - 1);
        uv[i * 2 + 1] = 1 - r / (rows - 1);
      }
    }
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let k = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
        idx[k++] = a; idx[k++] = cc; idx[k++] = b;
        idx[k++] = b; idx[k++] = cc; idx[k++] = d;
      }
    }
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
    grainShader(groundMat, false);
    this.groundMat = groundMat;
    this.ground = new THREE.Mesh(geo, groundMat);
    this.ground.receiveShadow = true;
    s.add(this.ground);
    loadTexture('assets/img/site-ortho.jpg').then((tex) => {
      if (!tex) return;
      groundMat.map = tex; groundMat.needsUpdate = true;
      if (this.inkMat) { this.inkMat.uniforms.photo.value = tex; this.inkMat.uniforms.has.value = 1; }
      // Beyond the photo, the ground carries on in the photo's own colour, so there is no visible edge.
      const c = averageColour(tex.image, 0, 1);
      if (c) for (const m of this.apronMats) m.color.copy(c);
    });

    this.#buildInkGround();
    this.#buildApron(pos);
    this.#buildSky();
    this.#buildRocks();

    s.add(new THREE.HemisphereLight(0xf3d8bf, 0x5a3c2a, 1.6));
    const sun = this.sun = new THREE.DirectionalLight(0xffd9b0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006;
    this.sunDir = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();    // late afternoon, from the south-west
    s.add(sun, sun.target);

    this.#buildOverlays();
    this.#buildRoute();
    this.#buildMarkers();
    this.#buildAir();
    this.cam = { x: 0, y: 0, z: 0, dist: 1150, polar: 55, az: 14 };
    this.camT = { ...this.cam };
    this.eyeT = null;
    this.eyeNow = null;
    this.camMode = 'orbit';
  }

  // The ink ground: slope classes and terrain shelter go to the shader as small data textures (row 0 = south).
  #buildInkGround() {
    const t = this.t, { cols, rows } = t;
    const flipRows = (src, scale) => {
      const out = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[(rows - 1 - r) * cols + c] = Math.max(0, Math.min(255, Math.round(src[r * cols + c] * scale)));
      return out;
    };
    const tex = (data, linear) => { const x = new THREE.DataTexture(data, cols, rows, THREE.RedFormat); x.minFilter = x.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter; x.needsUpdate = true; return x; };
    const top = Math.max(0.12, t.maxShield * 0.8);
    this.inkMat = new THREE.ShaderMaterial({
      uniforms: {
        photo: { value: null }, has: { value: 0 }, cls: { value: tex(flipRows(t.cls, 1), false) }, shield: { value: tex(flipRows(t.shield, 255 / top), true) },
        showSlope: { value: 0 }, showShield: { value: 0 }, fogD: { value: 0.0009 }, y0: { value: this.y0 },
        sun: { value: new THREE.Vector3(-0.62, 0.42, 0.66).normalize() }, t0: { value: PAL.t0 }, t1: { value: PAL.t1 }, t2: { value: PAL.t2 },
        ink: { value: PAL.ink }, fogC: { value: PAL.paper }, care: { value: PAL.care }, nogo: { value: PAL.nogo }, shelter: { value: PAL.shelter },
      },
      vertexShader: INK_GROUND_VS, fragmentShader: INK_GROUND_FS,
    });
    this.ground.material = this.inkMat;
    this.wScene.fog.color.copy(PAL.paper);
    this.wScene.fog.density = 0.0009;
  }

  // Beyond the 1 m model the ground slopes gently away under the haze, so there is no cliff at the edge.
  #buildApron(pos) {
    const t = this.t, { cols, rows } = t, out = 900, sp = [], si = [];
    const side = (ids, nx, nz) => {
      const o = sp.length / 3;
      for (const i of ids) {
        sp.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        sp.push(pos[i * 3] + nx * out, pos[i * 3 + 1] * 0.6 - 6, pos[i * 3 + 2] + nz * out);
      }
      for (let j = 0; j < ids.length - 1; j++) { const a = o + j * 2; si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    };
    const top = [], bot = [], left = [], right = [];
    for (let c = 0; c < cols; c++) { top.push(c); bot.push((rows - 1) * cols + c); }
    for (let r = 0; r < rows; r++) { left.push(r * cols); right.push(r * cols + cols - 1); }
    side(top, 0, -1); side(bot, 0, 1); side(left, -1, 0); side(right, 1, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.setIndex(si);
    g.computeVertexNormals();
    const apronMat = toon(PAL.t1.clone());
    apronMat.side = THREE.DoubleSide;
    const discMat = toon(PAL.t1.clone());
    this.apronMats = [];
    this.wScene.add(new THREE.Mesh(g, apronMat));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6000, 64), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -8;
    this.wScene.add(disc);
  }

  // The real horizon: a 360° Blender render from the dock (tools/blender_horizon.py), centre = north, east to the right.
  #buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { map: { value: null }, haze: { value: new THREE.Color(0xb48a6a) }, has: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D map; uniform vec3 haze; uniform float has; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float u = atan(d.x, -d.z) / 6.2831853 + 0.5;
          float v = asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5;
          // The real horizon, drawn in ink by Blender from the MOLA + HRSC elevation (tools/blender_horizon_ink.py).
          vec3 c = has > 0.5 ? texture2D(map, vec2(u, v)).rgb : vec3(0.89, 0.74, 0.55);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.wScene.add(this.sky);
    loadTexture('assets/img/horizon-ink.jpg').then((tex) => {
      if (!tex) return;
      mat.uniforms.map.value = tex; mat.uniforms.has.value = 1;
      // The distance fades into the colour of the real horizon, so ground and sky meet without a seam.
      // the ink style keeps its paper-coloured haze
    });
  }

  // The air: motes of dust drifting on the wind around the viewer, and puffs kicked up by the rover's wheels.
  // Nothing here is interface; it only makes the air feel like air.
  #buildAir() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(c);

    // Motes: a fixed cloud that wraps around the camera, so there is always dust near you and never any far away.
    const N = reduce ? 0 : 200, R = 24;
    const mp = new Float32Array(N * 3), rand = rng(9091);
    for (let i = 0; i < N; i++) { mp[i * 3] = (rand() - 0.5) * 2 * R; mp[i * 3 + 1] = rand() * 9 - 2; mp[i * 3 + 2] = (rand() - 0.5) * 2 * R; }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp.slice(), 3));
    this.motes = { N, R, base: mp, pts: new THREE.Points(mg, new THREE.PointsMaterial({
      map: sprite, color: 0xe9c9a4, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.22, depthWrite: false, fog: true,
    })) };
    this.motes.pts.frustumCulled = false;
    this.wScene.add(this.motes.pts);

    // Wheel dust: a pool of soft puffs that rise, widen and fade.
    const M = reduce ? 0 : 90;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(M), 1));
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(M), 1));
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { map: { value: sprite }, tint: { value: new THREE.Color(0xc9a07c) }, scale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float scale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(tint, a); }`,
    });
    this.puffs = { M, i: 0, life: new Float32Array(M), vel: new Float32Array(M * 3), age: new Float32Array(M), geo: pg, pts: new THREE.Points(pg, pm), last: 0 };
    this.puffs.pts.frustumCulled = false;
    this.puffs.pts.renderOrder = 3;
    this.wScene.add(this.puffs.pts);
  }

  #emitPuff(x, y, z, vx, vz) {
    const P = this.puffs, k = P.i++ % P.M;
    const a = P.geo.attributes.position.array;
    a[k * 3] = x; a[k * 3 + 1] = y; a[k * 3 + 2] = z;
    P.vel[k * 3] = vx + (Math.random() - 0.5) * 0.25; P.vel[k * 3 + 1] = 0.22 + Math.random() * 0.25; P.vel[k * 3 + 2] = vz + (Math.random() - 0.5) * 0.25;
    P.age[k] = 0; P.life[k] = 2.2 + Math.random() * 1.4;
  }

  #tickAir(dt, now) {
    const M = this.motes, P = this.puffs;
    if (M && M.N) {
      const cp = this.wCam.position, a = M.pts.geometry.attributes.position.array, t = now * 0.001, R = M.R, w = 2 * R;
      // The wind carries everything east-north-east, slowly, with a little swirl.
      for (let i = 0; i < M.N; i++) {
        const bx = M.base[i * 3] + t * 0.55 + Math.sin(t * 0.7 + i) * 0.35, bz = M.base[i * 3 + 2] + t * 0.3 + Math.cos(t * 0.5 + i * 1.7) * 0.35;
        a[i * 3] = cp.x + ((((bx - cp.x) % w) + w + R) % w) - R;
        a[i * 3 + 2] = cp.z + ((((bz - cp.z) % w) + w + R) % w) - R;
        a[i * 3 + 1] = this.heightAt(a[i * 3], a[i * 3 + 2]) + 0.15 + ((M.base[i * 3 + 1] + 2 + Math.sin(t * 0.4 + i * 2.3) * 0.5 + 11) % 9);
      }
      M.pts.geometry.attributes.position.needsUpdate = true;
      M.pts.visible = this.camMode === 'eye';
    }
    if (P && P.M) {
      const pa = P.geo.attributes.position.array, sz = P.geo.attributes.aSize.array, al = P.geo.attributes.aAlpha.array;
      for (let k = 0; k < P.M; k++) {
        if (P.life[k] <= 0) { al[k] = 0; continue; }
        P.age[k] += dt;
        const f = P.age[k] / P.life[k];
        if (f >= 1) { P.life[k] = 0; al[k] = 0; continue; }
        pa[k * 3] += P.vel[k * 3] * dt; pa[k * 3 + 1] += P.vel[k * 3 + 1] * dt; pa[k * 3 + 2] += P.vel[k * 3 + 2] * dt;
        P.vel[k * 3 + 1] *= 1 - 0.6 * dt;
        sz[k] = 0.5 + f * 1.9;
        al[k] = 0.3 * (1 - f) * Math.min(1, f * 8);
      }
      P.geo.attributes.position.needsUpdate = P.geo.attributes.aSize.needsUpdate = P.geo.attributes.aAlpha.needsUpdate = true;
      P.pts.material.uniforms.scale.value = this.H * 0.6 / Math.tan((this.wCam.fov * DEG) / 2) * 0.5 / 1.0;
    }
  }

  // Rocks: the HiRISE photo can't show anything smaller than a metre, so scatter what a walker would see:
  // angular boulders, flat slabs of broken bedrock and loose gravel, gathered in drifts and clear of the trail.
  #buildRocks() {
    const rand = rng(4711), eva = this.data.route.eva;
    const route = [];
    for (let i = 0; i < eva.length; i += 2) { const w = this.worldOf(eva[i].lon, eva[i].lat); route.push(w.x, w.z); }
    const nearTrail = (x, z, r) => { for (let i = 0; i < route.length; i += 2) { const dx = route[i] - x, dz = route[i + 1] - z; if (dx * dx + dz * dz < r * r) return true; } return false; };
    // Drifts: places where stones collect (the lee of ridges, old scree).
    const drifts = [];
    for (let i = 0; i < 70; i++) {
      const v = eva[Math.floor(rand() * eva.length)], c = this.worldOf(v.lon, v.lat), a = rand() * 6.28, r = 6 + rand() * 45;
      drifts.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, s: 2.5 + rand() * 9 });
    }
    const pickSpot = (clear) => {
      for (let tries = 0; tries < 12; tries++) {
        let x, z;
        if (rand() < 0.72) {
          const d = drifts[Math.floor(rand() * drifts.length)], a = rand() * 6.28, r = d.s * Math.pow(rand(), 0.7);
          x = d.x + Math.cos(a) * r; z = d.z + Math.sin(a) * r;
        } else {
          const v = eva[Math.floor(rand() * eva.length)], c = this.worldOf(v.lon, v.lat), a = rand() * 6.28, r = 3 + rand() * 75;
          x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
        }
        if (!nearTrail(x, z, clear)) return [x, z];
      }
      return null;
    };
    const palette = [[0.2, 0.16, 0.15], [0.3, 0.2, 0.16], [0.42, 0.27, 0.19], [0.5, 0.38, 0.29], [0.58, 0.47, 0.37]];
    const make = (geos, n, flat, sizeFn, clear) => {
      const mat = toon(0xffffff, false);
      const per = Math.ceil(n / geos.length), meshes = [];
      geos.forEach((geo) => {
        const mesh = new THREE.InstancedMesh(geo, mat, per);
        let used = 0;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
        for (let i = 0; i < per; i++) {
          const spot = pickSpot(clear);
          if (!spot) continue;
          const [x, z] = spot, sz = sizeFn(rand());
          e.set(flat ? (rand() - 0.5) * 0.35 : rand() * 3, rand() * 6.28, flat ? (rand() - 0.5) * 0.35 : rand() * 3);
          q.setFromEuler(e);
          const sy = flat ? sz * (0.5 + rand() * 0.4) : sz * (0.45 + rand() * 0.4);
          // Seat it on the lowest ground under its footprint and bury it a little, as real stones sit in regolith.
          const r0 = sz * 0.9;
          const ground = Math.min(this.heightAt(x, z), this.heightAt(x + r0, z), this.heightAt(x - r0, z), this.heightAt(x, z + r0), this.heightAt(x, z - r0));
          m.compose(new THREE.Vector3(x, ground - sy * (flat ? 0.45 : 0.35), z), q, new THREE.Vector3(sz * (0.8 + rand() * 0.5), sy, sz * (0.8 + rand() * 0.4)));
          mesh.setMatrixAt(used, m);
          const c = palette[Math.floor(Math.pow(rand(), 1.3) * palette.length)], j = 0.88 + rand() * 0.24;
          mesh.setColorAt(used, col.setRGB(c[0] * j, c[1] * j, c[2] * j));
          used++;
        }
        mesh.count = used;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.wScene.add(mesh);
        meshes.push(mesh);
      });
      return meshes;
    };
    make([0, 1, 2, 3].map((i) => stoneGeometry(2, i * 9.1 + 2, false)), 420, false, (r) => 0.22 + Math.pow(r, 2.6) * 0.8, 2.2);
    make([0, 1, 2].map((i) => stoneGeometry(2, i * 5.3 + 40, true)), 360, true, (r) => 0.35 + Math.pow(r, 2) * 0.8, 2.0);
    make([0, 1, 2, 3, 4].map((i) => stoneGeometry(1, i * 3.7 + 90, i % 2 === 0)), 2400, false, (r) => 0.04 + Math.pow(r, 2.2) * 0.12, 1.2);
  }

  #overlay(canvas, opacity = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
    }));
    m.renderOrder = 1;
    m.visible = false;
    this.wScene.add(m);
    return m;
  }

  #buildOverlays() {
    const t = this.t, ov = this.ov = {};
    const rgb = [[47, 138, 87, 40], [224, 161, 27, 120], [215, 64, 47, 150]];
    ov.slope = this.#overlay(paintCanvas(t.cols, t.rows, (d) => { for (let i = 0; i < t.size; i++) d.set(rgb[t.cls[i]], i * 4); }), 0.6);
    const top = Math.max(0.12, t.maxShield * 0.8);
    ov.shield = this.#overlay(paintCanvas(t.cols, t.rows, (d) => {
      for (let i = 0; i < t.size; i++) { const v = Math.min(1, t.shield[i] / top); d.set([125, 80, 220, Math.round(v * v * 235)], i * 4); }
    }), 0.85);
    const lo = t.meta.minElevM, hi = t.meta.maxElevM, stops = [[46, 74, 107], [183, 143, 74], [239, 227, 207]];
    ov.height = this.#overlay(paintCanvas(t.cols, t.rows, (d) => {
      for (let i = 0; i < t.size; i++) {
        const f = clamp((t.z[i] - lo) / (hi - lo), 0, 1) * 2, j = Math.min(1, Math.floor(f)), u = f - j;
        const a = stops[j], b = stops[j + 1];
        d.set([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 160], i * 4);
      }
    }), 0.8);
    ov.home = null;
  }

  // One line for every five minutes of walking back to the rover.
  setHome(field) {
    const t = this.t, S = 2, W = t.cols * S, H = t.rows * S, cost = field.cost;
    const at = (x, y) => {
      const fx = clamp((x + 0.5) / S - 0.5, 0, t.cols - 1), fy = clamp((y + 0.5) / S - 0.5, 0, t.rows - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, t.cols - 1), y1 = Math.min(y0 + 1, t.rows - 1);
      const a = cost[y0 * t.cols + x0], b = cost[y0 * t.cols + x1], c = cost[y1 * t.cols + x0], d = cost[y1 * t.cols + x1];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) return -1;
      const tx = fx - x0, ty = fy - y0;
      return Math.floor(((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) / 300);
    };
    const canvas = paintCanvas(W, H, (d) => {
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const b = at(x, y);
        if (b !== at(x + 1, y) || b !== at(x, y + 1)) d.set([255, 255, 255, 230], (y * W + x) * 4);
      }
    });
    const was = this.ov.home, on = was ? was.visible : false;
    if (was) { this.wScene.remove(was); was.material.map.dispose(); was.material.dispose(); }
    this.ov.home = this.#overlay(canvas, 0.9);
    this.ov.home.visible = on;
  }

  #tube(pts, radius, segs, radial = 6) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 2000;
    return new THREE.TubeGeometry(curve, segs, radius, radial, false);
  }

  #buildRoute() {
    this.route = null;
    this.alts = [];
    this.setRoute(this.data.route.eva);
    const track = this.data.route.roverTrack.map((p) => this.worldOf(p[0], p[1], 0.05));
    this.track = new THREE.Mesh(this.#tube(track, 0.09, 1600, 4), new THREE.MeshBasicMaterial({ color: 0xfbeedb, transparent: true, opacity: 0.9, fog: true }));
    this.track.visible = false;
    this.wScene.add(this.track);
    this.back = null;
  }

  // The route, drawn on the ground like a heads-up path: a thin glowing ribbon you can follow.
  setRoute(eva) {
    if (this.route) { this.wScene.remove(this.route); this.route.geometry.dispose(); }
    this.eva = eva;
    const pts = eva.map((v) => this.worldOf(v.lon, v.lat, 0.08));
    const geo = this.routeGeo = this.#tube(pts, 0.11, 1400, 4);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
    // Fade the line in over the first few metres in front of you, like a projection on the visor rather than paint on the ground.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(2.0, 9.0, length(vWP - cameraPosition));');
    };
    this.route = new THREE.Mesh(geo, mat);
    this.route.renderOrder = 2;
    this.wScene.add(this.route);
    this.#paintRoute();
  }

  setAlternatives(lines) {
    for (const m of this.alts) { this.wScene.remove(m); m.geometry.dispose(); }
    this.alts = (lines || []).map((line) => {
      const m = new THREE.Mesh(this.#tube(line.map((p) => this.worldOf(p.lon, p.lat, 0.1)), 0.06, 600, 4),
        new THREE.MeshBasicMaterial({ color: 0xf0e7d9, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      this.wScene.add(m);
      return m;
    });
  }

  #paintRoute() {
    const geo = this.routeGeo, col = geo.attributes.color, rings = 1401, per = 5;
    const eva = this.eva, total = eva[eva.length - 1].distM;
    const units = this.data.mission.layers.minerals.units.map((u) => ({ ...u, c: new THREE.Color(u.color) }));
    const mode = this.layers.has('slope') ? 'slope' : this.layers.has('rocks') ? 'rocks' : 'plain';
    const classes = ['#e2742f', '#d99a1e', '#a8261a'].map((h) => new THREE.Color(h));
    const plain = new THREE.Color('#e2742f');
    let j = 0;
    for (let r = 0; r < rings; r++) {
      const d = (r / (rings - 1)) * total;
      while (j < eva.length - 2 && eva[j + 1].distM < d) j++;
      let c = plain;
      if (mode === 'slope') c = classes[classify(eva[j].slopeDeg, this.t.limits)];
      else if (mode === 'rocks') { const u = units.find((q) => d >= q.routeFromM && d <= q.routeToM + 1); c = u ? u.c : plain; }
      for (let v = 0; v < per && r * per + v < col.count; v++) col.setXYZ(r * per + v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  drawReturn(pts) {
    if (this.back) { this.wScene.remove(this.back); this.back.geometry.dispose(); this.back = null; }
    if (!pts || pts.length < 2) return;
    const v = pts.map((p) => this.worldOf(p.lon, p.lat, 0.2));
    this.back = new THREE.Mesh(this.#tube(v, 0.1, Math.max(80, pts.length * 3), 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
    this.back.renderOrder = 3;
    this.wScene.add(this.back);
  }

  // Cairns at true size: a hand-stacked pile of flat stones, and for the one you are heading to,
  // a faint beam the visor draws up into the haze so you can find it from far off.
  #buildMarkers() {
    const wps = this.data.mission.waypoints, rand = rng(2024);
    this.cairns = [];
    const tints = [0xd2c0a6, 0xbba083, 0xdccdb6, 0xad9279, 0xc8b295].map((h) => new THREE.Color(h));
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying float vT; void main(){ vT = (position.y + 40.0) / 80.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vT; void main(){ float a = 0.30 * pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.03, vT); gl_FragColor = vec4(1.0, 0.7, 0.46, a); }',
    });
    wps.forEach((wp, k) => {
      const mat = toon(0xffffff, true);
      mat.emissive = new THREE.Color(0x000000);
      const g = new THREE.Group();
      let y = 0;
      for (let n = 0; n < 8; n++) {
        const r = 0.8 - n * 0.085, ry = 0.17 - n * 0.007;
        const mesh = new THREE.Mesh(stoneGeometry(2, k * 13 + n * 4.1, true, tints[(n + k) % tints.length]), mat);
        mesh.scale.set(r * (0.9 + rand() * 0.3), ry * 1.5, r * (0.85 + rand() * 0.3));
        y += ry * 0.5;
        mesh.position.set((rand() - 0.5) * r * 0.22, y, (rand() - 0.5) * r * 0.22);
        mesh.rotation.set((rand() - 0.5) * 0.18, rand() * 6.28, (rand() - 0.5) * 0.18);
        y += ry * 0.62;
        mesh.castShadow = true; mesh.receiveShadow = true;
        g.add(mesh);
        const ol = inkOutline(mesh.geometry, 0.07);
        ol.position.copy(mesh.position); ol.rotation.copy(mesh.rotation); ol.scale.copy(mesh.scale);
        g.add(ol);
      }
      // a few fallen stones at the foot of the pile
      for (let n = 0; n < 5; n++) {
        const a = rand() * 6.28, d = 0.85 + rand() * 0.6, sz = 0.07 + rand() * 0.12;
        const m = new THREE.Mesh(stoneGeometry(1, k * 7 + n * 2.7, n % 2 === 0, tints[n % tints.length]), mat);
        m.scale.set(sz * 1.3, sz * 0.7, sz); m.position.set(Math.cos(a) * d, sz * 0.25, Math.sin(a) * d); m.rotation.y = rand() * 6;
        m.castShadow = true;
        g.add(m);
      }
      const flag = new THREE.Group();   // kept as an empty hook for the wind animation
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 80, 20, 1, true), beamMat);
      beam.position.y = 40; beam.visible = false; beam.frustumCulled = false;
      g.add(beam);
      // A cairn stands beside the trail, not on it: 3.5 m to the left of the way the rover drove.
      const at = this.cairnPoint(k);
      g.position.copy(at);
      g.rotation.y = rand() * 6.28;
      g.scale.setScalar(k && wp.type !== 'rover' ? 1 : 0.001);   // no cairn at the hatch or at the rover itself
      this.wScene.add(g);
      this.cairns.push({ g, mat, rise: 1, flag, beam });

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stop';
      el.innerHTML = `<b>${k === 0 ? '' : k}</b><span>${wp.plain.title}</span><em></em>`;
      if (k === 0) el.dataset.start = '';
      el.addEventListener('click', () => this.onStop(k));
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'walk', local: at.clone().setY(at.y + 2.6), id: k });
    });
  }

  // Where cairn k stands: beside the trail at that waypoint, on the ground.
  cairnPoint(k) {
    this.cairnAt = this.cairnAt || {};
    if (this.cairnAt[k]) return this.cairnAt[k].clone();
    const wp = this.data.mission.waypoints[k], eva = this.data.route.eva;
    let best = 0, bd = Infinity;
    eva.forEach((v, i) => { const d = (v.lon - wp.lon) ** 2 + (v.lat - wp.lat) ** 2; if (d < bd) { bd = d; best = i; } });
    const a = this.worldOf(eva[Math.max(0, best - 3)].lon, eva[Math.max(0, best - 3)].lat);
    const b = this.worldOf(eva[Math.min(eva.length - 1, best + 3)].lon, eva[Math.min(eva.length - 1, best + 3)].lat);
    const c = this.worldOf(wp.lon, wp.lat);
    let dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const x = c.x + dz * 3.5, z = c.z - dx * 3.5;
    this.cairnAt[k] = new THREE.Vector3(x, this.heightAt(x, z), z);
    return this.cairnAt[k].clone();
  }

  // A walker adds a stone to a cairn: it drops onto the top of the pile and stays.
  addStone(k, instant = false) {
    const c = this.cairns[k];
    if (!c) return;
    let top = 0;
    for (const m of c.g.children) {
      if (!m.isMesh || m === c.beam || m.isInstancedMesh) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      top = Math.max(top, m.position.y + m.geometry.boundingBox.max.y * m.scale.y);
    }
    const n = (c.added = (c.added || 0) + 1), sz = 0.15 + ((n * 37) % 5) * 0.012;
    const m = new THREE.Mesh(stoneGeometry(2, 991 + n * 3.7, true, new THREE.Color(0xe8dcc6)), c.mat);
    m.scale.set(sz * 1.5, sz * 0.85, sz * 1.25);
    m.rotation.y = n * 1.7;
    const rest = top + sz * 0.3;
    m.position.set(((n * 13) % 7 - 3) * 0.015, instant ? rest : rest + 1.4, ((n * 7) % 5 - 2) * 0.015);
    m.castShadow = true;
    c.g.add(m);
    if (!instant) (this.drops = this.drops || []).push({ m, rest, v: 0 });
  }

  // Everyone else's stones: laid in a widening spiral around the foot of the cairn, a mound that grows
  // with every visitor (the first few hundred are drawn; after that the mound is full).
  setCommunal(k, n) {
    const c = this.cairns[k];
    if (!c) return;
    if (c.communal) { c.g.remove(c.communal); c.communal = null; }
    n = Math.min(n, 420);
    if (!n) return;
    const geo = stoneGeometry(1, 404, true, new THREE.Color(0xd9c9ae));
    const mesh = new THREE.InstancedMesh(geo, c.mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = 1.05 + 0.13 * Math.sqrt(i), sz = 0.1 + ((i * 7919) % 11) * 0.009;
      const layer = Math.floor(i / 60);
      p.set(Math.cos(a) * (r - layer * 0.35), sz * 0.3 + layer * 0.14, Math.sin(a) * (r - layer * 0.35));
      e.set(((i * 31) % 7 - 3) * 0.05, i * 1.3, ((i * 17) % 5 - 2) * 0.05);
      sc.set(sz * 1.5, sz * 0.8, sz * 1.2);
      m.compose(p, q.setFromEuler(e), sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    c.communal = mesh;
    c.g.add(mesh);
  }

  // Raise or hide cairns: before the rover has stopped somewhere, there is nothing there.
  setCairns(visibleUpTo) {
    const wps = this.data.mission.waypoints;
    this.cairns.forEach((c, k) => { c.target = k > 0 && k <= visibleUpTo && wps[k].type !== 'rover' ? 1 : 0; });
  }

  markStops(here, reached) {
    // The cairn you are heading to: the next one after where you stand, or the one the leg is aimed at.
    const next = here >= 0 ? here + 1 : reached >= 1 ? reached : reached === 0 ? 1 : -1;
    this.cairns.forEach((c, k) => { c.mat.emissive.set(k === here ? 0x5a2410 : 0x000000); c.beam.visible = false; /* the drawing marks the next cairn on the card, not with a light */ });
    for (const p of this.pins) {
      if (p.kind !== 'walk') continue;
      p.el.toggleAttribute('data-next', p.id === next);
      p.el.toggleAttribute('data-here', p.id === here);
      p.el.toggleAttribute('data-done', p.id < reached && p.id !== here);
    }
  }

  setPinsVisible(on) { this.pinsOn = on; }

  // ------------------------------------------------------------ the rover (tools/blender_rover.py)
  async loadRover(meta) {
    const buf = await (await fetch(meta.bin)).arrayBuffer();
    const root = new THREE.Group();          // three.js frame: +X forward, +Y up, +Z right
    const model = new THREE.Group();
    model.scale.setScalar(1 / meta.unitsPerMetre);
    root.add(model);
    this.wheels = [];
    for (const p of meta.parts) {
      const g = new THREE.BufferGeometry();
      const P = new Int16Array(buf, p.positions, p.count * 3), N = new Int8Array(buf, p.normals, p.count * 3);
      // Blender (x fwd, y left, z up) -> three (x fwd, y up, z right)
      const pos = new Int16Array(p.count * 3), nor = new Int8Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        pos[i * 3] = P[i * 3]; pos[i * 3 + 1] = P[i * 3 + 2]; pos[i * 3 + 2] = -P[i * 3 + 1];
        nor[i * 3] = N[i * 3]; nor[i * 3 + 1] = N[i * 3 + 2]; nor[i * 3 + 2] = -N[i * 3 + 1];
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
      // Livery, painted per vertex from the Blender frame (millimetres): graphite chassis, rust-orange body,
      // pearl deck, steel mast; wheels with graphite tyres, a steel ring and an orange hub.
      const col = new Float32Array(p.count * 3), body = p.name === 'body', K = ROVER_PAINT;
      const tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (body) {
          const a = smooth(380, 540, z), b = smooth(980, 1100, z), c = smooth(1680, 1800, z);
          tmp.copy(K.graphite).lerp(K.orange, a).lerp(K.pearl, b).lerp(K.steel, c);
          tmp.multiplyScalar(0.9 + 0.1 * Math.min(1, Math.max(0, (y + 1250) / 2500)));
        } else {
          const r = Math.hypot(x, z) / 252;
          tmp.copy(K.tyre).lerp(K.ring, smooth(0.66, 0.6, r)).lerp(K.graphite, smooth(0.5, 0.44, r));
        }
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, toon(0xffffff, true));
      mesh.castShadow = true;
      const ol = inkOutline(g, 26);   // geometry is in millimetres
      if (p.name === 'body') { model.add(mesh, ol); continue; }
      const pivot = new THREE.Group();
      const o = p.origin;   // metres, Blender frame
      pivot.position.set(o[0] * meta.unitsPerMetre, o[2] * meta.unitsPerMetre, -o[1] * meta.unitsPerMetre);
      pivot.add(mesh, ol);
      model.add(pivot);
      this.wheels.push(pivot);
    }
    this.roverR = meta.wheelRadiusM;
    this.rover = root;
    this.roverState = { d: 0 };
    this.wScene.add(root);
    return root;
  }

  // ------------------------------------------------------------ you: a 1.8 m suited figure, drawn like the plates
  #buildFigure() {
    const root = new THREE.Group(), white = toon(0xf2efe8), dark = toon(0x3a3936), gold = toon(0xc98a2c), stripe = toon(0xe2742f);
    const part = (geo, mat, x, y, z, parent = root) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true;
      const o = inkOutline(geo, 0.026); o.position.copy(m.position);
      parent.add(m, o);
      return m;
    };
    // the figure faces +X; legs hang from hip pivots so they can swing
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0, 0.86, side * 0.11); root.add(hip);
      part(new THREE.CylinderGeometry(0.085, 0.08, 0.78, 12), white, 0, -0.42, 0, hip);
      part(new THREE.BoxGeometry(0.28, 0.1, 0.15), dark, 0.04, -0.82, 0, hip);
      this.legs.push(hip);
      const arm = part(new THREE.CylinderGeometry(0.065, 0.06, 0.62, 10), white, 0, 1.12, side * 0.3);
      arm.rotation.x = side * 0.12;
      part(new THREE.SphereGeometry(0.07, 10, 8), dark, 0, 0.78, side * 0.33);
    }
    part(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 14), white, 0, 1.13, 0);
    part(new THREE.BoxGeometry(0.2, 0.58, 0.38), white, -0.21, 1.15, 0);
    part(new THREE.BoxGeometry(0.02, 0.06, 0.24), stripe, -0.315, 1.32, 0);
    part(new THREE.SphereGeometry(0.19, 18, 14), white, 0, 1.6, 0);
    const visor = part(new THREE.SphereGeometry(0.15, 16, 12), gold, 0.08, 1.6, 0);
    visor.scale.set(0.9, 0.85, 0.95);
    root.visible = false;
    this.figure = root;
    this.wScene.add(root);
  }

  // Stand the figure on the real ground at x/z, facing yaw; phase swings the legs while walking.
  placeFigure(x, z, yaw, phase = 0, visible = true) {
    if (!this.figure) this.#buildFigure();
    const f = this.figure;
    f.visible = visible;
    f.position.set(x, this.heightAt(x, z), z);
    f.rotation.y = -yaw;
    const sw = Math.sin(phase) * 0.42;
    this.legs[0].rotation.z = sw; this.legs[1].rotation.z = -sw;
  }

  // Put the rover on the ground at x/z, facing a direction, wheels turned by the distance it rolled.
  placeRover(x, z, yaw, rolled = 0) {
    if (!this.rover) return;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);       // forward on the ground
    const L = 1.75, W = 1.05;
    const hF = this.heightAt(x + fx * L, z + fz * L), hB = this.heightAt(x - fx * L, z - fz * L);
    const hR = this.heightAt(x - fz * W, z + fx * W), hL = this.heightAt(x + fz * W, z - fx * W);
    const fwd = new THREE.Vector3(fx * 2 * L, hF - hB, fz * 2 * L).normalize();
    const right = new THREE.Vector3(-fz * 2 * W, hR - hL, fx * 2 * W).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    right.crossVectors(fwd, up).normalize();
    const m = new THREE.Matrix4().makeBasis(fwd, up, right);
    this.rover.quaternion.setFromRotationMatrix(m);
    this.rover.position.set(x, (hF + hB + hR + hL) / 4, z);
    for (const w of this.wheels) w.rotation.z = -rolled / this.roverR;
    // When it is rolling, the rear wheels throw a little dust.
    if (this.puffs && this.puffs.M) {
      const moved = Math.abs(rolled - (this.puffs.last || 0));
      this.puffs.last = rolled;
      if (moved > 0.02 && moved < 4 && Math.random() < 0.35) {
        const dir = Math.sign(rolled - (this.puffs.prev ?? rolled)) || 1;
        for (const side of [-1, 1]) {
          const px = x - fx * 1.7 * dir - fz * side * 1.05, pz = z - fz * 1.7 * dir + fx * side * 1.05;
          this.#emitPuff(px, this.heightAt(px, pz) + 0.12, pz, -fx * 0.5 * dir + 0.12, -fz * 0.5 * dir + 0.06);
        }
      }
      this.puffs.prev = rolled;
    }
    this.roverTilt = Math.round(Math.acos(clamp(up.y, -1, 1)) / DEG);
  }

  // ------------------------------------------------------------ cameras
  // Orbit / chase view: { lon, lat, dist, polar, az } or a world point via x/y/z.
  flyWalk(v, immediate) {
    const p = v.x !== undefined ? v : this.worldOf(v.lon, v.lat, 0);
    Object.assign(this.camT, { x: p.x, y: p.y, z: p.z, dist: v.dist, polar: v.polar, az: v.az });
    this.camMode = 'orbit';
    if (immediate) Object.assign(this.cam, this.camT);
  }

  aim(lon, lat) {
    const p = this.worldOf(lon, lat, 0);
    Object.assign(this.camT, { x: p.x, y: p.y, z: p.z });
  }

  // First person: stand at a world x/z, eye 1.7 m up (plus lift during the landing), looking along yaw/pitch (radians).
  setEye(x, z, yaw, pitch = -0.05, lift = 0, immediate = false) {
    this.eyeT = { x, z, yaw, pitch, lift };
    if (immediate || !this.eyeNow || this.camMode !== 'eye') this.eyeNow = { ...this.eyeT };
    this.camMode = 'eye';
  }

  #tickWalk(dt, now) {
    const s = this.rate || 3.2;
    if (this.camMode === 'eye' && this.eyeT) {
      const E = this.eyeNow, T = this.eyeT, k = 1 - Math.exp(-(reduce ? 14 : s) * dt);
      for (const key of ['x', 'z', 'pitch', 'lift']) E[key] += (T[key] - E[key]) * k;
      let dy = T.yaw - E.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      E.yaw += dy * k;
      const yaw = E.yaw + this.look.yaw, pitch = clamp(E.pitch + this.look.pitch, -1.2, 0.9);
      // A walker's slight rise and fall, only while the ground is actually moving under them.
      const sp = this.bobPrev ? Math.hypot(E.x - this.bobPrev.x, E.z - this.bobPrev.z) / Math.max(dt, 0.001) : 0;
      this.bobPrev = { x: E.x, z: E.z };
      this.bobAmt = (this.bobAmt || 0) + ((reduce || E.lift > 0.5 ? 0 : Math.min(1, sp / 1.4)) - (this.bobAmt || 0)) * Math.min(1, dt * 4);
      this.bobT = (this.bobT || 0) + dt * 6.5 * this.bobAmt;
      const y = this.heightAt(E.x, E.z) + EYE + E.lift + Math.sin(this.bobT) * 0.022 * this.bobAmt;
      this.wCam.position.set(E.x, y, E.z);
      this.wCam.lookAt(E.x + Math.cos(yaw) * Math.cos(pitch), y + Math.sin(pitch), E.z + Math.sin(yaw) * Math.cos(pitch));
      this.heading = -((yaw / DEG) + 90);       // screen rotation of a north arrow (yaw 0 looks east)
    } else {
      const c = this.cam, T = this.camT, k = 1 - Math.exp(-(reduce ? 12 : this.camRate || 2.6) * dt);
      for (const key of ['x', 'y', 'z', 'dist', 'polar', 'az']) c[key] += (T[key] - c[key]) * k;
      const az = (c.az + this.look.yaw / DEG) * DEG, pol = clamp(c.polar - this.look.pitch / DEG, 10, 85) * DEG;
      this.wCam.position.set(c.x + c.dist * Math.sin(pol) * Math.sin(az), c.y + c.dist * Math.cos(pol), c.z + c.dist * Math.sin(pol) * Math.cos(az));
      this.wCam.lookAt(c.x, c.y, c.z);
      this.heading = c.az + this.look.yaw / DEG;
    }
    this.#tickAir(dt, now);
    if (this.drops && this.drops.length) {
      this.drops = this.drops.filter((d) => {
        d.v += 9.8 * 0.38 * Math.min(dt, 0.05) * 4;          // Mars gravity, a little hurried
        d.m.position.y = Math.max(d.rest, d.m.position.y - d.v * Math.min(dt, 0.05));
        return d.m.position.y > d.rest;
      });
    }
    // Keep the sky around the eye and the sun's shadow box around what we look at.
    this.sky.position.copy(this.wCam.position);
    const focus = this.rover && this.camMode === 'eye' ? this.rover.position : (this.camMode === 'eye' ? this.wCam.position : new THREE.Vector3(this.cam.x, this.cam.y, this.cam.z));
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    // Cairns rise out of the ground when the rover leaves them; their pennants stir in the thin wind.
    this.cairns.forEach((c, i) => { c.flag.rotation.y = Math.sin(now * 0.0017 + i * 1.9) * 0.28; c.flag.rotation.z = Math.sin(now * 0.0023 + i) * 0.05; });
    for (const c of this.cairns) {
      if (c.target === undefined) continue;
      c.rise += ((c.target || 0) - c.rise) * (1 - Math.exp(-2.5 * dt));
      c.g.scale.setScalar(Math.max(0.001, c.rise));
    }
  }

  #bindDrag() {
    const cv = this.canvas;
    let d = null;
    cv.addEventListener('pointerdown', (e) => { if (this.mode !== 'walk') return; d = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!d) return;
      this.look.yaw = clamp(this.look.yaw + (e.clientX - d.x) * 0.004, -Math.PI, Math.PI);
      this.look.pitch = clamp(this.look.pitch - (e.clientY - d.y) * 0.003, -0.9, 0.7);
      d.x = e.clientX; d.y = e.clientY;
    });
    const end = () => { d = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', () => { this.look = { yaw: 0, pitch: 0 }; });
  }

  resetLook() { this.look = { yaw: 0, pitch: 0 }; }

  // Keep the subject in the open part of the screen: right of the story card on a wide screen, above it on a phone.
  // fx, fy are fractions of the view (negative fx moves the picture right, positive fy moves it up).
  setFrameShift(fx = 0, fy = 0) { this.shift = { fx, fy }; this.#applyShift(); }
  #applyShift() {
    const c = this.wCam, sh = this.shift || { fx: 0, fy: 0 };
    if (!this.W || !this.H) return;
    if (sh.fx || sh.fy) c.setViewOffset(this.W, this.H, sh.fx * this.W, sh.fy * this.H, this.W, this.H);
    else c.clearViewOffset();
    c.updateProjectionMatrix();
  }

  // Thinner haze for the overview from high up; the ground-level haze is tuned for standing on it.
  setHaze(density = 0.00055) { this.wScene.fog.density = density; }

  setLayers(set) {
    this.layers = new Set(set);
    this.ov.slope.visible = false;
    this.ov.shield.visible = false;
    if (this.inkMat) { this.inkMat.uniforms.showSlope.value = set.has('slope') ? 1 : 0; this.inkMat.uniforms.showShield.value = set.has('shield') ? 1 : 0; }
    this.ov.height.visible = set.has('height');
    if (this.ov.home) this.ov.home.visible = set.has('home');
    this.track.visible = set.has('track');
    this.#paintRoute();
  }

  // ------------------------------------------------------------ shared
  setMode(m) {
    if (m === this.want) return;
    this.want = m;
    const token = ++this.modeToken;
    this.canvas.classList.add('is-off');
    this.pinRoot.classList.add('is-off');
    setTimeout(() => {
      if (token !== this.modeToken) return;
      this.mode = m;
      this.canvas.classList.toggle('is-off', m === 'none');
      this.pinRoot.classList.toggle('is-off', m === 'none');
    }, reduce ? 0 : 420);
  }

  resize() {
    const box = this.canvas.parentElement, W = box.clientWidth || window.innerWidth, H = box.clientHeight || window.innerHeight;
    if (!W || !H || (W === this.W && H === this.H)) return;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.W = W; this.H = H;
    for (const cam of [this.gCam, this.wCam]) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
    this.#applyShift();
    this.wCam.fov = W / H < 0.8 ? 72 : 62;
    this.wCam.updateProjectionMatrix();
    this.g.base = W > 900 ? 3.7 : 4.6;
  }

  #place() {
    const cam = this.mode === 'globe' ? this.gCam : this.wCam, v = new THREE.Vector3();
    for (const p of this.pins) {
      if (p.kind !== this.mode || (p.kind === 'walk' && this.pinsOn === false)) { p.el.style.display = 'none'; continue; }
      if (p.kind === 'globe') v.copy(p.local).applyMatrix4(this.globe.matrixWorld);
      else v.copy(p.local);
      const dist = p.kind === 'walk' ? v.distanceTo(this.wCam.position) : 0;
      const facing = p.kind === 'globe' ? v.z > 1 / this.gCam.position.z + 0.04 : true;
      v.project(cam);
      const sy = (-v.y * 0.5 + 0.5) * this.H;
      const out = !facing || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || sy < 60;
      p.el.style.display = out ? 'none' : '';
      if (!out) {
        p.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * this.W).toFixed(1)}px, ${sy.toFixed(1)}px)`;
        if (p.kind === 'walk') { const em = p.el.querySelector('em'); if (em) em.textContent = `${Math.round(dist)} m`; }
      }
    }
  }

  #frame(now) {
    requestAnimationFrame((n) => this.#frame(n));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.onFrame) this.onFrame(dt, now);
    if (document.hidden || this.mode === 'none') return;
    if (this.mode === 'globe') { this.#tickGlobe(dt); this.renderer.render(this.gScene, this.gCam); }
    else { this.#tickWalk(dt, now); this.renderer.render(this.wScene, this.wCam); }
    this.#place();
  }
}
