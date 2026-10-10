"""Level two atrium A: 20 m tileable dining-gallery balcony module for the 3-storey atrium.

Local frame: origin = deck top (y=0) at the wall face, module centre. The module spans
x -10..10 along the wall, +Z points from the wall into the atrium (deck edge at z=3.2,
matching ATRIUM_BALCONY_DEPTH). Reference instance: north wall, storey y=0, centred
x=155 -> placement (155, 0, 42.3). Pendants hang below the deck soffit, so a stacked
module above lights the tables of the module below.

    blender -b -P tools/blender/build-living-atrium-balcony.py
"""
import sys, math, random, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
import bmesh
from mathutils import Vector, Matrix

NAME = 'atrium-balcony'
HALF = 10.0
D = 3.2
SOFFIT = -0.46
RAIL_Y = 1.1
BREACH = 4.85
FONT_HAND = 'C:/Windows/Fonts/STXINGKA.TTF'
rng = random.Random(23)

WOOD_UNDER = ((0.36, 0.25, 0.15), 0.6, 0.0)
KINDS = {
    'slab': dict(scan='rust_coarse', tint=(0.36, 0.35, 0.33), tint_mix=0.85, contrast=0.5, rough=0.85, rust=0.1, bio=0.5, silt=0.8, grime=0.9, seed=201),
    'soffit': dict(scan='shutter', tint=(0.60, 0.58, 0.53), tint_mix=0.9, contrast=0.4, rough=0.7, grime=1.0, bio=0.6, silt=0.3, dirt=0.8, seed=202),
    'veneer': dict(scan='wood', tint=(0.30, 0.17, 0.08), tint_mix=0.4, contrast=0.8, rough=0.35, wear=0.3, under=WOOD_UNDER, grime=0.8, bio=0.45, silt=0.4, dirt=0.6, seed=203),
    'brass': dict(scan='green_rust', tint=(0.55, 0.40, 0.16), tint_mix=0.75, contrast=0.6, rough=0.35, metal=0.95, wear=0.4, bio=0.3, silt=0.4, grime=0.8, seed=204),
    'chrome': dict(scan='rust_coarse', tint=(0.62, 0.62, 0.60), tint_mix=0.9, rough=0.22, rough_var=0.2, metal=1.0, rust=0.35, bio=0.3, silt=0.4, seed=205),
    'iron': dict(scan='rust_coarse', tint=(0.12, 0.12, 0.12), tint_mix=0.7, rough=0.55, metal=0.7, rust=0.6, bio=0.3, silt=0.5, seed=206),
    'carpet': dict(scan='carpet', tint=(0.32, 0.07, 0.08), tint_mix=0.75, contrast=0.9, rough=0.95, rough_var=0.05, grime=1.0, silt=0.9, bio=0.5, dirt=0.7, bump=0.6, ao_dist=0.05, seed=207),
    'silt': dict(scan='rust_coarse', tint=(0.33, 0.31, 0.27), tint_mix=0.95, contrast=0.3, rough=0.95, silt=1.0, bio=0.3, grime=0.4, seed=208),
    'tablewood': dict(scan='wood', tint=(0.22, 0.12, 0.06), tint_mix=0.35, rough=0.4, wear=0.5, under=WOOD_UNDER, grime=0.8, bio=0.4, silt=0.6, seed=209),
    'chairwood': dict(scan='wood', tint=(0.16, 0.09, 0.05), tint_mix=0.4, rough=0.45, wear=0.5, under=WOOD_UNDER, grime=0.8, bio=0.4, silt=0.6, seed=210),
    'upholstery': dict(scan='leather', tint=(0.10, 0.22, 0.20), tint_mix=0.85, rough=0.6, wear=0.4, under=((0.5, 0.45, 0.35), 0.9, 0.0), bio=0.6, silt=0.6, grime=1.0, seed=211),
    'planter': dict(scan='tile', tint=(0.85, 0.82, 0.74), tint_mix=0.9, contrast=0.4, rough=0.25, grime=1.1, bio=0.7, silt=0.6, dirt=0.8, seed=212),
    'soil': dict(scan='rust_coarse', tint=(0.10, 0.08, 0.06), tint_mix=0.9, rough=0.95, silt=0.6, bio=0.4, seed=213),
    'stem': dict(scan='leather', tint=(0.20, 0.18, 0.08), tint_mix=0.9, rough=0.6, bio=0.4, silt=0.3, seed=214),
    'leaf': dict(scan='leather', tint=(0.10, 0.16, 0.05), tint_mix=0.9, contrast=0.5, rough=0.45, bio=0.5, silt=0.5, grime=0.6, bump=0.2, seed=215),
    'leafdead': dict(scan='leather', tint=(0.26, 0.18, 0.07), tint_mix=0.9, contrast=0.6, rough=0.6, bio=0.4, silt=0.7, grime=0.8, bump=0.2, seed=216),
    'cloth': dict(scan='linen', tint=(0.78, 0.75, 0.68), tint_mix=0.9, rough=0.9, grime=1.2, silt=0.8, bio=0.6, dirt=0.9, seed=217),
    'bulb': dict(scan='shutter', tint=(0.85, 0.84, 0.78), tint_mix=1.0, contrast=0.1, rough=0.15, grime=0.6, silt=0.3, seed=218),
    'porcelain': dict(scan='tile', tint=(0.9, 0.9, 0.86), tint_mix=0.95, contrast=0.2, rough=0.2, grime=0.6, silt=0.6, seed=219),
    'decal': dict(scan='shutter', image=None, rough=0.5, rough_var=0.15, grime=0.5, silt=0.45, bio=0.35, rust=0.0, dirt=0.5, bump=0.15, image_mix=0.82, seed=220),
}
GROUPS = {
    'deck': dict(res=2048),
    'carpet': dict(res=2048),
    'rail': dict(res=1024),
    'furniture': dict(res=2048),
    'foliage': dict(res=1024, double_sided=True),
    'cloth': dict(res=1024, double_sided=True),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
DECALS = {
    'plaque': (0.0, 3.2, 4.0, 0.8),     # fascia plaque 1.6 x 0.32
    'rail': (0.0, 2.6, 2.0, 0.6),       # railing plate 0.4 x 0.12
    'menu': (2.0, 0.0, 2.0, 3.0),       # menu board 0.5 x 0.75
    't12': (0.0, 1.6, 0.8, 0.8),        # table cards 0.1 x 0.1
    't14': (0.8, 1.6, 0.8, 0.8),
}


def duv(k):
    x, y, w, h = DECALS[k]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def graphic():
    it = []
    ink, wht, chalk = (0.12, 0.08, 0.04), (0.93, 0.92, 0.88), (0.86, 0.86, 0.80)
    x, y, w, h = DECALS['plaque']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.36, 0.26, 0.10)),
           dict(type='rect', xywh=(x + 0.05, y + 0.05, w - 0.1, h - 0.1), color=(0.66, 0.51, 0.24)),
           dict(type='text', text='二层 · 观景餐廊', xy=(x + w / 2, y + 0.36), size=0.32, align='CENTER', color=ink),
           dict(type='text', text='LEVEL 2  ·  PANORAMA DINING', xy=(x + w / 2, y + 0.12), size=0.15, align='CENTER', color=ink, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['rail']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.7, 0.1, 0.08)),
           dict(type='rect', xywh=(x + 0.04, y + 0.04, w - 0.08, h - 0.08), color=wht),
           dict(type='text', text='请勿倚靠栏杆', xy=(x + w / 2, y + 0.27), size=0.22, align='CENTER', color=(0.7, 0.1, 0.08)),
           dict(type='text', text='DO NOT LEAN ON RAILING', xy=(x + w / 2, y + 0.1), size=0.1, align='CENTER', color=(0.15, 0.15, 0.15), font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['menu']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.30, 0.18, 0.08)),
           dict(type='rect', xywh=(x + 0.1, y + 0.1, w - 0.2, h - 0.2), color=(0.07, 0.09, 0.08)),
           dict(type='text', text='今日供应', xy=(x + w / 2, y + 2.4), size=0.36, align='CENTER', color=chalk, font=FONT_HAND),
           dict(type='line', pts=[(x + 0.35, y + 2.3), (x + 1.65, y + 2.28)], w=0.02, color=chalk),
           dict(type='text', text='海藻浓汤', xy=(x + 0.3, y + 1.85), size=0.24, align='LEFT', color=chalk, font=FONT_HAND),
           dict(type='text', text='清蒸石斑', xy=(x + 0.3, y + 1.5), size=0.24, align='LEFT', color=chalk, font=FONT_HAND),
           dict(type='text', text='员工套餐', xy=(x + 0.3, y + 1.15), size=0.24, align='LEFT', color=chalk, font=FONT_HAND),
           dict(type='text', text='免费', xy=(x + 1.7, y + 1.15), size=0.24, align='RIGHT', color=(0.9, 0.75, 0.3), font=FONT_HAND),
           dict(type='text', text='周五晚 乐队演奏', xy=(x + w / 2, y + 0.55), size=0.2, align='CENTER', color=(0.75, 0.85, 0.9), font=FONT_HAND),
           dict(type='circle', xyr=(x + 0.4, y + 0.3, 0.06), color=chalk),
           dict(type='circle', xyr=(x + 1.6, y + 0.3, 0.06), color=chalk)]
    for k, num in (('t12', '12'), ('t14', '14')):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=wht),
               dict(type='rect', xywh=(x + 0.03, y + 0.03, w - 0.06, h - 0.06), color=(0.66, 0.51, 0.24)),
               dict(type='rect', xywh=(x + 0.06, y + 0.06, w - 0.12, h - 0.12), color=wht),
               dict(type='text', text=num, xy=(x + w / 2, y + 0.3), size=0.34, align='CENTER', color=ink, font=L.FONT_STENCIL),
               dict(type='text', text='餐桌', xy=(x + w / 2, y + 0.13), size=0.11, align='CENTER', color=ink)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


