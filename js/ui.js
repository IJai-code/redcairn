// Panels: telemetry, waypoint card, plan summary, alerts, profile strip, briefing and attribution.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtHM(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
export function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
export function fmtClock(min) {
  const s = Math.max(0, Math.floor(min * 60));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
export const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

const CLASS_COLORS = ['#3ddc84', '#ffb020', '#ff4d4d'];
const CLASS_NAMES = ['safe', 'caution', 'no-go'];

export function setSegment(el, attr, value) {
  for (const b of el.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset[attr] === String(value)));
}

// ---------- layers ----------
export function renderLayers(defs, onChange) {
  const host = $('layers');
  host.innerHTML = defs.map((d) => `
    <div class="layer" data-layer="${d.id}">
      <label class="layer__row">
        <input type="checkbox" ${d.on ? 'checked' : ''} aria-label="${esc(d.name)}">
        <span class="switch" aria-hidden="true"></span>
        <span class="layer__name">${esc(d.name)}<span class="layer__src">${esc(d.src)}</span></span>
      </label>
      <div class="layer__body" ${d.on ? '' : 'hidden'}>
        ${d.legend ? `<div class="legend">${d.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}</div>` : ''}
        ${d.blend ? `<input type="range" min="10" max="100" value="${Math.round(d.opacity * 100)}" aria-label="${esc(d.name)} opacity">` : ''}
      </div>
    </div>`).join('');
  for (const row of host.querySelectorAll('.layer')) {
    const id = row.dataset.layer;
    const box = row.querySelector('input[type="checkbox"]');
    const range = row.querySelector('input[type="range"]');
    const body = row.querySelector('.layer__body');
    const emit = () => onChange(id, box.checked, range ? range.value / 100 : null);
    box.addEventListener('change', () => { body.hidden = !box.checked; emit(); });
    if (range) range.addEventListener('input', emit);
  }
}

