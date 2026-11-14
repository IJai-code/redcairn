// REDCAIRN — entry point. Loads the site, builds the plan, runs the EVA playback
// and re-plans the walk home when conditions change.

import { Terrain, Router, fetchJson, groundMetres } from './terrain.js';
import * as sim from './sim.js';
import { MapView } from './map.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const CLASS_NAMES = ['safe', 'caution', 'NO-GO'];
const DUST_PACE = 0.7;

const S = {
  env: { spe: false, dust: false },
  mode: 'proven',
  targetId: 'WP5',
  selectedId: 'DOCK',
  slopeOn: true,
  legs: {},
  run: { active: false, playing: false, done: false, aborted: false, speed: 240, t: 0, last: 0, uiAt: 0, alertAt: 0 },
};

function cfg() {
  const rad = S.mission.hazards.radiation;
  const spe = S.mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  return { suit: S.mission.suit, env: S.env, radiation: rad, speMultiplier: spe.demoSeverityMultiplier, shieldEff: rad.terrainShielding.efficiency };
}
const wpById = (id) => S.mission.waypoints.find((w) => w.id === id);
const cellOf = (p) => S.terrain.cellIndex(p.lon, p.lat);

// ---------- planning ----------
function computeReturnField() {
  S.returnField = S.router.field(S.dockIdx, { mode: 'fastest', doseAware: S.env.spe, shieldEff: cfg().shieldEff });
  S.map.buildIsochrones(S.returnField);
}

function legLines(mode) {
  if (!S.legs[mode]) {
    const wps = S.mission.waypoints;
    S.legs[mode] = wps.slice(1).map((to, k) => {
      const from = cellOf(wps[k]);
      const field = S.router.field(cellOf(to), { mode, stopAt: from });
      return sim.smooth(S.router.trace(field, from));
    });
  }
  return S.legs[mode];
}

function outboundLine(mode, targetId) {
  const order = S.mission.waypoints.map((w) => w.id);
  const n = order.indexOf(targetId);
  if (mode === 'proven') {
    const anchor = S.route.anchors.find((a) => a.id === targetId);
    return S.route.eva.slice(0, anchor.routeIndex + 1).map((v) => ({ lon: v.lon, lat: v.lat }));
  }
  const line = [];
  legLines(mode).slice(0, n).forEach((leg, k) => line.push(...(k ? leg.slice(1) : leg)));
  return line;
}

function buildPlan() {
  const limits = S.limits;
  const step = S.mode === 'proven' ? 0 : 5;
  const line = outboundLine(S.mode, S.targetId);
  const out = sim.profile(S.terrain, line, limits, step);
  const back = sim.profile(S.terrain, line.slice().reverse(), limits, step);
  const outD = out[out.length - 1].d;
  const pts = out.concat(back.slice(1).map((p) => ({ ...p, d: p.d + outD })));

  const order = S.mission.waypoints.map((w) => w.id);
  const active = order.slice(0, order.indexOf(S.targetId) + 1);
  const stays = new Map();
  const marks = [{ d: 0, label: 'DK' }];
  for (const id of active.slice(1)) {
    const wp = wpById(id);
    const idx = id === S.targetId ? out.length - 1 : sim.nearestIndex(out, wp);
    stays.set(idx, { min: wp.plannedStayMin, wpId: id });
    marks.push({ d: out[idx].d, label: id.replace('WP', '') });
  }
  const timeline = sim.buildTimeline(pts, stays, sim.startState(S.mission.suit), cfg());
  const summary = sim.summarise(timeline, S.returnField, S.terrain, S.mission.suit);
  let units = null;
  if (S.mode === 'proven') {
    units = S.mission.layers.minerals.units
      .map((u) => ({ color: u.color, from: Math.min(1, u.routeFromM / outD), to: Math.min(1, u.routeToM / outD) }))
      .filter((u) => u.to > u.from);
  }
  S.plan = { out, pts, outLen: out.length, outD, stays, marks, timeline, summary, units, active: new Set(active) };
}

function replan() {
  buildPlan();
  S.map.drawRoute(S.plan.pts, S.plan.outLen, S.slopeOn);
  S.map.markWaypoints(S.selectedId, S.plan.active);
  ui.renderSummary(S.plan.summary, S.mission.suit);
  const o = S.plan.out;
  $('profile-stats').textContent = `${ui.fmtM(S.plan.outD)} · +${Math.round(o[o.length - 1].z - o[0].z)} m · max ${S.plan.summary.maxSlopeDeg.toFixed(1)}°`;
  S.run.timeline = S.plan.timeline;
  S.run.stays = S.plan.stays;
  refresh(sim.stateAt(S.plan.timeline, 0), true);
}