# ------------------------------------------------------------------ props

def leaf(length, width, droop, fold=0.18, curl=0.0):
    """Broadleaf blade along +Z from the petiole at the origin, upper face +Y."""
    def fn(u, v, co):
        hw = max(0.003, width / 2 * math.sin(math.pi * min(1.0, v ** 0.75)) ** 0.9)
        x = (0.5 - u) * 2 * hw
        y = -abs(x) * fold - droop * v * v * length + curl * abs(x) * v + 0.012 * math.sin(u * 9 + v * 7) * v
        return Vector((x, y, v * length))
    return L.grid(1, 1, 6, 9, fn=fn)


def plant(fol, PM, height, n, seed, dead_ratio=0.35):
    r = random.Random(seed)
    base = Vector((0, 0.62, 0))
    for k in range(n):
        az = math.radians(k * 137.5 + r.uniform(-15, 15))
        h = 0.15 + height * (0.35 + 0.65 * r.random())
        spread = 0.08 + 0.25 * r.random()
        tip = base + Vector((spread * math.sin(az), h, spread * math.cos(az)))
        mid = base.lerp(tip, 0.5) + Vector((0.04 * math.sin(az), 0.0, 0.04 * math.cos(az)))
        path = [PM @ (base + Vector((0.02 * math.sin(az), 0, 0.02 * math.cos(az)))), PM @ mid, PM @ tip]
        fol.add(L.sweep([tuple(p) for p in path], 0.011, segs=6, radii=[0.013, 0.011, 0.008], smooth_path=True), None, 'stem')
        dead = r.random() < dead_ratio
        ln = r.uniform(0.3, 0.48)
        elev = r.uniform(-60, -30) if dead else r.uniform(5, 35)
        m = PM @ L.M(tuple(tip), (-elev, math.degrees(az), r.uniform(-10, 10)))
        fol.add(leaf(ln, ln * 0.55, 0.5 if dead else 0.15, curl=0.25 if dead else 0.0), m, 'leafdead' if dead else 'leaf')


