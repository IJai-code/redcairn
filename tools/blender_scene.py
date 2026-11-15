"""REDCAIRN Blender pipeline. Run inside Blender (5.x):

    blender -b --python tools/blender_scene.py -- --rover path/to/rover.blend
    blender -b --python tools/blender_scene.py -- --ortho-only      (just assets/img/site-ortho.jpg)

What it makes, all from the same public elevation and imagery the web app uses:
  assets/img/site-ortho.jpg   orbital mosaic of the site, stitched from art/tiles (HiRISE via Mars Trek), warm-tinted
  assets/models/site.glb      whole-site terrain draped with that mosaic, the EVA route and a cairn at each waypoint
  assets/models/<wp>.glb      each raw 60 m terrain block (art/blocks, from tools/build_terrain.py) with a
                              1.8 m suited figure for scale; the dock block also carries the team's rover
  assets/img/hero.jpg         rendered view of the route climbing the boxwork terrain

The scene is built from an empty file and saved to art/redcairn.blend; the rover file is only read.
"""
import json
import math
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SCENE = "Redcairn"
ZOOM = 16
TILES_PER_DEG = (2 ** ZOOM) * 2 / 360.0
ROVER_SCALE = 0.7          # team model is 4.1 m long; Curiosity-class rovers are about 2.9 m
ROVER_SKIP = ("Ground",)
ACCENT = (1.0, 0.19, 0.05, 1.0)


def path(*parts):
    return os.path.join(ROOT, *parts)


def load_json(*parts):
    with open(path(*parts), encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- data
def load_terrain():
    meta = load_json("data", "terrain.json")
    z = np.fromfile(path("data", "terrain.bin"), dtype="<i2").astype(np.float32)
    z = meta["baseElevM"] + z.reshape(meta["rows"], meta["cols"]) / meta["unitsPerMetre"]
    return meta, z


class Frame:
    """Local metres: +X east, +Y north, +Z up, origin on the ground at the dock."""

    def __init__(self, meta, z, mission):
        self.meta, self.z = meta, z
        b = meta["bounds"]
        self.b = b
        self.dlon = (b["east"] - b["west"]) / meta["cols"]
        self.dlat = (b["north"] - b["south"]) / meta["rows"]
        dock = mission["waypoints"][0]
        self.c0, self.r0 = self.cell(dock["lon"], dock["lat"])
        self.z0 = self.elev(dock["lon"], dock["lat"])

    def cell(self, lon, lat):
        return (lon - self.b["west"]) / self.dlon - 0.5, (self.b["north"] - lat) / self.dlat - 0.5

    def elev(self, lon, lat):
        c, r = self.cell(lon, lat)
        c = min(max(c, 0), self.meta["cols"] - 1.001)
        r = min(max(r, 0), self.meta["rows"] - 1.001)
        c0, r0 = int(c), int(r)
        tc, tr = c - c0, r - r0
        zz = self.z
        return float((zz[r0, c0] * (1 - tc) + zz[r0, c0 + 1] * tc) * (1 - tr) + (zz[r0 + 1, c0] * (1 - tc) + zz[r0 + 1, c0 + 1] * tc) * tr)

    def xyz(self, lon, lat, lift=0.0):
        c, r = self.cell(lon, lat)
        return Vector(((c - self.c0) * self.meta["cellMX"], -(r - self.r0) * self.meta["cellMY"], self.elev(lon, lat) - self.z0 + lift))


# ---------------------------------------------------------------- imagery
def load_grey(fp):
    img = bpy.data.images.load(fp)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, 0]                                       # north-up