// ---------- live state ----------
function backPath(st) {
  return S.router.trace(S.returnField, cellOf(st));
}

function vitals(st) {
  const suit = S.mission.suit;
  const c = cfg();
  const backSec = S.returnField.cost[cellOf(st)] / (S.env.dust ? DUST_PACE : 1);
  const line = backPath(st);
  let backDist = 0;
  for (let i = 1; i < line.length; i++) backDist += groundMetres(line[i - 1], line[i]);
  const m = suit.metabolic;
  const moving = st.kind === 'walk';
  return {
    t: st.t, o2: st.o2, batt: st.batt, dose: st.dose,
    o2Rate: 1 + (moving ? m.consumptionGainPerUphillDeg * Math.max(0, st.slope) + m.consumptionGainPerDownhillDeg * Math.max(0, -st.slope) : 0),
    moving, slope: st.slope, cls: st.cls,
    paceKmh: sim.speedKmh(st.slope, suit, S.env),
    holdText: st.kind === 'stay' ? `working at ${st.wpId}` : S.run.done ? 'at dock' : 'holding',
    doseRate: sim.doseRateMSvPerHour(st.shield, c),
    shieldPct: st.shield * c.shieldEff * 100,
    spe: S.env.spe,
    backMin: backSec / 60, backDist,
    margin: st.o2 - suit.oxygen.reserveMin - sim.returnNeedMin(backSec),
    climb: st.z - S.plan.pts[0].z,
  };
}

function refresh(st, full) {
  S.map.setCrew(st.lon, st.lat);
  if (!full) return;
  const v = vitals(st);
  ui.renderVitals(v, S.mission.suit);
  let cursor = null;
  if (S.run.active && !S.run.aborted) cursor = st.d <= S.plan.outD ? st.d : Math.max(0, 2 * S.plan.outD - st.d);
  ui.drawProfile($('profile'), S.plan.out, S.plan.marks, S.plan.units, cursor);
  updateStatus(v);
  S.lastState = st;
}

function updateStatus(v) {
  if (v.margin < 20) return ui.setStatus('warning', 'WARNING', 'Walk-back margin under 20 min');
  if (S.plan.summary.nogoPts && !S.run.aborted) return ui.setStatus('warning', 'WARNING', 'Route crosses no-go terrain');
  if (S.env.spe) return ui.setStatus('warning', 'WARNING', S.run.aborted ? 'Returning to dock' : 'Solar particle event');
  if (S.env.dust) return ui.setStatus('caution', 'CAUTION', 'Dust storm, reduced pace');
  if (v.margin < 60) return ui.setStatus('caution', 'CAUTION', 'Walk-back margin under 1 h');
  if (v.moving && v.cls >= 1) return ui.setStatus('caution', 'CAUTION', `On ${CLASS_NAMES[v.cls]} slope`);
  return ui.setStatus('nominal', 'NOMINAL', S.run.active ? 'All margins green' : 'Plan within limits');
}

function phaseText(st) {
  if (S.run.done) return 'EVA complete. Crew at dock.';
  if (!S.run.active) return 'Crew at dock';
  if (S.run.aborted) return 'Returning to dock on the recalculated route';
  if (st.kind === 'stay') return `Working at ${st.wpId} · ${wpById(st.wpId).name}`;
  return st.d <= S.plan.outD ? `Outbound to ${S.targetId}` : 'Inbound to dock';
}

// ---------- playback ----------
function tick(now) {
  const r = S.run;
  if (!r.active || !r.playing) return;
  const dt = Math.min(250, now - r.last);
  r.last = now;
  r.t += (dt / 60000) * r.speed;
  const st = sim.stateAt(r.timeline, r.t);
  const full = now - r.uiAt > 90 || st.done;
  if (st.done) { r.playing = false; r.done = true; }
  if (full) r.uiAt = now;
  refresh(st, full);
  if (full) $('phase').textContent = phaseText(st);
  if ((S.env.spe || S.env.dust) && !r.aborted && now - r.alertAt > 1500) { r.alertAt = now; showHazard(st); }
  if (st.done) {
    $('btn-run').textContent = 'EVA complete';
    $('btn-run').disabled = true;
    if (r.aborted) S.map.drawReturn(null);
    showHazard(st);
    return;
  }
  requestAnimationFrame(tick);
}

