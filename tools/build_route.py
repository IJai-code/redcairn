#!/usr/bin/env python3
"""Build data/route.json from the Curiosity rover's published traverse.

The EVA corridor in REDCAIRN is not hand-drawn: it follows ground the
Curiosity rover has physically driven. Slope along it comes from the 1 m
orbital elevation model, and the rover's own elevations are kept alongside
as an independent ground-truth check on that model.

Sources (public, no key):
  https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json
  https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
  https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer

Usage:
  python3 tools/build_route.py              # fetch live and rebuild
  python3 tools/build_route.py --cache DIR  # reuse/keep downloaded copies in DIR

Standard library only.
"""
import argparse
import json
import math
import os
import urllib.parse
import urllib.request

TRAVERSE_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"

# Orbital elevation: 1 m HiRISE stereo DEM of Gale crater, served by Mars Trek.
DEM_SAMPLES_URL = "https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer/getSamples"
DEM_CHUNK = 40  # points per request (the service only accepts GET)

MARS_RADIUS_M = 3396190.0
M_PER_DEG = math.pi * MARS_RADIUS_M / 180.0

# Rover stops (mission sols) that anchor the EVA. Coordinates are read from
# the waypoint file at build time, never typed in by hand.
ANCHORS = [
    ("DOCK", 4560),
    ("WP1", 4600),
    ("WP2", 4711),
    ("WP3", 4841),
    ("WP4", 4848),
    ("WP5", 4868),
]

RESAMPLE_M = 5.0        # spacing of the published EVA polyline
SLOPE_BASELINE_M = 10.0  # slope is measured over this along-track distance
LOOP_RADIUS_M = 8.0     # the rover's spurs/back-tracks closer than this are cut
LOOP_MIN_PATH_M = 25.0
SLOPE_CAUTION_DEG = 15.0
SLOPE_NOGO_DEG = 20.0


def fetch(url, cache_dir, name):
    if cache_dir:
        path = os.path.join(cache_dir, name)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        with open(os.path.join(cache_dir, name), "w", encoding="utf-8") as fh:
            fh.write(raw)
    return json.loads(raw)


def ground_m(a, b):
    """Horizontal distance in metres between two [lon, lat, ...] points."""
    lat0 = math.radians((a[1] + b[1]) / 2.0)
    dx = (b[0] - a[0]) * M_PER_DEG * math.cos(lat0)
    dy = (b[1] - a[1]) * M_PER_DEG
    return math.hypot(dx, dy)


