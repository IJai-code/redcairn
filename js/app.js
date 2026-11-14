// REDCAIRN — a guided walk. One story column, one map, one question at a time.

import { Terrain, Router, fetchJson, groundMetres } from './terrain.js';
import * as sim from './sim.js';
import { MapView } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (m) => { const v = Math.max(0, Math.round(m)); return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, '0')} min`; };
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m / 10) * 10} m`);

// Every layer says, in plain words, what it shows, what kind of data it is and which mission it came from.
const LAYERS = [
  { id: 'slope', group: 'trail', name: 'Where can I walk?', desc: 'How steep the ground is for someone in a spacesuit.', kind: 'Topographic', from: 'Mars Reconnaissance Orbiter · HiRISE stereo',
    legend: [['#2f8a57', 'Easy walking (under 15°)'], ['#e0a11b', 'Take care (15–20°)'], ['#d7402f', 'Too steep (over 20°)']] },
  { id: 'rocks', group: 'trail', name: 'What rock is this?', desc: 'The rock under the trail, from the rover’s drill and laser.', kind: 'Chemical', from: 'Curiosity rover',
    legend: [['#4cc9f0', 'Ridged rock: water moved underground'], ['#f4a261', 'Layered salty rock: Mars drying out']] },
  { id: 'relief', group: 'trail', name: 'Shape of the land', desc: 'Hills and ridges, as if lit from the side.', kind: 'Topographic', from: 'Mars Reconnaissance Orbiter · HiRISE stereo' },
  { id: 'shield', group: 'trail', name: 'Shelter from radiation', desc: 'Where hills hide part of the sky and cut the dose.', kind: 'Radiation', from: 'Curiosity RAD detector + elevation',
    legend: [['#7d50dc', 'More sky hidden = less radiation']] },
  { id: 'home', group: 'trail', name: 'Minutes to walk home', desc: 'One white line for every 5 minutes of walking back to the rover.', kind: 'Computed', from: 'REDCAIRN, from the elevation model',
    legend: [['#ffffff', 'Each line = 5 more minutes from home']] },
  { id: 'track', group: 'trail', name: 'The rover’s own tracks', desc: 'Every drive the rover made across this ground.', kind: 'Ground truth', from: 'Curiosity rover' },
  { id: 'mola', group: 'orbit', name: 'Height of the land', desc: 'Blue is low ground. Red and white are high.', kind: 'Topographic', from: 'Mars Global Surveyor · MOLA + Mars Express · HRSC', coarse: 'One pixel is 200 m. Zoom out to read it.',
    legend: [['linear-gradient(90deg,#3b4cc0,#3fa35b,#e9d44a,#c9442b,#f4f4f4)', 'Low → high']] },
  { id: 'thermal', group: 'orbit', name: 'Ground temperature at night', desc: 'Bright ground is solid rock that stays warm after dark. Dark ground is loose dust and sand.', kind: 'Thermal', from: 'Mars Odyssey · THEMIS', coarse: 'One pixel is 100 m. Zoom out to read it.',
    legend: [['linear-gradient(90deg,#111,#eee)', 'Cool dust → warm rock']] },
  { id: 'minerals', group: 'orbit', name: 'Water minerals seen from orbit', desc: 'Places where orbiting instruments detected minerals that only form in water.', kind: 'Spectral', from: 'MRO · CRISM + Mars Express · OMEGA',
    legend: [['#2b9fd6', 'Water-formed minerals detected']] },
  { id: 'geology', group: 'orbit', name: 'Geologic map', desc: 'What kind of terrain this is and how old.', kind: 'Geologic', from: 'USGS', coarse: 'A global map. Zoom out to read it.' },
];

const S = { step: 0, reached: 0, env: { spe: false, dust: false }, on: new Set(), opacity: {}, homeVia: 'trail', anim: 0 };

function cfg() {
  const rad = S.mission.hazards.radiation;
  const spe = S.mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  return { suit: S.mission.suit, env: S.env, radiation: rad, speMultiplier: spe.demoSeverityMultiplier, shieldEff: rad.terrainShielding.efficiency };
}
const cellOf = (p) => S.terrain.cellIndex(p.lon, p.lat);
const stops = () => S.mission.waypoints;
const CH = () => ['start', ...stops().map((_, k) => k), 'home', 'end'];

