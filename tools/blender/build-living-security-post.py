"""Level two R3 security post: monitoring console with dead CRTs, lockers, an
overturned chair and the drowned security diver drifting against the console,
the tethered camera probe case clipped at his hip.

Local frame = world translated by (76, 0, -61.5); the post faces +Z (the C2
doorway). Floor y=-3. 'probe-case' origin = case centre = anchor 'probe-case' =
world item (76, -1.2, -61.5). The diver is buoyant (gas trapped in the suit),
feet about 1 m off the floor; that is why the case sits 1.8 m above the floor.

    blender -b -P tools/blender/build-living-security-post.py
"""
import sys, math, random, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'security-post'
FLOOR = -3.0
CASE = Vector((0.0, -1.2, 0.0))
DESK_Y = -2.2
DZ0, DZ1 = -1.85, -0.95          # desk back / front
# Drowned float: the gas trapped in the suit holds the back up, torso pitched face-down about the pelvis,
# head and limbs hanging toward the floor; pelvis 2 m above the floor, in front of the console.
PELVIS_H = 0.95
BODY = L.M((-0.9, -0.98, -0.5), (0, -20, 0)) @ L.M((0, 0, 0), (52, 0, 0)) @ L.M((0, -PELVIS_H, 0))
rng = random.Random(23)