def flatten(traverse):
    pts = []
    for feat in traverse["features"]:
        geom = feat["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            for c in line:
                if not pts or ground_m(pts[-1], c) > 0.05:
                    pts.append(c)
    return pts


def nearest_index(pts, target, start=0):
    best, best_d = start, float("inf")
    for i in range(start, len(pts)):
        d = ground_m(pts[i], target)
        if d < best_d:
            best, best_d = i, d
    return best, best_d


def erase_loops(pts):
    """Cut spurs and back-tracks so the EVA line never doubles back on itself."""
    out = []
    odo = []
    for p in pts:
        cut = None
        for j in range(len(out)):
            if odo[-1] - odo[j] >= LOOP_MIN_PATH_M and ground_m(out[j], p) <= LOOP_RADIUS_M:
                cut = j
                break
        if cut is not None:
            del out[cut + 1:]
            del odo[cut + 1:]
        if out:
            odo.append(odo[-1] + ground_m(out[-1], p))
        else:
            odo.append(0.0)
        out.append(p)
    return out


def resample(pts, step):
    out = [list(pts[0])]
    carry = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = ground_m(a, b)
        if seg <= 0:
            continue
        pos = step - carry
        while pos <= seg:
            t = pos / seg
            out.append([a[k] + (b[k] - a[k]) * t for k in range(3)])
            pos += step
        carry = (carry + seg) % step
    if ground_m(out[-1], pts[-1]) > 0.5:
        out.append(list(pts[-1]))
    return out


def sample_dem(points, cache_dir):
    """Orbital DEM elevation (m) at each [lon, lat, ...] point, or None if the service is down."""
    key = json.dumps([[round(p[0], 7), round(p[1], 7)] for p in points], separators=(",", ":"))
    cache_path = os.path.join(cache_dir, "dem_samples.json") if cache_dir else None
    if cache_path and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            cached = json.load(fh)
        if cached.get("key") == key:
            return cached["values"]
    values = []
    try:
        for k in range(0, len(points), DEM_CHUNK):
            chunk = points[k:k + DEM_CHUNK]
            geom = {"points": [[round(p[0], 7), round(p[1], 7)] for p in chunk],
                    "spatialReference": {"wkid": 104905}}
            query = urllib.parse.urlencode({
                "geometry": json.dumps(geom, separators=(",", ":")),
                "geometryType": "esriGeometryMultipoint",
                "returnFirstValueOnly": "true",
                "interpolation": "RSP_BilinearInterpolation",
                "f": "json",
            })
            req = urllib.request.Request(DEM_SAMPLES_URL + "?" + query, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                samples = json.load(resp)["samples"]
            samples.sort(key=lambda x: x["locationId"])
            if len(samples) != len(chunk):
                raise ValueError("DEM returned %d of %d samples" % (len(samples), len(chunk)))
            values += [float(x["value"]) for x in samples]
    except Exception as exc:  # network or service failure: caller falls back to rover elevations
        print("DEM sampling failed:", exc)
        return None
    if cache_path:
        with open(cache_path, "w", encoding="utf-8") as fh:
            json.dump({"key": key, "values": values}, fh)
    return values


def slope_class(deg):
    a = abs(deg)
    if a >= SLOPE_NOGO_DEG:
        return "nogo"
    if a >= SLOPE_CAUTION_DEG:
        return "caution"
    return "safe"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=None)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "route.json"))
    args = ap.parse_args()

    traverse = fetch(TRAVERSE_URL, args.cache, "MSL_traverse.json")
    waypoints = fetch(WAYPOINTS_URL, args.cache, "MSL_waypoints.json")

    stops = {}
    for feat in waypoints["features"]:
        p = feat["properties"]
        stops.setdefault(p["sol"], p)  # first stop recorded on that sol

    pts = flatten(traverse)

    anchors = []
    for wid, sol in ANCHORS:
        p = stops[sol]
        anchors.append({"id": wid, "sol": sol, "rmc": p["RMC"], "lon": p["lon"], "lat": p["lat"],
                        "elevM": p["elev_geoid"], "roverTiltDeg": p["tilt"]})

    # Slice the rover track between the first and last anchor.
    i0, d0 = nearest_index(pts, [anchors[0]["lon"], anchors[0]["lat"]])
    i1, d1 = nearest_index(pts, [anchors[-1]["lon"], anchors[-1]["lat"]], start=i0)
    track = pts[i0:i1 + 1]
    track_len = sum(ground_m(a, b) for a, b in zip(track, track[1:]))

    eva = resample(erase_loops(track), RESAMPLE_M)

    dist = [0.0]
    for a, b in zip(eva, eva[1:]):
        dist.append(dist[-1] + ground_m(a, b))

    dem = sample_dem(eva, args.cache)
    if dem is not None:
        slope_source = "orbital-dem"
        offsets = [dem[i] - eva[i][2] for i in range(len(eva))]
        datum_offset = sum(offsets) / len(offsets)
        rms = math.sqrt(sum((o - datum_offset) ** 2 for o in offsets) / len(offsets))
        z = dem
        baseline = SLOPE_BASELINE_M
    else:
        # Rover elevations carry about 1 m of noise, so widen the baseline when they are all we have.
        slope_source = "rover-localisation"
        datum_offset = rms = None
        z = [p[2] for p in eva]
        baseline = SLOPE_BASELINE_M * 2

    half = max(1, int(round(baseline / RESAMPLE_M / 2.0)))
    vertices = []
    for i, p in enumerate(eva):
        lo, hi = max(0, i - half), min(len(eva) - 1, i + half)
        run = dist[hi] - dist[lo]
        slope = math.degrees(math.atan2(z[hi] - z[lo], run)) if run > 0 else 0.0
        v = {
            "lon": round(p[0], 7), "lat": round(p[1], 7),
            "distM": round(dist[i], 1), "slopeDeg": round(slope, 1), "slopeClass": slope_class(slope),
            "roverElevM": round(p[2], 2),
        }
        if dem is not None:
            v["demElevM"] = round(dem[i], 2)
        vertices.append(v)

    for a in anchors:
        idx, off = nearest_index(eva, [a["lon"], a["lat"]])
        a["routeIndex"] = idx
        a["routeDistM"] = vertices[idx]["distM"]
        a["snapOffsetM"] = round(off, 1)

    slopes = [abs(v["slopeDeg"]) for v in vertices]
    counts = {k: sum(1 for v in vertices if v["slopeClass"] == k) for k in ("safe", "caution", "nogo")}
    out = {
        "schema": "redcairn.route/1",
        "generatedBy": "tools/build_route.py",
        "source": {"traverse": TRAVERSE_URL, "waypoints": WAYPOINTS_URL,
                   "dem": DEM_SAMPLES_URL,
                   "note": "Positions are the rover's own localisation; slope is from the 1 m orbital DEM. No values are invented."},
        "params": {"resampleM": RESAMPLE_M, "slopeBaselineM": baseline, "slopeSource": slope_source,
                   "slopeCautionDeg": SLOPE_CAUTION_DEG, "slopeNoGoDeg": SLOPE_NOGO_DEG},
        "summary": {
            "roverTrackLengthM": round(track_len, 1),
            "evaLengthM": round(dist[-1], 1),
            "elevGainM": round(eva[-1][2] - eva[0][2], 1),
            "minElevM": round(min(p[2] for p in eva), 1),
            "maxElevM": round(max(p[2] for p in eva), 1),
            "maxAbsSlopeDeg": round(max(slopes), 1),
            "meanAbsSlopeDeg": round(sum(slopes) / len(slopes), 1),
            "slopeClassCounts": counts,
            "demMinusRoverDatumOffsetM": None if datum_offset is None else round(datum_offset, 2),
            "demVsRoverRmsResidualM": None if rms is None else round(rms, 2),
        },
        "anchors": anchors,
        "eva": vertices,
        "roverTrack": [[round(p[0], 7), round(p[1], 7), round(p[2], 2)] for p in track],
    }
    out_path = os.path.abspath(args.out)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")

    print("wrote", out_path)
    print("anchor snap (m): start", round(d0, 2), "end", round(d1, 2))
    print(json.dumps(out["summary"], indent=1))
    for a in anchors:
        print(a["id"], "sol", a["sol"], a["rmc"], a["lon"], a["lat"], a["elevM"],
              "tilt", a["roverTiltDeg"], "at", a["routeDistM"], "m, snap", a["snapOffsetM"])


if __name__ == "__main__":
    main()