// ---------- the plan: out along the rover's track, and back ----------
function buildPlan() {
  const line = S.route.eva.map((v) => ({ lon: v.lon, lat: v.lat }));
  const out = sim.profile(S.terrain, line, S.limits, 0);
  const back = sim.profile(S.terrain, line.slice().reverse(), S.limits, 0);
  const outD = out[out.length - 1].d;
  const pts = out.concat(back.slice(1).map((p) => ({ ...p, d: p.d + outD })));
  const idx = stops().map((wp, k) => (k === stops().length - 1 ? out.length - 1 : sim.nearestIndex(out, wp)));
  const stays = new Map();
  stops().forEach((wp, k) => { if (k) stays.set(idx[k], { min: wp.plannedStayMin, wpId: wp.id }); });
  const tl = sim.buildTimeline(pts, stays, sim.startState(S.mission.suit), cfg());
  const arr = [], dep = [];
  stops().forEach((wp, k) => {
    const a = tl.nodes.find((n) => n.i === idx[k] && (n.kind === 'walk' || n.kind === 'start'));
    arr[k] = a;
    dep[k] = tl.nodes.find((n) => n.kind === 'stay' && n.wpId === wp.id) || a;
  });
  S.plan = { out, pts, outD, idx, tl, arr, dep };
}

function legInfo(k) {
  const { out, idx, arr, dep } = S.plan;
  let steep = 0;
  for (let i = idx[k - 1]; i <= idx[k]; i++) steep = Math.max(steep, Math.abs(out[i].slope));
  const word = steep < 8 ? 'gentle ground' : steep < 13 ? 'a steady climb' : 'one steep stretch';
  return { min: arr[k].t - dep[k - 1].t, dist: out[idx[k]].d - out[idx[k - 1]].d, steep, word };
}

// ---------- suit strip ----------
function showSuit(st) {
  const suit = S.mission.suit;
  const air = st.o2 - suit.oxygen.reserveMin;
  const homeSec = S.returnField.cost[cellOf(st)];
  const spare = air - sim.returnNeedMin(homeSec);
  $('s-air').textContent = mins(air);
  $('s-home').textContent = homeSec < 30 ? 'you are home' : mins(homeSec / 60);
  $('s-time').textContent = mins(st.t);
  $('s-dose').textContent = `${st.dose.toFixed(2)} mSv`;
  $('suit').dataset.level = spare < 20 ? 'stop' : spare < 60 ? 'care' : '';
  $('suit-line').innerHTML = homeSec < 30
    ? (st.t < 1 ? 'You are at the rover with full tanks: <b>8 hours</b> of air.' : `You are home, with <b>${mins(air)}</b> of air left.`)
    : `From here you can walk home and still have <b>${mins(spare)}</b> of air to spare.`;
  S.map.setCrew(st.lon, st.lat);
  S.last = st;
}

function animate(tl, tA, tB, done) {
  const token = ++S.anim;
  const t0 = performance.now(), dur = 1900;
  const finish = () => { if (token !== S.anim) return; S.anim++; showSuit(sim.stateAt(tl, tB)); if (done) done(); };
  const frame = (now) => {
    if (token !== S.anim) return;
    const f = Math.min(1, (now - t0) / dur);
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    showSuit(sim.stateAt(tl, tA + (tB - tA) * e));
    if (f < 1) requestAnimationFrame(frame); else finish();
  };
  requestAnimationFrame(frame);
  setTimeout(finish, dur + 400); // still lands if the tab is in the background
}

// ---------- layers ----------
function renderLayers() {
  const row = (l) => `
    <div class="layer" data-layer="${l.id}">
      <label>
        <input type="checkbox" ${S.on.has(l.id) ? 'checked' : ''}>
        <span class="layer__name">${esc(l.name)}</span>
        <span class="layer__desc">${esc(l.desc)}</span>
        <span class="layer__from"><b>${esc(l.kind)}</b>${esc(l.from)}</span>
      </label>
      ${S.on.has(l.id) && l.id !== 'track' && l.id !== 'minerals' ? `<input type="range" min="15" max="100" value="${Math.round((S.opacity[l.id] ?? 0.8) * 100)}" aria-label="How strongly to show ${esc(l.name)}">` : ''}
      ${S.on.has(l.id) && l.coarse && S.map.view === 'walk' ? `<p class="layer__coarse">${esc(l.coarse)}</p>` : ''}
    </div>`;
  $('layers-panel').innerHTML = `
    <h3>Always on <small>· the photo from orbit (MRO · HiRISE and CTX cameras)</small></h3>
    <h3>On the trail</h3>${LAYERS.filter((l) => l.group === 'trail').map(row).join('')}
    <h3>From orbit <small>· best when zoomed out</small></h3>${LAYERS.filter((l) => l.group === 'orbit').map(row).join('')}`;
  $('layers-count').textContent = S.on.size ? String(S.on.size) : '';
  $('layers-count').hidden = S.on.size === 0;
  const lg = [...S.on].map((id) => LAYERS.find((l) => l.id === id)).filter((l) => l && l.legend).pop();
  $('legend').hidden = !lg;
  if (lg) $('legend').innerHTML = `<b>${esc(lg.name)}</b>${lg.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}`;
}

