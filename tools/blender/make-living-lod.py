"""Distance LOD for a level-two hero GLB: imports public/assets/deepsea/living/<name>.glb, decimates every
mesh (collapse) and writes <name>.lod1.glb next to it. Node names are kept; materials are exported as named
placeholders without textures, and src/pod/view/deepsea/living-glb.ts rebinds them by name to the full-res
materials already loaded from <name>.glb (no second texture download).

    D:/blender/blender.exe -b --factory-startup -P tools/blender/make-living-lod.py -- <name> <ratio> [skip,nodes]

Meshes under the skip nodes (operable parts that leave the LOD tree at runtime) are deleted from the LOD file.
"""
import sys
from pathlib import Path
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
NAME = argv[0]
RATIO = float(argv[1]) if len(argv) > 1 else 0.25
SKIP = set(argv[2].split(',')) if len(argv) > 2 and argv[2] else set()
DIR = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'deepsea' / 'living'
src, dst = DIR / f'{NAME}.glb', DIR / f'{NAME}.lod1.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))


def tris(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


def under_skip(o):
    while o is not None:
        if o.name in SKIP:
            return True
        o = o.parent
    return False


for o in [o for o in bpy.data.objects if under_skip(o)]:
    bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
before = tris(meshes)
for o in meshes:
    # thin, low-count parts (decals, labels, glass) keep their shape; decimating a quad only tears it
    o.data.calc_loop_triangles()
    if len(o.data.loop_triangles) < 400:
        continue
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    m = o.modifiers.new('lod', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = RATIO
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
after = tris(meshes)
for mat in bpy.data.materials:
    if mat.node_tree:
        for n in list(mat.node_tree.nodes):
            if n.type == 'TEX_IMAGE':
                mat.node_tree.nodes.remove(n)
for img in list(bpy.data.images):
    bpy.data.images.remove(img)

bpy.ops.export_scene.gltf(filepath=str(dst), export_format='GLB', export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_animations=False)
print(f'[lod] {NAME}: {before} -> {after} triangles (ratio {RATIO}), {dst.stat().st_size} bytes -> {dst}')