KINDS = {
    'console': dict(scan='rusty_painted_metal', tint=(0.24, 0.26, 0.27), tint_mix=0.9, contrast=0.4, rough=0.5, wear=0.6, chips=0.4, rust=0.5, bio=0.45, silt=0.8, dirt=0.6, grime=1.0, seed=91),
    'laminate': dict(scan='shutter', tint=(0.42, 0.40, 0.36), tint_mix=0.92, contrast=0.2, rough=0.45, wear=0.5, chips=0.3, bio=0.4, silt=0.9, dirt=0.7, grime=1.0, seed=92),
    'plastic': dict(scan='shutter', tint=(0.40, 0.38, 0.33), tint_mix=0.94, contrast=0.2, rough=0.4, grime=1.0, silt=0.8, bio=0.4, dirt=0.7, seed=93),
    'crt': dict(scan='shutter', tint=(0.02, 0.035, 0.03), tint_mix=1.0, contrast=0.1, rough=0.08, rough_var=0.04, grime=0.6, silt=0.6, bio=0.3, dirt=0.6, bump=0.04, seed=94),
    'steel': dict(scan='rust_coarse', tint=(0.34, 0.33, 0.31), tint_mix=0.75, rough=0.45, metal=0.85, rust=0.5, bio=0.3, silt=0.6, grime=0.9, seed=95),
    'rubber': dict(scan='rubber', tint=(0.045, 0.044, 0.042), tint_mix=0.9, rough=0.8, rough_var=0.08, bio=0.15, bio_lo=-3, bio_hi=0.2, silt=0.7, grime=0.8, dirt=0.6, seed=96),
    'locker': dict(scan='rusty_painted_metal', tint=(0.30, 0.36, 0.40), tint_mix=0.9, contrast=0.4, rough=0.45, wear=0.7, chips=0.5, rust=0.7, bio=0.5, silt=0.7, dirt=0.6, seed=97),
    'fabric': dict(scan='linen', tint=(0.14, 0.15, 0.16), tint_mix=0.85, rough=0.85, bio=0.5, silt=0.7, grime=1.0, dirt=0.7, seed=98),
    # Rubberised canvas drysuit: woven outer shell (linen scan), scuffed through to black rubber at
    # seams and folds; matte, silted, only thin biofilm (biofilm is glossy and read as chrome).
    'suit': dict(scan='linen', tint=(0.105, 0.105, 0.095), tint_mix=0.9, contrast=0.55, rough=0.84, rough_var=0.08, wear=0.65, under=((0.025, 0.025, 0.025), 0.72, 0.0), bio=0.18, bio_lo=-3, bio_hi=0.2, silt=0.4, grime=1.0, dirt=0.9, bump=0.7, seed=99),
    'hivis': dict(scan='linen', tint=(0.62, 0.52, 0.08), tint_mix=0.9, contrast=0.4, rough=0.82, grime=1.0, silt=0.6, bio=0.5, dirt=0.8, seed=100),
    'webbing': dict(scan='linen', tint=(0.07, 0.07, 0.07), tint_mix=0.9, rough=0.8, bio=0.4, silt=0.6, grime=0.8, seed=101),
    'skin': dict(scan='leather', tint=(0.44, 0.42, 0.38), tint_mix=0.88, contrast=0.35, rough=0.62, rough_var=0.12, bio=0.2, bio_lo=-3, bio_hi=2.5, silt=0.2, grime=0.9, dirt=0.9, bump=0.25, ao_dist=0.05, seed=102),
    'eye': dict(scan='shutter', tint=(0.55, 0.57, 0.56), tint_mix=1.0, contrast=0.1, rough=0.2, grime=0.4, bio=0.0, silt=0.0, dirt=0.4, seed=103),
    'mask': dict(scan='shutter', tint=(0.58, 0.46, 0.07), tint_mix=0.9, contrast=0.3, rough=0.62, wear=0.8, chips=0.5, bio=0.4, silt=0.5, dirt=0.6, seed=104),
    # Fittings: corroded zinc/brass, never mirror chrome.
    'chrome': dict(scan='rust_coarse', tint=(0.36, 0.34, 0.3), tint_mix=0.85, rough=0.62, rough_var=0.12, metal=0.8, rust=0.55, bio=0.15, silt=0.6, grime=1.0, dirt=0.6, seed=105),
    'tank': dict(scan='rusty_painted_metal', tint=(0.3, 0.31, 0.27), tint_mix=0.85, contrast=0.4, rough=0.4, wear=0.8, chips=0.5, rust=0.6, bio=0.5, silt=0.6, seed=106),
    'case': dict(scan='rubber', tint=(0.27, 0.13, 0.03), tint_mix=0.92, contrast=0.4, rough=0.5, wear=0.9, chips=0.4, under=((0.2, 0.15, 0.08), 0.7, 0.0), bio=0.4, silt=0.7, grime=1.0, dirt=0.7, seed=107),
    'crack': dict(scan='shutter', tint=(0.75, 0.78, 0.76), tint_mix=1.0, contrast=0.1, rough=0.3, grime=0.2, bio=0.0, silt=0.0, dirt=0.2, seed=108),
    'visor': dict(scan='shutter', tint=(0.5, 0.55, 0.52), tint_mix=1.0, contrast=0.2, rough=0.22, rough_var=0.08, grime=0.6, dirt=0.5, silt=0.6, bio=0.45, bump=0.03, ao_dist=0.03, seed=109),
    'decal': dict(scan='shutter', image=None, rough=0.5, rough_var=0.15, grime=0.6, silt=0.6, bio=0.35, rust=0.3, dirt=0.6, bump=0.15, image_mix=0.8, seed=110),
}
GROUPS = {
    'main': dict(res=2048),
    'figure': dict(res=2048, samples=8),
    'visor': dict(res=256, maps=('color', 'orm'), transmission=1.0, ior=1.5, thickness=0.006, attenuation=(0.85, 0.9, 0.88), density=0.6),
    'case': dict(res=1024),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
DECALS = {
    'sign': (0.0, 3.2, 2.8, 0.8),       # 1.4 x 0.4 console header
    'case': (0.0, 2.0, 2.0, 1.0),       # probe case lid label 0.5 x 0.25
    'case2': (2.0, 2.0, 2.0, 1.0),      # probe case side label
    'patch': (0.0, 1.0, 1.0, 1.0),      # back patch 0.25 x 0.25
    'log': (1.0, 1.0, 1.0, 1.0),        # clipboard log sheet
    'l1': (2.0, 1.0, 0.4, 0.4), 'l2': (2.4, 1.0, 0.4, 0.4), 'l3': (2.8, 1.0, 0.4, 0.4), 'l4': (3.2, 1.0, 0.4, 0.4), 'l5': (3.6, 1.0, 0.4, 0.4),
    'arm': (2.0, 1.4, 1.0, 0.4),        # shoulder flash
}


def duv(k):
    x, y, w, h = DECALS[k]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def graphic():
    it = []
    blk, wht, red, yel = (0.05, 0.05, 0.05), (0.92, 0.92, 0.88), (0.72, 0.08, 0.06), (0.86, 0.66, 0.08)
    x, y, w, h = DECALS['sign']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.08, 0.14, 0.3)),
           dict(type='text', text='安保值班室', xy=(x + w / 2, y + 0.38), size=0.3, align='CENTER', color=wht),
           dict(type='text', text='SECURITY POST · LIVING DECK', xy=(x + w / 2, y + 0.12), size=0.14, align='CENTER', color=yel, font=L.FONT_STENCIL)]
    for k, t1, t2 in (('case', '有缆摄像探头', 'TETHERED CAMERA PROBE · 120 m'), ('case2', '安保部 · 03号', 'SEC-03 · DO NOT DROP')):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=(0.9, 0.88, 0.8)),
               dict(type='rect', xywh=(x, y + h - 0.2, w, 0.2), color=blk),
               dict(type='text', text=t1, xy=(x + w / 2, y + 0.42), size=0.24, align='CENTER', color=blk),
               dict(type='text', text=t2, xy=(x + w / 2, y + 0.14), size=0.12, align='CENTER', color=(0.25, 0.25, 0.25), font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['patch']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.04, 0.04, 0.05)),
           dict(type='text', text='安保', xy=(x + 0.5, y + 0.45), size=0.36, align='CENTER', color=yel),
           dict(type='text', text='SECURITY', xy=(x + 0.5, y + 0.14), size=0.17, align='CENTER', color=yel, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['arm']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.04, 0.04, 0.05)),
           dict(type='text', text='SECURITY', xy=(x + 0.5, y + 0.13), size=0.17, align='CENTER', color=yel, font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['log']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.9, 0.89, 0.82)),
           dict(type='text', text='巡检记录', xy=(x + 0.5, y + 0.88), size=0.08, align='CENTER', color=blk)]
    for r in range(9):
        it.append(dict(type='line', pts=[(x + 0.06, y + 0.8 - r * 0.08), (x + 0.94, y + 0.8 - r * 0.08)], w=0.003, color=(0.4, 0.45, 0.6)))
    rows = ['03:10 B区正常', '03:40 疗养区管线', '      接缝有渗出物', '04:05 申请关阀', '04:20 运营部:不批', '04:31 下去看']
    for r, t in enumerate(rows):
        it.append(dict(type='text', text=t, xy=(x + 0.07, y + 0.735 - r * 0.08), size=0.05, align='LEFT', color=(0.1, 0.12, 0.35)))
    for i, k in enumerate(('l1', 'l2', 'l3', 'l4', 'l5')):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=(0.85, 0.84, 0.8)),
               dict(type='text', text='S-%02d' % (i + 1), xy=(x + w / 2, y + 0.13), size=0.13, align='CENTER', color=blk, font=L.FONT_STENCIL)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


