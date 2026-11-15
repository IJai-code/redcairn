// REDCAIRN — a layered survival map for the first walk on Mars. Map first, walk second.
//   intro    Curiosity's whole 14-year line on Mars Trek tiles, and the three questions
//   plan     slope for a spacesuit; three routes to the same cairns
//   stops    the rover dock and five cairns: one moment, the rover's own photo, air, the walk home, dose
//   storm    a simulated solar storm at the turnaround: three ways home drawn on the map, you choose
//   home     the three questions answered
//   window   the 3D ground in the story card: the rover drives cairn to cairn while the map follows it
//   ground   from any stop, stand there in first person at true scale and follow the rover on

import { Terrain, Router, fetchJson, groundMetres } from './terrain.js';
import * as sim from './sim.js';
import { Stage } from './scene.js';
import { MapView } from './map.js';
import { Sound } from './sound.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (m) => { const v = Math.max(0, Math.round(m)); return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, '0')}`; };
const clock = (m) => { const v = Math.max(0, Math.round(m)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const num = (n) => Number(n).toLocaleString('en-US');
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 200) : ms));
const STORM_HOURS = 2;
const DEGS = 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FOLLOW_M = 11;   // how far behind the rover you walk

const LAYERS = [
  { id: 'slope', name: 'Slope', note: 'Green safe in a suit · amber take care · red too steep', from: 'HiRISE 1 m elevation (MRO), via Mars Trek' },
  { id: 'shield', name: 'Shelter', note: 'Purple: hills hide part of the sky, so less radiation', from: 'Curiosity RAD + elevation model' },
  { id: 'home', name: 'Way home', note: 'Each white line: five more minutes from the rover', from: 'Routing on the elevation model' },
  { id: 'rocks', name: 'Rock', note: 'Blue: boxwork, where groundwater flowed · orange: salty layers', from: 'Curiosity drill and laser' },
  { id: 'height', name: 'Height', note: 'Blue low to white high: 77 m of climb', from: 'HiRISE 1 m elevation' },
  { id: 'track', name: 'Rover tracks', note: 'Every drive Curiosity made here', from: 'Curiosity traverse' },
];
// The planning map's layers, grouped by the kind of data, each with the mission it came from.
const MAP_LAYERS = [
  ['Optical', [['hirise', 'Photo from orbit', 'HiRISE (a 25 cm camera) · Mars Reconnaissance Orbiter', 'always'], ['ctx', 'Wide photo from orbit', 'CTX · Mars Reconnaissance Orbiter', 'always']]],
  ['Topographic', [['slope', 'Slope for a spacesuit', 'HiRISE 1 m elevation · MRO'], ['relief', 'Shaded relief', 'HiRISE 1 m elevation · MRO'], ['mola', 'Height of the land', 'MOLA · Mars Global Surveyor + HRSC · Mars Express']]],
  ['Thermal', [['thermal', 'Night-time ground temperature', 'THEMIS · Mars Odyssey']]],
  ['Spectral', [['minerals', 'Minerals formed in water', 'CRISM · MRO and OMEGA · Mars Express']]],
  ['Geologic', [['geology', 'Rock units', 'USGS Geologic Map of Mars (SIM 3292)']]],
  ['Chemical', [['rocks', 'Rock along the route', 'Curiosity drill and laser']]],
  ['Radiation', [['shield', 'Shelter from terrain', 'Curiosity RAD + elevation model']]],
  ['Ground truth', [['track', 'Curiosity’s wheel tracks here', 'Curiosity traverse'], ['curiosity', 'Curiosity’s whole climb, 2012 to today', 'Curiosity · its proposed path up Mount Sharp']]],
  ['Computed', [['home', 'Minutes to walk home', 'REDCAIRN routing on the elevation model']]],
];

// What each layer's colours mean, shown beside it while the story has it on.
const LEGEND = {
  slope: [['#e0a11b', '15–20°: take care'], ['#d7402f', 'over 20°: too steep'], ['', 'unpainted: safe in a suit']],
  relief: [['#8a7f70', 'lit from the north-west, so slopes read as shadow']],
  mola: [['#3b6fb6', 'low'], ['#5fae5a', ''], ['#e8c547', ''], ['#d0573a', 'high']],
  thermal: [['#e8e2d6', 'bright: rock that holds heat at night'], ['#4a4540', 'dark: dust and sand']],
  minerals: [['#2b9fd6', 'clay and sulfate seen from orbit']],
  geology: [['#dcd5d2', 'Htu: Mount Sharp’s layered rock'], ['#b39a7e', 'AHi: the crater’s impact rock']],
  rocks: [['#4cc9f0', 'boxwork: ridges cemented by groundwater'], ['#f4a261', 'layered sulfate: where it began to dry']],
  shield: [['#7d50dc', 'deeper purple: hills hide more of the sky']],
  track: [['#ffffff', 'Curiosity’s wheel tracks, dashed']],
  curiosity: [['#e2742f', 'landing, August 2012, to today']],
  home: [['#ffffff', 'a line every 5 minutes of walking home']],
};

const ROUTES = [
  { id: 'rover', name: 'Rover-proven' },
  { id: 'fast', name: 'Fastest' },
  { id: 'gentle', name: 'Gentlest' },
];

const S = { step: null, layerOn: new Set(), pick: 'rover', token: 0 };
const stops = () => S.mission.waypoints;
const cellOf = (p) => S.terrain.cellIndex(p.lon, p.lat);
const reserve = () => S.mission.suit.oxygen.reserveMin;
function cfgFor(spe) {
  const rad = S.mission.hazards.radiation, ev = S.mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  return { suit: S.mission.suit, env: { spe, dust: false }, radiation: rad, speMultiplier: ev.demoSeverityMultiplier, shieldEff: rad.terrainShielding.efficiency };
}

// ---------------------------------------------------------------- routes, plans, the suit
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
  const out = sim.profile(S.terrain, line, S.limits, 4);
  const back = sim.profile(S.terrain, line.slice().reverse(), S.limits, 4);
  const outD = out[out.length - 1].d;
  const pts = out.concat(back.slice(1).map((p) => ({ ...p, d: p.d + outD })));
  const idx = stops().map((wp, k) => (k === stops().length - 1 ? out.length - 1 : k === 0 ? 0 : sim.nearestIndex(out, wp)));
  let maxSlope = 0;
  for (let i = 1; i < out.length; i++) maxSlope = Math.max(maxSlope, Math.abs(out[i].slope));
  return { line, out, pts, outD, idx, maxSlope };
}

function timelineFor(plan) {
  const stays = new Map();
  stops().forEach((wp, j) => { if (wp.plannedStayMin > 0) stays.set(plan.idx[j], { min: wp.plannedStayMin, wpId: wp.id }); });
  return sim.buildTimeline(plan.pts, stays, sim.startState(S.mission.suit), cfgFor(false));
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
    const tl = timelineFor(plan);
    S.routes[r.id] = { ...r, plan, tl, ...marks(plan, tl) };
  }
  return S.routes;
}
const R = () => computeRoutes()[S.pick];
const evaOf = (plan) => plan.out.map((p) => ({ lon: p.lon, lat: p.lat, distM: p.d, slopeDeg: p.slope }));

// A path in world metres you can sample by distance: where to stand and which way it runs.
function worldPath(lonlat) {
  const pts = lonlat.map((p) => S.stage.worldOf(p.lon, p.lat));
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const at = (s) => {
    s = Math.max(0, Math.min(d[d.length - 1], s));
    let i = 1;
    while (i < d.length - 1 && d[i] < s) i++;
    const f = (s - d[i - 1]) / (d[i] - d[i - 1] || 1);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * f };
  };
  const dir = (s) => { const a = at(s - 3), b = at(s + 6); return Math.atan2(b.z - a.z, b.x - a.x); };
  return { at, dir, length: d[d.length - 1] };
}

// ---------------------------------------------------------------- the helmet HUD
function hud(on) { document.body.toggleAttribute('data-hud', on); }

function say(line, sub = '') {
  const el = $('say');
  el.classList.remove('is-in');
  void el.offsetWidth;
  el.innerHTML = `${line ? `<p>${line}</p>` : ''}${sub ? `<small>${sub}</small>` : ''}`;
  el.classList.add('is-in');
}