function setLayer(id, on, opacity) {
  if (on) S.on.add(id); else S.on.delete(id);
  if (opacity != null) S.opacity[id] = opacity;
  S.map.setLayer(id, on, S.opacity[id] ?? null);
  if (id === 'slope' && S.plan) S.map.drawRoute(S.plan.out, on);
}

function useLayers(ids) {
  for (const l of LAYERS) setLayer(l.id, ids.includes(l.id));
  renderLayers();
}

// ---------- chapters ----------
function stepsNav() {
  const ch = CH();
  $('steps').innerHTML = ch.map((c, i) => {
    const label = c === 'start' ? '●' : c === 'home' ? '⌂' : c === 'end' ? '✓' : String(c + 1);
    const name = c === 'start' ? 'Introduction' : c === 'home' ? 'The way home' : c === 'end' ? 'Back at the rover' : `Stop ${c + 1}`;
    return `${i ? `<i ${i <= S.step ? 'data-done' : ''}></i>` : ''}<button type="button" data-step="${i}" aria-label="${name}" ${i === S.step ? 'aria-current="step"' : ''} ${i < S.step ? 'data-done' : ''}>${label}</button>`;
  }).join('');
}

function sourcesLine(ids) {
  const list = ids.map((id) => S.mission.sources.find((s) => s.id === id)).filter(Boolean);
  return list.length ? `<p class="src">How we know: ${list.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>` : '';
}

function startHTML() {
  const m = S.mission, b = m.briefing, q = m.question, w = S.conditions.weather;
  return `
    <p class="eyebrow">Gale crater, Mars · a ${metres(m.eva.oneWayM)} walk</p>
    <h1>${esc(b.title)}</h1>
    <figure class="photo photo--wide">
      <img src="assets/img/hero.jpg" alt="The trail climbing across ridged ground, marked by stacked-stone cairns">
      <figcaption>The real ground of this walk, built in Blender from orbital height data and photos. The orange line is the trail.</figcaption>
    </figure>
    <p class="lede">${esc(b.body[0])}</p>
    <p>${esc(b.body[1])}</p>
    <div class="question">
      <h2>${esc(q.title)}</h2>
      <p>${esc(q.text)}</p>
      <small>${esc(q.factCheck)}</small>
    </div>
    <div class="facts">
      <div><b>${metres(m.eva.oneWayM)}</b><span>each way, on ground the rover already drove</span></div>
      <div><b>${stops().length} stops</b><span>each one a real place the rover worked</span></div>
      <div><b>${mins(S.plan.tl.end.t)}</b><span>outside, with 8 hours of air</span></div>
    </div>
    <p class="weather"><b>Weather at the site.</b> High ${w.airMaxC}°C, low ${w.airMinC}°C, sky: ${esc(String(w.sky).toLowerCase())}. Latest report from the rover’s own weather station, Mars day ${w.sol} (${esc(w.earthDate)}).</p>
    <div class="teach"><b>On the map now</b>The whole of Gale crater, 154 km across. Colours show height, measured by two orbiters. Blue dots are places where orbiters spotted minerals that only form in water. Your walk is the orange pin near the middle.
      <small>Each stop switches on the map layer that matters there. Open “Map layers” to mix your own.</small></div>
    <details><summary>See the whole walk in 3D</summary>
      <model-viewer src="assets/models/site.glb" alt="3D model of the walk across the ridges" camera-controls touch-action="pan-y" interaction-prompt="none" camera-orbit="25deg 58deg 75%" auto-rotate rotation-per-second="5deg" shadow-intensity="0" exposure="1.1" loading="lazy"></model-viewer>
      <small>True-scale ground from the 1 m orbital height model with the orbital photo laid over it (tinted). Cairns are drawn large so you can see them. Built in Blender.</small>
    </details>
    ${sourcesLine(q.sources)}`;
}

