#!/usr/bin/env python3
"""Cut the Jezero walk window out of the 25 cm HiRISE orthomosaic made for Perseverance's landing.

USGS Astrogeology / JPL Mars 2020 Terrain Relative Navigation orthomosaic (3.4 GB BigTIFF, 256 px LZW tiles).
Only the tiles under the window are read, with HTTP range requests, and decoded here (pure-Python LZW).
Writes a 50 cm/pixel greyscale raw file; ffmpeg turns it into the JPEGs the app uses.

  python3 tools/fetch_jezero_ortho.py --cache DIR --window DIR/jezero_window.json
"""
import argparse
import concurrent.futures as cf
import json
import os
import struct
import urllib.request

URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
       "JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif")
R = 3396190.0


def get(lo, hi):
    req = urllib.request.Request(URL, headers={"Range": "bytes=%d-%d" % (lo, hi), "User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise


def lzw(data):
    """TIFF LZW (MSB-first, early change)."""
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b"", b""]
    bits, pos, nbits = 0, 0, 9
    acc = 0
    prev = None
    n = len(data) * 8
    while pos + nbits <= n:
        # read nbits starting at bit pos
        byte = pos >> 3
        chunk = int.from_bytes(data[byte:byte + 4].ljust(4, b"\0"), "big")
        code = (chunk >> (32 - (pos & 7) - nbits)) & ((1 << nbits) - 1)
        pos += nbits
        if code == 256:
            table = table[:258]
            nbits = 9
            prev = None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
            out += entry
            prev = entry
            continue
        if code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        else:
            entry = prev + prev[:1]
            table.append(entry)
        out += entry
        prev = entry
        if len(table) + 1 >= (1 << nbits) and nbits < 12:
            nbits += 1
    return bytes(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--window", required=True)
    a = ap.parse_args()
    win = json.load(open(a.window))["bounds"]
    head = get(0, 15)
    (off,) = struct.unpack_from("<Q", head, 8)
    h = get(off, off + 8 + 20 * 40)
    (n,) = struct.unpack_from("<Q", h, 0)
    tags = {}
    for i in range(n):
        tag, typ, cnt = struct.unpack_from("<HHQ", h, 8 + 20 * i)
        raw = h[8 + 20 * i + 12: 8 + 20 * i + 20]
        tags[tag] = (typ, cnt, raw)
    W = struct.unpack("<Q", tags[256][2])[0]
    H = struct.unpack("<Q", tags[257][2])[0]
    sc_off = struct.unpack("<Q", tags[33550][2])[0]
    tp_off = struct.unpack("<Q", tags[33922][2])[0]
    sx, sy, _ = struct.unpack("<3d", get(sc_off, sc_off + 23))
    tp = struct.unpack("<6d", get(tp_off, tp_off + 47))
    x0, y0 = tp[3] - tp[0] * sx, tp[4] + tp[1] * sy   # map coords of pixel (0, 0)
    print("ortho %dx%d, %.3f m/px, origin %.1f %.1f" % (W, H, sx, x0, y0))
    # The mosaic is in an orthographic projection centred on the landing ellipse (GeoKeys: CT 21).
    import math
    LAT0, LON0 = math.radians(18.4663), math.radians(77.4298)

    def to_px(lon, lat):
        f, l = math.radians(lat), math.radians(lon) - LON0
        x = R * math.cos(f) * math.sin(l)
        y = R * (math.cos(LAT0) * math.sin(f) - math.sin(LAT0) * math.cos(f) * math.cos(l))
        return (x - x0) / sx, (y0 - y) / sy

    STEP = 0.5   # output metres per pixel, on the same lon/lat grid as the elevation window
    mlat = math.radians((win["north"] + win["south"]) / 2)
    w = int((win["east"] - win["west"]) * math.pi / 180 * R * math.cos(mlat) / STEP)
    hgt = int((win["north"] - win["south"]) * math.pi / 180 * R / STEP)
    corners = [to_px(lo, la) for lo in (win["west"], win["east"]) for la in (win["north"], win["south"])]
    c0, c1 = int(min(c[0] for c in corners)) - 2, int(max(c[0] for c in corners)) + 2
    r0, r1 = int(min(c[1] for c in corners)) - 2, int(max(c[1] for c in corners)) + 2
    TW = 256
    across = (W + TW - 1) // TW
    tx0, tx1, ty0, ty1 = c0 // TW, c1 // TW, r0 // TW, r1 // TW
    offs_at = struct.unpack("<Q", tags[324][2])[0]
    cnts_at = struct.unpack("<Q", tags[325][2])[0]
    need = [(ty, tx) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    info = {}
    for ty in range(ty0, ty1 + 1):
        i0, i1 = ty * across + tx0, ty * across + tx1
        o = struct.unpack("<%dQ" % (i1 - i0 + 1), get(offs_at + 8 * i0, offs_at + 8 * i1 + 7))
        c = struct.unpack("<%dQ" % (i1 - i0 + 1), get(cnts_at + 8 * i0, cnts_at + 8 * i1 + 7))
        for k, tx in enumerate(range(tx0, tx1 + 1)):
            info[(ty, tx)] = (o[k], c[k])
    print("tiles", len(need), "output", w, hgt)

    def tile(key):
        o, c = info[key]
        if c == 0:
            return key, bytes(TW * TW)
        d = lzw(get(o, o + c - 1))
        return key, d.ljust(TW * TW, b"\0")[:TW * TW]

    with cf.ThreadPoolExecutor(16) as ex:
        tiles = dict(ex.map(tile, need))
    out = bytearray(w * hgt)
    for y in range(hgt):
        lat = win["north"] - (y + 0.5) / hgt * (win["north"] - win["south"])
        for x in range(w):
            lon = win["west"] + (x + 0.5) / w * (win["east"] - win["west"])
            px, py = to_px(lon, lat)
            s = 0
            for dx, dy in ((0, 0), (1, 1)):
                cx, cy = int(px) + dx, int(py) + dy
                s += tiles[(cy // TW, cx // TW)][(cy % TW) * TW + cx % TW]
            out[y * w + x] = s >> 1
    path = os.path.join(a.cache, "ortho_%dx%d.gray" % (w, hgt))
    open(path, "wb").write(out)
    print("wrote", path)


if __name__ == "__main__":
    main()
