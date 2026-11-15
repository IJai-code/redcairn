"""Turn the team's rover model into a light web model with six spinning wheels. Run inside Blender (5.x):

    blender -b --python tools/blender_rover.py -- /path/to/rover_v8_ultra_detailed.stl [--preview out.png]

The STL is one mesh in millimetres (191,220 triangles, +X forward, +Z up, wheel axles 262 mm above ground).
This script splits it into loose parts, gathers the parts of each of the six wheels around its axle,
merges and decimates the body and the wheels, and writes:

  assets/models/rover.bin    int16 millimetre positions + int8 normals + uint16/uint32 indices, per part
  data/rover.json            the parts table: offsets, counts, colours, and each wheel's axle centre in metres

js/scene.js reads these straight into three.js buffers (no loader library), spins each wheel about its
axle by distance travelled and tilts the body to the real terrain under it.
"""
import json
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
STL = ARGS[0] if ARGS else os.path.expanduser("~/Downloads/rover_v8_ultra_detailed.stl")
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None

WHEEL_X = (900.0, -50.0, -850.0)     # mm, from the part survey
WHEEL_Y = 1050.0
AXLE_Z = 262.0
BODY_RATIO = 0.18
WHEEL_RATIO = 0.3


def parts_of(ob):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def centre(o):
    vs = np.array([v.co[:] for v in o.data.vertices])
    lo, hi = vs.min(0), vs.max(0)
    return (lo + hi) / 2, hi - lo


def wheel_of(o):
    c, size = centre(o)
    for i, wx in enumerate(WHEEL_X):
        for side in (-1, 1):
            if abs(c[0] - wx) < 60 and abs(c[2] - AXLE_Z) < 60 and 820 <= side * c[1] <= 1300 and max(size[0], size[2]) <= 520:
                return i * 2 + (0 if side < 0 else 1)
    return None


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def decimate(o, ratio):
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
    me = o.data
    me.polygons.foreach_set("use_smooth", [False] * len(me.polygons))


def pack(o, origin_mm):
    me = o.data
    me.calc_loop_triangles()
    tris = me.loop_triangles
    # Flat-shaded: three vertices per triangle, each with its face normal (crisp machined look, simple to pack).
    pos, nor = [], []
    for t in tris:
        n = t.normal
        for vi in t.vertices:
            p = me.vertices[vi].co
            pos.append((p.x - origin_mm[0], p.y - origin_mm[1], p.z - origin_mm[2]))
            nor.append((n.x, n.y, n.z))
    pos = np.clip(np.round(np.array(pos)), -32767, 32767).astype("<i2")
    nor = np.clip(np.round(np.array(nor) * 127), -127, 127).astype("i1")
    return pos.tobytes(), nor.tobytes(), len(pos)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=STL)
    src = bpy.context.selected_objects[0]
    print("source triangles", len(src.data.polygons))
    parts = parts_of(src)
    wheels = {i: [] for i in range(6)}
    body = []
    for o in parts:
        w = wheel_of(o)
        (wheels[w] if w is not None else body).append(o)
    print("body parts", len(body), "wheel parts", [len(v) for v in wheels.values()])

    out = []
    b = join(body, "body")
    decimate(b, BODY_RATIO)
    out.append(("body", b, (0.0, 0.0, 0.0), "#e9e4da"))
    for i in range(6):
        w = join(wheels[i], f"wheel{i}")
        decimate(w, WHEEL_RATIO)
        x = WHEEL_X[i // 2]
        y = -WHEEL_Y if i % 2 == 0 else WHEEL_Y
        out.append((f"wheel{i}", w, (x, y, AXLE_Z), "#8d8a84"))

    blob = bytearray()
    table = []
    for name, o, origin, colour in out:
        p, n, count = pack(o, origin)
        while len(blob) % 4:
            blob += b"\0"
        po = len(blob)
        blob += p
        no = len(blob)
        blob += n
        table.append({"name": name, "count": count, "positions": po, "normals": no, "colour": colour,
                      "origin": [round(v / 1000, 4) for v in origin]})
        print(name, "triangles", count // 3)
    with open(os.path.join(ROOT, "assets", "models", "rover.bin"), "wb") as fh:
        fh.write(blob)
    meta = {
        "schema": "redcairn.rover/1",
        "generatedBy": "tools/blender_rover.py",
        "source": "Team rover model (rover_v8_ultra_detailed.stl), decimated in Blender",
        "unitsPerMetre": 1000,
        "axes": "+X forward, +Y left, +Z up (Blender); the web app maps to three.js Y-up",
        "wheelRadiusM": 0.252,
        "lengthM": 3.737,
        "bin": "assets/models/rover.bin",
        "parts": table,
    }
    with open(os.path.join(ROOT, "data", "rover.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    print("bytes", len(blob))

    if PREVIEW:
        sc = bpy.context.scene
        for _, o, _, _ in out:
            o.scale = (0.001, 0.001, 0.001)
        cd = bpy.data.cameras.new("cam")
        cd.clip_start, cd.clip_end = 0.01, 100
        cam = bpy.data.objects.new("cam", cd)
        sc.collection.objects.link(cam)
        cam.location = (5.5, -5.0, 3.2)
        cam.rotation_euler = (Vector((0.1, 0, 0.9)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 4
        sun.rotation_euler = (0.9, 0.2, 0.7)
        sc.collection.objects.link(sun)
        w = bpy.data.worlds.new("w")
        sc.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.32, 0.24, 1)
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = 900, 600
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)


main()
