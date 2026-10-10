"""Elias (code name: Alex) 鈥?skinned commercial diver for level two.

CC0 Blender Studio human base mesh (male realistic, 1.80 m with boots, ~7.3 heads) re-used through
living_common.Figure (read-only) for proportions and skin weights. Suit layers are split into material
slots that the game replaces with procedural PBR: drysuit trilaminate, canvas wear pads, rubber
gloves/boots, webbing harness, painted compact helmet, brass/steel fittings, visor, lamp lens.

Output: public/assets/deepsea/living/living-diver-alex.glb (skinned, bones named pelvis, spine, chest,
neck, head, clav_L, upper_L, fore_L, hand_L, thigh_L, shin_L, foot_L and _R mirrors).

Run headless:  D:/blender/blender.exe -b --factory-startup -P tools/blender/living-diver-alex.py
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import living_common as L

OUT = L.OUT / 'living-diver-alex.glb'
MATS = ['suit', 'canvas', 'glove', 'boot', 'skin', 'metal', 'brass', 'paint', 'visor', 'lamp', 'webbing', 'rubber', 'tank']
MI = {m: i for i, m in enumerate(MATS)}
COL = dict(suit=(.05, .06, .07), canvas=(.32, .27, .18), tank=(.25, .27, .26), glove=(.03, .03, .03), boot=(.04, .04, .04), skin=(.3, .22, .18),
           metal=(.5, .5, .5), brass=(.6, .45, .2), paint=(.6, .45, .08), visor=(.02, .03, .03), lamp=(1, .95, .8),
           webbing=(.08, .08, .07), rubber=(.06, .06, .06))

sc = bpy.context.scene
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)

fig = L.Figure('male', height=1.78)
cfg, nb, S = fig.cfg, fig.n_body, fig.scale
bn = lambda n: n.replace('.', '_')
R = fig.rest  # unscaled Blender rest space: z up, faces -Y, figure's left is +X


def region(i, co):
    if i >= nb:
        return 'eye'
    if co.z > cfg['neck_z'] + 0.02 and abs(co.x) < 0.13:
        return 'skin'
    if fig.bone_weight(i, 'hand') > 0.5:
        return 'glove'
    if fig.bone_weight(i, 'foot') > 0.45 or co.z < 0.14:
        return 'boot'
    return 'suit'


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


def canvas_mask(co):
    """Smooth 0..1 mask of the canvas wear pads (knees, shins, shoulder yoke, elbows, seat)."""
    ax = abs(co.x)
    knee = (1 - ss(0.07, 0.1, (Vector((ax, co.y, co.z)) - Vector((0.135, -0.02, 0.5))).length)) * (1 - ss(0.02, 0.06, co.y))
    shin = ss(0.15, 0.18, co.z) * (1 - ss(0.38, 0.42, co.z)) * (1 - ss(-0.03, 0.0, co.y)) * (1 - ss(0.24, 0.27, ax))
    yoke = ss(1.27, 1.31, co.z) * ss(0.075, 0.11, ax)
    elbow = (1 - ss(0.06, 0.085, (Vector((ax, co.y, co.z)) - Vector((0.29, 0.01, 1.10))).length)) * ss(0.19, 0.2, ax)
    seat = ss(0.8, 0.83, co.z) * (1 - ss(0.95, 0.98, co.z)) * ss(0.05, 0.08, co.y)
    return max(knee, shin, yoke, elbow, seat)


def wear(co):
    """Low-frequency grime/abrasion field 0..1 (more at knees, shins, hands, seat, lower legs)."""
    n = L.noise3(Vector(co), scale=7.0, seed=3) * 0.5 + 0.5
    return max(0.0, min(1.0, 0.55 * n + 0.45 * (1 - ss(0.1, 0.7, co.z)) ))


reg = [region(i, c) for i, c in enumerate(R)]
cmask = [canvas_mask(c) for c in R]
wmask = [wear(c) for c in R]
fig.smooth_rest([r in ('suit', 'canvas', 'boot') for r in reg], iterations=6, factor=0.5)
infl = dict(eye=0.0, skin=0.0, glove=0.009, boot=0.026, suit=0.02)
bm = fig.pose({}, inflate=lambda i, co: infl[reg[i]] + (0.006 * cmask[i] if reg[i] == 'suit' else 0.0))  # rest pose, scaled
mask_l = bm.verts.layers.float.new('canvas')
wear_l = bm.verts.layers.float.new('wear')
bm.verts.ensure_lookup_table()
for i, v in enumerate(bm.verts):
    v[mask_l] = cmask[i] if reg[i] == 'suit' else 0.0
    v[wear_l] = wmask[i]
uv_body = bm.loops.layers.uv.active
L.log('uv layer on base mesh:', uv_body is not None, 'scale', round(S, 4))
dl = bm.verts.layers.deform.verify()
bm.verts.ensure_lookup_table()
names = [bn(n) for n in fig.names]
GI = {n: k for k, n in enumerate(names)}
for i, v in enumerate(bm.verts):
    for k, w in fig.W[i].items():
        v[dl][k] = w
bm.faces.ensure_lookup_table()
for f in bm.faces:
    rs = [reg[v.index] for v in f.verts]
    f.material_index = MI[max(set(rs), key=rs.count)] if 'eye' not in rs else MI['skin']
    f.smooth = True
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= nb], context='VERTS')


# ------------------------------------------------------------------ primitives (unscaled rest space)
def new_bm():
    b = bmesh.new(); b.loops.layers.uv.new('UVMap'); return b


def finish(b, mat, smooth=True):
    for f in b.faces:
        f.material_index = MI[mat]; f.smooth = smooth
    return b


def sphere(mat, c, r, segs=24, rings=14):
    b = new_bm(); bmesh.ops.create_uvsphere(b, u_segments=segs, v_segments=rings, radius=1.0, calc_uvs=True)
    L.transform(b, Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*r, 1)))
    return finish(b, mat)


def cyl(mat, a, c, r, segs=20, r2=None, caps=True):
    a, c = Vector(a), Vector(c); d = c - a
    b = new_bm(); bmesh.ops.create_cone(b, cap_ends=caps, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=d.length, calc_uvs=True)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    L.transform(b, Matrix.Translation((a + c) / 2) @ q)
    return finish(b, mat)


def box(mat, c, size, rot=Matrix.Identity(4)):
    b = new_bm(); bmesh.ops.create_cube(b, size=1.0, calc_uvs=True)
    bmesh.ops.bevel(b, geom=list(b.edges), offset=min(size) * 0.18, segments=2, affect='EDGES')
    L.transform(b, Matrix.Translation(Vector(c)) @ rot @ Matrix.Diagonal((*size, 1)))
    return finish(b, mat, smooth=False)


def tube(mat, pts, r, segs=10, closed=False, flat=1.0):
    """Sweep a circle (or flattened strap, flat<1) along pts with parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    b = new_bm(); uvl = b.loops.layers.uv.active
    rings, prev_nrm = [], None
    for i, p in enumerate(pts):
        t = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        t.normalize()
        if prev_nrm is None:
            prev_nrm = t.orthogonal().normalized()
        nrm = (prev_nrm - t * prev_nrm.dot(t)).normalized(); prev_nrm = nrm
        bi = t.cross(nrm)
        rings.append([b.verts.new(p + (nrm * math.cos(2 * math.pi * k / segs) * flat + bi * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    m = n if closed else n - 1
    for i in range(m):
        A, B = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            f = b.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
            for l, (u, v) in zip(f.loops, ((k / segs, i / m), ((k + 1) / segs, i / m), ((k + 1) / segs, (i + 1) / m), (k / segs, (i + 1) / m))):
                l[uvl].uv = (u, v * 4)
    return finish(b, mat)


def smooth_path(pts, sub=6):
    pts = [Vector(p) for p in pts]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for s in range(sub):
            t = s / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def loop_at(zz, xlim=0.21, push=0.012, n=36, ymask=None):
    """Torso cross-section at height zz (rest, unscaled) as a closed polyline pushed outward."""
    band = [c for i, c in enumerate(R) if i < nb and abs(c.z - zz) < 0.012 and abs(c.x) < xlim]
    cx = sum(c.x for c in band) / len(band); cy = sum(c.y for c in band) / len(band)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        d = Vector((math.cos(a), math.sin(a)))
        best = max((Vector((c.x - cx, c.y - cy)).dot(d) for c in band if Vector((c.x - cx, c.y - cy)).normalized().dot(d) > 0.96), default=0.1)
        pts.append(Vector((cx + d.x * (best + push), cy + d.y * (best + push), zz)))
    return pts


parts = []  # (bmesh, weights: dict bone->w  or callable(vertex co)->dict)


def add(b, bone):
    parts.append((b, bone))


# ------------------------------------------------------------------ helmet (compact, ~1.2x head)
head_v = [R[i] for i in range(nb) if reg[i] == 'skin']
hmn = Vector((min(c.x for c in head_v), min(c.y for c in head_v), min(c.z for c in head_v)))
hmx = Vector((max(c.x for c in head_v), max(c.y for c in head_v), max(c.z for c in head_v)))
hc = (hmn + hmx) / 2 + Vector((0, 0.004, 0.012))
hr = (hmx - hmn) / 2 + Vector((0.036, 0.04, 0.03))
L.log('head size', tuple(round(v, 3) for v in (hmx - hmn)), 'helmet radii', tuple(round(v, 3) for v in hr))
shell = new_bm(); bmesh.ops.create_uvsphere(shell, u_segments=40, v_segments=24, radius=1.0, calc_uvs=True)
VX, VZ = 0.74, 0.5
def in_visor(c):
    return c.y < 0 and (c.x / VX) ** 2 + ((c.z - 0.06) / VZ) ** 2 < 1
visor = shell.copy()
bmesh.ops.delete(shell, geom=[f for f in shell.faces if in_visor(f.calc_center_median()) or f.calc_center_median().z < -0.62], context='FACES')
bmesh.ops.delete(visor, geom=[f for f in visor.faces if not in_visor(f.calc_center_median())], context='FACES')
HM = Matrix.Translation(hc) @ Matrix.Diagonal((*hr, 1))
L.transform(shell, HM); finish(shell, 'paint')
L.transform(visor, Matrix.Translation(hc + Vector((0, 0.006, 0))) @ Matrix.Diagonal((hr.x * .985, hr.y * .985, hr.z * .985, 1))); finish(visor, 'visor')
bmesh.ops.solidify(shell, geom=list(shell.faces), thickness=0.006)
add(shell, 'head'); add(visor, 'head')
rim = []
for k in range(48):
    t = 2 * math.pi * k / 48
    xd, zd = VX * math.cos(t), 0.06 + VZ * math.sin(t)
    yd = -math.sqrt(max(0.0, 1 - xd * xd - zd * zd))
    rim.append(HM @ Vector((xd, yd, zd)) + Vector((0, -0.004, 0)))
add(tube('metal', rim, 0.011, segs=8, closed=True), 'head')
for k in range(0, 48, 6):
    add(sphere('brass', rim[k] + Vector((0, -0.008, 0)), (0.007, 0.006, 0.007), 8, 6), 'head')
# lower helmet skirt + neck ring + neck seal
bot = [HM @ Vector((math.cos(2 * math.pi * k / 32) * 0.78, math.sin(2 * math.pi * k / 32) * 0.78, -0.62)) for k in range(32)]
add(tube('metal', bot, 0.012, segs=8, closed=True), 'head')
nz = cfg['neck_z'] - 0.035
neck_ring = [Vector((math.cos(2 * math.pi * k / 32) * 0.098, -0.02 + math.sin(2 * math.pi * k / 32) * 0.092, nz)) for k in range(32)]
add(tube('metal', neck_ring, 0.017, segs=10, closed=True), 'neck')
add(cyl('rubber', (0, -0.02, nz - 0.01), (0, -0.025, hc.z - hr.z * 0.6), 0.085, segs=24, r2=0.075, caps=False), 'neck')
# top handle, lamp on the right temple (-X), comms box on the left, demand valve lower right
top = [HM @ Vector((0, y, z)) for y, z in ((-0.55, 0.86), (-0.2, 1.05), (0.25, 1.05), (0.62, 0.84))]
add(tube('metal', smooth_path(top), 0.008, segs=8), 'head')
lamp_a = HM @ Vector((-0.86, -0.35, 0.45)); lamp_b = lamp_a + Vector((0, -0.085, 0))
add(cyl('metal', lamp_a, lamp_b, 0.026, segs=18), 'head')
add(cyl('lamp', lamp_b, lamp_b + Vector((0, -0.004, 0)), 0.021, segs=18), 'head')
add(box('rubber', HM @ Vector((0.96, 0.05, 0.05)), (0.025, 0.07, 0.06)), 'head')
dv = HM @ Vector((-0.6, -0.72, -0.35))
add(cyl('brass', dv, dv + Vector((-0.03, -0.035, -0.01)), 0.024, segs=16), 'head')
add(cyl('metal', dv + Vector((-0.03, -0.035, -0.01)), dv + Vector((-0.035, -0.045, -0.012)), 0.027, segs=16), 'head')

# ------------------------------------------------------------------ back: plate, twin tanks, manifold
back = max(c.y for i, c in enumerate(R) if i < nb and 1.05 < c.z < 1.3 and abs(c.x) < 0.1) + 0.02
add(box('metal', (0, back + 0.012, 1.17), (0.25, 0.014, 0.5)), 'chest')
TR = 0.074
for s in (-1, 1):
    x, y = s * 0.083, back + 0.024 + TR
    add(cyl('tank', (x, y, 0.94), (x, y, 1.40), TR, segs=28, caps=False), 'chest')
    add(sphere('tank', (x, y, 1.40), (TR, TR, TR * 0.8), 28, 10), 'chest')
    add(sphere('tank', (x, y, 0.94), (TR, TR, TR * 0.8), 28, 10), 'chest')
    add(cyl('brass', (x, y, 1.45), (x, y, 1.50), 0.018, segs=12), 'chest')
    for zz in (1.02, 1.32):
        add(tube('webbing', [Vector((x + TR * 1.05 * math.cos(a), y + TR * 1.05 * math.sin(a), zz)) for a in [2 * math.pi * k / 24 for k in range(24)]], 0.006, segs=6, closed=True, flat=0.35), 'chest')
add(cyl('metal', (-0.083, back + 0.024 + TR, 1.50), (0.083, back + 0.024 + TR, 1.50), 0.013, segs=12), 'chest')
for s in (-1, 1):
    add(cyl('metal', (s * 0.11, back + 0.024 + TR, 1.50), (s * 0.135, back + 0.024 + TR, 1.50), 0.022, segs=14), 'chest')

# ------------------------------------------------------------------ harness, weight belt, hoses
for zz, push, bone in ((1.22, 0.012, 'chest'), (1.0, 0.012, 'spine')):
    add(tube('webbing', loop_at(zz, push=push), 0.016, segs=8, closed=True, flat=0.28), bone)
belt = loop_at(0.93, xlim=0.22, push=0.014)
add(tube('webbing', belt, 0.022, segs=8, closed=True, flat=0.3), 'pelvis')
for k in (13, 16, 20, 23, 27, 31, 4):
    p = belt[k]; d = Vector((p.x, p.y + 0.0, 0)).normalized()
    rot = Matrix.Rotation(math.atan2(d.x, -d.y), 4, 'Z')
    add(box('metal', p + d * 0.012, (0.07, 0.03, 0.055), rot), 'pelvis')
add(box('brass', belt[27] + Vector((0, -0.02, 0)), (0.06, 0.015, 0.045)), 'pelvis')
for s in (-1, 1):
    pts = [(s * 0.1, -0.15, 1.0), (s * 0.12, -0.165, 1.22), (s * 0.125, -0.07, 1.42), (s * 0.12, 0.09, 1.42), (s * 0.1, back + 0.01, 1.3)]
    add(tube('webbing', smooth_path(pts), 0.017, segs=8, flat=0.28), 'chest')
    add(box('metal', (s * 0.115, -0.175, 1.22), (0.04, 0.012, 0.03)), 'chest')
# crotch strap
add(tube('webbing', smooth_path([(0, -0.14, 0.93), (0, -0.1, 0.83), (0, 0.02, 0.8), (0, 0.11, 0.86), (0, back - 0.02, 0.93)]), 0.016, segs=8, flat=0.28), 'pelvis')
# main hose: right tank valve over the right shoulder into the demand valve (blends chest -> head)
hose = smooth_path([(-0.135, back + 0.098, 1.5), (-0.19, back + 0.02, 1.56), (-0.2, -0.04, 1.52), (-0.16, -0.12, 1.46), dv + Vector((-0.04, -0.03, -0.02))], 8)
add(tube('rubber', hose, 0.0135, segs=10), ('hose', 'chest', 'head'))
# gauge hose from the left valve down to a console clipped at the left chest strap
g = smooth_path([(0.135, back + 0.098, 1.5), (0.22, back, 1.35), (0.2, -0.08, 1.15), (0.14, -0.175, 1.12)], 8)
add(tube('rubber', g, 0.009, segs=8), 'chest')
add(cyl('brass', (0.14, -0.18, 1.12), (0.14, -0.205, 1.12), 0.032, segs=20), 'chest')
add(cyl('visor', (0.14, -0.205, 1.12), (0.14, -0.208, 1.12), 0.026, segs=20), 'chest')
add(sphere('lamp', (0.13, -0.17, 1.30), (0.012, 0.008, 0.012), 10, 6), 'chest')  # chest strobe

# ------------------------------------------------------------------ limbs: cuffs, wrist unit, knife, thigh pocket, boot soles
for s, side in ((1, 'L'), (-1, 'R')):
    _, wh, _ = fig.bones[f'hand.{side}']
    _, fh, ft = fig.bones[f'fore.{side}']
    d = (ft - fh).normalized()
    add(cyl('rubber', wh - d * 0.03, wh + d * 0.005, 0.042, segs=20, caps=False), f'fore.{side}')
    add(cyl('metal', wh - d * 0.035, wh - d * 0.025, 0.046, segs=20), f'fore.{side}')
    _, th, tt = fig.bones[f'thigh.{side}']
    _, sh, st = fig.bones[f'shin.{side}']
    add(cyl('webbing', st + Vector((0, 0.0, 0.07)), st + Vector((0, 0, 0.09)), 0.062, segs=20, caps=False), f'shin.{side}')
    _, ff, fft = fig.bones[f'foot.{side}']
    sole_c = Vector((ff.x + (fft.x - ff.x) * 0.3, (ff.y + fft.y) / 2 - 0.01, 0.012))
    add(box('rubber', sole_c, (0.115, 0.29, 0.03)), f'foot.{side}')
_, fh, ft = fig.bones['fore.L']
c = fh.lerp(ft, 0.62) + Vector((0.0, -0.035, 0.02))
add(box('rubber', c, (0.045, 0.06, 0.02)), 'fore.L')
add(box('visor', c + Vector((0, -0.002, 0.011)), (0.035, 0.045, 0.004)), 'fore.L')
_, sh, st = fig.bones['shin.R']
kc = sh.lerp(st, 0.45) + Vector((-0.065, 0.0, 0))
add(box('rubber', kc, (0.02, 0.05, 0.2)), 'shin.R')
add(cyl('metal', kc + Vector((0, 0, 0.1)), kc + Vector((0, 0, 0.14)), 0.012, segs=10), 'shin.R')
_, th, tt = fig.bones['thigh.R']
add(box('canvas', th.lerp(tt, 0.5) + Vector((-0.085, -0.01, 0)), (0.03, 0.15, 0.17)), 'thigh.R')

# ------------------------------------------------------------------ merge, weights, armature, export
for b, bone in parts:
    n0 = len(bm.verts)
    L.transform(b, Matrix.Scale(S, 4))
    L.merge_bm(bm, b, None)
    bm.verts.ensure_lookup_table()
    new = bm.verts[n0:]
    if isinstance(bone, tuple):
        _, a, c = bone
        for v in new:
            t = max(0.0, min(1.0, (-v.co.y - 0.04) / 0.12))
            v[dl][GI[a]] = 1 - t
            if t > 0:
                v[dl][GI[c]] = t
    else:
        g = GI[bn(bone)]
        for v in new:
            v[dl][g] = 1.0
    b.free()
bm.normal_update()
me = bpy.data.meshes.new('alex_body')
bm.to_mesh(me)
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
cv, wv = me.attributes['canvas'].data, me.attributes['wear'].data
for i, d in enumerate(ca.data):
    d.color = (cv[i].value, wv[i].value, 0.0, 1.0)
me.color_attributes.active_color = ca
me.attributes.remove(me.attributes['canvas']); me.attributes.remove(me.attributes['wear'])
ob = bpy.data.objects.new('alex-diver', me)
sc.collection.objects.link(ob)
for g in names:
    ob.vertex_groups.new(name=g)
for m in MATS:
    mat = bpy.data.materials.new('alex_' + m)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*COL[m], 1)
    me.materials.append(mat)
L.log('alex tris', sum(len(p.vertices) - 2 for p in me.polygons), 'verts', len(me.vertices))

arm_d = bpy.data.armatures.new('alex_rig')
arm = bpy.data.objects.new('alex-rig', arm_d)
sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in fig.names:
    _, h, t = fig.bones[n]
    eb = arm_d.edit_bones.new(bn(n)); eb.head = h * S; eb.tail = t * S
for n in fig.names:
    par = fig.bones[n][0]
    if par:
        arm_d.edit_bones[bn(n)].parent = arm_d.edit_bones[bn(par)]
bpy.ops.object.mode_set(mode='OBJECT')
ob.parent = arm
mod = ob.modifiers.new('rig', 'ARMATURE'); mod.object = arm
for o in sc.objects:
    o.select_set(o in (ob, arm))
kw = dict(filepath=str(OUT), export_format='GLB', use_selection=True, export_yup=True, export_skins=True, export_animations=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
except TypeError:
    bpy.ops.export_scene.gltf(**kw, export_colors=True)
L.log('wrote', OUT, os.path.getsize(OUT))