// The suit radio: lines arrive one at a time, each with who said it and whether it is real or imagined.
// Real lines carry their date and source; the rest are labelled imagined, like the suit and the storm.
function radio(key) {
  const lines = (S.story.radio || {})[key], el = $('radio'), run = (S.radioRun = (S.radioRun || 0) + 1);
  clearTimeout(S.radioT);
  if (!Array.isArray(lines) || !lines.length) { el.classList.remove('is-in'); return; }
  let i = 0;
  const next = () => {
    if (run !== S.radioRun) return;
    if (i >= lines.length) { el.classList.remove('is-in'); return; }
    const L = lines[i++], text = L.text.replace('{name}', S.name || 'EVA-1');
    el.innerHTML = `<b>${esc(L.who)}${L.when ? ` · ${esc(L.when)}` : ''}</b><span>${esc(text)}</span><em>${L.real ? `real · ${esc(L.real)}` : 'imagined'}</em>`;
    el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
    if (S.sound) { S.sound.radio(); if (L.audio) S.sound.voice(L.audio); }
    S.radioT = setTimeout(next, 3000 + text.split(' ').length * 330);
  };
  S.radioT = setTimeout(next, 700);
}

function act(buttons) {
  $('act').innerHTML = (buttons || []).map((b, i) => `<button type="button" class="${i ? 'act act--alt' : 'act'}" data-a="${b.id}">${esc(b.label)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</button>`).join('');
}

function readout(st) {
  const air = st.o2 - reserve();
  const homeSec = S.homeField.cost[cellOf(st)];
  const spare = air - sim.returnNeedMin(homeSec);
  $('h-air').textContent = mins(air);
  $('h-home').textContent = homeSec < 40 ? 'here' : mins(homeSec / 60);
  $('h-dose').textContent = st.dose.toFixed(2);
  const wx = S.conditions.weather;
  $('h-met').textContent = `${clock(st.t)} outside · ${wx.airMinC}° to ${wx.airMaxC}° C, ${num(wx.pressurePa)} Pa (REMS)`;
  document.body.dataset.level = spare < 20 ? 'stop' : spare < 60 ? 'care' : '';
  const cell = cellOf(st), sl = S.terrain.slope[cell], cls = S.terrain.cls[cell];
  $('h-slope').textContent = `${sl.toFixed(0)}° ${['safe', 'care', 'too steep'][cls]}`;
  $('h-slope').dataset.cls = cls;
  if (S.mm) S.mm.you(st.lon, st.lat);
}