def planter(fur, fol, PM, height, n, seed, soil=True):
    fur.add(L.lathe([(0, 0), (0.24, 0), (0.25, 0.02), (0.31, 0.58), (0.33, 0.6), (0.33, 0.63), (0.3, 0.63), (0.29, 0.6), (0, 0.6)], segs=4, smooth=False), PM @ L.M((0, 0, 0), (0, 45, 0)), 'planter')
    if soil:
        fur.add(L.box(0.38, 0.03, 0.38, bevel=0.01), PM @ L.M((0, 0.6, 0)), 'soil')
    plant(fol, PM, height, n, seed)


def chair(fur, M):
    fur.add(L.box(0.42, 0.04, 0.42, bevel=0.008), M @ L.M((0, 0.45, 0)), 'chairwood')
    fur.add(L.box(0.40, 0.05, 0.40, bevel=0.02, segs=3), M @ L.M((0, 0.495, 0.005)), 'upholstery')
    for sx in (-1, 1):
        for sz in (-1, 1):
            fur.add(L.cyl(0.018, 0.45, segs=10, r2=0.014), M @ L.M((sx * 0.18, 0.225, sz * 0.18)), 'chairwood')
        fur.add(L.box(0.03, 0.48, 0.03, bevel=0.006), M @ L.M((sx * 0.18, 0.7, -0.2), (-8, 0, 0)), 'chairwood')
    fur.add(L.box(0.40, 0.08, 0.03, bevel=0.008), M @ L.M((0, 0.9, -0.23), (-8, 0, 0)), 'chairwood')
    fur.add(L.box(0.33, 0.26, 0.035, bevel=0.012, segs=3), M @ L.M((0, 0.7, -0.2), (-8, 0, 0)), 'upholstery')
    fur.add(L.box(0.36, 0.025, 0.02, bevel=0.004), M @ L.M((0, 0.14, 0.0), (0, 90, 0)), 'chairwood')