// ---------- plan summary ----------
export function renderSummary(s, suit) {
  const o2Primary = s.o2EndMin - suit.oxygen.reserveMin;
  $('plan-summary').innerHTML = [
    ['Round trip', fmtM(s.distanceM)],
    ['EVA time', fmtDur(s.durationMin)],
    ['Max slope', `${s.maxSlopeDeg.toFixed(1)}°`],
    ['O₂ at dock', `${fmtHM(o2Primary)} <small>left</small>`],
    ['Dose', `${s.doseMSv.toFixed(2)} <small>mSv</small>`],
    ['Tightest margin', `${fmtHM(s.minMarginMin)}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const note = $('plan-note');
  const msgs = [];
  if (s.nogoPts) msgs.push('This route crosses no-go terrain. No safe line exists at these limits.');
  else if (s.cautionPts) msgs.push(`${s.cautionPts * 5} m of this route is on caution-class slope.`);
  if (s.besideNogoPts) msgs.push(`Steep ground lies beside the line at ${s.besideNogoPts} points. Stay on it.`);
  if (s.minMarginMin < 60) msgs.push('Walk-back margin drops under one hour.');
  note.hidden = msgs.length === 0;
  note.textContent = msgs.join(' ');
}

// ---------- telemetry ----------
export function renderVitals(v, suit) {
  const total = suit.oxygen.primaryMin + suit.oxygen.reserveMin;
  const primary = v.o2 - suit.oxygen.reserveMin;
  $('o2-num').textContent = fmtHM(primary);
  $('o2-bar').style.width = `${Math.max(0, Math.min(100, (v.o2 / total) * 100))}%`;
  $('o2-reserve').style.left = `${(suit.oxygen.reserveMin / total) * 100}%`;
  $('o2-sub').textContent = primary <= 0 ? 'ON RESERVE' : `burn ×${v.o2Rate.toFixed(2)} · reserve ${suit.oxygen.reserveMin} min`;
  $('v-o2').dataset.level = primary <= 0 ? 'warning' : primary < 60 ? 'caution' : '';

  const pct = Math.max(0, v.batt * 100);
  $('batt-num').textContent = pct.toFixed(0);
  $('batt-bar').style.width = `${pct}%`;
  $('batt-sub').textContent = `${fmtHM(v.batt * suit.battery.capacityMin)} at current load`;
  $('v-batt').dataset.level = pct < 10 ? 'warning' : pct < 25 ? 'caution' : '';

  $('pace-num').textContent = v.moving ? v.paceKmh.toFixed(1) : '0.0';
  $('pace-sub').innerHTML = v.moving
    ? `slope ${v.slope >= 0 ? '+' : '−'}${Math.abs(v.slope).toFixed(1)}° · <span style="color:${CLASS_COLORS[v.cls]}">${CLASS_NAMES[v.cls]}</span>`
    : esc(v.holdText);
  $('v-pace').dataset.level = v.cls === 2 ? 'warning' : v.cls === 1 ? 'caution' : '';

  $('dose-num').textContent = v.dose.toFixed(v.dose < 1 ? 3 : 2);
  $('dose-sub').textContent = `${(v.doseRate * 1000).toFixed(0)} µSv/h · terrain shielding −${(v.shieldPct).toFixed(0)}%`;
  $('v-dose').dataset.level = v.spe ? 'warning' : '';

  $('margin-num').textContent = v.margin > 0 ? fmtHM(v.margin) : `−${fmtHM(-v.margin)}`;
  $('walkback').dataset.level = v.margin < 20 ? 'warning' : v.margin < 60 ? 'caution' : '';
  $('back-dist').textContent = fmtM(v.backDist);
  $('back-time').textContent = fmtDur(v.backMin);
  $('climb').textContent = `${v.climb >= 0 ? '+' : '−'}${Math.abs(v.climb).toFixed(0)} m`;
  $('met').textContent = fmtClock(v.t);
}

export function setStatus(level, text, why) {
  $('app').dataset.status = level;
  $('status-text').textContent = text;
  $('status-why').textContent = why || '';
}

// ---------- waypoint card ----------
export function renderWaypoint(wp, ctx) {
  const unit = ctx.units.find((u) => u.id === wp.science.unit);
  const srcs = wp.science.sources.map((id) => ctx.sources.find((s) => s.id === id)).filter(Boolean);
  const isDock = wp.type === 'dock';
  $('wp-card').innerHTML = `
    <div class="wp">
      <div class="wp__head">
        <span class="wp__id">${esc(wp.id)}</span>
        <div>
          <div class="wp__name">${esc(wp.name)}</div>
          <div class="wp__meta">${fmtM(ctx.distM)} from dock · ${ctx.climbM >= 0 ? '+' : '−'}${Math.abs(ctx.climbM).toFixed(0)} m · ${fmtDur(ctx.backMin)} walk back</div>
        </div>
      </div>
      <p class="wp__story">${esc(wp.story)}</p>
      <div class="wp__media">
        <figure>
          <img src="${esc(wp.pov.imageUrl)}" alt="Rover photo at ${esc(wp.name)}: ${esc(wp.pov.caption)}" loading="lazy" referrerpolicy="no-referrer">
          <figcaption><b>Eye level · rover sol ${wp.pov.sol}</b>${esc(wp.pov.caption)} ${esc(wp.pov.camera)}, ${esc(wp.pov.utc.slice(0, 10))}. Credit: ${esc(wp.pov.credit)}</figcaption>
        </figure>
        <figure>
          <model-viewer src="${esc(wp.model.src)}" alt="${esc(wp.model.alt)}" camera-controls touch-action="pan-y" interaction-prompt="none"
            camera-target="1.5m 1m 0m" camera-orbit="-40deg 70deg 24m" min-camera-orbit="auto auto 6m" max-camera-orbit="auto auto 110m"
            shadow-intensity="0" exposure="1.15" loading="lazy" reveal="auto"></model-viewer>
          <figcaption><b>3D terrain · true scale</b>60 m block cut from the 1 m orbital elevation model, tinted by slope class, assembled in Blender. The suited figure is 1.8 m tall.${isDock ? ' The rover is our team\'s own model, scaled to a Curiosity-class 2.9 m.' : ''} Drag to orbit, pinch or scroll to pull back to the full block.</figcaption>
        </figure>
      </div>
      <div class="wp__section">
        <span class="lbl">${isDock ? 'Why start here' : 'Why stop here'}</span>
        <p class="wp__why"><b>${esc(wp.science.headline)}.</b> ${esc(wp.science.why)}</p>
      </div>
      <div class="wp__section">
        <span class="lbl">Rock unit and targets</span>
        <div class="chips">
          ${unit ? `<span class="chip chip--unit" style="background:${unit.color}">${esc(unit.label)}</span>` : ''}
          <span class="chip">USGS unit ${esc(ctx.geologicUnit.code)}</span>
          ${wp.science.targets.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
        </div>
      </div>
      <div class="wp__section">
        <span class="lbl">Tasks · ${wp.plannedStayMin} min planned</span>
        <ul class="tasks">${wp.science.tasks.map((t, i) => `<li><input type="checkbox" id="task-${wp.id}-${i}"><label for="task-${wp.id}-${i}">${esc(t)}</label></li>`).join('')}</ul>
      </div>
      <div class="wp__section">
        <span class="lbl">Rover ground truth</span>
        <div class="chips">
          <span class="chip">Sol ${wp.rover.sol}</span>
          <span class="chip">Tilt ${wp.rover.tiltDeg.toFixed(1)}°</span>
          <span class="chip">${wp.lat.toFixed(5)}°, ${wp.lon.toFixed(5)}°E</span>
        </div>
      </div>
      ${wp.earthNamesakes.length ? `<div class="wp__section">
        <span class="lbl">Named for a place on Earth</span>
        <div class="srcs">${wp.earthNamesakes.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener">See ${esc(n.name)} from orbit in Worldview ↗</a>`).join('')}</div>
      </div>` : ''}
      <div class="wp__section">
        <span class="lbl">Sources</span>
        <div class="srcs">${srcs.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</div>
      </div>
      ${isDock ? '' : `<div class="wp__actions"><button class="btn" type="button" id="wp-set-target" ${ctx.isTarget ? 'disabled' : ''}>${ctx.isTarget ? 'Current turnaround' : 'Set as turnaround'}</button></div>`}
    </div>`;
  const btn = $('wp-set-target');
  if (btn) btn.addEventListener('click', () => ctx.onSetTarget(wp.id));
}

// ---------- alert ----------
export function renderAlert(a) {
  const el = $('alert');
  if (!a) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.dataset.level = a.level;
  el.innerHTML = `
    <div class="alert__head">
      <span class="alert__title">${esc(a.title)}</span>
      <span class="tag tag--sim">Simulated</span>
      <span class="alert__detail">${esc(a.detail)}</span>
    </div>
    ${a.options ? `<div class="alert__options">${a.options.map((o, i) => `
      <div class="option" ${o.best ? 'data-best' : ''}>
        <span class="option__name">${esc(o.name)}${o.best ? ' · recommended' : ''}</span>
        <span class="option__facts">${esc(o.facts)}</span>
        ${o.action ? `<button class="btn ${o.best ? 'btn--danger' : ''}" type="button" data-opt="${i}">${esc(o.action)}</button>` : ''}
      </div>`).join('')}</div>` : ''}`;
  for (const b of el.querySelectorAll('[data-opt]')) b.addEventListener('click', () => a.options[Number(b.dataset.opt)].run());
}

// ---------- elevation profile ----------
export function drawProfile(canvas, pts, marks, units, cursorD) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h || pts.length < 2) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 8, padT = 16, padB = 14;
  const total = pts[pts.length - 1].d;
  let zmin = Infinity, zmax = -Infinity;
  for (const p of pts) { if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z; }
  const span = Math.max(10, zmax - zmin);
  const X = (d) => padL + (d / total) * (w - padL - padR);
  const Y = (z) => h - padB - ((z - zmin) / span) * (h - padT - padB);

  // filled columns coloured by slope class
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.fillStyle = CLASS_COLORS[Math.max(pts[i].cls, pts[i + 1].cls)];
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(X(pts[i].d), h - padB); ctx.lineTo(X(pts[i].d), Y(pts[i].z));
    ctx.lineTo(X(pts[i + 1].d) + 0.6, Y(pts[i + 1].z)); ctx.lineTo(X(pts[i + 1].d) + 0.6, h - padB);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 1.5; ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p.d), Y(p.z)) : ctx.moveTo(X(p.d), Y(p.z))));
  ctx.stroke();

  // rock units along the base
  if (units) for (const u of units) { ctx.fillStyle = u.color; ctx.fillRect(X(u.from * total), h - padB + 3, X(u.to * total) - X(u.from * total), 4); }

  ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#94a0ad'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText(`+${Math.round(zmax - pts[0].z)} m`, padL - 5, Y(zmax));
  ctx.fillText('0', padL - 5, Y(pts[0].z));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const m of marks) {
    const x = X(m.d);
    ctx.strokeStyle = 'rgba(233,236,239,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT - 2); ctx.lineTo(x, h - padB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e9ecef'; ctx.fillText(m.label, Math.min(w - 14, Math.max(padL + 10, x)), 2);
  }
  if (cursorD != null) {
    const x = X(Math.min(total, cursorD));
    ctx.strokeStyle = '#ff7a45'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, padT - 2); ctx.lineTo(x, h - padB); ctx.stroke();
  }
}

