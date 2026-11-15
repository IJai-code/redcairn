"""Build the globe texture: Viking's true-colour mosaic of Mars, from Mars Trek's tiles. Run inside Blender (5.x):

    blender -b --python tools/blender_globe.py

Downloads the zoom-3 tiles (16 x 8, 256 px each) of Mars_Viking_MDIM21_ClrMosaic_global_232m into art/globe/,
stitches them with Blender's image API and writes assets/img/mars-viking.jpg (4096 x 2048, equirectangular,
west edge at 180 W, north at the top), which js/scene.js wraps on the globe.
"""
import os
import urllib.request

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LAYER = "Mars_Viking_MDIM21_ClrMosaic_global_232m"
URL = "https://trek.nasa.gov/tiles/Mars/EQ/" + LAYER + "/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
Z = 3
COLS, ROWS, T = 2 * 2 ** Z, 2 ** Z, 256


def main():
    tiles = os.path.join(ROOT, "art", "globe")
    os.makedirs(tiles, exist_ok=True)
    out = np.zeros((ROWS * T, COLS * T, 4), dtype=np.float32)
    for y in range(ROWS):
        for x in range(COLS):
            fp = os.path.join(tiles, f"{Z}_{y}_{x}.jpg")
            if not os.path.exists(fp):
                req = urllib.request.Request(URL.format(z=Z, y=y, x=x), headers={"User-Agent": "redcairn-data-builder"})
                with urllib.request.urlopen(req, timeout=60) as r, open(fp, "wb") as fh:
                    fh.write(r.read())
            img = bpy.data.images.load(fp)
            px = np.empty(T * T * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            # Blender stores rows bottom-up; tile row 0 is the north edge, so flip into a north-up array.
            out[y * T:(y + 1) * T, x * T:(x + 1) * T] = px.reshape(T, T, 4)[::-1]
    h, w = out.shape[:2]
    im = bpy.data.images.new("mars-viking", w, h, alpha=False)
    im.colorspace_settings.name = "sRGB"
    im.pixels.foreach_set(out[::-1].ravel())
    im.filepath_raw = os.path.join(ROOT, "assets", "img", "mars-viking.jpg")
    im.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 84
    im.save()
    print("wrote", im.filepath_raw, w, h)


main()