def crt(part, c, yaw=0.0, cracked=False):
    R = L.M(tuple(c), (0, yaw, 0))
    part.add(L.box(0.44, 0.38, 0.12, bevel=0.025, segs=2), R @ L.M((0, 0, 0.0)), 'plastic')
    back = L.cyl(0.2, 0.3, segs=4, r2=0.11)
    L.transform(back, L.M((0, 0, -0.2), (-90, 0, 0)) @ L.M((0, 0, 0), (0, 45, 0)))
    part.add(back, R @ L.M((0, -0.01, 0)) @ Matrix.Diagonal((1.05, 0.85, 1, 1)), 'plastic')

    def bulge(u, v, co):
        co.z += 0.018 * (1 - ((u - 0.5) * 2) ** 2) * (1 - ((v - 0.5) * 2) ** 2)
        return co
    part.add(L.grid(0.36, 0.28, 10, 8, bulge), R @ L.M((0, 0.015, 0.055)), 'crt')
    for k in range(2):
        part.add(L.cyl(0.008, 0.01, segs=8), R @ L.M((0.17 - k * 0.03, -0.16, 0.06), (90, 0, 0)), 'rubber')
    if cracked:
        o = Vector((0.05, 0.04, 0.078))
        for k in range(7):
            a = k * 0.9 + 0.3
            pts = [o]
            p = o.copy()
            for s in range(4):
                a += rng.uniform(-0.4, 0.4)
                p = p + Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.02, 0.05)
                p.x, p.y = max(-0.17, min(0.17, p.x)), max(-0.13, min(0.13, p.y))
                p.z = 0.06 + 0.018 * (1 - (p.x / 0.18) ** 2) * (1 - (p.y / 0.14) ** 2) + 0.002
                pts.append(p.copy())
            part.add(L.sweep([tuple(q) for q in pts], 0.0012, segs=4), R, 'crack')


