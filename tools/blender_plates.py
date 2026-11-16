"""REDCAIRN story plates: illustrations drawn by Blender from the real ground. Run inside Blender (5.x):

    blender -b --python tools/blender_plates.py -- [--preview] [--only p3]

Every plate is the real 1 m elevation model of the walk (data/terrain.bin, from Mars Trek), shaded in flat
illustration tones with ink contour lines every 2 m of real height, like a field map stood up in 3D. The team's
rover (~/Downloads/rover_v8_ultra_detailed.stl, at true size: 2.2 m to the mast top, like Curiosity) and a 1.8 m suited figure stand at
real waypoints. No AI images: every line is computed from NASA elevation data.

Writes assets/img/plates/<id>.jpg (1920 x 1080; 640 x 360 with --preview).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_scene as bs  # noqa: E402  (shared terrain frame, mesh and figure helpers)

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
ONLY = ARGS[ARGS.index("--only") + 1].split(",") if "--only" in ARGS else None
STL = os.path.expanduser("~/Downloads/rover_v8_ultra_detailed.stl")
SITE = "jezero" if "--site" in ARGS and ARGS[ARGS.index("--site") + 1] == "jezero" else "gale"
if SITE == "jezero":
    os.environ["REDCAIRN_DATA"] = "data/jezero"
    bs.DATA = "data/jezero"
OUT = bs.path("assets", "img", "plates") if SITE == "gale" else bs.path("assets", "img", "jezero", "plates")

# Palette: dusty Martian ground in three flat tones, ink, and two skies.
INK = (0.13, 0.07, 0.05, 1)
GROUND_JZ = {    # Jezero's floor: darker basalt under reddish dust
    "day":   [(0.17, 0.11, 0.09), (0.47, 0.30, 0.22), (0.74, 0.58, 0.45)],
    "dusk":  [(0.12, 0.07, 0.07), (0.38, 0.22, 0.17), (0.80, 0.52, 0.36)],
    "night": [(0.03, 0.03, 0.05), (0.08, 0.08, 0.11), (0.20, 0.17, 0.20)],
}
GROUND = {
    "day":   [(0.36, 0.17, 0.10), (0.70, 0.38, 0.22), (0.90, 0.60, 0.40)],
    "dusk":  [(0.20, 0.09, 0.09), (0.55, 0.27, 0.18), (0.95, 0.56, 0.32)],
    "night": [(0.03, 0.03, 0.06), (0.09, 0.08, 0.13), (0.22, 0.17, 0.22)],
}
SKY = {
    "day":   ((0.93, 0.80, 0.62), (0.98, 0.90, 0.76)),
    "dusk":  ((0.55, 0.42, 0.52), (0.96, 0.66, 0.44)),
    "night": ((0.015, 0.018, 0.04), (0.10, 0.08, 0.11)),
}


def toon_material(name, tones, contours=False, base=None):
    """Diffuse light -> three flat tones. With contours, ink lines every 2 m of real height (bold every 10 m)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (*tones[0], 1)
    els[1].position, els[1].color = 0.16, (*tones[1], 1)
    e = els.new(0.62)
    e.color = (*tones[2], 1)
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    if base is not None:
        mix0 = nt.nodes.new("ShaderNodeMix")
        mix0.data_type = "RGBA"
        mix0.blend_type = "MULTIPLY"
        mix0.inputs["Factor"].default_value = 1.0
        mix0.inputs[6].default_value = (*base, 1)
        nt.links.new(col, mix0.inputs[7])
        col = mix0.outputs[2]
    if contours:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Position"], sep.inputs[0])

        def band(step, width):
            div = nt.nodes.new("ShaderNodeMath"); div.operation = "DIVIDE"; div.inputs[1].default_value = step
            fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "FRACT"
            # distance to the nearest contour, in metres
            sub = nt.nodes.new("ShaderNodeMath"); sub.operation = "SUBTRACT"; sub.inputs[1].default_value = 0.5
            ab = nt.nodes.new("ShaderNodeMath"); ab.operation = "ABSOLUTE"
            mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = step
            gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = step / 2 - width
            nt.links.new(sep.outputs["Z"], div.inputs[0]); nt.links.new(div.outputs[0], fr.inputs[0])
            nt.links.new(fr.outputs[0], sub.inputs[0]); nt.links.new(sub.outputs[0], ab.inputs[0])
            nt.links.new(ab.outputs[0], mul.inputs[0]); nt.links.new(mul.outputs[0], gt.inputs[0])
            return gt.outputs[0]

        thin, bold = band(2.0, 0.07), band(10.0, 0.16)
        mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
        nt.links.new(thin, mx.inputs[0]); nt.links.new(bold, mx.inputs[1])
        fade = nt.nodes.new("ShaderNodeMath"); fade.operation = "MULTIPLY"; fade.inputs[1].default_value = 0.55
        nt.links.new(mx.outputs[0], fade.inputs[0])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs[7].default_value = INK
        nt.links.new(fade.outputs[0], mix.inputs["Factor"])
        nt.links.new(col, mix.inputs[6])
        col = mix.outputs[2]
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(col, emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return m


def flat(name, color, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*color, 1)
    emit.inputs["Strength"].default_value = strength
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return m


def world(sc, mood):
    w = bpy.data.worlds.new("Sky " + mood)
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    top, low = SKY[mood]
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.5, (*low, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.75, (*top, 1)
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    if mood == "night":
        # stars: a fine Voronoi field, only the closest points lit
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 420.0
        nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
        lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.05
        nt.links.new(vor.outputs["Distance"], lt.inputs[0])
        above = nt.nodes.new("ShaderNodeMath"); above.operation = "GREATER_THAN"; above.inputs[1].default_value = 0.52
        nt.links.new(sep.outputs["Z"], above.inputs[0])
        both = nt.nodes.new("ShaderNodeMath"); both.operation = "MULTIPLY"
        nt.links.new(lt.outputs[0], both.inputs[0]); nt.links.new(above.outputs[0], both.inputs[1])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
        mix.inputs[7].default_value = (0.95, 0.92, 0.85, 1)
        nt.links.new(both.outputs[0], mix.inputs["Factor"]); nt.links.new(col, mix.inputs[6])
        col = mix.outputs[2]
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(col, bg.inputs["Color"])
    # The sky is seen, but it does not light the ground: only the sun shapes the tones.
    amb = nt.nodes.new("ShaderNodeBackground")
    amb.inputs["Color"].default_value = (0.05, 0.035, 0.03, 1) if mood != "night" else (0.02, 0.02, 0.035, 1)
    lp = nt.nodes.new("ShaderNodeLightPath")
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mixs.inputs[0])
    nt.links.new(amb.outputs[0], mixs.inputs[1])
    nt.links.new(bg.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs["Surface"])
    sc.world = w


def sun(sc, mood, azimuth_deg):
    d = bpy.data.lights.new("Sun", "SUN")
    d.energy = {"day": 1.25, "dusk": 2.1, "night": 0.7}[mood]
    d.angle = math.radians(1.5)
    o = bs.link(sc, bpy.data.objects.new("Sun", d))
    elev = {"day": 38, "dusk": 15, "night": 30}[mood]
    o.rotation_euler = (math.radians(90 - elev), 0, math.radians(azimuth_deg))
    return o


def import_rover(sc, mat_body, mat_wheel):
    bpy.ops.wm.stl_import(filepath=STL)
    ob = bpy.context.selected_objects[0]
    ob.name = "Rover"
    ob.scale = (0.001,) * 3            # millimetres -> metres: the model is Curiosity-sized, 2.2 m to the mast top
    ob.data.materials.append(mat_body)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def look(cam, target):
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def route_dir(frame, route, lon, lat):
    pts = route["eva"]
    best = min(range(len(pts)), key=lambda i: (pts[i]["lon"] - lon) ** 2 + (pts[i]["lat"] - lat) ** 2)
    a = frame.xyz(pts[max(0, best - 3)]["lon"], pts[max(0, best - 3)]["lat"])
    b = frame.xyz(pts[min(len(pts) - 1, best + 3)]["lon"], pts[min(len(pts) - 1, best + 3)]["lat"])
    v = b - a
    return math.atan2(v.y, v.x)


def place(obj, frame, lon, lat, heading, lift=0.0):
    obj.location = frame.xyz(lon, lat, lift)
    obj.rotation_euler = (0, 0, heading)


def freestyle(sc):
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.6 if not PREVIEW else 1.0
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    ls = fs.linesets.new("Ink")
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = False
    ls.select_crease = True
    ls.select_by_collection = True
    ls.collection = bpy.data.collections.get("Figures")
    ls.linestyle.color = INK[:3]
    ls.linestyle.thickness = 1.6
    ls2 = fs.linesets.new("Ridges")
    ls2.select_by_visibility = True
    ls2.select_by_edge_types = True
    ls2.select_silhouette = True
    ls2.select_crease = False
    ls2.select_border = False
    ls2.select_by_collection = True
    ls2.collection = bpy.data.collections.get("Ground")
    ls2.linestyle.color = INK[:3]
    ls2.linestyle.thickness = 1.2


def build(mood):
    sc = bs.fresh_scene()
    mission = bs.load_json(*bs.DATA.split("/"), "mission.json")
    route = bs.load_json(*bs.DATA.split("/"), "route.json")
    meta, z = bs.load_terrain()
    frame = bs.Frame(meta, z, mission)
    ground = bs.collection(sc, "Ground")
    figs = bs.collection(sc, "Figures")
    terr = bs.terrain_mesh("Terrain", frame, 1, toon_material("Ground " + mood, (GROUND_JZ if SITE == "jezero" else GROUND)[mood], contours=True))
    bs.link(sc, terr, ground)
    body = toon_material("Rover body", [(0.10, 0.10, 0.11), (0.45, 0.43, 0.40), (0.88, 0.85, 0.79)])
    rover = import_rover(sc, body, body)
    for c in list(rover.users_collection):
        c.objects.unlink(rover)
    figs.objects.link(rover)
    crew = bs.crew_figure(sc)
    suit = toon_material("Suit", [(0.30, 0.30, 0.32), (0.70, 0.69, 0.66), (0.97, 0.96, 0.92)])
    crew.data.materials.clear()
    crew.data.materials.append(suit)
    for c in list(crew.users_collection):
        c.objects.unlink(crew)
    figs.objects.link(crew)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.clip_end = 6000
    cam = bs.link(sc, bpy.data.objects.new("Cam", cam_data))
    sc.camera = cam
    world(sc, mood)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = (640, 360) if PREVIEW else (1920, 1080)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = False
    return sc, frame, route, mission, rover, crew, cam


def wp(mission, wid):
    return next(w for w in mission["waypoints"] if w["id"] == wid)


def plate(pid, mood, sun_az, setup):
    sc, frame, route, mission, rover, crew, cam = build(mood)
    sun(sc, mood, sun_az)
    setup(sc, frame, route, mission, rover, crew, cam)
    freestyle(sc)
    os.makedirs(OUT, exist_ok=True)
    fp = os.path.join(OUT, f"{pid}{'-preview' if PREVIEW else ''}.jpg")
    sc.render.filepath = fp
    bpy.ops.render.render(scene=sc.name, write_still=True)
    print("REDCAIRN_PLATE", pid, fp, os.path.getsize(fp))


def off(o):
    o.hide_render = True


# ---------------------------------------------------------------- the plates
def ground_z(frame, x, y):
    """Real ground height (local metres) under a local x/y."""
    m = frame.meta
    c = x / m["cellMX"] + frame.c0
    r = -y / m["cellMY"] + frame.r0
    c = min(max(c, 0), m["cols"] - 1.001); r = min(max(r, 0), m["rows"] - 1.001)
    c0, r0 = int(c), int(r); tc, tr = c - c0, r - r0
    zz = frame.z
    v = (zz[r0, c0] * (1 - tc) + zz[r0, c0 + 1] * tc) * (1 - tr) + (zz[r0 + 1, c0] * (1 - tc) + zz[r0 + 1, c0 + 1] * tc) * tr
    return float(v) - frame.z0


def cam_at(cam, frame, x, y, above):
    cam.location = Vector((x, y, ground_z(frame, x, y) + above))


def on_ground(frame, x, y, lift=0.0):
    return Vector((x, y, ground_z(frame, x, y) + lift))


def p1(sc, frame, route, mission, rover, crew, cam):
    """In 2012 a rover landed alone. It began to climb. High over the slope, looking up toward Mount Sharp."""
    w = wp(mission, "WP2")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    cam.data.lens = 30
    cam_at(cam, frame, t.x + 40, t.y + 260, 70)
    look(cam, on_ground(frame, t.x - 10, t.y - 300, 60))


def p2(sc, frame, route, mission, rover, crew, cam):
    """Its sample lab marked the first anniversary with a short vibration sequence. The rover alone at dusk, low sun behind it."""
    w = wp(mission, "WP3")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    a = h + 2.5
    cam.data.lens = 45
    cam_at(cam, frame, t.x + math.cos(a) * 11, t.y + math.sin(a) * 11, 1.6)
    look(cam, t + Vector((0, 0, 1.4)))


def p3(sc, frame, route, mission, rover, crew, cam):
    """Its wheels tore. It kept climbing. Low and close on the wheels, on the 17-degree slope at cairn 1."""
    w = wp(mission, "WP1")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"], 0.3)
    cam.data.lens = 28
    cam_at(cam, frame, t.x + math.cos(h + 0.75) * 6.0, t.y + math.sin(h + 0.75) * 6.0, 0.9)
    look(cam, t + Vector((math.cos(h) * 0.6, math.sin(h) * 0.6, 0.75)))


def p4(sc, frame, route, mission, rover, crew, cam):
    """It photographed Earth: one point of light. Night, the rover's outline, Earth low in the west."""
    w = wp(mission, "WP5")
    h = math.radians(170)
    place(rover, frame, w["lon"], w["lat"], h)
    rover.data.materials[0] = toon_material("Rover at night", [(0.01, 0.01, 0.015), (0.04, 0.04, 0.05), (0.12, 0.11, 0.12)])
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    cam.data.lens = 30
    cam_at(cam, frame, t.x + 8.5, t.y - 1.0, 1.3)
    tgt = cam.location + Vector((-1.0, 0.08, 0.10))
    look(cam, tgt)
    import bmesh
    earth = bpy.data.meshes.new("Earth")
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0); bm.to_mesh(earth); bm.free()
    eo = bs.link(sc, bpy.data.objects.new("Earth", earth))
    eo.data.materials.append(flat("Earth light", (0.80, 0.90, 1.0), 40.0))
    eo.location = cam.location + Vector((-1.0, 0.30, 0.24)).normalized() * 900
    eo.scale = (2.6,) * 3


