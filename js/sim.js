// Suit model: pace, consumables and dose along a path, and playback over time.
// Every constant comes from data/mission.json, where each is labelled as simulated.

import { classify, groundMetres, M_PER_DEG } from './terrain.js';

const DUST_PACE = 0.7;      // pace multiplier in low visibility
const DUST_BATTERY = 1.15;  // extra lighting and heater load

export function speedKmh(slopeDeg, suit, env) {
  const s = suit.speed;
  const grade = Math.tan(slopeDeg * Math.PI / 180);
  const v = s.suitFactor * s.baseKmh * Math.exp(-s.k * Math.abs(grade + s.offset));
  return env && env.dust ? v * DUST_PACE : v;
}

// Evenly spaced points along a polyline of {lon, lat}.
export function resample(line, stepM) {
  if (line.length < 2) return line.slice();
  const out = [{ lon: line[0].lon, lat: line[0].lat }];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const seg = groundMetres(a, b);
    if (seg <= 0) continue;
    let pos = stepM - carry;
    while (pos <= seg) {
      const t = pos / seg;
      out.push({ lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t });
      pos += stepM;
    }
    carry = (carry + seg) % stepM;
  }
  const last = line[line.length - 1];
  if (groundMetres(out[out.length - 1], last) > 0.5) out.push({ lon: last.lon, lat: last.lat });
  return out;
}

// Take the stair-steps out of a grid path without moving its ends.
export function smooth(line, passes = 2) {
  let pts = line;
  for (let p = 0; p < passes; p++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      out.push({
        lon: (pts[i - 1].lon + 2 * pts[i].lon + pts[i + 1].lon) / 4,
        lat: (pts[i - 1].lat + 2 * pts[i].lat + pts[i + 1].lat) / 4,
      });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Attach distance, elevation, along-track slope, slope class and shielding to a path.
export function profile(terrain, line, limits, stepM = 5) {
  const pts = resample(line, stepM).map((p) => ({ lon: p.lon, lat: p.lat }));
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) d += groundMetres(pts[i - 1], pts[i]);
    const p = pts[i];
    p.d = d;
    p.z = terrain.elevAt(p.lon, p.lat);
    const cell = terrain.cellIndex(p.lon, p.lat);
    p.shield = terrain.shield[cell];
    p.terrainCls = terrain.cls[cell];
  }
  for (let i = 0; i < pts.length; i++) {
    const lo = Math.max(0, i - 1), hi = Math.min(pts.length - 1, i + 1);
    const run = pts[hi].d - pts[lo].d;
    pts[i].slope = run > 0 ? Math.atan2(pts[hi].z - pts[lo].z, run) * 180 / Math.PI : 0;
    pts[i].cls = classify(pts[i].slope, limits);
  }
  return pts;
}

export function nearestIndex(pts, target) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dd = groundMetres(pts[i], target);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

export function startState(suit) {
  return { t: 0, o2: suit.oxygen.primaryMin + suit.oxygen.reserveMin, batt: 1, dose: 0 };
}

function rates(slopeDeg, shield, cfg) {
  const { suit, env, radiation } = cfg;
  const m = suit.metabolic;
  const up = Math.max(0, slopeDeg), down = Math.max(0, -slopeDeg);
  const spe = env.spe ? cfg.speMultiplier : 1;
  return {
    o2: 1 + m.consumptionGainPerUphillDeg * up + m.consumptionGainPerDownhillDeg * down, // nominal minutes per minute
    batt: (env.dust ? DUST_BATTERY : 1) / suit.battery.capacityMin,
    dose: (radiation.backgroundMSvPerDay / 1440) * spe * (1 - cfg.shieldEff * shield),   // mSv per minute
  };
}

export function doseRateMSvPerHour(shield, cfg) {
  return rates(0, shield, cfg).dose * 60;
}

