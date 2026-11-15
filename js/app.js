// REDCAIRN — your first walk on Mars.
// A mission you play in about three minutes, on real ground, with the map an astronaut would carry:
//   Brief    the habitat display: Mars, Gale crater and its orbital layers, the rover's 14-year track
//   Plan     pick a route on the 3D ground; time, slope, air and dose come from the terrain engine
//   Marswalk the helmet HUD at each stop, over Curiosity's real photo from that spot; science costs suit time
//   Storm    a simulated solar particle event: choose how to get home, judged on the real terrain and radiation
//   Debrief  what you brought back and what it cost; then every layer is yours to explore

import { Terrain, Router, fetchJson, groundMetres } from './terrain.js';
import * as sim from './sim.js';
import { Stage } from './scene.js';
import { Crater } from './crater.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (m) => { const v = Math.max(0, Math.round(m)); return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, '0')} min`; };
const clock = (m) => { const v = Math.max(0, Math.round(m)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const num = (n) => Number(n).toLocaleString('en-US');
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : `{${k}}`));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const STORM_HOURS = 2;   // drill assumption: how long the simulated storm lasts if you wait it out

// Layers on the walk map. Each says what it shows, what kind of data it is and where it came from.
const LAYERS = [
  { id: 'slope', name: 'Steepness', kind: 'Topographic', from: 'MRO HiRISE 1 m elevation model, via Mars Trek',
    legend: [['#4fc27f', 'Safe in a suit (under 15°)'], ['#e0a11b', 'Take care (15–20°)'], ['#d7402f', 'Too steep (over 20°)']] },
  { id: 'rocks', name: 'Rock type', kind: 'Chemical', from: 'Curiosity rover drill and laser',
    legend: [['#4cc9f0', 'Boxwork: groundwater once flowed here'], ['#f4a261', 'Salty layers: Mars drying out']] },
  { id: 'height', name: 'Height', kind: 'Topographic', from: 'MRO HiRISE 1 m elevation model, via Mars Trek',
    legend: [['linear-gradient(90deg,#2e4a6b,#b78f4a,#efe3cf)', 'Low to high, 77 m of climb on the walk']] },
  { id: 'shield', name: 'Radiation shelter', kind: 'Radiation', from: 'Curiosity RAD + elevation model',
    legend: [['#7d50dc', 'More sky hidden by hills = less dose']] },
  { id: 'home', name: 'Minutes home', kind: 'Computed', from: 'REDCAIRN routing on the elevation model',
    legend: [['#ffffff', 'Each line: 5 more minutes from the rover']] },
  { id: 'track', name: 'Rover tracks', kind: 'Ground truth', from: 'Curiosity traverse' },
];

const ROUTES = [
  { id: 'rover', name: 'Rover-proven', note: 'Every metre already driven by Curiosity. Rocks too small to see from orbit are already known.' },
  { id: 'fast', name: 'Fastest', note: 'Quickest on the elevation model, but across ground no rover has checked.' },
  { id: 'gentle', name: 'Gentlest', note: 'Keeps off steep ground, even when that takes longer.' },
];

const PHASES = [['brief', 'Brief'], ['plan', 'Plan'], ['walk', 'Marswalk'], ['debrief', 'Debrief']];

const S = { step: null, env: { spe: false, dust: false }, layerOn: new Set(), curT: 0, anim: 0, walkInit: false, routes: null, pick: 'rover', unlocked: false };

const stops = () => S.mission.waypoints;
const cellOf = (p) => S.terrain.cellIndex(p.lon, p.lat);
function cfgFor(spe) {
  const rad = S.mission.hazards.radiation;
  const ev = S.mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  return { suit: S.mission.suit, env: { spe, dust: false }, radiation: rad, speMultiplier: ev.demoSeverityMultiplier, shieldEff: rad.terrainShielding.efficiency };
}
const reserve = () => S.mission.suit.oxygen.reserveMin;

// ---------- routes and plans ----------
function legsFor(mode) {
  const w = stops();
  let line = [];
  for (let k = 0; k < w.length - 1; k++) {
    const a = w[k], b = w[k + 1];
    const f = S.router.field(cellOf(b), { mode, stopAt: cellOf(a) });
    const seg = S.router.trace(f, cellOf(a)).map((p) => ({ lon: p.lon, lat: p.lat }));
    seg[0] = { lon: a.lon, lat: a.lat };
    seg[seg.length - 1] = { lon: b.lon, lat: b.lat };
    line = line.concat(k ? seg.slice(1) : seg);
  }
  return sim.smooth(line, 3);
}

function planFor(line) {
  const out = sim.profile(S.terrain, line, S.limits, 5);
  const back = sim.profile(S.terrain, line.slice().reverse(), S.limits, 5);
  const outD = out[out.length - 1].d;
  const pts = out.concat(back.slice(1).map((p) => ({ ...p, d: p.d + outD })));
  const idx = stops().map((wp, k) => (k === stops().length - 1 ? out.length - 1 : k === 0 ? 0 : sim.nearestIndex(out, wp)));
  let maxSlope = 0, careM = 0;
  for (let i = 1; i < out.length; i++) {
    maxSlope = Math.max(maxSlope, Math.abs(out[i].slope));
    if (out[i].cls > 0) careM += out[i].d - out[i - 1].d;
  }
  return { line, out, pts, outD, idx, maxSlope, careM };
}