function setPlanLocked(locked) {
  for (const b of document.querySelectorAll('#target-seg button, #mode-seg button')) b.disabled = locked;
}

function toggleRun() {
  const r = S.run;
  if (r.done) return;
  if (!r.active) {
    Object.assign(r, { active: true, playing: true, aborted: false, t: 0, last: performance.now(), timeline: S.plan.timeline, stays: S.plan.stays });
    setPlanLocked(true);
    $('btn-reset').disabled = false;
  } else {
    r.playing = !r.playing;
    r.last = performance.now();
  }
  $('btn-run').textContent = r.playing ? 'Pause' : 'Resume';
  if (r.playing) requestAnimationFrame(tick);
}

function reset() {
  Object.assign(S.run, { active: false, playing: false, done: false, aborted: false, t: 0 });
  $('btn-run').textContent = 'Start EVA';
  $('btn-run').disabled = false;
  $('btn-reset').disabled = true;
  setPlanLocked(false);
  S.map.drawReturn(null);
  replan();
  $('phase').textContent = phaseText(S.lastState);
  showHazard(S.lastState);
}

// ---------- hazards ----------
// Rebuild what is left of the walk from the crew's current state under current conditions.
function remainingTimeline(st) {
  const tl = S.run.timeline;
  const rest = tl.pts.slice(st.nextIndex);
  const first = { ...rest[0], lon: st.lon, lat: st.lat, z: st.z, shield: st.shield, d: st.d }; // keep distance along the plan
  const pts = [first];
  for (const p of rest) pts.push({ ...p, d: pts[pts.length - 1].d + groundMetres(pts[pts.length - 1], p) });
  const stays = new Map();
  for (const [idx, stay] of S.run.stays) {
    if (idx > st.nextIndex || (idx === st.nextIndex && st.kind !== 'stay')) stays.set(idx - st.nextIndex + 1, stay);
  }
  return { timeline: sim.buildTimeline(pts, stays, { t: st.t, o2: st.o2, batt: st.batt, dose: st.dose }, cfg()), stays };
}

function returnTimeline(st) {
  const line = [{ lon: st.lon, lat: st.lat }, ...sim.smooth(backPath(st)).slice(1)];
  const pts = sim.profile(S.terrain, line, S.limits, 5);
  return sim.buildTimeline(pts, new Map(), { t: st.t, o2: st.o2, batt: st.batt, dose: st.dose }, cfg());
}

function optionFacts(tl, st) {
  const reserve = S.mission.suit.oxygen.reserveMin;
  return `${ui.fmtDur(tl.end.t - st.t)} · ${ui.fmtM(tl.pts[tl.pts.length - 1].d)} · +${(tl.end.dose - st.dose).toFixed(2)} mSv · O₂ ${ui.fmtHM(tl.end.o2 - reserve)} at dock`;
}

function showHazard(st) {
  const { spe, dust } = S.env;
  if (!spe && !dust) { ui.renderAlert(null); if (!S.run.aborted) S.map.drawReturn(null); return; }
  const c = cfg();
  const title = spe && dust ? 'Solar particle event + dust storm' : spe ? 'Solar particle event' : 'Dust storm';
  const bits = [];
  if (spe) bits.push(`Dose rate ×${c.speMultiplier}: ${(sim.doseRateMSvPerHour(st.shield, c) * 1000).toFixed(0)} µSv/h here.`);
  if (dust) bits.push('Pace −30%, battery load +15%.');
  const level = spe ? 'warning' : 'caution';
  const r = S.run;

  if (r.done) return ui.renderAlert({ level, title, detail: `${bits.join(' ')} Crew is at the dock.` });
  if (!r.active) {
    const s = S.plan.summary;
    return ui.renderAlert({ level, title, detail: `${bits.join(' ')} Hold at the dock: this plan would now take ${ui.fmtDur(s.durationMin)} and ${s.doseMSv.toFixed(2)} mSv.` });
  }
  if (r.aborted) {
    return ui.renderAlert({ level, title, detail: `${bits.join(' ')} Returning on the recalculated route: ${ui.fmtDur(r.timeline.end.t - st.t)} to the dock.` });
  }
  const cont = remainingTimeline(st);
  const ret = returnTimeline(st);
  S.map.drawReturn(ret.pts);
  const best = S.terrain.shelters(1, 10)[0];
  ui.renderAlert({
    level, title,
    detail: `${bits.join(' ')} Best terrain shielding on this site cuts dose by ${Math.round(best.blocked * c.shieldEff * 100)}%, not enough to wait it out.`,
    options: [
      { name: 'Return now', best: true, facts: optionFacts(ret, st), action: 'Execute return', run: () => executeReturn() },
      { name: 'Continue plan', facts: optionFacts(cont.timeline, st) },
    ],
  });
}

