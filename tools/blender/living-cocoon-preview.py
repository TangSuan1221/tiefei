"""Workbench turnaround of an actor GLB (cocoon / diver) for quick shape checks.
D:/blender/blender.exe -b --factory-startup -P tools/blender/living-cocoon-preview.py -- <glb> <out-prefix>
"""
import bpy, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
sc = bpy.context.scene
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
if len(argv) > 2 and argv[2] == 'body':
    for o in list(sc.objects):
        if 'shell' in o.name:
            bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in sc.objects if o.type == 'MESH' and (o.name.startswith('alex') or o.name.startswith('cocoon'))]
for o in sc.objects:
    if o.type == 'MESH' and o not in meshes:
        o.hide_render = True
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
if len(argv) > 3 and argv[3] == 'head':
    mn.z = mx.z - (mx.z - mn.z) * 0.3
c, r = (mn + mx) / 2, (mx - mn).length / 2
print('[preview] bounds', tuple(round(v, 3) for v in mn), tuple(round(v, 3) for v in mx))
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_xray = len(argv) > 2 and argv[2] == 'xray'
sc.display.shading.xray_alpha = 0.35
sc.render.resolution_x, sc.render.resolution_y = 640, 640
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
for i, (az, el) in enumerate(((-90, 10), (0, 15), (35, 35), (180, 10))):
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = c + d * r * 2.9
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}-{i}.png'
    bpy.ops.render.render(write_still=True)
