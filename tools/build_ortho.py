"""Fetch the walk site's orbital photograph at near-native HiRISE resolution. Standard library only.

    python3 tools/build_ortho.py

Asks Mars Trek's curiosity_hirise_mosaic ImageServer (HiRISE, 25 cm per pixel natively) for exactly the
terrain bounds in data/terrain.json, at about 33 cm per pixel so the texture stays under 4096 px on its long
side (the safe WebGL limit). Writes art/hirise/site.png (greyscale). tools/blender_scene.py then tints it and
writes assets/img/site-ortho.jpg, the ground of the walk diorama.
"""
import json
import math
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SERVICE = "https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer/exportImage"
M_PER_DEG = 2 * math.pi * 3389500 / 360
TARGET_M = 0.33


def main():
    with open(os.path.join(ROOT, "data", "terrain.json"), encoding="utf-8") as fh:
        b = json.load(fh)["bounds"]
    w_m = (b["east"] - b["west"]) * M_PER_DEG * math.cos(math.radians((b["north"] + b["south"]) / 2))
    h_m = (b["north"] - b["south"]) * M_PER_DEG
    # Keep the image's pixel grid in degrees (like the terrain), sized so the long side is ~33 cm per pixel.
    h_px = min(4096, round(h_m / TARGET_M))
    w_px = round(h_px * (b["east"] - b["west"]) / (b["north"] - b["south"]))
    # The service only renders in plain longitude/latitude (EPSG 4326), not in the Mars-specific reference.
    url = (f"{SERVICE}?bbox={b['west']},{b['south']},{b['east']},{b['north']}&bboxSR=4326&imageSR=4326"
           f"&size={w_px},{h_px}&format=png&f=image")
    req = urllib.request.Request(url, headers={"User-Agent": "redcairn-data-builder"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", data[:200]
    out = os.path.join(ROOT, "art", "hirise", "site.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as fh:
        fh.write(data)
    print(f"wrote {out}: {w_px} x {h_px} px, {w_m / w_px:.2f} x {h_m / h_px:.2f} m per pixel")


if __name__ == "__main__":
    main()
