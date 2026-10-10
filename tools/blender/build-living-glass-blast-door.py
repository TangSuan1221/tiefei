"""Level two observation gallery (G): 12 x 5 m pressure-glass blast door on wall x=142.

Local frame = world translated by (142, 0, 0). Opening z 0..12, y -3..2; the
pod side is -X (wall face x=-0.3), Alex's lobby side is +X. Leaf hinged on the
z=0 jamb with three hydraulic hinges and two rams. 'glass' holds the three
laminated panes. 'pipe-intake' is the 0.8 m transfer tube at z=17, y=0 with its
launch cradle; its origin is the pod-side mouth ('pipe-mouth').

Note for integration: the transfer tube is open through the wall (x -0.62..0.5);
the game wall needs a 0.8 m hole there or the tube will look capped.

    blender -b -P tools/blender/build-living-glass-blast-door.py
"""
import sys, math, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'glass-blast-door'
XF = -0.30          # pod-side wall face
XB = 0.30           # lobby-side wall face
Y0, Y1 = -3.0, 2.0  # opening
Z0, Z1 = 0.0, 12.0
MULL = (4.0, 8.0)
PIPE = Vector((-0.62, 0.0, 17.0))

KINDS = {
    'frame': dict(scan='rusty_painted_metal', tint=(0.20, 0.24, 0.24), tint_mix=0.85, rough=0.55, wear=0.6, chips=0.35, rust=0.6, bio=0.4, silt=0.55, bio_lo=-3, bio_hi=0.5, seed=21),
    'leaf': dict(scan='rusty_painted_metal', tint=(0.26, 0.29, 0.27), tint_mix=0.85, rough=0.5, wear=0.65, chips=0.3, rust=0.5, bio=0.35, silt=0.5, bio_lo=-3, bio_hi=0.0, seed=22),
    'steel': dict(scan='rust_coarse', tint=(0.32, 0.30, 0.28), tint_mix=0.55, rough=0.45, metal=0.85, rust=0.6, bio=0.25, silt=0.5, grime=0.8, seed=23),
    'chrome': dict(scan='shutter', tint=(0.62, 0.62, 0.6), tint_mix=0.8, rough=0.2, rough_var=0.08, metal=1.0, rust=0.2, bio=0.15, silt=0.2, grime=0.5, seed=24),
    'hydraulic': dict(scan='shutter', tint=(0.70, 0.42, 0.04), tint_mix=0.92, contrast=0.6, rough=0.45, wear=0.75, chips=0.25, rust=0.08, bio=0.3, silt=0.5, dirt=0.45, seed=25),
    'rubber': dict(scan='rubber', tint=(0.025, 0.025, 0.025), tint_mix=0.9, rough=0.75, bio=0.25, silt=0.3, grime=0.3, seed=26),
    'hose': dict(scan='rubber', tint=(0.035, 0.035, 0.032), tint_mix=0.9, rough=0.55, bio=0.35, silt=0.5, grime=0.4, dirt=0.4, seed=27),
    'amber': dict(scan='shutter', tint=(0.8, 0.45, 0.08), tint_mix=0.9, rough=0.2, grime=0.6, silt=0.3, bio=0.2, seed=28),
    'glass': dict(scan='shutter', tint=(0.90, 0.95, 0.94), tint_mix=1.0, contrast=0.15, rough=0.035, rough_var=0.015, grime=0.08, dirt=0.12, silt=0.08, silt_up=0.6, bio=0.45, bio_lo=-3.0, bio_hi=-1.6, bump=0.03, ao_dist=0.05, seed=29),
    'dark': dict(scan='rust_coarse', tint=(0.03, 0.035, 0.035), tint_mix=0.9, rough=0.5, bio=0.6, silt=0.3, grime=0.9, seed=30),
    'decal': dict(scan='shutter', image=None, rough=0.55, rough_var=0.15, grime=0.4, silt=0.4, bio=0.2, rust=0.25, bump=0.15, image_mix=0.8, seed=31),
}
GROUPS = {
    'main': dict(res=2048),
    'intake': dict(res=1024),
    'glass': dict(res=1024, maps=('color', 'orm'), transmission=1.0, ior=1.5, thickness=0.12, attenuation=(0.72, 0.86, 0.82), density=0.6, double_sided=False),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}

# decal atlas: canvas 4 x 4 m rendered at 2048 px
DECALS = {
    'header': (0.0, 3.55, 4.0, 0.45),      # BLAST GLASS plate 6.0 x 0.675
    'hazard': (0.0, 3.25, 4.0, 0.25),      # bottom rail stripes
    'jamb': (0.0, 2.35, 0.5, 0.85),        # vertical hinge warning 0.5 x 0.85
    'rating': (0.6, 2.35, 1.4, 0.85),      # rating plate 0.7 x 0.425
    'pipe': (2.1, 2.35, 1.9, 0.85),        # transfer pipe plate 1.14 x 0.51
    'lobby': (0.0, 1.6, 4.0, 0.6),         # lobby-side header
    'launch': (0.0, 0.6, 0.9, 0.9),        # launch panel face
}


