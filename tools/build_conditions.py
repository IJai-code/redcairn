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


# Space weather: NASA's DONKI database (Space Weather Database Of Notifications, Knowledge, Information).
# The public API allows 60 days per request and few requests per hour with DEMO_KEY, so each 60-day window
# is cached in art/donki/ and reruns only fetch what is missing. Set NASA_API_KEY for a free personal key.
DONKI = "https://api.nasa.gov/DONKI/{kind}?startDate={a}&endDate={b}&api_key={key}"


def space_weather(days=360):
    import datetime as dt
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    cache = os.path.join(ROOT, "art", "donki")
    os.makedirs(cache, exist_ok=True)
    end = dt.date.today()
    windows = [(end - dt.timedelta(days=i + 59), end - dt.timedelta(days=i)) for i in range(0, days, 60)]
    out = {"SEP": [], "FLR": []}
    covered = []
    for kind in out:
        for a, b in windows:
            fp = os.path.join(cache, f"{kind}_{a}_{b}.json")
            if not os.path.exists(fp):
                try:
                    data = get(DONKI.format(kind=kind, a=a, b=b, key=key))
                except Exception as e:      # rate limited or offline: keep what we have
                    print("DONKI", kind, a, b, "skipped:", e)
                    continue
                with open(fp, "w") as fh:
                    json.dump(data, fh)
            with open(fp) as fh:
                out[kind] += json.load(fh) or []
            covered.append((kind, str(a), str(b)))
    flares = [f for f in out["FLR"] if (f.get("classType") or "")[:1] in "MX"]
    sep = sorted(out["SEP"], key=lambda e: e.get("eventTime", ""))
    sep_w = sorted((a, b) for k, a, b in covered if k == "SEP")
    flr_w = [1 for k, a, b in covered if k == "FLR"]
    return {
        "source": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
        "api": "https://api.nasa.gov/ (DONKI)",
        "from": sep_w[0][0] if sep_w else None, "to": sep_w[-1][1] if sep_w else None,
        "sepCount": len(sep),
        "latestSep": sep[-1].get("eventTime") if sep else None,
        "strongFlares": len(flares) if flr_w else None,
        "latestStrongFlare": max((f.get("peakTime") or f.get("beginTime") or "" for f in flares), default=None),
        "note": "Solar energetic particle events and M/X-class flares logged by NASA's space weather office. "
                "Mars is not always on the same side of the Sun as Earth, so not every event reaches Mars.",
    }


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
           "hydrousMinerals": {"source": MINERALS, "note": "Places where orbiting spectrometers detected minerals that form in water.", "points": minerals},
           "spaceWeather": space_weather()}
    with open(os.path.join(ROOT, "data", "conditions.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(json.dumps(weather, indent=1))
    print(len(minerals), "mineral detections")
    print(json.dumps(out["spaceWeather"], indent=1))


if __name__ == "__main__":
    main()
