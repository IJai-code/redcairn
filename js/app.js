// REDCAIRN — your first walk on Mars, seen through your own helmet.
//   cover    one line and one button
//   descent  the lander window: Mars, Gale crater and what orbit saw there, the rover's line, touchdown
//   suit     the visor boots: every data source checks in; you pick the route
//   walk     outside. The rover that drove this ground first leads you, cairn to cairn
//   storm    the Sun flares; the map redraws the way home and you choose
//   home     the helmet comes off, the camera rises, the rover drives on alone
//   explore  every layer, free

import { Terrain, Router, fetchJson, groundMetres } from './terrain.js';
import * as sim from './sim.js';
import { Stage } from './scene.js';
import { Crater } from './crater.js';
import { MapView } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (m) => { const v = Math.max(0, Math.round(m)); return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, '0')}`; };
const clock = (m) => { const v = Math.max(0, Math.round(m)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const num = (n) => Number(n).toLocaleString('en-US');
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 200) : ms));
const STORM_HOURS = 2;
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
  ['Optical', [['hirise', 'Photo from orbit, 25 cm', 'HiRISE · Mars Reconnaissance Orbiter', 'always'], ['ctx', 'Wide photo from orbit', 'CTX · Mars Reconnaissance Orbiter', 'always']]],
  ['Topographic', [['slope', 'Slope for a spacesuit', 'HiRISE 1 m elevation · MRO'], ['relief', 'Shaded relief', 'HiRISE 1 m elevation · MRO'], ['mola', 'Height of the land', 'MOLA · Mars Global Surveyor + HRSC · Mars Express']]],
  ['Thermal', [['thermal', 'Night-time ground temperature', 'THEMIS · Mars Odyssey']]],
  ['Spectral', [['minerals', 'Minerals formed in water', 'CRISM · MRO and OMEGA · Mars Express']]],
  ['Geologic', [['geology', 'Rock units', 'USGS Geologic Map of Mars (SIM 3292)']]],
  ['Chemical', [['rocks', 'Rock along the route', 'Curiosity drill and laser']]],
  ['Radiation', [['shield', 'Shelter from terrain', 'Curiosity RAD + elevation model']]],
  ['Ground truth', [['track', 'Curiosity’s wheel tracks here', 'Curiosity traverse'], ['curiosity', 'Curiosity’s whole climb, 2012 to today', 'Curiosity · its proposed path up Mount Sharp']]],
  ['Computed', [['home', 'Minutes to walk home', 'REDCAIRN routing on the elevation model']]],
];

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

function stage(mode) {
  document.body.dataset.stage = mode;
  S.stage.setMode(mode === 'globe' ? 'globe' : mode === 'walk' ? 'walk' : 'none');
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
  S.mapOn = new Set(['slope']);
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

function openMap(mode) {
  token();
  S.step = mode;
  document.body.dataset.step = mode;
  document.body.classList.remove('alarm', 'thud');
  hud(false);
  for (const el of [$('end'), $('boot'), $('h-photo'), $('h-jobs')]) el.hidden = true;
  say(''); act([]);
  stage('map');
  ensureMap();
  requestAnimationFrame(() => {
    S.map.resize();
    S.map.setView('walk', false);
    applyMapLayers();
  });
  S.mapStop = null;
  S.mapStorm = false;
  mapPanel();
}

function mapPanel() {
  const plan = S.step === 'plan', routes = computeRoutes(), w = S.conditions.weather, sw = S.conditions.spaceWeather || {};
  const kinds = MAP_LAYERS.filter(([k]) => k !== 'Computed').length;
  const wp = S.mapStop != null ? stops()[S.mapStop] : null;
  const st = wp ? (S.story.stops[wp.id] || {}) : null;
  const o = S.mapStorm ? stormOptionsFor(R()) : null;
  $('mapui').innerHTML = `
    <header class="mapui__head">
      <p class="mapui__kicker">${plan ? 'Step 2 · plan it on the habitat display' : 'The map'}</p>
      <h2>${plan ? 'Choose your route.' : 'Every layer, in one place.'}</h2>
      <p>${plan ? 'Same five cairns, three ways to reach them. Switch layers to see why.' : `${kinds} kinds of data from seven Mars missions, at walking scale. Tap a cairn.`}</p>
    </header>
    <div class="mapui__views">${['walk', 'mountain', 'crater'].map((v) => `<button type="button" data-view="${v}">${esc(S.mission.views[v].label)}</button>`).join('')}</div>
    <section class="mapui__sec"><h3>Route</h3>
      ${ROUTES.map((r) => { const x = routes[r.id]; return `<button type="button" class="mroute" data-route="${r.id}" aria-pressed="${r.id === S.pick}"><b>${esc(r.name)}</b><span>${mins(x.tl.end.t)} · ${(x.plan.outD * 2 / 1000).toFixed(1)} km · steepest ${x.plan.maxSlope.toFixed(0)}°</span></button>`; }).join('')}
      <p class="mapui__note">Rover-proven follows Curiosity’s own wheel tracks: longest, but every metre has been driven. The other two are computed from orbital elevation, which cannot see rocks smaller than a metre.</p>
    </section>
    ${wp ? `<section class="mapui__sec mapui__stop"><h3>${S.mapStop ? `Cairn ${S.mapStop}` : 'The rover dock'} · ${esc(st.title || wp.plain.title)}</h3>
      <img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer">
      <p class="mapui__cap">What Curiosity saw from this spot, ${esc(day(wp.pov.utc))}. ${esc(wp.pov.credit)}</p>
      ${st.q ? `<p><b>${esc(st.q)}</b> ${esc(st.a || '')}</p>` : ''}
      ${wp.earthNamesakes.length ? `<p class="mapui__earth">Named after Earth: ${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.name)} in Worldview</a>`).join(' · ')}</p>` : ''}
    </section>` : ''}
    <section class="mapui__sec"><h3>Layers</h3>
      ${MAP_LAYERS.map(([kind, items]) => `<div class="mlayer__group"><span>${esc(kind)}</span>${items.map(([id, name, from, always]) => `<button type="button" class="mlayer" data-maplayer="${id}" aria-pressed="${always ? 'true' : S.mapOn.has(id)}" ${always ? 'disabled' : ''}><b>${esc(name)}</b><small>${esc(from)}</small></button>`).join('')}</div>`).join('')}
    </section>
    <section class="mapui__sec"><h3>Conditions today</h3>
      <p><b>Weather</b> ${w.airMinC}° to ${w.airMaxC}° C, ${num(w.pressurePa)} Pa, sky ${esc(String(w.sky).toLowerCase())} · Curiosity REMS, sol ${num(w.sol)} (${esc(day(w.earthDate))})</p>
      <p><b>Radiation</b> ${S.mission.hazards.radiation.backgroundMSvPerDay} mSv per day at the surface · Curiosity RAD</p>
      <figure class="mapui__live" id="map-live"></figure>
      ${sw.sepCount != null ? `<p><b>Space weather</b> ${sw.sepCount} solar energetic particle events logged by NASA DONKI, ${esc(day(sw.from))} to ${esc(day(sw.to))}; latest ${esc(day(sw.latestSep))}. Not every one reaches Mars.</p>` : ''}
    </section>
    ${o ? `<section class="mapui__sec mapui__storm"><h3>Storm drill (simulated ×20)</h3><p>From the turnaround, the white dashed line is the way home with least radiation: <b>${mins(o.direct.min)}, ${o.direct.dose.toFixed(2)} mSv</b>, against ${mins(o.trail.min)}, ${o.trail.dose.toFixed(2)} mSv the way you came. The best ridge nearby blocks only ${o.shelter.blocked}%.</p></section>` : ''}
    <div class="mapui__go" data-live>
      <button type="button" class="act" data-a="suit">${plan ? 'Suit up' : 'Walk it in first person'}<small>${plan ? 'step 3 · walk it behind the rover' : 'through the helmet, behind the rover'}</small></button>
      ${plan ? '' : `<button type="button" class="act act--alt" data-a="mapstorm" aria-pressed="${!!S.mapStorm}">${S.mapStorm ? 'End storm drill' : 'Storm drill'}</button>`}
    </div>`;
  fillLive($('map-live'), true);
}