def decal_uv(key):
    x, y, w, h = DECALS[key]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def decal_graphic():
    it = []
    yel, blk, wht, red = (0.86, 0.66, 0.08), (0.05, 0.05, 0.05), (0.92, 0.92, 0.88), (0.7, 0.08, 0.06)
    x, y, w, h = DECALS['header']
    it += [dict(type='rect', xywh=(x, y, w, h), color=yel),
           dict(type='rect', xywh=(x + 0.04, y + 0.04, w - 0.08, h - 0.08), color=blk),
           dict(type='rect', xywh=(x + 0.07, y + 0.07, w - 0.14, h - 0.14), color=yel),
           dict(type='text', text='防爆观察窗', xy=(x + 1.08, y + 0.135), size=0.25, align='CENTER', color=blk),
           dict(type='text', text='BLAST GLASS', xy=(x + 2.95, y + 0.14), size=0.235, align='CENTER', color=blk, font=L.FONT_STENCIL)]
    for k in range(6):
        cx = x + 0.12 + k * 0.006
    x, y, w, h = DECALS['hazard']
    it.append(dict(type='rect', xywh=(x, y, w, h), color=yel))
    for k in range(-2, 34):
        x0 = x + k * 0.125
        it.append(dict(type='poly', pts=[(x0, y), (x0 + 0.06, y), (x0 + 0.06 + h * 0.6, y + h), (x0 + h * 0.6, y + h)], color=blk))
    x, y, w, h = DECALS['jamb']
    it += [dict(type='rect', xywh=(x, y, w, h), color=yel),
           dict(type='poly', pts=[(x + 0.25, y + 0.78), (x + 0.07, y + 0.47), (x + 0.43, y + 0.47)], color=blk),
           dict(type='poly', pts=[(x + 0.25, y + 0.72), (x + 0.115, y + 0.495), (x + 0.385, y + 0.495)], color=yel),
           dict(type='text', text='!', xy=(x + 0.25, y + 0.51), size=0.17, align='CENTER', color=blk),
           dict(type='text', text='液压铰链', xy=(x + 0.25, y + 0.3), size=0.085, align='CENTER', color=blk),
           dict(type='text', text='严禁靠近', xy=(x + 0.25, y + 0.19), size=0.085, align='CENTER', color=blk),
           dict(type='text', text='HYDRAULIC HINGE', xy=(x + 0.25, y + 0.07), size=0.04, align='CENTER', color=blk, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['rating']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.68, 0.66, 0.6)),
           dict(type='rect', xywh=(x + 0.03, y + 0.03, w - 0.06, h - 0.06), color=(0.76, 0.74, 0.68)),
           dict(type='text', text='G-L-01  防爆观察门', xy=(x + 0.7, y + 0.66), size=0.1, align='CENTER', color=blk),
           dict(type='text', text='设计压差  2.5 MPa', xy=(x + 0.7, y + 0.48), size=0.085, align='CENTER', color=blk),
           dict(type='text', text='LAMINATED PANE 120 mm  x3', xy=(x + 0.7, y + 0.33), size=0.06, align='CENTER', color=blk, font=L.FONT_STENCIL),
           dict(type='text', text='检验周期 6 个月  ·  深蓝疗养', xy=(x + 0.7, y + 0.15), size=0.06, align='CENTER', color=(0.2, 0.2, 0.2))]
    x, y, w, h = DECALS['pipe']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.08, 0.2, 0.42)),
           dict(type='rect', xywh=(x + 0.03, y + 0.03, w - 0.06, h - 0.06), color=(0.1, 0.25, 0.5)),
           dict(type='text', text='传递管道', xy=(x + w / 2, y + 0.52), size=0.2, align='CENTER', color=wht),
           dict(type='text', text='TRANSFER PIPE  →  生活区前厅', xy=(x + w / 2, y + 0.3), size=0.085, align='CENTER', color=wht),
           dict(type='text', text='探头装填口  PROBE LOAD  Ø800', xy=(x + w / 2, y + 0.11), size=0.075, align='CENTER', color=(0.95, 0.75, 0.2))]
    x, y, w, h = DECALS['lobby']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.85, 0.83, 0.76)),
           dict(type='text', text='观察廊  OBSERVATION GALLERY', xy=(x + 2.0, y + 0.33), size=0.17, align='CENTER', color=(0.12, 0.2, 0.25)),
           dict(type='text', text='请勿倚靠玻璃  ·  DO NOT LEAN ON GLASS', xy=(x + 2.0, y + 0.1), size=0.1, align='CENTER', color=(0.3, 0.3, 0.3))]
    x, y, w, h = DECALS['launch']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.2, 0.22, 0.22)),
           dict(type='text', text='发射 LAUNCH', xy=(x + 0.45, y + 0.78), size=0.075, align='CENTER', color=yel),
           dict(type='ring', xyrt=(x + 0.3, y + 0.42, 0.15, 0.03), color=red),
           dict(type='text', text='装填', xy=(x + 0.7, y + 0.55), size=0.06, align='CENTER', color=wht),
           dict(type='text', text='闭锁', xy=(x + 0.7, y + 0.35), size=0.06, align='CENTER', color=wht),
           dict(type='text', text='PNEU 0.8 MPa', xy=(x + 0.45, y + 0.08), size=0.05, align='CENTER', color=(0.7, 0.7, 0.7), font=L.FONT_STENCIL)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(142, 0, 0), front='-X',
                notes='Fixed (closed) blast door; pod side -X. glass = three laminated panes (transmission). pipe-intake origin = pipe-mouth.')
    KINDS['decal']['image'] = decal_graphic()
    main = A.part('blast-door')
    glass = A.part('glass', group='glass')
    dec = A.part('stencils', group='decals')
    pipe = A.part('pipe-intake', origin=tuple(PIPE), group='intake')

    def bolts_line(part, p0, p1, n, r=0.02, facing='-X', kind='steel'):
        p0, p1 = Vector(p0), Vector(p1)
        rot = (0, 0, 90) if facing == '-X' else (0, 0, -90)
        for k in range(n):
            p = p0.lerp(p1, (k + 0.5) / n)
            part.add(L.bolt(r, r * 0.8, segs=6, wsegs=8), L.M(tuple(p), rot), kind)

    # ---------------- fixed jamb frame (sits in the wall, proud of both faces by 0.16)
    FX = 0.46
    main.add(L.box(2 * FX, 0.75, 13.4, bevel=0.03), L.M((0, Y1 + 0.375, 6.0)), 'frame')
    main.add(L.box(2 * FX, 0.28, 13.4, bevel=0.02), L.M((0, Y0 + 0.12, 6.0)), 'frame')
    for zc in (-0.35, 12.35):
        main.add(L.box(2 * FX, 5.75, 0.7, bevel=0.03), L.M((0, (Y0 + Y1 + 0.75) / 2, zc)), 'frame')
    # stepped stop rebate inside the opening (leaf closes against it)
    for zc in (0.06, 11.94):
        main.add(L.box(0.18, 5.0, 0.12, bevel=0.01), L.M((0.2, (Y0 + Y1) / 2, zc)), 'frame')
    main.add(L.box(0.18, 0.12, 12.0, bevel=0.01), L.M((0.2, Y1 - 0.06, 6.0)), 'frame')
    # doubler ribs and bolt rows on the pod face of the jamb
    for side in (-1, 1):
        x = side * (FX + 0.02)
        rot = (0, 0, 90) if side < 0 else (0, 0, -90)
        main.add(L.box(0.04, 0.12, 13.2, bevel=0.01), L.M((x, Y1 + 0.62, 6.0)), 'frame')
        main.add(L.box(0.04, 0.12, 13.2, bevel=0.01), L.M((x, Y1 + 0.13, 6.0)), 'frame')
        for zc in (-0.35, 12.35):
            main.add(L.box(0.04, 5.6, 0.12, bevel=0.01), L.M((x, -0.15, zc + 0.22 * (1 if zc < 0 else -1))), 'frame')
        bolts_line(main, (x - side * 0.02, Y1 + 0.375, -0.6), (x - side * 0.02, Y1 + 0.375, 12.6), 34, 0.024, '-X' if side < 0 else '+X')
        for zc in (-0.55, 12.55):
            bolts_line(main, (x - side * 0.02, Y0 + 0.4, zc), (x - side * 0.02, Y1 + 0.6, zc), 14, 0.024, '-X' if side < 0 else '+X')
    # threshold hazard plate
    main.add(L.box(1.2, 0.03, 12.0, bevel=0.006), L.M((-0.05, Y0 + 0.255, 6.0)), 'steel')
    # ---------------- door leaf
    LX0, LX1 = -0.27, 0.13
    LT = LX1 - LX0
    lxc = (LX0 + LX1) / 2
    yb, yt = Y0 + 0.27, Y1 - 0.02
    main.add(L.box(LT, 0.5, 11.86, bevel=0.025), L.M((lxc, yt - 0.25, 6.0)), 'leaf')
    main.add(L.box(LT, 0.62, 11.86, bevel=0.025), L.M((lxc, yb + 0.31, 6.0)), 'leaf')
    stiles = [(0.07, 0.47), (11.53, 11.93)] + [(m - 0.17, m + 0.17) for m in MULL]
    for (a, c) in stiles:
        main.add(L.box(LT, yt - yb - 1.0, c - a, bevel=0.02), L.M((lxc, (yb + 0.62 + yt - 0.5) / 2, (a + c) / 2)), 'leaf')
    panes = []
    edges = [0.47] + [v for m in MULL for v in (m - 0.17, m + 0.17)] + [11.53]
    for k in range(3):
        za, zb = edges[2 * k], edges[2 * k + 1]
        panes.append((za, zb, yb + 0.62, yt - 0.5))
    for (za, zb, ya, yb2) in panes:
        zc, yc = (za + zb) / 2, (ya + yb2) / 2
        w, h = zb - za, yb2 - ya
        # laminated pane (three plies read in the edge), set 40 mm into the frame
        glass.add(L.box(0.12, h + 0.08, w + 0.08, bevel=0.004, segs=1), L.M((-0.05, yc, zc)), 'glass')
        # gasket and bolted clamp bars on both faces
        for side, xs in ((-1, LX0), (1, LX1)):
            for (p, s) in (((xs + side * 0.012, ya + 0.02, zc), (0.025, 0.04, w)), ((xs + side * 0.012, yb2 - 0.02, zc), (0.025, 0.04, w)),
                           ((xs + side * 0.012, yc, za + 0.02), (0.025, h, 0.04)), ((xs + side * 0.012, yc, zb - 0.02), (0.025, h, 0.04))):
                main.add(L.box(*s, bevel=0.006), L.M(p), 'rubber')
            bar = 0.11
            xb_ = xs + side * 0.045
            for (p, s) in (((xb_, ya - 0.015, zc), (0.05, bar, w + 0.2)), ((xb_, yb2 + 0.015, zc), (0.05, bar, w + 0.2)),
                           ((xb_, yc, za - 0.015), (0.05, h, bar)), ((xb_, yc, zb + 0.015), (0.05, h, bar))):
                main.add(L.box(*s, bevel=0.012), L.M(p), 'leaf')
            face = '-X' if side < 0 else '+X'
            xbolt = xb_ + side * 0.025
            nb_w = int(w / 0.28)
            nb_h = int(h / 0.28)
            bolts_line(main, (xbolt, ya - 0.015, za), (xbolt, ya - 0.015, zb), nb_w, 0.018, face)
            bolts_line(main, (xbolt, yb2 + 0.015, za), (xbolt, yb2 + 0.015, zb), nb_w, 0.018, face)
            bolts_line(main, (xbolt, ya, za - 0.015), (xbolt, yb2, za - 0.015), nb_h, 0.018, face)
            bolts_line(main, (xbolt, ya, zb + 0.015), (xbolt, yb2, zb + 0.015), nb_h, 0.018, face)
    # stiffener ribs on the bottom rail, pod face
    for k in range(12):
        zc = 0.5 + k * 1.0
        main.add(L.box(0.06, 0.5, 0.05, bevel=0.01), L.M((LX0 - 0.03, yb + 0.3, zc)), 'leaf')
    # hazard stripes on the bottom rail (painted plate)
    dec.add(L.panel_uv(11.2, 0.36, 0.004, decal_uv('hazard')), L.M((LX0 - 0.002, yb + 0.12 + 0.18, 6.0), (0, -90, 0)), 'decal')
    # ---------------- locking dogs on the free edge (z=12)
    for y in (-2.1, -0.9, 0.3, 1.45):
        main.add(L.box(0.16, 0.22, 0.32, bevel=0.03), L.M((LX0 - 0.08, y, 11.7)), 'steel')
        main.add(L.box(0.2, 0.26, 0.24, bevel=0.03), L.M((-FX - 0.08, y, 12.12)), 'steel')
        main.add(L.cyl(0.06, 0.2, segs=16, bevel=0.01), L.M((LX0 - 0.17, y, 11.7), (0, 0, 90)), 'steel')
        m_arm, ln = L.axis_to((LX0 - 0.28, y, 11.7), (LX0 - 0.28, y - 0.42, 11.55))
        main.add(L.cyl(0.022, ln, segs=10), m_arm @ L.M((0, ln / 2, 0)), 'hydraulic')
        main.add(L.lathe([(0, 0), (0.035, 0), (0.04, 0.05), (0.0, 0.07)], segs=12), m_arm @ L.M((0, ln, 0)), 'rubber')
    # ---------------- hydraulic hinges (pod side, z=0 jamb)
    HX, HZ = -0.62, -0.12
    for y in (-2.15, -0.45, 1.25):
        main.add(L.lathe([(0.0, -0.36), (0.13, -0.36), (0.16, -0.33), (0.16, 0.33), (0.13, 0.36), (0.0, 0.36)], segs=28), L.M((HX, y, HZ)), 'frame')
        main.add(L.lathe([(0.0, 0.0), (0.09, 0.0), (0.09, 0.04), (0.06, 0.08), (0.0, 0.09)], segs=20), L.M((HX, y + 0.36, HZ)), 'steel')
        for dy in (-0.25, 0.25):
            main.add(L.box(0.1, 0.12, 1.2, bevel=0.015), L.M((-0.36, y + dy, 0.48)), 'frame')
            main.add(L.box(0.26, 0.12, 0.12, bevel=0.015), L.M((HX + 0.11, y + dy, HZ + 0.12)), 'frame')
            for k in range(4):
                main.add(L.bolt(0.022, 0.018, segs=6, wsegs=8), L.M((-0.41, y + dy, 0.2 + k * 0.25), (0, 0, 90)), 'steel')
        for dy in (-0.12, 0.12):
            main.add(L.box(0.12, 0.1, 0.62, bevel=0.015), L.M((-FX - 0.06, y + dy, -0.42)), 'frame')
        main.add(L.cyl(0.04, 0.34, segs=12), L.M((HX - 0.13, y, HZ - 0.08), (0, 0, 0)), 'chrome')
        dec_ok = y == -0.45
    dec.add(L.panel_uv(0.5, 0.85, 0.005, decal_uv('jamb')), L.M((XF - 0.006, 1.55, -1.25), (0, -90, 0)), 'decal')
    for yy in (-0.38, 0.38):
        main.add(L.bolt(0.01, 0.008, segs=6, wsegs=8), L.M((XF - 0.012, 1.55 + yy, -1.25), (0, 0, 90)), 'steel')
    # two rams: wall clevis at z=-2.4 -> leaf clevis at z=1.4
    for y in (0.35, -1.35):
        wall_c = Vector((XF - 0.12, y, -2.45))
        leaf_c = Vector((LX0 - 0.2, y, 1.35))
        main.add(L.box(0.06, 0.5, 0.42, bevel=0.012), L.M((XF - 0.03, y, -2.45)), 'frame')
        for dy in (-0.09, 0.09):
            main.add(L.box(0.14, 0.03, 0.16, bevel=0.008), L.M((XF - 0.1, y + dy, -2.45)), 'frame')
        for k in range(4):
            main.add(L.bolt(0.02, 0.016, segs=6, wsegs=8), L.M((XF - 0.06, y + (-0.18 if k < 2 else 0.18), -2.45 + (-0.14 if k % 2 else 0.14)), (0, 0, 90)), 'steel')
        d = leaf_c - wall_c
        m_ram, ln = L.axis_to(wall_c, leaf_c)
        body_l = ln * 0.58
        main.add(L.lathe([(0.0, 0.0), (0.06, 0.0), (0.11, 0.06), (0.11, body_l - 0.08), (0.13, body_l - 0.06), (0.13, body_l), (0.06, body_l + 0.03), (0.0, body_l + 0.03)], segs=24), m_ram, 'hydraulic')
        main.add(L.cyl(0.048, ln - body_l, segs=18), m_ram @ L.M((0, body_l + (ln - body_l) / 2, 0)), 'chrome')
        main.add(L.cyl(0.05, 0.14, segs=16), L.M(tuple(wall_c)), 'steel')
        main.add(L.cyl(0.05, 0.14, segs=16), L.M(tuple(leaf_c)), 'steel')
        main.add(L.box(0.2, 0.2, 0.18, bevel=0.015), L.M(tuple(leaf_c + Vector((0.09, 0, 0)))), 'frame')
        # hoses from ram ports to the wall manifold
        port_a = wall_c + d.normalized() * 0.2 + Vector((-0.11, 0, 0))
        port_b = wall_c + d.normalized() * (body_l - 0.12) + Vector((-0.11, 0, 0))
        for i, (pp, sag) in enumerate(((port_a, 0.25), (port_b, 0.42))):
            end = Vector((XF - 0.16, -0.75 + (0.2 if y > 0 else -0.2) + i * 0.08, -1.32))
            pts = [pp, pp + Vector((-0.08, -0.06, 0)), Vector((XF - 0.3, y - sag, -1.75)), end + Vector((-0.12, 0, 0)), end]
            main.add(L.sweep(pts, 0.024, segs=12, bend=0.14, caps=True), None, 'hose')
            for q in (pp + Vector((-0.02, -0.01, 0)), end + Vector((-0.03, 0, 0))):
                main.add(L.cyl(0.032, 0.07, segs=6), L.M(tuple(q), (0, 0, 90)), 'steel')
    # hydraulic valve manifold block on the wall
    hm = Vector((XF - 0.09, -0.75, -1.32))
    main.add(L.box(0.18, 0.7, 0.3, bevel=0.02), L.M(tuple(hm)), 'frame')
    for k in range(3):
        main.add(L.box(0.1, 0.12, 0.12, bevel=0.015), L.M(tuple(hm + Vector((-0.13, -0.2 + k * 0.2, 0.04)))), 'hydraulic')
        main.add(L.cyl(0.028, 0.12, segs=12), L.M(tuple(hm + Vector((-0.2, -0.2 + k * 0.2, 0.04))), (0, 0, 90)), 'steel')
    for k in range(4):
        main.add(L.bolt(0.016, 0.012, segs=6, wsegs=8), L.M(tuple(hm + Vector((-0.09, -0.3 if k < 2 else 0.3, -0.11 if k % 2 else 0.11))), (0, 0, 90)), 'steel')
    main.add(L.lathe([(0, 0), (0.06, 0), (0.06, 0.05), (0.05, 0.08), (0, 0.08)], segs=24), L.M(tuple(hm + Vector((-0.09, 0.0, -0.1))), (0, 0, 90)), 'steel')
    main.add(L.sweep([tuple(hm + Vector((0, -0.35, 0))), (XF - 0.09, Y0 + 0.35, -1.32), (XF - 0.09, Y0 + 0.35, -3.6)], 0.03, segs=10, bend=0.12), None, 'hose')
    # ---------------- signage plates
    hdr = Vector((-FX - 0.04, Y1 + 0.375, 6.0))
    dec.add(L.panel_uv(6.0, 0.675, 0.006, decal_uv('header')), L.M(tuple(hdr), (0, -90, 0)), 'decal')
    for zz in (3.05, 8.95):
        for yy in (-0.28, 0.28):
            main.add(L.bolt(0.016, 0.012, segs=6, wsegs=8), L.M((hdr.x - 0.006, hdr.y + yy, zz), (0, 0, 90)), 'steel')
    dec.add(L.panel_uv(0.7, 0.425, 0.005, decal_uv('rating')), L.M((LX0 - 0.002, yt - 0.25, 10.6), (0, -90, 0)), 'decal')
    dec.add(L.panel_uv(6.0, 0.9, 0.005, decal_uv('lobby')), L.M((FX + 0.04, Y1 + 0.375, 6.0), (0, 90, 0)), 'decal')
    # ---------------- transfer pipe intake (origin = pod-side mouth)
    P = PIPE
    ax = (0, 0, -90)  # lathe/cyl +Y -> +X
    pipe.add(L.lathe([(0.42, 0.0), (0.78, 0.0), (0.8, 0.015), (0.8, 0.045), (0.78, 0.06), (0.42, 0.06)], segs=56, close_top=False, close_bottom=False), L.M((XF - 0.06, P.y, P.z), ax), 'frame')
    pipe.add(L.lathe([(0.40, 0.0), (0.47, 0.0), (0.47, 0.28), (0.56, 0.28), (0.57, 0.3), (0.57, 0.33), (0.40, 0.33)], segs=56, close_top=False, close_bottom=False), L.M((P.x, P.y, P.z), ax), 'frame')
    # bore: inward-facing tube through the wall, lobby-side collar
    bore = L.cyl(0.40, 1.12, segs=48, caps=False)
    import bmesh as _bm
    _bm.ops.reverse_faces(bore, faces=bore.faces)
    pipe.add(bore, L.M((P.x + 0.56, P.y, P.z), ax), 'dark')
    pipe.add(L.lathe([(0.40, 0.0), (0.5, 0.0), (0.52, 0.02), (0.52, 0.16), (0.40, 0.16)], segs=48, close_top=False, close_bottom=False), L.M((XB, P.y, P.z), ax), 'frame')
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        pipe.add(L.bolt(0.02, 0.016, segs=6, wsegs=8), L.M((P.x - 0.03 + 0.33 - 0.33, P.y + 0.515 * math.cos(a), P.z + 0.515 * math.sin(a)), (0, 0, 90)), 'steel')
        pipe.add(L.bolt(0.018, 0.014, segs=6, wsegs=8), L.M((XF - 0.06, P.y + 0.72 * math.cos(a), P.z + 0.72 * math.sin(a)), (0, 0, 90)), 'steel')
    # hatch lid swung open 105 deg about a hinge on the +Z side
    hinge = Vector((P.x - 0.05, P.y, P.z + 0.64))
    lid_m = L.M(tuple(hinge), (0, -105, 0)) @ L.M((0, 0, -0.64))
    pipe.add(L.lathe([(0.0, 0.0), (0.56, 0.0), (0.57, 0.02), (0.57, 0.07), (0.5, 0.1), (0.3, 0.13), (0.0, 0.14)], segs=48), lid_m @ L.M((0, 0, 0), (0, 0, 90)), 'frame')
    pipe.add(L.torus(0.47, 0.022, segu=48, segv=8), lid_m @ L.M((0.005, 0, 0), (0, 0, 90)), 'rubber')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        pipe.add(L.box(0.08, 0.1, 0.1, bevel=0.01), lid_m @ L.M((-0.06, 0.5 * math.cos(a), 0.5 * math.sin(a))), 'steel')
    pipe.add(L.torus(0.16, 0.016, segu=28, segv=8), lid_m @ L.M((-0.24, 0, 0), (0, 0, 90)), 'hydraulic')
    for k in range(3):
        a = 2 * math.pi * k / 3
        pipe.add(L.sweep([(0, 0, 0), (0, 0.16 * math.cos(a), 0.16 * math.sin(a))], 0.012, segs=8), lid_m @ L.M((-0.24, 0, 0)), 'hydraulic')
    pipe.add(L.cyl(0.03, 0.14, segs=12), lid_m @ L.M((-0.19, 0, 0), (0, 0, 90)), 'steel')
    for dy in (-0.22, 0.22):
        pipe.add(L.box(0.08, 0.1, 0.22, bevel=0.012), L.M((hinge.x, hinge.y + dy, hinge.z - 0.04)), 'frame')
    pipe.add(L.cyl(0.04, 0.62, segs=14), L.M(tuple(hinge)), 'steel')
    # short launch lip (the pod parks with its nose ~0.5 m off the mouth, so nothing may reach past x = P.x - 0.38)
    rail_y = P.y - 0.3
    lip = P.x - 0.34
    for dz in (-0.2, 0.2):
        pipe.add(L.sweep([(P.x + 0.02, rail_y, P.z + dz), (lip, rail_y, P.z + dz)], 0.028, segs=12), None, 'steel')
    for x in (P.x - 0.1, lip + 0.04):
        pipe.add(L.box(0.06, 0.05, 0.5, bevel=0.01), L.M((x, rail_y - 0.02, P.z)), 'frame')
        for dz in (-1, 1):
            pipe.add(L.box(0.07, 0.018, 0.17, bevel=0.006), L.M((x, rail_y + 0.075, P.z + dz * 0.1), (-dz * 38, 0, 0)), 'frame')
            pipe.add(L.box(0.075, 0.012, 0.15, bevel=0.004), L.M((x, rail_y + 0.088, P.z + dz * 0.093), (-dz * 38, 0, 0)), 'rubber')
    for dz in (-0.2, 0.2):
        pipe.add(L.sweep([(lip + 0.02, rail_y - 0.02, P.z + dz), (XF - 0.04, rail_y - 0.55, P.z + dz)], 0.026, segs=10), None, 'frame')
        pipe.add(L.box(0.04, 0.24, 0.16, bevel=0.01), L.M((XF - 0.02, rail_y - 0.55, P.z + dz)), 'frame')
    # pneumatic pusher lies flat on the wall below the tube, pushing along +Z into a bell crank at the lip
    pz0, py = P.z - 1.15, rail_y - 0.42
    px = XF - 0.1
    for zc in (pz0 + 0.03, pz0 + 0.4):
        pipe.add(L.box(0.15, 0.15, 0.06, bevel=0.01), L.M((px, py, zc)), 'frame')
    pipe.add(L.cyl(0.06, 0.34, segs=24), L.M((px, py, pz0 + 0.215), (90, 0, 0)), 'steel')
    for dy in (-0.055, 0.055):
        for dx in (-0.045, 0.045):
            pipe.add(L.cyl(0.008, 0.43, segs=6), L.M((px + dx, py + dy, pz0 + 0.215), (90, 0, 0)), 'chrome')
    pipe.add(L.cyl(0.022, 0.36, segs=12), L.M((px, py, pz0 + 0.61), (90, 0, 0)), 'chrome')
    for dz in (-0.25, 0.25):
        pipe.add(L.box(0.08, 0.2, 0.08, bevel=0.01), L.M((XF - 0.04, py, pz0 + 0.215 + dz)), 'frame')
    pipe.add(L.sweep([(px, py - 0.05, pz0), (XF - 0.08, py - 0.4, pz0 + 0.3), (XF - 0.08, 0.2, P.z + 0.75), (XF - 0.06, 0.6, P.z + 1.05)], 0.016, segs=8, bend=0.15), None, 'hose')
    # launch control box and amber beacon
    cb = Vector((XF - 0.11, 0.25, P.z + 1.05))
    pipe.add(L.box(0.2, 0.62, 0.48, bevel=0.02), L.M(tuple(cb)), 'frame')
    dec.add(L.panel_uv(0.44, 0.44, 0.004, decal_uv('launch')), L.M(tuple(cb + Vector((-0.1, 0.02, 0))), (0, -90, 0)), 'decal')
    pipe.add(L.lathe([(0, 0), (0.07, 0), (0.07, 0.03), (0.055, 0.06), (0, 0.065)], segs=20), L.M(tuple(cb + Vector((-0.105, -0.01, -0.07))), (0, 0, 90)), 'amber')
    pipe.add(L.lathe([(0, 0), (0.035, 0), (0.035, 0.04), (0, 0.045)], segs=14), L.M(tuple(cb + Vector((-0.105, 0.03, 0.14))), (0, 0, 90)), 'hydraulic')
    pipe.add(L.lathe([(0, 0), (0.035, 0), (0.035, 0.04), (0, 0.045)], segs=14), L.M(tuple(cb + Vector((-0.105, -0.08, 0.14))), (0, 0, 90)), 'rubber')
    bc = Vector((XF - 0.05, P.y + 0.95, P.z))
    pipe.add(L.box(0.1, 0.06, 0.2, bevel=0.01), L.M(tuple(bc)), 'frame')
    pipe.add(L.lathe([(0, 0), (0.08, 0), (0.08, 0.04), (0.075, 0.12), (0.04, 0.17), (0, 0.18)], segs=24), L.M(tuple(bc + Vector((0, 0.03, 0)))), 'amber')
    for k in range(4):
        a = k * math.pi / 2
        pipe.add(L.sweep([(bc.x + 0.08 * math.cos(a), bc.y + 0.05, bc.z + 0.08 * math.sin(a)), (bc.x + 0.085 * math.cos(a), bc.y + 0.19, bc.z + 0.085 * math.sin(a))], 0.006, segs=6), None, 'steel')
    dec.add(L.panel_uv(1.14, 0.51, 0.005, decal_uv('pipe')), L.M((XF - 0.006, P.y + 1.5, P.z), (0, -90, 0)), 'decal')
    for yy in (-0.2, 0.2):
        for zz in (-0.52, 0.52):
            main.add(L.bolt(0.012, 0.01, segs=6, wsegs=8), L.M((XF - 0.012, P.y + 1.5 + yy, P.z + zz), (0, 0, 90)), 'steel')

    A.anchor('pipe-mouth', tuple(P))
    A.anchor('glass-center', (-0.05, (yb + 0.62 + yt - 0.5) / 2, 6.0))
    A.anchor('alex-viewpoint', (3.5, -2.1, 6.0))
    wall = [((0, 3.5, 6.0), (0.6, 3.0, 30.0)),          # above the opening
            ((0, -0.5, -4.5), (0.6, 5.0, 9.0)),            # west of the opening
            ((0, -0.5, 14.3), (0.6, 5.0, 4.6)),            # between door and pipe
            ((0, -0.5, 19.7), (0.6, 5.0, 4.6)),            # east of the pipe
            ((0, -1.75, 17.0), (0.6, 2.5, 0.8)), ((0, 1.25, 17.0), (0.6, 2.5, 0.8)),
            ((-6.0, -3.25, 8.0), (12.0, 0.5, 30.0)),        # gallery floor
            ((6.0, -3.25, 8.0), (12.0, 0.5, 30.0)),         # lobby floor
            ((9.0, 0.0, 8.0), (0.4, 6.0, 30.0)),            # lobby back wall
            ((4.0, -2.5, 3.5), (1.2, 1.0, 0.8))]            # a lobby bench seen through the glass
    rep = A.finish(preview_cfg=dict(view=(-1.0, 0.25, 0.55), fov=40, focus=(-0.4, 0.2, 8.5), radius=10.5, backdrop=wall,
                                    dark_lights=[(L.b((3.5, 1.5, 6.0)), 400, (0.45, 0.75, 1.0)), (L.b((-1.0, 2.6, 16.0)), 60, (1.0, 0.55, 0.15))],
                                    extra_views={'-intake': dict(view=(-1.0, 0.2, 0.35), focus=(-0.9, 0.2, 17.3), radius=1.9),
                                                 '-hinge': dict(view=(-1.0, 0.1, -0.5), focus=(-0.6, -0.4, -0.6), radius=2.6)}),
                   extra=dict(opening=dict(z=[Z0, Z1], y=[Y0, Y1]), integration='Cut a 0.8 m round hole in the game wall at z=17, y=0 for the transfer tube.'))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
