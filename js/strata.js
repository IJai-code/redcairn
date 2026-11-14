// REDCAIRN — "Read the mountain": the six layers of Gale crater as a 2.5D stack you can pull apart.

import { fetchJson } from './terrain.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// Isometric geometry of one slab.
const HW = 150, HH = 75, CX = 200, BASE = 600, MAX_GAP = 40, PULL = 40;

const PATTERNS = {
  pebbles: '<g fill="rgba(0,0,0,.24)"><circle cx="5" cy="6" r="3"/><circle cx="16" cy="5" r="2"/><circle cx="12" cy="15" r="3.2"/><circle cx="22" cy="19" r="2.2"/><circle cx="4" cy="21" r="2"/></g>',
  laminated: '<g fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"><path d="M0 3H24M0 9H24M0 15H24M0 21H24"/></g><g fill="none" stroke="rgba(0,0,0,.2)"><path d="M0 6H24M0 12H24M0 18H24M0 24H24"/></g>',
  clay: '<g fill="rgba(255,255,255,.28)"><circle cx="3" cy="3" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="15" cy="3" r="1"/><circle cx="21" cy="9" r="1"/><circle cx="6" cy="15" r="1"/><circle cx="13" cy="19" r="1"/><circle cx="20" cy="22" r="1"/><circle cx="2" cy="22" r="1"/></g>',
  box: '<g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"><path d="M0 0L24 24M24 0L0 24"/></g>',
  wind: '<g fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.2"><path d="M0 6c6-5 12 5 24 0M0 18c6-5 12 5 24 0"/></g>',
  blocks: '<g fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"><path d="M0 8H24M0 16H24M8 0V8M16 8V16M8 16V24"/></g>',
};

const S = { data: null, cur: 0, explode: 0, built: false, slabs: [] };

function build() {
  const { layers } = S.data;
  const svg = $('strata-svg');
  let y = BASE;
  let defs = '', body = '';
  layers.forEach((l, i) => {
    const t = l.thickness, yt = y - t;
    const T = [CX, yt - HH], R = [CX + HW, yt], B = [CX, yt + HH], L = [CX - HW, yt];
    const pts = (a) => a.map((p) => p.join(',')).join(' ');
    const down = (p) => [p[0], p[1] + t];
    const left = pts([L, B, down(B), down(L)]);
    const right = pts([B, R, down(R), down(B)]);
    const top = pts([T, R, B, L]);
    defs += `<pattern id="p-${l.id}" width="24" height="24" patternUnits="userSpaceOnUse">${PATTERNS[l.pattern]}</pattern>`;
    const lx = CX + HW + 14, ly = yt + HH / 2 + t / 2;
    let extra = '';
    if (l.here) {
      const cx = CX + HW * 0.5, cy = yt + HH * 0.5 + t / 2 + 4;
      extra = `<g class="here"><ellipse cx="${cx}" cy="${cy + 7}" rx="9" ry="3.4" fill="#b4441f" stroke="#fff" stroke-width="1.4"/><ellipse cx="${cx}" cy="${cy + 1}" rx="6.5" ry="3" fill="#b4441f" stroke="#fff" stroke-width="1.4"/><ellipse cx="${cx}" cy="${cy - 4}" rx="4" ry="2.6" fill="#b4441f" stroke="#fff" stroke-width="1.4"/></g>`;
    }
    let seam = '';
    if (l.id === 'siccar') {
      const wob = (x1, y1, x2, y2) => { let d = `M${x1} ${y1 + t}`; for (let k = 1; k <= 6; k++) d += `L${x1 + (x2 - x1) * k / 6} ${y1 + (y2 - y1) * k / 6 + t + (k % 2 ? -4 : 3)}`; return d; };
      seam = `<path class="seam" d="${wob(L[0], L[1], B[0], B[1])}${wob(B[0], B[1], R[0], R[1]).replace('M', 'L')}"/>`;
    }
    body += `
      <g class="slab" data-i="${i}" tabindex="0" role="button" aria-label="${esc(l.name)}">
        <g class="slab__float" style="animation-delay:${-i * 0.9}s">
          <polygon points="${top}" fill="${shade(l.color, -0.12)}"/>
          <polygon points="${left}" fill="${shade(l.color, 0.2)}"/>
          <polygon points="${right}" fill="${shade(l.color, 0.38)}"/>
          <polygon points="${left}" fill="url(#p-${l.id})"/>
          <polygon points="${right}" fill="url(#p-${l.id})"/>
          <polygon class="edge" points="${top}"/>
          <polyline class="edge" points="${pts([L, down(L), down(B), down(R), R])}"/>
          <line class="edge" x1="${B[0]}" y1="${B[1]}" x2="${B[0]}" y2="${B[1] + t}"/>
          ${seam}${extra}
          <text class="lab" x="${lx}" y="${ly - 2}"><tspan class="lab__n">${i + 1}</tspan> ${esc(l.name)}</text>
          <text class="lab lab--sub" x="${lx}" y="${ly + 14}">${esc(l.where.split('.')[0])}</text>
          ${l.here ? `<text class="lab lab--here" x="${lx}" y="${ly + 30}">★ your walk</text>` : ''}
        </g>
      </g>`;
    y = yt;
  });
  svg.innerHTML = `<defs>${defs}</defs>${body}`;
  S.slabs = [...svg.querySelectorAll('.slab')];
  S.built = true;
}