function miniMap(plan) {
  const o = plan.out, b = S.terrain.meta.bounds, W = 100, H = 200;
  const xy = (p) => [((p.lon - b.west) / (b.east - b.west)) * W, ((b.north - p.lat) / (b.north - b.south)) * H];
  const path = (pts) => pts.map((p, i) => { const [x, y] = xy(p); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
  $('h-map').innerHTML = `<svg viewBox="-6 -6 ${W + 12} ${H + 12}" aria-hidden="true"><path class="mm__route" d="${path(o)}"/><path class="mm__ret" id="mm-ret" d=""/>
    ${stops().map((w) => { const [x, y] = xy(w); return `<circle class="mm__stop" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`; }).join('')}
    <circle class="mm__rover" id="mm-rover" r="3.6"/><circle class="mm__you" id="mm-you" r="4.2"/></svg>`;
  S.mm = {
    you: (lon, lat) => { const [x, y] = xy({ lon, lat }); const c = $('mm-you'); c.setAttribute('cx', x); c.setAttribute('cy', y); },
    rover: (lon, lat) => { const [x, y] = xy({ lon, lat }); const c = $('mm-rover'); c.setAttribute('cx', x); c.setAttribute('cy', y); },
    ret: (line) => { $('mm-ret').setAttribute('d', line ? path(line) : ''); },
  };
}

function layerButtons() {
  $('h-layers').innerHTML = LAYERS.map((l) => `<button type="button" data-layer="${l.id}" aria-pressed="${S.layerOn.has(l.id)}" title="${esc(l.from)}">${esc(l.name)}</button>`).join('');
  const last = [...S.layerOn].map((id) => LAYERS.find((l) => l.id === id)).filter(Boolean).pop();
  $('h-legend').textContent = last ? `${last.note} · ${last.from}` : '';
}
function setLayers(ids) { S.layerOn = new Set(ids); S.stage.setLayers(S.layerOn); layerButtons(); }

// Compass: a strip of bearings that slides as you turn your head.
function compassLoop() {
  const h = -(S.stage.heading || 0);
  const strip = $('h-compass-strip');
  const b = ((h % 360) + 360) % 360;
  if (strip) strip.style.transform = `translateX(${(-(b + 360) * 4).toFixed(1)}px)`;
  if (S.nextBearing !== undefined) {
    const rel = ((S.nextBearing - b + 540) % 360) - 180;
    $('h-target').style.transform = `translateX(${Math.max(-190, Math.min(190, rel * 4)).toFixed(0)}px)`;
    $('h-target').hidden = false;
  } else $('h-target').hidden = true;
  requestAnimationFrame(compassLoop);
}
function buildCompass() {
  const marks = [];
  for (let d = 0; d <= 1080; d += 15) {
    const b = d % 360;
    const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[b] || (b % 45 === 0 ? String(b) : '');
    marks.push(`<i style="left:${d * 4}px" class="${lab ? 'big' : ''}">${lab}</i>`);
  }
  $('h-compass-strip').innerHTML = marks.join('');
}
function bearing(a, b) {
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------- the story
function token() { return ++S.token; }
const live = (t) => t === S.token;

function stage(mode, render3d = false) {
  if (mode !== 'map') parkStage();
  document.body.dataset.stage = mode;
  S.stage.setMode(mode === 'walk' || render3d ? 'walk' : 'none');
}

// The 3D canvas lives full screen for the ground view, or inside the story card's window on the map.
function parkStage() {
  const st = $('stage');
  if (st.parentElement !== document.body) { document.body.prepend(st); S.stage.resize(); }
  document.body.removeAttribute('data-window');
}
function mountStage() {
  const w = $('gwin');
  if (!w) return parkStage();
  w.prepend($('stage'));
  document.body.setAttribute('data-window', '');
  S.stage.resize();
}

// ---------------------------------------------------------------- the planning map
function ensureMap() {
  if (S.map) return;
  S.map = new MapView($('map'), S.mission, S.terrain);
  S.map.buildRasters();
  S.map.buildHome(S.homeField);
  S.map.drawStatic(S.route, S.conditions, S.terrain.shelters(4, 120), cfgFor(false).shieldEff);
  S.map.drawTraverse(S.gale);
  S.map.addStops(stops());
  S.map.onStop = (k) => mapStop(k);
  S.map.onPoint(pointAt);
  S.mapOn = new Set(['slope']);
}

// Wherever the cursor is (or a finger taps): where on Mars, and on the walk site, how high, how steep, how far from home.
function pointAt(lon, lat) {
  const el = $('coords');
  if (lon == null) { el.hidden = true; return; }
  let t = `<b>${Math.abs(lat).toFixed(5)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(5)}° ${lon < 0 ? 'W' : 'E'}</b>`;
  if (S.terrain.contains(lon, lat)) {
    const i = cellOf({ lon, lat }), c = S.terrain.cls[i], h = S.homeField.cost[i];
    t += `<span>${num(Math.round(S.terrain.z[i]))} m elevation · slope ${Math.floor(S.terrain.slope[i])}°, <i data-cls="${c}">${['safe', 'care', 'too steep'][c]}</i> · ${Number.isFinite(h) ? (h < 40 ? 'at the hatch' : `${mins(h / 60)} walk home`) : 'no safe way home'}</span>`;
  }
  el.innerHTML = t;
  el.hidden = false;
}

function applyMapLayers() {
  for (const [, items] of MAP_LAYERS) for (const [id, , , always] of items) if (!always) S.map.setLayer(id, S.mapOn.has(id));
  drawMapRoute();
}

function drawMapRoute() {
  const r = R();
  S.map.drawRoute(r.plan.out, S.mapOn.has('slope'));
  S.map.drawReturn(S.mapStorm ? stormOptionsFor(r).direct.line : null);
}

// ---------------------------------------------------------------- the guided map: the story told on the map
// Beats: the rover's whole line, the plan, the dock, five cairns, the storm, home.
function beatIds() { return ['intro', 'plan', ...stops().map((_, k) => `stop-${k}`), 'storm', 'home']; }

function useRoute() {
  const r = R();
  S.plan = r.plan; S.tl = r.tl; S.marks = { arr: r.arr, dep: r.dep };
  return r;
}

function openMap(mode) { return guide(mode === 'plan' ? 1 : S.beat || 1); }

function guide(i, opts = {}) {
  token();
  const ids = beatIds();
  i = Math.max(0, Math.min(ids.length - 1, i));
  S.beat = i;
  const id = ids[i];
  S.step = 'map';
  document.body.dataset.step = 'map';
  document.body.dataset.beat = id;
  document.body.classList.remove('alarm', 'thud');
  document.body.classList.toggle('alarm', id === 'storm' && !S.choice);
  hud(false);
  for (const el of [$('h-photo'), $('h-jobs')]) el.hidden = true;
  say(''); act([]);
  const prev = S.lastBeat;
  S.lastBeat = id;
  if (prev !== id) radio(id);
  stage('map', id !== 'intro');
  ensureMap();
  const r = useRoute();
  if (id !== 'storm' && id !== 'home') S.choice = null;
  S.map.drawChoices(null);
  S.map.resize();
  const stopK = id.startsWith('stop-') ? Number(id.slice(5)) : -1;
  // Layers each beat switches on, so the right data is in view when the words talk about it.
  const layers = id === 'intro' ? ['curiosity'] : id === 'plan' ? ['slope'] : id === 'storm' ? ['shield'] : id === 'home' ? ['slope'] : ((S.story.stops[stops()[stopK].id] || {}).layers || ['slope']).filter((l) => l !== 'height');
  if (!opts.keepLayers) S.mapOn = new Set(layers);
  applyMapLayers();
  const last = stops().length - 1;
  if (id === 'intro') S.map.setView('mountain');
  else if (id === 'plan' || id === 'home') S.map.setView('walk');
  else if (id === 'storm') { const o = stormOptionsFor(r); S.map.fit([...o.direct.line, ...o.trail.line, ...o.shelter.line]); }
  else S.map.focus(stops()[stopK].lon, stops()[stopK].lat, 420);
  const at = stopK >= 0 ? stopK : id === 'storm' ? last : 0;
  S.map.markStops(stopK, stopK >= 0 ? stopK : id === 'home' ? stops().length : 0);
  S.map.setCrew(stops()[at].lon, stops()[at].lat);
  if (id === 'storm') stormLines();
  card();
  mapPanel();
  window3d(id, prev);
  try { history.replaceState(null, '', `#${id}`); } catch (e) { /* file:// */ }
}

function numbersAt(k) {
  const st = sim.stateAt(S.tl, S.marks.dep[k].t);
  const homeSec = S.homeField.cost[cellOf(stops()[k])];
  return `<dl class="guide__nums">
    <div><dt>Air left</dt><dd>${mins(st.o2 - reserve())}</dd></div>
    <div><dt>Walk home</dt><dd>${homeSec < 40 ? 'here' : mins(homeSec / 60)}</dd></div>
    <div><dt>Dose</dt><dd>${st.dose.toFixed(2)} mSv</dd></div>
    <div><dt>Outside</dt><dd>${mins(st.t)}</dd></div>
  </dl>`;
}

const EARTH_IMG = 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/solar/2023/09/p/i/a/1/PIA17936.jpg';
// Curiosity's mission clock: sols since landing (one sol = 88,775 s), counting from the start of sol 0.
const solNow = () => (Date.now() - Date.UTC(2012, 7, 5, 13, 50)) / 88775244;
const solText = () => { const v = solNow(); return `sol ${num(Math.floor(v))}.${String(Math.floor((v % 1) * 1e5)).padStart(5, '0')}`; };
// The shared cairn (netlify/functions/stones.mjs): one count for everyone who walks this map.
async function cairnGet() {
  try { const r = await fetch('/api/stones', { cache: 'no-store', signal: AbortSignal.timeout(3500) }); if (!r.ok) return; const j = await r.json(); if (typeof j.count === 'number') S.cairn = j; } catch (e) { /* offline or local: the cairn is just yours */ }
}
async function cairnAdd() {
  try { const r = await fetch('/api/stones', { method: 'POST' }); if (!r.ok) return null; const j = await r.json(); if (typeof j.count === 'number') S.cairn = j; return j; } catch (e) { return null; }
}
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${num(n)}${s[(v - 20) % 10] || s[v] || s[0]}`; };
function stoneCount() { try { return Number(localStorage.getItem('redcairn.stones') || 0); } catch (e) { return S.stoneLaid ? 1 : 0; } }
const camName = (c) => (/navigation/i.test(c) ? 'Navcam' : /mast/i.test(c) ? 'Mastcam' : /hazard/i.test(c) ? 'Hazcam' : /mahli/i.test(c) ? 'MAHLI' : c || 'Camera');
function btn(id, label, alt) { return `<button type="button" class="act${alt ? ' act--alt' : ''}" data-a="${id}">${label}</button>`; }

function card() {
  const ids = beatIds(), id = ids[S.beat], n = ids.length, last = stops().length - 1, routes = computeRoutes();
  const g = S.gale.rover;
  let kicker = '', title = '', body = '', extra = '', go = '';
  S.win = '';
  if (id === 'intro') {
    kicker = 'A survival map for the first walk on Mars';
    title = 'Fourteen years. One line.';
    if (S.cairn && S.cairn.count > 0) {
      const c = S.cairn.count, me = S.stoneLaid || stoneCount() > 0;
      extra = `<p class="guide__walkers"><b>${num(c)}</b> ${c === 1 ? 'person has' : 'people have'} walked this map${me ? ', you among them' : ' before you'}. Each left a stone on the last cairn.</p>`;
    }
    body = `That orange line is Curiosity, climbing Mount Sharp alone since 2012: ${g.distanceKm.toFixed(1)} km so far. The last 1.5 km of it will be the first walk a person takes on Mars. This map answers the three questions for that walk: <b>where is it safe to step, what is worth stopping for, and can I get home?</b>`;
    extra += `<label class="guide__name"><span>Your name, for the habitat radio</span><input id="callsign" type="text" maxlength="24" autocomplete="off" placeholder="EVA-1" value="${esc(S.name || '')}"></label>`;
    go = btn('next', 'Begin');
    S.win = winCrater();
  } else if (id === 'plan') {
    kicker = 'Where is it safe to step?';
    title = 'Choose how to follow it.';
    body = `${esc(S.story.objective)} Green ground is safe in a spacesuit, amber needs care, red is too steep (over ${S.limits.noGo}°). The rover’s own track is longer, but every metre of it has been driven, and orbit cannot see rocks smaller than a metre.`;
    extra = `<div class="guide__routes">${ROUTES.map((rr) => { const x = routes[rr.id]; return `<button type="button" class="mroute" data-route="${rr.id}" aria-pressed="${rr.id === S.pick}"><b>${esc(rr.name)}</b><span>${mins(x.tl.end.t)} · ${(x.plan.outD * 2 / 1000).toFixed(1)} km · steepest ${x.plan.maxSlope.toFixed(0)}°</span></button>`; }).join('')}</div>`;
    go = btn('next', 'Start at the rover') + btn('prev', 'Back', true);
    S.win = win3d('The start of the trail in 3D at true scale: the HiRISE photo on its 1 m elevation model, slope painted on. Drag to look around.');
  } else if (id.startsWith('stop-')) {
    const k = Number(id.slice(5)), wp = stops()[k], s = S.story.stops[wp.id] || {};
    kicker = k ? `Cairn ${k} of ${last} · ${s.title || wp.plain.title}` : `The rover · ${wp.name}`;
    title = esc(s.moment || wp.plain.title);
    body = esc(s.sub || wp.story);
    const earth = wp.earthNamesakes.length ? ` Named after ${wp.earthNamesakes.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join(' and ')}: see it from orbit in Worldview.` : '';
    extra = `<figure class="guide__photo"><a href="${esc(wp.pov.imageUrl)}" target="_blank" rel="noopener"><img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer"></a><figcaption><b>What Curiosity saw from here</b>${esc(camName(wp.pov.camera))}, sol ${num(wp.pov.sol)}, ${esc(day(wp.pov.utc))}.${earth}</figcaption></figure>${numbersAt(k)}`;
    if (k === last) {
      extra += `<figure class="guide__photo"><a href="${EARTH_IMG}" target="_blank" rel="noopener"><img src="${EARTH_IMG}?w=600" alt="Earth as a bright point in the Martian evening sky, with the Moon below it"></a><figcaption><b>Look up after sunset</b>The brightest point in the sky is Earth, with the Moon just below. Curiosity took this from Gale crater: Mastcam, sol 529, 31 January 2014. NASA/JPL-Caltech/MSSS/TAMU.</figcaption></figure>`;
      const n = S.cairn ? S.cairn.count : 0;
      extra += S.stoneLaid
        ? `<p class="guide__stone">${S.myStone ? `Yours is the <b>${ordinal(S.myStone)}</b> stone on this cairn.` : 'Your stone is on this cairn.'} Whoever walks this map next will find it.</p>`
        : n ? `<p class="guide__stone guide__stone--others">This cairn holds <b>${num(n)}</b> ${n === 1 ? 'stone' : 'stones'}, one from each person who walked this map before you.</p>` : '';
    }
    const nextLabel = k < last ? `Follow it to cairn ${k + 1}<small>${legM(k)} m on</small>` : 'Turn for home';
    go = btn('next', nextLabel) + (k === last && !S.stoneLaid ? btn('stone', 'Add a stone to the cairn<small>for whoever walks here next</small>', true) : '') + btn('prev', 'Back', true);
    S.win = win3d(k === last && S.cairn && S.cairn.count ? 'Every stone around this cairn was left by a real person who walked this map. Drag to look around.' : k ? 'Our rover, standing in for Curiosity, on the real ground at true scale. Drag to look around.' : 'Our rover, standing in for Curiosity, where your walk begins. Drag to look around.', true);
  } else if (id === 'storm') {
    const o = stormOptionsFor(R());
    kicker = 'Simulated drill · solar storm at the turnaround';
    if (!S.choice) {
      title = 'The Sun just flared. How do you get home?';
      body = `You and EVA-2 are at the far end of the walk. Radiation is twenty times normal, shaped on the storm Curiosity measured in September 2017. The map has drawn three ways back on the real terrain. Purple shows where hills hide part of the sky.`;
      extra = `<div class="guide__routes">
        <button type="button" class="mroute mroute--white" data-a="c-direct"><b>Take the new line</b><span>${mins(o.direct.min)} · ${o.direct.dose.toFixed(2)} mSv · leans on what cover the hills give</span></button>
        <button type="button" class="mroute mroute--amber" data-a="c-trail"><b>The way you came</b><span>${mins(o.trail.min)} · ${o.trail.dose.toFixed(2)} mSv · the ground you know</span></button>
        <button type="button" class="mroute mroute--violet" data-a="c-shelter"><b>Shelter behind a ridge for ${STORM_HOURS} h</b><span>${o.shelter.dose.toFixed(2)} mSv · the best ridge blocks ${o.shelter.blocked}%</span></button></div>`;
      go = btn('prev', 'Back', true);
      S.win = win3d('At the turnaround. White: the new line home. Amber: the way you came.');
    } else {
      const x = o[S.choice];
      title = S.verdict;
      body = S.choice === 'shelter' ? `A ridge hides only part of the sky. On Mars, the best shelter is the rover and the habitat, so the fastest safe way home wins.` : S.choice === 'trail' ? `The ground you know is safe, but longer means more time under the storm. The map’s new line was ${Math.round((1 - o.direct.dose / o.trail.dose) * 100)}% less dose.` : `The map knew the way home from every point before the storm began. That is what it is for.`;
      extra = `<dl class="guide__nums"><div><dt>To the hatch</dt><dd>${mins(x.min)}</dd></div><div><dt>Storm dose</dt><dd>${x.dose.toFixed(2)} mSv</dd></div></dl>`;
      go = btn('next', 'Go home') + btn('restorm', 'Choose again', true);
      S.win = win3d(S.choice === 'shelter' ? 'To the ridge, two hours under the storm, then home.' : 'Home, behind the rover.');
    }
  } else if (id === 'home') {
    const o = S.choice ? stormOptionsFor(R())[S.choice] : null, end = o ? o.tl.end : S.tl.end;
    const career = S.mission.hazards.radiation.careerLimitMSv;
    const jobs = stops().slice(1).reduce((s2, w) => s2 + w.plain.do.length, 0);
    kicker = 'Back at the hatch';
    title = 'It walked this ground alone, so that you would not have to.';
    const mine = S.myStone ? ` Your stone is the ${ordinal(S.myStone)} on the last cairn.` : '';
    body = `Curiosity is still out there, ${vars().roverAheadM} m past your turnaround, climbing.${mine} On 5 August 2013, alone in this crater, it played “Happy Birthday” to itself by shaking its sample lab (SAM) at the right pitches. It has done that once.`;
    extra = `<p class="guide__sol"><span>Curiosity, today</span><b id="sol-now">${solText()}</b><em>Its prime mission was one Mars year: 669 sols.</em></p>`;
    extra += `<dl class="guide__answers">
      <div><dt>Where was it safe to step?</dt><dd>Everywhere on the route: the steepest ground was ${S.plan.maxSlope.toFixed(0)}°, under the suit’s ${S.limits.noGo}° limit.</dd></div>
      <div><dt>What was worth stopping for?</dt><dd>${last} cairns, ${jobs} jobs, and rock from both sides of the line where this part of Mars began to dry.</dd></div>
      <div><dt>Did you get home?</dt><dd>Yes, both of you, with ${mins(end.o2 - reserve())} of air left after ${mins(end.t)} outside, and ${end.dose.toFixed(2)} mSv: ${((end.dose / career) * 100).toFixed(2)}% of a NASA career limit.</dd></div></dl>`;
    go = btn('again', 'Walk it again') + btn('free', 'Explore every layer', true);
    S.win = win3d('The rover drives on, up its own track, alone.');
  }
  parkStage();
  $('guide').innerHTML = `<div class="guide__top"><span>${esc(kicker)}</span><em>${S.beat + 1} / ${n}</em></div>
    ${S.win}<h2>${title}</h2><p class="guide__body">${body}</p>${extra}<div class="guide__go">${go}</div>`;
  $('guide').hidden = false;
  mountStage();
  clearInterval(S.solT);
  if ($('sol-now')) S.solT = setInterval(() => { const e = $('sol-now'); if (e) e.textContent = solText(); else clearInterval(S.solT); }, 250);
  const cs = $('callsign');
  if (cs) cs.addEventListener('input', () => { S.name = cs.value.trim(); try { localStorage.setItem('redcairn.name', S.name); } catch (e) { /* private mode */ } });
  document.body.removeAttribute('data-free');
  $('guide').scrollTop = 0;
}

function stormLines() {
  const o = stormOptionsFor(R());
  const lines = S.choice ? [{ pts: o[S.choice].line, color: S.choice === 'direct' ? '#ffffff' : S.choice === 'trail' ? '#ffc23a' : '#b28cff', dash: '10 8' }]
    : [{ pts: o.shelter.line, color: '#b28cff', dash: '3 6' }, { pts: o.trail.line, color: '#ffc23a', dash: '6 6' }, { pts: o.direct.line, color: '#ffffff', dash: '10 8' }];
  S.map.drawChoices(lines);
}

function chooseOnMap(id) {
  const o = stormOptionsFor(R());
  S.choice = id;
  const best = ['direct', 'trail', 'shelter'].reduce((a, b) => (o[a].dose <= o[b].dose ? a : b));
  S.verdict = id === best ? 'Right call: the least radiation of the three.' : `You made it, with ${(o[id].dose / o[best].dose).toFixed(1)}× the dose of the best choice.`;
  document.body.classList.remove('alarm');
  token();
  stormLines();
  card();
  window3d('storm', 'storm');
  radio('storm-chosen');
}

// Leave the story on screen but out of the way, so every layer can be explored by hand.
function freeMap() {
  token();
  document.body.setAttribute('data-free', '');
  $('guide').hidden = true;
  mapPanel();
  parkStage();
  S.stage.setMode('none');
}

// ---------------------------------------------------------------- the window: the 3D ground inside the story card
function win3d(caption, ground) {
  return `<div class="guide__window" id="gwin"><span class="guide__wincap">${esc(caption)}</span>${ground ? '<button type="button" class="guide__ground" data-a="ground">See it from the ground</button>' : ''}</div>`;
}

// The intro: Gale crater rendered in Blender, with Curiosity's fourteen years drawing themselves across it.
function winCrater() {
  const v = S.galeView.views.wide, W = v.width, H = v.height;
  const d = v.track.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(0)} ${(y * H).toFixed(0)}`).join('');
  const [wx, wy] = v.places.walk.xy;
  const water = v.waterMinerals.map((m) => `<circle class="gc__water" cx="${(m.xy[0] * W).toFixed(0)}" cy="${(m.xy[1] * H).toFixed(0)}" r="16"/>`).join('');
  // Crop to Mount Sharp and the line Curiosity drove up its flank.
  const z = 0.8, x0 = 0.12, y0 = 0.14;
  return `<div class="guide__window guide__window--crater"><div class="gc__frame" style="width:${100 / z}%;height:${100 / z}%;left:${(-x0 * 100) / z}%;top:${(-y0 * 100) / z}%"><img src="${esc(v.images.color)}" alt="Gale crater in 3D, rendered in Blender from orbital elevation">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${water}<path class="gc__line" pathLength="1" d="${d}"/><circle class="gc__walk" cx="${(wx * W).toFixed(0)}" cy="${(wy * H).toFixed(0)}" r="14"/></svg></div>
    </div><p class="guide__wincap guide__wincap--below">Mount Sharp in 3D, rendered in Blender from MOLA + HRSC elevation (heights ×3). Blue: water minerals seen from orbit. Orange: Curiosity, 2012 to today.</p>`;
}

function prep3d(r) {
  S.path = worldPath(r.plan.out);
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setHome(S.homeField);
  S.stage.drawReturn(null);
  S.stage.setAlternatives(null);
  S.stage.setPinsVisible(false);
  S.stage.resetLook();
  S.stage.rate = 3.2;
  S.stage.setHaze();
  if (S.roverD == null) { S.roverD = 4; S.rolled = 0; }
}

// An orbit camera behind and to one side of the rover: the 2.5D view, close enough to see the wheels turn.
function chaseCam(p, yaw, o = {}, immediate = false) {
  const cur = S.stage.cam.az;
  let az = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)) * DEGS + (o.side ?? 35);
  az = cur + ((((az - cur) % 360) + 540) % 360) - 180;
  S.stage.flyWalk({ x: p.x, y: S.stage.heightAt(p.x, p.z) + 1, z: p.z, dist: o.dist ?? 15, polar: o.polar ?? 70, az }, immediate);
}

// Drive the rover along a path; the map's marker follows it. Resolves false if another beat took over.
function roll(path, d0, d1, ms, cam, onMain) {
  const t = S.token, start = performance.now();
  let prevD = d0, camYaw = null, lastT = start;
  S.spin = 0;
  S.stage.camRate = 7;
  if (S.sound) S.sound.roverMoving(true);
  return new Promise((done) => {
    const frame = (now) => {
      if (!live(t)) return done(false);
      const f = Math.min(1, (now - start) / ms), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      const d = d0 + (d1 - d0) * e, p = path.at(d), yaw = path.dir(d);
      S.rolled += Math.abs(d - prevD); prevD = d;
      if (onMain) S.roverD = d;
      S.stage.placeRover(p.x, p.z, yaw, S.rolled);
      // The camera is locked to the rover (so it holds at any frame rate); only its turning is smoothed, in real time.
      const dtr = (now - lastT) / 1000; lastT = now;
      camYaw = camYaw == null ? yaw : camYaw + Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw)) * (1 - Math.exp(-2.2 * dtr));
      if (cam) cam(p, camYaw, f);
      S.map.setCrew(lonOfX(p.x), latOfZ(p.z));
      if (f < 1) requestAnimationFrame(frame); else done(true);
    };
    requestAnimationFrame(frame);
  }).then((ok) => { S.stage.camRate = 2.6; if (S.sound && ok) S.sound.roverMoving(false); return ok; });
}

// What the window shows on each beat. The rover is in every one of them, always a little ahead of you.
function window3d(id, prev) {
  S.spin = 0;
  if (id === 'intro' || !$('gwin')) return;
  const r = R(), n = stops().length, last = n - 1;
  prep3d(r);
  if (id === 'plan') {
    setLayers(['slope']);
    S.stage.setCairns(n);
    S.stage.markStops(-1, 0);
    S.roverD = 4; placeRover(4);
    // Low behind the rover at the start, looking up the trail: slope painted on the real relief ahead.
    const p = S.path.at(4), ahead = S.path.at(60);
    chaseCam(p, Math.atan2(ahead.z - p.z, ahead.x - p.x), { side: 14, dist: 20, polar: 74 }, prev !== 'plan');
    return;
  }
  if (id.startsWith('stop-')) {
    const k = Number(id.slice(5)), s = S.story.stops[stops()[k].id] || {};
    setLayers((s.layers || []).filter((l) => l === 'track'));
    const dk = S.plan.out[S.plan.idx[k]].d, park = Math.min(S.path.length, dk + (k ? 9 : 4));
    S.stage.markStops(k, k);
    // Settle on a three-quarter view of the cairn with the rover parked just beyond it.
    const settle = (immediate) => {
      const p = S.path.at(park), c = k ? S.stage.cairnPoint(k) : p;
      // At the turnaround the cairn is the subject: close in on it and everyone's stones around it.
      if (k === n - 1) chaseCam(c, S.path.dir(park), { side: 70, dist: 8.5, polar: 64 }, immediate);
      else chaseCam({ x: (p.x + c.x) / 2, z: (p.z + c.z) / 2 }, S.path.dir(park), { side: 58, dist: k ? 17 : 15, polar: 72 }, immediate);
      S.spin = 1.6;
    };
    // Stones this browser added on earlier visits are still on the last cairn.
    if (k === n - 1) S.stage.setCommunal(k, Math.max(0, (S.cairn ? S.cairn.count : 0) - (S.stoneLaid ? 1 : 0)));
    const fromPrev = prev === `stop-${k - 1}` && S.roverD < park;
    if (fromPrev) {
      // The cairn ahead is not there yet: it rises when the rover reaches it.
      S.stage.setCairns(k - 1);
      const d0 = S.roverD;
      roll(S.path, d0, park, clamp((park - d0) * 13, 3200, 7500), (p, yaw) => chaseCam(p, yaw, {}, true), true)
        .then((ok) => { if (ok) { S.stage.setCairns(k); settle(false); } });
    } else {
      S.stage.setCairns(k);
      S.roverD = park; placeRover(park);
      settle(true);
    }
    return;
  }
  if (id === 'storm') {
    const o = stormOptionsFor(r), wp = stops()[last];
    S.stage.setCairns(last);
    S.stage.markStops(last, last);
    S.stage.setHome(S.stormField);
    setLayers(['shield']);
    if (!S.choice) {
      const dl = S.plan.out[S.plan.idx[last]].d, park = Math.min(S.path.length, dl + 9);
      S.roverD = park; placeRover(park);
      S.stage.drawReturn(o.direct.line);
      S.stage.setAlternatives([o.trail.line]);
      const p = S.path.at(park), dock = S.stage.worldOf(stops()[0].lon, stops()[0].lat);
      chaseCam(p, Math.atan2(dock.z - p.z, dock.x - p.x), { side: 16, dist: 34, polar: 72 }, true);
      S.spin = 0.8;
    } else {
      const x = o[S.choice], path = worldPath(x.line);
      S.stage.drawReturn(x.line);
      roll(path, 0, path.length, clamp(path.length * 6, 5000, 11000), (p, yaw) => chaseCam(p, yaw, { dist: 22, polar: 68 }, true))
        .then((ok) => { if (ok) { S.roverD = 4; S.spin = 1.2; } });
    }
    S.map.setCrew(wp.lon, wp.lat);
    return;
  }
  if (id === 'home') {
    // At the hatch, the rover turns away and drives on up its own track, alone. The camera stays; it gets smaller.
    S.stage.setCairns(n);
    S.stage.markStops(-1, n);
    setLayers([]);
    const track = S.route.roverTrack.map((p) => ({ lon: p[0], lat: p[1] })), dock = stops()[0];
    let i0 = 0, bd = Infinity;
    track.forEach((p, i) => { const dd = groundMetres(p, dock); if (dd < bd) { bd = dd; i0 = i; } });
    const on = worldPath(track.slice(i0).filter((p) => S.terrain.contains(p.lon, p.lat)));
    const p0 = on.at(0);
    S.rolled = S.rolled || 0;
    S.stage.placeRover(p0.x, p0.z, on.dir(0), S.rolled);
    chaseCam(p0, on.dir(0), { side: 20, dist: 18, polar: 72 }, true);
    roll(on, 0, on.length, 32000, (p, yaw, f) => chaseCam(p, yaw, { side: 20 + f * 25, dist: 16 + f * 150, polar: 72 - f * 14 }, true))
      .then(() => { S.map.setCrew(dock.lon, dock.lat); });
    S.map.setCrew(dock.lon, dock.lat);
  }
}

function mapPanel() {
  const w = S.conditions.weather, sw = S.conditions.spaceWeather || {}, routes = computeRoutes();
  const free = document.body.hasAttribute('data-free');
  const all = MAP_LAYERS.flatMap(([kind, items]) => items.filter((i) => !i[3]).map((i) => [kind, ...i]));
  const legend = (id) => (LEGEND[id] || []).map(([c, t]) => `<span class="lg">${c ? `<i style="background:${c}"></i>` : '<i class="lg--none"></i>'}${esc(t)}</span>`).join('');
  // During the story: only what is on the map now, with what its colours mean. Every layer waits in the free map.
  const story = `<section class="mapui__sec"><h3>On the map now</h3>
      ${all.filter(([, id]) => S.mapOn.has(id)).map(([kind, id, name, from]) => `<div class="mlayer__on"><button type="button" class="mlayer" data-maplayer="${id}" aria-pressed="true"><b>${esc(name)}</b><small>${esc(kind)} · ${esc(from)}</small></button><p class="mlayer__legend">${legend(id)}</p></div>`).join('') || '<p>Orbital photos only: HiRISE and CTX, Mars Reconnaissance Orbiter.</p>'}
      <button type="button" class="act act--alt mapui__all" data-a="free">All ${all.length} layers</button>
    </section>`;
  const full = `<div class="mapui__views">${['walk', 'mountain', 'crater'].map((v) => `<button type="button" data-view="${v}">${esc(S.mission.views[v].label)}</button>`).join('')}</div>
    <section class="mapui__sec"><h3>Layers</h3>
      ${MAP_LAYERS.map(([kind, items]) => `<div class="mlayer__group"><span>${esc(kind)}</span>${items.map(([lid, name, from, always]) => `<button type="button" class="mlayer" data-maplayer="${lid}" aria-pressed="${always ? 'true' : S.mapOn.has(lid)}" ${always ? 'disabled' : ''}><b>${esc(name)}</b><small>${esc(from)}</small></button>${!always && S.mapOn.has(lid) ? `<p class="mlayer__legend">${legend(lid)}</p>` : ''}`).join('')}</div>`).join('')}
    </section>
    <section class="mapui__sec"><h3>Route</h3>
      ${ROUTES.map((rr) => { const x = routes[rr.id]; return `<button type="button" class="mroute" data-route="${rr.id}" aria-pressed="${rr.id === S.pick}"><b>${esc(rr.name)}</b><span>${mins(x.tl.end.t)} · ${(x.plan.outD * 2 / 1000).toFixed(1)} km · steepest ${x.plan.maxSlope.toFixed(0)}°</span></button>`; }).join('')}
    </section>`;
  $('mapui').innerHTML = `
    <header class="mapui__head"><p class="mapui__kicker">${free ? 'Every layer' : 'Layers and data'}</p><p>${MAP_LAYERS.length - 1} kinds of data from seven Mars missions, at walking scale. Point anywhere on the map for height, slope and the walk home.</p></header>
    ${free ? full : story}
    <section class="mapui__sec"><h3>Conditions today</h3>
      <p><b>Weather</b> ${w.airMinC}° to ${w.airMaxC}° C, ${num(w.pressurePa)} Pa, sky ${esc(String(w.sky).toLowerCase())} · Curiosity REMS, sol ${num(w.sol)} (${esc(day(w.earthDate))})</p>
      <p><b>Radiation</b> ${S.mission.hazards.radiation.backgroundMSvPerDay} mSv per day at the surface · Curiosity RAD</p>
      ${sw.sepCount != null ? `<p><b>Space weather</b> ${sw.sepCount} solar energetic particle events logged by NASA DONKI, ${esc(day(sw.from))} to ${esc(day(sw.to))}; latest ${esc(day(sw.latestSep))}. Not every one reaches Mars.</p>` : ''}
    </section>
    <section class="mapui__sec"><h3>The other rover, today</h3>
      <p>Perseverance is driving in Jezero crater, about 3,800 km from this walk. Its newest raw image, fetched live: the same ground truth a crew would get before a walk there. This map needs only an elevation model and a rover’s photos, so Jezero could be mapped the same way.</p>
      <figure class="mapui__live" id="map-live"></figure>
    </section>`;
  fillLive($('map-live'), true);
}

// From the map, stand at a stop in 3D: the real ground at true scale, the rover parked beyond, the visor on.
function groundAt(k) {
  token();
  S.step = 'walk';
  document.body.dataset.step = 'walk';
  stage('walk');
  const r = useRoute();
  S.path = worldPath(r.plan.out);
  S.k = k;
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setHome(S.homeField);
  S.stage.drawReturn(null);
  S.stage.setAlternatives(null);
  S.stage.setCairns(stops().length);
  S.stage.setPinsVisible(true);
  S.stage.resetLook();
  S.stage.setHaze();
  S.stage.rate = 3.2;
  miniMap(r.plan);
  const s = S.story.stops[stops()[k].id] || {};
  setLayers((s.layers || []).filter((l) => l !== 'height'));
  const d = S.plan.out[S.plan.idx[k]].d;
  S.youD = Math.max(0, d - (k ? 6 : 0));
  S.rolled = S.rolled || 0;
  S.roverD = Math.min(S.path.length, d + (k ? 9 : FOLLOW_M + 3));
  placeRover(S.roverD);
  S.stage.markStops(k, k);
  const me = S.path.at(S.youD), look = k ? S.stage.cairnPoint(k) : S.path.at(S.roverD);
  S.stage.setEye(me.x, me.z, Math.atan2(look.z - me.z, look.x - me.x), k ? -0.16 : -0.06, 0, true);
  hud(true);
  arrive(k);
  S.nextBearing = k < stops().length - 1 ? bearing(stops()[k], stops()[k + 1]) : bearing(stops()[k], stops()[0]);
  if (!k) radio('stop-0');
  try { history.replaceState(null, '', `#ground-${k}`); } catch (e) { /* file:// */ }
}