def table(fur, M):
    fur.add(L.cyl(0.45, 0.035, segs=40, bevel=0.008), M @ L.M((0, 0.725, 0)), 'tablewood')
    fur.add(L.cyl(0.12, 0.03, segs=20), M @ L.M((0, 0.695, 0)), 'iron')
    fur.add(L.cyl(0.035, 0.66, segs=12), M @ L.M((0, 0.36, 0)), 'iron')
    fur.add(L.lathe([(0, 0), (0.26, 0), (0.27, 0.015), (0.2, 0.04), (0.06, 0.07), (0, 0.07)], segs=28), M, 'iron')


def tipped(pos, yaw):
    """Pedestal table lying on its top edge and base edge."""
    v = (0.45 - 0.27, 0.74)
    th = math.atan2(-v[1], v[0])
    lift = -0.27 * math.sin(th)
    return L.M(pos, (0, yaw, 0)) @ L.M((0, lift, 0), (0, 0, math.degrees(th)))


def plate(fur, M):
    fur.add(L.lathe([(0, 0), (0.09, 0), (0.115, 0.012), (0.125, 0.02), (0.12, 0.022), (0.1, 0.01), (0, 0.008)], segs=28), M, 'porcelain')


def wine_glass(fur, M):
    fur.add(L.lathe([(0, 0), (0.035, 0), (0.035, 0.004), (0.005, 0.012), (0.004, 0.09), (0.03, 0.11), (0.038, 0.17), (0.035, 0.17), (0.027, 0.115), (0, 0.1)], segs=18), M, 'bulb')


def tablecloth(cl, c, offset=(0.08, -0.05)):
    def fn(u, v, co):
        px, pz = (0.5 - u) * 1.35 + offset[0], (v - 0.5) * 1.35 + offset[1]
        r = math.hypot(px, pz)
        a = math.atan2(pz, px)
        if r <= 0.46:
            return Vector((c.x + px, 0.765, c.z + pz))
        d = r - 0.46
        rr = 0.465 + d * 0.1 + 0.03 * math.sin(a * 9 + L.noise3((px, 0, pz), 3.0)) * min(1.0, d * 5)
        y = 0.765 - d * 0.93 - 0.01
        return Vector((c.x + rr * math.cos(a), y, c.z + rr * math.sin(a)))
    cl.add(L.grid(1, 1, 30, 30, fn=fn), None, 'cloth')


def menu_board(fur, stn, M):
    for s in (-1, 1):
        R = M @ L.M((0, 0, s * 0.18), (s * -12, 0, 0))
        fur.add(L.box(0.58, 0.04, 0.03, bevel=0.006), R @ L.M((0, 0.86, 0)), 'tablewood')
        for sx in (-1, 1):
            fur.add(L.box(0.04, 0.9, 0.03, bevel=0.006), R @ L.M((sx * 0.29, 0.43, 0)), 'tablewood')
        fur.add(L.box(0.54, 0.79, 0.012, bevel=0.002), R @ L.M((0, 0.45, 0)), 'tablewood')
        if s > 0:
            stn.add(L.panel_uv(0.5, 0.75, 0.003, duv('menu')), R @ L.M((0, 0.45, 0.009)), 'decal')
    fur.add(L.cyl(0.006, 0.36, segs=6), M @ L.M((0, 0.35, 0), (90, 0, 0)), 'iron')


