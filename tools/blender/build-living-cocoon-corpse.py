"""Level two M (slime corridor): a long-dead resident sitting curled on the floor, knees drawn up and
hugged, head down on the knees, sealed in a body-following amber Panacea shell 3-6 cm thick.
Single source of the cocoon actor (living-cocoon.ts loads cocoon-corpse.glb; materials are rebound
at runtime by node name).

Frame = world translated by the hero placement (170, 0, -14): corridor floor y = -3, ceiling y = 0.6.
The figure faces three-space (0.47, 0, 0.88) so the probe framing (camera west-south-west, looking
east) sees the curled profile: head, rounded back, shoulder, knees and shins read through the shell.

Objects (three space after export):
  cocoon-body   featureless CC0 base-mesh figure (smoothed: no face, hair, clothing or marks)
  cocoon-shell  closed voxel-remeshed shell around the body, sagging where it rests on the floor
  cocoon-pool   thin lumpy gel sheet spreading from the base

The medium is not shown attacking: the body is enclosed, not restrained. Strands and anchors to the
ceiling are built by living-cocoon.ts (tied to the M ceiling grid).

    D:/blender/blender.exe -b --factory-startup --python-exit-code 1 -P tools/blender/build-living-cocoon-corpse.py
"""
import sys, math, json, time, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

NAME = 'cocoon-corpse'
FLOOR, CEIL = -3.0, 0.6
PLACEMENT = (170, 0, -14)
FRONT_YAW = 28.0
T0 = time.time()

sc = bpy.context.scene
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)

fig = L.Figure('male', height=1.74)
fig.smooth_rest([True] * len(fig.rest), iterations=14, factor=0.5)
pose = {
    'pelvis': [('x', -22)], 'spine': [('x', 30)], 'chest': [('x', 20), ('z', 6)],
    'neck': [('x', 24)], 'head': [('x', 30), ('y', -10), ('z', 18)],
    'thigh.L': [('x', -122), ('y', -6)], 'thigh.R': [('x', -116), ('y', 8)],
    'shin.L': [('x', 132)], 'shin.R': [('x', 126)],
    'foot.L': [('x', -18)], 'foot.R': [('x', -12)],
}
# figure-local three space: pelvis 0.13 m above the floor, then turned to FRONT_YAW and slumped 7 deg to its right
BODY = L.M((0.0, FLOOR + 0.13 - 0.88 * fig.scale, 0.0), (0, FRONT_YAW, -7), order='YXZ')
knee_l = fig.bones['shin.L'][1]
knee_r = fig.bones['shin.R'][1]
kl = BODY @ fig.posed_point(pose, 'shin.L', knee_l)
kr = BODY @ fig.posed_point(pose, 'shin.R', knee_r)
front = Matrix.Rotation(math.radians(FRONT_YAW), 4, 'Y') @ Vector((0, 0, 1))
# arms wrapped round the shins: the hands meet in front of the shins a little below the knees
mid = (kl + kr) / 2
across = kl - kr
tl = mid + across * 0.18 - Vector((0, 0.17, 0)) + front * 0.08
tr = mid - across * 0.18 - Vector((0, 0.13, 0)) + front * 0.08
pose, e1 = fig.solve(pose, [('upper.L', 'x'), ('upper.L', 'y'), ('upper.L', 'z'), ('fore.L', 'x')], 'hand.L', tuple(fig.bones['hand.L'][1]),
                     tuple(tl), world=BODY, ranges=[(-130, 20), (-60, 60), (-60, 60), (-140, 0)], steps=7)
pose, e2 = fig.solve(pose, [('upper.R', 'x'), ('upper.R', 'y'), ('upper.R', 'z'), ('fore.R', 'x')], 'hand.R', tuple(fig.bones['hand.R'][1]),
                     tuple(tr), world=BODY, ranges=[(-130, 20), (-60, 60), (-60, 60), (-140, 0)], steps=7)
L.log('cocoon arm solve', round(e1, 3), round(e2, 3))

bm = fig.pose(pose)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= fig.n_body], context='VERTS')
# skinning tears under deep knee flexion: drop stretched faces and the loose islands they leave
bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(e.calc_length() > 0.07 for e in f.edges)], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
seen, small = set(), []
for v0 in bm.verts:
    if v0 in seen:
        continue
    comp, stack = [], [v0]
    seen.add(v0)
    while stack:
        v = stack.pop(); comp.append(v)
        for e in v.link_edges:
            w = e.other_vert(v)
            if w not in seen:
                seen.add(w); stack.append(w)
    if len(comp) < 300:
        small += comp
