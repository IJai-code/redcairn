// REDCAIRN — Mount Sharp as an isometric stack of six pages, drawn in SVG. Used large (the mountain) and small (the column that follows the walk).

const HW = 150, HH = 75, CX = 190, BASE = 560, GAP = 30, PULL = 34;

const PATTERNS = {
  pebbles: '<g fill="rgba(0,0,0,.24)"><circle cx="5" cy="6" r="3"/><circle cx="16" cy="5" r="2"/><circle cx="12" cy="15" r="3.2"/><circle cx="22" cy="19" r="2.2"/><circle cx="4" cy="21" r="2"/></g>',
  laminated: '<g fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"><path d="M0 3H24M0 9H24M0 15H24M0 21H24"/></g><g fill="none" stroke="rgba(0,0,0,.2)"><path d="M0 6H24M0 12H24M0 18H24M0 24H24"/></g>',
  clay: '<g fill="rgba(255,255,255,.28)"><circle cx="3" cy="3" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="15" cy="3" r="1"/><circle cx="21" cy="9" r="1"/><circle cx="6" cy="15" r="1"/><circle cx="13" cy="19" r="1"/><circle cx="20" cy="22" r="1"/><circle cx="2" cy="22" r="1"/></g>',
  box: '<g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"><path d="M0 0L24 24M24 0L0 24"/></g>',
  wind: '<g fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.2"><path d="M0 6c6-5 12 5 24 0M0 18c6-5 12 5 24 0"/></g>',
  blocks: '<g fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"><path d="M0 8H24M0 16H24M8 0V8M16 8V16M8 16V24"/></g>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.min(255, Math.max(0, v * (1 - k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// Draws the stack into an <svg>. Returns { highlight(i), explode(f) }.
export function buildStack(svg, layers, prefix = 's') {
  let y = BASE, defs = '', body = '';
  layers.forEach((l, i) => {
    const t = l.thickness, yt = y - t;
    const T = [CX, yt - HH], R = [CX + HW, yt], B = [CX, yt + HH], L = [CX - HW, yt];
    const pts = (a) => a.map((p) => p.join(',')).join(' ');
    const dn = (p) => [p[0], p[1] + t];
    const top = pts([T, R, B, L]), left = pts([L, B, dn(B), dn(L)]), right = pts([B, R, dn(R), dn(B)]);
    defs += `<pattern id="${prefix}-${l.id}" width="24" height="24" patternUnits="userSpaceOnUse">${PATTERNS[l.pattern]}</pattern>`;
    const lx = CX + HW + 16, ly = yt + HH / 2 + t / 2;
    let extra = '';
    if (l.here) {
      extra = `<g class="here"><ellipse cx="${CX}" cy="${yt + 12}" rx="10" ry="3.6"/><ellipse cx="${CX}" cy="${yt + 6}" rx="7" ry="3.2"/><ellipse cx="${CX}" cy="${yt + 1}" rx="4.2" ry="2.7"/></g>`;
    }
    if (l.id === 'siccar') {
      let d = `M${L[0]} ${L[1] + t}`;
      for (let k = 1; k <= 6; k++) d += `L${L[0] + (B[0] - L[0]) * k / 6} ${L[1] + (B[1] - L[1]) * k / 6 + t + (k % 2 ? -4 : 3)}`;
      for (let k = 1; k <= 6; k++) d += `L${B[0] + (R[0] - B[0]) * k / 6} ${B[1] + (R[1] - B[1]) * k / 6 + t + (k % 2 ? -4 : 3)}`;
      extra += `<path class="seam" d="${d}"/>`;
    }
    body += `
      <g class="slab" data-i="${i}">
        <g class="slab__float" style="animation-delay:${-i * 0.9}s">
          <polygon points="${top}" fill="${shade(l.color, -0.12)}"/>
          <polygon points="${left}" fill="${shade(l.color, 0.2)}"/>
          <polygon points="${right}" fill="${shade(l.color, 0.38)}"/>
          <polygon points="${left}" fill="url(#${prefix}-${l.id})"/>
          <polygon points="${right}" fill="url(#${prefix}-${l.id})"/>
          <polygon class="edge" points="${top}"/>
          <polyline class="edge" points="${pts([L, dn(L), dn(B), dn(R), R])}"/>
          <line class="edge" x1="${B[0]}" y1="${B[1]}" x2="${B[0]}" y2="${B[1] + t}"/>
          ${extra}
          <text class="lab" x="${lx}" y="${ly - 2}"><tspan class="lab__n">${i + 1}</tspan>  ${esc(l.name)}</text>
          <text class="lab lab--sub" x="${lx}" y="${ly + 15}">${esc(l.where.split('.')[0])}</text>
        </g>
      </g>`;
    y = yt;
  });
  svg.innerHTML = `<defs>${defs}</defs>${body}`;
  const slabs = [...svg.querySelectorAll('.slab')];
  let cur = 0, gap = 0;
  const place = () => {
    slabs.forEach((g, i) => {
      g.style.transform = `translate(${i === cur ? PULL : 0}px, ${-i * gap}px)`;
      g.dataset.on = String(i === cur);
    });
    svg.toggleAttribute('data-all', cur < 0);
  };
  place();
  return {
    highlight(i) { cur = i; place(); },
    explode(f) { gap = GAP * f; place(); },
  };
}

// A small line of how wet the world was, page by page, with the current page marked.
export function sparkline(layers, cur) {
  const W = 300, H = 54, n = layers.length;
  const xy = layers.map((l, i) => [(i / (n - 1)) * (W - 12) + 6, H - 8 - (l.wet / 100) * (H - 16)]);
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Water over time: arriving, lingering, then leaving">
    <path d="${d}" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1.5"/>
    ${xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === cur ? 5 : 2.5}" ${i === cur ? 'class="on"' : ''}/>`).join('')}
  </svg>`;
}
