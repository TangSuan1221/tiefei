"""Level two R1 laundry: four industrial washer/dryers on the north wall,
laundry carts, drifting bedsheets and a steel shelf holding the emergency
battery case.

Local frame = world translated by (36, 0, -22); north wall face at local
z=-1.7 (world -23.7). Floor y=-3. 'battery-case' origin = case centre = anchor
'battery-case' = world item (29, -0.6, -20.5), operable face +Z (heading 180).

    blender -b -P tools/blender/build-living-laundry-row.py
"""
import sys, math, random, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'laundry-row'
FLOOR = -3.0
WALLZ = -1.7
BAT = Vector((-7.0, -0.6, 1.5))
MACH = [(-4.2, 'washer', 1), (-2.9, 'washer', 2), (-1.6, 'dryer', 3), (-0.3, 'dryer', 4)]
MW, MH, MD = 1.2, 1.55, 1.1
rng = random.Random(11)

KINDS = {
    'enamel': dict(scan='rusty_painted_metal', tint=(0.52, 0.54, 0.5), tint_mix=0.85, contrast=0.45, rough=0.35, wear=0.7, chips=0.7, rust=0.9, bio=0.6, silt=0.8, bio_lo=-3, bio_hi=-1.4, dirt=1.0, grime=1.3, seed=71),
    'steel': dict(scan='rust_coarse', tint=(0.45, 0.45, 0.43), tint_mix=0.75, rough=0.35, metal=0.9, rust=0.35, bio=0.3, silt=0.5, grime=0.9, seed=72),
    'drum': dict(scan='rust_coarse', tint=(0.5, 0.5, 0.48), tint_mix=0.8, rough=0.3, metal=0.9, rust=0.4, bio=0.5, silt=0.3, grime=1.2, seed=73),
    'panel': dict(scan='shutter', tint=(0.12, 0.13, 0.14), tint_mix=0.9, contrast=0.3, rough=0.4, grime=0.7, silt=0.5, bio=0.35, dirt=0.4, seed=74),
    'rubber': dict(scan='rubber', tint=(0.03, 0.03, 0.03), tint_mix=0.9, rough=0.7, bio=0.4, silt=0.4, grime=0.4, seed=75),
    'portglass': dict(scan='shutter', tint=(0.05, 0.07, 0.07), tint_mix=1.0, contrast=0.1, rough=0.06, rough_var=0.03, grime=0.6, dirt=0.6, silt=0.4, bio=0.5, bump=0.05, seed=76),
    'shelf': dict(scan='rusty_painted_metal', tint=(0.3, 0.32, 0.3), tint_mix=0.85, contrast=0.4, rough=0.5, wear=0.6, chips=0.4, rust=0.6, bio=0.45, silt=0.7, dirt=0.5, seed=77),
    'canvas': dict(scan='linen', tint=(0.42, 0.40, 0.33), tint_mix=0.8, rough=0.85, bio=0.5, silt=0.5, grime=1.0, dirt=0.8, seed=78),
    'sheet': dict(scan='linen', tint=(0.60, 0.58, 0.50), tint_mix=0.8, rough=0.85, bio=0.6, bio_lo=-3, bio_hi=1.5, silt=0.35, grime=1.2, dirt=1.0, bump=0.6, ao_dist=0.1, seed=79),
    'plastic': dict(scan='shutter', tint=(0.18, 0.32, 0.5), tint_mix=0.92, contrast=0.2, rough=0.4, grime=0.8, silt=0.6, bio=0.4, dirt=0.5, seed=80),
    'battery': dict(scan='rusty_painted_metal', tint=(0.78, 0.36, 0.05), tint_mix=0.9, contrast=0.35, rough=0.45, wear=0.8, chips=0.5, rust=0.4, bio=0.35, silt=0.7, dirt=0.6, seed=81),
    'pipe': dict(scan='rusty_painted_metal', tint=(0.35, 0.38, 0.36), tint_mix=0.85, contrast=0.4, rough=0.5, wear=0.5, rust=0.7, bio=0.5, silt=0.6, seed=82),
    'decal': dict(scan='shutter', image=None, rough=0.5, rough_var=0.15, grime=0.6, silt=0.5, bio=0.35, rust=0.3, dirt=0.6, bump=0.15, image_mix=0.8, seed=83),
}
GROUPS = {
    'main': dict(res=2048),
    'cloth': dict(res=1024, double_sided=True),
    'battery': dict(res=512),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
DECALS = {
    'sign': (0.0, 3.0, 4.0, 1.0),       # wall sign 2.4 x 0.6
    'm1': (0.0, 2.2, 0.8, 0.6), 'm2': (0.8, 2.2, 0.8, 0.6), 'm3': (1.6, 2.2, 0.8, 0.6), 'm4': (2.4, 2.2, 0.8, 0.6),
    'bat': (0.0, 1.0, 2.0, 1.2),        # battery label 0.4 x 0.24
    'note': (2.0, 1.0, 1.0, 1.2),       # taped note on machine 2
    'cart': (3.0, 1.0, 1.0, 0.6),
}


def duv(k):
    x, y, w, h = DECALS[k]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def graphic():
    it = []
    blk, wht, red = (0.05, 0.05, 0.05), (0.92, 0.92, 0.88), (0.72, 0.08, 0.06)
    x, y, w, h = DECALS['sign']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.85, 0.86, 0.82)),
           dict(type='rect', xywh=(x, y, 0.9, h), color=(0.1, 0.36, 0.42)),
           dict(type='text', text='洗', xy=(x + 0.45, y + 0.3), size=0.5, align='CENTER', color=wht),
           dict(type='text', text='员工洗衣房', xy=(x + 2.45, y + 0.56), size=0.3, align='CENTER', color=blk),
           dict(type='text', text='疗养区床品须单独装袋 · 不得混洗', xy=(x + 2.45, y + 0.28), size=0.15, align='CENTER', color=(0.45, 0.08, 0.06)),
           dict(type='text', text='STAFF LAUNDRY · DECK -1', xy=(x + 2.45, y + 0.08), size=0.1, align='CENTER', color=(0.3, 0.3, 0.3), font=L.FONT_STENCIL)]
    for i, k in enumerate(('m1', 'm2', 'm3', 'm4')):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=(0.12, 0.13, 0.14)),
               dict(type='text', text=str(i + 1), xy=(x + 0.2, y + 0.16), size=0.34, align='CENTER', color=wht, font=L.FONT_STENCIL),
               dict(type='text', text='洗涤' if i < 2 else '烘干', xy=(x + 0.56, y + 0.32), size=0.15, align='CENTER', color=wht),
               dict(type='text', text='WASH' if i < 2 else 'DRY', xy=(x + 0.56, y + 0.12), size=0.1, align='CENTER', color=(0.7, 0.7, 0.66), font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['bat']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.08, 0.08, 0.08)),
           dict(type='rect', xywh=(x + 0.05, y + 0.05, w - 0.1, h - 0.1), color=(0.93, 0.66, 0.1)),
           dict(type='text', text='应急电池', xy=(x + w / 2, y + 0.68), size=0.32, align='CENTER', color=blk),
           dict(type='text', text='EMERGENCY BATTERY 48V', xy=(x + w / 2, y + 0.38), size=0.14, align='CENTER', color=blk, font=L.FONT_STENCIL),
           dict(type='text', text='潜器快接口 · 防水', xy=(x + w / 2, y + 0.14), size=0.13, align='CENTER', color=blk)]
    x, y, w, h = DECALS['note']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.93, 0.9, 0.72)),
           dict(type='text', text='故障', xy=(x + 0.5, y + 0.85), size=0.22, align='CENTER', color=red),
           dict(type='text', text='排水泵堵', xy=(x + 0.5, y + 0.55), size=0.15, align='CENTER', color=(0.1, 0.12, 0.3)),
           dict(type='text', text='里面有', xy=(x + 0.5, y + 0.33), size=0.15, align='CENTER', color=(0.1, 0.12, 0.3)),
           dict(type='text', text='头发?', xy=(x + 0.5, y + 0.12), size=0.15, align='CENTER', color=(0.1, 0.12, 0.3))]
    x, y, w, h = DECALS['cart']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.2, 0.36, 0.55)),
           dict(type='text', text='疗养区', xy=(x + 0.5, y + 0.3), size=0.2, align='CENTER', color=wht),
           dict(type='text', text='SANATORIUM', xy=(x + 0.5, y + 0.1), size=0.1, align='CENTER', color=wht, font=L.FONT_STENCIL)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


