#!/usr/bin/env python3
"""Cut the Jezero walk window out of the 1 m HiRISE elevation model Perseverance landed by.

The source is the Mars 2020 Terrain Relative Navigation DTM published by USGS Astrogeology (1.8 GB,
uncompressed float32, one row per strip). Only the rows and columns of the window are read, with HTTP
range requests, so nothing else is downloaded.

  python3 tools/fetch_jezero_dtm.py --cache DIR    # writes DIR/jezero_window.bin + .json

Standard library only.
"""
import argparse
import concurrent.futures as cf
import json
import os
import struct
import urllib.request

URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
       "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif")
# From the product label (.lbl): equirectangular, 1 m/pixel, planetocentric, east-positive
MIN_LON, MAX_LAT, PX_PER_DEG, COLS = 77.2229330769714153, 18.6693150068777456, 59274.6975233062185, 21400
WINDOW = {"west": 77.4380, "east": 77.4560, "south": 18.4240, "north": 18.4480}


def get(lo, hi):
    req = urllib.request.Request(URL, headers={"Range": "bytes=%d-%d" % (lo, hi), "User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    head = get(0, 16383)
    (ifd,) = struct.unpack_from("<I", head, 4)
    (n,) = struct.unpack_from("<H", head, ifd)
    tags = {}
    for k in range(n):
        tag, typ, cnt, val = struct.unpack_from("<HHII", head, ifd + 2 + 12 * k)
        tags[tag] = (typ, cnt, val)
    _, nrows, strip_off = tags[273]
    c0 = int((WINDOW["west"] - MIN_LON) * PX_PER_DEG)
    c1 = int((WINDOW["east"] - MIN_LON) * PX_PER_DEG)
    r0 = int((MAX_LAT - WINDOW["north"]) * PX_PER_DEG)
    r1 = int((MAX_LAT - WINDOW["south"]) * PX_PER_DEG)
    w, h = c1 - c0, r1 - r0
    w -= w % 2
    h -= h % 2
    offs = struct.unpack("<%dI" % h, get(strip_off + 4 * r0, strip_off + 4 * (r0 + h) - 1))
    with cf.ThreadPoolExecutor(24) as ex:
        rows = list(ex.map(lambda o: get(o + 4 * c0, o + 4 * (c0 + w) - 1), offs))
    with open(os.path.join(a.cache, "jezero_window.bin"), "wb") as fh:
        for r in rows:
            fh.write(r)
    bounds = {"west": MIN_LON + c0 / PX_PER_DEG, "east": MIN_LON + (c0 + w) / PX_PER_DEG,
              "north": MAX_LAT - r0 / PX_PER_DEG, "south": MAX_LAT - (r0 + h) / PX_PER_DEG}
    with open(os.path.join(a.cache, "jezero_window.json"), "w") as fh:
        json.dump({"source": URL, "cols": w, "rows": h, "bounds": bounds, "col0": c0, "row0": r0}, fh, indent=1)
    vals = struct.unpack("<%df" % (w * h), b"".join(rows))
    good = [v for v in vals if -9000 < v < 9000]
    print("window %dx%d, %d no-data, elev %.1f..%.1f" % (w, h, len(vals) - len(good), min(good), max(good)), bounds)


if __name__ == "__main__":
    main()