// Perseverance's newest frame, fetched once and shown wherever there is a place for it.
function m2020(cb) {
  if (S.m2020) return cb(S.m2020);
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => { const im = d.images && d.images[0]; if (im) { S.m2020 = im; cb(im); } }).catch(() => {});
}
function fillLive(el, short) {
  if (!el) return;
  m2020((im) => {
    el.innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Newest raw image from the Perseverance rover at Jezero crater" referrerpolicy="no-referrer"><figcaption>Perseverance at Jezero crater, its Mars day ${num(im.sol)} (${esc(day(im.date_taken_utc))}), from the raw images gallery. ${esc(im.credit)}</figcaption>`;
    el.hidden = false;
  });
}

function mapStop(k) {
  const i = beatIds().indexOf(`stop-${k}`);
  if (i >= 0) guide(i);
}

// Every part can be entered directly (nav, hash links). Each jump clears whatever the last one left behind.
const HASHES = () => ['intro', 'plan', 'walk', 'storm', 'home', 'map', ...beatIds(), ...stops().map((_, k) => `ground-${k}`)];
function jump(id) {
  token();
  S.stage.rate = 3.2;
  for (const el of [$('h-photo'), $('h-jobs')]) el.hidden = true;
  document.body.classList.remove('alarm', 'thud');
  if (S.sound) S.sound.roverMoving(false);
  S.stage.resetLook();
  const ids = beatIds();
  if (id.startsWith('ground-')) return groundAt(Number(id.slice(7)));
  if (id === 'map' || id === 'explore') { guide(S.beat || 1); return freeMap(); }
  if (id === 'walk') return guide(ids.indexOf('stop-0'));
  const i = ids.indexOf(id === 'cover' ? 'intro' : id);
  return guide(i >= 0 ? i : 0);
}

