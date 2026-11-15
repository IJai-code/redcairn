"""Render Gale crater and Mount Sharp from real elevation, in Blender (5.x). Run after tools/build_gale.py:

    blender -b --python tools/blender_gale.py -- [--preview]

Inputs (all public, all from Mars Trek or the Curiosity team):
  art/gale/dem.tif     MOLA + HRSC elevation, ~200 m/px
  art/gale/color.jpg   Viking MDIM 2.1 true-colour mosaic
  data/gale.json       Curiosity's whole traverse

Outputs:
  assets/img/gale-wide.jpg   the crater from above the north rim, looking up Mount Sharp
  data/gale-view.json        where the traverse and named places land in that picture (0..1 image coordinates),
                             so the browser can draw the 14-year track over the render and keep it exact
  art/gale.blend             the scene

Heights are stretched three times. Mount Sharp is 5 km tall on a crater 154 km wide; at true scale it reads as a smudge.
"""
import json
import math
import os
import struct
import sys

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
EX = 3.0
KM_PER_DEG = 2 * math.pi * 3389.5 / 360
STRIDE = 2
PREVIEW = "--preview" in sys.argv


def path(*p):
    return os.path.join(ROOT, *p)


def read_tiff_f32(fp):
    """Minimal reader for the uncompressed single-band float32 TIFF that Trek's exportImage returns."""
    with open(fp, "rb") as fh:
        buf = fh.read()
    assert buf[:2] == b"II", "expected little-endian TIFF"
    (ifd,) = struct.unpack_from("<I", buf, 4)
    (n,) = struct.unpack_from("<H", buf, ifd)
    tags = {}
    for k in range(n):
        tag, typ, cnt, val = struct.unpack_from("<HHII", buf, ifd + 2 + 12 * k)
        if typ == 3 and cnt == 1:
            val &= 0xFFFF
        tags[tag] = (typ, cnt, val)

    def arr(tag):
        typ, cnt, val = tags[tag]
        if cnt == 1:
            return [val]
        fmt = "<%d%s" % (cnt, "H" if typ == 3 else "I")
        return list(struct.unpack_from(fmt, buf, val))

    w, h = tags[256][2], tags[257][2]
    assert tags.get(259, (0, 0, 1))[2] == 1, "compressed TIFF"
    if 273 in tags:                                   # strips
        data = b"".join(buf[o:o + c] for o, c in zip(arr(273), arr(279)))
        return np.frombuffer(data, dtype="<f4", count=w * h).reshape(h, w).astype(np.float64)
    tw, th = tags[322][2], tags[323][2]               # tiles
    across = (w + tw - 1) // tw
    out = np.zeros(((h + th - 1) // th * th, across * tw))
    for k, (o, c) in enumerate(zip(arr(324), arr(325))):
        ty, tx = divmod(k, across)
        out[ty * th:(ty + 1) * th, tx * tw:(tx + 1) * tw] = np.frombuffer(buf, dtype="<f4", count=tw * th, offset=o).reshape(th, tw)
    return out[:h, :w]


class Geo:
    def __init__(self, box, dem):
        self.box, self.dem = box, dem
        self.h, self.w = dem.shape
        self.lon0 = (box["west"] + box["east"]) / 2
        self.lat0 = (box["south"] + box["north"]) / 2
        self.kx = KM_PER_DEG * math.cos(math.radians(self.lat0))

    def elev(self, lon, lat):
        b = self.box
        c = (lon - b["west"]) / (b["east"] - b["west"]) * self.w - 0.5
        r = (b["north"] - lat) / (b["north"] - b["south"]) * self.h - 0.5
        c = min(max(c, 0), self.w - 1.001)
        r = min(max(r, 0), self.h - 1.001)
        c0, r0 = int(c), int(r)
        tc, tr = c - c0, r - r0
        z = self.dem
        return float((z[r0, c0] * (1 - tc) + z[r0, c0 + 1] * tc) * (1 - tr) + (z[r0 + 1, c0] * (1 - tc) + z[r0 + 1, c0 + 1] * tc) * tr)

    def xyz(self, lon, lat, lift_km=0.0):
        return Vector(((lon - self.lon0) * self.kx, (lat - self.lat0) * KM_PER_DEG, self.elev(lon, lat) / 1000 * EX + lift_km))


def build_mesh(geo):
    b, dem = geo.box, geo.dem
    rows = np.arange(0, geo.h, STRIDE)
    cols = np.arange(0, geo.w, STRIDE)
    nr, nc = len(rows), len(cols)
    cc, rr = np.meshgrid(cols, rows)
    lon = b["west"] + (cc + 0.5) / geo.w * (b["east"] - b["west"])
    lat = b["north"] - (rr + 0.5) / geo.h * (b["north"] - b["south"])
    verts = np.empty((nr * nc, 3))
    verts[:, 0] = ((lon - geo.lon0) * geo.kx).ravel()
    verts[:, 1] = ((lat - geo.lat0) * KM_PER_DEG).ravel()
    verts[:, 2] = (dem[np.ix_(rows, cols)] / 1000 * EX).ravel()
    idx = np.arange(nr * nc).reshape(nr, nc)
    quads = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new("Gale")
    me.from_pydata(verts.tolist(), [], quads.tolist())
    me.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))
    uv = np.empty((nr * nc, 2))
    uv[:, 0] = ((lon - b["west"]) / (b["east"] - b["west"])).ravel()
    uv[:, 1] = ((lat - b["south"]) / (b["north"] - b["south"])).ravel()
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uv[quads.ravel()].ravel())
    me.update()
    me.validate()
    return me