def machine(part, door_part, x, kind_name, idx, stn, open_door=False):
    cz = WALLZ + MD / 2 + 0.05
    front = cz + MD / 2
    pc = Vector((x, FLOOR + 0.82, front))
    body = L.box(MW, MH, MD, bevel=0.05, segs=3)
    L.transform(body, Matrix.Translation((x, FLOOR + 0.12 + MH / 2, cz)))
    hole = L.cyl(0.3, 1.3, segs=40)
    L.transform(hole, L.M(tuple(pc), (90, 0, 0)))
    part.add(L.boolean(body, [hole]), None, 'enamel')
    part.add(L.box(MW + 0.06, 0.12, MD + 0.04, bevel=0.01), L.M((x, FLOOR + 0.06, cz)), 'steel')
    for s in (-1, 1):
        for zz in (cz - MD / 2 + 0.1, cz + MD / 2 - 0.1):
            part.add(L.cyl(0.04, 0.05, segs=10), L.M((x + s * (MW / 2 - 0.08), FLOOR + 0.025, zz)), 'rubber')
    # drum: open cylinder pointing back into the cabinet
    drum = L.cyl(0.29, 0.62, segs=40, caps=False)
    for f in drum.faces:
        f.normal_flip()
    L.transform(drum, L.M(tuple(pc + Vector((0, 0, -0.31))), (90, 0, 0)))
    part.add(drum, None, 'drum')
    part.add(L.cyl(0.29, 0.01, segs=40), L.M(tuple(pc + Vector((0, 0, -0.6))), (90, 0, 0)), 'drum')
    for k in range(3):
        a = k * 2 * math.pi / 3
        part.add(L.box(0.05, 0.06, 0.5, bevel=0.01), L.M(tuple(pc + Vector((0.26 * math.cos(a), 0.26 * math.sin(a), -0.32))), (0, 0, math.degrees(a) + 90)), 'drum')
    # gasket + door ring + glass (door is its own object, hinge on the left side)
    part.add(L.torus(0.305, 0.03, segu=40, segv=8), L.M(tuple(pc + Vector((0, 0, 0.0))), (90, 0, 0)), 'rubber')
    hinge = pc + Vector((-0.4, 0, 0.06))
    swing = -100 if open_door else 0
    Dm = L.M(tuple(hinge), (0, swing, 0)) @ L.M(tuple(-hinge))
    door_part.add(L.torus(0.33, 0.045, segu=40, segv=10), Dm @ L.M(tuple(pc + Vector((0, 0, 0.06))), (90, 0, 0)), 'steel')
    door_part.add(L.lathe([(0, 0), (0.29, 0), (0.29, 0.02), (0.22, 0.09), (0, 0.11)], segs=36), Dm @ L.M(tuple(pc + Vector((0, 0, 0.04))), (-90, 0, 0)), 'portglass')
    door_part.add(L.box(0.06, 0.2, 0.05, bevel=0.012), Dm @ L.M(tuple(pc + Vector((0.36, 0, 0.09)))), 'steel')
    door_part.add(L.box(0.1, 0.16, 0.04, bevel=0.01), Dm @ L.M(tuple(hinge + Vector((0.05, 0, -0.01)))), 'steel')
    # top control panel strip
    py = FLOOR + 0.12 + MH - 0.22
    part.add(L.box(MW - 0.06, 0.3, 0.06, bevel=0.012), L.M((x, py, front + 0.02)), 'panel')
    for k in range(3):
        part.add(L.lathe([(0, 0), (0.035, 0), (0.035, 0.03), (0.025, 0.045), (0, 0.045)], segs=16), L.M((x + 0.1 + k * 0.13, py, front + 0.045), (90, 0, 0)), 'rubber')
    part.add(L.cyl(0.055, 0.02, segs=24), L.M((x - 0.3, py, front + 0.06), (90, 0, 0)), 'steel')
    stn.add(L.panel_uv(0.32, 0.24, 0.003, duv('m%d' % idx)), L.M((x - 0.38, FLOOR + 0.12 + MH - 0.55, front + 0.002)), 'decal')
    # rear service: inlet hoses + drain into wall
    for s, kd in ((-0.3, 'rubber'), (0.0, 'rubber')):
        part.add(L.sweep([(x + s, FLOOR + 1.3, cz - MD / 2), (x + s, FLOOR + 1.3, WALLZ + 0.02), (x + s, FLOOR + 1.9, WALLZ + 0.02)], 0.018, segs=8, bend=0.06), None, kd)
    if kind_name == 'dryer':
        part.add(L.sweep([(x + 0.3, FLOOR + 1.2, cz - MD / 2), (x + 0.3, FLOOR + 1.2, WALLZ + 0.05), (x + 0.3, FLOOR + 3.6, WALLZ + 0.05)], 0.07, segs=16, bend=0.15), None, 'steel')
        for k in range(10):
            part.add(L.torus(0.072, 0.006, segu=16, segv=4), L.M((x + 0.3, FLOOR + 1.5 + k * 0.2, WALLZ + 0.05)), 'steel')
    return pc