// ---------- briefing ----------
export function renderBriefing(mission, facts, onStart) {
  const b = mission.briefing;
  $('brief-card').innerHTML = `
    <span class="brief__kicker">${esc(b.kicker)}</span>
    <h1>${esc(b.title)}</h1>
    ${b.body.map((p) => `<p>${esc(p)}</p>`).join('')}
    <div class="brief__facts">${facts.map(([v, k]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>
    <button class="btn btn--primary" type="button" id="brief-go">${esc(b.cta)}</button>
    <span class="brief__credit">Background: this site rendered in Blender from the 1 m orbital elevation model and HiRISE imagery (tinted). The orange line is the walk.</span>`;
  const el = $('brief');
  el.hidden = false;
  $('brief-go').addEventListener('click', () => { el.hidden = true; onStart(); });
  $('brief-go').focus();
}

// ---------- attribution ----------
export function renderAbout(mission, stats) {
  const src = (id) => mission.sources.find((s) => s.id === id);
  $('about-body').innerHTML = `
    <section>
      <h3>The five anchor resources</h3>
      <ul class="anchor">${mission.anchorResources.map((a) => {
        const s = src(a.source);
        return `<li><b><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(a.name)} ↗</a></b>${esc(a.role)}</li>`;
      }).join('')}</ul>
      <div id="m2020-live" style="margin-top:10px"></div>
    </section>
    <section>
      <h3>How it works</h3>
      <ul class="flow">
        <li><b>1 · Public mission data</b>Orbital imagery and elevation, rover track and photos, mission reports.</li>
        <li><b>2 · Build scripts</b><code>tools/build_route.py</code> and <code>tools/build_terrain.py</code> fetch and bake them into static files. Nothing is typed in by hand.</li>
        <li><b>3 · In your browser</b>${esc(stats.cells)} terrain cells: slope, sky shielding, walk-back time and least-cost routes are computed here, with no server.</li>
        <li><b>4 · Blender</b><code>tools/blender_scene.py</code> drapes the imagery on the elevation model, adds the route, cairns, a 1.8 m figure and our rover model, exports every 3D model and renders the opening image. Scene file: <code>art/redcairn.blend</code>.</li>
      </ul>
    </section>
    <section>
      <h3>What is real and what is simulated</h3>
      <p><b>Real:</b> positions, elevations, slopes, imagery, rover tilt, geologic units, mission findings, background radiation dose rate, and the measured effect of terrain shielding. The elevation model agrees with the rover's own elevations to ${esc(stats.rms)} m RMS along the route.</p>
      <p style="margin-top:6px"><b>Simulated:</b> suit oxygen, battery, pace and metabolic model; the solar particle event (dose rate exaggerated ×${esc(stats.spe)} so the response is visible in a short demo); the dust storm; the crew position. Each is labelled in the interface and editable in <code>data/mission.json</code>.</p>
    </section>
    <section>
      <h3>Data sources</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>Source</th><th>Provider</th><th>Used for</th></tr></thead>
        <tbody>${mission.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></td><td>${esc(s.org)}</td><td>${esc(s.use)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section>
      <h3>AI use</h3>
      <p>${esc(mission.aiDisclosure)}</p>
      <p style="margin-top:6px">This is an independent hackathon project. It is not affiliated with or endorsed by any space agency.</p>
    </section>`;
}