function setGoal(goal, ask = '') { $('h-goal').textContent = goal; $('h-ask').textContent = ask; }
const nCairns = () => stops().length - 1;

function legM(k) { return Math.round((S.plan.out[S.plan.idx[k + 1]].d - S.plan.out[S.plan.idx[k]].d) / 10) * 10; }

function placeRover(d) {
  const p = S.path.at(d);
  S.stage.placeRover(p.x, p.z, S.path.dir(d), S.rolled);
  if (S.mm) S.mm.rover(lonOfX(p.x), latOfZ(p.z));
}
function lonOfX(x) { const t = S.terrain, b = t.meta.bounds; return b.west + ((x / t.cellX + (t.cols - 1) / 2 + 0.5) / t.cols) * (b.east - b.west); }
function latOfZ(z) { const t = S.terrain, b = t.meta.bounds; return b.north - ((z / t.cellY + (t.rows - 1) / 2 + 0.5) / t.rows) * (b.north - b.south); }

// Walk one leg: the rover rolls ahead, you follow a few steps behind, the suit clock runs.
async function leg(k) {
  const t = token();
  const d0 = S.plan.out[S.plan.idx[k]].d, d1 = S.plan.out[S.plan.idx[k + 1]].d;
  const t0 = S.marks.dep[k].t, t1 = S.marks.arr[k + 1].t;
  const dur = Math.max(4200, Math.min(9000, (d1 - d0) * 15));
  S.nextBearing = bearing(stops()[k], stops()[k + 1]);
  setGoal(`Walking to cairn ${k + 1} of ${nCairns()}`, (S.story.stops[stops()[k + 1].id] || {}).q || '');
  S.stage.markStops(-1, k + 1);
  act([]);
  say('');
  if (S.sound) S.sound.roverMoving(true);
  // You stop a few steps short of the cairn and look at it; the rover parks just beyond.
  const y0 = S.youD, y1 = Math.max(y0, d1 - 6);
  const start = performance.now(), rStart = S.roverD;
  await new Promise((done) => {
    const frame = (now) => {
      if (!live(t)) return done();
      const f = Math.min(1, (now - start) / dur);
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      const you = y0 + (y1 - y0) * e;
      const rov = Math.min(S.path.length, Math.max(rStart, you + FOLLOW_M + 3 + (d1 + 9 - (y1 + FOLLOW_M + 3)) * e));
      S.rolled += rov - S.roverD;
      S.roverD = rov;
      placeRover(rov);
      const me = S.path.at(you), rv = S.path.at(rov);
      S.stage.setEye(me.x, me.z, Math.atan2(rv.z - me.z, rv.x - me.x), -0.08 + Math.sin(now / 210) * 0.012, 0, true);
      S.youD = you;
      readout(sim.stateAt(S.tl, t0 + (t1 - t0) * e));
      if (f < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
  if (S.sound) S.sound.roverMoving(false);
  if (live(t)) arrive(k + 1);
}

// At a cairn: one line, the rover's own photograph from this spot, the job, and on.
function arrive(k) {
  S.k = k;
  const wp = stops()[k], last = stops().length - 1, s = S.story.stops[wp.id] || {};
  S.stage.markStops(k, k);
  readout(sim.stateAt(S.tl, S.marks.dep[k].t));
  setLayers(s.layers || []);
  const c = S.stage.cairnPoint(k), me = S.path.at(S.youD);
  S.stage.setEye(me.x, me.z, Math.atan2(c.z - me.z, c.x - me.x), -0.16, 0);
  const earth = wp.earthNamesakes.length ? `<span class="hud__earth">Named after Earth: ${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.name)} in Worldview</a>`).join(' · ')}</span>` : '';
  $('h-photo').innerHTML = `<img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer"><figcaption>Curiosity stood here on ${esc(day(wp.pov.utc))}. This is what it saw. ${earth}</figcaption>`;
  $('h-photo').hidden = false;
  $('h-jobs').innerHTML = wp.plain.do.map((j) => `<li>${esc(j)}</li>`).join('');
  $('h-jobs').hidden = false;
  const lay = LAYERS.find((l) => (s.layers || [])[0] === l.id);
  setGoal(k ? `Cairn ${k} of ${nCairns()} · ${s.title || wp.plain.title}` : 'The rover dock', s.q || '');
  say(esc(s.moment || s.q || s.title || wp.plain.title), `${esc(s.sub || s.a || s.line || '')}${lay ? ` <span class="say__layer">Visor layer on: ${esc(lay.name)}.</span>` : ''}`);
  act([k < last ? { id: 'go', label: k ? 'Follow the rover on' : 'Follow the rover', note: `to cairn ${k + 1} · ${legM(k)} m` }
    : { id: 'turn', label: 'Turn for home', note: 'the storm drill, on the map' }, { id: 'tomap', label: 'Back to the map' }]);
}

// ---------------------------------------------------------------- the storm
// The three ways home from the turnaround, at storm radiation, for any planned route (cached per route).
function stormOptionsFor(r) {
  S.stormCache = S.stormCache || {};
  if (S.stormCache[r.id]) return S.stormCache[r.id];
  const last = stops().length - 1, wp = stops()[last];
  const st = sim.stateAt(r.tl, r.dep[last].t);
  const start = { t: st.t, o2: st.o2, batt: st.batt, dose: st.dose };
  const hot = cfgFor(true), calm = cfgFor(false), at = cellOf(wp);
  const res = (tl, line) => ({ tl, line, min: tl.end.t - start.t, dose: tl.end.dose - start.dose });
  const dLine = [{ lon: wp.lon, lat: wp.lat }, ...sim.smooth(S.router.trace(S.stormField, at), 2).slice(1)];
  const direct = res(sim.buildTimeline(sim.profile(S.terrain, dLine, S.limits, 4), new Map(), start, hot), dLine);
  const plan = r.plan;
  const bPts = plan.pts.slice(plan.idx[last]).map((p) => ({ ...p, d: p.d - plan.outD }));
  const trail = res(sim.buildTimeline(bPts, new Map(), start, hot), bPts.map((p) => ({ lon: p.lon, lat: p.lat })));
  const cands = S.terrain.shelters(60, 20).filter((c) => groundMetres(c, wp) < 300);
  const best = cands.sort((a, b) => b.blocked - a.blocked)[0] || S.terrain.shelters(1, 10)[0];
  const sField = S.router.field(best.idx, { mode: 'fastest', stopAt: at });
  const toShelter = [{ lon: wp.lon, lat: wp.lat }, ...sim.smooth(S.router.trace(sField, at), 2).slice(1)];
  const p1 = sim.profile(S.terrain, toShelter, S.limits, 4);
  const t1 = sim.buildTimeline(p1, new Map([[p1.length - 1, { min: STORM_HOURS * 60, wpId: 'shelter' }]]), start, hot);
  const home = sim.smooth(S.router.trace(S.homeField, best.idx), 2);
  const t2 = sim.buildTimeline(sim.profile(S.terrain, home, S.limits, 4), new Map(), t1.end, calm);
  const shelter = { ...res(t2, toShelter.concat(home)), blocked: Math.round(best.blocked * hot.shieldEff * 100) };
  S.stormCache[r.id] = { start, direct, trail, shelter };
  return S.stormCache[r.id];
}

function vars() {
  const r = S.gale.rover, last = stops()[stops().length - 1];
  const k = (2 * Math.PI * 3389.5) / 360;
  const ahead = Math.hypot((r.latest[0] - last.lon) * k * Math.cos((r.latest[1] * Math.PI) / 180), (r.latest[1] - last.lat) * k) * 1000;
  return { roverAheadM: num(Math.round(ahead / 10) * 10) };
}

// ---------------------------------------------------------------- data and sources
function aboutHTML() {
  const m = S.mission, src = (id) => m.sources.find((s) => s.id === id);
  const rows = [
    ...MAP_LAYERS.flatMap(([kind, items]) => items.map(([, name, from]) => [`Map layer: ${name}`, kind, `${from}${['hirise', 'ctx', 'mola', 'thermal', 'geology'].some((x) => items.find((i) => i[1] === name && i[0] === x)) ? ', tiles from Mars Trek' : ''}`])),
    ['Space weather', 'Heliophysics', `NASA DONKI (Space Weather Database of Notifications, Knowledge, Information), ${S.conditions.spaceWeather ? `${S.conditions.spaceWeather.sepCount} solar particle events, ${S.conditions.spaceWeather.from} to ${S.conditions.spaceWeather.to}` : 'not loaded'}`],
    ['Earth namesakes at the cairns', 'Optical, Earth', 'NASA Worldview satellite imagery'],
    ['Gale crater in 3D, in the intro', 'Topographic + optical', 'Mars Global Surveyor MOLA and Mars Express HRSC elevation, Viking colour, via Mars Trek; rendered in Blender'],
    ['Rock units', 'Geologic', 'USGS SIM 3292 Geologic Map of Mars'],
    ['Water minerals from orbit', 'Spectral', 'MRO CRISM and Mars Express OMEGA, via Mars Trek'],
    ['Curiosity’s 14-year track', 'Ground truth', `Curiosity traverse and odometry, to sol ${num(S.gale.rover.latestSol)}`],
    ['The ground you walk on', 'Optical + topographic', 'MRO HiRISE photo (about 33 cm per pixel) on the HiRISE 1 m elevation model, via Mars Trek, at true scale'],
    ['The horizon', 'Topographic + optical', 'MOLA + HRSC elevation and Viking colour, rendered as a 360° panorama from the dock in Blender'],
    ...LAYERS.map((l) => [`Visor layer: ${l.name}`, l.note, l.from]),
    ['Photo at each cairn', 'Optical, from the ground', 'Curiosity navigation cameras, from that spot'],
    ['Radio: Curiosity', 'Quoted, real', 'Its first post from Mars, @MarsCuriosity, 6 August 2012 (sol 0)'],
    ['Radio: habitat and EVA-2', 'Imagined', 'Written for this walk; every such line is labelled imagined on screen'],
    ['Earth in the evening sky', 'Optical', 'PIA17936, Curiosity Mastcam, sol 529 (31 January 2014), NASA/JPL-Caltech/MSSS/TAMU'],
    ['The birthday song', 'History', 'NASA, August 2013: the SAM instrument vibrated “Happy Birthday” on Curiosity’s first anniversary'],
    ['Curiosity’s mission clock', 'Computed', 'Sols since landing (one sol = 88,775 s), counted live'],
    ['Storm drill', 'Radiation, space weather', 'Curiosity RAD, September 2017 solar event, scaled ×20, labelled simulated'],
    ['Weather in the visor', 'Atmospheric', `Curiosity REMS, sol ${num(S.conditions.weather.sol)}`],
    ['The rover in the 3D window', '3D model', 'Our team’s rover model, standing in for Curiosity; decimated in Blender; wheels turn with distance, the body tilts to the real ground'],
    ['Coordinates under the cursor', 'Topographic + computed', 'Latitude and longitude; on the walk site, HiRISE 1 m elevation, slope and REDCAIRN walk-home time'],
  ];
  const arch = [
    ['Public sources', ['Mars Trek tiles and elevation (HiRISE, CTX, THEMIS, MOLA + HRSC)', 'USGS SIM 3292 geology', 'Curiosity traverse, raw images, REMS, RAD', 'NASA DONKI space weather', 'NASA Worldview', 'Perseverance raw images']],
    ['Build, offline', ['Python scripts in tools/: fetch, clip, validate (elevation vs rover: 0.99 m RMS)', 'Blender, headless: Mount Sharp in 3D, the 360° horizon, the site photo, the rover split into body and wheels']],
    ['Static site', ['index.html, js/, data/*.json, a 1 m terrain grid, assets/', 'No server, no build step, hosted on Netlify']],
    ['In your browser', ['Terrain engine: slope classes, sky shelter', 'Router: fastest, gentlest, rover-proven; minutes home from every patch of ground', 'Suit timeline: air, dose, time (simulated)', 'Leaflet map on live Mars Trek tiles; three.js ground view', 'Live: Perseverance’s newest raw image']],
  ];
  return `
    <section><h3>System architecture</h3><ol class="arch">${arch.map(([h, items]) => `<li><b>${esc(h)}</b><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></li>`).join('')}</ol></section>
    <section><h3>The challenge</h3><p>NASA Space Apps 2026, <b>Interplanetary Survival Guide: Martian Map</b>: a layered, hyper-local map a Mars astronaut could use to plan and walk a Marswalk safely, doing science on the way. REDCAIRN is that map, built on Mars Trek’s own tiles: it walks you cairn by cairn along the line the Curiosity rover drove first, answers where it is safe to step, what is worth stopping for and whether you can get home, and lets you stand at any cairn in 3D, at true scale, with the same data on your helmet visor. An independent student project, not affiliated with or endorsed by NASA.</p></section>
    <section><h3>The five resources we were given</h3><ul>${m.anchorResources.map((a) => `<li><b><a href="${esc(src(a.source).url)}" target="_blank" rel="noopener">${esc(a.name)}</a></b> ${esc(a.role)}</li>`).join('')}</ul></section>
    <section><h3>Every layer, its data, its mission</h3><div class="tablewrap"><table><thead><tr><th>What you see</th><th>Data</th><th>Source</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>Real and simulated</h3><p><b>Real:</b> the ground and its height at true scale, the slopes, the routes’ terrain, the horizon, the rover track and photos, the rock findings, the water minerals, the geologic units, the normal radiation rate and the measured effect of terrain on it. Our elevation model matches the rover’s own elevations to ${esc(S.route.summary.demVsRoverRmsResidualM)} m along the route.</p><p><b>Simulated:</b> the suit (air, pace), you, the time compression of the walk, the storm’s strength (×20) and its ${STORM_HOURS} h length for the shelter option, and the rocks smaller than a metre scattered for scale (HiRISE can’t resolve them). The crater view stretches heights ×3; the walk is true scale.</p></section>
    <section><h3>How it is built</h3><p>Scripts fetch public mission data. Blender, run headless from scripts, renders Gale crater in 3D through one camera with Curiosity’s track projected into it, renders the 360° horizon from the dock, builds the site photo, and turns the rover model into a light web model with separate wheels. Your browser computes slope, sky shelter, three routes, the walk-home time for ${num(S.terrain.size)} patches of ground and the suit timeline. No server, no build step.</p></section>
    <section><h3>All sources</h3><div class="tablewrap"><table><tbody>${m.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.org)}</td><td>${esc(s.use)}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>How AI was used</h3><p>${esc(m.aiDisclosure)}</p></section>`;
}
function openAbout() { $('about-body').innerHTML = aboutHTML(); $('about').showModal(); }

// ---------------------------------------------------------------- boot
async function boot() {
  const [mission, route, conditions, story, gale, galeView, roverMeta] = await Promise.all([
    fetchJson('data/mission.json'), fetchJson('data/route.json'), fetchJson('data/conditions.json'), fetchJson('data/story.json'),
    fetchJson('data/gale.json'), fetchJson('data/gale-view.json'), fetchJson('data/rover.json'),
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
  S.stage.onFrame = (dt) => { if (S.spin && S.stage.camMode === 'orbit' && document.body.hasAttribute('data-window')) S.stage.camT.az += S.spin * dt; };
  S.stage.onStop = (k) => {
    if (S.step !== 'explore') return; // unused: cairns are opened from the map
    const wp = stops()[k], p = S.stage.worldOf(wp.lon, wp.lat);
    S.stage.flyWalk({ x: p.x, y: p.y, z: p.z, dist: 60, polar: 64, az: S.stage.cam.az });
    $('h-photo').innerHTML = `<img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer"><figcaption>${k ? `Cairn ${k}` : 'The dock'}: Curiosity stood here on ${esc(day(wp.pov.utc))}.</figcaption>`;
    $('h-photo').hidden = false;
  };
  await S.stage.loadRover(roverMeta);
  buildCompass();
  requestAnimationFrame(compassLoop);

  document.addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-a]');
    if (a) {
      const id = a.dataset.a;
      if (id === 'next') return guide(S.beat + 1);
      if (id === 'stone') {
        S.stoneLaid = true;
        try { localStorage.setItem('redcairn.stones', String(stoneCount() + 1)); } catch (e) { /* private mode */ }
        cairnAdd().then((j) => { if (j) { S.myStone = j.yours || j.already || null; if (beatIds()[S.beat] === `stop-${stops().length - 1}`) card(); } });
        const k = stops().length - 1, c = S.stage.cairnPoint(k), p = S.path.at(S.roverD);
        S.stage.addStone(k);
        S.spin = 0;
        chaseCam(c, Math.atan2(c.z - p.z, c.x - p.x), { side: 150, dist: 6.5, polar: 66 });
        return card();
      }
      if (id === 'prev') return guide(S.beat - 1);
      if (id === 'ground') return groundAt(Number(beatIds()[S.beat].slice(5)));
      if (id === 'tomap') return mapStop(S.k);
      if (id === 'go') { $('h-photo').hidden = true; $('h-jobs').hidden = true; return leg(S.k); }
      if (id === 'turn') return guide(beatIds().indexOf('storm'));
      if (id.startsWith('c-')) return chooseOnMap(id.slice(2));
      if (id === 'restorm') { S.choice = null; return guide(S.beat); }
      if (id === 'again') { S.choice = null; S.stoneLaid = false; return guide(beatIds().indexOf('stop-0')); }
      if (id === 'free' || id === 'explore') return freeMap();
      if (id === 'story') return guide(S.beat || 0, { keepLayers: true });
      if (id === 'layers') return document.body.toggleAttribute('data-layers');
      if (id === 'about') return openAbout();
    }
    const r = t.closest('[data-route]');
    if (r) {
      S.pick = r.dataset.route;
      for (const b of document.querySelectorAll('[data-route]')) b.setAttribute('aria-pressed', String(b.dataset.route === S.pick));
      if (S.map && document.body.dataset.stage === 'map') { useRoute(); drawMapRoute(); mapPanel(); if (!$('guide').hidden) { card(); window3d(beatIds()[S.beat], beatIds()[S.beat]); } }
      return;
    }
    const v = t.closest('[data-view]');
    if (v) return S.map.setView(v.dataset.view);
    const ml = t.closest('[data-maplayer]');
    if (ml) {
      const id = ml.dataset.maplayer;
      if (S.mapOn.has(id)) S.mapOn.delete(id); else S.mapOn.add(id);
      applyMapLayers();
      return mapPanel();
    }
    const l = t.closest('[data-layer]');
    if (l) {
      const id = l.dataset.layer;
      if (S.layerOn.has(id)) S.layerOn.delete(id); else S.layerOn.add(id);
      S.stage.setLayers(S.layerOn);
      layerButtons();
    }
  });
  $('sections').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) jump(b.dataset.go); });
  $('btn-about').addEventListener('click', openAbout);
  try { S.name = localStorage.getItem('redcairn.name') || ''; } catch (e) { S.name = ''; }
  await cairnGet();
  S.sound = new Sound();
  $('btn-sound').addEventListener('click', () => {
    const on = !S.sound.on;
    S.sound.setEnabled(on);
    $('btn-sound').setAttribute('aria-pressed', String(on));
    $('btn-sound').innerHTML = `<span class="w">Sound </span>${on ? 'on' : 'off'}`;
  });
  const SCENE = { map: 'off', walk: 'outside' };
  new MutationObserver(() => S.sound.scene(SCENE[document.body.dataset.step] || 'off')).observe(document.body, { attributes: true, attributeFilter: ['data-step'] });
  document.addEventListener('keydown', (e) => {
    if ($('about').open || e.target.closest('input')) return; // typing a name, or the slider
    if (e.key === ' ' || e.key === 'Enter') {
      const b = [...document.querySelectorAll('#guide .act, #act .act')].find((x) => x.offsetParent);
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  document.body.removeAttribute('data-booting');
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (HASHES().includes(h)) jump(h); });
  const start = location.hash.slice(1);
  jump(HASHES().includes(start) ? start : 'intro');
}

boot().catch((err) => {
  console.error(err);
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