function stopHTML(k) {
  const wp = stops()[k], p = wp.plain;
  const leg = k ? legInfo(k) : null;
  const layer = LAYERS.find((l) => l.id === p.layer);
  return `
    <p class="eyebrow">Stop ${k + 1} of ${stops().length}${leg ? ` · ${mins(leg.min)} walk · ${leg.word}` : ' · start'}</p>
    <h1>${esc(p.title)}</h1>
    <p class="place">${esc(wp.name)}</p>
    <figure class="photo">
      <img src="${esc(wp.pov.imageUrl)}" alt="${esc(p.see)}" referrerpolicy="no-referrer">
      <figcaption>What you will see. Photographed by the Curiosity rover from this spot on ${esc(wp.pov.utc.slice(0, 10))}. ${esc(wp.pov.credit)}</figcaption>
    </figure>
    <p class="lede">${esc(wp.story)}</p>
    <h2>Why stop here</h2>
    <p>${esc(p.why)}</p>
    <h2>Your job here${wp.plannedStayMin ? ` · ${wp.plannedStayMin} min` : ''}</h2>
    <ul class="jobs">${p.do.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="teach"><b>On the map now${layer ? ` · ${esc(layer.name)}` : ' · the photo from orbit'}</b>${esc(p.teach)}
      <small>${layer ? `${esc(layer.kind)} data from ${esc(layer.from)}.` : 'Optical data from Mars Reconnaissance Orbiter · HiRISE.'}</small></div>
    ${wp.earthNamesakes.length ? `<p class="earth">Named after a place on Earth: ${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">see ${esc(n.name)} from orbit</a>`).join(' · ')}</p>` : ''}
    <details><summary>Stand here in 3D</summary>
      <model-viewer src="${esc(wp.model.src)}" alt="3D model of the ground at ${esc(wp.name)}" camera-controls touch-action="pan-y" interaction-prompt="none"
        camera-target="1.5m 1m 0m" camera-orbit="-40deg 72deg 22m" min-camera-orbit="auto auto 6m" max-camera-orbit="auto auto 110m" shadow-intensity="0" exposure="1.1" loading="lazy"></model-viewer>
      <small>The real shape of the ground here, at true scale, from the 1 m orbital height model. The figure is 1.8 m tall.${k === 0 ? ' The rover is our team’s own model.' : ''} Drag to look around, scroll to pull back.</small>
    </details>
    ${sourcesLine(wp.science.sources)}`;
}

function homeHTML() {
  const far = stops()[stops().length - 1];
  const direct = S.returnField.cost[cellOf(far)] / 60;
  return `
    <p class="eyebrow">Before you turn around</p>
    <h1>The way home</h1>
    <p class="lede">The first question on any walk is not “what will I find?” It is “can I get back?”</p>
    <p>Every point on this map knows the answer. The white lines are five minutes of walking apart, measured over the real slopes. From here, the rover is <b>${mins(direct)}</b> away on foot.</p>
    <p>That is what a cairn is for. It does not tell you where to go. It tells you that you can come back.</p>
    <h2>Practise the bad day</h2>
    <p>The Sun sometimes throws out a burst of radiation. With no thick air or magnetic field to stop it, an astronaut on Mars has to act fast.</p>
    <p style="margin-top:14px"><button class="btn btn--storm" id="btn-storm" type="button" aria-pressed="${S.env.spe}">${S.env.spe ? 'End the drill' : 'Start the drill: a solar storm arrives'}</button></p>
    <div id="drill"></div>
    ${sourcesLine(['nasa-rad-safer', 'jpl-sept-2017'])}`;
}

function drillHTML() {
  if (!S.env.spe) return '';
  const c = cfg(), d = S.drill;
  const less = Math.round((1 - d.direct.dose / d.trail.dose) * 100);
  const best = S.terrain.shelters(1, 10)[0];
  return `
    <div class="choices">
      <span class="drill-tag">Drill · simulated storm · radiation ×${c.speMultiplier}</span>
      <button class="choice" type="button" data-via="direct" ${S.homeVia === 'direct' ? 'data-best' : 'data-best'}>
        <b>Take the dashed white line</b>
        <span>${mins(d.direct.min)} to the rover · ${d.direct.dose.toFixed(2)} mSv on the way. Redcairn just drew this: the quickest safe ground home.</span>
      </button>
      <button class="choice" type="button" data-via="trail">
        <b>Go back the way you came</b>
        <span>${mins(d.trail.min)} to the rover · ${d.trail.dose.toFixed(2)} mSv on the way.</span>
      </button>
      <p>The new line cuts the dose by <b>${less}%</b>. Could you hide behind a hill instead? The purple patches show where the ground blocks part of the sky. The best spot here stops only ${Math.round(best.blocked * c.shieldEff * 100)}%. Not enough. Go home.</p>
    </div>`;
}

function endHTML() {
  const tl = S.finalTl || S.plan.tl;
  const kinds = [['Sharp photos from orbit', 'Mars Reconnaissance Orbiter'], ['Height and slope', 'MRO, Mars Global Surveyor, Mars Express'], ['Night temperature', 'Mars Odyssey'],
    ['Water minerals from orbit', 'MRO, Mars Express'], ['Geologic map', 'USGS'], ['Rock chemistry on the ground', 'Curiosity rover'],
    ['Radiation', 'Curiosity rover'], ['Weather', 'Curiosity rover'], ['Eye-level photos', 'Curiosity rover']];
  return `
    <p class="eyebrow">Back at the rover</p>
    <h1>You are home.</h1>
    <div class="facts">
      <div><b>${mins(tl.end.t)}</b><span>outside</span></div>
      <div><b>${stops().length} stops</b><span>${stops().reduce((n, w) => n + w.plain.do.length, 0)} jobs done</span></div>
      <div><b>${mins(tl.end.o2 - S.mission.suit.oxygen.reserveMin)}</b><span>of air still in the tanks</span></div>
    </div>
    <p class="lede">In your sample bag is rock from both sides of a line that marks when this part of Mars began to dry. On Earth, it will help answer how long water lasted under this mountain.</p>
    <h2>What this guide is made of</h2>
    <ul class="made-of">${kinds.map(([a, b]) => `<li>${esc(a)}<span>${esc(b)}</span></li>`).join('')}</ul>
    <p style="margin-top:12px"><button class="link-btn" id="about-2" type="button">See every source and how AI was used</button></p>
    <p class="closing">The rover could not come home. Its last job is to make sure you can.</p>`;
}

function go(step, jump) {
  const ch = CH();
  const prev = S.step;
  step = Math.max(0, Math.min(ch.length - 1, step));
  if (S.env.spe && ch[step] !== 'home' && ch[step] !== 'end') toggleStorm(true);
  S.step = step;
  S.reached = Math.max(S.reached, step);
  const c = ch[step];
  const { tl, arr, dep } = S.plan;
  const last = stops().length - 1;

  stepsNav();
  $('chapter').innerHTML = c === 'start' ? startHTML() : c === 'home' ? homeHTML() : c === 'end' ? endHTML() : stopHTML(c);
  $('chapter').scrollTop = 0;
  if (c === 'home') { $('drill').innerHTML = drillHTML(); }
  $('btn-prev').disabled = step === 0;
  $('btn-next').textContent = c === 'start' ? 'Begin the walk' : c === 'end' ? 'Start again' : c === 'home' ? 'Walk home' : c === last ? 'Plan the way home' : `Walk to stop ${c + 2}`;

  useLayers(c === 'start' ? ['mola', 'minerals'] : c === 'home' ? (S.env.spe ? ['home', 'shield'] : ['home']) : c === 'end' ? [] : ({ slope: ['slope'], rocks: ['rocks'], relief: ['relief'] }[stops()[c].plain.layer] || []));
  const wantView = c === 'start' ? 'crater' : 'walk';
  if (S.map.view !== wantView) S.map.setView(wantView);

  const forward = !jump && step === prev + 1;
  if (typeof c === 'number') {
    S.map.markStops(c, c);
    if (forward && c > 0) animate(tl, dep[c - 1].t, arr[c].t); else { S.anim++; showSuit(sim.stateAt(tl, arr[c].t)); }
    S.map.panTo(stops()[c].lon, stops()[c].lat);
  } else if (c === 'home') {
    S.map.markStops(last, last);
    S.anim++; showSuit(sim.stateAt(tl, dep[last].t));
  } else if (c === 'end') {
    S.map.markStops(-1, last + 1);
    const useTl = S.finalTl || tl;
    if (forward) animate(useTl, dep[last].t, useTl.end.t, () => S.map.drawReturn(null)); else { S.anim++; showSuit(sim.stateAt(useTl, useTl.end.t)); S.map.drawReturn(null); }
  } else {
    S.map.markStops(-1, 0);
    S.anim++; showSuit(sim.stateAt(tl, 0));
  }
  if (c !== 'home' && c !== 'end') { S.finalTl = null; S.map.drawReturn(null); }
}

// ---------- the storm drill ----------
function toggleStorm(silent) {
  S.env.spe = !S.env.spe;
  S.returnField = S.router.field(S.dockIdx, { mode: 'fastest', doseAware: S.env.spe, shieldEff: cfg().shieldEff });
  S.map.buildHome(S.returnField);
  const last = stops().length - 1;
  if (S.env.spe) {
    const st = sim.stateAt(S.plan.tl, S.plan.dep[last].t);
    const start = { t: st.t, o2: st.o2, batt: st.batt, dose: st.dose };
    const line = [{ lon: st.lon, lat: st.lat }, ...sim.smooth(S.router.trace(S.returnField, cellOf(st))).slice(1)];
    const direct = sim.buildTimeline(sim.profile(S.terrain, line, S.limits, 5), new Map(), start, cfg());
    const back = S.plan.pts.slice(S.plan.idx[last]).map((p) => ({ ...p, d: p.d - S.plan.outD }));
    const trail = sim.buildTimeline(back, new Map(), start, cfg());
    const sum = (tl) => ({ tl, min: tl.end.t - st.t, dose: tl.end.dose - st.dose });
    S.drill = { direct: sum(direct), trail: sum(trail) };
    S.homeVia = 'direct';
    S.finalTl = direct;
    S.map.drawReturn(direct.pts);
  } else {
    S.drill = null; S.finalTl = null; S.homeVia = 'trail';
    S.map.drawReturn(null);
  }
  if (!silent) go(S.step, true);
}

// ---------- about ----------
function aboutHTML() {
  const m = S.mission;
  const src = (id) => m.sources.find((s) => s.id === id);
  return `
    <section>
      <h3>The five resources we were given, and what each one does here</h3>
      <ul>${m.anchorResources.map((a) => `<li><b><a href="${esc(src(a.source).url)}" target="_blank" rel="noopener">${esc(a.name)}</a></b>${esc(a.role)}</li>`).join('')}</ul>
      <div class="live" id="m2020-live"></div>
    </section>
    <section>
      <h3>Every map layer, and where it comes from</h3>
      <div class="tablewrap"><table><thead><tr><th>Layer</th><th>Kind of data</th><th>Mission or source</th></tr></thead><tbody>
        <tr><td>Photo from orbit (always on)</td><td>Optical</td><td>Mars Reconnaissance Orbiter · HiRISE and CTX</td></tr>
        ${LAYERS.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.kind)}</td><td>${esc(l.from)}</td></tr>`).join('')}
        <tr><td>Weather report</td><td>Atmospheric</td><td>Curiosity rover · REMS</td></tr>
        <tr><td>Photos at each stop</td><td>Optical, from the ground</td><td>Curiosity rover · navigation cameras</td></tr>
      </tbody></table></div>
    </section>
    <section>
      <h3>What is real and what is simulated</h3>
      <p><b>Real:</b> the ground, its height and slopes, the route (the rover’s own track), the photos, the rock findings, the weather report, the normal radiation rate and the measured effect of terrain on radiation. Our height model matches the rover’s own measurements to within ${esc(S.route.summary.demVsRoverRmsResidualM)} m along the route.</p>
      <p style="margin-top:8px"><b>Simulated:</b> the suit (air, walking pace), the astronaut’s position, and the solar storm, which is made ${cfg().speMultiplier} times stronger than normal radiation so the drill is easy to follow.</p>
      <p style="margin-top:8px"><b>One correction we want to be clear about:</b> ${esc(m.question.factCheck)}</p>
    </section>
    <section>
      <h3>How it is built</h3>
      <p>Small scripts in the project fetch public mission data and bake it into files. Your browser then works out slope, shelter, walking time and the way home for ${S.terrain.size.toLocaleString('en-US')} patches of ground, with no server. The 3D models and the opening picture are made in Blender from the same data.</p>
    </section>
    <section>
      <h3>All sources</h3>
      <div class="tablewrap"><table><tbody>${m.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.org)}</td><td>${esc(s.use)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section>
      <h3>How AI was used</h3>
      <p>${esc(m.aiDisclosure)}</p>
      <p style="margin-top:8px">This is an independent hackathon project. It is not affiliated with or endorsed by any space agency.</p>
    </section>`;
}