def sheet(part, center, w, h, rot, seed, droop=0.3, kind='sheet', amp=1.0):
    def fn(u, v, co):
        n1 = L.noise3((u * 2.2 + seed, v * 2.2, seed), 1.0, seed)
        n2 = L.noise3((u * 6.0, v * 6.0 + seed, seed * 2), 1.0, seed + 1)
        co.z += amp * (n1 * 0.3 + n2 * 0.1 + math.sin(u * math.pi * 7 + v * 2 + seed) * 0.05 + math.sin(v * math.pi * 11 + u * 3) * 0.025)
        co.y -= droop * (math.sin(u * math.pi)) * (1 - v) * 0.5
        return co
    bm = L.grid(w, h, 28, 34, fn)
    part.add(bm, L.M(tuple(center), rot), kind)


def cart(part, base, yaw, tipped=False, stn=None):
    R = L.M(tuple(base), (0, yaw, 90 if tipped else 0))
    W, D, H = 0.95, 0.65, 0.8
    for sx in (-1, 1):
        for sz in (-1, 1):
            part.add(L.cyl(0.015, H, segs=8), R @ L.M((sx * W / 2, 0.15 + H / 2, sz * D / 2)), 'steel')
            part.add(L.cyl(0.05, 0.035, segs=14), R @ L.M((sx * (W / 2 - 0.03), 0.05, sz * (D / 2 - 0.03)), (0, 0, 90)), 'rubber')
            part.add(L.box(0.04, 0.06, 0.04, bevel=0.005), R @ L.M((sx * (W / 2 - 0.03), 0.11, sz * (D / 2 - 0.03))), 'steel')
    for yy in (0.15, 0.15 + H):
        for sz in (-1, 1):
            part.add(L.cyl(0.013, W, segs=8), R @ L.M((0, yy, sz * D / 2), (0, 0, 90)), 'steel')
        for sx in (-1, 1):
            part.add(L.cyl(0.013, D, segs=8), R @ L.M((sx * W / 2, yy, 0), (90, 0, 0)), 'steel')
    # canvas bag: open box sagging inwards
    def fn(co):
        t = (co.y - 0.2) / (H - 0.1)
        sag = 0.06 * math.sin(max(0, min(1, t)) * math.pi)
        co.x -= math.copysign(sag, co.x) if abs(co.x) > W / 2 - 0.05 else 0
        co.z -= math.copysign(sag, co.z) if abs(co.z) > D / 2 - 0.05 else 0
        return co
    bag = L.box(W - 0.02, H - 0.08, D - 0.02, bevel=0.03, segs=2)
    top = [f for f in bag.faces if f.normal.y > 0.9]
    import bmesh
    bmesh.ops.delete(bag, geom=top, context='FACES')
    L.transform(bag, Matrix.Translation((0, 0.2 + (H - 0.08) / 2, 0)))
    bmesh.ops.subdivide_edges(bag, edges=bag.edges[:], cuts=3, use_grid_fill=True)
    L.deform(bag, fn)
    part.add(bag, R, 'canvas')
    if stn is not None:
        stn.add(L.panel_uv(0.3, 0.18, 0.003, duv('cart')), R @ L.M((0, 0.62, D / 2 + 0.01)), 'decal')


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(36, 0, -22), front='+Z',
                notes="Machines back onto the north wall of R1. 'battery-case' sits on the shelf; lift it straight out along +Z.")
    KINDS['decal']['image'] = graphic()
    main = A.part('laundry-row')
    doors = A.part('machine-doors')
    cloth = A.part('bedsheets', group='cloth')
    shelf = A.part('shelving')
    bat = A.part('battery-case', origin=tuple(BAT), group='battery')
    stn = A.part('stencils', group='decals')
    bstn = A.part('battery-case-label', origin=tuple(BAT), group='decals', parent='battery-case')

    pcs = []
    for x, kn, idx in MACH:
        pcs.append(machine(main, doors, x, kn, idx, stn, open_door=(idx == 2)))
    # taped fault note on machine 2's panel
    stn.add(L.panel_uv(0.16, 0.19, 0.002, duv('note')), L.M((MACH[1][0] + 0.38, FLOOR + 0.12 + MH - 0.6, WALLZ + MD + 0.05 + 0.003), (0, 0, -7)), 'decal')
    # wall services: water mains, drain gutter, wall sign
    for yy, r in ((FLOOR + 2.2, 0.05), (FLOOR + 2.4, 0.04)):
        main.add(L.cyl(r, 6.2, segs=16), L.M((-2.25, yy, WALLZ + 0.12), (0, 0, 90)), 'pipe')
        for k in range(5):
            main.add(L.torus(r + 0.004, 0.008, segu=14, segv=4), L.M((-5.0 + k * 1.4, yy, WALLZ + 0.12), (0, 0, 90)), 'steel')
    for x, kn, idx in MACH:
        main.add(L.cyl(0.03, 0.2, segs=10), L.M((x - 0.3, FLOOR + 2.1, WALLZ + 0.12)), 'pipe')
        main.add(L.lathe([(0, 0), (0.04, 0), (0.04, 0.05), (0, 0.05)], segs=12), L.M((x - 0.3, FLOOR + 1.95, WALLZ + 0.12)), 'steel')
    main.add(L.box(6.0, 0.08, 0.3, bevel=0.01), L.M((-2.25, FLOOR + 0.04, WALLZ + 0.2)), 'steel')
    for k in range(30):
        main.add(L.box(0.01, 0.02, 0.26, bevel=0.0), L.M((-5.15 + k * 0.2, FLOOR + 0.085, WALLZ + 0.2)), 'steel')
    stn.add(L.panel_uv(2.4, 0.6, 0.004, duv('sign')), L.M((-2.25, FLOOR + 2.95, WALLZ + 0.004)), 'decal')
    # shelving unit with the battery case
    SX, SZ, SW, SD = BAT.x, BAT.z + 0.05, 1.8, 0.6
    levels = (FLOOR + 0.15, FLOOR + 1.2, BAT.y - 0.175 - 0.015, FLOOR + 3.15)
    for sx in (-1, 1):
        for sz in (-1, 1):
            shelf.add(L.box(0.05, levels[-1] - FLOOR + 0.05, 0.05, bevel=0.006), L.M((SX + sx * SW / 2, (levels[-1] + FLOOR) / 2 + 0.02, SZ + sz * SD / 2)), 'shelf')
            shelf.add(L.cyl(0.04, 0.012, segs=10), L.M((SX + sx * SW / 2, FLOOR + 0.006, SZ + sz * SD / 2)), 'steel')
    for ly in levels:
        shelf.add(L.box(SW + 0.04, 0.03, SD + 0.04, bevel=0.006), L.M((SX, ly, SZ)), 'shelf')
        for sz in (-1, 1):
            shelf.add(L.box(SW + 0.04, 0.05, 0.015, bevel=0.003), L.M((SX, ly - 0.03, SZ + sz * (SD / 2 + 0.02))), 'shelf')
    for sx in (-1, 1):
        m, ln = L.axis_to((SX + sx * SW / 2, levels[0], SZ - SD / 2), (SX - sx * SW / 2, levels[2], SZ - SD / 2))
        shelf.add(L.box(0.02, ln, 0.008, bevel=0.0), m @ L.M((0, ln / 2, 0)), 'steel')
    # shelf clutter: folded sheet stacks, detergent jugs
    for i in range(4):
        for j in range(rng.randint(3, 6)):
            shelf.add(L.box(0.38, 0.055, 0.4, bevel=0.025, segs=2), L.M((SX - 0.66 + i * 0.44 + rng.uniform(-0.02, 0.02), levels[1] + 0.045 + j * 0.056, SZ + rng.uniform(-0.03, 0.03)), (0, rng.uniform(-6, 6), 0)), 'sheet')
    for i in range(5):
        jx = SX - 0.7 + i * 0.3
        shelf.add(L.lathe([(0, 0), (0.09, 0), (0.1, 0.02), (0.1, 0.24), (0.07, 0.3), (0.03, 0.31), (0.03, 0.34), (0, 0.34)], segs=16), L.M((jx, levels[3] + 0.015, SZ + rng.uniform(-0.1, 0.1))), 'plastic')
    for i in range(3):
        shelf.add(L.lathe([(0, 0), (0.09, 0), (0.1, 0.02), (0.1, 0.24), (0.07, 0.3), (0.03, 0.31), (0.03, 0.34), (0, 0.34)], segs=16),
                  L.M((SX - 0.6 + i * 0.25, levels[0] + 0.12 if i else levels[0] + 0.1, SZ + 0.1), (90 if i == 1 else 0, 0, 0)), 'plastic')
    # battery case (removable)
    BW, BH, BD = 0.55, 0.35, 0.4
    bat.add(L.box(BW, BH - 0.04, BD, bevel=0.02, segs=2), L.M(tuple(BAT + Vector((0, -0.02, 0)))), 'battery')
    bat.add(L.box(BW + 0.02, 0.05, BD + 0.02, bevel=0.012), L.M(tuple(BAT + Vector((0, BH / 2 - 0.03, 0)))), 'battery')
    for sx in (-1, 1):
        bat.add(L.box(0.035, 0.08, 0.06, bevel=0.008), L.M(tuple(BAT + Vector((sx * (BW / 2 + 0.01), BH / 2 - 0.08, 0)))), 'steel')
        bat.add(L.torus(0.06, 0.012, segu=16, segv=6, arc=math.pi), L.M(tuple(BAT + Vector((sx * 0.16, BH / 2, 0))), (90, 0, 0)), 'steel')
    for sx in (-1, 1):
        bat.add(L.cyl(0.035, 0.05, segs=16), L.M(tuple(BAT + Vector((sx * 0.13, -0.03, BD / 2 + 0.02))), (90, 0, 0)), 'rubber')
        bat.add(L.cyl(0.02, 0.05, segs=12), L.M(tuple(BAT + Vector((sx * 0.13, -0.03, BD / 2 + 0.06))), (90, 0, 0)), 'steel')
    bstn.add(L.panel_uv(0.36, 0.2, 0.003, duv('bat')), L.M(tuple(BAT + Vector((0, 0.07, BD / 2 + 0.001)))), 'decal')
    # carts: one upright with sheets, one tipped
    cart(main, Vector((-5.3, FLOOR, 1.3)), 18, stn=stn)
    cart(main, Vector((-1.2, FLOOR + 0.48, 2.2)), -65, tipped=True)
    # bedsheets: one trailing from machine 2's open drum, two drifting mid-water
    pc = pcs[1]
    drop = pc.y - FLOOR - 0.03

    def spill(u, v, co):
        t = v
        x = (u - 0.5) * (0.45 + 0.5 * t) + L.noise3((u * 3, t * 3, 2.0), 1.0, 3) * 0.12
        z = -0.2 + t * 1.5
        y = -drop * min(1.0, (t * 1.6) ** 2) + 0.12 * math.sin(t * math.pi) + max(0.0, L.noise3((u * 4, t * 4, 5.0), 1.0, 4)) * 0.18 * t
        y += 0.06 * math.sin(u * math.pi * 4 + t * 3) * t
        return Vector((x, y, z))
    cloth.add(L.grid(1.0, 1.0, 16, 30, spill), L.M(tuple(pc)), 'sheet')
    sheet(cloth, Vector((-3.6, FLOOR + 3.5, 0.9)), 2.2, 2.6, (18, 30, 12), 1.7, droop=0.5)
    sheet(cloth, Vector((-0.6, FLOOR + 2.3, 2.9)), 1.6, 2.2, (-25, -40, 70), 4.2, droop=0.35)
    sheet(cloth, Vector((-6.0, FLOOR + 0.12, 2.6)), 1.8, 1.4, (-90, 20, 0), 6.1, droop=0.0, amp=0.3)
    # snapped drying line hanging from its wall hook (kept clear of the battery parking bay)
    main.add(L.sweep([(-6.3, FLOOR + 3.6, WALLZ + 0.05), (-6.28, FLOOR + 3.1, WALLZ + 0.45), (-6.22, FLOOR + 2.3, WALLZ + 0.62)], 0.004, segs=6, bend=0.2), None, 'rubber')

    A.anchor('battery-case', tuple(BAT))
    A.anchor('pod-park', (BAT.x, BAT.y, BAT.z + 3.4))
    A.anchor('washer-2-door', tuple(pcs[1]))
    A.anchor('lumen-ceiling-corner', (-11.5, 4.6, -1.5))
    wall = [((-3.0, 1.0, WALLZ - 0.3), (14.0, 8.0, 0.6)), ((-3.0, FLOOR - 0.25, 1.5), (14.0, 0.5, 7.0))]
    rep = A.finish(preview_cfg=dict(view=(0.25, 0.32, 1.0), fov=42, focus=(-3.6, -1.9, 0.2), radius=4.6, backdrop=wall,
                                    dark_lights=[(L.b((-3.0, 0.5, 2.0)), 50, (0.7, 0.85, 1.0))],
                                    extra_views={'-battery': dict(view=(0.35, 0.3, 1.0), focus=tuple(BAT), radius=1.1),
                                                 '-washer': dict(view=(0.4, 0.2, 1.0), focus=tuple(pcs[1]), radius=1.3)}))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
