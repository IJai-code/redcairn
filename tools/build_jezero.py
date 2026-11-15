#!/usr/bin/env python3
"""Build the Jezero site (beta) with the same engine as Gale: data/jezero/{terrain.bin,terrain.json,route.json,track.json}.

Same method as tools/build_route.py and tools/build_terrain.py, different sources:
  elevation  Mars 2020 Terrain Relative Navigation HiRISE DTM, 1 m (USGS Astrogeology / JPL),
             cut to the walk by tools/fetch_jezero_dtm.py
  track      Perseverance traverse and waypoints, https://mars.nasa.gov/mmgis-maps/M20/Layers/json/

  python3 tools/fetch_jezero_dtm.py --cache DIR
  python3 tools/build_jezero.py --cache DIR

Standard library only.
"""
import argparse
import json
import math
import os
import struct

import build_route as br

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "data", "jezero")
TRAVERSE_URL = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json"
DTM = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
       "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif")

# Rover stops (sols) that anchor the walk; coordinates come from the waypoint file.
ANCHORS = [
    ("DOCK", 13),         # Octavia E. Butler Landing
    ("WP1", 49),          # Van Zyl Overlook: it watched Ingenuity's first flight from here
    ("WP2", 113),         # the crater floor, Máaz
    ("WP3", 157),         # Roubion: the first coring attempt
    ("PERSEVERANCE", 180),  # Rochette: the first rock cores
]
GRID_STEP = 2


class Raster:
    def __init__(self, cache):
        meta = json.load(open(os.path.join(cache, "jezero_window.json")))
        self.w, self.h, self.b = meta["cols"], meta["rows"], meta["bounds"]
        raw = open(os.path.join(cache, "jezero_window.bin"), "rb").read()
        self.v = struct.unpack("<%df" % (self.w * self.h), raw)

    def at(self, lon, lat):
        """Bilinear elevation at a point."""
        b = self.b
        x = (lon - b["west"]) / (b["east"] - b["west"]) * self.w - 0.5
        y = (b["north"] - lat) / (b["north"] - b["south"]) * self.h - 0.5
        x0, y0 = int(math.floor(x)), int(math.floor(y))
        fx, fy = x - x0, y - y0
        x0, y0 = max(0, min(self.w - 2, x0)), max(0, min(self.h - 2, y0))
        g = lambda c, r: self.v[r * self.w + c]
        return (g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy)
                + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy)