const perTask = (wp) => Math.max(2, Math.round(wp.plannedStayMin / wp.plain.do.length));

// The suit over the whole walk. Stops before the current one use the tasks actually done; later ones assume all.
function timelineFor(plan, done, k = stops().length, c = cfgFor(false)) {
  const stays = new Map();
  stops().forEach((wp, j) => {
    const n = j < k || (j === k && done) ? (done ? done[j].size : wp.plain.do.length) : wp.plain.do.length;
    const m = n * perTask(wp);
    if (m > 0) stays.set(plan.idx[j], { min: m, wpId: wp.id });
  });
  return sim.buildTimeline(plan.pts, stays, sim.startState(S.mission.suit), c);
}

function marks(plan, tl) {
  const arr = [], dep = [];
  stops().forEach((wp, k) => {
    arr[k] = tl.nodes.find((n) => n.i === plan.idx[k] && (n.kind === 'walk' || n.kind === 'start'));
    dep[k] = tl.nodes.find((n) => n.kind === 'stay' && n.wpId === wp.id) || arr[k];
  });
  return { arr, dep };
}

function computeRoutes() {
  if (S.routes) return S.routes;
  const lines = { rover: S.route.eva.map((v) => ({ lon: v.lon, lat: v.lat })), fast: legsFor('fastest'), gentle: legsFor('safest') };
  S.routes = {};
  for (const r of ROUTES) {
    const plan = planFor(lines[r.id]);
    const tl = timelineFor(plan, null);
    S.routes[r.id] = { ...r, plan, tl, min: tl.end.t, air: tl.end.o2 - reserve(), dose: tl.end.dose };
  }
  return S.routes;
}

const evaOf = (plan) => plan.out.map((p) => ({ lon: p.lon, lat: p.lat, distM: p.d, slopeDeg: p.slope }));

// ---------- the walk map (stage) ----------
function applyLayers() {
  S.stage.setLayers(S.layerOn);
  $('chips').innerHTML = LAYERS.map((l) => `<button type="button" data-layer="${l.id}" aria-pressed="${S.layerOn.has(l.id)}" title="${esc(l.kind)} · ${esc(l.from)}">${esc(l.name)}</button>`).join('');
  const lg = [...S.layerOn].map((id) => LAYERS.find((l) => l.id === id)).filter((l) => l && l.legend).pop();
  $('legend').hidden = !lg;
  if (lg) $('legend').innerHTML = `<b>${esc(lg.name)} · ${esc(lg.kind)}</b>${lg.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}<small>${esc(lg.from)}</small>`;
}

function setLayers(ids) { S.layerOn = new Set(ids); applyLayers(); }

function fly(view, layers) {
  if (layers) setLayers(layers);
  S.stage.flyWalk(view, !S.walkInit);
  S.walkInit = true;
}

const views = {
  overview: () => ({ ...S.mission.site.center, dist: 1250, polar: 52, az: 190 }),
  stop: (k) => ({ lon: stops()[k].lon, lat: stops()[k].lat, dist: 360, polar: 58, az: [188, 176, 166, 172, 184, 194][k] }),
  back: () => ({ ...S.mission.site.center, dist: 1300, polar: 50, az: 8 }),
};

function showSuit(st, tl) {
  const air = st.o2 - reserve();
  const homeSec = S.homeField.cost[cellOf(st)];
  const spare = air - sim.returnNeedMin(homeSec);
  $('s-air').textContent = mins(air);
  $('s-home').textContent = homeSec < 30 ? 'here' : mins(homeSec / 60);
  $('s-time').textContent = mins(st.t);
  $('s-dose').textContent = `${st.dose.toFixed(2)} mSv`;
  $('suit').dataset.level = spare < 20 ? 'stop' : spare < 60 ? 'care' : '';
  $('suit-line').innerHTML = homeSec < 30 ? `At the rover: <b>${mins(air)}</b> of air.` : `Walk home from here and keep <b>${mins(spare)}</b> of air spare.`;
  S.stage.setCrew(st.lon, st.lat, false);
  if (tl) $('scrub').value = Math.round((st.t / tl.end.t) * 1000);
}