// Perseverance's newest frame, fetched once and shown wherever there is a place for it.
function m2020(cb) {
  if (S.m2020) return cb(S.m2020);
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => { const im = d.images && d.images[0]; if (im) { S.m2020 = im; cb(im); } }).catch(() => {});
}
function fillLive(el, short) {
  if (!el) return;
  m2020((im) => {
    el.innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Newest picture from the Perseverance rover" referrerpolicy="no-referrer"><figcaption>${short ? '<b>Right now on Mars</b> ' : ''}Perseverance’s newest picture, from Jezero crater, its Mars day ${num(im.sol)} (${esc(day(im.date_taken_utc))}). ${esc(im.credit)}</figcaption>`;
    el.hidden = false;
  });
}

function mapStop(k) {
  S.mapStop = k;
  S.map.markStops(k, 0);
  mapPanel();
  const el = document.querySelector('.mapui__stop');
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// The suit-up scene: back in the 3D world, at the dock, the visor starting.
function toSuit() {
  token();
  const dock = stops()[0], w = S.stage.worldOf(dock.lon, dock.lat);
  S.stage.rate = 3.2;
  S.stage.setPinsVisible(false);
  S.stage.setCairns(0);
  S.stage.setEye(w.x - 9, w.z + 4, -0.55, -0.12, 0, true);
  stage('walk');
  setLayers([]);
  return suitUp();
}

// Every section can be entered directly. Each jump clears whatever the last one left behind.
function jump(id) {
  token();
  S.stage.rate = 3.2;
  for (const el of [$('end'), $('boot'), $('h-photo'), $('h-jobs')]) el.hidden = true;
  document.body.classList.remove('alarm', 'thud');
  S.verdict = null;
  S.stage.resetLook();
  if (id === 'cover') return cover();
  if (id === 'descent') return descent();
  if (id === 'plan') return openMap('plan');
  if (id === 'suit') return toSuit();
  if (id === 'walk') return outside();
  if (id === 'storm') { outside(); S.youD = S.plan.outD; return storm(); }
  if (id === 'home') { outside(); return homecoming(null); }
  if (id === 'explore') return openMap('explore');
}

function cover() {
  token();
  S.step = 'cover';
  document.body.dataset.step = 'cover';
  hud(false);
  stage('globe');
  S.stage.focusGlobe(null, innerWidth > 900 ? 3.4 : 4.4);
  say('');
  act([]);
}

// The lander window. What orbit already knows, in four looks, then the ground.
async function descent() {
  const t = token();
  S.step = 'descent';
  document.body.dataset.step = 'descent';
  hud(false);
  $('end').hidden = true;
  $('boot').hidden = true;
  const L = (a, b = '') => { $('lander-a').textContent = a; $('lander-b').textContent = b; };
  stage('globe');
  S.stage.focusGlobe({ lon: 137.8, lat: -5.4 }, 1.9);
  L('Mars orbit · approach', 'Target: Gale crater, 5.4° S 137.8° E');
  await wait(3600); if (!live(t)) return;
  stage('crater');
  S.crater.show('wide', ['color']);
  L('Gale crater · 154 km wide', `Mount Sharp rises ${(S.galeView.mountain.heightM / 1000).toFixed(1)} km from the floor`);
  await wait(3400); if (!live(t)) return;
  S.crater.show('orbit', ['geology', 'water']);
  L('Seen from orbit: water', 'Blue: minerals that only form in water (CRISM, OMEGA). Pale: Mount Sharp’s own rock (USGS map).');
  await wait(4400); if (!live(t)) return;
  S.crater.show('line', ['color', 'track']);
  L('Curiosity’s 14-year track', `${S.gale.rover.distanceKm.toFixed(1)} km, to sol ${num(S.gale.rover.latestSol)}. We land at its white end.`);
  await wait(5400); if (!live(t)) return;
  // Down onto the real ground, at true scale, beside the rover.
  const dock = stops()[0], w = S.stage.worldOf(dock.lon, dock.lat);
  S.stage.setPinsVisible(false);
  S.stage.setCairns(0);
  S.stage.rate = 0.9;
  const w1 = S.stage.worldOf(stops()[1].lon, stops()[1].lat), yaw = Math.atan2(w1.z - w.z, w1.x - w.x);
  S.stage.setEye(w.x - 9, w.z + 4, yaw, -0.62, 180, true);
  stage('walk');
  setLayers([]);
  L('Final descent', 'Altitude 180 m');
  await wait(500); if (!live(t)) return;
  S.stage.setEye(w.x - 9, w.z + 4, yaw, -0.1, 0);
  const t0 = performance.now();
  while (performance.now() - t0 < 4600) {
    if (!live(t)) return;
    $('lander-b').textContent = `Altitude ${num(Math.max(0, Math.round(180 * Math.exp(-((performance.now() - t0) / 1000) * 1.1))))} m`;
    await wait(100);
  }
  L('Touchdown', 'Sol 1, Gale crater');
  document.body.classList.add('thud');
  await wait(1500);
  document.body.classList.remove('thud');
  if (live(t)) openMap('plan');
}

// The visor boots: each line is a real data source checking in.
async function suitUp() {
  const t = token();
  S.step = 'suit';
  document.body.dataset.step = 'suit';
  S.stage.rate = 3.2;
  hud(false);
  const w = S.conditions.weather;
  const routes = computeRoutes();
  const lines = [
    ['Suit pressure', 'OK'],
    ['Oxygen', `${mins(S.mission.suit.oxygen.primaryMin)} + 30 min reserve`],
    ['Terrain · HiRISE 1 m · MRO', 'loaded'],
    ['Slope limits for the suit', '15° care · 20° no'],
    ['Radiation · RAD · Curiosity', `${S.mission.hazards.radiation.backgroundMSvPerDay} mSv / day`],
    [`Weather · REMS · sol ${num(w.sol)}`, `${w.airMinC}° to ${w.airMaxC}° C`],
    ['Water minerals · CRISM, OMEGA', 'loaded'],
    ['Cairns · Curiosity’s stops, 2025–26', `${stops().length - 1} ahead`],
    ['Space weather · NASA DONKI', S.conditions.spaceWeather && S.conditions.spaceWeather.latestSep ? `last particle event ${day(S.conditions.spaceWeather.latestSep)}` : 'watching'],
    ['Route', `${ROUTES.find((r) => r.id === S.pick).name} · ${mins(R().tl.end.t)}`],
  ];
  $('boot').innerHTML = `<p class="boot__head">Your visor is waking up</p><ol>${lines.map(([a, b]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b></li>`).join('')}</ol>
    <button type="button" class="act" data-a="hatch">Open the hatch<small>step 3 · the walk</small></button>`;
  $('boot').hidden = false;
  const items = [...$('boot').querySelectorAll('li, .act')];
  items.forEach((el) => el.classList.add('is-wait'));
  for (const el of items) { await wait(240); if (!live(t)) return; el.classList.remove('is-wait'); }
}

function outside() {
  token();
  $('boot').hidden = true;
  S.step = 'walk';
  document.body.dataset.step = 'walk';
  stage('walk');
  const r = R();
  S.plan = r.plan;
  S.tl = r.tl;
  S.marks = { arr: r.arr, dep: r.dep };
  S.path = worldPath(r.plan.out);
  S.k = 0;
  S.choice = null;
  S.verdict = null;
  S.stormOpts = null;
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setHome(S.homeField);
  S.stage.drawReturn(null);
  S.stage.setAlternatives(null);
  S.stage.setCairns(stops().length);
  S.stage.setPinsVisible(true);
  S.stage.markStops(-1, 0);
  S.stage.resetLook();
  S.stage.rate = 3.2;
  miniMap(r.plan);
  setLayers([]);
  // The rover waits up the trail; you stand at the hatch looking at it.
  S.roverD = FOLLOW_M + 3; S.rolled = 0; S.youD = 0;
  placeRover(S.roverD);
  const me = S.path.at(0), rv = S.path.at(S.roverD);
  S.stage.setEye(me.x, me.z, Math.atan2(rv.z - me.z, rv.x - me.x), -0.06, 0, true);
  hud(true);
  readout(sim.stateAt(S.tl, 0));
  S.nextBearing = bearing(stops()[0], stops()[1]);
  setGoal(`Reach cairn 1 of ${nCairns()}`, (S.story.stops.WP1 || {}).q || '');
  say('This rover drove here alone, a year before you.', `Your mission: walk to ${nCairns()} cairns, take rock from both sides of the line where this part of Mars began to dry, and be home with air to spare. The rover goes first.`);
  act([{ id: 'go', label: 'Follow the rover', note: `to cairn 1 · ${legM(0)} m` }]);
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
  if (live(t)) arrive(k + 1);
}

// At a cairn: one line, the rover's own photograph from this spot, the job, and on.
function arrive(k) {
  S.k = k;
  const wp = stops()[k], last = stops().length - 1, s = S.story.stops[wp.id] || {};
  S.stage.markStops(k, k);
  readout(sim.stateAt(S.tl, S.marks.dep[k].t));
  setLayers(s.layers || []);
  const c = S.stage.worldOf(wp.lon, wp.lat), me = S.path.at(S.youD);
  S.stage.setEye(me.x, me.z, Math.atan2(c.z - me.z, c.x - me.x), -0.16, 0);
  const earth = wp.earthNamesakes.length ? `<span class="hud__earth">Named after Earth: ${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.name)} in Worldview</a>`).join(' · ')}</span>` : '';
  $('h-photo').innerHTML = `<img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer"><figcaption>Curiosity stood here on ${esc(day(wp.pov.utc))}. This is what it saw. ${earth}</figcaption>`;
  $('h-photo').hidden = false;
  $('h-jobs').innerHTML = wp.plain.do.map((j) => `<li>${esc(j)}</li>`).join('');
  $('h-jobs').hidden = false;
  const lay = LAYERS.find((l) => (s.layers || [])[0] === l.id);
  setGoal(`Cairn ${k} of ${nCairns()} · ${s.title || wp.plain.title}`, s.q || '');
  say(`<b>${esc(s.q || s.title || wp.plain.title)}</b>`, `${esc(s.a || s.line || '')}${lay ? ` <span class="say__layer">Visor layer on: ${esc(lay.name)}.</span>` : ''}`);
  act(k < last ? [{ id: 'go', label: 'Collect and follow on', note: `${wp.plannedStayMin} min here · cairn ${k + 1} is ${legM(k)} m on` }]
    : [{ id: 'turn', label: 'Collect, then turn for home', note: `${wp.plannedStayMin} min here · the turnaround` }]);
}