bmesh.ops.delete(bm, geom=small, context='VERTS')
# Blender rest space -> three (scaled already) -> BODY -> back to Blender space for export
L.transform(bm, L.C4 @ BODY @ L.C4.inverted())
lo = min(v.co.z for v in bm.verts)
L.transform(bm, Matrix.Translation((0, 0, FLOOR + 0.035 - lo)))
vs = [v.co for v in bm.verts]
mn = Vector((min(c.x for c in vs), min(c.y for c in vs), min(c.z for c in vs)))
mx = Vector((max(c.x for c in vs), max(c.y for c in vs), max(c.z for c in vs)))
L.log('body bounds (blender xyz)', tuple(round(v, 3) for v in (mx - mn)))


def make_obj(name, bmx, mat_name, color):
    me = bpy.data.meshes.new(name)
    bmx.to_mesh(me)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = color
    me.materials.append(mat)
    return ob


body = make_obj('cocoon-body', bm, 'cocoon_body', (0.12, 0.08, 0.05, 1))
dec = body.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.55

# shell: body inflated 4.5 cm, pulled only slightly toward a rounded hull (fills the gaps between
# arms, shins and chest so it stays one piece) -> voxel remesh -> smooth -> lumps
shell = make_obj('cocoon-shell', bm.copy(), 'cocoon_shell', (0.8, 0.5, 0.2, 1))
d1 = shell.modifiers.new('inflate', 'DISPLACE'); d1.strength = 0.045; d1.mid_level = 0.0
ev = shell.evaluated_get(bpy.context.evaluated_depsgraph_get())
sbm = bmesh.new(); sbm.from_mesh(ev.to_mesh()); ev.to_mesh_clear(); shell.modifiers.clear()
bvh = BVHTree.FromBMesh(bm)
ctr, half = (mn + mx) / 2, (mx - mn) / 2
hull = bmesh.new()
bmesh.ops.create_uvsphere(hull, u_segments=64, v_segments=40, radius=1.0)
GAP, PULL = 0.04, 0.9
for v in hull.verts:
    p = Vector((v.co.x * half.x, v.co.y * half.y, v.co.z * half.z)) + ctr
    loc, nrm, _i, _d = bvh.find_nearest(p)
    v.co = p.lerp(loc + nrm * GAP, PULL) if loc is not None else p
tmp = bpy.data.meshes.new('hull'); hull.to_mesh(tmp); sbm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
sbm.to_mesh(shell.data); sbm.free(); hull.free()
rm = shell.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.022
sm = shell.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.7; sm.iterations = 10
tex = bpy.data.textures.new('cocoon_lumps', 'CLOUDS'); tex.noise_scale = 0.09; tex.noise_depth = 2
d2 = shell.modifiers.new('lumps', 'DISPLACE'); d2.texture = tex; d2.strength = 0.022; d2.mid_level = 0.5
tex2 = bpy.data.textures.new('cocoon_ripple', 'VORONOI'); tex2.noise_scale = 0.035
d3 = shell.modifiers.new('ripple', 'DISPLACE'); d3.texture = tex2; d3.strength = 0.008; d3.mid_level = 0.5
dg = bpy.context.evaluated_depsgraph_get()
for ob in (body, shell):
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.clear()
    old = ob.data; ob.data = me; me.materials.clear(); me.materials.append(old.materials[0])
    for p in me.polygons:
        p.use_smooth = True
# the shell rests on the floor: squash below 8 cm and let it spread (gel slumping under its weight)
me = shell.data
cx, cy = ctr.x, ctr.y
for v in me.vertices:
    h = v.co.z - FLOOR
    if h < 0.08:
        k = (0.08 - h) / 0.08
        v.co.z = FLOOR + max(0.004, 0.08 - (0.08 - h) * 0.3 - 0.015 * k)
        v.co.x = cx + (v.co.x - cx) * (1 + 0.07 * k)
        v.co.y = cy + (v.co.y - cy) * (1 + 0.07 * k)
me.update()

# per-vertex resin data for the runtime shader (COLOR_0): R = local shell thickness (distance to the
# body, 0 = 2 cm, 1 = 16 cm+), G = settled silt (up-facing patches and the slumped base), B unused
col = me.color_attributes.new('resin', 'FLOAT_COLOR', 'POINT')
for v in me.vertices:
    loc, _n, _i, d = bvh.find_nearest(v.co)
    thick = min(1.0, max(0.0, ((d if d is not None else 0.16) - 0.02) / 0.14))
    up = max(0.0, min(1.0, (v.normal.z - 0.35) / 0.5))
    n = 0.5 + 0.5 * L.noise3((v.co.x * 9, v.co.y * 9, v.co.z * 9), 1.0, 5)
    base = max(0.0, min(1.0, (0.13 - (v.co.z - FLOOR)) / 0.1))
    silt = max(0.0, min(1.0, up * (n * 1.6 - 0.5))) * 0.9 + base * 0.7
    col.data[v.index].color = (thick, min(1.0, silt), 0.0, 1.0)