// Walk the path, pausing at stops, and record the suit state at every step.
//   stays  Map of point index -> { min, wpId }
export function buildTimeline(pts, stays, start, cfg) {
  const nodes = [];
  let { t, o2, batt, dose } = start;
  const push = (i, kind, wpId) => nodes.push({ t, o2, batt, dose, i, d: pts[i].d, kind, wpId });
  push(0, 'start');
  for (let i = 0; i < pts.length; i++) {
    const stay = stays.get(i);
    if (stay && stay.min > 0) {
      const r = rates(0, pts[i].shield, cfg);
      t += stay.min; o2 -= r.o2 * stay.min; batt -= r.batt * stay.min; dose += r.dose * stay.min;
      push(i, 'stay', stay.wpId);
    }
    if (i === pts.length - 1) break;
    const a = pts[i], b = pts[i + 1];
    const dist = b.d - a.d;
    const slope = (a.slope + b.slope) / 2; // 10 m baseline, signed in the direction of travel
    const dt = dist / 1000 / speedKmh(slope, cfg.suit, cfg.env) * 60;
    const r = rates(slope, (a.shield + b.shield) / 2, cfg);
    t += dt; o2 -= r.o2 * dt; batt -= r.batt * dt; dose += r.dose * dt;
    push(i + 1, 'walk');
  }
  return { nodes, pts, start, end: nodes[nodes.length - 1] };
}

// Suit state and position at time t on a timeline.
export function stateAt(tl, t) {
  const n = tl.nodes;
  if (t <= n[0].t) return snapshot(tl, n[0], n[0], 0);
  const last = n[n.length - 1];
  if (t >= last.t) return { ...snapshot(tl, last, last, 0), done: true };
  let lo = 0, hi = n.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (n[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = n[lo], b = n[hi];
  return snapshot(tl, a, b, (t - a.t) / (b.t - a.t || 1));
}

function snapshot(tl, a, b, f) {
  const pa = tl.pts[a.i], pb = tl.pts[b.i];
  const lerp = (x, y) => x + (y - x) * f;
  const walking = b.kind === 'walk' && a !== b;
  return {
    t: lerp(a.t, b.t), o2: lerp(a.o2, b.o2), batt: lerp(a.batt, b.batt), dose: lerp(a.dose, b.dose),
    lon: lerp(pa.lon, pb.lon), lat: lerp(pa.lat, pb.lat), z: lerp(pa.z, pb.z), d: lerp(a.d, b.d),
    shield: lerp(pa.shield, pb.shield),
    slope: walking ? pb.slope : 0,
    cls: walking ? pb.cls : 0,
    kind: a === b ? 'hold' : b.kind,
    wpId: b.kind === 'stay' ? b.wpId : null,
    ptIndex: f < 0.5 ? a.i : b.i,
    done: false,
  };
}

// Oxygen needed to walk to the dock from a point, given the return-time field (seconds).
export function returnNeedMin(returnSeconds) {
  return (returnSeconds / 60) * 1.1; // 10% allowance for grade
}

export function summarise(tl, returnField, terrain, suit) {
  let maxSlope = 0, caution = 0, nogo = 0, minMargin = Infinity;
  for (const p of tl.pts) {
    const a = Math.abs(p.slope);
    if (a > maxSlope) maxSlope = a;
    if (p.cls === 1) caution++;
    if (p.cls === 2 || p.terrainCls === 2) nogo++;
  }
  for (const n of tl.nodes) {
    const p = tl.pts[n.i];
    const back = returnField.cost[terrain.cellIndex(p.lon, p.lat)];
    const margin = n.o2 - suit.oxygen.reserveMin - returnNeedMin(back);
    if (margin < minMargin) minMargin = margin;
  }
  const end = tl.end;
  return {
    distanceM: tl.pts[tl.pts.length - 1].d,
    durationMin: end.t - tl.start.t,
    o2EndMin: end.o2,
    battEnd: end.batt,
    doseMSv: end.dose - tl.start.dose,
    maxSlopeDeg: maxSlope,
    cautionPts: caution,
    nogoPts: nogo,
    minMarginMin: minMargin,
  };
}

export function metresPerPixel(degPerPixel) { return degPerPixel * M_PER_DEG; }