def pendant(fur, top, length, tilt, broken=False):
    fur.add(L.cyl(0.075, 0.03, segs=20), L.M(tuple(top + Vector((0, -0.015, 0)))), 'brass')
    a = math.radians(tilt)
    bot = top + Vector((math.sin(a) * length, -math.cos(a) * length, 0))
    if broken:
        kink = top + Vector((0.03, -length * 0.6, 0.02))
        fur.add(L.sweep([tuple(top), tuple(kink), tuple(bot)], 0.005, segs=6, smooth_path=True), None, 'iron')
    else:
        fur.add(L.sweep([tuple(top), tuple(bot)], 0.005, segs=6), None, 'iron')
    S = L.M(tuple(bot), (0, 0, tilt + (62 if broken else 0)))
    fur.add(L.lathe([(0, 0), (0.035, 0), (0.035, -0.05), (0.06, -0.06), (0.14, -0.13), (0.2, -0.24), (0.21, -0.26), (0.2, -0.262),
                     (0.19, -0.245), (0.13, -0.14), (0.055, -0.072), (0.03, -0.065), (0, -0.065)], segs=32), S, 'brass')
    fur.add(L.cyl(0.02, 0.06, segs=10), S @ L.M((0, -0.09, 0)), 'iron')
    if broken:
        for k in range(3):
            fur.add(L.box(0.03, 0.002, 0.02, bevel=0.0), L.M((bot.x + rng.uniform(-0.3, 0.3), 0.004, bot.z + rng.uniform(-0.2, 0.2)), (0, rng.uniform(0, 180), 0)), 'bulb')
    else:
        fur.add(L.lathe([(0, 0), (0.03, -0.01), (0.055, -0.06), (0.05, -0.1), (0.025, -0.125), (0, -0.13)], segs=16), S @ L.M((0, -0.11, 0)), 'bulb')
    return bot


# ------------------------------------------------------------------ build