me.color_attributes.active_color = col
L.log('shell thickness range (m)', round(min(c.color[0] for c in col.data) * 0.14 + 0.02, 3), round(max(c.color[0] for c in col.data) * 0.14 + 0.02, 3))

# floor pool: gel sheet spreading from the base. The surface climbs the shell wall (concave meniscus)
# and stops at a rounded, surface-tension lip instead of feathering to nothing.
pbm = bmesh.new()
NR, NS = 26, 72
SHELL_T, LIP_T, H0 = 0.42, 0.9, 0.009
rings = [[pbm.verts.new((0.0, 0.0, 0.05))]]
for i in range(1, NR + 1):
    t = 1 - (1 - i / NR) ** 1.5          # rings crowd toward the lip
    row = []
    for j in range(NS):
        a = 2 * math.pi * j / NS
        edge = 1.0 + 0.32 * L.noise3((math.cos(a) * 1.3, math.sin(a) * 1.3, 4.0), 1.0, 9) + 0.12 * L.noise3((math.cos(a) * 5, math.sin(a) * 5, 1.0), 1.0, 2)
        r = 0.8 * edge * t * (1.25 if math.cos(a - 0.5) > 0.6 else 1.0)
        hh = H0 * (1 + 0.25 * L.noise3((r * math.cos(a) * 4, r * math.sin(a) * 4, 2.0), 1.0, 3))
        if t < SHELL_T:
            h = hh + 0.045
        else:
            h = hh + 0.045 * math.exp(-(t - SHELL_T) / 0.05)
        if t > LIP_T:
            h = hh * math.sqrt(max(0.0, 1 - ((t - LIP_T) / (1 - LIP_T)) ** 2)) + 0.0006
        row.append(pbm.verts.new((r * math.cos(a) * 1.15, r * math.sin(a), max(0.0006, h))))
    rings.append(row)
for j in range(NS):
    pbm.faces.new((rings[0][0], rings[1][j], rings[1][(j + 1) % NS]))
for i in range(1, NR):
    for j in range(NS):
        k2 = (j + 1) % NS
        pbm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][k2], rings[i][k2]))
bmesh.ops.recalc_face_normals(pbm, faces=pbm.faces)
L.transform(pbm, Matrix.Translation((ctr.x, ctr.y, FLOOR + 0.001)))
pool = make_obj('cocoon-pool', pbm, 'cocoon_pool', (0.35, 0.3, 0.12, 1))

stats = {}
for ob in (body, shell, pool):
    stats[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    L.log(ob.name, 'tris', stats[ob.name])

OUTF = L.OUT / f'{NAME}.glb'
for o in sc.objects:
    o.select_set(o in (body, shell, pool))
bpy.context.view_layer.objects.active = shell
try:
    bpy.ops.export_scene.gltf(filepath=str(OUTF), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_vertex_color='ACTIVE')
except TypeError:
    bpy.ops.export_scene.gltf(filepath=str(OUTF), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_colors=True)
size = OUTF.stat().st_size
L.log('wrote', OUTF, size)

three = lambda p: [round(float(p[0]), 4), round(float(p[2]), 4), round(float(-p[1]), 4)]
c3 = three(ctr)
manifest = {
    'asset': NAME, 'units': 'metres',
    'axes': 'Three.js local: +Y up, +X east, +Z south (Blender authored as (x,-z,y), exported with export_yup)',
    'front': 'figure faces (0.47, 0, 0.88)',
    'placement': {'position': list(PLACEMENT), 'rotationYDeg': 0.0, 'note': 'hero frame (floor y=-3); loaded by living-cocoon.ts, not by loadHeroGlbs'},
    'triangles': sum(stats.values()), 'bytes': size,
    'objects': [{'name': k, 'tris': v} for k, v in stats.items()],
    'anchors': {'cocoon': {'local': [0.0, -2.4, 0.0], 'world': [170.0, -2.4, -14.0]},
                'shell-centre': {'local': c3, 'world': [c3[0] + 170, c3[1], c3[2] - 14]}},
    'materials': ['cocoon_body', 'cocoon_shell', 'cocoon_pool'],
    'build': 'tools/blender/build-living-cocoon-corpse.py',
    'sources': 'public/assets/deepsea/living/SOURCES.md',
    'notes': 'Seated curled figure (CC0 Blender Studio human base mesh, smoothed, featureless) in a body-following amber shell; runtime rebinds materials by node name. No identifying detail.',
    'built': time.strftime('%Y-%m-%d %H:%M'), 'buildSeconds': round(time.time() - T0, 1),
}
(L.OUT / f'{NAME}.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
L.log('manifest', L.OUT / f'{NAME}.json')