def build_ortho(meta):
    """The site's orbital photo, tinted, saved as JPEG. Prefers the near-native HiRISE export from
    tools/build_ortho.py (art/hirise/site.png, already cropped to the bounds); falls back to the zoom-16 tiles."""
    b = meta["bounds"]
    native = path("art", "hirise", "site.png")
    if os.path.exists(native):
        return tint_and_save(load_grey(native))
    names = [n for n in os.listdir(path("art", "tiles")) if n.endswith(".png")]
    rows = sorted({int(n.split("_")[0]) for n in names})
    cols = sorted({int(n.split("_")[1].split(".")[0]) for n in names})
    mosaic = np.zeros((len(rows) * 256, len(cols) * 256), dtype=np.float32)   # row 0 = north
    for n in names:
        r, c = int(n.split("_")[0]), int(n.split("_")[1].split(".")[0])
        img = bpy.data.images.load(path("art", "tiles", n))
        img.colorspace_settings.name = "Non-Color"
        px = np.empty(256 * 256 * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        tile = px.reshape(256, 256, 4)[::-1, :, 0]                              # flip to north-up
        mosaic[(r - rows[0]) * 256:(r - rows[0] + 1) * 256, (c - cols[0]) * 256:(c - cols[0] + 1) * 256] = tile
    ppd = TILES_PER_DEG * 256
    lon0 = cols[0] / TILES_PER_DEG - 180.0
    lat0 = 90.0 - rows[0] / TILES_PER_DEG
    x0, x1 = int(round((b["west"] - lon0) * ppd)), int(round((b["east"] - lon0) * ppd))
    y0, y1 = int(round((lat0 - b["north"]) * ppd)), int(round((lat0 - b["south"]) * ppd))
    return tint_and_save(mosaic[y0:y1, x0:x1])


def tint_and_save(crop):
    lo, hi = np.percentile(crop, 1), np.percentile(crop, 99)
    g = np.clip((crop - lo) / (hi - lo), 0, 1) ** 0.9
    h, w = g.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    # Greyscale orbital image tinted towards the butterscotch of Martian dust; brightness is the real data.
    rgba[..., 0] = 0.16 + 0.80 * g
    rgba[..., 1] = 0.10 + 0.58 * g
    rgba[..., 2] = 0.07 + 0.40 * g
    for old in [i for i in bpy.data.images if i.name.startswith("site-ortho")]:
        bpy.data.images.remove(old)
    out = bpy.data.images.new("site-ortho", w, h, alpha=False)
    out.pixels.foreach_set(rgba[::-1].ravel())
    out.filepath_raw = path("assets", "img", "site-ortho.jpg")
    out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 82
    out.save()
    bpy.data.images.remove(out)
    return bpy.data.images.load(path("assets", "img", "site-ortho.jpg"))


# ---------------------------------------------------------------- helpers
def material(name, color, rough=0.9, emit=0.0, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def fresh_scene():
    """Start from an empty file: the pipeline owns the whole scene, so nothing else can be disturbed."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = SCENE
    sc.unit_settings.system = "METRIC"
    return sc


def link(sc, obj, coll=None):
    (coll or sc.collection).objects.link(obj)
    return obj


def collection(sc, name):
    c = bpy.data.collections.new(name)
    sc.collection.children.link(c)
    return c


def join(context_scene, objs, name):
    with bpy.context.temp_override(scene=context_scene, view_layer=context_scene.view_layers[0],
                                   active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------------------------------------------------------------- geometry
def terrain_mesh(name, frame, stride, mat):
    meta, z = frame.meta, frame.z
    rows = np.arange(0, meta["rows"], stride)
    cols = np.arange(0, meta["cols"], stride)
    nr, nc = len(rows), len(cols)
    cc, rr = np.meshgrid(cols, rows)
    verts = np.empty((nr * nc, 3), dtype=np.float32)
    verts[:, 0] = ((cc - frame.c0) * meta["cellMX"]).ravel()
    verts[:, 1] = (-(rr - frame.r0) * meta["cellMY"]).ravel()
    verts[:, 2] = (z[np.ix_(rows, cols)] - frame.z0).ravel()
    idx = np.arange(nr * nc).reshape(nr, nc)
    quads = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], quads.tolist())
    me.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))
    uv = np.empty((nr * nc, 2), dtype=np.float32)
    uv[:, 0] = ((cc + 0.5) / meta["cols"]).ravel()
    uv[:, 1] = (1.0 - (rr + 0.5) / meta["rows"]).ravel()
    layer = me.uv_layers.new(name="UVMap")
    layer.data.foreach_set("uv", uv[quads.ravel()].ravel())
    me.update()
    me.validate()
    me.materials.append(mat)
    return bpy.data.objects.new(name, me)


def terrain_material(image):
    m = bpy.data.materials.get("Site terrain") or bpy.data.materials.new("Site terrain")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.get("Ortho") or nt.nodes.new("ShaderNodeTexImage")
    tex.name = "Ortho"
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    return m


def route_curve(frame, route, radius, mat):
    cu = bpy.data.curves.new("EVA route", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    pts = route["eva"]
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        co = frame.xyz(v["lon"], v["lat"], lift=radius * 0.6)
        p.co = (co.x, co.y, co.z, 1.0)
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.materials.append(mat)
    return bpy.data.objects.new("EVA route", cu)


def cairn(sc, name, height, mat):
    """Three stacked stones: the project's mark, and the trail marker it is named for."""
    stones = []
    zc = 0.0
    for k, (rx, rz) in enumerate(((0.50, 0.19), (0.37, 0.16), (0.24, 0.15))):
        me = bpy.data.meshes.new(f"{name} stone {k}")
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in bm.verts:
            wob = 1.0 + 0.08 * math.sin(v.co.x * 5.1 + k) * math.cos(v.co.y * 4.3 + k * 2)
            v.co = Vector((v.co.x * rx * wob, v.co.y * rx * wob * 0.9, v.co.z * rz))
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        o = link(sc, bpy.data.objects.new(me.name, me))
        o.location.z = zc + rz
        o.rotation_euler.z = k * 1.1
        zc += rz * 1.9
        me.materials.append(mat)
        stones.append(o)
    obj = join(sc, stones, name)
    with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0], active_object=obj, selected_editable_objects=[obj], selected_objects=[obj]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    s = height / zc
    obj.scale = (s, s, s)
    return obj


def crew_figure(sc, name="Crew"):
    """A 1.8 m suited figure built from primitives, for scale. Faces +Y."""
    import bmesh
    suit = material("Suit white", (0.86, 0.85, 0.82, 1), 0.7)
    dark = material("Suit dark", (0.10, 0.11, 0.12, 1), 0.6)
    visor = material("Visor gold", (0.85, 0.55, 0.12, 1), 0.15, metal=1.0)
    stripe = material("Suit stripe", ACCENT, 0.6)
    parts = []

    def prim(kind, mat, loc, scale, rot=(0, 0, 0)):
        me = bpy.data.meshes.new(name + " part")
        bm = bmesh.new()
        if kind == "sphere":
            bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
        elif kind == "cyl":
            bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=1.0, radius2=1.0, depth=2.0)
        else:
            bmesh.ops.create_cube(bm, size=2.0)
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.25, segments=2, affect="EDGES")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = kind != "box"
        me.materials.append(mat)
        o = link(sc, bpy.data.objects.new(me.name, me))
        o.location, o.scale, o.rotation_euler = loc, scale, rot
        parts.append(o)

    for sx in (-1, 1):
        prim("cyl", suit, (sx * 0.11, 0, 0.45), (0.085, 0.09, 0.37))                 # legs
        prim("box", dark, (sx * 0.11, 0.03, 0.05), (0.09, 0.15, 0.05))               # boots
        prim("cyl", suit, (sx * 0.30, 0, 1.08), (0.065, 0.07, 0.30), (0, sx * 0.14, 0))  # arms
        prim("sphere", dark, (sx * 0.345, 0, 0.76), (0.07, 0.07, 0.08))              # gloves
    prim("cyl", suit, (0, 0, 1.10), (0.21, 0.15, 0.32))                               # torso
    prim("box", suit, (0, -0.21, 1.14), (0.19, 0.10, 0.30))                           # life-support pack
    prim("box", stripe, (0, -0.315, 1.30), (0.12, 0.012, 0.03))                       # pack stripe
    prim("box", dark, (0, 0.155, 1.12), (0.11, 0.03, 0.09))                           # chest unit
    prim("sphere", suit, (0, 0, 1.60), (0.19, 0.20, 0.20))                            # helmet
    prim("sphere", visor, (0, 0.085, 1.60), (0.15, 0.14, 0.14))                       # visor
    obj = join(sc, parts, name)
    with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0], active_object=obj, selected_editable_objects=[obj], selected_objects=[obj]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def copy_rover(sc, rover_blend, coll):
    """Append the team's rover meshes from their .blend (read-only) under one parent, scaled, sitting on z = 0."""
    if not rover_blend or not os.path.exists(rover_blend):
        return None
    with bpy.data.libraries.load(rover_blend, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n not in ROVER_SKIP]
    meshes = [o for o in dst.objects if o is not None and o.type == "MESH"]
    for o in dst.objects:
        if o is not None and o.type != "MESH":
            bpy.data.objects.remove(o)
    if not meshes:
        return None
    for o in meshes:
        link(sc, o, coll)
    sc.view_layers[0].update()
    zmin = min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
    xs = [(o.matrix_world @ Vector(c)).x for o in meshes for c in o.bound_box]
    ys = [(o.matrix_world @ Vector(c)).y for o in meshes for c in o.bound_box]
    centre = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, zmin))
    from mathutils import Matrix
    shift = Matrix.Translation(-centre)
    root = link(sc, bpy.data.objects.new("Rover", None), coll)
    worlds = {o: shift @ o.matrix_world for o in meshes}
    for o in meshes:
        o.parent = root                   # root sits at the origin with no rotation or scale yet
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.matrix_basis = worlds[o]
    root.scale = (ROVER_SCALE,) * 3
    return root