export function renderLiveFeed(img) {
  const host = $('m2020-live');
  if (!host || !img) return;
  host.innerHTML = `<figure style="margin:0;border:1px solid var(--line);max-width:420px">
    <img src="${esc(img.url)}" alt="Latest navigation camera frame from the Perseverance rover" style="display:block;width:100%" loading="lazy" referrerpolicy="no-referrer">
    <figcaption style="padding:7px 9px;font-size:11.5px;color:var(--dim)">Live: the other rover's newest frame, Jezero crater, sol ${esc(img.sol)} (${esc(img.date)}). Credit: ${esc(img.credit)}</figcaption>
  </figure>`;
}

export function renderSite3D() {
  const host = $('site3d-body');
  if (host.firstChild) return;
  host.innerHTML = `<model-viewer src="assets/models/site.glb" alt="3D model of the EVA site with the route and six cairns" camera-controls touch-action="pan-y"
      interaction-prompt="none" camera-orbit="20deg 62deg auto" shadow-intensity="0" exposure="1.1" auto-rotate rotation-per-second="6deg"></model-viewer>
    <p>True-scale terrain from the 1 m orbital elevation model, draped with HiRISE imagery (greyscale data, tinted). The orange line is the walk; the cairns mark the six stops and are drawn 14 m tall so they read at this scale. Built in Blender.</p>`;
}