def p5(sc, frame, route, mission, rover, crew, cam):
    """Fourteen years later, you land. The suited figure at the hatch, looking up the slope toward Mount Sharp."""
    w = wp(mission, "DOCK")
    h = route_dir(frame, route, w["lon"], w["lat"])
    off(rover)
    t = frame.xyz(w["lon"], w["lat"])
    crew.location = t
    crew.rotation_euler = (0, 0, h - math.pi / 2)        # the figure faces +Y; turn it to face up the trail
    cam.data.lens = 35
    back = h + math.pi
    cam_at(cam, frame, t.x + math.cos(back) * 6.5 + math.cos(h + 1.57) * 1.6, t.y + math.sin(back) * 6.5 + math.sin(h + 1.57) * 1.6, 1.9)
    look(cam, on_ground(frame, t.x + math.cos(h) * 40, t.y + math.sin(h) * 40, 3.0))


def p6(sc, frame, route, mission, rover, crew, cam):
    """You found it. The figure beside the rover at its real latest position, a hand on its wheel."""
    w = wp(mission, "CURIOSITY")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    side = Vector((math.cos(h + math.pi / 2), math.sin(h + math.pi / 2), 0))
    fwd = Vector((math.cos(h), math.sin(h), 0))
    base = frame.xyz(w["lon"], w["lat"])
    spot = base + fwd * 0.9 + side * 1.85
    crew.location = on_ground(frame, spot.x, spot.y)
    crew.rotation_euler = (0, 0, math.atan2(-side.y, -side.x) - math.pi / 2)   # facing the rover's flank
    cam.data.lens = 32
    c = base + fwd * 6.2 + side * 5.0
    cam_at(cam, frame, c.x, c.y, 1.7)
    look(cam, base + side * 0.9 + Vector((0, 0, 1.0)))


