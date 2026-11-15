// REDCAIRN — the stage. One WebGL canvas, two worlds:
//   globe  Mars from Mars Trek's MOLA/HRSC relief, with every quiet machine on it
//   walk   a tilted 2.5D diorama of the real ground: HiRISE photo draped over the 1 m elevation model
import * as THREE from './vendor/three.module.min.js';
import { classify } from './terrain.js';

const EX = 2;            // vertical exaggeration of the walk diorama
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Same mapping THREE.SphereGeometry uses, so markers sit exactly on the texture.
function sph(lon, lat, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2, th = (90 - lat) * DEG;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}

// Viking's true-colour mosaic of Mars, stitched from Mars Trek tiles by tools/blender_globe.py.
function globeTexture() {
  return new Promise((res) => {
    new THREE.TextureLoader().load('assets/img/mars-viking.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      res(t);
    }, undefined, () => res(null));
  });
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
    this.drag = { az: 0, pol: 0 };

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.setClearColor(0x0b0907);

    this.gCam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.wCam = new THREE.PerspectiveCamera(36, 1, 1, 9000);
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
    this.globeMat = mat;
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat));
    s.add(this.globe);
    globeTexture().then((t) => { if (t) { mat.map = t; mat.needsUpdate = true; } });

    // A thin rim of dusty haze.
    const haze = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.74 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.86, 0.46, 0.27, 1.0) * i; }',
    }));
    s.add(haze);

    s.add(new THREE.AmbientLight(0xffffff, 1.3));
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
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd9cdbb, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.55 })));
  }

  setGhosts(ghosts, onPick) {
    this.onPick = onPick;
    for (const gh of ghosts) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ghost';
      el.dataset.id = gh.id;
      el.dataset.state = gh.status;
      el.innerHTML = `<i></i><span>${gh.name}</span>`;
      el.addEventListener('click', () => this.onPick(gh.id));
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'globe', local: sph(gh.lon, gh.lat, 1.006), id: gh.id });
    }
  }

  // Small marks on the globe that only show while one place is in focus.
  addDots(points, only, label) {
    for (const p of points) {
      const el = document.createElement('i');
      el.className = 'dot';
      el.title = label;
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'globe', local: sph(p.lon, p.lat, 1.004), only });
    }
  }

  // Turn the globe to a place, or let it drift when place is null.
  focusGlobe(place, dist) {
    this.g.focus = place;
    this.g.dist = dist || this.g.base;
    for (const p of this.pins) if (p.kind === 'globe') p.el.dataset.on = String(!!place && p.id === place.id);
  }

  #tickGlobe(dt) {
    const g = this.g, rot = this.globe.rotation;
    if (g.focus) {
      const m = sph(g.focus.lon, g.focus.lat);
      const ty = -Math.atan2(m.x, m.z), tx = Math.atan2(m.y, Math.hypot(m.x, m.z));
      let d = ty - rot.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const k = 1 - Math.exp(-3 * dt);
      rot.y += d * k;
      rot.x += (tx - rot.x) * k;
    } else {
      rot.y += dt * (reduce ? 0 : 0.045);
      rot.x += (0.3 - rot.x) * (1 - Math.exp(-2 * dt));
    }
    this.gCam.position.z += (g.dist - this.gCam.position.z) * (1 - Math.exp(-2.4 * dt));
    this.gCam.lookAt(0, 0, 0);
    this.globe.updateMatrixWorld();
  }

  // ------------------------------------------------------------ walk
  worldOf(lon, lat, lift = 0) {
    const t = this.t;
    return new THREE.Vector3(
      (t.fx(lon) - (t.cols - 1) / 2) * t.cellX,
      (t.elevAt(lon, lat) - this.y0) * EX + lift,
      (t.fy(lat) - (t.rows - 1) / 2) * t.cellY,
    );
  }

  #buildWalk() {
    const t = this.t, { cols, rows } = t;
    const s = this.wScene = new THREE.Scene();
    s.fog = new THREE.Fog(0x0b0907, 2400, 6000);
    this.y0 = t.meta.minElevM;

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

    const tex = new THREE.TextureLoader().load('assets/img/site-ortho.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    s.add(this.ground);

    // The cut edge of the block: it reads as a specimen, not a map.
    const base = -46, sp = [], si = [];
    const edge = (ids) => {
      const o = sp.length / 3;
      for (const i of ids) { sp.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); sp.push(pos[i * 3], base, pos[i * 3 + 2]); }
      for (let j = 0; j < ids.length - 1; j++) { const a = o + j * 2; si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    const top = [], bot = [], left = [], right = [];
    for (let c = 0; c < cols; c++) { top.push(c); bot.push((rows - 1) * cols + c); }
    for (let r = 0; r < rows; r++) { left.push(r * cols); right.push(r * cols + cols - 1); }
    [top, bot, left, right].forEach(edge);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si);
    sg.computeVertexNormals();
    s.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x3a281d, roughness: 1, side: THREE.DoubleSide })));

    s.add(new THREE.HemisphereLight(0xffeedd, 0x4a3426, 2.1));
    const sun = new THREE.DirectionalLight(0xffd2a6, 2.4);
    sun.position.set(-700, 520, 380);
    s.add(sun);

    this.#buildOverlays();
    this.#buildRoute();
    this.#buildMarkers();
    this.cam = { x: 0, y: 0, z: 0, dist: 1150, polar: 55, az: 14 };
    this.camT = { ...this.cam };
  }

  #overlay(canvas, opacity = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.renderOrder = 1;
    m.visible = false;
    this.wScene.add(m);
    return m;
  }

  #buildOverlays() {
    const t = this.t, ov = this.ov = {};
    const rgb = [[47, 138, 87, 70], [224, 161, 27, 200], [215, 64, 47, 225]];
    ov.slope = this.#overlay(paintCanvas(t.cols, t.rows, (d) => {
      for (let i = 0; i < t.size; i++) { const c = rgb[t.cls[i]]; d.set(c, i * 4); }
    }), 0.8);
    const top = Math.max(0.12, t.maxShield * 0.8);
    ov.shield = this.#overlay(paintCanvas(t.cols, t.rows, (d) => {
      for (let i = 0; i < t.size; i++) { const v = Math.min(1, t.shield[i] / top); d.set([125, 80, 220, Math.round(v * v * 235)], i * 4); }
    }), 0.9);
    const lo = t.meta.minElevM, hi = t.meta.maxElevM, stops = [[46, 74, 107], [183, 143, 74], [239, 227, 207]];
    ov.height = this.#overlay(paintCanvas(t.cols, t.rows, (d) => {
      for (let i = 0; i < t.size; i++) {
        const f = clamp((t.z[i] - lo) / (hi - lo), 0, 1) * 2, j = Math.min(1, Math.floor(f)), u = f - j;
        const a = stops[j], b = stops[j + 1];
        d.set([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 175], i * 4);
      }
    }), 0.85);
    ov.home = null;
  }

  // One white line for every five minutes of walking back to the rover.
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
      for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
          const b = at(x, y);
          if (b !== at(x + 1, y) || b !== at(x, y + 1)) {
            const major = Math.max(b, at(x + 1, y), at(x, y + 1)) % 3 === 0;
            d.set([255, 255, 255, major ? 245 : 150], (y * W + x) * 4);
          }
        }
      }
    });
    const was = this.ov.home, on = was ? was.visible : false;
    if (was) { this.wScene.remove(was); was.material.map.dispose(); was.material.dispose(); }
    this.ov.home = this.#overlay(canvas, 0.95);
    this.ov.home.visible = on;
  }

  #tube(pts, radius, segs) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 1500;
    return new THREE.TubeGeometry(curve, segs, radius, 6, false);
  }

  #buildRoute() {
    this.route = null;
    this.alts = [];
    this.setRoute(this.data.route.eva);

    const track = this.data.route.roverTrack.map((p) => this.worldOf(p[0], p[1], 1.0));
    this.track = new THREE.Mesh(this.#tube(track, 0.55, 1600), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.track.visible = false;
    this.wScene.add(this.track);

    this.back = null;
  }

  // The walk to draw, as [{ lon, lat, distM, slopeDeg }]. Coloured by slope or rock type when those layers are on.
  setRoute(eva) {
    if (this.route) { this.wScene.remove(this.route); this.route.geometry.dispose(); }
    this.eva = eva;
    const pts = eva.map((v) => this.worldOf(v.lon, v.lat, 2.4));
    const geo = this.routeGeo = this.#tube(pts, 2.6, 720);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.route = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.wScene.add(this.route);
    this.#paintRoute();
  }

  // Faint lines for the routes you did not pick.
  setAlternatives(lines) {
    for (const m of this.alts) { this.wScene.remove(m); m.geometry.dispose(); }
    this.alts = (lines || []).map((line) => {
      const m = new THREE.Mesh(this.#tube(line.map((p) => this.worldOf(p.lon, p.lat, 1.6)), 1.2, 500),
        new THREE.MeshBasicMaterial({ color: 0xf0e7d9, transparent: true, opacity: 0.45, depthWrite: false }));
      this.wScene.add(m);
      return m;
    });
  }

  #paintRoute() {
    const geo = this.routeGeo, col = geo.attributes.color, rings = 721, per = 7;
    const eva = this.eva, total = eva[eva.length - 1].distM;
    const units = this.data.mission.layers.minerals.units.map((u) => ({ ...u, c: new THREE.Color(u.color) }));
    const mode = this.layers.has('slope') ? 'slope' : this.layers.has('rocks') ? 'rocks' : 'plain';
    const classes = ['#4fc27f', '#e0a11b', '#d7402f'].map((h) => new THREE.Color(h));
    const plain = new THREE.Color('#ff8a4c');
    let j = 0;
    for (let r = 0; r < rings; r++) {
      const d = (r / (rings - 1)) * total;
      while (j < eva.length - 2 && eva[j + 1].distM < d) j++;
      let c = plain;
      if (mode === 'slope') c = classes[classify(eva[j].slopeDeg, this.t.limits)];
      else if (mode === 'rocks') { const u = units.find((q) => d >= q.routeFromM && d <= q.routeToM + 1); c = u ? u.c : plain; }
      for (let v = 0; v < per; v++) col.setXYZ(r * per + v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // The dashed way home, drawn as a white tube over the trail.
  drawReturn(pts) {
    if (this.back) { this.wScene.remove(this.back); this.back.geometry.dispose(); this.back = null; }
    if (!pts || pts.length < 2) return;
    const v = pts.map((p) => this.worldOf(p.lon, p.lat, 4.2));
    this.back = new THREE.Mesh(this.#tube(v, 1.6, Math.max(60, pts.length * 3)), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.wScene.add(this.back);
  }

  #buildMarkers() {
    const wps = this.data.mission.waypoints;
    this.cairns = [];
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const sizes = [[7.2, 3.8, 6.6, 3.4], [5.6, 3.2, 5, 9.2], [3.9, 2.8, 3.5, 14], [2.4, 2, 2.3, 18]];
    wps.forEach((wp, k) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe9ddc9, roughness: 0.95, flatShading: true, emissive: 0x000000 });
      const g = new THREE.Group();
      sizes.forEach(([rx, ry, rz, y], n) => {
        const m = new THREE.Mesh(rock, mat);
        m.scale.set(rx, ry, rz);
        m.position.y = y;
        m.rotation.y = n * 1.1 + k;
        g.add(m);
      });
      g.position.copy(this.worldOf(wp.lon, wp.lat, 0));
      this.wScene.add(g);
      this.cairns.push({ g, mat });

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stop';
      el.innerHTML = `<b>${k === 0 ? '' : k}</b><span>${wp.plain.title}</span>`;
      if (k === 0) el.dataset.start = '';
      el.addEventListener('click', () => this.onStop(k));
      this.pinRoot.appendChild(el);
      this.pins.push({ el, kind: 'walk', local: this.worldOf(wp.lon, wp.lat, 30), id: k });
    });

    const crew = this.crew = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    head.position.y = 9;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0.4, depthWrite: false }));
    beam.position.y = 35;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.4, 40), new THREE.MeshBasicMaterial({ color: 0xff7a45, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.8;
    crew.add(head, beam, this.ring);
    this.wScene.add(crew);
  }

  markStops(here, reached) {
    this.cairns.forEach((c, k) => c.mat.emissive.set(k === here ? 0x8a3216 : 0x000000));
    for (const p of this.pins) {
      if (p.kind !== 'walk') continue;
      p.el.toggleAttribute('data-here', p.id === here);
      p.el.toggleAttribute('data-done', p.id < reached && p.id !== here);
    }
  }

  setCrew(lon, lat, follow) {
    this.crew.position.copy(this.worldOf(lon, lat, 0));
    if (follow) this.aim(lon, lat);
  }

  setLayers(set) {
    this.layers = new Set(set);
    this.ov.slope.visible = set.has('slope');
    this.ov.shield.visible = set.has('shield');
    this.ov.height.visible = set.has('height');
    if (this.ov.home) this.ov.home.visible = set.has('home');
    this.track.visible = set.has('track');
    this.#paintRoute();
  }

  // view: { lon, lat, dist, polar, az }
  flyWalk(v, immediate) {
    const p = this.worldOf(v.lon, v.lat, 0);
    Object.assign(this.camT, { x: p.x, y: p.y, z: p.z, dist: v.dist, polar: v.polar, az: v.az });
    this.drag = { az: 0, pol: 0 };
    if (immediate) Object.assign(this.cam, this.camT);
  }

  aim(lon, lat) {
    const p = this.worldOf(lon, lat, 0);
    Object.assign(this.camT, { x: p.x, y: p.y, z: p.z });
  }

  #tickWalk(dt, now) {
    const c = this.cam, T = this.camT, k = 1 - Math.exp(-(reduce ? 12 : 3.2) * dt);
    for (const key of ['x', 'y', 'z', 'dist', 'polar', 'az']) c[key] += (T[key] - c[key]) * k;
    this.heading = c.az + this.drag.az;   // degrees; 0 = looking north
    const az = (c.az + this.drag.az) * DEG, pol = clamp(c.polar + this.drag.pol, 14, 80) * DEG;
    this.wCam.position.set(c.x + c.dist * Math.sin(pol) * Math.sin(az), c.y + c.dist * Math.cos(pol), c.z + c.dist * Math.sin(pol) * Math.cos(az));
    this.wCam.lookAt(c.x, c.y, c.z);
    const s = 1 + 0.25 * Math.sin(now / 320);
    this.ring.scale.set(s, s, s);
  }

  #bindDrag() {
    const cv = this.canvas;
    let d = null;
    cv.addEventListener('pointerdown', (e) => { if (this.mode !== 'walk') return; d = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!d) return;
      this.drag.az = clamp(this.drag.az - (e.clientX - d.x) * 0.3, -80, 80);
      if (!d.touch) this.drag.pol = clamp(this.drag.pol + (e.clientY - d.y) * 0.2, -40, 25);
      d.x = e.clientX; d.y = e.clientY;
    });
    const end = () => { d = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', () => { this.drag = { az: 0, pol: 0 }; });
  }

  // ------------------------------------------------------------ shared
  // Fade out, swap worlds, fade in. 'none' leaves the canvas dark (the mountain section uses its own drawing).
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
    }, reduce ? 0 : 320);
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight, wide = W > 900;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.W = W; this.H = H;
    for (const cam of [this.gCam, this.wCam]) {
      cam.aspect = W / H;
      cam.setViewOffset(W, H, wide ? -W * 0.17 : 0, wide ? 0 : H * 0.2, W, H);
      cam.updateProjectionMatrix();
    }
    this.g.base = wide ? 3.7 : 4.4;
    if (!this.g.focus) this.g.dist = this.g.base;
  }

  #place() {
    const cam = this.mode === 'globe' ? this.gCam : this.wCam, v = new THREE.Vector3();
    for (const p of this.pins) {
      if (p.kind !== this.mode || (p.only && !(this.g.focus && this.g.focus.id === p.only))) { p.el.style.display = 'none'; continue; }
      if (p.kind === 'globe') v.copy(p.local).applyMatrix4(this.globe.matrixWorld);
      else v.copy(p.local);
      const facing = p.kind === 'globe' ? v.z > 1 / this.gCam.position.z + 0.04 : true;
      v.project(cam);
      const sy = (-v.y * 0.5 + 0.5) * this.H;
      const out = !facing || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || sy < 72;   // never under the top bar
      p.el.style.display = out ? 'none' : '';
      if (!out) p.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * this.W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * this.H).toFixed(1)}px)`;
    }
  }

  #frame(now) {
    requestAnimationFrame((n) => this.#frame(n));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden || this.mode === 'none') return;
    if (this.mode === 'globe') { this.#tickGlobe(dt); this.renderer.render(this.gScene, this.gCam); }
    else { this.#tickWalk(dt, now); this.renderer.render(this.wScene, this.wCam); }
    this.#place();
  }
}
