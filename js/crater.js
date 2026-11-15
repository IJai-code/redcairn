// REDCAIRN — Gale crater, rendered in Blender (tools/blender_gale.py), with Curiosity's whole track drawn over it.
// The track and the labels come from the same camera as the render, so they sit exactly on the ground.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (f) => (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
const KM_PER_DEG = (2 * Math.PI * 3389.5) / 360;
const SOL_DAYS = 1.02749;
const LANDED = Date.UTC(2012, 7, 6, 5, 17);   // 6 Aug 2012, 05:17 UTC

function dateOfSol(sol) {
  return new Date(LANDED + sol * SOL_DAYS * 86400000);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Crater {
  constructor(root, view, gale, walk) {
    this.root = root;
    this.view = view;
    this.v = view.views.wide;
    this.gale = gale;
    this.on = new Set(['color']);
    this.W = this.v.width;
    this.H = this.v.height;
    this.state = null;
    this.cur = null;
    this.drawn = 0;
    this.token = 0;

    root.innerHTML = `
      <div class="crater__frame">
        ${Object.entries(this.v.images).map(([k, src]) => `<img data-layer="${k}" src="${src}" alt="" width="${this.W}" height="${this.H}" decoding="async" ${k === 'color' ? '' : 'loading="lazy"'}>`).join('')}
        <svg viewBox="0 0 ${this.W} ${this.H}" width="${this.W}" height="${this.H}" aria-hidden="true">
          <path class="crater__under"/><path class="crater__line"/><path class="crater__walk"/>
          <circle class="crater__head" r="6"/>
        </svg>
      </div>
      <div class="crater__pins"></div>
      <div class="layers crater__layers"><p class="layers__head">Map layers</p>
        <div class="chips crater__chips" role="group" aria-label="Crater map layers"></div>
        <div class="legend crater__legend" hidden></div></div>
      <div class="crater__clock" aria-hidden="true"><b>—</b><span>—</span></div>`;
    this.chips = root.querySelector('.crater__chips');
    this.legend = root.querySelector('.crater__legend');
    this.chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.root.dataset.touched = '';
      const id = b.dataset.layer, L = this.layers.find((l) => l.id === id);
      if (L.base) { for (const l of this.layers) if (l.base) this.on.delete(l.id); this.on.add(id); }
      else if (this.on.has(id)) this.on.delete(id); else this.on.add(id);
      this.#layers();
    });
    this.frame = root.querySelector('.crater__frame');
    this.svg = root.querySelector('svg');
    this.under = root.querySelector('.crater__under');
    this.line = root.querySelector('.crater__line');
    this.walkPath = root.querySelector('.crater__walk');
    this.head = root.querySelector('.crater__head');
    this.clock = root.querySelector('.crater__clock');

    // The whole track in image pixels, with the distance driven at each point.
    const px = this.v.track.map(([x, y]) => [x * this.W, y * this.H]);
    const d = px.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    this.under.setAttribute('d', d);
    this.line.setAttribute('d', d);
    this.len = this.line.getTotalLength();
    const tr = gale.traverse;
    let km = 0;
    this.km = tr.map((p, i) => {
      if (i) {
        const q = tr[i - 1];
        km += Math.hypot((p[0] - q[0]) * KM_PER_DEG * Math.cos((p[1] * Math.PI) / 180), (p[1] - q[1]) * KM_PER_DEG);
      }
      return km;
    });
    const scale = gale.rover.distanceKm / km;   // simplified line is a touch shorter than the odometer
    this.km = this.km.map((k) => k * scale);
    this.pxLen = [0];
    for (let i = 1; i < px.length; i++) this.pxLen.push(this.pxLen[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]));

    // The stretch this guide's walk follows, from the first stop to the last.
    const near = (lon, lat) => {
      let best = 0, bd = Infinity;
      tr.forEach((p, i) => { const dd = (p[0] - lon) ** 2 + (p[1] - lat) ** 2; if (dd < bd) { bd = dd; best = i; } });
      return best;
    };
    const a = near(walk[0].lon, walk[0].lat), b = near(walk[walk.length - 1].lon, walk[walk.length - 1].lat);
    const [i0, i1] = a < b ? [a, b] : [b, a];
    this.walkPath.setAttribute('d', px.slice(i0, i1 + 1).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(''));

    // Labels.
    const P = this.v.places;
    const pins = [
      { id: 'summit', show: ['wide', 'line'], side: 'r', text: `Mount Sharp · ${(view.mountain.heightM / 1000).toFixed(1)} km above the floor` },
      { id: 'rim', show: ['wide'], side: 'r', text: 'Far rim of the crater · 154 km across' },
      { id: 'landing', show: ['line'], side: 'l', text: 'Landed · August 2012' },
      { id: 'rover', show: ['line'], side: 'r', text: `Curiosity today · sol ${num(gale.rover.latestSol)}` },
      { id: 'walk', show: ['line'], side: 'l', text: 'Your walk' },
    ];
    const pinRoot = root.querySelector('.crater__pins');
    this.pins = pins.map((p) => {
      const el = document.createElement('div');
      el.className = `cpin cpin--${p.side}`;
      el.dataset.id = p.id;
      el.innerHTML = `<i></i><span>${p.text}</span>`;
      pinRoot.appendChild(el);
      return { ...p, el, xy: P[p.id].xy };
    });

    // Water-made minerals detected from orbit (CRISM on MRO, OMEGA on Mars Express).
    for (const m of this.v.waterMinerals) {
      const el = document.createElement('div');
      el.className = 'cpin cpin--r cpin--water';
      el.innerHTML = `<i></i><span>${m.instruments.join(' + ')}</span>`;
      pinRoot.appendChild(el);
      this.pins.push({ id: 'water', show: ['wide', 'orbit', 'line'], side: 'r', layer: 'water', el, xy: m.xy });
    }

    const units = view.geologicUnits;
    const h = view.mountain;
    this.layers = [
      { id: 'color', base: true, name: 'True colour', kind: 'Optical · Viking orbiters' },
      { id: 'height', base: true, name: 'Height', kind: 'Topographic · MOLA + HRSC',
        legend: [['linear-gradient(90deg,#3b3bd0,#2fb0c8,#47c25a,#d8d23a,#d9772f)', `Low to high: floor ${num(h.floorElevM)} m, summit +${num(h.summitElevM)} m`]] },
      { id: 'geology', base: true, name: 'Rock units (USGS)', kind: 'Geologic · USGS SIM 3292',
        legend: [[units[0].color, `${units[0].unit} · Mount Sharp’s own rock, about 3 to 3.7 billion years old`],
                 [units[1].color, `${units[1].unit} · the crater and the ground around it`]] },
      { id: 'water', name: 'Water minerals from orbit', kind: 'Spectral · CRISM + OMEGA', legend: [['#6fb7e0', 'Minerals that only form in water']] },
      { id: 'track', name: 'Curiosity’s track', kind: 'Ground truth · rover odometry', legend: [['#ff9a6b', `Curiosity’s ${gale.rover.distanceKm.toFixed(1)} km, August 2012 to today`]] },
    ];
    this.#layers();

    addEventListener('resize', () => { if (this.state) this.#apply(this.#target(this.state)); });
  }

  // Show the chosen layers: one base picture (colour, height or rock units) plus the water dots and the track.
  #layers() {
    const base = this.layers.find((l) => l.base && this.on.has(l.id)) || this.layers[0];
    for (const img of this.frame.querySelectorAll('img')) img.style.opacity = img.dataset.layer === 'color' || img.dataset.layer === base.id ? 1 : 0;
    this.svg.style.opacity = this.on.has('track') ? 1 : 0;
    if (this.on.has('track') && this.state && this.state !== 'line' && this.drawn < 1) this.#draw(1);
    this.root.toggleAttribute('data-water', this.on.has('water'));
    this.chips.innerHTML = this.layers.map((l) => `<button type="button" data-layer="${l.id}" aria-pressed="${l.base ? l === base : this.on.has(l.id)}" title="${esc(l.kind)}">${esc(l.name)}</button>`).join('');
    const shown = this.layers.filter((l) => l.legend && (this.on.has(l.id)));
    this.legend.hidden = !shown.length;
    this.legend.innerHTML = shown.map((l) => `<b title="${esc(l.kind)}">${esc(l.name)}</b>${l.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}`).join('');
    if (this.cur) this.#apply(this.cur);
  }

  setLayers(ids) {
    this.on = new Set(ids);
    this.#layers();
  }

  #target(state) {
    const vw = innerWidth, vh = innerHeight, wide = vw > 900;
    // On a phone the words cover the lower part of the screen, so the picture only has to fill the band above them.
    const cover = Math.max(vw / this.W, this.#band() / this.H);
    if (state === 'line') {
      // Close enough to follow the line, far enough to keep the mountain it has not yet climbed above it.
      const xs = this.v.track.map((p) => p[0]), ys = this.v.track.map((p) => p[1]);
      const fx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      const fy = wide ? mid * 0.7 + this.v.places.summit.xy[1] * 0.3 : mid;
      return { fx, fy, s: cover * (wide ? 1.55 : 3), sx: wide ? 0.64 : 0.5, sy: wide ? 0.5 : 0.3 };
    }
    if (state === 'orbit') return wide ? { fx: 0.56, fy: 0.5, s: cover * 1.1, sx: 0.62, sy: 0.5 } : { fx: 0.55, fy: 0.5, s: cover * 1.25, sx: 0.5, sy: 0.3 };
    return wide ? { fx: 0.47, fy: 0.46, s: cover * 1.04, sx: 0.62, sy: 0.5 } : { fx: 0.47, fy: 0.45, s: cover, sx: 0.5, sy: 0.3 };
  }

  #band() {
    return innerWidth > 900 ? innerHeight : Math.round(innerHeight * 0.58);
  }

  #apply(t) {
    this.cur = t;
    const vw = innerWidth, vh = innerHeight, band = this.#band();
    const w = this.W * t.s, h = this.H * t.s;
    const tx = Math.min(0, Math.max(vw - w, t.sx * vw - t.fx * w));
    const ty = Math.min(0, Math.max(band - h, t.sy * vh - t.fy * h));
    this.frame.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${t.s.toFixed(4)})`;
    // Keep the line a constant width on screen however far we are zoomed in.
    const k = 1 / t.s;
    this.under.style.strokeWidth = 7 * k;
    this.line.style.strokeWidth = 3 * k;
    this.walkPath.style.strokeWidth = 5 * k;
    this.head.setAttribute('r', 6 * k);
    for (const p of this.pins) {
      const x = tx + p.xy[0] * w, y = ty + p.xy[1] * h;
      // Never under the top bar, the lander frame, or the lander's own text, and on a wide screen never under the story text on the left.
      const wideScr = vw > 900;
      const clear = y > Math.max(84, vh * 0.14) && y < vh * 0.84 && x > (wideScr ? vw * 0.38 : 16) && x < vw * 0.9 && !(wideScr && y > vh * 0.7 && x < vw * 0.62);
      const on = p.show.includes(this.state) && (!p.layer || this.on.has(p.layer)) && clear;
      p.el.style.opacity = on ? 1 : 0;
      // On a narrow screen, put the label on whichever side has room.
      const side = vw > 900 && !p.layer ? p.side : (x < vw * (vw > 900 ? 0.7 : 0.5) ? 'r' : 'l');
      p.el.classList.toggle('cpin--r', side === 'r');
      p.el.classList.toggle('cpin--l', side === 'l');
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // Draw the track from landing (f = 0) to today (f = 1), with the date and distance at the head.
  #draw(f) {
    this.drawn = f;
    const L = this.len * f;
    for (const el of [this.under, this.line]) { el.style.strokeDasharray = `${this.len}`; el.style.strokeDashoffset = `${this.len - L}`; }
    this.walkPath.style.opacity = f > 0.985 ? 1 : 0;
    const p = this.line.getPointAtLength(L);
    this.head.setAttribute('cx', p.x);
    this.head.setAttribute('cy', p.y);
    this.head.style.opacity = f > 0 && f < 1 ? 1 : 0;
    // Which point of the track is the head on, and so how far had the rover driven, and on which sol?
    let i = this.pxLen.findIndex((x) => x >= L);
    if (i < 0) i = this.pxLen.length - 1;
    const km = this.km[i];
    const table = this.gale.solByKm;
    let j = table.findIndex((r) => r[0] >= km);
    if (j < 0) j = table.length - 1;
    const sol = f >= 1 ? this.gale.rover.latestSol : table[j][1];
    const when = dateOfSol(sol).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    this.clock.querySelector('b').textContent = `${km.toFixed(1)} km`;
    this.clock.querySelector('span').textContent = `sol ${num(sol)} · ${when}`;
  }

  show(state, layers) {
    if (layers) this.setLayers(layers);
    if (state === this.state) return;
    const token = ++this.token;
    const from = this.cur || this.#target(state);
    this.state = state;
    this.root.dataset.state = state;
    const to = this.#target(state);
    const startDraw = this.drawn;
    const animateDraw = state === 'line' && startDraw < 1 && this.on.has('track');
    const dur = reduce ? 0 : 1500, drawDur = reduce ? 0 : 4200;
    const t0 = performance.now();
    const step = (now) => {
      if (token !== this.token) return;
      const f = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = ease(f);
      const t = {};
      for (const k of ['fx', 'fy', 's', 'sx', 'sy']) t[k] = from[k] + (to[k] - from[k]) * e;
      this.#apply(t);
      if (animateDraw) {
        const g = drawDur ? Math.min(1, Math.max(0, (now - t0 - 700) / drawDur)) : 1;
        this.#draw(ease(g));
      } else {
        this.#draw(this.on.has('track') ? 1 : 0);
      }
      if (f < 1 || (animateDraw && this.drawn < 1)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function num(n) { return n.toLocaleString('en-US'); }
