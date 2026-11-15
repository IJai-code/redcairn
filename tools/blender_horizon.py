"""The real horizon from the walk site, as a 360° panorama. Run inside Blender (5.x) after tools/build_gale.py:

    blender -b --python tools/blender_horizon.py -- [--preview]

Builds Gale crater at TRUE scale from the Mars Trek MOLA + HRSC elevation under Viking colour, stands a
camera 1.7 m above the walk's start (the rover dock), and renders an equirectangular panorama with Cycles:
Mount Sharp to the south-east, the crater rim to the north, dusty sky overhead.

  assets/img/horizon.jpg   4096 x 2048, centre of the image = looking north, east to the right

js/scene.js wraps it on a sky sphere around the 1 m walk terrain, so the far landscape in first person is real.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_gale as bg  # noqa: E402

PREVIEW = "--preview" in sys.argv
SITE = (137.3815, -4.8071)   # walk dock, from data/mission.json
EYE_M = 1.7


def main():
    import json
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bg.EX = 1.0                                         # true scale: this is what an astronaut would see
    with open(bg.path("data", "gale.json"), encoding="utf-8") as fh:
        gale = json.load(fh)
    dem = bg.read_tiff_f32(bg.path("art", "gale", "dem.tif"))
    geo = bg.Geo(gale["box"], dem)
    ob = bpy.data.objects.new("Gale", bg.build_mesh(geo))
    mat = bg.ground_material()
    ob.data.materials.append(mat)
    sc.collection.objects.link(ob)

    # Sun low in the west-south-west, as in the crater render; sky from butterscotch at the horizon to dusk above.
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.color = (1.0, 0.9, 0.78)
    sun.rotation_euler = (math.radians(66), 0, math.radians(318))
    sc.collection.objects.link(sun)
    world = bpy.data.worlds.new("Mars sky")
    world.use_nodes = True
    nt = world.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.83, 0.6, 0.42, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (0.24, 0.16, 0.13, 1)
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 1.0
    sc.world = world

    # Dust: thin haze in the lowest 12 km, so the far rim fades the way it does in rover photos.
    bpy.ops.mesh.primitive_cube_add(size=1)
    slab = bpy.context.active_object
    slab.scale = (400, 400, 12)
    slab.location = (0, 0, -1)
    vm = bpy.data.materials.new("Dust")
    vm.use_nodes = True
    vnt = vm.node_tree
    vnt.nodes.remove(vnt.nodes["Principled BSDF"])
    vol = vnt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.9, 0.66, 0.48, 1)
    vol.inputs["Density"].default_value = 0.007
    vnt.links.new(vol.outputs["Volume"], vnt.nodes["Material Output"].inputs["Volume"])
    slab.data.materials.append(vm)

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
    p.z += EYE_M / 1000 + 0.02          # scene units are km; lift a little so the 200 m grid does not swallow the eye
    cam.location = p
    cam.rotation_euler = (math.radians(90), 0, 0)   # level, looking north
    sc.camera = cam

    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24 if PREVIEW else 64
    sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:  # CPU is fine, just slower
        print("GPU unavailable:", e)
    sc.render.resolution_x, sc.render.resolution_y = (1024, 512) if PREVIEW else (4096, 2048)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 82
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.exposure = 0.25
    out = os.path.join(os.environ.get("PREVIEW_DIR", "/tmp"), "horizon.jpg") if PREVIEW else bg.path("assets", "img", "horizon.jpg")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("wrote", out, "eye at", tuple(round(v, 3) for v in p))


main()