PLATES = [
    ("p1", "day", 250, p1),
    ("p2", "dusk", 260, p2),
    ("p3", "day", 230, p3),
    ("p4", "night", 300, p4),
    ("p5", "day", 245, p5),
    ("p6", "dusk", 250, p6),
]



# ---------------------------------------------------------------- Jezero (the second walk)
def ingenuity(sc, at):
    """Ingenuity at true size: a 14 cm body, two 1.2 m rotors, four legs, a solar panel on the mast."""
    import bmesh
    mat = toon_material("Helicopter", [(0.10, 0.09, 0.09), (0.45, 0.43, 0.40), (0.85, 0.82, 0.76)])
    parts = []
    def box(name, sx, sy, sz, loc):
        me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        o = bs.link(sc, bpy.data.objects.new(name, me)); o.scale = (sx, sy, sz); o.location = at + Vector(loc); o.data.materials.append(mat); parts.append(o)
    box("Heli body", 0.14, 0.14, 0.14, (0, 0, 0.0))
    box("Rotor low", 1.2, 0.07, 0.012, (0, 0, 0.16))
    box("Rotor high", 0.07, 1.2, 0.012, (0, 0, 0.24))
    box("Mast", 0.02, 0.02, 0.26, (0, 0, 0.2))
    box("Panel", 0.18, 0.12, 0.008, (0, 0, 0.34))
    for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        box("Leg", 0.012, 0.012, 0.36, (dx * 0.17, dy * 0.17, -0.2))
    figs = bpy.data.collections.get("Figures")
    for o in parts:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        figs.objects.link(o)


