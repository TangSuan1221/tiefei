"""Blender-MCP authored retro navigation keypad.

References: qa/navigation-keyboard/reference-3view.webp (geometry, 3-view sheet)
            qa/navigation-keyboard/reference-render.webp (key-cap finish).
Metres, Blender Z-up. The wedge base sits on z=0, the key face looks toward -Y
(-> glTF +Z). Panel parts are modelled flat under the empty `nav_keyboard_panel`
which is tilted PANEL_TILT from horizontal, so every cap travels along its
parent's local -Z (three.js: local -Y). Caps carry a `control` custom property.

Run order (same Blender session, via tools/blender/mcp-request.mjs):
  build-navigation-keyboard.py   geometry + procedural wear materials
  render-navigation-keyboard.py  3-view + beauty comparison renders
  bake-navigation-keyboard.py    atlas bake + GLB export
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

ROOT = r'C:\Users\Lenovo\Desktop\tiefei'
FONT = r'C:\Windows\Fonts\msyh.ttc'
random.seed(7)

# ---- dimensions (front view: 258 x 222 px sheet units -> 0.30 m wide) ----------
S = .30 / 258
W, H = 258 * S, 222 * S            # cream frame plate
FRAME_T = .008                     # frame plate thickness
KEY, GAP_X, GAP_Y = 40 * S, 5 * S, 5.6 * S
WIDE = 72 * S
PITCH_X, PITCH_Y = KEY + GAP_X, KEY + GAP_Y
KEYS_W = 3 * KEY + 3 * GAP_X + WIDE
KEYS_H = 4 * KEY + 3 * GAP_Y
BEZEL_M = 7.5 * S                  # dark bezel margin around keys
BEZEL_W, BEZEL_H = KEYS_W + 2 * BEZEL_M, KEYS_H + 2 * BEZEL_M
BEZEL_T = .0065                    # bezel rise above the frame face
POCKET = .0042                     # pocket depth inside the bezel
CAP_H = .0205
TRAVEL_GAP = .0035                 # cap base above pocket floor (key travel room)
PANEL_TILT = math.radians(62)      # side view: 110 px run, 210 px rise
WEDGE_L = .232                     # hypotenuse length of the triangular side plates

# Flat panel frame: back of frame at z=0, bottom edge y=0, face toward +Z, top row +Y.
FACE = FRAME_T
POCKET_FLOOR = FACE + BEZEL_T - POCKET
CAP_BASE = POCKET_FLOOR + TRAVEL_GAP
cx0 = -KEYS_W / 2 + KEY / 2
cy_top = H / 2 + KEYS_H / 2 - KEY / 2

KEYS = []
digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '.']
slug = {'-': 'minus', '.': 'dot'}
for i, k in enumerate(digits):
    KEYS.append(dict(id='sonar.key.' + k, name='nav_key_' + slug.get(k, k), label={'-': '–'}.get(k, k),
                     x=cx0 + (i % 3) * PITCH_X, y=cy_top - (i // 3) * PITCH_Y, w=KEY))
wx = cx0 + 2 * PITCH_X + KEY / 2 + GAP_X + WIDE / 2
for row, (cid, name, label) in enumerate([
        ('sonar.key.del', 'nav_key_del', '退格'), ('sonar.key.clear', 'nav_key_clear', '清空'),
        ('sonar.next', 'nav_key_next', '写入'), ('sonar.save', 'nav_key_save', '确认')]):
    KEYS.append(dict(id=cid, name=name, label=label, x=wx, y=cy_top - row * PITCH_Y, w=WIDE))

# ---- scene ---------------------------------------------------------------------
SCENE = 'NavKeyboard'
scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
bpy.context.window.scene = scene
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in list(scene.collection.children):
    bpy.data.collections.remove(c)
for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
    for d in list(block):
        if d.users == 0:
            block.remove(d)
col = bpy.data.collections.new('NavigationKeyboard')
scene.collection.children.link(col)
helpers = bpy.data.collections.new('NavKeyboardHelpers')
scene.collection.children.link(helpers)


def link(o, c=None):
    for u in list(o.users_collection):
        u.objects.unlink(o)
    (col if c is None else c).objects.link(o)
    return o


def bake_xform(o):
    """Apply loc/rot/scale into mesh data (no operator context needed)."""
    o.data.transform(o.matrix_basis)
    o.matrix_basis.identity()


def apply_mods(o):
    """Evaluate the modifier stack through the depsgraph and store the result."""
    if not o.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    me.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)


def smooth(o, angle=35):
    """Flat-shade hard edges over `angle`, smooth elsewhere (mark sharp + smooth faces)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    lim = math.radians(angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim)
    bm.to_mesh(o.data); bm.free()


