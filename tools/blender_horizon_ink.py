"""The real 360-degree horizon from the walk site, drawn in the plates' ink style. Run inside Blender (5.x):

    blender -b --python tools/blender_horizon_ink.py -- [--preview]

Same ground as tools/blender_horizon.py (Gale crater at true scale from the Mars Trek MOLA + HRSC elevation, the
eye 1.7 m above the hatch), but shaded like tools/blender_plates.py: three flat tones from the sun, ink contour
lines every 50 m of real height (bold every 250 m), ink outlines on every ridge (Freestyle), and distance fading
into a paper sky. js/scene.js wraps it on the sky sphere around the 1 m walk terrain.

  assets/img/horizon-ink.jpg   4096 x 2048, centre = looking north, east to the right
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_gale as bg  # noqa: E402

PREVIEW = "--preview" in sys.argv
SITE = (137.3815, -4.8071)
EYE_M = 1.7
SUN = (66, 0, 318)


def lin(h):
    """sRGB hex -> linear RGBA (Blender colours are linear)."""
    r, g, b = int(h[1:3], 16) / 255, int(h[3:5], 16) / 255, int(h[5:7], 16) / 255
    return (r ** 2.2, g ** 2.2, b ** 2.2, 1)


def ink_ground(sun_vec):
    m = bpy.data.materials.new("Ink ground")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = sun_vec
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, lin("#6e3424")
    e[1].position, e[1].color = 0.22, lin("#b86a42")
    e.new(0.62).color = lin("#e7a473")
    nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]

    # contour lines on real height (scene units are km): every 50 m, bold every 250 m
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])

    def band(step_km, width):
        div = nt.nodes.new("ShaderNodeMath"); div.operation = "DIVIDE"; div.inputs[1].default_value = step_km
        fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "FRACT"
        sub = nt.nodes.new("ShaderNodeMath"); sub.operation = "SUBTRACT"; sub.inputs[1].default_value = 0.5
        ab = nt.nodes.new("ShaderNodeMath"); ab.operation = "ABSOLUTE"
        gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5 - width
        nt.links.new(sep.outputs["Z"], div.inputs[0]); nt.links.new(div.outputs[0], fr.inputs[0])
        nt.links.new(fr.outputs[0], sub.inputs[0]); nt.links.new(sub.outputs[0], ab.inputs[0]); nt.links.new(ab.outputs[0], gt.inputs[0])
        return gt.outputs[0]

    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
    nt.links.new(band(0.05, 0.035), mx.inputs[0]); nt.links.new(band(0.25, 0.02), mx.inputs[1])
    fade = nt.nodes.new("ShaderNodeMath"); fade.operation = "MULTIPLY"; fade.inputs[1].default_value = 0.55
    nt.links.new(mx.outputs[0], fade.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[7].default_value = lin("#2b160f")
    nt.links.new(fade.outputs[0], mix.inputs["Factor"]); nt.links.new(col, mix.inputs[6])
    col = mix.outputs[2]

    # aerial perspective: fade into the paper sky with distance (km)
    cam = nt.nodes.new("ShaderNodeCameraData")
    dd = nt.nodes.new("ShaderNodeMapRange")
    dd.inputs["From Min"].default_value = 2.0
    dd.inputs["From Max"].default_value = 70.0
    dd.inputs["To Min"].default_value = 0.0
    dd.inputs["To Max"].default_value = 0.5
    nt.links.new(cam.outputs["View Distance"], dd.inputs["Value"])
    mix2 = nt.nodes.new("ShaderNodeMix"); mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = lin("#f3dfc2")
    nt.links.new(dd.outputs["Result"], mix2.inputs["Factor"]); nt.links.new(col, mix2.inputs[6])
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mix2.outputs[2], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return m


def main():
    import json
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bg.EX = 1.0
    with open(bg.path("data", "gale.json"), encoding="utf-8") as fh:
        gale = json.load(fh)
    dem = bg.read_tiff_f32(bg.path("art", "gale", "dem.tif"))
    geo = bg.Geo(gale["box"], dem)
    ob = bpy.data.objects.new("Gale", bg.build_mesh(geo))
    sun_vec = Euler(tuple(math.radians(a) for a in SUN)).to_matrix() @ Vector((0, 0, 1))
    ob.data.materials.append(ink_ground(tuple(sun_vec)))
    sc.collection.objects.link(ob)

    world = bpy.data.worlds.new("Paper sky")
    world.use_nodes = True
    nt = world.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.5, lin("#f3dfc2")
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.8, lin("#fbeedb")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    sc.world = world

    cd = bpy.data.cameras.new("Eye")
    cd.type = "PANO"
    if hasattr(cd, "panorama_type"):
        cd.panorama_type = "EQUIRECTANGULAR"
    else:
        cd.cycles.panorama_type = "EQUIRECTANGULAR"
    cd.clip_start, cd.clip_end = 0.0005, 2000
    cam = bpy.data.objects.new("Eye", cd)
    sc.collection.objects.link(cam)
    p = geo.xyz(SITE[0], SITE[1], 0)
    p.z += EYE_M / 1000 + 0.02
    cam.location = p
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam

    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4 if PREVIEW else 12
    sc.cycles.use_denoising = False
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU unavailable:", e)
    sc.render.resolution_x, sc.render.resolution_y = (1024, 512) if PREVIEW else (4096, 2048)
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.0 if PREVIEW else 2.2
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("Ink")
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = False
    ls.select_crease = False
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("Ink")
    ls.linestyle.color = (0.17, 0.086, 0.06)
    # far ridges are drawn lighter and thinner, like the ground fading into the dust
    am = ls.linestyle.alpha_modifiers.new("Far", "DISTANCE_FROM_CAMERA")
    am.range_min, am.range_max = 1.5, 40.0
    am.mapping = "LINEAR"
    am.invert = True
    tm = ls.linestyle.thickness_modifiers.new("Far", "DISTANCE_FROM_CAMERA")
    tm.range_min, tm.range_max = 1.5, 40.0
    tm.value_min, tm.value_max = 1.0, 0.35
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 86
    sc.view_settings.view_transform = "Standard"
    out = os.path.join(os.environ.get("PREVIEW_DIR", "/tmp"), "horizon-ink.jpg") if PREVIEW else bg.path("assets", "img", "horizon-ink.jpg")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("wrote", out)


main()