def ground_material():
    """Viking colour, with a second map that can be laid over it. set_layer() picks which."""
    m = bpy.data.materials.new("Gale ground")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path("art", "gale", "color.jpg"))
    tex.interpolation = "Cubic"
    # The Viking mosaic already carries some shading from its own sun; lift the darks a little so ours leads.
    curve = nt.nodes.new("ShaderNodeBrightContrast")
    curve.inputs["Bright"].default_value = 0.02
    curve.inputs["Contrast"].default_value = -0.08
    nt.links.new(tex.outputs["Color"], curve.inputs["Color"])
    over = nt.nodes.new("ShaderNodeTexImage")
    over.name = "Overlay"
    over.interpolation = "Cubic"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.name = "Mix"
    mix.data_type = "RGBA"
    nt.links.new(curve.outputs["Color"], mix.inputs["A"])
    nt.links.new(over.outputs["Color"], mix.inputs["B"])
    mix.inputs["Factor"].default_value = 0.0
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    return m


# The layers a viewer can switch between, all rendered through the same camera so they line up exactly.
LAYERS = {
    "color": None,
    "height": ("height.jpg", "MIX", 0.88),     # MOLA + HRSC colour-shaded relief
    "geology": ("geology.png", "COLOR", 0.8),  # USGS units: take their hue, keep the ground's light and shade
}


def set_layer(mat, name):
    nt = mat.node_tree
    mix, over = nt.nodes["Mix"], nt.nodes["Overlay"]
    spec = LAYERS[name]
    if not spec:
        mix.inputs["Factor"].default_value = 0.0
        return
    fname, mode, fac = spec
    over.image = bpy.data.images.get(fname) or bpy.data.images.load(path("art", "gale", fname))
    mix.blend_type = mode
    mix.inputs["Factor"].default_value = fac


