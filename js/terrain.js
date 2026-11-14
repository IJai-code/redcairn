// Terrain grid: elevation, slope, sky shielding and least-cost routing.
// Everything here runs on the 2 m grid baked from the 1 m orbital elevation model.

export const MARS_RADIUS_M = 3396190;
export const M_PER_DEG = (Math.PI * MARS_RADIUS_M) / 180;

export const CLS_SAFE = 0;
export const CLS_CAUTION = 1;
export const CLS_NOGO = 2;

export function classify(deg, limits) {
  const a = Math.abs(deg);
  if (a >= limits.noGo) return CLS_NOGO;
  if (a >= limits.caution) return CLS_CAUTION;
  return CLS_SAFE;
}

export class Terrain {
  constructor(meta, int16, limits) {
    this.meta = meta;
    this.cols = meta.cols;
    this.rows = meta.rows;
    this.size = this.cols * this.rows;
    const b = meta.bounds;
    this.west = b.west;
    this.east = b.east;
    this.north = b.north;
    this.south = b.south;
    this.dLon = (b.east - b.west) / this.cols;
    this.dLat = (b.north - b.south) / this.rows;
    this.cellX = meta.cellMX;
    this.cellY = meta.cellMY;
    this.limits = limits;

    this.z = new Float32Array(this.size);
    for (let i = 0; i < this.size; i++) this.z[i] = meta.baseElevM + int16[i] / meta.unitsPerMetre;

    this.slope = new Float32Array(this.size);
    this.cls = new Uint8Array(this.size);
    this.shield = new Float32Array(this.size);
    this.#computeSlope();
    this.#computeShield();
  }