def breach(x):
    return math.exp(-((x - BREACH) / 1.1) ** 2)


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(155.0, 0.0, 42.3), front='+Z',
                notes='Tileable 20 m dining-gallery balcony module (deck top y=0, wall face z=0, rail edge z=3.2). Rail is bent and breached around x=+4.85.')
    KINDS['decal']['image'] = graphic()
    deck = A.part('balcony-deck', group='deck')
    carpet = A.part('carpet', group='carpet')
    rail = A.part('railing', group='rail')
    fur = A.part('furniture', group='furniture')
    lights = A.part('pendant-lights', group='furniture')
    fol = A.part('plants', group='foliage')
    cl = A.part('tablecloth', group='cloth')
    stn = A.part('stencils', group='decals')

    # structure: slab, plenum, ceiling tiles on T-bar, fascia
    deck.add(L.box(2 * HALF, 0.25, D - 0.06, bevel=0.01), L.M((0, -0.125, (D - 0.06) / 2)), 'slab')
    deck.add(L.cyl(0.15, 2 * HALF, segs=16), L.M((0, -0.31, 0.9), (0, 0, 90)), 'iron')
    deck.add(L.box(2 * HALF, 0.06, 0.3, bevel=0.005), L.M((0, -0.29, 2.1)), 'iron')
    for k in range(9):
        deck.add(L.box(0.03, 0.18, 0.03, bevel=0.0), L.M((-9 + k * 2.25, -0.34, 2.1)), 'iron')
    nx, nz = 33, 5
    tx0, tz0 = -HALF + 0.1, 0.05
    missing = {(7, 2), (8, 2), (21, 4), (29, 1)}
    hanging = {(8, 3): 62, (22, 4): 48}
    for i in range(nx):
        for j in range(nz):
            cx, cz = tx0 + 0.3 + i * 0.6, tz0 + 0.3 + j * 0.6
            if (i, j) in missing:
                continue
            if (i, j) in hanging:
                deck.add(L.box(0.58, 0.018, 0.58, bevel=0.0), L.M((cx, SOFFIT, cz - 0.3), (hanging[(i, j)], 0, 0)) @ L.M((0, 0, 0.29)), 'soffit')
            else:
                deck.add(L.box(0.58, 0.018, 0.58, bevel=0.0), L.M((cx, SOFFIT + rng.uniform(-0.004, 0.0), cz), (rng.uniform(-0.6, 0.6), 0, rng.uniform(-0.6, 0.6))), 'soffit')
    for i in range(nx + 1):
        deck.add(L.box(0.024, 0.03, nz * 0.6, bevel=0.0), L.M((tx0 + i * 0.6, SOFFIT + 0.005, tz0 + nz * 0.3)), 'iron')
    for j in range(nz + 1):
        deck.add(L.box(2 * HALF - 0.2, 0.03, 0.024, bevel=0.0), L.M((0, SOFFIT + 0.005, tz0 + j * 0.6)), 'iron')
    deck.add(L.box(2 * HALF, 0.75, 0.12, bevel=0.012), L.M((0, -0.325, D)), 'veneer')
    for y in (0.035, -0.69):
        deck.add(L.box(2 * HALF, 0.03, 0.14, bevel=0.006), L.M((0, y, D)), 'brass')
    for k in range(17):
        x = -HALF + 0.75 + k * 1.25
        if abs(x - 2.6) > 0.7 and abs(x + 4.0) > 0.9:
            deck.add(L.box(0.012, 0.7, 0.006, bevel=0.0), L.M((x, -0.33, D + 0.061)), 'iron')

    def peel(u, v, co):
        t = 1 - v
        return Vector((co.x, co.y, co.z + 0.2 * t * t + 0.01 * math.sin(u * 11)))
    deck.add(L.thicken(L.grid(1.2, 0.62, 12, 8, fn=peel), 0.006), L.M((2.6, -0.33, D + 0.064)), 'veneer')
    deck.add(L.box(1.2, 0.62, 0.01, bevel=0.0), L.M((2.6, -0.33, D + 0.058)), 'slab')
    # silt drift along the wall and against the fascia upstand
    def drift(u, v, co, depth=0.7, h=0.045):
        z = (1 - v) * depth
        yy = h * (1 - (1 - v)) ** 1.5 * (0.6 + 0.4 * L.noise3((co.x * 0.8, 0, z * 2), 1.0, 4)) + 0.002
        return Vector((-co.x, yy, z))
    deck.add(L.grid(2 * HALF, 1, 80, 6, fn=lambda u, v, co: drift(u, 1 - v, co)), None, 'silt')

    # carpet remnants: torn sheet with lifted edges and a flap draped over the breach
    def cfn(u, v, co):
        return Vector(((u - 0.5) * 2 * HALF, 0.006, 0.08 + (1 - v) * (D - 0.25)))
    cbm = L.grid(1, 1, 120, 18, fn=cfn)
    kill = [f for f in cbm.faces if (lambda c: L.noise3((c.x, 0, c.z), 0.32, 3) + 0.35 * L.noise3((c.x, 0, c.z), 1.4, 5)
                                     + 0.9 * max(0.0, (c.z - 2.4) / 0.6) + 0.8 * breach(c.x) > 0.28)(f.calc_center_median())]
    bmesh.ops.delete(cbm, geom=kill, context='FACES')
    loose = [v for v in cbm.verts if not v.link_faces]
    bmesh.ops.delete(cbm, geom=loose, context='VERTS')
    for v in cbm.verts:
        if v.is_boundary:
            v.co.y += rng.uniform(0.004, 0.03)
    carpet.add(L.thicken(cbm, 0.012), None, 'carpet')

    def flap(u, v, co):
        x = BREACH + 0.6 - u * 1.5
        s = v * 1.4
        if s < 0.5:
            p = Vector((x, 0.018, D - 0.5 + s))
        else:
            a = min(1.0, (s - 0.5) / 0.25) * math.pi / 2
            p = Vector((x, 0.018 - (s - 0.5) * math.sin(a) * 0.9, D + 0.12 + 0.05 * math.cos(a) + 0.02 * math.sin(u * 13)))
        return p
    carpet.add(L.thicken(L.grid(1, 1, 14, 14, fn=flap), 0.01), None, 'carpet')

    # railing: brass top rail, chrome mid rails and posts, bent outward at the breach
    def rp(x, y):
        b_ = breach(x)
        return Vector((x, y - 0.32 * b_ * (y / RAIL_Y), D + 0.5 * b_ * (y / RAIL_Y) ** 1.3))
    xs = [-HALF + 0.25 * k for k in range(81)]
    rail.add(L.sweep([tuple(rp(x, RAIL_Y)) for x in xs], 0.045, segs=14, smooth_path=True), None, 'brass')
    for h in (0.35, 0.7):
        for seg in ([x for x in xs if x <= BREACH - 0.65], [x for x in xs if x >= BREACH + 0.55]):
            pts = [rp(x, h) for x in seg]
            end = pts[-1] if seg[0] < BREACH else pts[0]
            droop = Vector((0.0, -0.12, 0.22)) if seg[0] < BREACH else Vector((0.0, -0.2, 0.15))
            if seg[0] < BREACH:
                pts.append(end + droop)
            else:
                pts.insert(0, end + droop)
            rail.add(L.sweep([tuple(p) for p in pts], 0.014, segs=8, smooth_path=True), None, 'chrome')
    for k in range(14):
        x = -9.5 + k * 1.5
        rail.add(L.cyl(0.05, 0.012, segs=16), L.M((x, 0.056, D)), 'chrome')
        if abs(x - 5.5) < 0.01:
            rail.add(L.cyl(0.026, 0.14, segs=8), L.M((x, 0.12, D), (12, 0, 4)), 'chrome')
            continue
        a, c = rp(x, 0.05), rp(x, RAIL_Y)
        m, ln = L.axis_to(tuple(a), tuple(c))
        rail.add(L.cyl(0.026, ln, segs=10), m @ L.M((0, ln / 2, 0)), 'chrome')
        rail.add(L.sweep([tuple(c + Vector((0, -0.08, 0))), tuple(c + Vector((0, -0.03, 0)))], 0.03, segs=10), None, 'brass')
    stn.add(L.panel_uv(0.4, 0.12, 0.003, duv('rail')), L.M((-6.2, 0.55, D + 0.025)), 'decal')
    stn.add(L.panel_uv(1.6, 0.32, 0.004, duv('plaque')), L.M((-4.0, -0.33, D + 0.064)), 'decal')

    # dining: four pedestal tables, chairs, cloth, tableware
    T = [Vector((-7.0, 0, 1.95)), Vector((-2.8, 0, 1.95)), Vector((1.6, 0, 1.9)), Vector((6.9, 0, 1.8))]
    table(fur, L.M(tuple(T[0])))
    table(fur, L.M(tuple(T[1])))
    table(fur, tipped(tuple(T[2]), 30))
    table(fur, L.M(tuple(T[3])))
    tablecloth(cl, T[1])
    for k, (t, ang) in enumerate([(0, 90), (0, 270), (0, 190), (1, 60), (1, 300), (3, 120), (3, 230)]):
        a = math.radians(ang + rng.uniform(-8, 8))
        d = 0.6 + rng.uniform(0, 0.15)
        p = T[t] + Vector((d * math.sin(a), 0, d * math.cos(a)))
        yaw = math.degrees(math.atan2(-math.sin(a), -math.cos(a))) + rng.uniform(-12, 12)
        chair(fur, L.M(tuple(p), (0, yaw, 0)))
    chair(fur, L.M((-2.0, 0.05, 1.05), (0, 160, 0)) @ L.M((0, 0, 0), (-80, 0, 0)))
    chair(fur, L.M((2.6, 0, 1.3), (0, 70, 0)) @ L.M((0, 0.21, 0), (0, 0, 88)))
    chair(fur, L.M((BREACH + 0.2, 0, 2.75), (0, -30, 0)) @ L.M((0, 0.21, 0), (0, 0, -88)))
    plate(fur, L.M(tuple(T[0] + Vector((0.12, 0.745, -0.1)))))
    plate(fur, L.M(tuple(T[0] + Vector((-0.2, 0.745, 0.15)))))
    wine_glass(fur, L.M(tuple(T[0] + Vector((0.1, 0.745, 0.22)))))
    wine_glass(fur, L.M(tuple(T[0] + Vector((-0.25, 0.79, -0.15))), (0, 30, 90)))
    plate(fur, L.M(tuple(T[1] + Vector((0.05, 0.78, 0.0)))))
    plate(fur, L.M(tuple(T[3] + Vector((-0.15, 0.745, 0.1)))))
    for k in range(5):
        shard = L.prism([(0, 0), (0.06 + rng.uniform(0, 0.04), 0.0), (0.03, 0.05 + rng.uniform(0, 0.03))], 0.006)
        fur.add(shard, L.M(tuple(T[2] + Vector((rng.uniform(-0.7, 0.7), 0.004, rng.uniform(-0.5, 0.6)))), (90, rng.uniform(0, 360), 0)), 'porcelain')
    wine_glass(fur, L.M(tuple(T[2] + Vector((0.6, 0.035, 0.4))), (0, 40, 90)))
    for t, key in ((0, 't12'), (3, 't14')):
        c = T[t] + Vector((-0.05, 0.745, -0.2))
        for s in (-1, 1):
            R = L.M(tuple(c), (s * 18, 20, 0)) @ L.M((0, 0.045, s * 0.0145))
            stn.add(L.panel_uv(0.1, 0.1, 0.0015, duv(key)), R @ L.M((0, 0, 0), (0, 0 if s > 0 else 180, 0)), 'decal')
    menu_board(fur, stn, L.M((-5.0, 0, 1.15), (0, 25, 0)))

    # planters with broadleaf plants (one knocked over toward the breach)
    planter(fur, fol, L.M((-9.3, 0, 0.55)), 1.0, 9, 31)
    planter(fur, fol, L.M((-0.6, 0, 2.7)), 0.9, 8, 32)
    planter(fur, fol, L.M((9.2, 0, 0.55)), 1.1, 10, 33)
    planter(fur, fol, L.M((3.7, 0.33, 2.55), (0, -35, 0)) @ L.M((0, 0, 0), (0, 0, -90)) @ L.M((0, -0.33, 0)), 0.8, 7, 34, soil=False)
    spill = L.grid(1, 1, 10, 10, fn=lambda u, v, co: Vector(((0.5 - u) * 0.9, 0.035 * math.sin(u * math.pi) * math.sin(v * math.pi) + 0.004, (v - 0.5) * 0.7)))
    fur.add(spill, L.M((4.35, 0, 2.95), (0, -35, 0)), 'soil')
    for k in range(9):
        x = rng.uniform(-9.5, 9.5)
        fol.add(leaf(rng.uniform(0.25, 0.4), 0.18, -0.04, curl=0.3), L.M((x, 0.035, rng.uniform(0.3, 3.0)), (0, rng.uniform(0, 360), 0)), 'leafdead')

    # pendant lights below the soffit (they light the tables of the module underneath)
    bots = []
    for x, ln, tilt, broken in ((-8.0, 1.3, 0, False), (-4.0, 1.6, 4, False), (0.0, 1.0, 0, False), (4.0, 1.45, 14, False), (8.0, 1.15, 0, True)):
        bots.append(pendant(lights, Vector((x, SOFFIT - 0.01, 2.45)), ln, tilt, broken))

    A.anchor('module-start', (-HALF, 0, 0))
    A.anchor('module-end', (HALF, 0, 0))
    A.anchor('rail-breach', tuple(rp(BREACH, RAIL_Y)))
    A.anchor('menu-board', (-5.0, 0.9, 1.15))
    A.anchor('table-12', tuple(T[0] + Vector((0, 0.74, 0))))
    A.anchor('table-14', tuple(T[3] + Vector((0, 0.74, 0))))
    for i, p in enumerate(bots):
        A.anchor(f'pendant-{i}', tuple(p))
    A.anchor('pod-view', (0.0, -1.5, 9.0))
    extra = dict(
        module=dict(length=2 * HALF, depth=D, deckTopY=0.0, soffitY=SOFFIT, tileAxis='+X',
                    note='Ends at x=+-10 are cut flat; rail and carpet continue across instances. Door cut-outs must be handled by the engine (not authored).'),
        colliders=[dict(name='deck', min=[-HALF, -0.7, 0.0], max=[HALF, 0.05, D + 0.07]),
                   dict(name='rail-west', min=[-HALF, 0.0, D - 0.06], max=[BREACH - 1.6, RAIL_Y + 0.05, D + 0.06]),
                   dict(name='rail-east', min=[BREACH + 1.6, 0.0, D - 0.06], max=[HALF, RAIL_Y + 0.05, D + 0.06])],
        suggestedInstances=[dict(wall='N', storeyY=y, position=[x, y, 42.3], rotationYDeg=0) for y in (0, 6) for x in (145.0, 165.0)]
                           + [dict(wall='S', storeyY=6, position=[x, 6, 81.7], rotationYDeg=180) for x in (145.0, 165.0)],
    )
    back = [((0, 3.0, -0.25), (26.0, 14.0, 0.5)), ((0, -9.25, 6.0), (40.0, 0.5, 30.0))]
    rep = A.finish(preview_cfg=dict(view=(0.35, 0.32, 1.0), fov=44, focus=(0, 0.2, 1.6), radius=8.5, backdrop=back,
                                    dark_lights=[(L.b((9.0, 5.0, 8.0)), 700, (0.75, 0.9, 1.0)), (L.b((-6.0, 1.4, 1.8)), 40, (1.0, 0.6, 0.25))],
                                    extra_views={'-dining': dict(view=(0.3, 0.45, 1.0), focus=(-4.8, 0.5, 1.7), radius=2.8),
                                                 '-breach': dict(view=(0.55, 0.25, 1.0), focus=(BREACH, 0.4, 2.9), radius=2.2),
                                                 '-under': dict(view=(0.2, -0.35, 1.0), focus=(-2.0, -1.0, 2.2), radius=3.5)}),
                   extra=extra)
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