def bevel(o, width, seg=3, angle=40):
    m = o.modifiers.new('edge', 'BEVEL')
    m.width = width; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    m.miter_outer = 'MITER_ARC'
    apply_mods(o)


def boolean(o, cutter, op='DIFFERENCE'):
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.operation = op; m.object = cutter; m.solver = 'EXACT'
    m.material_mode = 'TRANSFER'
    apply_mods(o)
    me = cutter.data
    bpy.data.objects.remove(cutter)
    if me.users == 0:
        bpy.data.meshes.remove(me)


def prim(name, kind, c=None, **kw):
    """bmesh primitive as a new object; kw: size/radius/depth/verts/loc/rot."""
    bm = bmesh.new()
    if kind == 'cube':
        bmesh.ops.create_cube(bm, size=kw.get('size', 1))
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get('verts', 32), radius1=kw['radius'], radius2=kw['radius'], depth=kw['depth'])
    elif kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get('verts', 32), v_segments=kw.get('rings', 16), radius=kw['radius'])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me), c)
    o.location = kw.get('loc', (0, 0, 0)); o.rotation_euler = kw.get('rot', (0, 0, 0)); o.scale = kw.get('scale', (1, 1, 1))
    return o


# ---- materials -------------------------------------------------------------------
def principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.name = 'OUT'
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.name = 'BSDF'
    nt.links.new(b.outputs[0], out.inputs[0])
    return m, nt, b


