#!/usr/bin/env python3
"""Bake the latest surface weather report and orbital mineral detections into data/conditions.json.

Sources (public, no key):
  Curiosity REMS weather reports  https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json
  Hydrous mineral detections      Mars Trek map service (CRISM on MRO, OMEGA on Mars Express)

Standard library only.
"""
import json
import os
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEATHER = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
MINERALS = "https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query"
GALE = "136.2,-6.8,139.3,-3.6"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    soles = get(WEATHER)["soles"]
    latest = next(s for s in soles if num(s.get("min_temp")) is not None and num(s.get("max_temp")) is not None)
    weather = {
        "sol": int(latest["sol"]), "earthDate": latest["terrestrial_date"],
        "airMinC": num(latest["min_temp"]), "airMaxC": num(latest["max_temp"]),
        "groundMinC": num(latest.get("min_gts_temp")), "groundMaxC": num(latest.get("max_gts_temp")),
        "pressurePa": num(latest.get("pressure")), "sky": latest.get("atmo_opacity"),
        "uv": latest.get("local_uv_irradiance_index"), "sunrise": latest.get("sunrise"), "sunset": latest.get("sunset"),
        "source": WEATHER, "instrument": "REMS weather station on the Curiosity rover",
    }
    q = urllib.parse.urlencode({"geometry": GALE, "geometryType": "esriGeometryEnvelope", "spatialRel": "esriSpatialRelIntersects",
                                "outFields": "Instrument,Type", "returnGeometry": "true", "f": "json"})
    feats = get(MINERALS + "?" + q).get("features", [])
    minerals = [{"lon": round(f["geometry"]["x"], 4), "lat": round(f["geometry"]["y"], 4), "instrument": f["attributes"]["Instrument"]} for f in feats]
    out = {"schema": "redcairn.conditions/1", "generatedBy": "tools/build_conditions.py", "weather": weather,
           "hydrousMinerals": {"source": MINERALS, "note": "Places where orbiting spectrometers detected minerals that form in water.", "points": minerals}}
    with open(os.path.join(ROOT, "data", "conditions.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(json.dumps(weather, indent=1))
    print(len(minerals), "mineral detections")


if __name__ == "__main__":
    main()