// ---------------------------------------------------------------- the storm
function stormOptions() {
  if (!S.stormOpts) S.stormOpts = stormOptionsFor({ id: S.pick, plan: S.plan, tl: S.tl, dep: S.marks.dep });
  return S.stormOpts;
}

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

async function storm() {
  const t = token();
  S.step = 'storm';
  document.body.dataset.step = 'storm';
  $('h-photo').hidden = true;
  $('h-jobs').hidden = true;
  document.body.classList.add('alarm');
  setGoal('Get home', 'Which way back is safest?');
  act([]);
  say('<b>Solar particle event.</b> Radiation twenty times normal.', 'Simulated drill, shaped on the storm Curiosity measured in September 2017.');
  await wait(2400); if (!live(t)) return;
  const o = stormOptions();
  S.stage.setHome(S.stormField);
  setLayers(['shield', 'home']);
  S.stage.drawReturn(o.direct.line);
  S.stage.setAlternatives([o.trail.line]);
  S.mm.ret(o.direct.line);
  const wp = stops()[stops().length - 1], me = S.path.at(S.youD), nxt = S.stage.worldOf(o.direct.line[Math.min(8, o.direct.line.length - 1)].lon, o.direct.line[Math.min(8, o.direct.line.length - 1)].lat);
  S.stage.setEye(me.x, me.z, Math.atan2(nxt.z - me.z, nxt.x - me.x), -0.16, 0);
  S.nextBearing = bearing(wp, stops()[0]);
  const less = Math.round((1 - o.direct.dose / o.trail.dose) * 100);
  say('<b>The visor has drawn a new way home.</b> How do you get back?', `Real terrain, storm radiation. The white line cuts the dose by ${less}%.`);
  act([
    { id: 'c-direct', label: 'Take the new line', note: `${mins(o.direct.min)} · ${o.direct.dose.toFixed(2)} mSv` },
    { id: 'c-trail', label: 'The way you came', note: `${mins(o.trail.min)} · ${o.trail.dose.toFixed(2)} mSv` },
    { id: 'c-shelter', label: 'Shelter behind a ridge', note: `${STORM_HOURS} h · ${o.shelter.dose.toFixed(2)} mSv · blocks ${o.shelter.blocked}%` },
  ]);
}