def drop_to(obj_or_xy, ground, lift=0.0):
    """Height of the ground object under an XY position."""
    x, y = obj_or_xy
    hit, loc, _, _ = ground.ray_cast(ground.matrix_world.inverted() @ Vector((x, y, 500.0)), Vector((0, 0, -1)))
    return (ground.matrix_world @ loc).z + lift if hit else lift


# ---------------------------------------------------------------- exports
def export_glb(sc, objs, filepath, jpeg=False):
    for o in sc.objects:
        o.select_set(False)
    sel = []
    for o in objs:
        sel.append(o)
        sel.extend(o.children_recursive)
    with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0], selected_objects=sel, active_object=sel[0]):
        for o in sel:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=filepath, export_format="GLB", use_selection=True, export_yup=True,
                                  export_apply=True, export_cameras=False, export_lights=False,
                                  export_image_format="JPEG" if jpeg else "AUTO")
    return os.path.getsize(filepath)


def build_blocks(sc, mission, crew, rover):
    out = {}
    work = collection(sc, "Block export")
    for wp in mission["waypoints"]:
        base = os.path.basename(wp["model"]["src"])
        before = set(bpy.data.objects)
        with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0], collection=work):
            bpy.ops.import_scene.gltf(filepath=path("art", "blocks", base))
        new = [o for o in bpy.data.objects if o not in before]
        block = next(o for o in new if o.type == "MESH")
        bpy.context.view_layer.update() if bpy.context.scene is sc else sc.view_layers[0].update()
        figure = crew.copy()
        link(sc, figure, work)
        figure.location = (0, 0, drop_to((0, 0), block))
        figure.rotation_euler.z = math.radians(160)
        extras = [figure]
        if wp["type"] == "dock" and rover:
            r = rover.copy()
            link(sc, r, work)
            for child in rover.children:
                c = child.copy()
                link(sc, c, work)
                c.parent = r
                c.matrix_parent_inverse = child.matrix_parent_inverse.copy()
            r.location = (5.5, -4.0, drop_to((5.5, -4.0), block))
            r.rotation_euler.z = math.radians(35)
            extras.append(r)
        out[base] = export_glb(sc, [block] + extras, path("assets", "models", base))
        for o in new + extras + [c for e in extras for c in e.children_recursive]:
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
    return out