def node(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def feed(nt, sock, v):
    if isinstance(v, (int, float, tuple, list)):
        sock.default_value = v
    else:
        nt.links.new(v, sock)


def mth(nt, op, a, b=None, clamp=False):
    n = node(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    feed(nt, n.inputs[0], a)
    if b is not None:
        feed(nt, n.inputs[1], b)
    return n.outputs[0]


def mixc(nt, fac, a, b):
    n = node(nt, 'ShaderNodeMix', data_type='RGBA')
    feed(nt, n.inputs[0], fac); feed(nt, n.inputs[6], a); feed(nt, n.inputs[7], b)
    return n.outputs[2]


def mixf(nt, fac, a, b):
    n = node(nt, 'ShaderNodeMix', data_type='FLOAT')
    feed(nt, n.inputs[0], fac); feed(nt, n.inputs[2], a); feed(nt, n.inputs[3], b)
    return n.outputs[0]


def noise(nt, coord, scale, detail=4, rough=.55, w=0.0):
    n = node(nt, 'ShaderNodeTexNoise', noise_dimensions='4D')
    n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough; n.inputs['W'].default_value = w
    nt.links.new(coord, n.inputs['Vector'])
    return n.outputs['Fac']


def rgb(c, k=1.0):
    return (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1)


def worn(name, paint, bare, paint_rough, bare_rough, paint_metal=.0, wear=1.0, seed=0.0,
         polish=0.0, rust=0.0, grime=.65, edge_px=.0045, dirt=0.0, speck=0.0):
    """Paint over metal: edge chipping, finger polish on up-facing tops, cavity grime and
    rust blooms. Reroutes BC / RG / MT feed the bake stage."""
    m, nt, b = principled(name)
    geo = node(nt, 'ShaderNodeNewGeometry')
    co = node(nt, 'ShaderNodeTexCoord').outputs['Object']
    bev = node(nt, 'ShaderNodeBevel', samples=16); bev.inputs['Radius'].default_value = edge_px
    dot = node(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    nt.links.new(bev.outputs[0], dot.inputs[0]); nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', 1.0, dot.outputs['Value']), 9.0, clamp=True)
    chips = noise(nt, co, 120, 10, .7, seed)
    blotch = noise(nt, co, 34, 3, .5, seed + 3)
    chip = mth(nt, 'SUBTRACT', mth(nt, 'MULTIPLY', edge, 1.6 * wear), mth(nt, 'MULTIPLY', chips, 1.0))
    chip = mth(nt, 'ADD', chip, mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', blotch, .5), .7 * wear))
    # Sparse scratches/scuffs on flat areas.
    scuff = noise(nt, co, 260, 6, .7, seed + 23)
    chip = mth(nt, 'ADD', chip, mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', scuff, .6), 2.6 * wear))
    wear_m = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', chip, -.12), 6.0, clamp=True)
    # Finger polish on faces looking along +Z of the object (key tops).
    sep = node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sep.inputs[0])
    vec = node(nt, 'ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to='OBJECT')
    nt.links.new(geo.outputs['Normal'], vec.inputs[0])
    sep2 = node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(vec.outputs[0], sep2.inputs[0])
    top = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', sep2.outputs['Z'], .9), 10.0, clamp=True)
    rub = mth(nt, 'MULTIPLY', mth(nt, 'MULTIPLY', top, polish), mth(nt, 'ADD', .55, mth(nt, 'MULTIPLY', blotch, .9)), clamp=True)
    ao = node(nt, 'ShaderNodeAmbientOcclusion', samples=16, only_local=True); ao.inputs['Distance'].default_value = .007
    cav = mth(nt, 'POWER', ao.outputs['AO'], 2.2)
    streak = noise(nt, co, 70, 6, .6, seed + 7)
    paint_c = mixc(nt, mth(nt, 'MULTIPLY', streak, .7), rgb(paint, .78), rgb(paint, 1.22))
    paint_c = mixc(nt, rub, paint_c, rgb(paint, 1.85))
    base = mixc(nt, wear_m, paint_c, rgb(bare))
    rough_c = noise(nt, co, 480, 4, .5, seed + 11)
    rg = mixf(nt, wear_m, paint_rough, bare_rough)
    rg = mth(nt, 'SUBTRACT', rg, mth(nt, 'MULTIPLY', rub, .16))
    mt = mixf(nt, wear_m, paint_metal, 1.0)
    if rust > 0:
        rs = noise(nt, co, 40, 9, .72, seed + 17)
        rmask = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', mth(nt, 'ADD', rs, mth(nt, 'MULTIPLY', edge, .7 * rust)), 1 - .42 * rust), 4.0, clamp=True)
        rcol = mixc(nt, noise(nt, co, 400, 6, .6, seed + 19), (.16, .055, .018, 1), (.36, .15, .05, 1))
        base = mixc(nt, rmask, base, rcol)
        rg = mixf(nt, rmask, rg, .93)
        mt = mixf(nt, rmask, mt, .1)
    if dirt > 0:
        d1 = noise(nt, co, 22, 7, .68, seed + 29)
        d2 = noise(nt, co, 140, 5, .6, seed + 31)
        dmask = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', mth(nt, 'ADD', d1, mth(nt, 'MULTIPLY', d2, .45)), .82 - .3 * dirt), 2.2, clamp=True)
        base = mixc(nt, mth(nt, 'MULTIPLY', dmask, .85), base, (.13, .085, .05, 1))
        rg = mixf(nt, dmask, rg, .9)
    if speck > 0:
        # Pitting / dark flecks scattered over the paint (reference frame and side plates).
        sp = node(nt, 'ShaderNodeTexVoronoi', feature='F1'); sp.inputs['Scale'].default_value = 150; sp.inputs['Randomness'].default_value = 1
        nt.links.new(co, sp.inputs['Vector'])
        sp_n = noise(nt, co, 18, 3, .5, seed + 37)
        fleck = mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', .2 * speck, sp.outputs['Distance']), 25.0, clamp=True)
        fleck = mth(nt, 'MULTIPLY', fleck, mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', sp_n, .42), 3.0, clamp=True))
        base = mixc(nt, fleck, base, (.07, .045, .03, 1))
    bc = mixc(nt, mixf(nt, cav, grime, 0.0), base, rgb(paint, .18))
    rg = mth(nt, 'ADD', rg, mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', rough_c, .5), .18), clamp=True)
    hgt = mth(nt, 'ADD', mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', 1.0, wear_m), .55), mth(nt, 'MULTIPLY', rough_c, .45))
    bump = node(nt, 'ShaderNodeBump'); bump.inputs['Strength'].default_value = .45; bump.inputs['Distance'].default_value = .0001
    nt.links.new(hgt, bump.inputs['Height'])
    for label, sock in (('BC', bc), ('RG', rg), ('MT', mt)):
        r = node(nt, 'NodeReroute'); r.name = label; r.label = label
        nt.links.new(sock, r.inputs[0])
    nt.links.new(nt.nodes['BC'].outputs[0], b.inputs['Base Color'])
    nt.links.new(nt.nodes['RG'].outputs[0], b.inputs['Roughness'])
    nt.links.new(nt.nodes['MT'].outputs[0], b.inputs['Metallic'])
    nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return m


def plain(name, color, rough, metal, ao_dist=.004):
    m, nt, b = principled(name)
    co = node(nt, 'ShaderNodeTexCoord').outputs['Object']
    n = noise(nt, co, 600, 3)
    ao = node(nt, 'ShaderNodeAmbientOcclusion', samples=16, only_local=True); ao.inputs['Distance'].default_value = ao_dist
    bc = mixc(nt, ao.outputs['AO'], rgb(color, .45), rgb(color))
    rg = mth(nt, 'ADD', rough, mth(nt, 'MULTIPLY', mth(nt, 'SUBTRACT', n, .5), .12), clamp=True)
    for label, sock in (('BC', bc), ('RG', rg)):
        r = node(nt, 'NodeReroute'); r.name = label; nt.links.new(sock, r.inputs[0])
    v = node(nt, 'ShaderNodeValue'); v.name = 'MT'; v.outputs[0].default_value = metal
    nt.links.new(nt.nodes['BC'].outputs[0], b.inputs['Base Color'])
    nt.links.new(nt.nodes['RG'].outputs[0], b.inputs['Roughness'])
    nt.links.new(v.outputs[0], b.inputs['Metallic'])
    return m


STEEL = (.30, .29, .27)
# Painted to match the nav CRT housing above it (src/pod/view/cabin-crt-art.ts: enamel 0x747b79,
# sides 0x4a463d, gasket 0x080b09, both multiplied by the #a29b89 wear map), converted to linear.
ENAMEL, SIDE = (.063, .065, .048), (.025, .020, .012)
cream_mat = worn('kb_frame_cream', ENAMEL, (.24, .2, .16), .83, .45, .14, wear=.8, seed=1, rust=.25, grime=.7, dirt=.35, speck=.7)
bezel_mat = worn('kb_bezel', (.0027, .0037, .0029), (.16, .15, .12), .84, .5, .1, wear=.6, seed=5, grime=.5, dirt=.2)
cap_mat = worn('kb_cap', (.030, .031, .027), (.17, .155, .12), .7, .45, .12, wear=.8, seed=9, polish=.35, grime=.45, edge_px=.0035, speck=.5)
grey_mat = worn('kb_housing_grey', SIDE, (.2, .18, .15), .86, .45, .22, wear=.8, seed=13, rust=.2, grime=.7, dirt=.3, speck=.6)
ink_mat = plain('kb_ink', (.45, .44, .32), .72, 0.0, .0012)  # CRT legend #b4b29a
screw_mat = worn('kb_screw', (.165, .144, .098), (.30, .28, .22), .6, .4, .62, wear=1.4, seed=21, grime=.6, edge_px=.0015)
dark_mat = plain('kb_cavity', (.014, .012, .011), .82, .1)
wire_mat = worn('kb_wire', (.30, .30, .28), (.5, .5, .47), .32, .25, .9, wear=.5, seed=27, rust=.25, grime=.2)
plate_mat = worn('kb_nameplate', (.50, .38, .21), (.62, .46, .26), .36, .28, .85, wear=.6, seed=31, grime=.8, edge_px=.0015, dirt=.4)
engrave_mat = plain('kb_engrave', (.03, .028, .026), .6, .3, .001)


# ---- geometry helpers -------------------------------------------------------------
def rrect(name, w, h, d, r, z0, mat, seg=6, x=0.0, y=0.0, c=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(x, y, z0 + d / 2), verts=bm.verts)
    if r > 0:
        vertical = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).normalized().z) > .99]
        bmesh.ops.bevel(bm, geom=vertical, offset=r, segments=seg, affect='EDGES', profile=.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me), c)
    o.data.materials.append(mat)
    return o


def text_obj(text, size, depth, x, y, z0, mat, c=None, spacing=1.0, res=3):
    cu = bpy.data.curves.new('t', 'FONT')
    cu.body = text
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.space_character = spacing; cu.extrude = depth / 2; cu.resolution_u = res
    tmp = link(bpy.data.objects.new('tmp', cu), helpers)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp); bpy.data.curves.remove(cu)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, -depth / 2))
    for v in me.vertices:
        v.co -= off
    o = link(bpy.data.objects.new("text_" + text, me), helpers if c is None else c)
    o.location = (x, y, z0)
    o.data.materials.append(mat)
    return o


def cylinder(name, r, depth, loc, rot=(0, 0, 0), mat=None, verts=32, c=None):
    o = prim(name, 'cyl', c, radius=r, depth=depth, verts=verts, loc=loc, rot=rot)
    if mat:
        o.data.materials.append(mat)
    return o


def screw(name, x, y, z, r, mat, c=None, rot=0.0):
    """Domed Phillips head sitting on the surface z, facing +Z."""
    head = prim(name, 'sphere', c, radius=r, verts=32, rings=16, loc=(x, y, z), scale=(1, 1, .42))
    bake_xform(head)
    boolean(head, prim('cut', 'cube', helpers, size=r * 4, loc=(x, y, z - r * 2)))
    for a in (0, math.pi / 2):
        cut = prim('cut', 'cube', helpers, loc=(x, y, z + r * .42), rot=(0, 0, a + rot), scale=(r * 1.35, r * .22, r * .5))
        boolean(head, cut)
    head.data.materials.clear(); head.data.materials.append(mat)
    smooth(head, 40)
    return head


def upright(o):
    """Turn a flat (XY) part so its +Z face looks toward +Y, then bake the transform."""
    o.rotation_euler = (-math.pi / 2, 0, 0)
    bake_xform(o)
    return o


# ---- panel (flat) ---------------------------------------------------------------------
panel = link(bpy.data.objects.new('nav_keyboard_panel', None))
pc = bpy.data.collections.new('NavKeyboardPanel'); scene.collection.children.link(pc)
panel_parts = []

frame = rrect('nav_keyboard_frame', W, H, FRAME_T, .011, 0, cream_mat, y=H / 2, c=pc)
bevel(frame, .0016, 3)
smooth(frame)
panel_parts.append(frame)

bezel = rrect('nav_keyboard_bezel', BEZEL_W, BEZEL_H, BEZEL_T + .001, .006, FACE - .001, bezel_mat, y=H / 2, c=pc)
boolean(bezel, rrect('pocket', BEZEL_W - 2 * BEZEL_M * .62, BEZEL_H - 2 * BEZEL_M * .62, .02, .004, POCKET_FLOOR, dark_mat, y=H / 2, c=helpers))
bevel(bezel, .0012, 3)
smooth(bezel)
panel_parts.append(bezel)
# Dark switch plate inside the pocket, with a raised boss under every key.
plate = rrect('nav_keyboard_switch_plate', BEZEL_W - 2 * BEZEL_M * .62, BEZEL_H - 2 * BEZEL_M * .62, .001, .004, POCKET_FLOOR - .001, dark_mat, y=H / 2, c=pc)
panel_parts.append(plate)
for k in KEYS:
    stem = rrect('stem_' + k['name'], k['w'] * .5, KEY * .5, TRAVEL_GAP + .004, .003, POCKET_FLOOR - .0005, dark_mat, x=k['x'], y=k['y'], c=pc, seg=2)
    panel_parts.append(stem)

sx, sy = W / 2 - .0105, H / 2 - .0105
for i, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
    ring = cylinder('nav_keyboard_screw_seat', .0058, .0012, (dx * sx, H / 2 + dy * sy, FACE + .0001), mat=dark_mat, verts=28, c=pc)
    panel_parts.append(ring)
    panel_parts.append(screw('nav_keyboard_screw', dx * sx, H / 2 + dy * sy, FACE + .0005, .0049, screw_mat, c=pc, rot=random.uniform(0, 1.5)))


def keycap(spec):
    w, d, h = spec['w'], KEY, CAP_H
    taper = .0058
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    for v in bm.verts:
        if v.co.z > h * .9:
            v.co.x *= (w - 2 * taper) / w
            v.co.y *= (d - 2 * taper) / d
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).normalized().z) > .5],
                    offset=.0036, segments=4, affect='EDGES', profile=.5)
    me = bpy.data.meshes.new(spec['name'])
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(spec['name'], me), pc)
    o.data.materials.append(cap_mat)
    # Shallow cylindrical finger dish across the key's width.
    dish, R = .0009, .085
    boolean(o, cylinder('dish', R, w + .02, (0, 0, h + R - dish), (0, math.pi / 2, 0), verts=96, c=helpers))
    bevel(o, .0015, 3, 25)
    label = spec['label']
    if label:
        single = len(label) == 1
        size = {'.': .03, '–': .022}.get(label, .0185 if single else .0158)
        engrave = .0006
        t = text_obj(label, size, .01, 0, 0, h - dish - engrave + .005, ink_mat, spacing=1.08 if single else 1.12)
        t.location.z = h - dish - engrave
        boolean(o, t)
    o.location = (spec['x'], spec['y'], CAP_BASE)
    o['control'] = spec['id']
    o['station'] = 'nav'
    smooth(o, 32)
    return o


