"""Level two Gate F: 8 m human-scale vertical-lift pressure gate in wall z=42.

Local frame = world translated by (188, 0, 42). Opening x -4..4, y -3..0.6.
Pod (atrium A) side is +Z; Alex's inner dormitory side (N) is -Z.
'gate-leaf' origin is its bottom centre (0,-3,0): raise it along +Y (3.6 m clears
the opening). Children of the leaf: 'gate-port-glass', 'lock-wheel' (origin on
hub, spins about local Z), 'gate-leaf-stencils'. Fixed inner-side controls:
'keypad', 'relief-lever' (origin on pivot, pull down = rotate about local X).

    blender -b -P tools/blender/build-living-gate-f.py
"""
import sys, math, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'gate-f'
ZO, ZI = 0.30, -0.30       # outer (pod) and inner (Alex) wall faces
X0, X1, Y0, Y1 = -4.0, 4.0, -3.0, 0.6
PORT = Vector((0.0, -1.2, 0.0))
WHEEL = Vector((1.55, -1.55, -0.31))
KEYPAD = Vector((4.85, -1.45, ZI - 0.05))
LEVER = Vector((-4.85, -1.25, ZI - 0.12))

KINDS = {
    'frame': dict(scan='shutter', tint=(0.17, 0.19, 0.19), tint_mix=0.9, contrast=0.6, rough=0.55, wear=0.6, chips=0.35, rust=0.35, bio=0.45, silt=0.55, bio_lo=-3, bio_hi=0.5, seed=41),
    'leaf': dict(scan='shutter', tint=(0.20, 0.30, 0.29), tint_mix=0.9, contrast=0.35, rough=0.5, wear=0.7, chips=0.45, rust=0.45, bio=0.55, silt=0.5, bio_lo=-3, bio_hi=-0.6, dirt=0.65, seed=42),
    'steel': dict(scan='rust_coarse', tint=(0.32, 0.30, 0.28), tint_mix=0.75, rough=0.45, metal=0.85, rust=0.6, bio=0.25, silt=0.5, grime=0.8, seed=43),
    'red': dict(scan='shutter', tint=(0.50, 0.06, 0.04), tint_mix=0.9, rough=0.45, wear=0.8, chips=0.3, rust=0.3, bio=0.3, silt=0.4, dirt=0.4, seed=44),
    'rubber': dict(scan='rubber', tint=(0.025, 0.025, 0.025), tint_mix=0.9, rough=0.75, bio=0.3, silt=0.3, grime=0.3, seed=45),
    'amber': dict(scan='shutter', tint=(0.85, 0.48, 0.08), tint_mix=0.9, rough=0.2, grime=0.6, silt=0.3, bio=0.2, seed=46),
    'grating': dict(scan='rust_coarse', tint=(0.25, 0.24, 0.22), tint_mix=0.6, rough=0.6, metal=0.7, rust=0.7, bio=0.6, silt=0.8, seed=47),
    'plastic': dict(scan='shutter', tint=(0.12, 0.13, 0.13), tint_mix=0.9, rough=0.35, grime=0.6, silt=0.3, bio=0.3, dirt=0.4, seed=48),
    'glass': dict(scan='shutter', tint=(0.86, 0.92, 0.9), tint_mix=1.0, contrast=0.15, rough=0.04, rough_var=0.02, grime=0.15, dirt=0.15, silt=0.1, bio=0.3, bump=0.03, ao_dist=0.04, seed=49),
    'decal': dict(scan='shutter', image=None, rough=0.55, rough_var=0.15, grime=0.4, silt=0.35, bio=0.25, rust=0.25, dirt=0.4, bump=0.15, image_mix=0.8, seed=50),
}
GROUPS = {
    'main': dict(res=2048),
    'glass': dict(res=512, maps=('color', 'orm'), transmission=1.0, ior=1.5, thickness=0.08, attenuation=(0.75, 0.86, 0.82), density=0.8),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
DECALS = {
    'outer': (0.0, 3.3, 4.0, 0.7),       # GATE F header 4.0 x 0.7
    'hazard': (0.0, 3.0, 4.0, 0.25),
    'inner': (0.0, 2.2, 2.4, 0.75),      # inner header 2.4 x 0.75
    'steps': (2.5, 1.5, 1.5, 1.45),      # small procedure plate next to the keypad
    'keypad': (0.0, 0.8, 0.9, 1.3),      # keypad face 0.27 x 0.39
    'lever': (1.0, 0.8, 1.3, 1.3),       # relief lever plate
    'port': (0.0, 0.0, 2.4, 0.7),        # outer viewing-port ring text
}


def duv(k):
    x, y, w, h = DECALS[k]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def graphic():
    it = []
    yel, blk, wht, red = (0.86, 0.66, 0.08), (0.05, 0.05, 0.05), (0.92, 0.92, 0.88), (0.72, 0.08, 0.06)
    x, y, w, h = DECALS['outer']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.85, 0.83, 0.76)),
           dict(type='rect', xywh=(x, y, 0.75, h), color=red),
           dict(type='text', text='F', xy=(x + 0.375, y + 0.13), size=0.52, align='CENTER', color=wht, font=L.FONT_STENCIL),
           dict(type='text', text='压力闸门  宿舍区内侧', xy=(x + 2.37, y + 0.38), size=0.2, align='CENTER', color=blk),
           dict(type='text', text='PRESSURE GATE F · OPERATE FROM INSIDE ONLY', xy=(x + 2.37, y + 0.13), size=0.1, align='CENTER', color=(0.2, 0.2, 0.2), font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['hazard']
    it.append(dict(type='rect', xywh=(x, y, w, h), color=yel))
    for k in range(-2, 34):
        x0 = x + k * 0.125
        it.append(dict(type='poly', pts=[(x0, y), (x0 + 0.06, y), (x0 + 0.06 + h * 0.6, y + h), (x0 + h * 0.6, y + h)], color=blk))
    x, y, w, h = DECALS['inner']
    it += [dict(type='rect', xywh=(x, y, w, h), color=yel),
           dict(type='rect', xywh=(x + 0.03, y + 0.03, w - 0.06, h - 0.06), color=blk),
           dict(type='text', text='F 闸门', xy=(x + w / 2, y + 0.36), size=0.24, align='CENTER', color=yel),
           dict(type='text', text='GATE F  ·  LIVING QUARTERS', xy=(x + w / 2, y + 0.12), size=0.11, align='CENTER', color=yel, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['steps']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.9, 0.89, 0.84)),
           dict(type='rect', xywh=(x, y + h - 0.25, w, 0.25), color=red),
           dict(type='text', text='应急开闸', xy=(x + w / 2, y + h - 0.2), size=0.17, align='CENTER', color=wht)]
    for i, t in enumerate(('①拉下泄压杆', '②输入密码', '③顺时针转锁轮')):
        it.append(dict(type='text', text=t, xy=(x + 0.07, y + h - 0.52 - i * 0.3), size=0.19, align='LEFT', color=blk))
    it.append(dict(type='text', text='EMERGENCY RELEASE', xy=(x + w / 2, y + 0.06), size=0.07, align='CENTER', color=(0.3, 0.3, 0.3), font=L.FONT_STENCIL))
    x, y, w, h = DECALS['keypad']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.16, 0.17, 0.17)),
           dict(type='rect', xywh=(x + 0.1, y + 0.93, 0.7, 0.26), color=(0.04, 0.07, 0.05)),
           dict(type='text', text='- - - -', xy=(x + 0.45, y + 1.0), size=0.12, align='CENTER', color=(0.2, 0.45, 0.25), font=L.FONT_STENCIL)]
    keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
    for i, kch in enumerate(keys):
        cx = x + 0.2 + (i % 3) * 0.25
        cy = y + 0.75 - (i // 3) * 0.2
        it += [dict(type='rect', xywh=(cx - 0.09, cy - 0.075, 0.18, 0.15), r=0.02, color=(0.55, 0.56, 0.54)),
               dict(type='text', text=kch, xy=(cx, cy - 0.04), size=0.09, align='CENTER', color=blk, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['lever']
    it += [dict(type='rect', xywh=(x, y, w, h), color=yel),
           dict(type='rect', xywh=(x + 0.04, y + 0.04, w - 0.08, h - 0.08), color=(0.9, 0.88, 0.8)),
           dict(type='text', text='①', xy=(x + w / 2, y + 0.93), size=0.24, align='CENTER', color=red),
           dict(type='text', text='手动泄压杆', xy=(x + w / 2, y + 0.66), size=0.16, align='CENTER', color=blk),
           dict(type='text', text='向下拉到底', xy=(x + w / 2, y + 0.43), size=0.13, align='CENTER', color=blk),
           dict(type='text', text='PULL DOWN TO EQUALISE', xy=(x + w / 2, y + 0.2), size=0.07, align='CENTER', color=(0.25, 0.25, 0.25), font=L.FONT_STENCIL),
           dict(type='poly', pts=[(x + 1.1, y + 0.75), (x + 1.2, y + 0.75), (x + 1.2, y + 0.5), (x + 1.25, y + 0.5), (x + 1.15, y + 0.38), (x + 1.05, y + 0.5), (x + 1.1, y + 0.5)], color=red)]
    x, y, w, h = DECALS['port']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.08, 0.2, 0.42)),
           dict(type='text', text='观察窗 · 通讯中继', xy=(x + w / 2, y + 0.37), size=0.17, align='CENTER', color=wht),
           dict(type='text', text='VIEWPORT · ACOUSTIC RELAY', xy=(x + w / 2, y + 0.12), size=0.11, align='CENTER', color=(0.95, 0.75, 0.2), font=L.FONT_STENCIL)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(188, 0, 42), front='+Z',
                notes='Vertical-lift gate. Raise gate-leaf by +3.6 m in Y to open. Pod side +Z, Alex side -Z.')
    KINDS['decal']['image'] = graphic()
    frame = A.part('gate-frame')
    leaf = A.part('gate-leaf', origin=(0, Y0, 0))
    lglass = A.part('gate-port-glass', origin=(0, Y0, 0), group='glass', parent='gate-leaf')
    wheel = A.part('lock-wheel', origin=tuple(WHEEL), parent='gate-leaf')
    lstn = A.part('gate-leaf-stencils', origin=(0, Y0, 0), group='decals', parent='gate-leaf')
    stn = A.part('stencils', group='decals')
    keypad = A.part('keypad', origin=tuple(KEYPAD))
    lever = A.part('relief-lever', origin=tuple(LEVER))

    def bolts_line(part, p0, p1, n, r=0.02, axis_rot=(90, 0, 0), kind='steel'):
        p0, p1 = Vector(p0), Vector(p1)
        for k in range(n):
            part.add(L.bolt(r, r * 0.8, segs=6, wsegs=8), L.M(tuple(p0.lerp(p1, (k + 0.5) / n)), axis_rot), kind)

    OUT_ROT, IN_ROT = (90, 0, 0), (-90, 0, 0)   # bolt +Y -> +Z / -Z
    # ---------------- frame: jamb channels, lintel, sill, both faces
    for s in (-1, 1):
        xc = s * 4.25
        frame.add(L.box(0.5, 4.6, 0.9, bevel=0.025), L.M((xc, (Y0 + Y1 + 1.0) / 2 - 0.0, 0)), 'frame')
        for zf, rot in ((0.45, OUT_ROT), (-0.45, IN_ROT)):
            bolts_line(frame, (xc, Y0 + 0.2, zf), (xc, Y1 + 0.8, zf), 12, 0.022, rot)
        frame.add(L.box(0.08, 3.9, 0.3, bevel=0.01), L.M((s * 4.02, (Y0 + Y1) / 2 + 0.2, 0.2)), 'steel')
        frame.add(L.box(0.08, 3.9, 0.3, bevel=0.01), L.M((s * 4.02, (Y0 + Y1) / 2 + 0.2, -0.2)), 'steel')
    frame.add(L.box(9.0, 0.8, 0.9, bevel=0.03), L.M((0, Y1 + 0.4, 0)), 'frame')
    frame.add(L.box(9.0, 0.22, 0.9, bevel=0.02), L.M((0, Y0 + 0.09, 0)), 'frame')
    frame.add(L.box(8.0, 0.05, 0.4, bevel=0.01), L.M((0, Y0 + 0.215, 0)), 'rubber')
    for zf, rot in ((0.45, OUT_ROT), (-0.45, IN_ROT)):
        bolts_line(frame, (-4.4, Y1 + 0.4, zf), (4.4, Y1 + 0.4, zf), 28, 0.022, rot)
    # lifting gear housing above the lintel, pod side
    gh = Vector((0, Y1 + 1.2, 0.35))
    frame.add(L.box(3.2, 0.8, 0.5, bevel=0.04), L.M(tuple(gh)), 'frame')
    for s in (-1, 1):
        frame.add(L.lathe([(0, 0), (0.22, 0), (0.24, 0.04), (0.24, 0.26), (0.22, 0.3), (0, 0.3)], segs=32), L.M(tuple(gh + Vector((s * 1.9, 0, 0))), (0, 0, -90 * s)), 'frame')
        frame.add(L.cyl(0.18, 0.12, segs=28, bevel=0.01), L.M(tuple(gh + Vector((s * 2.95, 0, 0.05))), (0, 0, 90)), 'steel')
        for k in range(18):
            frame.add(L.torus(0.035, 0.009, segu=10, segv=5), L.M((s * 3.45, gh.y - 0.15 - k * 0.075, 0.42), (0, 90 * (k % 2), 0)), 'steel')
    frame.add(L.box(0.6, 0.45, 0.35, bevel=0.02), L.M(tuple(gh + Vector((0, 0.55, 0.0)))), 'frame')
    for k in range(9):
        frame.add(L.box(0.5, 0.012, 0.04, bevel=0.002), L.M(tuple(gh + Vector((0, 0.38 + k * 0.035, 0.18)))), 'steel')
    # amber beacon on the lintel face
    bc = Vector((-1.95, Y1 + 0.45, 0.48))
    frame.add(L.box(0.22, 0.22, 0.08, bevel=0.01), L.M(tuple(bc)), 'frame')
    frame.add(L.lathe([(0, 0), (0.09, 0), (0.09, 0.05), (0.085, 0.14), (0.05, 0.2), (0, 0.21)], segs=24), L.M(tuple(bc + Vector((0, 0, 0.04))), (90, 0, 0)), 'amber')
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        frame.add(L.sweep([tuple(bc + Vector((0.095 * math.cos(a), 0.095 * math.sin(a), 0.05))), tuple(bc + Vector((0.1 * math.cos(a), 0.1 * math.sin(a), 0.24)))], 0.007, segs=6), None, 'steel')
    # landing ledge on the atrium side
    ledge_z = (ZO + 0.1, ZO + 1.7)
    depth = ledge_z[1] - ledge_z[0]
    for zz in ledge_z:
        frame.add(L.box(9.4, 0.12, 0.06, bevel=0.008), L.M((0, Y0 - 0.06, zz)), 'frame')
    for xx in (-4.7, 4.7):
        frame.add(L.box(0.06, 0.12, depth, bevel=0.008), L.M((xx, Y0 - 0.06, sum(ledge_z) / 2)), 'frame')
    for k in range(156):
        frame.add(L.box(0.006, 0.05, depth - 0.06, bevel=0.0), L.M((-4.65 + k * 0.06, Y0 - 0.025, sum(ledge_z) / 2)), 'grating')
    for k in range(15):
        frame.add(L.box(9.34, 0.012, 0.012, bevel=0.0), L.M((0, Y0 - 0.006, ledge_z[0] + 0.1 + k * 0.1)), 'grating')
    for s in (-1, 0, 1):
        m, ln = L.axis_to((s * 4.0, Y0 - 1.2, ZO + 0.02), (s * 4.0, Y0 - 0.12, ledge_z[1] - 0.1))
        frame.add(L.box(0.08, ln, 0.08, bevel=0.01), m @ L.M((0, ln / 2, 0)), 'frame')
    frame.add(L.box(9.4, 0.15, 0.06, bevel=0.01), L.M((0, Y0 - 0.02, ledge_z[1] + 0.03)), 'frame')
    stn.add(L.panel_uv(4.0, 0.7, 0.006, duv('outer')), L.M((0, Y1 + 0.4, 0.455), (0, 0, 0)), 'decal')
    stn.add(L.panel_uv(2.4, 0.75, 0.006, duv('inner')), L.M((0, Y1 + 0.42, -0.455), (0, 180, 0)), 'decal')
    # ---------------- gate leaf (origin bottom centre)
    LZ = 0.11
    plate = L.box(8.05, 3.72, 2 * LZ, bevel=0.02)
    L.transform(plate, Matrix.Translation((0, Y0 + 0.02 + 1.86, 0)))
    hole = L.cyl(0.21, 1.0, segs=40)
    L.transform(hole, L.M(tuple(PORT), (90, 0, 0)))
    leaf.add(L.boolean(plate, [hole]), None, 'leaf')
    for zf, side in ((LZ, 1), (-LZ, -1)):
        rot = OUT_ROT if side > 0 else IN_ROT
        for yy in (Y0 + 0.55, Y0 + 1.35, Y0 + 2.55, Y0 + 3.3):
            for (xa, xb) in ((-3.95, -0.45), (0.45, 3.95)) if abs(yy - PORT.y) < 0.5 else ((-3.95, 3.95),):
                leaf.add(L.box(xb - xa, 0.03, 0.12, bevel=0.006), L.M(((xa + xb) / 2, yy, zf + side * 0.06)), 'leaf')
                leaf.add(L.box(xb - xa, 0.1, 0.025, bevel=0.006), L.M(((xa + xb) / 2, yy, zf + side * 0.125)), 'leaf')
        for xx in (-2.7, -1.35, 1.35, 2.7):
            leaf.add(L.box(0.03, 3.5, 0.1, bevel=0.006), L.M((xx, Y0 + 1.9, zf + side * 0.05)), 'leaf')
        # viewing port ring
        leaf.add(L.lathe([(0.2, 0.0), (0.36, 0.0), (0.37, 0.015), (0.37, 0.045), (0.36, 0.06), (0.2, 0.06)], segs=48, close_top=False, close_bottom=False),
                 L.M(tuple(PORT + Vector((0, 0, zf))), (90 * side, 0, 0)), 'steel')
        for k in range(12):
            a = 2 * math.pi * (k + 0.5) / 12
            leaf.add(L.bolt(0.017, 0.014, segs=6, wsegs=8), L.M(tuple(PORT + Vector((0.3 * math.cos(a), 0.3 * math.sin(a), zf + side * 0.06))), rot), 'steel')
        # lifting lugs and bottom seal
        for s in (-1, 1):
            leaf.add(L.box(0.3, 0.3, 0.05, bevel=0.012), L.M((s * 3.45, Y1 - 0.1, zf + side * 0.025)), 'steel')
    leaf.add(L.box(8.0, 0.06, 0.18, bevel=0.015), L.M((0, Y0 + 0.03, 0)), 'rubber')
    lglass.add(L.cyl(0.215, 0.07, segs=40, bevel=0.004), L.M(tuple(PORT), (90, 0, 0)), 'glass')
    lstn.add(L.panel_uv(7.9, 0.4, 0.004, duv('hazard')), L.M((0, Y0 + 0.28, LZ + 0.002), (0, 0, 0)), 'decal')
    lstn.add(L.panel_uv(1.2, 0.35, 0.004, duv('port')), L.M(tuple(PORT + Vector((0, 0.6, LZ + 0.002)))), 'decal')
    # inner face: locking bars driven by the wheel
    for s in (-1, 1):
        leaf.add(L.box(2.3, 0.08, 0.05, bevel=0.012), L.M((WHEEL.x + s * 1.25 if s > 0 else WHEEL.x - 1.25 - 1.7, WHEEL.y, -LZ - 0.035)), 'steel')
    leaf.add(L.box(2.35, 0.08, 0.05, bevel=0.012), L.M((WHEEL.x + 1.27, WHEEL.y, -LZ - 0.035)), 'steel')
    leaf.add(L.box(4.25, 0.08, 0.05, bevel=0.012), L.M((WHEEL.x - 2.2, WHEEL.y, -LZ - 0.035)), 'steel')
    for xx in (-3.85, 3.85):
        leaf.add(L.box(0.28, 0.2, 0.12, bevel=0.02), L.M((xx, WHEEL.y, -LZ - 0.06)), 'steel')
    for xx in (-2.0, 0.0, 3.2):
        leaf.add(L.box(0.14, 0.16, 0.08, bevel=0.012), L.M((xx, WHEEL.y, -LZ - 0.04)), 'leaf')
    leaf.add(L.lathe([(0, 0), (0.2, 0), (0.22, 0.03), (0.22, 0.12), (0.18, 0.14), (0, 0.14)], segs=36), L.M(tuple(WHEEL + Vector((0, 0, 0.2))), (-90, 0, 0)), 'leaf')
    # ---------------- lock wheel (child of leaf; origin hub; plane XY, faces -Z)
    mw = L.M(tuple(WHEEL), (90, 0, 0))
    wheel.add(L.torus(0.32, 0.028, segu=56, segv=12), mw, 'red')
    wheel.add(L.lathe([(0, -0.05), (0.05, -0.05), (0.065, -0.03), (0.065, 0.06), (0.05, 0.08), (0, 0.08)], segs=20), L.M(tuple(WHEEL), (-90, 0, 0)), 'steel')
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        wheel.add(L.sweep([WHEEL + d * 0.05 + Vector((0, 0, -0.03)), WHEEL + d * 0.31 + Vector((0, 0, -0.01))], 0.018, segs=10), None, 'red')
    kn = WHEEL + Vector((0.32, 0, 0))
    wheel.add(L.lathe([(0, 0), (0.028, 0), (0.032, 0.05), (0.03, 0.1), (0, 0.11)], segs=14), L.M(tuple(kn), (-90, 0, 0)), 'rubber')
    # ---------------- keypad on the inner wall
    keypad.add(L.box(0.34, 0.48, 0.1, bevel=0.015), L.M(tuple(KEYPAD + Vector((0, 0, 0.0)))), 'plastic')
    keypad.add(L.box(0.3, 0.06, 0.12, bevel=0.01), L.M(tuple(KEYPAD + Vector((0, 0.27, -0.01)))), 'plastic')
    stn.add(L.panel_uv(0.27, 0.39, 0.004, duv('keypad')), L.M(tuple(KEYPAD + Vector((0, 0, -0.05))), (0, 180, 0)), 'decal')
    for i in range(12):
        cx = -(-0.083 + (i % 3) * 0.0833)
        cy = KEYPAD.y - 0.195 + 0.39 * (0.75 - (i // 3) * 0.2) / 1.3
        keypad.add(L.box(0.05, 0.04, 0.012, bevel=0.004), L.M((KEYPAD.x + cx, cy, KEYPAD.z - 0.058)), 'rubber')
    keypad.add(L.sweep([tuple(KEYPAD + Vector((0, -0.24, 0))), tuple(KEYPAD + Vector((0, -0.6, 0.02))), (KEYPAD.x, Y0 + 0.4, ZI - 0.04)], 0.012, segs=8, bend=0.1), None, 'rubber')
    stn.add(L.panel_uv(0.6, 0.58, 0.004, duv('steps')), L.M((KEYPAD.x, KEYPAD.y + 0.66, ZI - 0.006), (0, 180, 0)), 'decal')
    # ---------------- relief lever housing and lever (pivot origin)
    frame.add(L.box(0.42, 0.7, 0.18, bevel=0.02), L.M((LEVER.x, LEVER.y - 0.15, ZI - 0.09)), 'frame')
    frame.add(L.cyl(0.07, 0.42, segs=20), L.M(tuple(LEVER), (0, 0, 90)), 'steel')
    frame.add(L.sweep([(LEVER.x, LEVER.y - 0.5, ZI - 0.1), (LEVER.x, Y0 + 0.3, ZI - 0.1), (LEVER.x + 0.6, Y0 + 0.3, ZI - 0.1)], 0.035, segs=12, bend=0.12), None, 'steel')
    stn.add(L.panel_uv(0.42, 0.42, 0.004, duv('lever')), L.M((LEVER.x - 0.55, LEVER.y + 0.3, ZI - 0.006), (0, 180, 0)), 'decal')
    m_l, ll = L.axis_to(LEVER + Vector((0, 0, -0.06)), LEVER + Vector((0, 0.62, -0.2)))
    lever.add(L.box(0.06, ll, 0.04, bevel=0.012), m_l @ L.M((0, ll / 2, 0)), 'red')
    lever.add(L.lathe([(0, 0), (0.035, 0), (0.04, 0.06), (0.035, 0.16), (0, 0.17)], segs=16), m_l @ L.M((0, ll - 0.02, 0)), 'rubber')
    lever.add(L.cyl(0.05, 0.12, segs=16), L.M(tuple(LEVER + Vector((0, 0, -0.06))), (0, 0, 90)), 'red')

    A.anchor('viewport-outer', (PORT.x, PORT.y, ZO + 0.3))
    A.anchor('lock-wheel', tuple(WHEEL))
    A.anchor('keypad', tuple(KEYPAD))
    A.anchor('relief-lever', tuple(LEVER))
    A.anchor('alex-inner-mark', (0.0, -2.1, -2.5))
    wall = [((0, 4.5, 0), (20, 7.0, 0.6)), ((-7.0, -1.2, 0), (6.0, 3.6, 0.6)), ((7.0, -1.2, 0), (6.0, 3.6, 0.6)),
            ((0, -6.0, 0), (20, 6.0, 0.6)), ((0, -3.25, -5.0), (20, 0.5, 10.0)), ((0, -9.25, 10.0), (20, 0.5, 20.0))]
    rep = A.finish(preview_cfg=dict(view=(0.35, 0.18, 1.0), fov=40, focus=(0, -0.8, 0.3), radius=6.2, backdrop=wall,
                                    dark_lights=[(L.b((0.0, 0.4, 0.8)), 120, (1.0, 0.5, 0.15)), (L.b((0.0, -1.0, -3.0)), 60, (0.5, 0.75, 1.0))],
                                    extra_views={'-inner': dict(view=(0.3, 0.1, -1.0), focus=(2.5, -1.4, -0.3), radius=3.6),
                                                 '-lever': dict(view=(0.5, 0.15, -1.0), focus=(-4.4, -1.2, -0.3), radius=1.8)}),
                   extra=dict(leafTravel=3.6, leafAxis='+Y', wheelAxis='local Z (Three rotation.z)', leverAxis='local X (pull down = negative rotation.x)'))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