# ---------------------------------------------------------------- render
def setup_render(sc, frame, mission):
    wps = mission["waypoints"]
    dock, far = frame.xyz(wps[0]["lon"], wps[0]["lat"]), frame.xyz(wps[-1]["lon"], wps[-1]["lat"])
    mid = frame.xyz(wps[2]["lon"], wps[2]["lat"])
    cam_data = bpy.data.cameras.new("Hero camera")
    cam_data.lens = 85           # long lens from the north end, so the view runs up the trail and stays inside the data
    cam_data.clip_end = 5000
    cam = link(sc, bpy.data.objects.new("Hero camera", cam_data))
    cam.location = dock + Vector((34, 104, 78))
    aim = (mid * 0.55 + far * 0.45) + Vector((0, 0, 8))
    cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 5.0
    sun_data.angle = math.radians(2)
    sun_data.color = (1.0, 0.86, 0.72)
    sun = link(sc, bpy.data.objects.new("Sun", sun_data))
    sun.rotation_euler = (math.radians(66), 0, math.radians(-62))   # low sun from the west-south-west
    world = bpy.data.worlds.new("Mars sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.50, 0.33, 0.21, 1)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = world
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 88
    sc.view_settings.view_transform = "Standard"   # keep the trail its true orange
    sc.view_settings.exposure = -0.35
    return cam


def render(sc, filepath):
    sc.render.filepath = filepath
    bpy.ops.render.render(scene=sc.name, write_still=True)
    return os.path.getsize(filepath)


# ---------------------------------------------------------------- main
def build_all(rover_blend=None, do_render=True):
    mission = load_json("data", "mission.json")
    route = load_json("data", "route.json")
    meta, z = load_terrain()
    frame = Frame(meta, z, mission)
    report = {}

    sc = fresh_scene()
    ortho = build_ortho(meta)
    report["ortho"] = tuple(ortho.size)
    tmat = terrain_material(ortho)
    full = link(sc, terrain_mesh("Site terrain", frame, 1, tmat))
    route_mat = material("Route", ACCENT, 0.5, emit=1.0)
    cairn_mat = material("Cairn", (1.0, 0.45, 0.2, 1.0), 0.6, emit=0.8)

    # Whole-site model for the web: half-resolution terrain, route and oversized cairn markers.
    web = collection(sc, "Site web model")
    lite = link(sc, terrain_mesh("Site terrain lite", frame, 2, tmat), web)
    web_route = link(sc, route_curve(frame, route, 1.4, route_mat), web)
    cairns = []
    for wp in mission["waypoints"]:
        c = cairn(sc, f"Cairn {wp['id']}", 14.0, cairn_mat)
        sc.collection.objects.unlink(c)
        web.objects.link(c)
        c.location = frame.xyz(wp["lon"], wp["lat"])
        cairns.append(c)
    report["site.glb"] = export_glb(sc, [lite, web_route] + cairns, path("assets", "models", "site.glb"), jpeg=True)
    lite.hide_render = True

    crew = crew_figure(sc)
    rover = copy_rover(sc, rover_blend, collection(sc, "Rover copy"))
    report["rover"] = bool(rover)
    report.update(build_blocks(sc, mission, crew, rover))

    # Stage the dock for the render: figure and rover at true scale beside the first cairn.
    dock = frame.xyz(mission["waypoints"][0]["lon"], mission["waypoints"][0]["lat"])
    crew.location = dock + Vector((3, 2, 0))
    if rover:
        rover.location = dock + Vector((7, -3, 0.3))
    if do_render:
        setup_render(sc, frame, mission)
        report["hero.jpg"] = render(sc, path("assets", "img", "hero.jpg"))
    return report


if __name__ == "__main__":
    # Headless use:  blender -b --python tools/blender_scene.py -- [--rover path/to/rover.blend] [--no-render]
    import sys
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    rover_file = args[args.index("--rover") + 1] if "--rover" in args else None
    if "--ortho-only" in args:                     # just the walk diorama's ground photo
        fresh_scene()
        im = build_ortho(load_terrain()[0])
        print("REDCAIRN_REPORT", json.dumps({"ortho": tuple(im.size)}))
    else:
        result = build_all(rover_blend=rover_file, do_render="--no-render" not in args)
        print("REDCAIRN_REPORT", json.dumps(result))
        bpy.ops.wm.save_as_mainfile(filepath=path("art", "redcairn.blend"))
