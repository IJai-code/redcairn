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
  graphite: new THREE.Color(0x2a2a2e), orange: new THREE.Color(0xe5582c), pearl: new THREE.Color(0xece7dc),
  steel: new THREE.Color(0x44525d), tyre: new THREE.Color(0x1d1c1f), ring: new THREE.Color(0x9aa0a4),
};

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

// Fine grain underfoot so no surface is a flat colour. `broad` adds slow, wide patches for the far ground.
function grainShader(mat, broad) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float g = vn(vWP.xz * 1.7) * 0.5 + vn(vWP.xz * 6.3) * 0.3 + vn(vWP.xz * 23.0) * 0.2;
float near = 1.0 - smoothstep(8.0, 70.0, length(vWP - cameraPosition));
diffuseColor.rgb *= mix(1.0, 0.78 + 0.44 * g, near);
${broad ? 'diffuseColor.rgb *= 0.84 + 0.3 * (vn(vWP.xz * 0.011) * 0.6 + vn(vWP.xz * 0.045) * 0.4);' : ''}`);
  };
}

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
    this.mode = 'globe';
    this.want = 'globe';
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
    this.wCam = new THREE.PerspectiveCamera(62, 1, 0.1, 9000);
    this.#buildGlobe();
    this.#buildWalk();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
      // Beyond the photo, the ground carries on in the photo's own colour, so there is no visible edge.
      const c = averageColour(tex.image, 0, 1);
      if (c) for (const m of this.apronMats) m.color.copy(c);
    });

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
    this.cam = { x: 0, y: 0, z: 0, dist: 1150, polar: 55, az: 14 };
    this.camT = { ...this.cam };
    this.eyeT = null;
    this.eyeNow = null;
    this.camMode = 'orbit';
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
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x7c5a43, roughness: 1, side: THREE.DoubleSide });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x7c5a43, roughness: 1 });
    grainShader(apronMat, true);
    grainShader(discMat, true);
    this.apronMats = [apronMat, discMat];
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
          vec3 c = has > 0.5 ? texture2D(map, vec2(u, v)).rgb : mix(haze, vec3(0.2, 0.13, 0.1), clamp(d.y * 2.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.wScene.add(this.sky);
    loadTexture('assets/img/horizon.jpg').then((tex) => {
      if (!tex) return;
      mat.uniforms.map.value = tex; mat.uniforms.has.value = 1;
      // The distance fades into the colour of the real horizon, so ground and sky meet without a seam.
      const c = averageColour(tex.image, 0.455, 0.49);
      if (c) { this.haze.copy(c); this.wScene.fog.color.copy(c); }
    });
  }

  // Rocks: the HiRISE photo can't show anything smaller than a metre, so scatter the cobbles a walker would see.
  #buildRocks() {
    const rand = rng(4711), n = 4200;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rand() * 0.4), p.getY(i) * (0.8 + rand() * 0.4), p.getZ(i) * (0.8 + rand() * 0.4));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const rocks = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const eva = this.data.route.eva;
    for (let i = 0; i < n; i++) {
      const v = eva[Math.floor(rand() * eva.length)];
      const c = this.worldOf(v.lon, v.lat);
      const ang = rand() * Math.PI * 2, rad = 2.2 + Math.pow(rand(), 1.4) * 70;
      const x = c.x + Math.cos(ang) * rad, z = c.z + Math.sin(ang) * rad;
      const sz = 0.04 + Math.pow(rand(), 3.2) * (rad < 8 ? 0.12 : 0.42);
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, this.heightAt(x, z) + sz * 0.15, z), q, new THREE.Vector3(sz * (1 + rand() * 0.6), sz * 0.55, sz));
      rocks.setMatrixAt(i, m);
      col.setRGB(0.42 + rand() * 0.14, 0.3 + rand() * 0.08, 0.22 + rand() * 0.06);
      rocks.setColorAt(i, col);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.wScene.add(rocks);
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
    this.track = new THREE.Mesh(this.#tube(track, 0.35, 1600, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: true }));
    this.track.visible = false;
    this.wScene.add(this.track);
    this.back = null;
  }

  // The route, drawn on the ground like a heads-up path: a thin glowing ribbon you can follow.
  setRoute(eva) {
    if (this.route) { this.wScene.remove(this.route); this.route.geometry.dispose(); }
    this.eva = eva;
    const pts = eva.map((v) => this.worldOf(v.lon, v.lat, 0.08));
    const geo = this.routeGeo = this.#tube(pts, 0.07, 1400, 4);
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
    const classes = ['#4fe08f', '#ffc23a', '#ff5a3c'].map((h) => new THREE.Color(h));
    const plain = new THREE.Color('#9ff2c4');
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

  // Cairns at true size: the stones the rover's stops became.
  #buildMarkers() {
    const wps = this.data.mission.waypoints;
    this.cairns = [];
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const sizes = [[0.42, 0.2, 0.38, 0.18], [0.32, 0.17, 0.3, 0.5], [0.24, 0.15, 0.22, 0.78], [0.15, 0.12, 0.14, 1.02]];
    wps.forEach((wp, k) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd9ccb6, roughness: 0.95, flatShading: true, emissive: 0x000000 });
      const g = new THREE.Group();
      sizes.forEach(([rx, ry, rz, y], n) => {
        const m = new THREE.Mesh(rock, mat);
        m.scale.set(rx, ry, rz);
        m.position.y = y;
        m.rotation.y = n * 1.1 + k;
        m.castShadow = true;
        g.add(m);
      });
      g.position.copy(this.worldOf(wp.lon, wp.lat, 0));
      g.scale.setScalar(k ? 1.25 : 0.001);   // the dock has the rover, not a cairn
      this.wScene.add(g);
      this.cairns.push({ g, mat, rise: 1 });

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stop';
      el.innerHTML = `<b>${k === 0 ? '' : k}</b><span>${wp.plain.title}</span><em></em>`;
      if (k === 0) el.dataset.start = '';
      el.addEventListener('click', () => this.onStop(k));
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'walk', local: this.worldOf(wp.lon, wp.lat, 2.6), id: k });
    });
  }

  // Raise or hide cairns: before the rover has stopped somewhere, there is nothing there.
  setCairns(visibleUpTo) {
    this.cairns.forEach((c, k) => { c.target = k > 0 && k <= visibleUpTo ? 1 : 0; });
  }

  markStops(here, reached) {
    this.cairns.forEach((c, k) => c.mat.emissive.set(k === here ? 0x5a2410 : 0x000000));
    for (const p of this.pins) {
      if (p.kind !== 'walk') continue;
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
          tmp.copy(K.tyre).lerp(K.ring, smooth(0.66, 0.6, r)).lerp(K.orange, smooth(0.5, 0.44, r));
        }
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: body ? 0.36 : 0.62, metalness: body ? 0.22 : 0.12 }));
      mesh.castShadow = true;
      if (p.name === 'body') { model.add(mesh); continue; }
      const pivot = new THREE.Group();
      const o = p.origin;   // metres, Blender frame
      pivot.position.set(o[0] * meta.unitsPerMetre, o[2] * meta.unitsPerMetre, -o[1] * meta.unitsPerMetre);
      pivot.add(mesh);
      model.add(pivot);
      this.wheels.push(pivot);
    }
    this.roverR = meta.wheelRadiusM;
    this.rover = root;
    this.roverState = { d: 0 };
    this.wScene.add(root);
    return root;
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
      const y = this.heightAt(E.x, E.z) + EYE + E.lift;
      this.wCam.position.set(E.x, y, E.z);
      this.wCam.lookAt(E.x + Math.cos(yaw) * Math.cos(pitch), y + Math.sin(pitch), E.z + Math.sin(yaw) * Math.cos(pitch));
      this.heading = -((yaw / DEG) + 90);       // screen rotation of a north arrow (yaw 0 looks east)
    } else {
      const c = this.cam, T = this.camT, k = 1 - Math.exp(-(reduce ? 12 : 2.6) * dt);
      for (const key of ['x', 'y', 'z', 'dist', 'polar', 'az']) c[key] += (T[key] - c[key]) * k;
      const az = (c.az + this.look.yaw / DEG) * DEG, pol = clamp(c.polar - this.look.pitch / DEG, 10, 85) * DEG;
      this.wCam.position.set(c.x + c.dist * Math.sin(pol) * Math.sin(az), c.y + c.dist * Math.cos(pol), c.z + c.dist * Math.sin(pol) * Math.cos(az));
      this.wCam.lookAt(c.x, c.y, c.z);
      this.heading = c.az + this.look.yaw / DEG;
    }
    // Keep the sky around the eye and the sun's shadow box around what we look at.
    this.sky.position.copy(this.wCam.position);
    const focus = this.rover && this.camMode === 'eye' ? this.rover.position : (this.camMode === 'eye' ? this.wCam.position : new THREE.Vector3(this.cam.x, this.cam.y, this.cam.z));
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    // Cairns rise out of the ground when the rover leaves them.
    for (const c of this.cairns) {
      if (c.target === undefined) continue;
      c.rise += ((c.target || 0) - c.rise) * (1 - Math.exp(-2.5 * dt));
      c.g.scale.setScalar(Math.max(0.001, c.rise * 1.25));
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

  setLayers(set) {
    this.layers = new Set(set);
    this.ov.slope.visible = set.has('slope');
    this.ov.shield.visible = set.has('shield');
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
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.W = W; this.H = H;
    for (const cam of [this.gCam, this.wCam]) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
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
