// Map view: orbital photos, mission data layers, the trail and its stops.
// Leaflet is loaded as a global from index.html.

import { M_PER_DEG } from './terrain.js';

const L = window.L;
const CLASS_COLORS = ['#5fe39a', '#ffc23a', '#ff5a3c'];

function paint(terrain, fn) {
  const c = document.createElement('canvas');
  c.width = terrain.cols;
  c.height = terrain.rows;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(terrain.cols, terrain.rows);
  for (let i = 0; i < terrain.size; i++) fn(i, img.data, i * 4);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export class MapView {
  constructor(el, mission, terrain) {
    this.el = el;
    this.mission = mission;
    this.terrain = terrain;
    this.bounds = L.latLngBounds([terrain.south, terrain.west], [terrain.north, terrain.east]);
    this.layers = {};
    this.pins = new Map();
    this.onStop = () => {};
    this.onView = () => {};

    this.map = L.map(el, { crs: L.CRS.EPSG4326, minZoom: 6, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5 });
    this.map.attributionControl.setPrefix(false);

    const z = { ctx: 201, hirise: 202, mola: 210, thermal: 211, geology: 212, relief: 250, slope: 260, shield: 270, home: 280,
      minerals: 405, rocks: 410, track: 415, curiosity: 417, route: 420, ret: 430 };
    for (const [name, zi] of Object.entries(z)) this.map.createPane(name).style.zIndex = zi;

    // Orbital photos are always on: wide context underneath, the sharp mosaic on top.
    for (const b of mission.basemaps) {
      const base = b.id === 'hirise' || b.id === 'ctx';
      const layer = L.tileLayer(b.url, {
        pane: b.id, tileSize: 256, minZoom: 0, maxNativeZoom: b.maxNativeZoom, maxZoom: 19, noWrap: true,
        bounds: b.bounds ? [[b.bounds.south, b.bounds.west], [b.bounds.north, b.bounds.east]] : undefined,
        opacity: base ? 1 : 0.75, attribution: `${b.label}: ${b.credit}`,
      });
      if (base) layer.addTo(this.map); else this.layers[b.id] = layer;
    }
    for (const name of ['rocks', 'track', 'minerals', 'shelters', 'curiosity']) this.layers[name] = L.layerGroup();
    this.routeGroup = L.layerGroup().addTo(this.map);
    this.retGroup = L.layerGroup().addTo(this.map);

    const c = mission.site.center;
    const sitePin = L.divIcon({ className: '', html: '<span class="site-pin">Your walk</span>', iconSize: null, iconAnchor: [90, 10] });
    L.marker([c.lat, c.lon], { icon: sitePin, interactive: false, keyboard: false }).addTo(this.map);

    this.map.on('zoomend moveend resize', () => this.#onMove());
    this.setView('walk', false);
  }

  #onMove() {
    this.el.toggleAttribute('data-far', this.map.getZoom() < 13.5);
    const bar = document.getElementById('scale-bar'), text = document.getElementById('scale-text');
    const c = this.map.getCenter();
    const p = this.map.latLngToContainerPoint(c);
    const q = this.map.containerPointToLatLng([p.x + 100, p.y]);
    const per100 = Math.abs(q.lng - c.lng) * M_PER_DEG * Math.cos(c.lat * Math.PI / 180);
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].reduce((a, b) => (b <= per100 * 1.2 ? b : a), 1);
    bar.style.width = `${Math.round((nice / per100) * 100)}px`;
    text.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  }

  setView(name, animate = true) {
    const b = this.mission.views[name].bounds;
    const wide = this.el.clientWidth > 700;
    this.map.flyToBounds([[b.south, b.west], [b.north, b.east]], {
      animate, duration: 1.4,
      paddingTopLeft: [20, 60], paddingBottomRight: [wide ? 400 : 20, wide ? 30 : Math.round(this.el.clientHeight * 0.48)],
    });
    this.view = name;
    this.onView(name);
  }

  // ---- layers computed from the elevation grid ----
  #raster(name, url, opacity) {
    const was = this.layers[name];
    const on = was && this.map.hasLayer(was);
    if (was) this.map.removeLayer(was);
    this.layers[name] = L.imageOverlay(url, this.bounds, { pane: name, opacity: was ? was.options.opacity : opacity, interactive: false });
    if (on) this.layers[name].addTo(this.map);
  }

  buildRasters() {
    const t = this.terrain;
    const rgb = [[47, 138, 87, 0], [224, 161, 27, 200], [215, 64, 47, 225]];
    this.#raster('slope', paint(t, (i, px, o) => {
      const c = rgb[t.cls[i]];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3];
    }), 0.75);

    const az = (315 * Math.PI) / 180, alt = (38 * Math.PI) / 180, zf = 2.5;
    const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
    this.#raster('relief', paint(t, (i, px, o) => {
      const y = Math.floor(i / t.cols), x = i - y * t.cols;
      const xm = Math.max(0, x - 1), xp = Math.min(t.cols - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(t.rows - 1, y + 1);
      const dzdx = ((t.z[y * t.cols + xp] - t.z[y * t.cols + xm]) / ((xp - xm) * t.cellX)) * zf;
      const dzdn = ((t.z[ym * t.cols + x] - t.z[yp * t.cols + x]) / ((yp - ym) * t.cellY)) * zf;
      const v = Math.max(0, (-dzdx * lx - dzdn * ly + lz) / Math.sqrt(dzdx * dzdx + dzdn * dzdn + 1));
      const g = Math.round(40 + v * 215);
      px[o] = g; px[o + 1] = Math.round(g * 0.9); px[o + 2] = Math.round(g * 0.78); px[o + 3] = 255;
    }), 0.8);

    const top = Math.max(0.12, t.maxShield * 0.8);
    this.#raster('shield', paint(t, (i, px, o) => {
      const v = Math.min(1, t.shield[i] / top);
      px[o] = 125; px[o + 1] = 80; px[o + 2] = 220; px[o + 3] = Math.round(v * v * 240);
    }), 0.85);
  }

  // One white line for every five minutes of walking back to the dock.
  buildHome(field) {
    const t = this.terrain;
    const band = (i) => (Number.isFinite(field.cost[i]) ? Math.floor(field.cost[i] / 300) : -1);
    this.#raster('home', paint(t, (i, px, o) => {
      const y = Math.floor(i / t.cols), x = i - y * t.cols;
      if (x >= t.cols - 1 || y >= t.rows - 1) return;
      const b = band(i);
      if (b === band(i + 1) && b === band(i + t.cols)) return;
      const major = Math.max(b, band(i + 1), band(i + t.cols)) % 3 === 0;
      px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; px[o + 3] = major ? 245 : 140;
    }), 0.9);
  }

  drawStatic(route, conditions, shelters, eff) {
    const rocks = this.layers.rocks.clearLayers();
    for (const unit of this.mission.layers.minerals.units) {
      const pts = route.eva.filter((v) => v.distM >= unit.routeFromM - 2.5 && v.distM <= unit.routeToM + 2.5).map((v) => [v.lat, v.lon]);
      if (pts.length > 1) L.polyline(pts, { pane: 'rocks', color: unit.color, weight: 30, opacity: 0.6, lineCap: 'butt', interactive: false }).addTo(rocks);
    }
    L.polyline(route.roverTrack.map((p) => [p[1], p[0]]), { pane: 'track', color: '#fff', weight: 1.5, opacity: 0.9, dashArray: '2 5', interactive: false }).addTo(this.layers.track.clearLayers());
    const mins = this.layers.minerals.clearLayers();
    for (const p of conditions.hydrousMinerals.points) {
      L.circleMarker([p.lat, p.lon], { pane: 'minerals', radius: 9, color: '#fff', weight: 2, fillColor: '#2b9fd6', fillOpacity: 0.9 })
        .bindTooltip(`Water-formed minerals, detected by ${p.instrument}`).addTo(mins);
    }
    const sh = this.layers.shelters.clearLayers();
    for (const s of shelters) {
      const icon = L.divIcon({ className: '', html: `<span class="shelter">${Math.round(s.blocked * eff * 100)}% less radiation</span>`, iconSize: null, iconAnchor: [50, 10] });
      L.marker([s.lat, s.lon], { icon, interactive: false, keyboard: false }).addTo(sh);
    }
  }

  // Curiosity's whole drive, landing to today: the route its team planned up Mount Sharp, as driven.
  drawTraverse(gale) {
    const g = this.layers.curiosity.clearLayers();
    const line = gale.traverse.map((p) => [p[1], p[0]]);
    L.polyline(line, { pane: 'curiosity', color: '#1c1612', weight: 6, opacity: 0.6, interactive: false }).addTo(g);
    L.polyline(line, { pane: 'curiosity', color: '#ff8a4c', weight: 3, interactive: false }).addTo(g);
    const tag = (ll, text, anchor) => L.marker(ll, { icon: L.divIcon({ className: '', html: `<span class="map-tag">${text}</span>`, iconSize: null, iconAnchor: anchor }), interactive: false, keyboard: false }).addTo(g);
    tag([gale.rover.landing[1], gale.rover.landing[0]], 'Curiosity landed · Aug 2012', [-10, 26]);
    tag([gale.rover.latest[1], gale.rover.latest[0]], `Curiosity today · sol ${gale.rover.latestSol.toLocaleString('en-US')}`, [-10, -8]);
  }

  setLayer(name, on, opacity) {
    const layer = this.layers[name];
    if (!layer) return;
    if (on) layer.addTo(this.map); else this.map.removeLayer(layer);
    if (opacity != null) {
      if (layer.setOpacity) layer.setOpacity(opacity); else this.map.getPane(name).style.opacity = opacity;
    }
    if (name === 'shield') { if (on) this.layers.shelters.addTo(this.map); else this.map.removeLayer(this.layers.shelters); }
  }

  drawRoute(pts, colourBySlope) {
    const g = this.routeGroup.clearLayers();
    L.polyline(pts.map((p) => [p.lat, p.lon]), { pane: 'route', color: '#1c1612', weight: 8, opacity: 0.7, interactive: false }).addTo(g);
    if (!colourBySlope) {
      L.polyline(pts.map((p) => [p.lat, p.lon]), { pane: 'route', color: '#ff8a4c', weight: 4, interactive: false }).addTo(g);
      return;
    }
    let start = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i === pts.length || pts[i].cls !== pts[start].cls) {
        const seg = pts.slice(Math.max(0, start - 1), i).map((p) => [p.lat, p.lon]);
        if (seg.length > 1) L.polyline(seg, { pane: 'route', color: CLASS_COLORS[pts[start].cls], weight: 4, interactive: false }).addTo(g);
        start = i;
      }
    }
  }

  drawReturn(pts) {
    const g = this.retGroup.clearLayers();
    if (!pts || pts.length < 2) return;
    const line = pts.map((p) => [p.lat, p.lon]);
    L.polyline(line, { pane: 'ret', color: '#1c1612', weight: 9, opacity: 0.7, interactive: false }).addTo(g);
    L.polyline(line, { pane: 'ret', color: '#fff', weight: 4.5, dashArray: '10 8', interactive: false }).addTo(g);
  }

  addStops(waypoints) {
    waypoints.forEach((wp, k) => {
      const pin = document.createElement('div');
      pin.className = 'pin';
      if (wp.science.priority === 1) pin.dataset.key = '';
      pin.textContent = k ? String(k) : 'R';
      const icon = L.divIcon({ className: 'wp-icon', html: pin, iconSize: [44, 44], iconAnchor: [22, 22] });
      const label = k ? `Cairn ${k}: ${wp.plain.title}` : `The rover dock: ${wp.name}`;
      const marker = L.marker([wp.lat, wp.lon], { icon, title: label, alt: label, keyboard: true, zIndexOffset: 500 }).addTo(this.map);
      marker.on('click', () => this.onStop(k));
      marker.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') this.onStop(k); });
      this.pins.set(k, pin);
    });
  }

  markStops(here, reached) {
    for (const [k, pin] of this.pins) {
      pin.toggleAttribute('data-here', k === here);
      pin.toggleAttribute('data-done', k < reached && k !== here);
    }
  }

  setCrew(lon, lat) {
    if (!this.crew) {
      const icon = L.divIcon({ className: '', html: '<div class="crew"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
      this.crew = L.marker([lat, lon], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(this.map);
    } else this.crew.setLatLng([lat, lon]);
  }

  panTo(lon, lat) {
    if (this.view !== 'walk') return;
    const wide = this.el.clientWidth > 700;
    this.map.panTo(this.map.containerPointToLatLng(this.map.latLngToContainerPoint([lat, lon]).add([wide ? 150 : 0, 40])), { animate: true });
  }

  resize() { this.map.invalidateSize(); }
}