def setup(sc, geo):
    sun_d = bpy.data.lights.new("Sun", "SUN")
    sun_d.energy = 4.4
    sun_d.angle = math.radians(1.5)
    sun_d.color = (1.0, 0.9, 0.78)
    sun = bpy.data.objects.new("Sun", sun_d)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(71), 0, math.radians(318))   # low late-day sun from the south-west: side light across the flank Curiosity climbs

    # Sky: butterscotch dust at the horizon, darkening overhead.
    world = bpy.data.worlds.new("Mars sky")
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.78, 0.55, 0.38, 1)
    ramp.color_ramp.elements[1].position = 0.45
    ramp.color_ramp.elements[1].color = (0.16, 0.10, 0.08, 1)
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.6
    sc.world = world

    # Dust haze: a bounded slab of thin volume over the crater (an unbounded world volume shadows the sun to black).
    if "--novol" not in sys.argv:
        bpy.ops.mesh.primitive_cube_add(size=1)
        slab = bpy.context.active_object
        slab.name = "Dust"
        slab.scale = (420, 420, 36)
        slab.location = (0, 0, 10)
        vm = bpy.data.materials.new("Dust")
        vm.use_nodes = True
        vnt = vm.node_tree
        vnt.nodes.remove(vnt.nodes["Principled BSDF"])
        vol = vnt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (0.92, 0.66, 0.46, 1)
        vol.inputs["Density"].default_value = 0.0048
        vol.inputs["Anisotropy"].default_value = 0.5
        vnt.links.new(vol.outputs["Volume"], vnt.nodes["Material Output"].inputs["Volume"])
        slab.data.materials.append(vm)
        slab.visible_shadow = False

    sc.render.engine = "BLENDER_EEVEE"
    ee = sc.eevee
    for k, v in (("volumetric_start", 1.0), ("volumetric_end", 400.0), ("volumetric_tile_size", "4"),
                 ("volumetric_samples", 96), ("taa_render_samples", 64)):
        if hasattr(ee, k):
            try:
                setattr(ee, k, v)
            except Exception:
                pass
    sc.render.resolution_x, sc.render.resolution_y = (960, 540) if PREVIEW else (2400, 1350)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 86
    sc.view_settings.view_transform = "Standard"     # keep the Viking colours as they are
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.1


# The view: from the north-west, looking up Mount Sharp. (More can be added; each gets its own image and projection.)
#   wide   above the plains beyond the rim: the whole crater, the mountain in the middle
VIEWS = {
    "wide": {"eye": (137.05, -3.35, 46.0), "target": (137.62, -5.02), "lens": 30},
}


def camera(sc, geo, name):
    v = VIEWS[name]
    cd = bpy.data.cameras.new(name)
    cd.lens = v["lens"]
    cd.clip_start = 0.2
    cd.clip_end = 2000
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    eye = geo.xyz(v["eye"][0], v["eye"][1], 0)
    eye.z = v["eye"][2]
    target = geo.xyz(v["target"][0], v["target"][1], 0)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    return cam


