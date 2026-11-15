#!/usr/bin/env python3
"""Build the terrain grid and per-waypoint 3D terrain blocks from the orbital DEM.

Outputs
  data/terrain.bin     int16 little-endian elevations (decimetres above baseElevM), 2 m cells, row 0 = north
  data/terrain.json    grid georeferencing and encoding
  art/blocks/*.glb     60 m x 60 m true-scale terrain block around each waypoint (1 m posts),
                       tinted by slope class. tools/blender_scene.py then adds the crew figure and rover in Blender

Source (public, no key): 1 m HiRISE stereo DEM of Gale crater served by Mars Trek
  https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer

Usage
  python3 tools/build_terrain.py              # fetch live and rebuild
  python3 tools/build_terrain.py --cache DIR  # reuse/keep the downloaded raster in DIR

Standard library only.
"""
import argparse
import json
import math
import os
import struct
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXPORT_URL = "https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer/exportImage"
MARS_RADIUS_M = 3396190.0
M_PER_DEG = math.pi * MARS_RADIUS_M / 180.0

GRID_STEP = 2          # terrain.bin keeps every 2nd metre (2x2 mean)
BLOCK_HALF_M = 30      # GLB block half-width in metres
SKIRT_DEPTH_M = 4.0
CAUTION_DEG, NOGO_DEG = 15.0, 20.0


def fetch_dem(bounds, width, height, cache_dir):
    name = "dem_%d_%d.tif" % (width, height)
    if cache_dir and os.path.exists(os.path.join(cache_dir, name)):
        with open(os.path.join(cache_dir, name), "rb") as fh:
            return fh.read()
    query = urllib.parse.urlencode({
        "bbox": "%s,%s,%s,%s" % (bounds["west"], bounds["south"], bounds["east"], bounds["north"]),
        "bboxSR": 104905, "imageSR": 104905, "size": "%d,%d" % (width, height),
        "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
        "compression": "None", "f": "image",
    })
    req = urllib.request.Request(EXPORT_URL + "?" + query, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        with open(os.path.join(cache_dir, name), "wb") as fh:
            fh.write(raw)
    return raw


def read_tiff_f32(raw):
    """Minimal reader: little-endian, uncompressed, 32-bit float, strips or tiles; returns (w, h, rows)."""
    if raw[:4] != b"II*\x00":
        raise ValueError("expected little-endian TIFF")
    (ifd,) = struct.unpack_from("<I", raw, 4)
    (n,) = struct.unpack_from("<H", raw, ifd)
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}
    fmts = {1: "B", 3: "H", 4: "I", 11: "f", 12: "d", 16: "Q"}
    tags = {}
    for k in range(n):
        tag, typ, count, _ = struct.unpack_from("<HHII", raw, ifd + 2 + 12 * k)
        if typ not in fmts:
            continue
        off = ifd + 2 + 12 * k + 8
        if sizes[typ] * count > 4:
            (off,) = struct.unpack_from("<I", raw, off)
        tags[tag] = list(struct.unpack_from("<%d%s" % (count, fmts[typ]), raw, off))
    w, h = tags[256][0], tags[257][0]
    if tags.get(259, [1])[0] != 1 or tags[258][0] != 32 or tags.get(339, [1])[0] != 3:
        raise ValueError("expected uncompressed 32-bit float samples")
    spp = tags.get(277, [1])[0]
    planar = tags.get(284, [1])[0]
    if spp != 1 and planar != 1:
        raise ValueError("unsupported planar layout")
    grid = [[0.0] * w for _ in range(h)]
    if 322 in tags:  # tiled
        tw, th = tags[322][0], tags[323][0]
        across = (w + tw - 1) // tw
        for t, off in enumerate(tags[324]):
            tx, ty = (t % across) * tw, (t // across) * th
            if ty >= h:
                break
            vals = struct.unpack_from("<%df" % (tw * th * spp), raw, off)
            for r in range(min(th, h - ty)):
                base = r * tw * spp
                row = grid[ty + r]
                for c in range(min(tw, w - tx)):
                    row[tx + c] = vals[base + c * spp]
    else:
        rps = tags.get(278, [h])[0]
        for s, off in enumerate(tags[273]):
            y0 = s * rps
            rows = min(rps, h - y0)
            vals = struct.unpack_from("<%df" % (rows * w * spp), raw, off)
            for r in range(rows):
                base = r * w * spp
                grid[y0 + r] = [vals[base + c * spp] for c in range(w)]
    return w, h, grid


def slope_deg(grid, x, y, w, h, post_m):
    x0, x1 = max(0, x - 1), min(w - 1, x + 1)
    y0, y1 = max(0, y - 1), min(h - 1, y + 1)
    dzdx = (grid[y][x1] - grid[y][x0]) / ((x1 - x0) * post_m)
    dzdy = (grid[y1][x] - grid[y0][x]) / ((y1 - y0) * post_m)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy))), dzdx, dzdy


