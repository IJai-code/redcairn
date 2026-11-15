// REDCAIRN — abandoned, but not forgotten.
// One scroll, three acts, one stage behind the words:
//   I   Remember        the machines that went quiet, on a globe made from Mars Trek relief
//   II  Read the mountain   Mount Sharp's six layers, pulled apart
//   III Walk it         the real ground of Gale crater in 2.5D, with the six layers, the slopes and the way home

import { Terrain, Router, fetchJson } from './terrain.js';
import * as sim from './sim.js';
import { Stage } from './scene.js';
import { buildStack, sparkline } from './stack.js';
import { Crater } from './crater.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (m) => { const v = Math.max(0, Math.round(m)); return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, '0')} min`; };
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m / 10) * 10} m`);
const num = (n) => n.toLocaleString('en-US');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const ORDER = ['viking1', 'pathfinder', 'spirit', 'opportunity', 'phoenix', 'insight', 'ingenuity', 'curiosity'];
const ACTS = [
  { name: 'Remember', go: 'viking1' },
  { name: 'Read the mountain', go: 'crater' },
  { name: 'Walk it', go: 'walk' },
];

// Map layers on the walk. Each one says what it shows, what kind of data it is and where it came from.
const LAYERS = [
  { id: 'slope', name: 'Steepness', desc: 'How steep the ground is for someone in a spacesuit.', kind: 'Topographic', from: 'Mars Reconnaissance Orbiter · HiRISE stereo, via Mars Trek',
    legend: [['#4fc27f', 'Easy (under 15°)'], ['#e0a11b', 'Take care (15–20°)'], ['#d7402f', 'Too steep (over 20°)']] },
  { id: 'rocks', name: 'Rock type', desc: 'The rock under the trail, from the rover’s drill and laser.', kind: 'Chemical', from: 'Curiosity rover',
    legend: [['#4cc9f0', 'Boxwork: water moved underground'], ['#f4a261', 'Layered salty rock: Mars drying out']] },
  { id: 'height', name: 'Height', desc: 'Low ground in blue, high ground in white.', kind: 'Topographic', from: 'MRO · HiRISE 1 m elevation model, via Mars Trek',
    legend: [['linear-gradient(90deg,#2e4a6b,#b78f4a,#efe3cf)', 'Low to high (77 m climb on the trail)']] },
  { id: 'shield', name: 'Radiation shelter', desc: 'Where hills hide part of the sky and trim the dose.', kind: 'Radiation', from: 'Curiosity RAD detector + elevation model',
    legend: [['#7d50dc', 'More sky hidden = less radiation']] },
  { id: 'home', name: 'Minutes to the rover', desc: 'A white line for every 5 minutes of walking back.', kind: 'Computed', from: 'REDCAIRN, from the elevation model',
    legend: [['#ffffff', 'Each line is 5 more minutes from home']] },
  { id: 'track', name: 'Rover tracks', desc: 'Every drive Curiosity made across this ground.', kind: 'Ground truth', from: 'Curiosity rover traverse' },
];

const S = { beat: -1, env: { spe: false, dust: false }, layerOn: new Set(), homeVia: 'trail', anim: 0, curT: 0, walkInit: false, stones: new Set(), beats: [] };

function cfg() {
  const rad = S.mission.hazards.radiation;
  const spe = S.mission.hazards.scenarios.find((x) => x.id === 'spe-2017-analog');
  return { suit: S.mission.suit, env: S.env, radiation: rad, speMultiplier: spe.demoSeverityMultiplier, shieldEff: rad.terrainShielding.efficiency };
}
const cellOf = (p) => S.terrain.cellIndex(p.lon, p.lat);
const stops = () => S.mission.waypoints;
const ghost = (id) => S.story.ghosts.find((g) => g.id === id);

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
  return { min: arr[k].t - dep[k - 1].t, word };
}

// ---------- suit strip and the walker ----------
function showSuit(st, follow) {
  const suit = S.mission.suit;
  const air = st.o2 - suit.oxygen.reserveMin;
  const homeSec = S.returnField.cost[cellOf(st)];
  const spare = air - sim.returnNeedMin(homeSec);
  $('s-air').textContent = mins(air);
  $('s-home').textContent = homeSec < 30 ? 'at the rover' : mins(homeSec / 60);
  $('s-time').textContent = mins(st.t);
  $('s-dose').textContent = `${st.dose.toFixed(2)} mSv`;
  $('suit').dataset.level = spare < 20 ? 'stop' : spare < 60 ? 'care' : '';
  $('suit-line').innerHTML = homeSec < 30
    ? (st.t < 1 ? 'At the rover with full tanks: <b>8 hours</b> of air.' : `Home, with <b>${mins(air)}</b> of air left.`)
    : `You can walk home from here and still have <b>${mins(spare)}</b> of air to spare.`;
  S.stage.setCrew(st.lon, st.lat, follow);
}

function moveTo(tl, tB, follow) {
  const token = ++S.anim;
  const tA = S.curT;
  const show = (t) => { S.curT = t; showSuit(sim.stateAt(tl, t), follow); };
  if (reduce || Math.abs(tB - tA) < 0.5) { show(tB); return; }
  const t0 = performance.now(), dur = 1900;
  const finish = () => { if (token !== S.anim) return; S.anim++; show(tB); };
  const frame = (now) => {
    if (token !== S.anim) return;
    const f = Math.min(1, (now - t0) / dur);
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    show(tA + (tB - tA) * e);
    if (f < 1) requestAnimationFrame(frame); else finish();
  };
  requestAnimationFrame(frame);
  setTimeout(finish, dur + 400);
}

// ---------- chips and legend (the map layers) ----------
function applyLayers() {
  S.stage.setLayers(S.layerOn);
  $('chips').innerHTML = LAYERS.map((l) => `<button type="button" data-layer="${l.id}" aria-pressed="${S.layerOn.has(l.id)}" title="${esc(l.desc)} ${esc(l.kind)} data: ${esc(l.from)}">${esc(l.name)}</button>`).join('');
  const lg = [...S.layerOn].map((id) => LAYERS.find((l) => l.id === id)).filter((l) => l && l.legend).pop();
  $('legend').hidden = !lg;
  if (lg) $('legend').innerHTML = `<b>${esc(lg.name)}</b>${lg.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}`;
}

// ---------- beat markup ----------
function sourcesLine(ids) {
  const list = ids.map((id) => S.mission.sources.find((s) => s.id === id)).filter(Boolean);
  return list.length ? `<p class="src">How we know: ${list.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>` : '';
}

function heroHTML() {
  const h = S.story.hero;
  return `
    <p class="eyebrow">${esc(h.kicker)}</p>
    <h1>${esc(h.title)}</h1>
    <p class="lede">${esc(h.lede)}</p>
    <p class="cue"><button class="link" type="button" data-go="viking1">Begin with the first one</button><span aria-hidden="true"></span></p>`;
}

function ghostHTML(g, n) {
  const walking = g.status === 'walking';
  const worked = g.plus ? `${num(g.worked)}+` : (g.approx ? `about ${num(g.worked)}` : num(g.worked));
  const pct = Math.max(2.5, Math.min(100, (g.planned / g.worked) * 100));
  return `
    <p class="eyebrow">${esc(g.name)} · ${n + 1} of ${ORDER.length}</p>
    <h2>${esc(g.headline)}</h2>
    <p class="place">${esc(g.role)} · ${esc(g.place)}</p>
    ${g.body.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('')}
    <div class="bars" role="img" aria-label="Built to last ${g.planned} ${g.unit}; gave ${worked} ${g.unit}">
      <div><span>Built to last</span><i style="width:${pct.toFixed(1)}%"></i><em>${num(g.planned)} ${g.unit}</em></div>
      <div><span>${walking ? 'So far' : 'Gave'}</span><i class="full"></i><em>${worked} ${g.unit}</em></div>
    </div>
    <dl class="when"><div><dt>Landed</dt><dd>${esc(g.landed)}</dd></div><div><dt>${walking ? 'Status' : 'Last heard'}</dt><dd${walking ? ' class="live"' : ''}>${esc(g.lastHeard)}</dd></div></dl>
    ${g.id === 'viking1' ? '<p class="fine">A sol is a Martian day: 24 hours and 40 minutes.</p>' : ''}
    <p class="src"><a href="${esc(g.url)}" target="_blank" rel="noopener">NASA mission page</a></p>`;
}

function bridgeHTML() {
  const m = S.mission;
  return `
    <p class="eyebrow">Where this guide goes</p>
    <h2>None of them stopped for nothing.</h2>
    <p class="lede">Every machine left a record: tracks, photographs, measurements. All of it is public. Put it together and it makes something none of them could: a trail a person can follow.</p>
    <p>That trail is in Gale crater, on the slopes of Mount Sharp. Gale was put forward three times as a place for the first humans to land. It is also the only place on Mars where a 1 metre elevation model, 25 centimetre photographs, fourteen years of radiation readings and a rover’s own track all cover the same ground.</p>
    <p class="fine">The blue dots are places where orbiting instruments detected minerals that only form in water.</p>
    ${sourcesLine(['trek', 'gale-guide', 'trek-ezmars'])}`;
}

function craterHTML() {
  const m = S.galeView.mountain;
  return `
    <p class="eyebrow">Act II · Read the mountain</p>
    <h2>Gale crater, and the mountain inside it.</h2>
    <p class="lede">Gale is a crater 154 kilometres across, made by an impact more than three billion years ago. In the middle stands Mount Sharp. From the lowest point of the floor to the summit it rises ${num(m.heightM)} metres: higher than Mont Blanc stands above the sea.</p>
    <p>A mountain inside a crater is strange. The best explanation is that the crater slowly filled with layer upon layer of sediment, and then the wind carved most of it away again, leaving this.</p>
    <p class="fine">Rendered in Blender from the Mars Trek elevation model (MOLA and HRSC, about 200 m per pixel) under Viking’s true-colour mosaic. Heights are stretched three times so the mountain reads from this far away.</p>
    ${sourcesLine(['trek', 'gale-guide'])}`;
}

function lineHTML() {
  const r = S.gale.rover, wps = stops();
  const month = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const share = Math.round((r.climbM / S.galeView.mountain.heightM) * 100);
  return `
    <p class="eyebrow">Fourteen years, one line</p>
    <h2>That thin line is Curiosity.</h2>
    <p class="lede">Since August 2012 it has driven ${r.distanceKm.toFixed(1)} kilometres and climbed ${num(r.climbM)} metres, a short drive at a time. That is ${share}% of the way up this mountain.</p>
    <p>Every bend is a decision people on Earth made a day ahead, from photographs like the ones in this guide, along the route the team calls Curiosity’s proposed path up Mount Sharp. The white stretch is your walk: ground the rover crossed between ${month(wps[0].pov.utc)} and ${month(wps[wps.length - 1].pov.utc)}.</p>
    <p class="fine">Track and odometry from the Curiosity team’s traverse data, current to sol ${num(r.latestSol)}. A sol is a Martian day.</p>
    ${sourcesLine(['mount-sharp-route', 'msl-traverse', 'msl-waypoints'])}`;
}

function strataIntroHTML() {
  const d = S.strata;
  return `
    <p class="eyebrow">Read the mountain</p>
    <h2>${esc(d.title)}</h2>
    <p class="lede">${esc(d.intro)}</p>
    <p class="fine">${esc(d.scaleNote)}</p>`;
}

function strataLayerHTML(l, i) {
  const d = S.strata, n = d.layers.length;
  return `
    <p class="eyebrow">Page ${i + 1} of ${n} · ${i === 0 ? 'the oldest' : i === n - 1 ? 'the youngest' : 'reading upward'}</p>
    <h2>${esc(l.name)}</h2>
    <p class="place">${esc(l.where)} · ${esc(l.kind)}</p>
    <p class="lede">${esc(l.feeling)}</p>
    <p>${esc(l.fact)}</p>
    <p class="fine">${esc(l.seen)}</p>
    ${l.here ? '<p class="here-tag">You are here. The walk in Act III is on this page.</p>' : ''}
    <div class="wet">${sparkline(d.layers, i)}<small>${esc(d.wetNote)}</small></div>`;
}

function strataCloseHTML() {
  const d = S.strata;
  return `
    <p class="eyebrow">What the mountain says</p>
    <h2>The water came, stayed, and left.</h2>
    <p class="lede">${esc(d.closing)}</p>
    <p class="cue"><button class="link" type="button" data-go="walk">Now walk across it</button><span aria-hidden="true"></span></p>
    <p class="src">${d.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>`;
}

function walkIntroHTML() {
  const m = S.mission, q = m.question, w = S.conditions.weather;
  return `
    <p class="eyebrow">Act III · Walk it</p>
    <h2>A walk nobody has taken yet.</h2>
    <p class="lede">From the rover, ${metres(m.eva.oneWayM)} out across the boxwork ridges, over a line in the rock, and back. The ground, the photographs and the slopes are real. The only thing we invented is you.</p>
    <dl class="facts">
      <div><dt>${metres(m.eva.oneWayM)}</dt><dd>each way, on ground a rover already drove</dd></div>
      <div><dt>${stops().length - 1} stops</dt><dd>each one a real place it worked</dd></div>
      <div><dt>${mins(S.plan.tl.end.t)}</dt><dd>outside, on 8 hours of air</dd></div>
    </dl>
    <div class="note"><b>${esc(q.title)}</b>${esc(q.text)}<small>${esc(q.factCheck)}</small></div>
    <p class="fine">The rover’s latest published weather report from this area, Mars day ${num(w.sol)} (${esc(new Date(w.earthDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}): high ${w.airMaxC}°C, low ${w.airMinC}°C, air pressure ${num(w.pressurePa)} pascals (less than 1% of Earth’s), sky ${esc(String(w.sky).toLowerCase())}.</p>
    <p class="fine">The height is stretched twice so the ridges are easy to read. Drag the ground to look around.</p>
    ${sourcesLine(q.sources)}`;
}

function stopHTML(k) {
  const wp = stops()[k], p = wp.plain;
  const leg = k ? legInfo(k) : null;
  const key = wp.id, gh = ghost(S.story.pairs[key]);
  const note = S.story.mapNotes[key];
  return `
    <p class="eyebrow">${k ? `Stop ${k} of ${stops().length - 1} · ${mins(leg.min)} walk · ${leg.word}` : 'The start · the rover'}</p>
    <h2>${esc(p.title)}</h2>
    <p class="place">${esc(wp.name)}</p>
    <figure class="photo">
      <img src="${esc(wp.pov.imageUrl)}" alt="${esc(p.see)}" loading="lazy" referrerpolicy="no-referrer">
      <figcaption>What you will see: ${esc(p.see)} Photographed by Curiosity on ${esc(wp.pov.utc.slice(0, 10))}. ${esc(wp.pov.credit)}</figcaption>
    </figure>
    <p class="lede">${esc(wp.story)}</p>
    <div class="echo"><span>Remember ${esc(gh.name)}</span><p>${esc(S.story.rhymes[key])}</p></div>
    <h3>Your job here${wp.plannedStayMin ? ` · ${wp.plannedStayMin} min` : ''}</h3>
    <ul class="jobs">${p.do.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <details><summary>Why this rock matters</summary><p>${esc(p.why)}</p>
      ${wp.earthNamesakes.length ? `<p class="fine">Named after a place on Earth: ${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">see ${esc(n.name)} from orbit</a>`).join(' · ')}</p>` : ''}
    </details>
    ${note ? `<p class="onmap"><b>On the map</b>${esc(note.text)}</p>` : `<p class="onmap"><b>On the map</b>${esc(S.story.mapNotes.DOCK.text)}</p>`}
    ${sourcesLine(wp.science.sources)}`;
}

function homeHTML() {
  const far = stops()[stops().length - 1];
  const direct = S.returnField.cost[cellOf(far)] / 60;
  return `
    <p class="eyebrow">Before you turn around</p>
    <h2>The way home</h2>
    <p class="lede">The first question on any walk is not “what will I find?” It is “can I get back?”</p>
    <p>Every point on this map knows the answer. The white lines are five minutes of walking apart, measured over the real slopes. From the far end, the rover is <b>${mins(direct)}</b> away on foot.</p>
    <div class="echo"><span>Remember Opportunity</span><p>${esc(S.story.rhymes.HOME)}</p></div>
    <h3>Practise the bad day</h3>
    <p>The Sun sometimes throws out a burst of radiation. With no thick air or magnetic field to stop it, an astronaut on Mars has to act fast.</p>
    <p style="margin-top:18px"><button class="btn btn--storm" id="btn-storm" type="button" aria-pressed="false">Start the drill: a solar storm arrives</button></p>
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
      <button class="choice" type="button" data-via="direct" ${S.homeVia === 'direct' ? 'aria-pressed="true"' : ''}>
        <b>Take the white line</b>
        <span>${mins(d.direct.min)} to the rover · ${d.direct.dose.toFixed(2)} mSv. Redcairn just drew it: the quickest safe ground home.</span>
      </button>
      <button class="choice" type="button" data-via="trail" ${S.homeVia === 'trail' ? 'aria-pressed="true"' : ''}>
        <b>Go back the way you came</b>
        <span>${mins(d.trail.min)} to the rover · ${d.trail.dose.toFixed(2)} mSv.</span>
      </button>
      <p>The new line cuts the dose by <b>${less}%</b>. Could you shelter behind a hill instead? The purple patches show where the ground hides part of the sky. The best spot here blocks only ${Math.round(best.blocked * c.shieldEff * 100)}% of the radiation. Not enough. Go home.</p>
    </div>`;
}

function cairnSVG() {
  return `<svg class="cairn" viewBox="0 0 140 150" aria-hidden="true">${ORDER.map((id, i) =>
    `<ellipse data-s="${id}" cx="70" cy="${136 - i * 15}" rx="${(50 - i * 4.2).toFixed(1)}" ry="8.5" class="${S.stones.has(id) ? 'on' : ''}"/>`).join('')}</svg>`;
}

function endHTML() {
  const kinds = [['Sharp photos from orbit', 'Mars Reconnaissance Orbiter'], ['Height and slope', 'MRO, Mars Global Surveyor, Mars Express'], ['Water minerals seen from orbit', 'MRO, Mars Express'],
    ['Geologic map', 'USGS'], ['Rock chemistry on the ground', 'Curiosity'], ['Radiation and weather', 'Curiosity'], ['Eye-level photos', 'Curiosity']];
  return `
    <p class="eyebrow">Back at the rover</p>
    <h2>You are home.</h2>
    <dl class="facts">
      <div><dt id="e-time">—</dt><dd>outside</dd></div>
      <div><dt id="e-jobs">—</dt><dd>jobs done</dd></div>
      <div><dt id="e-air">—</dt><dd>of air still in the tanks</dd></div>
    </dl>
    <p class="lede">In your sample bag is rock from both sides of a line that marks when this part of Mars began to dry. On Earth, it will help answer how long water lasted under this mountain.</p>
    <div class="echo"><span>Remember Curiosity</span><p>${esc(S.story.rhymes.END)}</p></div>
    <h3>Leave a stone</h3>
    <p>On Earth, travellers add a stone to a cairn to say: I was here, and so were you. Add one for each machine that made this walk possible.</p>
    <div class="stones">
      ${cairnSVG()}
      <div class="stones__btns" id="stone-btns">${ORDER.map((id) => `<button type="button" data-stone="${id}" aria-pressed="${S.stones.has(id)}">${esc(ghost(id).name)}</button>`).join('')}</div>
    </div>
    <p class="stones__done" id="stones-done" ${S.stones.size === ORDER.length ? '' : 'hidden'}>Nobody is forgotten.</p>
    <p class="closing">The rover could not come home. Its last job is to make sure you can.</p>
    <h3>What this guide is made of</h3>
    <ul class="made-of">${kinds.map(([a, b]) => `<li>${esc(a)}<span>${esc(b)}</span></li>`).join('')}</ul>
    <p style="margin-top:18px"><button class="link" id="about-2" type="button">Every source, and how AI was used</button> · <button class="link" type="button" data-go="hero">Back to the start</button></p>`;
}

function renderEnd() {
  const tl = S.finalTl || S.plan.tl;
  $('e-time').textContent = mins(tl.end.t);
  $('e-jobs').textContent = `${stops().reduce((n, w) => n + w.plain.do.length, 0)}`;
  $('e-air').textContent = mins(tl.end.o2 - S.mission.suit.oxygen.reserveMin);
}

function renderDrill() {
  const el = $('drill');
  if (!el) return;
  el.innerHTML = drillHTML();
  const b = $('btn-storm');
  b.setAttribute('aria-pressed', String(S.env.spe));
  b.textContent = S.env.spe ? 'End the drill' : 'Start the drill: a solar storm arrives';
}

// ---------- the storm drill ----------
function toggleStorm(silent) {
  S.env.spe = !S.env.spe;
  S.returnField = S.router.field(S.dockIdx, { mode: 'fastest', doseAware: S.env.spe, shieldEff: cfg().shieldEff });
  S.stage.setHome(S.returnField);
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
    S.stage.drawReturn(direct.pts);
  } else {
    S.drill = null; S.finalTl = null; S.homeVia = 'trail';
    S.stage.drawReturn(null);
  }
  if (!silent) {
    S.layerOn = new Set(S.env.spe ? ['home', 'shield'] : ['home']);
    applyLayers();
    renderDrill();
    renderEnd();
  }
}

// ---------- the beats ----------
const view = {
  overview: () => ({ ...S.mission.site.center, dist: 1250, polar: 52, az: 190 }),
  stop: (k) => ({ lon: stops()[k].lon, lat: stops()[k].lat, dist: 440, polar: 60, az: [188, 176, 166, 172, 184, 194][k] }),
  back: (far) => ({ ...S.mission.site.center, dist: far ? 1500 : 1250, polar: far ? 46 : 54, az: far ? -14 : 8 }),
};

function toWalk(o) {
  S.layerOn = new Set(o.layers || []);
  applyLayers();
  S.stage.flyWalk(o.view, !S.walkInit);
  S.walkInit = true;
  S.stage.markStops(o.here ?? -1, o.reached ?? 0);
  S.stage.drawReturn(o.ret ? o.ret.pts : null);
  moveTo(o.tl || S.plan.tl, o.t, !!o.follow);
}

function buildBeats() {
  const B = [];
  const gl = (g, dist) => () => S.stage.focusGlobe(g, dist);
  B.push({ id: 'hero', act: 0, stage: 'globe', cls: 'beat--hero', html: heroHTML(), enter: () => S.stage.focusGlobe(null) });
  ORDER.forEach((id, n) => {
    const g = ghost(id);
    B.push({ id, act: 1, stage: 'globe', html: ghostHTML(g, n), enter: gl(g, id === 'curiosity' ? 2.3 : 2.9) });
  });
  B.push({ id: 'bridge', act: 1, stage: 'globe', html: bridgeHTML(), enter: gl(ghost('curiosity'), 1.8) });

  B.push({ id: 'crater', act: 2, stage: 'crater', html: craterHTML(), enter: () => S.crater.show('wide') });
  B.push({ id: 'line', act: 2, stage: 'crater', html: lineHTML(), enter: () => S.crater.show('line') });

  const layers = S.strata.layers;
  B.push({ id: 'strata', act: 2, stage: 'stack', html: strataIntroHTML(), enter: () => {
    S.stack.highlight(-1); S.stack.explode(0);
    clearTimeout(S.explodeTimer); S.explodeTimer = setTimeout(() => S.stack.explode(1), 500);
  } });
  layers.forEach((l, i) => B.push({ id: `strata-${i}`, act: 2, stage: 'stack', html: strataLayerHTML(l, i), enter: () => { clearTimeout(S.explodeTimer); S.stack.explode(1); S.stack.highlight(i); } }));
  B.push({ id: 'strata-end', act: 2, stage: 'stack', html: strataCloseHTML(), enter: () => { S.stack.explode(1); S.stack.highlight(-1); } });

  const { tl, arr, dep } = S.plan, last = stops().length - 1;
  B.push({ id: 'walk', act: 3, stage: 'walk', html: walkIntroHTML(), enter: () => toWalk({ view: view.overview(), layers: ['slope'], t: 0, here: -1, reached: 0 }) });
  stops().forEach((wp, k) => {
    const note = S.story.mapNotes[wp.id];
    B.push({ id: `stop-${k}`, act: 3, stage: 'walk', html: stopHTML(k), enter: () => toWalk({ view: view.stop(k), layers: note ? note.layers : [], t: arr[k].t, here: k, reached: k, follow: true }) });
  });
  B.push({ id: 'home', act: 3, stage: 'walk', kind: 'home', html: homeHTML(), enter: () => {
    toWalk({ view: view.back(false), layers: S.env.spe ? ['home', 'shield'] : ['home'], t: dep[last].t, here: last, reached: last + 1, ret: S.finalTl });
    renderDrill();
  } });
  B.push({ id: 'end', act: 3, stage: 'walk', kind: 'end', cls: 'beat--end', html: endHTML(), enter: () => {
    const useTl = S.finalTl || tl;
    toWalk({ view: view.back(true), layers: S.env.spe ? ['home'] : [], t: useTl.end.t, tl: useTl, here: -1, reached: last + 1, ret: S.finalTl });
    renderEnd();
  } });
  return B;
}

function activate(i) {
  if (i === S.beat) return;
  const b = S.beats[i];
  S.beat = i;
  S.beats.forEach((x, j) => x.el.toggleAttribute('data-active', j === i));
  document.body.dataset.stage = b.stage;
  S.stage.setMode(b.stage === 'globe' ? 'globe' : b.stage === 'walk' ? 'walk' : 'none');
  if (S.env.spe && b.kind !== 'home' && b.kind !== 'end') { toggleStorm(true); renderDrill(); }
  for (const a of $('acts').children) a.toggleAttribute('aria-current', Number(a.dataset.act) === b.act);
  b.enter();
}

function scrollToBeat(id) {
  const el = $(`b-${id}`);
  if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// ---------- about ----------
function aboutHTML() {
  const m = S.mission;
  const src = (id) => m.sources.find((s) => s.id === id);
  return `
    <section>
      <h3>The challenge</h3>
      <p>Built for the 2026 NASA International Space Apps Challenge, theme “The Next Frontier”, in answer to <b>Interplanetary Survival Guide: Martian Map</b>: a layered, hyper-local view of a route on Mars that a human explorer could plan and walk. An independent student project, not affiliated with or endorsed by NASA.</p>
    </section>
    <section>
      <h3>The resources we were given, and what each one does here</h3>
      <ul>${m.anchorResources.map((a) => `<li><b><a href="${esc(src(a.source).url)}" target="_blank" rel="noopener">${esc(a.name)}</a></b>${esc(a.role)}</li>`).join('')}</ul>
      <div class="live" id="m2020-live"></div>
    </section>
    <section>
      <h3>Every layer, and where it comes from</h3>
      <div class="tablewrap"><table><thead><tr><th>Layer</th><th>Kind of data</th><th>Mission or source</th></tr></thead><tbody>
        <tr><td>Ground photograph (always on)</td><td>Optical</td><td>Mars Reconnaissance Orbiter · HiRISE, 25 cm, via Mars Trek</td></tr>
        <tr><td>The globe</td><td>Optical, true colour</td><td>Viking orbiters · MDIM 2.1 colour mosaic, via Mars Trek, stitched in Blender</td></tr>
        <tr><td>Gale crater and Mount Sharp in 3D</td><td>Topographic + optical</td><td>Mars Global Surveyor · MOLA and Mars Express · HRSC elevation, Viking colour, via Mars Trek; rendered in Blender</td></tr>
        <tr><td>Curiosity’s whole track and odometry</td><td>Ground truth</td><td>Curiosity team traverse and waypoint data, current to sol ${num(S.gale.rover.latestSol)}</td></tr>
        <tr><td>Water minerals on the globe</td><td>Spectral</td><td>MRO · CRISM and Mars Express · OMEGA, via Mars Trek</td></tr>
        ${LAYERS.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.kind)}</td><td>${esc(l.from)}</td></tr>`).join('')}
        <tr><td>Weather at the site</td><td>Atmospheric</td><td>Curiosity · REMS</td></tr>
        <tr><td>Photo at each stop</td><td>Optical, from the ground</td><td>Curiosity · navigation cameras</td></tr>
        <tr><td>The six rock layers</td><td>Geologic</td><td>NASA Gale crater guide and Curiosity science team reports</td></tr>
      </tbody></table></div>
    </section>
    <section>
      <h3>What is real and what is simulated</h3>
      <p><b>Real:</b> the ground, its height and slopes, the route (the rover’s own track), the photographs, the rock findings, the weather report, the normal radiation rate, the measured effect of terrain on radiation, and every date and figure about the machines. Our height model matches the rover’s own measurements to within ${esc(S.route.summary.demVsRoverRmsResidualM)} m along the route.</p>
      <p style="margin-top:8px"><b>Simulated:</b> the suit (air, walking pace), the walker’s position, the solar storm (made ${cfg().speMultiplier} times stronger than normal so the drill is easy to follow), and the “how wet” line on the rock layers, which is a simplified picture, not a measurement. Layer thicknesses are exaggerated for reading, and the ground is stretched twice vertically.</p>
      <p style="margin-top:8px"><b>A correction we want to be clear about:</b> ${esc(m.question.factCheck)} And the line “My battery is low and it’s getting dark”, often said to be Opportunity’s last words, was a reporter’s poetic reading of its last data. The rover sent no words.</p>
    </section>
    <section>
      <h3>The machines</h3>
      <div class="tablewrap"><table><tbody>${ORDER.map((id) => { const g = ghost(id); return `<tr><td><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a></td><td>${esc(g.place)}</td><td>${esc(g.landed)} to ${esc(g.lastHeard)}</td></tr>`; }).join('')}</tbody></table></div>
    </section>
    <section>
      <h3>How it is built</h3>
      <p>Small scripts in the project fetch public mission data and bake it into files. Blender, run headless from scripts in the repo, stitches the globe, renders Gale crater from real elevation and projects Curiosity’s track into that picture, and builds the orbital photograph of the walk site. Your browser then works out slope, shelter, walking time and the way home for ${S.terrain.size.toLocaleString('en-US')} patches of ground, with no server, and draws it with Three.js. No build step.</p>
    </section>
    <section>
      <h3>All sources</h3>
      <div class="tablewrap"><table><tbody>${m.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.org)}</td><td>${esc(s.use)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section>
      <h3>How AI was used</h3>
      <p>${esc(m.aiDisclosure)}</p>
    </section>`;
}

function openAbout() {
  $('about-body').innerHTML = aboutHTML();
  $('about').showModal();
  fetchJson(S.mission.liveFeeds.perseveranceLatest).then((d) => {
    const im = d.images && d.images[0];
    if (im && $('m2020-live')) {
      $('m2020-live').innerHTML = `<img src="${esc(im.image_files.medium)}" alt="Latest navigation camera frame from the Perseverance rover" referrerpolicy="no-referrer">
        <p class="src">Live: the newest picture from the other working rover, Perseverance, at Jezero crater. Mars day ${esc(im.sol)} (${esc(im.date_taken_utc.slice(0, 10))}). ${esc(im.credit)}</p>`;
    }
  }).catch(() => {});
}

// ---------- stones ----------
function toggleStone(id) {
  if (S.stones.has(id)) S.stones.delete(id); else S.stones.add(id);
  try { localStorage.setItem('redcairn.stones', JSON.stringify([...S.stones])); } catch (e) { /* private mode */ }
  document.querySelector(`.cairn [data-s="${id}"]`)?.classList.toggle('on', S.stones.has(id));
  document.querySelector(`[data-stone="${id}"]`)?.setAttribute('aria-pressed', String(S.stones.has(id)));
  $('stones-done').hidden = S.stones.size !== ORDER.length;
}

// ---------- boot ----------
async function boot() {
  const [mission, route, conditions, story, strata, gale, galeView] = await Promise.all([
    fetchJson('data/mission.json'), fetchJson('data/route.json'), fetchJson('data/conditions.json'), fetchJson('data/story.json'), fetchJson('data/strata.json'),
    fetchJson('data/gale.json'), fetchJson('data/gale-view.json'),
  ]);
  Object.assign(S, { mission, route, conditions, story, strata, gale, galeView });
  // Curiosity is still driving: its count comes from the team's own odometry file, not from us.
  const cur = story.ghosts.find((g) => g.id === 'curiosity');
  if (cur) cur.worked = gale.rover.latestSol;
  try { S.stones = new Set(JSON.parse(localStorage.getItem('redcairn.stones') || '[]')); } catch (e) { S.stones = new Set(); }
  S.limits = { caution: mission.suit.slopeLimitsDeg.caution, noGo: mission.suit.slopeLimitsDeg.noGo };
  S.terrain = await Terrain.load('data/terrain.json', S.limits);
  S.router = new Router(S.terrain, mission.suit);
  S.dockIdx = cellOf(stops()[0]);
  S.returnField = S.router.field(S.dockIdx, { mode: 'fastest' });
  buildPlan();

  S.stage = new Stage($('gl'), $('pins'), { terrain: S.terrain, route, mission });
  S.stage.setHome(S.returnField);
  S.stage.setGhosts(story.ghosts, (id) => scrollToBeat(id));
  S.stage.addDots(conditions.hydrousMinerals.points, 'curiosity', 'Water-formed minerals seen from orbit');
  S.stage.onStop = (k) => scrollToBeat(`stop-${k}`);

  S.crater = new Crater($('crater'), galeView, gale, stops());
  S.stack = buildStack($('stack-svg'), S.strata.layers, 's');
  S.mini = buildStack($('mini-svg'), S.strata.layers, 'm');
  S.mini.highlight(3);
  $('mini-note').innerHTML = 'You are on page 4 of 6, the sulfate-bearing rock: the page where the water was leaving. <button class="link" type="button" data-go="strata">Read the mountain</button>';
  $('stack-svg').addEventListener('click', (e) => { const g = e.target.closest('.slab'); if (g) scrollToBeat(`strata-${g.dataset.i}`); });

  S.beats = buildBeats();
  $('story').innerHTML = S.beats.map((b, i) => `<section class="beat ${b.cls || ''}" id="b-${b.id}" data-i="${i}"><div class="card">${b.html}</div></section>`).join('');
  S.beats.forEach((b) => { b.el = $(`b-${b.id}`); });

  $('acts').innerHTML = ACTS.map((a, i) => `<button type="button" data-act="${i + 1}" data-go="${a.go}"><i>${['I', 'II', 'III'][i]}</i>${esc(a.name)}</button>`).join('');
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) return scrollToBeat(go.dataset.go);
    if (e.target.closest('#btn-storm')) return toggleStorm();
    if (e.target.closest('#about-2')) return openAbout();
    const choice = e.target.closest('.choice');
    if (choice && S.drill) {
      S.homeVia = choice.dataset.via;
      S.finalTl = S.drill[S.homeVia].tl;
      S.stage.drawReturn(S.finalTl.pts);
      renderDrill(); renderEnd();
      return;
    }
    const stone = e.target.closest('[data-stone]');
    if (stone) return toggleStone(stone.dataset.stone);
    const chip = e.target.closest('#chips button');
    if (chip) {
      const id = chip.dataset.layer;
      if (S.layerOn.has(id)) S.layerOn.delete(id); else S.layerOn.add(id);
      applyLayers();
    }
  });
  $('btn-about').addEventListener('click', openAbout);

  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) activate(Number(e.target.dataset.i)); }, { rootMargin: '-45% 0px -45% 0px' });
  S.beats.forEach((b) => io.observe(b.el));
  const prog = $('progress');
  const onScroll = () => { const h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${h > 0 ? clamp(scrollY / h, 0, 1) : 0})`; };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  activate(0);
  document.body.removeAttribute('data-booting');
}

boot().catch((err) => {
  console.error(err);
  $('boot-text').textContent = `Could not start: ${err.message}`;
});