def project(sc, cam, co):
    p = world_to_camera_view(sc, cam, co)
    return [round(p.x, 5), round(1 - p.y, 5)]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = "Gale"
    with open(path("data", "gale.json"), encoding="utf-8") as fh:
        gale = json.load(fh)
    dem = read_tiff_f32(path("art", "gale", "dem.tif"))
    print("DEM", dem.shape, dem.min(), dem.max())
    geo = Geo(gale["box"], dem)

    ob = bpy.data.objects.new("Gale", build_mesh(geo))
    mat = ground_material()
    ob.data.materials.append(mat)
    sc.collection.objects.link(ob)
    setup(sc, geo)
    cams = {name: camera(sc, geo, name) for name in VIEWS}
    bpy.context.view_layer.update()

    # Mount Sharp's summit: the highest cell within 40 km of the crater centre. The floor: the lowest cell in the crater.
    b = gale["box"]
    yy, xx = np.mgrid[0:geo.h, 0:geo.w]
    lon = b["west"] + (xx + 0.5) / geo.w * (b["east"] - b["west"])
    lat = b["north"] - (yy + 0.5) / geo.h * (b["north"] - b["south"])
    dist = np.hypot((lon - 137.8) * geo.kx, (lat + 5.4) * KM_PER_DEG)
    k = np.argmax(np.where(dist < 40, dem, -1e9))
    peak = (float(lon.flat[k]), float(lat.flat[k]), float(dem.flat[k]))
    floor = float(dem[dist < 70].min())
    print("summit", peak, "floor", floor)

    r = gale["rover"]
    places = {
        "landing": {"lonlat": r["landing"], "label": "Landed, August 2012"},
        "rover": {"lonlat": r["latest"], "label": f"Curiosity today, sol {r['latestSol']}"},
        "walk": {"lonlat": [137.3815, -4.8072], "label": "Your walk"},
        "summit": {"lonlat": [peak[0], peak[1]], "label": "Summit of Mount Sharp"},
        "floor": {"lonlat": [float(lon[dist < 70].flat[np.argmin(dem[dist < 70])]), float(lat[dist < 70].flat[np.argmin(dem[dist < 70])])], "label": "Lowest point of the floor"},
        # A point on the far (south-east) rim: 77 km from the centre on a bearing of 135 degrees.
        "rim": {"lonlat": [138.72, -6.32], "label": "Far rim of Gale crater"},
    }
    out_dir = os.environ.get("PREVIEW_DIR", "/tmp") if PREVIEW else path("assets", "img")
    view = {
        "schema": "redcairn.gale-view/1",
        "generatedBy": "tools/blender_gale.py",
        "verticalExaggeration": EX,
        "mountain": {"summitElevM": round(peak[2]), "floorElevM": round(floor), "heightM": round(peak[2] - floor)},
        "views": {},
    }
    # Each geologic unit's colour, read from the USGS map at a point we know is in it.
    gimg = bpy.data.images.load(path("art", "gale", "geology.png"))
    gpx = np.array(gimg.pixels[:]).reshape(gimg.size[1], gimg.size[0], 4)[::-1]
    def unit_color(lonlat):
        c = int((lonlat[0] - b["west"]) / (b["east"] - b["west"]) * gimg.size[0])
        r_ = int((b["north"] - lonlat[1]) / (b["north"] - b["south"]) * gimg.size[1])
        rgb = gpx[r_, c, :3]
        return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in rgb)
    names = dict(gale["geologicUnits"])
    view["geologicUnits"] = [
        {"unit": "Htu", "name": names.get("Htu", "Htu"), "color": unit_color((peak[0], peak[1]))},
        {"unit": "AHi", "name": names.get("AHi", "AHi"), "color": unit_color(r["landing"])},
    ]
    seen = {}
    for m in gale["waterMinerals"]:
        seen.setdefault((m["lon"], m["lat"]), []).append(m["instrument"])

    for name, cam in cams.items():
        sc.camera = cam
        view["views"][name] = {
            "width": sc.render.resolution_x, "height": sc.render.resolution_y,
            "images": {layer: f"assets/img/gale-{name}-{layer}.jpg" for layer in LAYERS},
            "track": [project(sc, cam, geo.xyz(a, c, 0.05)) for a, c in gale["traverse"]],
            "places": {k_: dict(p, xy=project(sc, cam, geo.xyz(p["lonlat"][0], p["lonlat"][1], 0))) for k_, p in places.items()},
            "waterMinerals": [{"lonlat": [lo, la], "instruments": sorted(ins), "xy": project(sc, cam, geo.xyz(lo, la, 0))}
                              for (lo, la), ins in seen.items()],
        }
        for layer in LAYERS:
            set_layer(mat, layer)
            sc.render.filepath = os.path.join(out_dir, f"gale-{name}-{layer}.jpg")
            bpy.ops.render.render(write_still=True)
            print("wrote", sc.render.filepath)
        set_layer(mat, "color")
    target = path("data", "gale-view.json") if not PREVIEW else os.path.join(out_dir, "gale-view.json")
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(view, fh, separators=(",", ":"))
    if not PREVIEW:
        bpy.ops.wm.save_as_mainfile(filepath=path("art", "gale.blend"))
    print("mountain", view["mountain"])


main()