def slope_color(deg):
    if deg >= NOGO_DEG:
        return (0.86, 0.26, 0.22)
    if deg >= CAUTION_DEG:
        return (0.92, 0.62, 0.16)
    t = min(1.0, deg / CAUTION_DEG)
    return (0.70 - 0.10 * t, 0.50 - 0.08 * t, 0.37 - 0.07 * t)


def write_glb(path, grid, w, h, cx, cy, post_m):
    half = BLOCK_HALF_M
    x0, y0 = cx - half, cy - half
    n = 2 * half + 1
    if x0 < 1 or y0 < 1 or x0 + n >= w - 1 or y0 + n >= h - 1:
        raise ValueError("waypoint too close to the raster edge for a terrain block")
    zc = grid[cy][cx]
    pos, nrm, col, idx = [], [], [], []

    for j in range(n):
        for i in range(n):
            gx, gy = x0 + i, y0 + j
            deg, dzdx, dzdy = slope_deg(grid, gx, gy, w, h, post_m)
            pos.append(((i - half) * post_m, grid[gy][gx] - zc, (j - half) * post_m))
            # y = h(x east, z south); rows run north to south so dz/dz_south = +dzdy
            nx, ny, nz = -dzdx, 1.0, -dzdy
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            nrm.append((nx / ln, ny / ln, nz / ln))
            col.append(slope_color(deg))
    for j in range(n - 1):
        for i in range(n - 1):
            a, b, c, d = j * n + i, (j + 1) * n + i, j * n + i + 1, (j + 1) * n + i + 1
            idx += [a, b, c, c, b, d]

    # Skirts make the block read as a cut cross-section.
    floor = min(p[1] for p in pos) - SKIRT_DEPTH_M
    strata = ((0.42, 0.28, 0.21), (0.30, 0.20, 0.16))
    edges = [
        ([(i, 0) for i in range(n)], (0.0, 0.0, -1.0), False),        # north face
        ([(i, n - 1) for i in range(n)], (0.0, 0.0, 1.0), True),       # south face
        ([(0, j) for j in range(n)], (-1.0, 0.0, 0.0), True),          # west face
        ([(n - 1, j) for j in range(n)], (1.0, 0.0, 0.0), False),      # east face
    ]
    for cells, normal, flip in edges:
        start = len(pos)
        for (i, j) in cells:
            top = pos[j * n + i]
            pos.append(top); nrm.append(normal); col.append(strata[0])
            pos.append((top[0], floor, top[2])); nrm.append(normal); col.append(strata[1])
        for k in range(len(cells) - 1):
            a, b, c, d = start + 2 * k, start + 2 * k + 1, start + 2 * k + 2, start + 2 * k + 3
            idx += ([a, c, b, b, c, d] if flip else [a, b, c, c, b, d])

    if len(pos) > 65535:
        raise ValueError("too many vertices for 16-bit indices")
    buf_pos = b"".join(struct.pack("<3f", *p) for p in pos)
    buf_nrm = b"".join(struct.pack("<3f", *p) for p in nrm)
    buf_col = b"".join(struct.pack("<3f", *p) for p in col)
    buf_idx = struct.pack("<%dH" % len(idx), *idx)
    buf_idx += b"\x00" * ((4 - len(buf_idx) % 4) % 4)
    blob = buf_pos + buf_nrm + buf_col + buf_idx
    o1, o2, o3 = len(buf_pos), len(buf_pos) + len(buf_nrm), len(buf_pos) + len(buf_nrm) + len(buf_col)
    doc = {
        "asset": {"version": "2.0", "generator": "redcairn tools/build_terrain.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": os.path.splitext(os.path.basename(path))[0]}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2}, "indices": 3, "material": 0}]}],
        "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.95},
                       "doubleSided": True}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(buf_pos), "target": 34962},
            {"buffer": 0, "byteOffset": o1, "byteLength": len(buf_nrm), "target": 34962},
            {"buffer": 0, "byteOffset": o2, "byteLength": len(buf_col), "target": 34962},
            {"buffer": 0, "byteOffset": o3, "byteLength": len(idx) * 2, "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": [min(p[k] for p in pos) for k in range(3)], "max": [max(p[k] for p in pos) for k in range(3)]},
            {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(pos), "type": "VEC3"},
            {"bufferView": 3, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
    }
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(js), b"JSON")); fh.write(js)
        fh.write(struct.pack("<I4s", len(blob), b"BIN\x00")); fh.write(blob)
    return len(pos), len(idx) // 3, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=None)
    args = ap.parse_args()

    with open(os.path.join(ROOT, "data", "mission.json"), encoding="utf-8") as fh:
        mission = json.load(fh)
    b = mission["site"]["bounds"]
    lat_mid = math.radians((b["north"] + b["south"]) / 2.0)
    width = int(round((b["east"] - b["west"]) * M_PER_DEG * math.cos(lat_mid)))
    height = int(round((b["north"] - b["south"]) * M_PER_DEG))
    width += width % 2
    height += height % 2

    w, h, grid = read_tiff_f32(fetch_dem(b, width, height, args.cache))
    flat = [v for row in grid for v in row]
    lo, hi = min(flat), max(flat)
    if lo < -10000 or hi > 30000:
        raise ValueError("raster contains no-data values (min %.1f, max %.1f)" % (lo, hi))
    post_x = (b["east"] - b["west"]) * M_PER_DEG * math.cos(lat_mid) / w
    post_y = (b["north"] - b["south"]) * M_PER_DEG / h
    post_m = (post_x + post_y) / 2.0
    print("raster %dx%d, post %.3f x %.3f m, elev %.1f..%.1f m" % (w, h, post_x, post_y, lo, hi))

    # 2 m routing grid
    cols, rows = w // GRID_STEP, h // GRID_STEP
    base = math.floor(lo)
    out = bytearray()
    for r in range(rows):
        for c in range(cols):
            s = 0.0
            for dy in range(GRID_STEP):
                for dx in range(GRID_STEP):
                    s += grid[r * GRID_STEP + dy][c * GRID_STEP + dx]
            out += struct.pack("<h", int(round((s / (GRID_STEP * GRID_STEP) - base) * 10)))
    with open(os.path.join(ROOT, "data", "terrain.bin"), "wb") as fh:
        fh.write(out)
    meta = {
        "schema": "redcairn.terrain/1",
        "generatedBy": "tools/build_terrain.py",
        "source": "https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer",
        "credit": "NASA/JPL-Caltech/University of Arizona/USGS",
        "file": "data/terrain.bin",
        "encoding": "int16 little-endian, row-major, row 0 is the northern edge",
        "cols": cols, "rows": rows,
        "bounds": {"west": b["west"], "east": b["west"] + cols * GRID_STEP * (b["east"] - b["west"]) / w,
                   "north": b["north"], "south": b["north"] - rows * GRID_STEP * (b["north"] - b["south"]) / h},
        "cellMX": round(post_x * GRID_STEP, 4), "cellMY": round(post_y * GRID_STEP, 4),
        "baseElevM": base, "unitsPerMetre": 10,
        "minElevM": round(lo, 2), "maxElevM": round(hi, 2),
    }
    with open(os.path.join(ROOT, "data", "terrain.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
        fh.write("\n")
    print("terrain.bin %dx%d cells, %d bytes" % (cols, rows, len(out)))

    for wp in mission["waypoints"]:
        if not wp.get("model", {}).get("src"):
            continue
        cx = int(round((wp["lon"] - b["west"]) / (b["east"] - b["west"]) * w - 0.5))
        cy = int(round((b["north"] - wp["lat"]) / (b["north"] - b["south"]) * h - 0.5))
        path = os.path.join(ROOT, "art", "blocks", os.path.basename(wp["model"]["src"]))  # raw block; Blender writes the final model
        os.makedirs(os.path.dirname(path), exist_ok=True)
        nv, nt, size = write_glb(path, grid, w, h, cx, cy, post_m)
        print("%s  %s  dem %.1f m  %d verts %d tris %d bytes" % (wp["id"], wp["model"]["src"], grid[cy][cx], nv, nt, size))


if __name__ == "__main__":
    main()