function executeReturn() {
  const st = sim.stateAt(S.run.timeline, S.run.t);
  const ret = returnTimeline(st);
  Object.assign(S.run, { timeline: ret, stays: new Map(), aborted: true });
  S.map.drawReturn(ret.pts);
  showHazard(st);
  $('phase').textContent = phaseText(st);
}

function toggleHazard(key, btn) {
  const r = S.run;
  const st = r.active ? sim.stateAt(r.timeline, r.t) : null;
  S.env[key] = !S.env[key];
  btn.setAttribute('aria-pressed', String(S.env[key]));
  computeReturnField();
  if (!r.active) { replan(); showHazard(S.lastState); return; }
  if (r.done) { showHazard(S.lastState); return; }
  // Conditions changed mid-walk: re-time whatever is left from where the crew stands.
  if (r.aborted) r.timeline = returnTimeline(st);
  else { const rest = remainingTimeline(st); r.timeline = rest.timeline; r.stays = rest.stays; }
  r.alertAt = performance.now();
  showHazard(st);
  refresh(sim.stateAt(r.timeline, r.t), true);
}

// ---------- waypoints ----------
function selectWaypoint(id, pan) {
  S.selectedId = id;
  const wp = wpById(id);
  const dock = S.mission.waypoints[0];
  S.map.markWaypoints(id, S.plan.active);
  ui.renderWaypoint(wp, {
    units: S.mission.layers.minerals.units,
    sources: S.mission.sources,
    geologicUnit: S.mission.site.geologicUnit,
    distM: wp.routeDistM,
    climbM: S.terrain.elevAt(wp.lon, wp.lat) - S.terrain.elevAt(dock.lon, dock.lat),
    backMin: S.returnField.cost[cellOf(wp)] / 60,
    isTarget: id === S.targetId,
    onSetTarget: setTarget,
  });
  if (pan) S.map.focus(wp.lon, wp.lat);
}

function setTarget(id) {
  if (S.run.active) return;
  S.targetId = id;
  ui.setSegment($('target-seg'), 'target', id);
  replan();
  selectWaypoint(S.selectedId, false);
}

function hover(lon, lat) {
  const el = $('readout');
  if (lon == null || !S.terrain.contains(lon, lat)) { el.textContent = ''; return; }
  const t = S.terrain, i = t.cellIndex(lon, lat);
  const dock = S.mission.waypoints[0];
  el.textContent =
    `${lat.toFixed(5)}°  ${lon.toFixed(5)}°E\n` +
    `elev   ${(t.z[i] - t.elevAt(dock.lon, dock.lat) >= 0 ? '+' : '−')}${Math.abs(t.z[i] - t.elevAt(dock.lon, dock.lat)).toFixed(1)} m vs dock\n` +
    `slope  ${t.slope[i].toFixed(1)}°  ${CLASS_NAMES[t.cls[i]]}\n` +
    `home   ${ui.fmtDur(S.returnField.cost[i] / 60)}\n` +
    `sky    ${(t.shield[i] * 100).toFixed(0)}% hidden`;
}

