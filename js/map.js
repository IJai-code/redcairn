// Map view: orbital basemap, raster analysis layers, routes and markers.
// Leaflet is loaded as a global from index.html.

import { M_PER_DEG } from './terrain.js';

const L = window.L;
const CLASS_COLORS = ['#3ddc84', '#ffb020', '#ff4d4d'];

function canvasFor(terrain) {
  const c = document.createElement('canvas');
  c.width = terrain.cols;
  c.height = terrain.rows;
  return c;
}

function paint(terrain, fn) {
  const c = canvasFor(terrain);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(terrain.cols, terrain.rows);
  const px = img.data;
  for (let i = 0; i < terrain.size; i++) fn(i, px, i * 4);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export class MapView {
  constructor(el, mission, terrain) {
    this.mission = mission;
    this.terrain = terrain;
    this.bounds = L.latLngBounds([terrain.south, terrain.west], [terrain.north, terrain.east]);
    this.rasters = {};
    this.markers = new Map();
    this.onWaypoint = () => {};
    this.onHover = () => {};

    this.map = L.map(el, {
      crs: L.CRS.EPSG4326,
      minZoom: 13,
      maxZoom: 19,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBounds: this.bounds.pad(0.6),
      maxBoundsViscosity: 0.8,
      attributionControl: true,
    });
    this.map.attributionControl.setPrefix(false);

    const base = mission.basemaps.find((b) => b.id === 'hirise');
    L.tileLayer(base.url, {
      tileSize: base.tileSize,
      minZoom: 9,
      maxNativeZoom: base.maxNativeZoom,
      maxZoom: 19,
      noWrap: true,
      bounds: [[base.bounds.south, base.bounds.west], [base.bounds.north, base.bounds.east]],
      attribution: `Imagery: ${base.credit} via Mars Trek`,
    }).addTo(this.map);

    for (const [name, z] of [['hillshade', 250], ['slope', 260], ['shield', 270], ['iso', 280], ['science', 410], ['track', 415], ['route', 420], ['return', 430]]) {
      this.map.createPane(name).style.zIndex = z;
    }
    this.groups = {
      science: L.layerGroup(), track: L.layerGroup(), route: L.layerGroup().addTo(this.map),
      ret: L.layerGroup().addTo(this.map), shelters: L.layerGroup(),
    };

    this.map.fitBounds(this.bounds.pad(-0.08));
    this.map.on('mousemove', (e) => this.onHover(e.latlng.lng, e.latlng.lat));
    this.map.on('mouseout', () => this.onHover(null, null));
    this.map.on('zoomend moveend resize', () => this.#updateScale());
    this.#updateScale();
  }

  #updateScale() {
    const bar = document.getElementById('scale-bar');
    const text = document.getElementById('scale-text');
    if (!bar || !text) return;
    const c = this.map.getCenter();
    const p = this.map.latLngToContainerPoint(c);
    const q = this.map.containerPointToLatLng([p.x + 100, p.y]);
    const mPer100 = Math.abs(q.lng - c.lng) * M_PER_DEG * Math.cos(c.lat * Math.PI / 180);
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].reduce((a, b) => (b <= mPer100 * 1.2 ? b : a), 1);
    bar.style.width = `${Math.round((nice / mPer100) * 100)}px`;
    text.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  }

  // ---- raster layers built from the terrain grid ----
  #raster(name, url, opacity) {
    if (this.rasters[name]) this.map.removeLayer(this.rasters[name]);
    this.rasters[name] = L.imageOverlay(url, this.bounds, { pane: name, opacity, interactive: false });
    return this.rasters[name];
  }

  buildStaticRasters() {
    const t = this.terrain;
    const rgb = [[61, 220, 132, 70], [255, 176, 32, 205], [255, 77, 77, 225]];
    this.#raster('slope', paint(t, (i, px, o) => {
      const c = rgb[t.cls[i]];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3];
    }), 0.7);

    // Hillshade lit from the north-west, relief doubled so 2 m ridges read.
    const az = (315 * Math.PI) / 180, alt = (38 * Math.PI) / 180, zf = 2;
    const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
    this.#raster('hillshade', paint(t, (i, px, o) => {
      const y = Math.floor(i / t.cols), x = i - y * t.cols;
      const xm = Math.max(0, x - 1), xp = Math.min(t.cols - 1, x + 1);
      const ym = Math.max(0, y - 1), yp = Math.min(t.rows - 1, y + 1);
      const dzdx = ((t.z[y * t.cols + xp] - t.z[y * t.cols + xm]) / ((xp - xm) * t.cellX)) * zf;
      const dzdn = ((t.z[ym * t.cols + x] - t.z[yp * t.cols + x]) / ((yp - ym) * t.cellY)) * zf; // towards north
      const len = Math.sqrt(dzdx * dzdx + dzdn * dzdn + 1);
      const v = Math.max(0, (-dzdx * lx - dzdn * ly + lz) / len);
      const g = Math.round(30 + v * 225);
      px[o] = g; px[o + 1] = Math.round(g * 0.93); px[o + 2] = Math.round(g * 0.86); px[o + 3] = 255;
    }), 0.6);

    const top = Math.max(0.12, t.maxShield * 0.8);
    this.#raster('shield', paint(t, (i, px, o) => {
      const v = Math.min(1, t.shield[i] / top);
      px[o] = 179; px[o + 1] = 136; px[o + 2] = 255; px[o + 3] = Math.round(v * v * 235);
    }), 0.8);
  }

  // Contours of walking time back to the dock, one line every five minutes.
  buildIsochrones(field) {
    const t = this.terrain;
    const band = (i) => (Number.isFinite(field.cost[i]) ? Math.floor(field.cost[i] / 300) : -1);
    const wasOn = this.rasters.iso && this.map.hasLayer(this.rasters.iso);
    const opacity = this.rasters.iso ? this.rasters.iso.options.opacity : 0.85;
    this.#raster('iso', paint(t, (i, px, o) => {
      const y = Math.floor(i / t.cols), x = i - y * t.cols;
      if (x >= t.cols - 1 || y >= t.rows - 1) return;
      const b = band(i);
      const edge = Math.max(b, band(i + 1), band(i + t.cols));
      if (b === band(i + 1) && b === band(i + t.cols)) return;
      const major = edge % 3 === 0;
      px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; px[o + 3] = major ? 235 : 120;
    }), opacity);
    if (wasOn) this.rasters.iso.addTo(this.map);
  }

  setLayer(name, on, opacity) {
    const target = this.rasters[name] || this.groups[name];
    if (!target) return;
    if (on) target.addTo(this.map); else this.map.removeLayer(target);
    if (opacity != null) {
      if (this.rasters[name]) this.rasters[name].setOpacity(opacity);
      else this.map.getPane(name).style.opacity = opacity;
    }
    if (name === 'shield') {
      if (on) this.groups.shelters.addTo(this.map); else this.map.removeLayer(this.groups.shelters);
    }
    if (name === 'science') {
      for (const m of this.markers.values()) m.pin.toggleAttribute('data-science-on', on);
    }
  }

  // ---- vector layers ----
  drawScience(route) {
    const g = this.groups.science.clearLayers();
    for (const unit of this.mission.layers.minerals.units) {
      const pts = route.eva.filter((v) => v.distM >= unit.routeFromM - 2.5 && v.distM <= unit.routeToM + 2.5).map((v) => [v.lat, v.lon]);
      if (pts.length > 1) {
        L.polyline(pts, { pane: 'science', color: unit.color, weight: 26, opacity: 0.5, lineCap: 'butt', interactive: false }).addTo(g);
      }
    }
  }

  drawTrack(route) {
    const g = this.groups.track.clearLayers();
    L.polyline(route.roverTrack.map((p) => [p[1], p[0]]), { pane: 'track', color: '#ffffff', weight: 1.5, opacity: 0.85, dashArray: '2 5', interactive: false }).addTo(g);
  }

  drawShelters(shelters, eff) {
    const g = this.groups.shelters.clearLayers();
    for (const s of shelters) {
      const icon = L.divIcon({ className: '', html: `<span class="shelter-icon">−${Math.round(s.blocked * eff * 100)}% dose</span>`, iconSize: null, iconAnchor: [28, 9] });
      L.marker([s.lat, s.lon], { icon, interactive: false, keyboard: false }).addTo(g);
    }
  }

  // Route coloured by along-track slope class. `outLen` splits outbound from return.
  drawRoute(pts, outLen, colourBySlope) {
    const g = this.groups.route.clearLayers();
    const all = pts.map((p) => [p.lat, p.lon]);
    L.polyline(all, { pane: 'route', color: '#000', weight: 7, opacity: 0.55, interactive: false }).addTo(g);
    const out = pts.slice(0, outLen);
    if (!colourBySlope) {
      L.polyline(out.map((p) => [p.lat, p.lon]), { pane: 'route', color: '#ff7a45', weight: 3.5, interactive: false }).addTo(g);
    } else {
      let start = 0;
      for (let i = 1; i <= out.length; i++) {
        if (i === out.length || out[i].cls !== out[start].cls) {
          const seg = out.slice(Math.max(0, start - 1), i).map((p) => [p.lat, p.lon]);
          if (seg.length > 1) L.polyline(seg, { pane: 'route', color: CLASS_COLORS[out[start].cls], weight: 3.5, interactive: false }).addTo(g);
          start = i;
        }
      }
    }
  }

  drawReturn(pts) {
    const g = this.groups.ret.clearLayers();
    if (!pts || pts.length < 2) return;
    const line = pts.map((p) => [p.lat, p.lon]);
    L.polyline(line, { pane: 'return', color: '#000', weight: 8, opacity: 0.6, interactive: false }).addTo(g);
    L.polyline(line, { pane: 'return', color: '#ffffff', weight: 4, dashArray: '10 7', interactive: false }).addTo(g);
  }

  addWaypoints(waypoints) {
    for (const wp of waypoints) {
      const pin = document.createElement('div');
      pin.className = 'wp-pin';
      pin.dataset.type = wp.type;
      pin.dataset.priority = wp.science.priority;
      pin.innerHTML = `<span>${wp.id === 'DOCK' ? 'DK' : wp.id.replace('WP', '')}</span>`;
      const icon = L.divIcon({ className: 'wp-icon', html: pin, iconSize: [44, 44], iconAnchor: [22, 22] });
      const marker = L.marker([wp.lat, wp.lon], { icon, title: `${wp.id} ${wp.name}`, alt: `${wp.id} ${wp.name}`, keyboard: true, zIndexOffset: 500 }).addTo(this.map);
      marker.on('click', () => this.onWaypoint(wp.id));
      marker.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') this.onWaypoint(wp.id); });
      this.markers.set(wp.id, { marker, pin });
    }
  }

  markWaypoints(selectedId, activeIds) {
    for (const [id, m] of this.markers) {
      m.pin.toggleAttribute('data-selected', id === selectedId);
      m.pin.toggleAttribute('data-dim', !activeIds.has(id));
    }
  }

  setCrew(lon, lat) {
    if (!this.crew) {
      const icon = L.divIcon({ className: '', html: '<div class="crew"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      this.crew = L.marker([lat, lon], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(this.map);
    } else {
      this.crew.setLatLng([lat, lon]);
    }
  }

  focus(lon, lat) {
    this.map.panTo([lat, lon], { animate: true });
  }

  resize() { this.map.invalidateSize(); }
}