def terrain(r):
    b = r.b
    lat_mid = math.radians((b["north"] + b["south"]) / 2.0)
    post_x = (b["east"] - b["west"]) * br.M_PER_DEG * math.cos(lat_mid) / r.w
    post_y = (b["north"] - b["south"]) * br.M_PER_DEG / r.h
    lo, hi = min(r.v), max(r.v)
    cols, rows = r.w // GRID_STEP, r.h // GRID_STEP
    base = math.floor(lo)
    out = bytearray()
    for y in range(rows):
        for x in range(cols):
            s = 0.0
            for dy in range(GRID_STEP):
                o = (y * GRID_STEP + dy) * r.w + x * GRID_STEP
                s += sum(r.v[o:o + GRID_STEP])
            out += struct.pack("<h", int(round((s / (GRID_STEP * GRID_STEP) - base) * 10)))
    open(os.path.join(OUT, "terrain.bin"), "wb").write(out)
    meta = {
        "schema": "redcairn.terrain/1",
        "generatedBy": "tools/build_jezero.py",
        "source": DTM,
        "credit": "NASA/JPL-Caltech/University of Arizona/USGS",
        "file": "data/jezero/terrain.bin",
        "encoding": "int16 little-endian, row-major, row 0 is the northern edge",
        "cols": cols, "rows": rows,
        "bounds": {"west": b["west"], "east": b["west"] + cols * GRID_STEP * (b["east"] - b["west"]) / r.w,
                   "north": b["north"], "south": b["north"] - rows * GRID_STEP * (b["north"] - b["south"]) / r.h},
        "cellMX": round(post_x * GRID_STEP, 4), "cellMY": round(post_y * GRID_STEP, 4),
        "baseElevM": base, "unitsPerMetre": 10,
        "minElevM": round(lo, 2), "maxElevM": round(hi, 2),
    }
    json.dump(meta, open(os.path.join(OUT, "terrain.json"), "w"), indent=1)
    print("terrain %dx%d cells, post %.3f x %.3f m, elev %.1f..%.1f" % (cols, rows, post_x, post_y, lo, hi))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    r = Raster(a.cache)
    terrain(r)

    traverse = br.fetch(TRAVERSE_URL, a.cache, "M20_traverse.json")
    waypoints = br.fetch(WAYPOINTS_URL, a.cache, "M20_waypoints.json")
    stops = {}
    for f in waypoints["features"]:
        stops.setdefault(f["properties"]["sol"], f["properties"])
    pts = br.flatten(traverse)
    if len(pts[0]) < 3:
        pts = [list(p) + [0.0] for p in pts]

    anchors = []
    for wid, sol in ANCHORS:
        p = stops[sol]
        anchors.append({"id": wid, "sol": sol, "rmc": p["RMC"], "lon": p["lon"], "lat": p["lat"],
                        "elevM": p["elev_geoid"], "roverTiltDeg": p["tilt"]})
    i0, d0 = br.nearest_index(pts, [anchors[0]["lon"], anchors[0]["lat"]])
    i1, d1 = br.nearest_index(pts, [anchors[-1]["lon"], anchors[-1]["lat"]], start=i0)
    track = pts[i0:i1 + 1]
    track_len = sum(br.ground_m(p, q) for p, q in zip(track, track[1:]))
    eva = br.resample(br.erase_loops(track), br.RESAMPLE_M)
    dist = [0.0]
    for p, q in zip(eva, eva[1:]):
        dist.append(dist[-1] + br.ground_m(p, q))
    dem = [r.at(p[0], p[1]) for p in eva]
    # The traverse file has no heights; the rover's own heights are the waypoint localisations.
    wp_pts = [(s["lon"], s["lat"], s["elev_geoid"]) for s in stops.values() if s["elev_geoid"] > -9000]
    rov = []
    for p in eva:
        best = min(wp_pts, key=lambda s: br.ground_m(p, s))
        rov.append(best[2] if br.ground_m(p, best) < 15 else None)
    pairs = [(dem[i], rov[i]) for i in range(len(eva)) if rov[i] is not None]
    offs = [d - v for d, v in pairs]
    datum = sum(offs) / len(offs)
    rms = math.sqrt(sum((o - datum) ** 2 for o in offs) / len(offs))

    half = max(1, int(round(br.SLOPE_BASELINE_M / br.RESAMPLE_M / 2.0)))
    verts = []
    for i, p in enumerate(eva):
        lo, hi = max(0, i - half), min(len(eva) - 1, i + half)
        run = dist[hi] - dist[lo]
        slope = math.degrees(math.atan2(dem[hi] - dem[lo], run)) if run > 0 else 0.0
        verts.append({"lon": round(p[0], 7), "lat": round(p[1], 7), "distM": round(dist[i], 1),
                      "slopeDeg": round(slope, 1), "slopeClass": br.slope_class(slope),
                      "roverElevM": round(dem[i] - datum, 2), "demElevM": round(dem[i], 2)})
    for an in anchors:
        idx, off = br.nearest_index(eva, [an["lon"], an["lat"]])
        an["routeIndex"], an["routeDistM"], an["snapOffsetM"] = idx, verts[idx]["distM"], round(off, 1)
    slopes = [abs(v["slopeDeg"]) for v in verts]
    counts = {k: sum(1 for v in verts if v["slopeClass"] == k) for k in ("safe", "caution", "nogo")}
    out = {
        "schema": "redcairn.route/1", "generatedBy": "tools/build_jezero.py",
        "source": {"traverse": TRAVERSE_URL, "waypoints": WAYPOINTS_URL, "dem": DTM,
                   "note": "Positions are Perseverance's own localisation; slope is from the 1 m orbital DTM. No values are invented."},
        "params": {"resampleM": br.RESAMPLE_M, "slopeBaselineM": br.SLOPE_BASELINE_M, "slopeSource": "orbital-dem",
                   "slopeCautionDeg": br.SLOPE_CAUTION_DEG, "slopeNoGoDeg": br.SLOPE_NOGO_DEG},
        "summary": {
            "roverTrackLengthM": round(track_len, 1), "evaLengthM": round(dist[-1], 1),
            "elevGainM": round(dem[-1] - dem[0], 1), "minElevM": round(min(dem) - datum, 1), "maxElevM": round(max(dem) - datum, 1),
            "maxAbsSlopeDeg": round(max(slopes), 1), "meanAbsSlopeDeg": round(sum(slopes) / len(slopes), 1),
            "slopeClassCounts": counts, "demMinusRoverDatumOffsetM": round(datum, 2), "demVsRoverRmsResidualM": round(rms, 2),
            "roverHeightPoints": len(pairs),
        },
        "anchors": anchors, "eva": verts,
        "roverTrack": [[round(p[0], 7), round(p[1], 7), round(r.at(p[0], p[1]) - datum, 2)] for p in track],
    }
    json.dump(out, open(os.path.join(OUT, "route.json"), "w"), separators=(",", ":"))

    # The whole mission line, for the map (like data/gale.json's traverse).
    allp = br.flatten(traverse)
    thin = [allp[0]]
    for p in allp:
        if br.ground_m(thin[-1], p) > 25:
            thin.append(p)
    last = max(stops)
    land = stops[min(stops)]
    km = max(s["dist_total_m"] for s in stops.values()) / 1000   # odometry; mid-drive rows carry 0
    track_meta = {
        "schema": "redcairn.track/1", "generatedBy": "tools/build_jezero.py",
        "sources": {"traverse": TRAVERSE_URL, "waypoints": WAYPOINTS_URL},
        "rover": {"name": "Perseverance", "landedLabel": "Feb 2021", "landedSol": 0, "latestSol": last, "distanceKm": round(km, 2) if km else None,
                  "landingElevM": round(land["elev_geoid"]), "latestElevM": round(stops[last]["elev_geoid"]),
                  "climbM": round(stops[last]["elev_geoid"] - land["elev_geoid"]),
                  "landing": [land["lon"], land["lat"]], "latest": [stops[last]["lon"], stops[last]["lat"]]},
        "traverse": [[round(p[0], 5), round(p[1], 5)] for p in thin],
    }
    json.dump(track_meta, open(os.path.join(OUT, "track.json"), "w"), separators=(",", ":"))
    print(json.dumps(out["summary"], indent=1))
    print(json.dumps(track_meta["rover"]))
    for an in anchors:
        print(an["id"], an["sol"], an["lon"], an["lat"], an["elevM"], "at", an["routeDistM"], "snap", an["snapOffsetM"])


if __name__ == "__main__":
    main()
