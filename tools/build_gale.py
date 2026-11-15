"""Fetch the crater-scale data for the 'whole mountain' view. Standard library only.

    python3 tools/build_gale.py

Writes:
  art/gale/dem.tif       Gale crater elevation, MOLA + HRSC blend at ~200 m/px (Mars Trek ImageServer), float32 metres
  art/gale/color.jpg     Viking MDIM 2.1 true-colour mosaic of the same box (Mars Trek ImageServer)
  art/gale/height.jpg    MOLA + HRSC colour-shaded relief of the same box (Mars Trek ImageServer)
  art/gale/geology.png   USGS SIM 3292 Geologic Map of Mars, same box (Mars Trek MapServer)
  data/gale.json         the box, Curiosity's whole traverse (simplified) and the numbers the story quotes

Then render it with tools/blender_gale.py.
"""
import json
import math
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
TREK = "https://trek.nasa.gov/mars/trekarcgis/rest/services"
TRAVERSE = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json"
WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
MINERALS = TREK + "/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query"

# Gale crater is 154 km across, centred near 137.8 E, 5.4 S. A 3 by 3 degree box holds the rim.
BOX = {"west": 136.3, "east": 139.3, "south": -6.9, "north": -3.9}
DEM_PX = 1000
COLOR_PX = 1500
MARS_KM_PER_DEG = 2 * math.pi * 3389.5 / 360


def get(url, dest=None):
    req = urllib.request.Request(url, headers={"User-Agent": "redcairn-data-builder"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if dest:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(data)
    return data


def export(service, sr, px, fmt, extra=""):
    bbox = f"{BOX['west']},{BOX['south']},{BOX['east']},{BOX['north']}"
    return (f"{TREK}/{service}/ImageServer/exportImage?bbox={bbox}&bboxSR={sr}&imageSR={sr}"
            f"&size={px},{px}&format={fmt}{extra}&f=image")


def line_points(geom):
    if geom["type"] == "LineString":
        return geom["coordinates"]
    return [p for part in geom["coordinates"] for p in part]


def simplify(pts, min_km):
    out = [pts[0]]
    for p in pts[1:]:
        q = out[-1]
        dx = (p[0] - q[0]) * MARS_KM_PER_DEG * math.cos(math.radians(p[1]))
        dy = (p[1] - q[1]) * MARS_KM_PER_DEG
        if math.hypot(dx, dy) >= min_km:
            out.append(p)
    if out[-1] is not pts[-1]:
        out.append(pts[-1])
    return out


def sol_by_km(wps, step_km=0.25):
    out, next_km = [], 0.0
    for w in wps:
        p = w["properties"]
        km = p["dist_total_m"] / 1000
        if km >= next_km or w is wps[-1]:
            out.append([round(km, 3), p["sol"]])
            next_km = km + step_km
    return out


def main():
    get(export("Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw", 104905, DEM_PX, "tiff",
               "&pixelType=F32&compression=None"), os.path.join(ROOT, "art", "gale", "dem.tif"))
    get(export("Mars_Viking_MDIM21_ClrMosaic_global_232m", 4326, COLOR_PX, "jpg"),
        os.path.join(ROOT, "art", "gale", "color.jpg"))

    get(export("Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp", 4326, COLOR_PX, "jpg"),
        os.path.join(ROOT, "art", "gale", "height.jpg"))
    bbox = f"{BOX['west']},{BOX['south']},{BOX['east']},{BOX['north']}"
    get(f"{TREK}/SIM3292_Global_Geology/MapServer/export?bbox={bbox}&bboxSR=104905&imageSR=104905"
        f"&size={COLOR_PX},{COLOR_PX}&format=png&transparent=false&f=image", os.path.join(ROOT, "art", "gale", "geology.png"))
    units = json.loads(get(f"{TREK}/SIM3292_Global_Geology/MapServer/0/query?geometry={bbox}&geometryType=esriGeometryEnvelope"
                           f"&inSR=104905&spatialRel=esriSpatialRelIntersects&returnGeometry=false&outFields=Unit,UnitDesc&f=json"))
    minerals = json.loads(get(f"{MINERALS}?geometry={bbox}&geometryType=esriGeometryEnvelope&inSR=104905"
                              f"&spatialRel=esriSpatialRelIntersects&returnGeometry=false&outFields=Long_East,Latitude,Instrument&f=json"))

    trav = json.loads(get(TRAVERSE))
    pts = [p for f in trav["features"] for p in line_points(f["geometry"])]
    wps = json.loads(get(WAYPOINTS))["features"]
    first, last = wps[0]["properties"], wps[-1]["properties"]

    out = {
        "schema": "redcairn.gale/1",
        "generatedBy": "tools/build_gale.py",
        "box": BOX,
        "sources": {
            "elevation": f"{TREK}/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer",
            "color": f"{TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer",
            "traverse": TRAVERSE,
            "waypoints": WAYPOINTS,
            "height": f"{TREK}/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp/ImageServer",
            "geology": f"{TREK}/SIM3292_Global_Geology/MapServer",
            "waterMinerals": MINERALS,
        },
        "rover": {
            "landedSol": first["sol"],
            "latestSol": last["sol"],
            "distanceKm": round(last["dist_total_m"] / 1000, 2),
            "landingElevM": round(first["elev_geoid"]),
            "latestElevM": round(last["elev_geoid"]),
            "climbM": round(last["elev_geoid"] - first["elev_geoid"]),
            "landing": [first["lon"], first["lat"]],
            "latest": [last["lon"], last["lat"]],
        },
        "traverse": [[round(p[0], 5), round(p[1], 5)] for p in simplify(pts, 0.04)],
        # Odometry against time, so the story can say which sol the rover reached each point of the line.
        "solByKm": sol_by_km(wps),
        "geologicUnits": sorted({(f["attributes"]["Unit"], f["attributes"]["UnitDesc"]) for f in units["features"]}),
        "waterMinerals": [{"lon": round(f["attributes"]["Long_East"], 3), "lat": round(f["attributes"]["Latitude"], 3),
                           "instrument": f["attributes"]["Instrument"]} for f in minerals["features"]],
    }
    with open(os.path.join(ROOT, "data", "gale.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    r = out["rover"]
    print(f"sol {r['latestSol']}: {r['distanceKm']} km driven, {r['climbM']} m climbed, {len(out['traverse'])} track points")


if __name__ == "__main__":
    main()