  static async load(metaUrl, limits) {
    const meta = await fetchJson(metaUrl);
    const res = await fetch(meta.file);
    if (!res.ok) throw new Error(`terrain grid: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== meta.cols * meta.rows * 2) throw new Error('terrain grid: unexpected size');
    const view = new DataView(buf);
    const data = new Int16Array(meta.cols * meta.rows);
    for (let i = 0; i < data.length; i++) data[i] = view.getInt16(i * 2, true);
    return new Terrain(meta, data, limits);
  }

  // Fractional cell coordinates; integer values sit on cell centres.
  fx(lon) { return (lon - this.west) / this.dLon - 0.5; }
  fy(lat) { return (this.north - lat) / this.dLat - 0.5; }
  lonOf(cx) { return this.west + (cx + 0.5) * this.dLon; }
  latOf(cy) { return this.north - (cy + 0.5) * this.dLat; }

  contains(lon, lat) {
    return lon >= this.west && lon <= this.east && lat >= this.south && lat <= this.north;
  }

  cellIndex(lon, lat) {
    const cx = clamp(Math.round(this.fx(lon)), 0, this.cols - 1);
    const cy = clamp(Math.round(this.fy(lat)), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  lonLatOfIndex(idx) {
    const cy = Math.floor(idx / this.cols);
    return { lon: this.lonOf(idx - cy * this.cols), lat: this.latOf(cy) };
  }

  sample(arr, lon, lat) {
    const x = clamp(this.fx(lon), 0, this.cols - 1);
    const y = clamp(this.fy(lat), 0, this.rows - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.cols - 1), y1 = Math.min(y0 + 1, this.rows - 1);
    const tx = x - x0, ty = y - y0;
    const a = arr[y0 * this.cols + x0], b = arr[y0 * this.cols + x1];
    const c = arr[y1 * this.cols + x0], d = arr[y1 * this.cols + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  elevAt(lon, lat) { return this.sample(this.z, lon, lat); }

  // Horn's method on the 3x3 neighbourhood.
  #computeSlope() {
    const { cols, rows, z, cellX, cellY } = this;
    for (let y = 0; y < rows; y++) {
      const ym = y > 0 ? y - 1 : y, yp = y < rows - 1 ? y + 1 : y;
      for (let x = 0; x < cols; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < cols - 1 ? x + 1 : x;
        const dzdx = ((z[ym * cols + xp] + 2 * z[y * cols + xp] + z[yp * cols + xp]) -
                      (z[ym * cols + xm] + 2 * z[y * cols + xm] + z[yp * cols + xm])) / (8 * cellX);
        const dzdy = ((z[yp * cols + xm] + 2 * z[yp * cols + x] + z[yp * cols + xp]) -
                      (z[ym * cols + xm] + 2 * z[ym * cols + x] + z[ym * cols + xp])) / (8 * cellY);
        const deg = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
        const i = y * cols + x;
        this.slope[i] = deg;
        this.cls[i] = classify(deg, this.limits);
      }
    }
  }

  // Fraction of the sky hemisphere hidden by surrounding terrain, seen from
  // 1 m above the ground. Scanned in 16 directions out to 80 m on a 4 m grid.
  #computeShield() {
    const { cols, rows, z, cellX, cellY } = this;
    const STEP = 2, DIRS = 16, REACH = 20, EYE = 1.0;
    const dirs = [];
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2;
      dirs.push([Math.sin(a), -Math.cos(a)]);
    }
    const ccols = Math.ceil(cols / STEP), crows = Math.ceil(rows / STEP);
    const coarse = new Float32Array(ccols * crows);
    for (let cy = 0; cy < crows; cy++) {
      for (let cx = 0; cx < ccols; cx++) {
        const x = Math.min(cx * STEP, cols - 1), y = Math.min(cy * STEP, rows - 1);
        const z0 = z[y * cols + x] + EYE;
        let sum = 0;
        for (let k = 0; k < DIRS; k++) {
          const dx = dirs[k][0], dy = dirs[k][1];
          let maxTan = 0;
          for (let s = 1; s <= REACH; s++) {
            const sx = Math.round(x + dx * s * STEP), sy = Math.round(y + dy * s * STEP);
            if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) break;
            const run = Math.hypot((sx - x) * cellX, (sy - y) * cellY);
            const t = (z[sy * cols + sx] - z0) / run;
            if (t > maxTan) maxTan = t;
          }
          // The part of the hemisphere below elevation angle h has solid-angle fraction sin(h).
          sum += maxTan / Math.sqrt(1 + maxTan * maxTan);
        }
        coarse[cy * ccols + cx] = sum / DIRS;
      }
    }
    let max = 0;
    for (let y = 0; y < rows; y++) {
      const cy = Math.min(Math.floor(y / STEP), crows - 1);
      for (let x = 0; x < cols; x++) {
        const v = coarse[cy * ccols + Math.min(Math.floor(x / STEP), ccols - 1)];
        this.shield[y * cols + x] = v;
        if (v > max) max = v;
      }
    }
    this.maxShield = max;
  }

  // Best-shielded cells, kept at least minSepM apart.
  shelters(count, minSepM) {
    const { cols, rows, shield } = this;
    const order = [];
    for (let y = 4; y < rows - 4; y += 2) {
      for (let x = 4; x < cols - 4; x += 2) {
        const i = y * cols + x;
        if (this.cls[i] !== CLS_NOGO) order.push(i);
      }
    }
    order.sort((a, b) => shield[b] - shield[a]);
    const picked = [];
    for (const i of order) {
      const y = Math.floor(i / cols), x = i - y * cols;
      const far = picked.every((p) => Math.hypot((p.x - x) * this.cellX, (p.y - y) * this.cellY) >= minSepM);
      if (far) picked.push({ x, y, idx: i, blocked: shield[i], ...this.lonLatOfIndex(i) });
      if (picked.length >= count) break;
    }
    return picked;
  }
}

// Binary min-heap keyed by cost; stale entries are skipped on pop.
class Heap {
  constructor() { this.k = []; this.n = []; }
  get size() { return this.k.length; }
  push(key, node) {
    const k = this.k, n = this.n;
    let i = k.length;
    k.push(key); n.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; n[i] = n[p];
      i = p;
    }
    k[i] = key; n[i] = node;
  }
  pop() {
    const k = this.k, n = this.n;
    const topK = k[0], topN = n[0];
    const lastK = k.pop(), lastN = n.pop();
    const len = k.length;
    if (len > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; n[i] = n[c];
        i = c;
      }
      k[i] = lastK; n[i] = lastN;
    }
    return [topK, topN];
  }
}

const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1],
];

export class Router {
  constructor(terrain, suit) {
    this.t = terrain;
    this.suit = suit;
    this.baseMs = (suit.speed.suitFactor * suit.speed.baseKmh) / 3.6;
    this.moves = NEIGHBOURS.map(([dx, dy]) => ({
      dx, dy, dist: Math.hypot(dx * terrain.cellX, dy * terrain.cellY),
    }));
  }

  // Seconds to walk from every cell to the target, plus the next cell on that walk.
  //   mode      'fastest' | 'safest'
  //   doseAware weight exposed cells so the walk favours terrain shielding
  //   stopAt    stop early once this cell is settled (single-leg routing)
  field(targetIdx, { mode = 'fastest', doseAware = false, shieldEff = 0, stopAt = -1 } = {}) {
    const { cols, rows, z, cls, slope, shield, size } = this.t;
    const { k, offset } = this.suit.speed;
    const cost = new Float32Array(size).fill(Infinity);
    const next = new Int32Array(size).fill(-1);
    const done = new Uint8Array(size);
    const heap = new Heap();
    cost[targetIdx] = 0;
    heap.push(0, targetIdx);
    const penalty = mode === 'safest' ? [1, 4, 80] : [1, 1.6, 60];

    while (heap.size) {
      const [c, u] = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === stopAt) break;
      const uy = Math.floor(u / cols), ux = u - uy * cols;
      for (let m = 0; m < this.moves.length; m++) {
        const mv = this.moves[m];
        const vx = ux + mv.dx, vy = uy + mv.dy;
        if (vx < 0 || vy < 0 || vx >= cols || vy >= rows) continue;
        const v = vy * cols + vx;
        if (done[v]) continue;
        // The walk is v -> u, so the grade is taken in that direction.
        const grade = (z[u] - z[v]) / mv.dist;
        let w = mv.dist / (this.baseMs * Math.exp(-k * Math.abs(grade + offset)));
        w *= penalty[cls[v]];
        if (mode === 'safest') { const s = slope[v] / 12; w *= 1 + s * s; }
        if (doseAware) w *= 1 - shieldEff * shield[v];
        const nc = c + w;
        if (nc < cost[v]) {
          cost[v] = nc;
          next[v] = u;
          heap.push(nc, v);
        }
      }
    }
    return { cost, next, target: targetIdx };
  }

  // Cell-centre path from a start cell down the field to its target.
  trace(field, startIdx) {
    const out = [];
    let i = startIdx, guard = this.t.size;
    while (i !== -1 && guard-- > 0) {
      out.push(this.t.lonLatOfIndex(i));
      if (i === field.target) break;
      i = field.next[i];
    }
    return out;
  }
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function groundMetres(a, b) {
  const lat0 = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * M_PER_DEG * Math.cos(lat0), (b.lat - a.lat) * M_PER_DEG);
}