def j1(sc, frame, route, mission, rover, crew, cam):
    """February 2021: a rover lands in a crater that once held a lake. High over the landing site, looking west."""
    w = wp(mission, "DOCK")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    cam.data.lens = 30
    cam_at(cam, frame, t.x + 34, t.y + 14, 9)
    look(cam, on_ground(frame, t.x - 120, t.y - 30, 12))


def j2(sc, frame, route, mission, rover, crew, cam):
    """It carried a helicopter. From this overlook it watched the first flight on another world."""
    w = wp(mission, "WP1")
    h = math.radians(5)                                # facing east, toward the airfield
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    heli = t + Vector((24, 3, 0))
    heli.z = ground_z(frame, heli.x, heli.y) + 3.0
    ingenuity(sc, heli)
    cam.data.lens = 40
    cam_at(cam, frame, t.x - 9, t.y - 4.5, 1.5)
    look(cam, Vector((t.x + 12, t.y + 1.5, heli.z - 0.6)))


def j3(sc, frame, route, mission, rover, crew, cam):
    """Its first sample crumbled; the tube kept only air. It tried again. Close on the wheels at Roubion."""
    w = wp(mission, "WP3")
    h = route_dir(frame, route, w["lon"], w["lat"])
    place(rover, frame, w["lon"], w["lat"], h)
    off(crew)
    t = frame.xyz(w["lon"], w["lat"], 0.3)
    cam.data.lens = 28
    cam_at(cam, frame, t.x + math.cos(h + 0.75) * 6.0, t.y + math.sin(h + 0.75) * 6.0, 0.9)
    look(cam, t + Vector((math.cos(h) * 0.6, math.sin(h) * 0.6, 0.75)))