function openAbout() {
  $('about-body').innerHTML = aboutHTML();
  $('about').showModal();
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => {
    const im = d.images && d.images[0];
    if (im && $('m2020-live')) {
      $('m2020-live').innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Latest navigation camera frame from the Perseverance rover" referrerpolicy="no-referrer">
        <p class="src">Live: the newest picture from the other rover, Perseverance, at Jezero crater. Mars day ${esc(im.sol)} (${esc(im.date_taken_utc.slice(0, 10))}). ${esc(im.credit)}</p>`;
    }
  }).catch(() => {});
}

// ---------- boot ----------
async function boot() {
  const [mission, route, conditions] = await Promise.all([fetchJson('data/mission.json'), fetchJson('data/route.json'), fetchJson('data/conditions.json')]);
  Object.assign(S, { mission, route, conditions });
  S.limits = { caution: mission.suit.slopeLimitsDeg.caution, noGo: mission.suit.slopeLimitsDeg.noGo };
  S.terrain = await Terrain.load('data/terrain.json', S.limits);
  S.router = new Router(S.terrain, mission.suit);
  S.dockIdx = cellOf(stops()[0]);
  S.returnField = S.router.field(S.dockIdx, { mode: 'fastest' });
  buildPlan();

  S.map = new MapView($('map'), mission, S.terrain);
  S.map.buildRasters();
  S.map.buildHome(S.returnField);
  S.map.drawStatic(route, conditions, S.terrain.shelters(4, 70), cfg().shieldEff);
  S.map.addStops(stops());
  S.map.drawRoute(S.plan.out, false);
  S.map.onStop = (k) => go(k + 1, true);
  S.map.onView = (name) => { for (const b of $('views').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.view === name)); if (S.plan) renderLayers(); };

  $('views').innerHTML = Object.entries(mission.views).map(([id, v]) => `<button type="button" data-view="${id}" aria-pressed="${id === S.map.view}">${esc(v.label)}</button>`).join('');
  $('views').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) S.map.setView(b.dataset.view); });
  $('steps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(Number(b.dataset.step), true); });
  $('btn-prev').addEventListener('click', () => go(S.step - 1, true));
  $('btn-next').addEventListener('click', () => (S.step === CH().length - 1 ? go(0, true) : go(S.step + 1)));
  $('btn-about').addEventListener('click', openAbout);
  $('btn-layers').addEventListener('click', () => {
    const p = $('layers-panel');
    p.hidden = !p.hidden;
    $('btn-layers').setAttribute('aria-expanded', String(!p.hidden));
  });
  $('layers-panel').addEventListener('change', (e) => {
    const row = e.target.closest('.layer');
    if (!row || e.target.type !== 'checkbox') return;
    setLayer(row.dataset.layer, e.target.checked);
    renderLayers();
  });
  $('layers-panel').addEventListener('input', (e) => {
    const row = e.target.closest('.layer');
    if (row && e.target.type === 'range') setLayer(row.dataset.layer, true, e.target.value / 100);
  });
  $('chapter').addEventListener('click', (e) => {
    if (e.target.closest('#btn-storm')) return toggleStorm();
    if (e.target.closest('#about-2')) return openAbout();
    const choice = e.target.closest('.choice');
    if (choice && S.drill) {
      S.homeVia = choice.dataset.via;
      S.finalTl = S.drill[S.homeVia].tl;
      S.map.drawReturn(S.finalTl.pts);
    }
  });

  go(0, true);
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => S.map.resize(), 120); });
  $('app').removeAttribute('data-booting');
  S.map.resize();
  S.map.setView('crater', false);
}

boot().catch((err) => {
  console.error(err);
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