def keyboard(part, c, yaw=0.0):
    R = L.M(tuple(c), (0, yaw, 0))
    part.add(L.box(0.46, 0.03, 0.17, bevel=0.008), R, 'plastic')
    for r in range(4):
        for k in range(14):
            part.add(L.box(0.024, 0.012, 0.024, bevel=0.0), R @ L.M((-0.2 + k * 0.03 + r * 0.006, 0.02 + r * 0.002, -0.055 + r * 0.032)), 'plastic')


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(76, 0, -61.5), front='+Z',
                notes="Drowned security diver floats against the console; 'probe-case' hangs from his left hip D-ring.")
    KINDS['decal']['image'] = graphic()
    main = A.part('security-console')
    lock = A.part('lockers')
    body = A.part('security-diver', group='figure')
    visor = A.part('diver-visor', group='visor')
    case = A.part('probe-case', origin=tuple(CASE), group='case')
    cstn = A.part('probe-case-label', origin=tuple(CASE), group='decals', parent='probe-case')
    stn = A.part('stencils', group='decals')

    # ---------------- console island
    W = 3.2
    main.add(L.box(W, 0.05, DZ1 - DZ0 + 0.06, bevel=0.012), L.M((0, DESK_Y, (DZ0 + DZ1) / 2 + 0.03)), 'laminate')
    for s in (-1, 1):
        main.add(L.box(0.05, DESK_Y - FLOOR, DZ1 - DZ0, bevel=0.01), L.M((s * (W / 2 - 0.03), (DESK_Y + FLOOR) / 2, (DZ0 + DZ1) / 2)), 'console')
    main.add(L.box(W - 0.1, 0.55, 0.03, bevel=0.006), L.M((0, FLOOR + 0.42, DZ0 + 0.35)), 'console')
    for k, xx in enumerate((-1.1, 1.1)):
        main.add(L.box(0.5, DESK_Y - FLOOR - 0.06, DZ1 - DZ0 - 0.05, bevel=0.012), L.M((xx, (DESK_Y + FLOOR) / 2 - 0.03, (DZ0 + DZ1) / 2)), 'console')
        for d in range(3):
            dy = DESK_Y - 0.17 - d * 0.24
            open_ = (k == 1 and d == 0)
            main.add(L.box(0.46, 0.21, 0.02, bevel=0.005), L.M((xx, dy, DZ1 + 0.012 + (0.28 if open_ else 0))), 'console')
            main.add(L.box(0.14, 0.02, 0.025, bevel=0.004), L.M((xx, dy + 0.05, DZ1 + 0.035 + (0.28 if open_ else 0))), 'chrome')
            if open_:
                for s in (-1, 1):
                    main.add(L.box(0.01, 0.15, 0.3, bevel=0.0), L.M((xx + s * 0.22, dy, DZ1 - 0.12 + 0.14)), 'console')
    # monitor bridge
    for s in (-1, 1):
        main.add(L.box(0.06, 1.65, 0.06, bevel=0.008), L.M((s * (W / 2 - 0.15), DESK_Y + 0.82, DZ0 + 0.12)), 'console')
    for yy in (DESK_Y + 0.6, DESK_Y + 1.62):
        main.add(L.box(W - 0.2, 0.05, 0.42, bevel=0.01), L.M((0, yy, DZ0 + 0.3)), 'console')
    main.add(L.box(W - 0.24, 1.0, 0.02, bevel=0.0), L.M((0, DESK_Y + 1.1, DZ0 + 0.1)), 'console')
    stn.add(L.panel_uv(1.4, 0.4, 0.004, duv('sign')), L.M((0, DESK_Y + 1.88, DZ0 + 0.14)), 'decal')
    main.add(L.box(1.5, 0.46, 0.02, bevel=0.005), L.M((0, DESK_Y + 1.88, DZ0 + 0.12)), 'console')
    yaws = (14, 5, -5, -14)
    for r, yy in enumerate((DESK_Y + 0.22, DESK_Y + 0.84)):
        for k, xx in enumerate((-1.2, -0.4, 0.4, 1.2)):
            crt(main, Vector((xx, yy + 0.19, DZ0 + 0.42 - (0.04 if r else 0))), yaws[k], cracked=(r == 0 and k == 2) or (r == 1 and k == 0))
    keyboard(main, Vector((-0.5, DESK_Y + 0.04, DZ1 - 0.2)), 4)
    keyboard(main, Vector((0.65, DESK_Y + 0.04, DZ1 - 0.25)), -9)
    # phone, handset dangling by its cord, mug, binder, clipboard log
    ph = Vector((1.3, DESK_Y + 0.06, DZ1 - 0.25))
    main.add(L.box(0.2, 0.08, 0.22, bevel=0.02), L.M(tuple(ph), (0, -15, 0)), 'plastic')
    hs_end = Vector((1.45, FLOOR + 0.55, DZ1 + 0.12))
    cord = [ph + Vector((0.05, 0.03, 0.1))]
    for k in range(1, 28):
        t = k / 27
        base = cord[0].lerp(hs_end, t)
        base.y -= 0.12 * math.sin(t * math.pi)
        cord.append(base + Vector((0.012 * math.cos(k * 2.1), 0, 0.012 * math.sin(k * 2.1))))
    main.add(L.sweep([tuple(c) for c in cord], 0.004, segs=5, smooth_path=True), None, 'rubber')
    main.add(L.box(0.05, 0.2, 0.05, bevel=0.015), L.M(tuple(hs_end + Vector((0, -0.1, 0))), (0, 0, 12)), 'plastic')
    main.add(L.lathe([(0, 0), (0.04, 0), (0.042, 0.1), (0.038, 0.1), (0.036, 0.004), (0, 0.004)], segs=18), L.M((-1.35, DESK_Y + 0.025, DZ1 - 0.15)), 'plastic')
    main.add(L.torus(0.025, 0.006, segu=10, segv=5, arc=math.pi), L.M((-1.31, DESK_Y + 0.08, DZ1 - 0.15), (90, 0, -90)), 'plastic')
    main.add(L.box(0.06, 0.3, 0.24, bevel=0.01), L.M((-0.05, DESK_Y + 0.17, DZ1 - 0.48), (0, 0, 8)), 'fabric')
    main.add(L.box(0.24, 0.012, 0.32, bevel=0.002), L.M((0.1, DESK_Y + 0.03, DZ1 - 0.15), (0, 20, 0)), 'console')
    stn.add(L.panel_uv(0.21, 0.27, 0.002, duv('log')), L.M((0.1, DESK_Y + 0.0365, DZ1 - 0.15), (-90, 0, -20)), 'decal')
    # cable bundle from console to floor duct
    for k in range(5):
        main.add(L.sweep([(-1.45 + k * 0.025, DESK_Y - 0.1, DZ0 + 0.05), (-1.45 + k * 0.025, FLOOR + 0.05, DZ0 - 0.1), (-1.45 + k * 0.025, FLOOR + 0.03, DZ0 - 0.9)], 0.009, segs=6, bend=0.15), None, 'rubber')
    # overturned chair
    ch = L.M((1.9, FLOOR + 0.28, -0.1), (0, 35, 95))
    main.add(L.box(0.48, 0.07, 0.46, bevel=0.03), ch @ L.M((0, 0.45, 0)), 'fabric')
    main.add(L.box(0.44, 0.5, 0.06, bevel=0.03), ch @ L.M((0, 0.78, -0.22), (-8, 0, 0)), 'fabric')
    main.add(L.cyl(0.025, 0.36, segs=10), ch @ L.M((0, 0.25, 0)), 'chrome')
    for k in range(5):
        a = k * 2 * math.pi / 5
        main.add(L.box(0.03, 0.025, 0.3, bevel=0.006), ch @ L.M((0.14 * math.sin(a), 0.07, 0.14 * math.cos(a)), (0, math.degrees(a), 0)), 'plastic')
        main.add(L.cyl(0.025, 0.03, segs=10), ch @ L.M((0.29 * math.sin(a), 0.03, 0.29 * math.cos(a)), (0, 0, 90)), 'rubber')
    # ---------------- lockers on the north wall (local z -4.2)
    LZ = -4.2
    for i in range(5):
        lx = 0.35 + i * 0.44
        lock.add(L.box(0.42, 1.9, 0.5, bevel=0.008), L.M((lx, FLOOR + 0.1 + 0.95, LZ + 0.25)), 'locker')
        opened = i == 2
        hinge = Vector((lx - 0.2, 0, LZ + 0.5))
        D = L.M(tuple(hinge), (0, -115 if opened else 0, 0)) @ L.M(tuple(-hinge))
        lock.add(L.box(0.38, 1.82, 0.02, bevel=0.005), D @ L.M((lx, FLOOR + 1.05, LZ + 0.51)), 'locker')
        for k in range(6):
            lock.add(L.box(0.22, 0.012, 0.012, bevel=0.0), D @ L.M((lx, FLOOR + 1.75 - k * 0.03, LZ + 0.523)), 'console')
        lock.add(L.box(0.03, 0.12, 0.03, bevel=0.006), D @ L.M((lx + 0.14, FLOOR + 1.1, LZ + 0.535)), 'chrome')
        stn.add(L.panel_uv(0.1, 0.1, 0.002, duv('l%d' % (i + 1))), D @ L.M((lx, FLOOR + 1.5, LZ + 0.521)), 'decal')
        if opened:
            lock.add(L.box(0.38, 0.02, 0.45, bevel=0.0), L.M((lx, FLOOR + 1.6, LZ + 0.25)), 'locker')
            lock.add(L.lathe([(0, 0), (0.12, 0), (0.13, 0.08), (0.1, 0.17), (0, 0.2)], segs=20), L.M((lx, FLOOR + 1.61, LZ + 0.25)), 'mask')
            lock.add(L.cyl(0.1, 0.05, segs=12), L.M((lx, FLOOR + 1.3, LZ + 0.25), (0, 0, 90)), 'steel')
            lock.add(L.sweep([(lx, FLOOR + 1.3, LZ + 0.25), (lx - 0.05, FLOOR + 0.6, LZ + 0.32), (lx + 0.08, FLOOR + 0.2, LZ + 0.4)], 0.02, segs=8, bend=0.2), None, 'fabric')
    lock.add(L.box(2.3, 0.08, 0.55, bevel=0.01), L.M((1.23, FLOOR + 0.04, LZ + 0.26)), 'console')

    # ---------------- the diver
    fig = L.Figure('male', height=1.8)
    cfg = fig.cfg
    nb = fig.n_body
    # relative to the pitched torso: arms and legs hang roughly plumb, slack at elbow and knee, head dropped
    pose = {
        'pelvis': [('x', 2)], 'spine': [('x', 10)], 'chest': [('x', 6), ('z', 5)],
        'neck': [('x', 18)], 'head': [('x', 22), ('y', 14)],
        'clav.L': [('y', 6)], 'clav.R': [('y', -6)],
        'upper.L': [('y', 8), ('x', -58)], 'upper.R': [('y', -10), ('x', -66)],
        'fore.L': [('x', -24)], 'fore.R': [('x', -34), ('z', -10)],
        'hand.L': [('x', -14)], 'hand.R': [('x', -20), ('z', 12)],
        'thigh.L': [('x', -38), ('y', -5)], 'thigh.R': [('x', -24), ('y', 6)],
        'shin.L': [('x', 62)], 'shin.R': [('x', 48)],
        'foot.L': [('x', 30)], 'foot.R': [('x', 24)],
    }

    def region(i, co):
        if i >= nb:
            return 'eye'
        if co.z > cfg['neck_z'] + 0.02 and abs(co.x) < 0.13:
            if co.y < -0.075 and 1.48 < co.z < 1.645 and abs(co.x) < 0.072:
                return 'face'
            return 'hood'
        if fig.bone_weight(i, 'hand') > 0.5:
            return 'glove'
        if fig.bone_weight(i, 'foot') > 0.5 or co.z < 0.13:
            return 'boot'
        return 'suit'
    reg = [region(i, c) for i, c in enumerate(fig.rest)]
    infl = {'eye': 0.0, 'face': 0.0, 'hood': 0.012, 'glove': 0.008, 'suit': 0.02, 'boot': 0.022}
    fig.smooth_rest([r in ('suit', 'boot', 'hood') for r in reg], iterations=8, factor=0.5)
    bm = fig.pose(pose, inflate=lambda i, co: infl[reg[i]])

    def lab(vs):
        rs = [reg[v] for v in vs]
        return max(set(rs), key=rs.count)
    kinds = {'eye': 'eye', 'face': 'skin', 'hood': 'suit', 'glove': 'rubber', 'suit': 'suit', 'boot': 'rubber'}
    for k, piece in fig.split(bm, lab).items():
        body.add(piece, BODY, kinds[k])

    def att(bone, m=Matrix.Identity(4)):
        return BODY @ fig.bone_matrix(bone) @ m

    def rp(x, y, z):
        return fig.rest_three((x, y, z))
    # full-face mask: frame ring around the face oval, visor, regulator, hose
    fc = rp(0, -0.125, 1.565)
    mask_m = att('head', L.M(tuple(fc + Vector((0, 0, 0.035))), (90, 0, 0)) @ Matrix.Diagonal((0.095 * 1.065 / 0.1, 1, 0.112 * 1.065 / 0.1, 1)))
    body.add(L.torus(0.1, 0.017, segu=36, segv=8), mask_m, 'mask')

    def vfn(u, v, co):
        r2 = ((u - 0.5) * 2) ** 2 + ((v - 0.5) * 2) ** 2
        co.z += 0.03 * (1 - r2)
        return co
    vis = L.grid(0.19, 0.22, 12, 12, vfn)
    vis.faces.ensure_lookup_table()
    dead = [f for f in vis.faces if (f.calc_center_median().x / 0.1) ** 2 + (f.calc_center_median().y / 0.115) ** 2 > 1.0]
    import bmesh
    bmesh.ops.delete(vis, geom=dead, context='FACES')
    vis_m = att('head', L.M(tuple(fc + Vector((0, 0.005, 0.03)))))
    visor.add(vis, vis_m, 'visor')
    imp = Vector((0.03, 0.035, 0.0))
    for k in range(9):
        a = k * 0.7 + 0.2
        p = imp.copy()
        pts = [p.copy()]
        for s in range(5):
            a += rng.uniform(-0.35, 0.35)
            p = p + Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.012, 0.03)
            if (p.x / 0.095) ** 2 + (p.y / 0.11) ** 2 > 1:
                break
            pts.append(p.copy())
        if len(pts) < 2:
            continue
        pts = [Vector((q.x, q.y, 0.03 * (1 - (q.x / 0.095) ** 2 - (q.y / 0.11) ** 2) + 0.0025)) for q in pts]
        body.add(L.sweep([tuple(q) for q in pts], 0.0009, segs=4), vis_m, 'crack')
    for k in range(10):
        a = 2 * math.pi * k / 10
        body.add(L.bolt(0.006, 0.006, segs=6, wsegs=6), mask_m @ L.M((0.1 * math.cos(a), 0.02, 0.1 * math.sin(a))), 'chrome')
    reg_c = rp(0, -0.2, 1.47)
    body.add(L.lathe([(0, 0), (0.035, 0), (0.04, 0.03), (0.03, 0.07), (0, 0.075)], segs=18), att('head', L.M(tuple(reg_c), (70, 0, 0))), 'chrome')
    body.add(L.box(0.05, 0.03, 0.02, bevel=0.006), att('head', L.M(tuple(reg_c + Vector((0, 0.03, 0.05))))), 'rubber')
    # hood straps (spider) from the mask to the back of the head
    for s in (-1, 1):
        for zz in (1.62, 1.53):
            pts = [rp(s * 0.096, -0.075, zz), rp(s * 0.104, -0.01, zz + 0.01), rp(s * 0.08, 0.05, zz + 0.015), rp(0.0, 0.07, zz + 0.02)]
            body.add(L.sweep([tuple(p) for p in pts], 0.006, segs=5, smooth_path=True), att('head'), 'webbing')
    # harness: chest + waist belts, shoulder straps, D-rings, weight belt, bailout bottle
    for zz, rx, ry, bone in ((1.25, 0.205, 0.165, 'chest'), (0.99, 0.175, 0.15, 'spine'), (0.93, 0.185, 0.155, 'pelvis')):
        ring = L.torus(1.0, 0.015, segu=40, segv=4)
        L.transform(ring, Matrix.Diagonal((rx * 1.065, 1.0, ry * 1.065, 1.0)))
        body.add(ring, att(bone, L.M(tuple(rp(0, -0.012, zz)))), 'webbing' if zz != 0.93 else 'rubber')
    for k in range(5):
        a = math.radians(-150 + k * 30)
        p = rp(0.19 * math.sin(a), -0.15 * math.cos(a) - 0.01, 0.93)
        body.add(L.box(0.08, 0.06, 0.04, bevel=0.01), att('pelvis', L.M(tuple(p), (0, -math.degrees(a), 0))), 'steel')
    for s in (-1, 1):
        pts = [rp(s * 0.1, -0.13, 1.0), rp(s * 0.12, -0.15, 1.25), rp(s * 0.13, -0.06, 1.42), rp(s * 0.12, 0.08, 1.4), rp(s * 0.11, 0.14, 1.2), rp(s * 0.1, 0.12, 1.0)]
        body.add(L.sweep([tuple(p) for p in pts], 0.012, segs=4, smooth_path=True), att('chest'), 'webbing')
    dring_rest = rp(0.17, -0.06, 0.93)
    body.add(L.torus(0.025, 0.005, segu=14, segv=5, arc=math.radians(220)), att('pelvis', L.M(tuple(dring_rest), (0, 0, 90))), 'chrome')
    for s in (-1, 1):
        body.add(L.torus(0.022, 0.005, segu=14, segv=5, arc=math.radians(220)), att('chest', L.M(tuple(rp(s * 0.13, -0.17, 1.28)), (90, 0, 0))), 'chrome')
    bt = rp(0.09, 0.2, 1.15)
    body.add(L.lathe([(0, 0), (0.075, 0), (0.085, 0.03), (0.085, 0.4), (0.05, 0.47), (0.02, 0.48), (0, 0.48)], segs=20), att('chest', L.M(tuple(bt + Vector((0, -0.24, 0)))) @ L.M((0, 0, 0), (0, 0, -6))), 'tank')
    body.add(L.cyl(0.02, 0.06, segs=10), att('chest', L.M(tuple(bt + Vector((0, 0.27, 0))))), 'chrome')
    body.add(L.sweep([tuple(bt + Vector((0, 0.29, 0))), tuple(rp(0.12, 0.1, 1.48)), tuple(rp(0.11, -0.14, 1.47)), tuple(reg_c + Vector((0.03, 0, 0.02)))], 0.011, segs=8, smooth_path=True), att('chest'), 'rubber')
    # hi-vis bands (no name tape or back patch: the body carries no identity)
    for bone, t in (('upper.L', 0.45), ('upper.R', 0.45), ('shin.L', 0.35), ('shin.R', 0.35)):
        par, h, tl = fig.bones[bone]
        c = fig.rest_three(h.lerp(tl, t))
        d = (fig.rest_three(tl) - fig.rest_three(h)).normalized()
        q = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
        r = 0.058 if 'upper' in bone else 0.06
        ring = L.cyl(r, 0.05, segs=24, caps=False)
        body.add(ring, att(bone, Matrix.Translation(c) @ q), 'hivis')
    # chest lamp
    body.add(L.lathe([(0, 0), (0.035, 0), (0.04, 0.02), (0.04, 0.08), (0.03, 0.09), (0, 0.09)], segs=16), att('chest', L.M(tuple(rp(-0.1, -0.19, 1.3)), (90, 0, 0))), 'steel')
    # ---------------- probe case: hangs from the D-ring by a short strap
    dring = BODY @ fig.bone_matrix('pelvis') @ dring_rest
    CW_, CH_, CD_ = 0.9, 0.5, 0.5
    cm = L.M(tuple(CASE), (0, -14, 8))
    case.add(L.box(CW_, CH_ - 0.06, CD_, bevel=0.04, segs=3), cm @ L.M((0, -0.03, 0)), 'case')
    case.add(L.box(CW_ + 0.012, 0.07, CD_ + 0.012, bevel=0.025, segs=2), cm @ L.M((0, CH_ / 2 - 0.035, 0)), 'case')
    for sx in (-0.3, 0.0, 0.3):
        case.add(L.box(0.03, CH_ - 0.1, CD_ + 0.02, bevel=0.008), cm @ L.M((sx, -0.03, 0)), 'case')
    for sx in (-0.25, 0.25):
        case.add(L.box(0.08, 0.1, 0.03, bevel=0.01), cm @ L.M((sx, CH_ / 2 - 0.06, CD_ / 2 + 0.015)), 'rubber')
    case.add(L.torus(0.07, 0.015, segu=18, segv=6, arc=math.pi), cm @ L.M((-0.48, 0.05, 0), (0, 90, 90)), 'rubber')
    case.add(L.box(0.06, 0.08, 0.12, bevel=0.01), cm @ L.M((-0.455, -0.0, 0)), 'rubber')
    case.add(L.cyl(0.03, 0.04, segs=14), cm @ L.M((0.2, CH_ / 2 + 0.01, -0.12)), 'chrome')
    cstn.add(L.panel_uv(0.5, 0.25, 0.003, duv('case')), cm @ L.M((0, CH_ / 2, 0.02), (-90, 0, 0)), 'decal')
    cstn.add(L.panel_uv(0.36, 0.18, 0.003, duv('case2')), cm @ L.M((0.15, -0.05, CD_ / 2 + 0.003)), 'decal')
    hp = cm @ Vector((-0.54, 0.05, 0))
    case.add(L.sweep([tuple(hp), tuple(hp.lerp(dring, 0.5) + Vector((0, -0.04, 0))), tuple(dring)], 0.012, segs=4, bend=0.05), None, 'webbing')
    case.add(L.torus(0.03, 0.006, segu=14, segv=5), L.M(tuple(dring), (0, 0, 90)), 'chrome')
    # tether from his harness to the console leg
    leg = Vector((-W / 2 + 0.03, FLOOR + 0.25, DZ1))
    t0 = BODY @ fig.bone_matrix('chest') @ rp(-0.13, -0.17, 1.28)
    pts = []
    for k in range(14):
        t = k / 13
        p = t0.lerp(leg, t)
        p.y -= 0.35 * math.sin(t * math.pi)
        p.z += 0.15 * math.sin(t * math.pi)
        pts.append(tuple(p))
    main.add(L.sweep(pts, 0.008, segs=6, smooth_path=True), None, 'hivis')

    A.anchor('probe-case', tuple(CASE))
    A.anchor('diver-head', tuple(BODY @ fig.bone_matrix('head') @ fc))
    A.anchor('pod-photo-target', tuple(CASE))
    wall = [((0, FLOOR - 0.25, -1.0), (9.0, 0.5, 9.0)), ((0, 1.0, LZ - 0.3), (9.0, 8.0, 0.6))]
    rep = A.finish(preview_cfg=dict(view=(-0.35, 0.18, 1.0), fov=40, focus=(-0.2, -1.6, -1.2), radius=2.6, backdrop=wall,
                                    dark_lights=[(L.b((1.5, -1.0, 1.5)), 25, (0.7, 0.85, 1.0))],
                                    extra_views={'-diver': dict(view=(-0.3, 0.05, 1.0), focus=(-0.6, -0.8, -0.4), radius=0.9),
                                                 '-case': dict(view=(0.3, 0.3, 1.0), focus=tuple(CASE), radius=0.8)}))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