def j4(sc, frame, route, mission, rover, crew, cam):
    """It sealed pieces of Mars in tubes, for someone to carry home. Night at Rochette, Earth low in the west."""
    w = wp(mission, "PERSEVERANCE")
    h = math.radians(170)
    place(rover, frame, w["lon"], w["lat"], h)
    rover.data.materials[0] = toon_material("Rover at night", [(0.01, 0.01, 0.015), (0.04, 0.04, 0.05), (0.12, 0.11, 0.12)])
    off(crew)
    t = frame.xyz(w["lon"], w["lat"])
    cam.data.lens = 30
    cam_at(cam, frame, t.x + 8.5, t.y - 1.0, 1.3)
    look(cam, cam.location + Vector((-1.0, 0.08, 0.10)))
    import bmesh
    earth = bpy.data.meshes.new("Earth")
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0); bm.to_mesh(earth); bm.free()
    eo = bs.link(sc, bpy.data.objects.new("Earth", earth))
    eo.data.materials.append(flat("Earth light", (0.80, 0.90, 1.0), 40.0))
    eo.location = cam.location + Vector((-1.0, 0.30, 0.24)).normalized() * 900
    eo.scale = (2.6,) * 3


def j5(sc, frame, route, mission, rover, crew, cam):
    """Five years later, you land where it did. The suited figure at the hatch, looking along its first tracks."""
    w = wp(mission, "DOCK")
    h = route_dir(frame, route, w["lon"], w["lat"])
    off(rover)
    t = frame.xyz(w["lon"], w["lat"])
    crew.location = t
    crew.rotation_euler = (0, 0, h - math.pi / 2)
    cam.data.lens = 35
    back = h + math.pi
    cam_at(cam, frame, t.x + math.cos(back) * 6.5 + math.cos(h + 1.57) * 1.6, t.y + math.sin(back) * 6.5 + math.sin(h + 1.57) * 1.6, 1.9)
    look(cam, on_ground(frame, t.x + math.cos(h) * 40, t.y + math.sin(h) * 40, 3.0))