// ---------- boot ----------
async function boot() {
  const [mission, route] = await Promise.all([fetchJson('data/mission.json'), fetchJson('data/route.json')]);
  S.mission = mission;
  S.route = route;
  S.limits = { caution: mission.suit.slopeLimitsDeg.caution, noGo: mission.suit.slopeLimitsDeg.noGo };
  S.terrain = await Terrain.load('data/terrain.json', S.limits);
  S.router = new Router(S.terrain, mission.suit);
  S.dockIdx = cellOf(mission.waypoints[0]);

  $('eva-name').textContent = `${mission.eva.id.toUpperCase()} · ${mission.eva.name}`;
  $('site-name').textContent = `${mission.site.name}, ${mission.site.locality}`;
  const spe = mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  $('spe-sub').textContent = `Dose rate ×${spe.demoSeverityMultiplier}`;

  S.map = new MapView($('map'), mission, S.terrain);
  S.map.buildStaticRasters();
  S.map.drawScience(route);
  S.map.drawTrack(route);
  S.map.drawShelters(S.terrain.shelters(4, 70), cfg().shieldEff);
  S.map.addWaypoints(mission.waypoints);
  S.map.onWaypoint = (id) => selectWaypoint(id, true);
  S.map.onHover = hover;

  $('target-seg').innerHTML = mission.waypoints.slice(1)
    .map((w) => `<button type="button" role="radio" data-target="${w.id}" aria-checked="${w.id === S.targetId}" title="${w.name}">${w.id.replace('WP', '')}</button>`).join('');
  $('target-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTarget(b.dataset.target); });
  $('mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || S.run.active) return;
    S.mode = b.dataset.mode;
    ui.setSegment($('mode-seg'), 'mode', S.mode);
    replan();
  });
  $('speed-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.run.speed = Number(b.dataset.speed);
    ui.setSegment($('speed-seg'), 'speed', b.dataset.speed);
  });
  $('btn-run').addEventListener('click', toggleRun);
  $('btn-reset').addEventListener('click', reset);
  $('btn-spe').addEventListener('click', (e) => toggleHazard('spe', e.currentTarget));
  $('btn-dust').addEventListener('click', (e) => toggleHazard('dust', e.currentTarget));
  $('btn-site3d').addEventListener('click', () => { ui.renderSite3D(); $('site3d').showModal(); });
  for (const id of ['btn-about', 'btn-about-2']) $(id).addEventListener('click', () => $('about').showModal());

  const layers = [
    { id: 'slope', name: 'Slope / mobility', src: '1 m orbital elevation model', on: true, blend: true, opacity: 0.7,
      legend: [['#3ddc84', `under ${S.limits.caution}°`], ['#ffb020', `${S.limits.caution}–${S.limits.noGo}°`], ['#ff4d4d', `over ${S.limits.noGo}°`]] },
    { id: 'science', name: 'Rock units / science stops', src: 'Rover findings on the ground', on: true, blend: true, opacity: 1,
      legend: mission.layers.minerals.units.map((u) => [u.color, u.label]).concat([['#4cc9f0', 'priority stop']]) },
    { id: 'shield', name: 'Radiation shielding', src: 'Sky hidden by terrain, from elevation', on: false, blend: true, opacity: 0.8,
      legend: [['#b388ff', 'more sky hidden = lower dose']] },
    { id: 'iso', name: 'Walk-back time', src: 'Least-time field to the dock', on: false, blend: true, opacity: 0.85,
      legend: [['#ffffff', 'one line per 5 min, bold per 15']] },
    { id: 'hillshade', name: 'Shaded relief', src: '1 m orbital elevation model', on: false, blend: true, opacity: 0.6 },
    { id: 'track', name: 'Rover track', src: 'Every drive, sols 4560–4868', on: false, blend: false },
  ];
  const applyLayer = (id, on, opacity) => {
    S.map.setLayer(id, on, opacity);
    if (id === 'slope') { S.slopeOn = on; if (S.plan) S.map.drawRoute(S.plan.pts, S.plan.outLen, on); }
  };
  ui.renderLayers(layers, applyLayer);

  computeReturnField();
  for (const l of layers) applyLayer(l.id, l.on, l.blend ? l.opacity : null);
  replan();
  selectWaypoint('DOCK', false);
  $('phase').textContent = phaseText(S.lastState);

  ui.renderAbout(mission, { cells: S.terrain.size.toLocaleString('en-US'), rms: route.summary.demVsRoverRmsResidualM, spe: spe.demoSeverityMultiplier });
  fetchJson(mission.liveFeeds.perseveranceLatest).then((d) => {
    const im = d.images && d.images[0];
    if (im) ui.renderLiveFeed({ url: im.image_files.medium, sol: im.sol, date: im.date_taken_utc.slice(0, 10), credit: im.credit });
  }).catch(() => {});

  ui.renderBriefing(mission, [
    [ui.fmtM(mission.eva.oneWayM), 'out, on ground the rover drove'],
    [`+${Math.round(mission.eva.elevGainM)} m`, 'of climb to the turnaround'],
    [String(mission.waypoints.length), 'cairns, each a real rover stop'],
  ], () => S.map.resize());

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { S.map.resize(); if (S.lastState) refresh(S.lastState, true); }, 120);
  });
  $('app').removeAttribute('data-booting');
  S.map.resize();
}

boot().catch((err) => {
  console.error(err);
  const b = $('boot');
  b.dataset.error = '';
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