function moveTo(tl, tB, dur = 1900, follow = true) {
  return new Promise((done) => {
    const token = ++S.anim, tA = S.curT;
    const show = (t) => { S.curT = t; const st = sim.stateAt(tl, t); showSuit(st, tl); if (follow) S.stage.aim(st.lon, st.lat); };
    if (reduce || Math.abs(tB - tA) < 0.5 || !dur) { show(tB); done(); return; }
    const t0 = performance.now();
    const frame = (now) => {
      if (token !== S.anim) return done();
      const f = Math.min(1, (now - t0) / dur);
      show(tA + (tB - tA) * (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2));
      if (f < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
}

// ---------- screen furniture ----------
const deg = (v, pos, neg) => `${Math.abs(v).toFixed(v % 1 ? 3 : 1)}°${v >= 0 ? pos : neg}`;

// The map collar: what this sheet shows, where its edges are, and which way north is.
function stage(mode) {
  document.body.dataset.stage = mode;
  S.stage.setMode(mode === 'globe' ? 'globe' : mode === 'walk' ? 'walk' : 'none');
  const b = S.terrain.meta.bounds, g = S.gale.box;
  const L = {
    globe: ['MARS · TRUE COLOUR', 'VIKING MDIM 2.1 VIA MARS TREK', 'SHEET 1 · PLANET', 'NOT TO SCALE'],
    crater: ['GALE CRATER · AEOLIS MONS', `${deg(g.west, 'E')}–${deg(g.east, 'E')} · ${deg(-g.north, 'S')}–${deg(-g.south, 'S')}`, 'SHEET 2 · CRATER · BLENDER RENDER', 'HEIGHTS ×3 · SCALE VARIES'],
    walk: ['EVA-1 TRAVERSE · BOXWORK, MT SHARP', `${deg(b.west, 'E')}–${deg(b.east, 'E')} · ${deg(-b.north, 'S')}–${deg(-b.south, 'S')}`, 'SHEET 3 · SITE · HIRISE 33 CM + 1 M DEM', 'HEIGHTS ×2 · SCALE VARIES'],
  }[mode] || ['', '', '', ''];
  ['f-tl', 'f-tr', 'f-bl', 'f-br'].forEach((id, i) => { $(id).textContent = L[i]; });
}

function northLoop() {
  const n = $('f-north'), mode = document.body.dataset.stage;
  // The crater camera looks along a bearing of about 161° (from north of the rim toward Mount Sharp).
  const rot = mode === 'walk' ? (S.stage.heading || 0) : mode === 'crater' ? -161 : null;
  n.style.display = rot === null ? 'none' : '';
  if (rot !== null) n.style.transform = `rotate(${rot.toFixed(1)}deg)`;
  requestAnimationFrame(northLoop);
}

function phase(id) {
  $('phases').innerHTML = PHASES.map(([p, label]) => `<li ${p === id ? 'aria-current="step"' : ''}>${label}</li>`).join('');
}

function caption({ kicker = '', title = '', line = '', extra = '', wide = false }) {
  const cap = $('cap');
  cap.classList.remove('is-in');
  void cap.offsetWidth;
  $('cap-kicker').textContent = kicker;
  $('cap-title').innerHTML = title;
  $('cap-line').innerHTML = line;
  $('cap-extra').innerHTML = extra;
  cap.classList.toggle('cap--wide', wide);
  cap.dataset.page = String(Math.max(1, STEPS.indexOf(S.step) + 1)).padStart(2, '0');
  cap.classList.add('is-in');
}

function sourceTag(text) { return `<p class="tag">${esc(text)}</p>`; }

function toast(html, ms = 2600) {
  const t = $('toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(S.toastT);
  S.toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- the story copy, with numbers from the data ----------
function vars() {
  const r = S.gale.rover, last = stops()[stops().length - 1];
  const k = (2 * Math.PI * 3389.5) / 360;
  const ahead = Math.hypot((r.latest[0] - last.lon) * k * Math.cos((r.latest[1] * Math.PI) / 180), (r.latest[1] - last.lat) * k) * 1000;
  return { mountainKm: (S.galeView.mountain.heightM / 1000).toFixed(1), roverKm: r.distanceKm.toFixed(1), roverClimb: num(r.climbM), roverAheadM: num(Math.round(ahead / 10) * 10) };
}
const chapter = (id, extraVars = {}) => {
  const c = S.story.chapters[id], v = { ...vars(), ...extraVars };
  return { kicker: fill(c.kicker, v), title: esc(fill(c.title, v)), line: esc(fill(c.line, v)) };
};

// ---------- steps ----------
const STEPS = ['mars', 'crater', 'water', 'rover', 'plan', 'walk', 'storm', 'debrief', 'explore'];

function nav(back, nextLabel, next = true) {
  return `<div class="cap__nav">${back ? '<button class="btn btn--ghost" type="button" data-act="back">‹ Back</button>' : ''}${next ? `<button class="btn btn--go" type="button" data-act="next">${nextLabel} ›</button>` : ''}</div>`;
}

function go(step) {
  if (!STEPS.includes(step)) step = 'mars';
  S.step = step;
  ++S.anim;
  $('visor').hidden = true;
  document.body.dataset.step = step;
  try { history.replaceState(null, '', `#${step}`); } catch (e) { /* file:// */ }
  ({ mars, crater, water, rover, plan, walk: () => startWalk(), storm: () => startWalk(true), debrief: () => debrief(), explore })[step]();
}

function next() { const i = STEPS.indexOf(S.step); if (i < STEPS.indexOf('plan')) go(STEPS[i + 1]); }
function back() { const i = STEPS.indexOf(S.step); if (i > 0 && i <= STEPS.indexOf('plan')) go(STEPS[i - 1]); }

function mars() {
  stage('globe'); phase('brief');
  S.stage.focusGlobe({ id: 'gale', lon: 137.8, lat: -5.4 }, innerWidth > 900 ? 3.3 : 4.2);
  caption({ ...chapter('mars'),
    extra: `<p class="missions">${S.story.missions.map((m) => `<span>${esc(m)}</span>`).join('')}</p>
      <div class="cap__nav"><button class="btn btn--go" type="button" data-act="next">Begin the mission ›</button><button class="btn btn--ghost" type="button" data-go="explore">Skip to the map</button></div>
      <p class="tag">About 3 minutes. Real ground, real data, simulated suit.</p>` });
}

function crater() {
  stage('crater'); phase('brief');
  S.crater.show('wide', ['color']);
  caption({ ...chapter('crater'), extra: `${nav(true, 'Why here')}${sourceTag('Rendered in Blender from Mars Trek elevation (MOLA + HRSC) and Viking colour. Heights ×3. Try the layer buttons.')}` });
}

function water() {
  stage('crater'); phase('brief');
  S.crater.show('orbit', ['geology', 'water']);
  caption({ ...chapter('water'), extra: `${nav(true, 'Who went first')}${sourceTag('Spectral: CRISM (MRO) and OMEGA (Mars Express). Rock units: USGS Geologic Map of Mars.')}` });
}

function rover() {
  stage('crater'); phase('brief');
  S.crater.show('line', ['color', 'track']);
  caption({ ...chapter('rover'), extra: `${nav(true, 'Plan your walk')}${sourceTag(`Curiosity traverse and odometry, current to sol ${num(S.gale.rover.latestSol)}.`)}` });
}

function plan() {
  stage('walk'); phase('plan');
  const R = computeRoutes();
  const pick = (id) => {
    S.pick = id;
    const r = R[id];
    S.stage.setRoute(evaOf(r.plan));
    S.stage.setAlternatives(ROUTES.filter((x) => x.id !== id).map((x) => R[x.id].plan.out));
    S.stage.drawReturn(null);
    S.stage.setHome(S.homeField);
    S.stage.markStops(-1, 0);
    S.curT = 0;
    showSuit(sim.stateAt(r.tl, 0), r.tl);
    for (const b of document.querySelectorAll('.route')) b.setAttribute('aria-pressed', String(b.dataset.route === id));
  };
  fly(views.overview(), ['slope']);
  const fastest = Math.min(...ROUTES.map((r) => R[r.id].min));
  caption({ kicker: 'Plan · on the habitat display', title: 'Choose your route.', wide: true,
    line: 'Same five stops, three ways to reach them. Green ground is safe in a suit, red is too steep.',
    extra: `<div class="routes">${ROUTES.map((r) => { const x = R[r.id]; return `
      <button class="route" type="button" data-route="${r.id}" aria-pressed="false">
        <b>${esc(r.name)}</b>
        <span class="route__nums"><em>${mins(x.min)}</em><em>${(x.plan.outD * 2 / 1000).toFixed(2)} km</em><em>steepest ${x.plan.maxSlope.toFixed(0)}°</em></span>
        <span class="route__note">${x.plan.careM > 1 ? `<strong>${Math.round(x.plan.careM)} m of steep ground.</strong> ` : ''}${esc(r.note)}</span>
        ${x.min === fastest ? '<i>quickest</i>' : ''}
      </button>`; }).join('')}</div>
      <div class="cap__nav"><button class="btn btn--ghost" type="button" data-act="back">‹ Back</button><button class="btn btn--go" type="button" data-go="walk">Suit up and go ›</button></div>
      ${sourceTag('Routes computed in your browser on 146,034 cells of the 1 m HiRISE elevation model. Suit pace and air are simulated.')}` });
  pick(S.pick);
}

// ---------- the Marswalk: helmet HUD at each stop ----------
function startWalk(jumpToStorm = false) {
  const R = computeRoutes(), r = R[S.pick];
  S.eva = { plan: r.plan, k: 0, done: stops().map(() => new Set()), choice: null };
  S.stormOpts = null;
  S.final = null;
  S.stage.setHome(S.homeField);
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setAlternatives(null);
  S.stage.drawReturn(null);
  S.curT = 0;
  phase('walk');
  if (jumpToStorm) {
    S.eva.done = stops().map((wp) => new Set(wp.plain.do.map((_, i) => i)));
    S.eva.k = stops().length - 1;
    storm();
    return;
  }
  stopView(0);
}

function evaTl() { return timelineFor(S.eva.plan, S.eva.done, S.eva.k); }

function nowState() {
  const tl = evaTl(), { arr, dep } = marks(S.eva.plan, tl);
  const k = S.eva.k;
  return { tl, arr, dep, st: sim.stateAt(tl, dep[k].t) };
}

function bearing(a, b) {
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function miniMap(plan, k, retLine) {
  const o = plan.out, b = S.terrain.meta.bounds;
  const W = 100, H = 200;
  const xy = (p) => [((p.lon - b.west) / (b.east - b.west)) * W, ((b.north - p.lat) / (b.north - b.south)) * H];
  const path = (pts) => pts.map((p, i) => { const [x, y] = xy(p); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
  const reached = o.slice(0, plan.idx[k] + 1);
  const here = xy(stops()[k]);
  return `<svg viewBox="-6 -6 ${W + 12} ${H + 12}" aria-hidden="true">
    <path class="mm__route" d="${path(o)}"/><path class="mm__done" d="${path(reached)}"/>
    ${retLine ? `<path class="mm__ret" d="${path(retLine)}"/>` : ''}
    ${stops().map((w, j) => { const [x, y] = xy(w); return `<circle class="mm__stop${j <= k ? ' is-done' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${j ? 3.2 : 4.2}"/>`; }).join('')}
    <circle class="mm__you" cx="${here[0].toFixed(1)}" cy="${here[1].toFixed(1)}" r="5"/>
  </svg>`;
}

function stopView(k) {
  S.eva.k = k;
  stage('walk');
  const wp = stops()[k], last = stops().length - 1, s = S.story.stops[wp.id] || {};
  fly(views.stop(k), s.layers || ['slope']);
  S.stage.markStops(k, k);
  const { st } = nowState();
  S.curT = st.t;
  showSuit(st);
  S.stage.setCrew(wp.lon, wp.lat, false);
  $('visor').hidden = false;
  $('visor').classList.remove('is-alert');
  $('v-pov').src = wp.pov.imageUrl;
  $('v-pov').alt = `What you will see here: ${wp.plain.see}`;
  $('v-credit').textContent = `Real view from this spot: Curiosity Navcam, sol ${num(wp.pov.sol || '')} · ${wp.pov.credit}`;
  $('v-stop').textContent = k ? `Cairn ${k} of ${last} · ${wp.name}` : `The rover · ${wp.name}`;
  $('v-title').textContent = s.title || wp.plain.title;
  $('v-line').textContent = s.line || wp.story;
  renderTasks();
  const nextBtn = $('v-next-btn');
  nextBtn.textContent = k < last ? `Walk to cairn ${k + 1} ›` : 'Turn for home ›';
}

function renderTasks() {
  const k = S.eva.k, wp = stops()[k], done = S.eva.done[k];
  $('v-tasks').innerHTML = wp.plain.do.map((t, i) => `<button type="button" class="task" data-task="${i}" aria-pressed="${done.has(i)}"><i></i>${esc(t)}<em>${perTask(wp)} min</em></button>`).join('');
  hudNumbers();
}

function hudNumbers() {
  const k = S.eva.k, wp = stops()[k], last = stops().length - 1;
  const { st } = nowState();
  const air = st.o2 - reserve();
  const homeSec = S.homeField.cost[cellOf(wp)];
  const spare = air - sim.returnNeedMin(homeSec);
  $('v-met').textContent = `MET ${clock(st.t)}`;
  $('v-air').textContent = mins(air);
  $('v-airbar').style.width = `${Math.max(0, Math.min(100, (air / S.mission.suit.oxygen.primaryMin) * 100)).toFixed(0)}%`;
  $('v-home').textContent = homeSec < 30 ? 'here' : mins(homeSec / 60);
  $('v-dose').textContent = st.dose.toFixed(2);
  $('visor').dataset.level = spare < 20 ? 'stop' : spare < 60 ? 'care' : '';
  const cell = cellOf(wp), slope = S.terrain.slope[cell], cls = S.terrain.cls[cell];
  $('v-slope').textContent = `Ground ${slope.toFixed(0)}° · ${['safe for the suit', 'take care', 'too steep'][cls]}`;
  $('v-slope').dataset.cls = cls;
  if (k < last) {
    const nx = stops()[k + 1], b = bearing(wp, nx);
    const leg = S.eva.plan.out[S.eva.plan.idx[k + 1]].d - S.eva.plan.out[S.eva.plan.idx[k]].d;
    $('v-next').innerHTML = `Next cairn <b>${Math.round(leg / 10) * 10} m</b> · ${Math.round(b)}° ${COMPASS[Math.round(b / 22.5) % 16]}`;
    $('v-arrow').style.transform = `rotate(${b.toFixed(0)}deg)`;
  } else {
    const b = bearing(wp, stops()[0]);
    $('v-next').innerHTML = `The rover <b>${mins(homeSec / 60)}</b> · ${Math.round(b)}° ${COMPASS[Math.round(b / 22.5) % 16]}`;
    $('v-arrow').style.transform = `rotate(${b.toFixed(0)}deg)`;
  }
  $('v-map').innerHTML = miniMap(S.eva.plan, k);
}

async function walkOn() {
  const k = S.eva.k, last = stops().length - 1;
  if (k >= last) return storm();
  const { tl, arr, dep } = nowState();
  const legMin = arr[k + 1].t - dep[k].t;
  let steep = 0;
  for (let i = S.eva.plan.idx[k]; i <= S.eva.plan.idx[k + 1]; i++) steep = Math.max(steep, Math.abs(S.eva.plan.out[i].slope));
  $('visor').hidden = true;
  fly({ ...views.stop(k + 1), dist: 520, polar: 50 }, ['slope']);
  S.curT = dep[k].t;
  toast(`Walking to cairn ${k + 1} · ${mins(legMin)} · steepest ${steep.toFixed(0)}°`, 2600);
  await moveTo(tl, arr[k + 1].t, 2300, true);
  if (S.step === 'walk') stopView(k + 1);
}

// ---------- the storm ----------
function storm() {
  S.step = 'storm';
  document.body.dataset.step = 'storm';
  try { history.replaceState(null, '', '#storm'); } catch (e) { /* file:// */ }
  phase('walk');
  const last = stops().length - 1, wp = stops()[last];
  if ($('visor').hidden) stopView(last);
  $('visor').classList.add('is-alert');
  $('v-title').textContent = 'Solar particle event';
  $('v-line').textContent = 'Simulated drill. Radiation is twenty times normal. Decide how you get home.';
  $('v-tasks').innerHTML = '';
  $('v-next-btn').textContent = 'Open the map ›';
  S.stormPending = true;
  setTimeout(() => { if (S.step === 'storm' && S.stormPending) stormChoices(); }, reduce ? 0 : 2400);
}

function stormOptions() {
  if (S.stormOpts) return S.stormOpts;
  const last = stops().length - 1, wp = stops()[last];
  const { st } = nowState();
  const start = { t: st.t, o2: st.o2, batt: st.batt, dose: st.dose };
  const hot = cfgFor(true), calm = cfgFor(false);
  const at = cellOf(wp);
  const result = (tl, line) => ({ tl, line, min: tl.end.t - start.t, dose: tl.end.dose - start.dose, air: tl.end.o2 - reserve() });

  // 1. The new line: fastest home, weighted toward ground that hides more sky.
  const dLine = [{ lon: wp.lon, lat: wp.lat }, ...sim.smooth(S.router.trace(S.stormField, at), 2).slice(1)];
  const direct = result(sim.buildTimeline(sim.profile(S.terrain, dLine, S.limits, 5), new Map(), start, hot), dLine);

  // 2. Back the way you came.
  const plan = S.eva.plan;
  const bPts = plan.pts.slice(plan.idx[last]).map((p) => ({ ...p, d: p.d - plan.outD }));
  const trail = result(sim.buildTimeline(bPts, new Map(), start, hot), bPts.map((p) => ({ lon: p.lon, lat: p.lat })));

  // 3. Shelter behind the best-shielded ground within 300 m, wait out the storm, then walk home.
  const cands = S.terrain.shelters(60, 20).filter((c) => groundMetres(c, wp) < 300);
  const best = cands.sort((a, b) => b.blocked - a.blocked)[0] || S.terrain.shelters(1, 10)[0];
  const sField = S.router.field(best.idx, { mode: 'fastest', stopAt: at });
  const toShelter = [{ lon: wp.lon, lat: wp.lat }, ...sim.smooth(S.router.trace(sField, at), 2).slice(1)];
  const p1 = sim.profile(S.terrain, toShelter, S.limits, 5);
  const t1 = sim.buildTimeline(p1, new Map([[p1.length - 1, { min: STORM_HOURS * 60, wpId: 'shelter' }]]), start, hot);
  const home = sim.smooth(S.router.trace(S.homeField, best.idx), 2);
  const t2 = sim.buildTimeline(sim.profile(S.terrain, home, S.limits, 5), new Map(), t1.end, calm);
  const shelter = { ...result(t2, toShelter.concat(home)), blocked: Math.round(best.blocked * hot.shieldEff * 100), spot: best };

  S.stormOpts = { start, direct, trail, shelter };
  return S.stormOpts;
}

function stormChoices() {
  S.stormPending = false;
  $('visor').hidden = true;
  stage('walk');
  const o = stormOptions();
  fly(views.back(), ['home', 'shield']);
  S.stage.setHome(S.stormField);
  S.stage.drawReturn(o.direct.line);
  S.stage.setAlternatives([o.trail.line, o.shelter.line]);
  S.stage.markStops(-1, stops().length);
  const less = Math.round((1 - o.direct.dose / o.trail.dose) * 100);
  const opt = (id, title, x, note) => `<button class="route" type="button" data-choice="${id}"><b>${title}</b>
    <span class="route__nums"><em>${mins(x.min)} to the hatch</em><em>${x.dose.toFixed(2)} mSv</em></span><span class="route__note">${note}</span></button>`;
  caption({ ...chapter('storm', { directMin: mins(o.direct.min), trailMin: mins(o.trail.min), less, shelter: o.shelter.blocked }), wide: true,
    title: 'The Sun just flared. How do you get home?',
    line: `REDCAIRN drew a new line home (white). Pick one; the numbers are the real terrain, at storm radiation.`,
    extra: `<div class="routes">
      ${opt('direct', 'Take the new white line', o.direct, 'Fastest ground home, leaning on whatever cover the hills give.')}
      ${opt('trail', 'Go back the way you came', o.trail, 'The ground you know, all the way back.')}
      ${opt('shelter', `Shelter behind a ridge for ${STORM_HOURS} h`, o.shelter, `The best cover within 300 m blocks only ${o.shelter.blocked}% of the radiation.`)}
    </div>${sourceTag('Storm shaped on the September 2017 event measured by Curiosity, made 20× stronger for the drill. Terrain cover: 16-direction sky scan of the elevation model.')}` });
}

async function choose(id) {
  const o = stormOptions(), x = o[id];
  S.eva.choice = id;
  S.stage.setAlternatives(null);
  S.stage.drawReturn(x.line);
  const best = ['direct', 'trail', 'shelter'].reduce((a, b) => (o[a].dose <= o[b].dose ? a : b));
  const msg = id === best ? 'Right call: the least radiation of the three.' : `You made it, with ${(x.dose / o[best].dose).toFixed(1)}× the dose of the best choice.`;
  toast(`${msg}`, 3200);
  S.curT = 0;
  await moveTo(x.tl, x.tl.end.t, 2600, true).catch(() => {});
  S.final = x;
  if (S.step === 'storm') go('debrief');
}

// ---------- debrief ----------
function debrief() {
  stage('walk'); phase('debrief');
  S.unlocked = true;
  if (!S.eva) startWalkSilently();
  const o = S.stormOpts ? stormOptions() : null;
  const x = S.final || (o ? o.direct : null);
  const tlFull = evaTl();
  const end = x ? x.tl.end : tlFull.end;
  const got = S.eva.done.reduce((n, s) => n + s.size, 0), all = stops().reduce((n, w) => n + w.plain.do.length, 0);
  const career = S.mission.hazards.radiation.careerLimitMSv;
  fly(views.back(), ['home']);
  if (x) S.stage.drawReturn(x.line);
  const c = chapter('home', { airLeft: mins(end.o2 - reserve()) });
  caption({ ...c, wide: true,
    extra: `<dl class="report">
      <div><dt>${got}/${all}</dt><dd>science tasks done</dd></div>
      <div><dt>${mins(end.t)}</dt><dd>outside</dd></div>
      <div><dt>${end.dose.toFixed(2)} mSv</dt><dd>${((end.dose / career) * 100).toFixed(2)}% of a NASA career limit</dd></div>
      <div><dt>${S.eva.choice ? { direct: 'New line', trail: 'Same way back', shelter: 'Sheltered' }[S.eva.choice] : '—'}</dt><dd>your storm call</dd></div>
    </dl>
    <figure class="live" id="live" hidden></figure>
    <div class="cap__nav"><button class="btn btn--go" type="button" data-go="explore">Explore every layer ›</button><button class="btn btn--ghost" type="button" data-act="again">Walk it again</button><button class="btn btn--ghost" type="button" data-act="about">Data &amp; sources</button></div>` });
  liveFrame();
}

function startWalkSilently() {
  const r = computeRoutes()[S.pick];
  S.eva = { plan: r.plan, k: stops().length - 1, done: stops().map((wp) => new Set(wp.plain.do.map((_, i) => i))), choice: null };
}

function liveFrame() {
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => {
    const im = d.images && d.images[0], el = $('live');
    if (!im || !el) return;
    const when = new Date(im.date_taken_utc).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    el.innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Newest navigation camera picture from the Perseverance rover" referrerpolicy="no-referrer"><figcaption><b>Right now on Mars.</b> Perseverance's newest picture, from Jezero crater, its Mars day ${num(im.sol)} (${esc(when)}). ${esc(im.credit)}</figcaption>`;
    el.hidden = false;
  }).catch(() => {});
}

// ---------- explore: every layer, the whole walk, free ----------
function explore() {
  stage('walk'); phase('debrief');
  S.unlocked = true;
  const r = computeRoutes()[S.pick];
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setAlternatives(null);
  S.stage.drawReturn(null);
  S.stage.setHome(S.homeField);
  S.stage.markStops(-1, 0);
  S.exploreTl = r.tl;
  fly(views.overview(), ['slope']);
  showSuit(sim.stateAt(r.tl, S.curT = 0), r.tl);
  caption({ kicker: 'Explore', title: 'The whole map is yours.',
    line: 'Switch layers, drag the ground, slide along the walk to see air, dose and the way home at any point.',
    extra: `<div class="cap__nav"><button class="btn btn--ghost" type="button" data-go="crater">Crater layers</button><button class="btn btn--ghost" type="button" data-go="plan">Change route</button><button class="btn btn--go" type="button" data-go="walk">Walk it ›</button></div>` });
}

// ---------- data & sources ----------
function aboutHTML() {
  const m = S.mission, src = (id) => m.sources.find((s) => s.id === id);
  const rows = [
    ['Mars globe', 'Optical, true colour', 'Viking orbiters · MDIM 2.1 colour mosaic, via Mars Trek, stitched in Blender'],
    ['Gale crater in 3D', 'Topographic + optical', 'Mars Global Surveyor MOLA and Mars Express HRSC elevation, Viking colour, via Mars Trek; rendered in Blender'],
    ['Rock units (crater)', 'Geologic', 'USGS SIM 3292 Geologic Map of Mars'],
    ['Water minerals from orbit', 'Spectral', 'MRO CRISM and Mars Express OMEGA, via Mars Trek'],
    ['Curiosity’s whole track', 'Ground truth', `Curiosity traverse and odometry, to sol ${num(S.gale.rover.latestSol)}`],
    ['Walk ground photograph', 'Optical', 'MRO HiRISE (a 25 cm camera), at about 33 cm per pixel from Mars Trek, tinted in Blender'],
    ...LAYERS.map((l) => [`Walk layer: ${l.name}`, l.kind, l.from]),
    ['Helmet view at each stop', 'Optical, from the ground', 'Curiosity navigation camera, from that spot'],
    ['Storm drill', 'Radiation (space weather)', 'Curiosity RAD, September 2017 solar event, scaled ×20 and labelled simulated'],
    ['Weather', 'Atmospheric', `Curiosity REMS, latest report sol ${num(S.conditions.weather.sol)}`],
  ];
  return `
    <section><h3>The challenge</h3><p>NASA Space Apps 2026, <b>Interplanetary Survival Guide: Martian Map</b>: a layered, hyper-local map a Mars astronaut could use to plan and walk a Marswalk safely while doing science. An independent student project, not affiliated with or endorsed by NASA.</p></section>
    <section><h3>The five resources we were given</h3><ul>${m.anchorResources.map((a) => `<li><b><a href="${esc(src(a.source).url)}" target="_blank" rel="noopener">${esc(a.name)}</a></b>${esc(a.role)}</li>`).join('')}</ul></section>
    <section><h3>Every layer, its kind of data, and its mission</h3><div class="tablewrap"><table><thead><tr><th>Layer</th><th>Data</th><th>Mission or source</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>Real and simulated</h3><p><b>Real:</b> the ground, heights and slopes, the routes' terrain, the rover track and photos, the rock findings, the water minerals, the geologic units, the normal radiation rate and the measured effect of terrain on it. Our elevation model matches the rover's own elevations to ${esc(S.route.summary.demVsRoverRmsResidualM)} m RMS along the route.</p><p><b>Simulated:</b> the suit (air, pace), the astronaut, the storm's strength (×20) and the ${STORM_HOURS} h storm length for the shelter option. Heights are stretched ×2 on the walk and ×3 on the crater.</p></section>
    <section><h3>Why it looks like this</h3><p>Apollo moonwalkers carried a cuff checklist on the wrist and planned with printed traverse maps of numbered stations. REDCAIRN is that kit rebuilt for Mars: checklist pages, a map collar with coordinates and a turning north arrow, and the tasks on your wrist inside the helmet view. No agency logos or branding are used.</p></section>
    <section><h3>How it is built</h3><p>Scripts in the repository fetch public mission data. Blender, run headless from scripts, stitches the globe, renders Gale crater layer by layer through one camera and projects Curiosity's track into it, and builds the walk's ground photo. Your browser computes slope, sky shelter, three routes, the walk-home time for ${num(S.terrain.size)} patches of ground and the suit timeline, with no server. No build step.</p></section>
    <section><h3>All sources</h3><div class="tablewrap"><table><tbody>${m.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.org)}</td><td>${esc(s.use)}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>How AI was used</h3><p>${esc(m.aiDisclosure)}</p></section>`;
}

function openAbout() { $('about-body').innerHTML = aboutHTML(); $('about').showModal(); }

// ---------- boot ----------
async function boot() {
  const [mission, route, conditions, story, gale, galeView] = await Promise.all([
    fetchJson('data/mission.json'), fetchJson('data/route.json'), fetchJson('data/conditions.json'), fetchJson('data/story.json'),
    fetchJson('data/gale.json'), fetchJson('data/gale-view.json'),
  ]);
  Object.assign(S, { mission, route, conditions, story, gale, galeView });
  S.limits = { caution: mission.suit.slopeLimitsDeg.caution, noGo: mission.suit.slopeLimitsDeg.noGo };
  S.terrain = await Terrain.load('data/terrain.json', S.limits);
  S.router = new Router(S.terrain, mission.suit);
  const dock = cellOf(stops()[0]);
  S.homeField = S.router.field(dock, { mode: 'fastest' });
  S.stormField = S.router.field(dock, { mode: 'fastest', doseAware: true, shieldEff: cfgFor(true).shieldEff });

  S.stage = new Stage($('gl'), $('pins'), { terrain: S.terrain, route, mission });
  S.stage.setHome(S.homeField);
  S.stage.setGhosts([{ id: 'gale', name: 'Gale crater', lon: 137.8, lat: -5.4, status: 'walking' }], () => go('crater'));
  S.stage.addDots(conditions.hydrousMinerals.points, 'gale', 'Water-formed minerals seen from orbit');
  S.stage.onStop = (k) => {
    if (S.step === 'explore' && S.exploreTl) {
      const { arr } = marks(computeRoutes()[S.pick].plan, S.exploreTl);
      fly(views.stop(k));
      moveTo(S.exploreTl, arr[k].t, 900, false);
    }
  };
  S.crater = new Crater($('crater'), galeView, gale, stops());

  document.addEventListener('click', (e) => {
    const t = e.target;
    const g = t.closest('[data-go]');
    if (g) return go(g.dataset.go);
    const a = t.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'next') return next();
      if (act === 'back') return back();
      if (act === 'about') return openAbout();
      if (act === 'again') { S.stormOpts = null; S.final = null; return go('plan'); }
    }
    const r = t.closest('[data-route]');
    if (r) {
      S.pick = r.dataset.route;
      S.stormOpts = null;
      return plan();
    }
    const c = t.closest('[data-choice]');
    if (c) return choose(c.dataset.choice);
    const task = t.closest('[data-task]');
    if (task) {
      const set = S.eva.done[S.eva.k], i = Number(task.dataset.task);
      if (set.has(i)) set.delete(i); else set.add(i);
      return renderTasks();
    }
    if (t.closest('#v-next-btn')) return S.step === 'storm' ? stormChoices() : walkOn();
    const chip = t.closest('#chips button');
    if (chip) {
      const id = chip.dataset.layer;
      if (S.layerOn.has(id)) S.layerOn.delete(id); else S.layerOn.add(id);
      return applyLayers();
    }
  });
  $('scrub').addEventListener('input', (e) => {
    const tl = S.exploreTl || computeRoutes()[S.pick].tl;
    ++S.anim;
    S.curT = (Number(e.target.value) / 1000) * tl.end.t;
    const st = sim.stateAt(tl, S.curT);
    showSuit(st);
    S.stage.aim(st.lon, st.lat);
  });
  $('btn-about').addEventListener('click', openAbout);
  document.addEventListener('keydown', (e) => {
    if ($('about').open || e.target.closest('input')) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') back();
  });

  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (STEPS.includes(h) && h !== S.step) go(h); });
  requestAnimationFrame(northLoop);
  const start = location.hash.slice(1);
  go(STEPS.includes(start) ? start : 'mars');
  document.body.removeAttribute('data-booting');
}

boot().catch((err) => {
  console.error(err);
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
