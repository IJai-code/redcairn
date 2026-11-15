#!/usr/bin/env python3
"""The crater around each walk, in 3D: the MOLA + HRSC blended elevation (Mars Trek ImageServer) for a box about
65 km across centred on the walk. js/scene.js draws it in the plates' ink style beyond the 1 m model, so the crater
rim, Mount Sharp (Gale) and the delta and rim (Jezero) rise around you at true scale.

  python3 tools/build_midfield.py        # writes data/midfield.{bin,json} and data/jezero/midfield.{bin,json}

Standard library only.
"""
import json
import os
import struct
import urllib.request

import build_terrain as bt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
URL = ("https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/"
       "ImageServer/exportImage")
HALF = 0.56     # degrees either side of the walk (~33 km)
PX = 420


def build(site_dir):
    t = json.load(open(os.path.join(ROOT, site_dir, "terrain.json")))
    b = t["bounds"]
    cx, cy = (b["west"] + b["east"]) / 2, (b["north"] + b["south"]) / 2
    box = {"west": cx - HALF, "east": cx + HALF, "south": cy - HALF, "north": cy + HALF}
    q = (f"?bbox={box['west']},{box['south']},{box['east']},{box['north']}&bboxSR=104905&imageSR=104905"
         f"&size={PX},{PX}&format=tiff&pixelType=F32&compression=None&interpolation=RSP_BilinearInterpolation&f=image")
    raw = urllib.request.urlopen(urllib.request.Request(URL + q, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read()
    w, h, grid = bt.read_tiff_f32(raw)
    flat = [v for row in grid for v in row]
    lo, hi = min(flat), max(flat)
    out = b"".join(struct.pack("<h", int(round(v))) for v in flat)
    open(os.path.join(ROOT, site_dir, "midfield.bin"), "wb").write(out)
    meta = {"schema": "redcairn.midfield/1", "generatedBy": "tools/build_midfield.py", "source": URL.rsplit("/", 1)[0],
            "credit": "NASA/JPL/GSFC (MOLA), ESA/DLR/FU Berlin (HRSC), via NASA Mars Trek",
            "file": f"{site_dir}/midfield.bin", "encoding": "int16 little-endian metres, row 0 is the northern edge",
            "cols": w, "rows": h, "bounds": box, "minElevM": round(lo, 1), "maxElevM": round(hi, 1)}
    json.dump(meta, open(os.path.join(ROOT, site_dir, "midfield.json"), "w"), indent=1)
    print(site_dir, w, h, round(lo), round(hi))


if __name__ == "__main__":
    build("data")
    build("data/jezero")