function place() {
  const gap = S.explode * MAX_GAP;
  S.slabs.forEach((g, i) => {
    g.style.transform = `translate(${i === S.cur ? PULL : 0}px, ${-i * gap}px)`;
    g.dataset.on = String(i === S.cur);
  });
}

function render() {
  const d = S.data, l = d.layers[S.cur], n = d.layers.length;
  $('strata-scene').style.setProperty('--glow', l.glow);
  const bars = d.layers.map((x, i) => `<button type="button" class="wet__bar" data-i="${i}" ${i === S.cur ? 'aria-current="true"' : ''} aria-label="${esc(x.name)}: ${x.wet}% wet"><i style="height:${Math.max(4, x.wet)}%"></i><span>${i + 1}</span></button>`).join('');
  $('strata-body').innerHTML = `
    <p class="eyebrow">Page ${S.cur + 1} of ${n} · ${S.cur === 0 ? 'oldest' : S.cur === n - 1 ? 'youngest' : 'reading upward'}</p>
    <h2 class="strata__name">${esc(l.name)}</h2>
    <p class="strata__where">${esc(l.where)} · ${esc(l.kind)}</p>
    <p class="strata__feel">${esc(l.feeling)}</p>
    <p>${esc(l.fact)}</p>
    <p class="strata__seen">${esc(l.seen)}</p>
    ${l.here ? '<p class="strata__you">You are here. The walk in this guide is on this page.</p>' : ''}
    <div class="wet" role="group" aria-label="${esc(d.wetNote)}">
      <div class="wet__bars">${bars}</div>
      <small>${esc(d.wetNote)}</small>
    </div>
    ${S.cur === n - 1 ? `<p class="strata__close">${esc(d.closing)}</p>` : ''}
    <small class="strata__scale">${esc(d.scaleNote)} ${d.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</small>`;
  $('strata-prev').disabled = S.cur === 0;
  $('strata-next').textContent = S.cur === n - 1 ? 'Back to the walk' : `Next: ${d.layers[S.cur + 1].name}`;
  $('strata-body').scrollTop = 0;
}

function select(i) {
  const n = S.data.layers.length;
  if (i < 0 || i >= n) return;
  S.cur = i;
  place();
  render();
}

export function initStrata() {
  const dlg = $('strata');
  $('strata-scene').addEventListener('click', (e) => { const g = e.target.closest('.slab'); if (g) select(Number(g.dataset.i)); });
  $('strata-scene').addEventListener('keydown', (e) => {
    const g = e.target.closest('.slab');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(Number(g.dataset.i)); }
  });
  $('strata-body').addEventListener('click', (e) => { const b = e.target.closest('.wet__bar'); if (b) select(Number(b.dataset.i)); });
  $('strata-prev').addEventListener('click', () => select(S.cur - 1));
  $('strata-next').addEventListener('click', () => (S.cur === S.data.layers.length - 1 ? dlg.close() : select(S.cur + 1)));
  $('strata-gap').addEventListener('input', (e) => { S.explode = e.target.value / 100; place(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') select(S.cur + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') select(S.cur - 1);
  });
}

// Opens the dialog with the stack closed, then lets the layers drift apart.
export async function openStrata(index = 0) {
  if (!S.data) S.data = await fetchJson('data/strata.json');
  if (!S.built) {
    $('strata-title').textContent = S.data.title;
    $('strata-intro').textContent = S.data.intro;
    build();
  }
  S.cur = index;
  S.explode = 0;
  $('strata-gap').value = 0;
  place();
  render();
  $('strata').showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    S.explode = 0.65;
    $('strata-gap').value = 65;
    place();
  }));
}