caps = [keycap(k) for k in KEYS]

# ---- wedge stand (world frame) ---------------------------------------------------------
cosT, sinT = math.cos(PANEL_TILT), math.sin(PANEL_TILT)
Z0 = .0058                                   # wedge bottom; wire foot runs underneath
Y0 = -.05                                    # panel bottom-back hinge line
panel.location = (0, Y0, Z0)
panel.rotation_euler = (PANEL_TILT, 0, 0)
A = Vector((0, Y0 + .006 * cosT, Z0 + .006 * sinT))
C = A + Vector((0, cosT, sinT)) * WEDGE_L
B = Vector((0, C.y, A.z))
SIDE_X = W / 2 - .013
SIDE_T = .0032

stand = []
for side in (-1, 1):
    bm = bmesh.new()
    vs = [bm.verts.new((side * SIDE_X - SIDE_T / 2, p.y, p.z)) for p in (A, B, C)]
    vs += [bm.verts.new((side * SIDE_X + SIDE_T / 2, p.y, p.z)) for p in (A, B, C)]
    bm.faces.new(vs[0:3][::-1]); bm.faces.new(vs[3:6])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((vs[i], vs[j], vs[j + 3], vs[i + 3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('side'); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('nav_keyboard_side_plate', me)); o.data.materials.append(grey_mat)
    bevel(o, .0011, 2, 30); smooth(o)
    stand.append(o)
    # Folded flange along the hypotenuse, riveted to the panel back.
    fl = rrect('flange', .012, WEDGE_L - .01, .0025, .001, 0, grey_mat, c=col)
    fl.location = Vector((side * (SIDE_X - .006), (A.y + C.y) / 2, (A.z + C.z) / 2)) - Vector((0, -sinT, cosT)) * .0026
    fl.rotation_euler = (PANEL_TILT, 0, 0)
    stand.append(fl)

# Rear vertical plate (back view): upper zone with 4 holes + nameplate, lower bolted cover.
REAR_W, REAR_H = W - .012, C.z - Z0
# rrect rounds its local-Z edges, so build flat and stand it up.
rear = rrect('nav_keyboard_rear', REAR_W, REAR_H, .0034, .009, 0, grey_mat)
rear.rotation_euler = (math.pi / 2, 0, 0)
rear.location = (0, C.y + .0034 + .0002, Z0 + REAR_H / 2)
bake_xform(rear)
upper_z = Z0 + REAR_H * .55
for hx in (-1, 1):
    for hz in (Z0 + REAR_H - .018,):
        hole = cylinder('hole', .0042, .02, (hx * (REAR_W / 2 - .02), C.y, hz), (math.pi / 2, 0, 0), dark_mat, 24, helpers)
        boolean(rear, hole)
bevel(rear, .0012, 2, 35); smooth(rear)
stand.append(rear)
# Hole liners so the openings read dark rather than see-through.
for hx in (-1, 1):
    for hz in (Z0 + REAR_H - .018,):
        stand.append(cylinder('nav_keyboard_hole_liner', .0041, .003, (hx * (REAR_W / 2 - .02), C.y - .0005, hz), (math.pi / 2, 0, 0), dark_mat, 24))
cover_h = REAR_H * .47
cover = rrect('nav_keyboard_rear_cover', REAR_W - .012, cover_h, .0026, .006, 0, grey_mat)
cover.rotation_euler = (math.pi / 2, 0, 0)
cover.location = (0, C.y + .0034 + .0002 + .0028, Z0 + .006 + cover_h / 2)
bake_xform(cover)
bevel(cover, .0011, 2, 35); smooth(cover)
stand.append(cover)
for hx in (-1, 1):
    for hz in (Z0 + .006 + .012, Z0 + .006 + cover_h - .012):
        sc = screw('nav_keyboard_rear_screw', 0, 0, 0, .0042, screw_mat, rot=random.uniform(0, 1.5))
        sc.rotation_euler = (-math.pi / 2, 0, 0)
        sc.location = (hx * (REAR_W / 2 - .02), C.y + .0034 + .0002 + .0028, hz)
        bake_xform(sc)
        stand.append(sc)

# Nameplate "工业铭牌".
NP_W, NP_H = .066, .034
np_y = C.y + .0034 + .0002 + .0011
np_z = Z0 + REAR_H - .036
npl = rrect('nav_keyboard_nameplate', NP_W, NP_H, .0011, .0025, 0, plate_mat)
npl.rotation_euler = (math.pi / 2, 0, 0); npl.location = (0, np_y, np_z)
bake_xform(npl)
bevel(npl, .0004, 2, 35)
stand.append(npl)
legend = [text_obj('工业铭牌', .0062, .0006, 0, NP_H / 2 - .0068, 0, engrave_mat, col, 1.15)]
for i, lab in enumerate(('型号', '编号', '日期')):
    yy = NP_H / 2 - .0145 - i * .0062
    legend.append(text_obj(lab, .0036, .0005, -NP_W / 2 + .0085, yy, 0, engrave_mat, col))
    legend.append(rrect('rule', .038, .0005, .0005, 0, 0, engrave_mat, x=.0055, y=yy - .0016, c=col))
for t in legend:
    # Lay the flat legend onto the plate: local +Z -> +Y (out of the back), local +Y -> up,
    # local X mirrored so it reads correctly from behind.
    p = t.location.copy()
    t.rotation_euler = (math.pi / 2, 0, math.pi)
    t.location = (-p.x, np_y - .0001 + p.z, np_z + p.y)
    bake_xform(t)
    stand.append(t)
for rx in (-1, 1):
    for rz in (-1, 1):
        rv = cylinder('nav_keyboard_rivet', .0013, .0012, (rx * (NP_W / 2 - .003), np_y + .0004, np_z + rz * (NP_H / 2 - .003)), (math.pi / 2, 0, 0), screw_mat, 16)
        stand.append(rv)

# Bent wire foot: runs under each side plate, rises up the rear plate, joined at the front.
def wire(name, pts, r=.0021):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = r; cu.bevel_resolution = 4; cu.resolution_u = 10
    tmp = link(bpy.data.objects.new(name, cu), helpers)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp); bpy.data.curves.remove(cu)
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(wire_mat)
    smooth(o, 80)
    return o


wx_ = SIDE_X + .0042
front_y = A.y - .002
rise_z = Z0 + .046
back_y = C.y + .036
pts = [Vector((-wx_, C.y + .0055, rise_z)), Vector((-wx_, back_y - .004, .0032)), Vector((-wx_, back_y - .016, .0021)),
       Vector((-wx_, front_y + .01, .0021)), Vector((-wx_ + .008, front_y, .0021)), Vector((wx_ - .008, front_y, .0021)),
       Vector((wx_, front_y + .01, .0021)), Vector((wx_, back_y - .016, .0021)), Vector((wx_, back_y - .004, .0032)),
       Vector((wx_, C.y + .0055, rise_z))]
stand.append(wire('nav_keyboard_wire_foot', pts))
for side in (-1, 1):
    clip = rrect('nav_keyboard_wire_clip', .008, .006, .010, .0012, 0, grey_mat)
    clip.location = (side * wx_, C.y + .0058, rise_z - .005)
    stand.append(clip)

for h in list(helpers.objects):
    bpy.data.objects.remove(h)

for o in list(pc.objects):
    o.parent = panel
root = link(bpy.data.objects.new('nav_keyboard_root', None))
panel.parent = root
for o in stand:
    if o.parent is None:
        o.parent = root
tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for o in list(col.objects) + list(pc.objects):
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print({'keys': len(caps), 'W': round(W, 4), 'H': round(H, 4), 'wedge_depth': round(C.y - A.y, 4), 'wedge_h': round(C.z, 4), 'tris': tris})