async function goHome(id) {
  const t = token();
  const o = stormOptions(), x = o[id];
  S.choice = id;
  const best = ['direct', 'trail', 'shelter'].reduce((a, b) => (o[a].dose <= o[b].dose ? a : b));
  S.verdict = id === best ? 'Right call: the least radiation of the three.' : `You made it home, with ${(x.dose / o[best].dose).toFixed(1)}× the dose of the best choice.`;
  S.final = x;
  S.stage.setAlternatives(null);
  S.stage.drawReturn(x.line);
  S.mm.ret(x.line);
  act([]);
  say(id === 'shelter' ? `Two hours behind the ridge. It hides only ${o.shelter.blocked}% of the radiation.` : 'Heading home. The rover turns and leads the way.');
  const path = worldPath(x.line), dur = 7500, start = performance.now();
  S.nextBearing = undefined;
  let prev = 0;
  await new Promise((done) => {
    const frame = (now) => {
      if (!live(t)) return done();
      const f = Math.min(1, (now - start) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      const you = path.length * e, rov = Math.min(path.length, you + FOLLOW_M + 3);
      const rp = path.at(rov), me = path.at(you);
      S.rolled += rov - prev; prev = rov;
      S.stage.placeRover(rp.x, rp.z, path.dir(rov), S.rolled);
      if (S.mm) S.mm.rover(lonOfX(rp.x), latOfZ(rp.z));
      S.stage.setEye(me.x, me.z, Math.atan2(rp.z - me.z, rp.x - me.x + 1e-6), -0.08 + Math.sin(now / 210) * 0.012, 0, true);
      readout(sim.stateAt(x.tl, o.start.t + (x.tl.end.t - o.start.t) * e));
      if (f < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
  if (live(t)) homecoming(x);
}

// ---------------------------------------------------------------- home
function homecoming(x) {
  const t = token();
  S.step = 'home';
  document.body.dataset.step = 'home';
  document.body.classList.remove('alarm');
  hud(false);
  S.stage.setHome(S.homeField);
  setLayers([]);
  S.stage.drawReturn(null);
  S.stage.setPinsVisible(false);
  const end = x ? x.tl.end : S.tl.end;
  const career = S.mission.hazards.radiation.careerLimitMSv;
  // The camera lifts away. The rover drives on up the mountain along its own track, alone.
  const track = S.route.roverTrack.map((p) => ({ lon: p[0], lat: p[1] }));
  const dock = stops()[0];
  let i0 = 0, bd = Infinity;
  track.forEach((p, i) => { const d = groundMetres(p, dock); if (d < bd) { bd = d; i0 = i; } });
  const on = worldPath(track.slice(i0));
  S.stage.rate = 0.35;
  const c = S.stage.worldOf(dock.lon, dock.lat);
  // Low, behind you, looking up the trail toward the mountain: the rover drives away into the haze.
  S.stage.flyWalk({ x: c.x, y: c.y, z: c.z, dist: 70, polar: 76, az: 192 });
  say('It walked this ground alone, so that you would not have to.', `Curiosity is still out there, ${vars().roverAheadM} m past your turnaround, climbing.`);
  const jobs = stops().slice(1).reduce((n, w) => n + w.plain.do.length, 0);
  $('end').innerHTML = `<dl>
      <div><dt>${S.plan.maxSlope.toFixed(0)}°</dt><dd><b>Was it safe to step?</b>The steepest ground on the walk. The suit’s limit is ${S.limits.noGo}°.</dd></div>
      <div><dt>${nCairns()} cairns</dt><dd><b>Was it worth stopping?</b>${jobs} jobs done, with rock from both sides of the line where Mars began to dry.</dd></div>
      <div><dt>${mins(end.o2 - reserve())}</dt><dd><b>Did you get home?</b>Of air left at the hatch, after ${mins(end.t)} outside.</dd></div>
    </dl>
    <p class="end__dose">Radiation on the way: ${end.dose.toFixed(2)} mSv, ${((end.dose / career) * 100).toFixed(2)}% of a NASA career limit.</p>${S.verdict ? `<p class="end__verdict">${esc(S.verdict)}</p>` : ''}
    <figure class="end__live" id="live" hidden></figure>
    <div class="end__go"><button type="button" class="act" data-a="again">Walk it again</button><button type="button" class="act act--alt" data-a="explore">Explore the map</button><button type="button" class="act act--alt" data-a="about">Data &amp; sources</button></div>`;
  setTimeout(() => { if (live(t)) $('end').hidden = false; }, 2600);
  liveFrame();
  const start = performance.now(), dur = 30000;
  let prev = 0;
  const frame = (now) => {
    if (!live(t)) return;
    const f = Math.min(1, (now - start) / dur), d = on.length * f;
    const p = on.at(d);
    S.rolled += d - prev; prev = d;
    S.stage.placeRover(p.x, p.z, on.dir(d), S.rolled);
    if (d > 30) { S.stage.aim(lonOfX(p.x), latOfZ(p.z)); S.stage.camT.dist = Math.min(260, 70 + d * 0.35); }
    if (f < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function vars() {
  const r = S.gale.rover, last = stops()[stops().length - 1];
  const k = (2 * Math.PI * 3389.5) / 360;
  const ahead = Math.hypot((r.latest[0] - last.lon) * k * Math.cos((r.latest[1] * Math.PI) / 180), (r.latest[1] - last.lat) * k) * 1000;
  return { roverAheadM: num(Math.round(ahead / 10) * 10) };
}

function liveFrame() {
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => {
    const im = d.images && d.images[0], el = $('live');
    if (!im || !el) return;
    el.innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Newest picture from the Perseverance rover" referrerpolicy="no-referrer"><figcaption>Right now, on the other side of Mars: Perseverance’s newest picture, its Mars day ${num(im.sol)}, ${esc(day(im.date_taken_utc))}.</figcaption>`;
    el.hidden = false;
  }).catch(() => {});
}

// ---------------------------------------------------------------- explore
function explore() { return openMap('explore'); }
function exploreOld() {
  token();
  S.step = 'explore';
  document.body.dataset.step = 'explore';
  document.body.classList.remove('alarm');
  $('end').hidden = true;
  $('boot').hidden = true;
  stage('walk');
  const r = R();
  S.plan = r.plan; S.tl = r.tl; S.marks = { arr: r.arr, dep: r.dep };
  S.path = worldPath(r.plan.out);
  S.rolled = 0;
  S.stage.setRoute(evaOf(r.plan));
  S.stage.setHome(S.homeField);
  S.stage.drawReturn(null);
  S.stage.setAlternatives(null);
  S.stage.setCairns(stops().length);
  S.stage.setPinsVisible(true);
  S.stage.markStops(-1, 0);
  S.stage.rate = 2.4;
  const c = S.stage.worldOf(S.mission.site.center.lon, S.mission.site.center.lat);
  S.stage.flyWalk({ x: c.x, y: c.y, z: c.z, dist: 1250, polar: 50, az: 190 });
  S.stage.resetLook();
  miniMap(r.plan);
  hud(true);
  setLayers(['slope']);
  readout(sim.stateAt(r.tl, 0));
  placeRover(6);
  S.nextBearing = undefined;
  $('h-photo').hidden = true;
  $('h-jobs').hidden = true;
  say('The whole map is yours.', 'Layers on the right · drag to look · slide along the walk · tap a cairn');
  act([{ id: 'again', label: 'Walk it from the lander' }]);
  $('scrub').value = 0;
}

function scrubTo(f) {
  if (!S.tl) return;
  const st = sim.stateAt(S.tl, f * S.tl.end.t);
  readout(st);
  const p = S.stage.worldOf(st.lon, st.lat);
  S.stage.flyWalk({ x: p.x, y: p.y, z: p.z, dist: 160, polar: 58, az: S.stage.cam.az });
  const d = st.d <= S.plan.outD ? st.d : 2 * S.plan.outD - st.d;
  placeRover(Math.min(S.path.length, d + 6));
}

// ---------------------------------------------------------------- data and sources
function aboutHTML() {
  const m = S.mission, src = (id) => m.sources.find((s) => s.id === id);
  const rows = [
    ...MAP_LAYERS.flatMap(([kind, items]) => items.map(([, name, from]) => [`Map layer: ${name}`, kind, `${from}${['hirise', 'ctx', 'mola', 'thermal', 'geology'].some((x) => items.find((i) => i[1] === name && i[0] === x)) ? ', tiles from Mars Trek' : ''}`])),
    ['Space weather', 'Heliophysics', `NASA DONKI (Space Weather Database of Notifications, Knowledge, Information), ${S.conditions.spaceWeather ? `${S.conditions.spaceWeather.sepCount} solar particle events, ${S.conditions.spaceWeather.from} to ${S.conditions.spaceWeather.to}` : 'not loaded'}`],
    ['Earth namesakes at the cairns', 'Optical, Earth', 'NASA Worldview satellite imagery'],
    ['Mars from orbit', 'Optical, true colour', 'Viking orbiters · MDIM 2.1 mosaic, via Mars Trek, stitched in Blender'],
    ['Gale crater in the lander window', 'Topographic + optical', 'Mars Global Surveyor MOLA and Mars Express HRSC elevation, Viking colour, via Mars Trek; rendered in Blender'],
    ['Rock units', 'Geologic', 'USGS SIM 3292 Geologic Map of Mars'],
    ['Water minerals from orbit', 'Spectral', 'MRO CRISM and Mars Express OMEGA, via Mars Trek'],
    ['Curiosity’s 14-year track', 'Ground truth', `Curiosity traverse and odometry, to sol ${num(S.gale.rover.latestSol)}`],
    ['The ground you walk on', 'Optical + topographic', 'MRO HiRISE photo (about 33 cm per pixel) on the HiRISE 1 m elevation model, via Mars Trek, at true scale'],
    ['The horizon', 'Topographic + optical', 'MOLA + HRSC elevation and Viking colour, rendered as a 360° panorama from the dock in Blender'],
    ...LAYERS.map((l) => [`Visor layer: ${l.name}`, l.note, l.from]),
    ['Photo at each cairn', 'Optical, from the ground', 'Curiosity navigation cameras, from that spot'],
    ['Storm drill', 'Radiation, space weather', 'Curiosity RAD, September 2017 solar event, scaled ×20, labelled simulated'],
    ['Weather in the visor', 'Atmospheric', `Curiosity REMS, sol ${num(S.conditions.weather.sol)}`],
    ['The rover', '3D model', 'Our team’s rover model, decimated in Blender; wheels turn with distance, the body tilts to the real ground'],
  ];
  return `
    <section><h3>The challenge</h3><p>NASA Space Apps 2026, <b>Interplanetary Survival Guide: Martian Map</b>: a layered, hyper-local map a Mars astronaut could use to plan and walk a Marswalk safely, doing science on the way. REDCAIRN is that map twice: a layered planning map built on Mars Trek tiles for the habitat, and the same data drawn on the astronaut’s helmet visor during the walk. An independent student project, not affiliated with or endorsed by NASA.</p></section>
    <section><h3>The five resources we were given</h3><ul>${m.anchorResources.map((a) => `<li><b><a href="${esc(src(a.source).url)}" target="_blank" rel="noopener">${esc(a.name)}</a></b> ${esc(a.role)}</li>`).join('')}</ul></section>
    <section><h3>Every layer, its data, its mission</h3><div class="tablewrap"><table><thead><tr><th>What you see</th><th>Data</th><th>Source</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>Real and simulated</h3><p><b>Real:</b> the ground and its height at true scale, the slopes, the routes’ terrain, the horizon, the rover track and photos, the rock findings, the water minerals, the geologic units, the normal radiation rate and the measured effect of terrain on it. Our elevation model matches the rover’s own elevations to ${esc(S.route.summary.demVsRoverRmsResidualM)} m along the route.</p><p><b>Simulated:</b> the suit (air, pace), you, the time compression of the walk, the storm’s strength (×20) and its ${STORM_HOURS} h length for the shelter option, and the rocks smaller than a metre scattered for scale (HiRISE can’t resolve them). The crater view stretches heights ×3; the walk is true scale.</p></section>
    <section><h3>How it is built</h3><p>Scripts fetch public mission data. Blender, run headless from scripts, stitches the globe, renders Gale crater layer by layer through one camera, renders the 360° horizon from the dock, builds the site photo, and turns the rover model into a light web model with separate wheels. Your browser computes slope, sky shelter, three routes, the walk-home time for ${num(S.terrain.size)} patches of ground and the suit timeline. No server, no build step.</p></section>
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
  S.stage.onStop = (k) => {
    if (S.step !== 'explore') return;
    const wp = stops()[k], p = S.stage.worldOf(wp.lon, wp.lat);
    S.stage.flyWalk({ x: p.x, y: p.y, z: p.z, dist: 60, polar: 64, az: S.stage.cam.az });
    $('h-photo').innerHTML = `<img src="${esc(wp.pov.imageUrl)}" alt="${esc(wp.plain.see)}" referrerpolicy="no-referrer"><figcaption>${k ? `Cairn ${k}` : 'The dock'}: Curiosity stood here on ${esc(day(wp.pov.utc))}.</figcaption>`;
    $('h-photo').hidden = false;
  };
  S.crater = new Crater($('crater'), galeView, gale, stops());
  await S.stage.loadRover(roverMeta);
  buildCompass();
  requestAnimationFrame(compassLoop);

  document.addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-a]');
    if (a) {
      const id = a.dataset.a;
      if (id === 'begin') return descent();
      if (id === 'skip') return jump('plan');
      if (id === 'hatch') return outside();
      if (id === 'suit') return toSuit();
      if (id === 'mapstorm') {
        S.mapStorm = !S.mapStorm;
        if (S.mapStorm) S.mapOn.add('shield'); 
        applyMapLayers();
        return mapPanel();
      }
      if (id === 'go') { $('h-photo').hidden = true; $('h-jobs').hidden = true; return leg(S.k); }
      if (id === 'turn') return storm();
      if (id.startsWith('c-')) return goHome(id.slice(2));
      if (id === 'again') { $('end').hidden = true; S.stage.resetLook(); return descent(); }
      if (id === 'explore') return explore();
      if (id === 'about') return openAbout();
    }
    const r = t.closest('[data-route]');
    if (r) {
      S.pick = r.dataset.route;
      for (const b of document.querySelectorAll('[data-route]')) b.setAttribute('aria-pressed', String(b.dataset.route === S.pick));
      if (S.map && document.body.dataset.stage === 'map') { drawMapRoute(); mapPanel(); }
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
  $('scrub').addEventListener('input', (e) => scrubTo(Number(e.target.value) / 1000));
  $('btn-about').addEventListener('click', openAbout);
  document.addEventListener('keydown', (e) => {
    if ($('about').open || e.target.closest('input')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      const b = [...document.querySelectorAll('.cover .act, #boot .act:not(.is-wait), #act .act, #mapui .act')].find((x) => x.offsetParent);
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  document.body.removeAttribute('data-booting');
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (['cover', 'descent', 'plan', 'suit', 'walk', 'storm', 'home', 'explore'].includes(h) && h !== S.step) jump(h); });
  const start = location.hash.slice(1);
  if (['descent', 'plan', 'suit', 'walk', 'storm', 'home', 'explore', 'map'].includes(start)) jump(start === 'map' ? 'explore' : start); else cover();
}

boot().catch((err) => {
  console.error(err);
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
