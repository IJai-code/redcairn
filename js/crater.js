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

export class Crater {
  constructor(root, view, gale, walk) {
    this.root = root;
    this.v = view.views.wide;
    this.gale = gale;
    this.W = this.v.width;
    this.H = this.v.height;
    this.state = null;
    this.cur = null;
    this.drawn = 0;
    this.token = 0;

    root.innerHTML = `
      <div class="crater__frame">
        <img src="${this.v.image}" alt="" width="${this.W}" height="${this.H}" decoding="async">
        <svg viewBox="0 0 ${this.W} ${this.H}" width="${this.W}" height="${this.H}" aria-hidden="true">
          <path class="crater__under"/><path class="crater__line"/><path class="crater__walk"/>
          <circle class="crater__head" r="6"/>
        </svg>
      </div>
      <div class="crater__pins"></div>
      <div class="crater__clock" aria-hidden="true"><b>—</b><span>—</span></div>`;
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

    addEventListener('resize', () => { if (this.state) this.#apply(this.#target(this.state)); });
  }

  #target(state) {
    const vw = innerWidth, vh = innerHeight, wide = vw > 900;
    const cover = Math.max(vw / this.W, vh / this.H);
    if (state === 'line') {
      // Close enough to follow the line, far enough to keep the mountain it has not yet climbed above it.
      const xs = this.v.track.map((p) => p[0]), ys = this.v.track.map((p) => p[1]);
      const fx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const fy = (Math.min(...ys) + Math.max(...ys)) / 2 * 0.7 + this.v.places.summit.xy[1] * 0.3;
      return { fx, fy, s: cover * (wide ? 1.55 : 2.3), sx: wide ? 0.64 : 0.5, sy: wide ? 0.5 : 0.2 };
    }
    return { fx: 0.47, fy: 0.46, s: cover * 1.04, sx: wide ? 0.62 : 0.5, sy: wide ? 0.5 : 0.32 };
  }

  #apply(t) {
    this.cur = t;
    const vw = innerWidth, vh = innerHeight;
    const w = this.W * t.s, h = this.H * t.s;
    const tx = Math.min(0, Math.max(vw - w, t.sx * vw - t.fx * w));
    const ty = Math.min(0, Math.max(vh - h, t.sy * vh - t.fy * h));
    this.frame.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${t.s.toFixed(4)})`;
    // Keep the line a constant width on screen however far we are zoomed in.
    const k = 1 / t.s;
    this.under.style.strokeWidth = 7 * k;
    this.line.style.strokeWidth = 3 * k;
    this.walkPath.style.strokeWidth = 5 * k;
    this.head.setAttribute('r', 6 * k);
    for (const p of this.pins) {
      const x = tx + p.xy[0] * w, y = ty + p.xy[1] * h;
      const on = p.show.includes(this.state) && y > 84 && y < vh - 24 && x > 16 && x < vw - 16;   // never under the top bar
      p.el.style.opacity = on ? 1 : 0;
      // On a narrow screen, put the label on whichever side has room.
      const side = vw > 900 ? p.side : (x < vw / 2 ? 'r' : 'l');
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

  show(state) {
    if (state === this.state) return;
    const token = ++this.token;
    const from = this.cur || this.#target(state);
    this.state = state;
    this.root.dataset.state = state;
    const to = this.#target(state);
    const startDraw = this.drawn;
    const endDraw = state === 'line' ? 1 : 0;
    const dur = reduce ? 0 : 1500, drawDur = reduce ? 0 : 4200;
    const t0 = performance.now();
    const step = (now) => {
      if (token !== this.token) return;
      const f = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = ease(f);
      const t = {};
      for (const k of ['fx', 'fy', 's', 'sx', 'sy']) t[k] = from[k] + (to[k] - from[k]) * e;
      this.#apply(t);
      if (endDraw === 1) {
        const g = drawDur ? Math.min(1, Math.max(0, (now - t0 - 700) / drawDur)) : 1;
        this.#draw(startDraw >= 1 ? 1 : ease(g));
      } else {
        this.#draw(0);
      }
      if (f < 1 || (endDraw === 1 && this.drawn < 1)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function num(n) { return n.toLocaleString('en-US'); }