def j6(sc, frame, route, mission, rover, crew, cam):
    """Rochette at dusk: you stand on the ridge where it drilled its first cores. The rover has moved on; the place is yours."""
    w = wp(mission, "PERSEVERANCE")
    h = route_dir(frame, route, w["lon"], w["lat"])
    off(rover)
    base = frame.xyz(w["lon"], w["lat"])
    crew.location = base
    crew.rotation_euler = (0, 0, math.radians(200) - math.pi / 2)
    cam.data.lens = 32
    side = Vector((math.cos(h + math.pi / 2), math.sin(h + math.pi / 2), 0))
    fwd = Vector((math.cos(h), math.sin(h), 0))
    c = base + fwd * 6.0 + side * 3.5
    cam_at(cam, frame, c.x, c.y, 1.8)
    look(cam, base + Vector((0, 0, 1.2)) - fwd * 8)


JZ_PLATES = [
    ("j1", "day", 250, j1),
    ("j2", "dusk", 260, j2),
    ("j3", "day", 230, j3),
    ("j4", "night", 300, j4),
    ("j5", "day", 245, j5),
    ("j6", "dusk", 250, j6),
]

if __name__ == "__main__":
    for pid, mood, az, fn in (JZ_PLATES if SITE == "jezero" else PLATES):
        if ONLY and pid not in ONLY:
            continue
        plate(pid, mood, az, fn)
