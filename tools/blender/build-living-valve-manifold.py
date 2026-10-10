"""Level two valve room (V): three risers with gate valves on wall x=142.

Local frame = world translated by (142, 0, 0): wall boundary at local x=0, the
pod-side wall face at x=-0.3 (WALL_T 0.6 straddles the boundary). Wheels face -X
with hubs at x=-0.66 (world 141.34, layout operable point 141.4) and
z=-36 (V-1 heat, red), -29 (V-2 feed, yellow), -22 (V-3 cooling, blue).
Wheel objects have their origin on the hub and spin about local X.

    blender -b -P tools/blender/build-living-valve-manifold.py
"""
import sys, math, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'valve-manifold'
WALL = -0.30
PIPE_R = 0.17
# Risers run in a shallow wall chase (axis just proud of the wall face) so the handwheel hub lands on the
# layout's operable point x=141.4 (local -0.6) within 0.1 m: the pod parks 3.0-3.4 m from that point.
PIPE_X = WALL - 0.02
WHEEL_X = -0.66
BONNET = 0.30         # bonnet length from the riser axis toward -X (hub sits just in front of it)
FLOOR, TOP = -3.0, 3.25
LINES = [
    dict(id='heat', z=-36.0, tag='V-1', zh='供热', long='疗养区供热回路', en='SANATORIUM HEAT SUPPLY', band='band_red', color=(0.62, 0.07, 0.05)),
    dict(id='feed', z=-29.0, tag='V-2', zh='营养液', long='疗养区营养液管', en='NUTRIENT FEED LINE', band='band_yellow', color=(0.86, 0.62, 0.06)),
    dict(id='cool', z=-22.0, tag='V-3', zh='冷却', long='冷却水回流', en='COOLING WATER RETURN', band='band_blue', color=(0.07, 0.24, 0.56)),
]

KINDS = {
    'pipe': dict(scan='rusty_painted_metal', tint=(0.30, 0.34, 0.31), tint_mix=0.85, rough=0.55, wear=0.55, chips=0.35, rust=0.55, bio=0.45, silt=0.55, bio_lo=-3.0, bio_hi=1.5, seed=1),
    'band_red': dict(scan='rusty_painted_metal', tint=(0.55, 0.07, 0.05), tint_mix=0.9, rough=0.5, wear=0.8, chips=0.35, rust=0.55, bio=0.4, silt=0.5, grime=0.9, dirt=0.55, seed=2),
    'band_yellow': dict(scan='rusty_painted_metal', tint=(0.80, 0.58, 0.07), tint_mix=0.9, rough=0.5, wear=0.8, chips=0.35, rust=0.55, bio=0.4, silt=0.5, grime=0.9, dirt=0.55, seed=3),
    'band_blue': dict(scan='rusty_painted_metal', tint=(0.07, 0.22, 0.52), tint_mix=0.9, rough=0.5, wear=0.8, chips=0.35, rust=0.55, bio=0.4, silt=0.5, grime=0.9, dirt=0.55, seed=4),
    'cast': dict(scan='rusty_painted_metal', tint=(0.10, 0.11, 0.11), tint_mix=0.8, rough=0.6, wear=0.8, wear_radius=0.015, chips=0.2, rust=0.7, bio=0.35, silt=0.6, under=((0.24, 0.16, 0.10), 0.7, 0.4), seed=5),
    'steel': dict(scan='rust_coarse', tint=(0.33, 0.31, 0.29), tint_mix=0.55, rough=0.45, metal=0.85, rust=0.6, bio=0.25, silt=0.5, grime=0.8, seed=6),
    'galv': dict(scan='shutter', tint=(0.42, 0.43, 0.42), tint_mix=0.7, rough=0.5, metal=0.75, rust=0.45, bio=0.3, silt=0.6, seed=7),
    'rubber': dict(scan='rubber', tint=(0.03, 0.03, 0.03), tint_mix=0.9, rough=0.8, bio=0.2, silt=0.3, grime=0.3, seed=8),
    'brass': dict(scan='rust_coarse', tint=(0.50, 0.38, 0.17), tint_mix=0.8, rough=0.38, metal=1.0, grime=0.9, bio=0.2, silt=0.4, seed=9),
    'motor': dict(scan='rusty_painted_metal', tint=(0.16, 0.25, 0.30), tint_mix=0.85, rough=0.5, wear=0.6, chips=0.3, rust=0.5, bio=0.4, silt=0.6, bio_lo=-3.0, bio_hi=0.0, seed=10),
    'safety': dict(scan='rusty_painted_metal', tint=(0.80, 0.50, 0.05), tint_mix=0.9, rough=0.5, wear=0.7, chips=0.3, rust=0.4, bio=0.3, silt=0.5, seed=11),
    'glass_dirty': dict(scan='shutter', tint=(0.55, 0.52, 0.42), tint_mix=0.9, rough=0.2, grime=0.8, silt=0.6, bio=0.3, seed=13),
    'label': dict(scan='linen', image=None, rough=0.3, rough_var=0.1, grime=0.7, silt=0.45, silt_up=0.3, bio=0.35, rust=0.3, dirt=0.75, bump=0.12, image_mix=0.9, seed=12),
}
GROUPS = {
    'main': dict(res=2048),
    'labels': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}


def labels_graphic():
    W = 2.0
    it = []
    # laminated notice, top half (canvas 2.0 x 1.0 -> physical 1.0 x 0.5 m)
    y0 = 1.0
    it += [dict(type='rect', xywh=(0.0, y0, 2.0, 1.0), color=(0.93, 0.92, 0.86)),
           dict(type='rect', xywh=(0.0, y0 + 0.80, 2.0, 0.20), color=(0.72, 0.08, 0.06)),
           dict(type='text', text='运营部通知  OPERATIONS NOTICE', xy=(1.0, y0 + 0.855), size=0.11, align='CENTER', color=(1, 1, 1)),
           dict(type='text', text='疗养区VIP优先供给', xy=(1.0, y0 + 0.555), size=0.205, align='CENTER', color=(0.04, 0.04, 0.04)),
           dict(type='rect', xywh=(0.18, y0 + 0.215, 1.64, 0.27), color=(0.72, 0.08, 0.06)),
           dict(type='text', text='禁止关闭', xy=(1.0, y0 + 0.265), size=0.20, align='CENTER', color=(1, 1, 1)),
           dict(type='text', text='VIP SANATORIUM PRIORITY SUPPLY · DO NOT CLOSE', xy=(1.0, y0 + 0.13), size=0.058, align='CENTER', color=(0.1, 0.1, 0.1)),
           dict(type='text', text='— 运营部', xy=(1.86, y0 + 0.035), size=0.075, align='RIGHT', color=(0.1, 0.1, 0.1)),
           dict(type='rect', xywh=(0.03, y0 + 0.03, 0.06, 0.06), r=0.03, color=(0.55, 0.55, 0.5)),
           dict(type='rect', xywh=(1.91, y0 + 0.91 - 0.06, 0.06, 0.06), r=0.03, color=(0.85, 0.82, 0.8))]
    # three stamped valve tags (canvas 0.5 x 1.0 each -> physical 0.24 x 0.48 m)
    for i, ln in enumerate(LINES):
        x = i * 0.5
        it += [dict(type='rect', xywh=(x, 0.0, 0.5, 1.0), color=(0.78, 0.78, 0.74)),
               dict(type='rect', xywh=(x + 0.03, 0.03, 0.44, 0.94), color=(0.86, 0.86, 0.82)),
               dict(type='rect', xywh=(x + 0.03, 0.72, 0.44, 0.22), color=ln['color']),
               dict(type='text', text=ln['tag'], xy=(x + 0.25, 0.765), size=0.15, align='CENTER', color=(1, 1, 1) if ln['id'] != 'feed' else (0.05, 0.05, 0.05), font=L.FONT_STENCIL),
               dict(type='text', text=ln['zh'], xy=(x + 0.25, 0.53), size=0.135, align='CENTER', color=(0.05, 0.05, 0.05)),
               dict(type='text', text=ln['long'], xy=(x + 0.25, 0.40), size=0.052, align='CENTER', color=(0.08, 0.08, 0.08)),
               dict(type='text', text=ln['en'], xy=(x + 0.25, 0.31), size=0.029, align='CENTER', color=(0.12, 0.12, 0.12)),
               dict(type='text', text='DN350  PN16', xy=(x + 0.25, 0.20), size=0.04, align='CENTER', color=(0.15, 0.15, 0.15), font=L.FONT_STENCIL),
               dict(type='circle', xyr=(x + 0.25, 0.085, 0.035), color=(0.25, 0.25, 0.24))]
    # gauge dial (x 1.5..2.0, y 0.5..1.0)
    cx, cy = 1.75, 0.75
    it += [dict(type='rect', xywh=(1.5, 0.5, 0.5, 0.5), color=(0.1, 0.1, 0.1)),
           dict(type='circle', xyr=(cx, cy, 0.235), color=(0.92, 0.91, 0.86)),
           dict(type='ring', xyrt=(cx, cy, 0.19, 0.02), arc=(-45, 45), color=(0.75, 0.1, 0.07)),
           dict(type='ring', xyrt=(cx, cy, 0.19, 0.02), arc=(45, 225), color=(0.15, 0.15, 0.15))]
    for k in range(11):
        a = math.radians(225 - 27 * k)
        r0, r1 = (0.15, 0.205) if k % 5 == 0 else (0.17, 0.205)
        it.append(dict(type='line', pts=((cx + r0 * math.cos(a), cy + r0 * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))), w=0.008, color=(0.08, 0.08, 0.08)))
    it += [dict(type='text', text='MPa', xy=(cx, cy - 0.11), size=0.04, align='CENTER', color=(0.1, 0.1, 0.1)),
           dict(type='line', pts=((cx, cy), (cx + 0.16 * math.cos(math.radians(205)), cy + 0.16 * math.sin(math.radians(205)))), w=0.012, color=(0.05, 0.05, 0.05)),
           dict(type='circle', xyr=(cx, cy, 0.018), color=(0.05, 0.05, 0.05))]
    # pump nameplate (x 1.5..2.0, y 0..0.5)
    it += [dict(type='rect', xywh=(1.5, 0.0, 0.5, 0.5), color=(0.70, 0.66, 0.55)),
           dict(type='text', text='营养液输送泵', xy=(1.75, 0.38), size=0.05, align='CENTER', color=(0.08, 0.08, 0.08)),
           dict(type='text', text='P-02  FEED PUMP', xy=(1.75, 0.30), size=0.035, align='CENTER', color=(0.08, 0.08, 0.08), font=L.FONT_STENCIL),
           dict(type='text', text='37 kW  380 V  2950 r/min', xy=(1.75, 0.20), size=0.026, align='CENTER', color=(0.1, 0.1, 0.1)),
           dict(type='text', text='供疗养区 · 优先回路', xy=(1.75, 0.10), size=0.034, align='CENTER', color=(0.45, 0.06, 0.04))]
    return L.render_graphic(L.GEN / NAME / 'labels.png', 2048, 2048, W, 2.0, it, bg=(0.5, 0.5, 0.5))


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(142, 0, 0), front='-X',
                notes='Valves at wall x=142, wheels face -X. Wheel objects spin about local X (Three: rotation.x).')
    img = labels_graphic()
    KINDS['label']['image'] = img
    main = A.part('manifold')
    labels = A.part('labels', group='labels')

    def flange(part, m_axis, r_in, r_out, t, nb, kind='cast', bolt_kind='steel', bolt_r=0.018):
        prof = [(r_in, -t / 2), (r_out - 0.008, -t / 2), (r_out, -t / 2 + 0.008), (r_out, t / 2 - 0.008), (r_out - 0.008, t / 2), (r_in, t / 2), (r_in, -t / 2)]
        part.add(L.lathe(prof, segs=48, close_top=False, close_bottom=False), m_axis, kind)
        rb = r_out - 0.035
        for k in range(nb):
            a = 2 * math.pi * (k + 0.5) / nb
            for side in (1, -1):
                mb = m_axis @ L.M((rb * math.cos(a), side * t / 2, rb * math.sin(a)), (0 if side > 0 else 180, 0, 0))
                part.add(L.bolt(bolt_r, bolt_r * 0.85, segs=6), mb, bolt_kind)

    for ln in LINES:
        z = ln['z']
        # riser: from floor, up past the valve, then into the wall
        path = [(PIPE_X, FLOOR + 0.02, z), (PIPE_X, TOP, z), (0.05, TOP, z)]
        main.add(L.sweep(path, PIPE_R, segs=36, bend=0.42, caps=False), None, 'pipe')
        # floor flange and wall sleeve
        flange(main, L.M((PIPE_X, FLOOR + 0.03, z)), PIPE_R - 0.01, PIPE_R + 0.13, 0.05, 12)
        main.add(L.cyl(PIPE_R + 0.2, 0.025, segs=40, bevel=0.006), L.M((PIPE_X, FLOOR + 0.0125, z)), 'steel')
        main.add(L.cyl(PIPE_R + 0.09, 0.08, segs=40, bevel=0.01), L.M((WALL - 0.04, TOP, z), (0, 0, 90)), 'steel')
        main.add(L.cyl(PIPE_R + 0.17, 0.02, segs=40, bevel=0.005), L.M((WALL - 0.01, TOP, z), (0, 0, 90)), 'steel')
        # pipe spool flanges
        for fy in (-1.7, 1.75):
            flange(main, L.M((PIPE_X, fy, z)), PIPE_R - 0.01, PIPE_R + 0.11, 0.045, 12)
            main.add(L.cyl(PIPE_R + 0.085, 0.012, segs=40), L.M((PIPE_X, fy, z)), 'rubber')
        # colour bands with a white lead edge
        for by in (-1.25, 1.2, 2.6):
            main.add(L.cyl(PIPE_R + 0.004, 0.28, segs=36, caps=False), L.M((PIPE_X, by, z)), ln['band'])
            for edge in (-0.155, 0.155):
                main.add(L.cyl(PIPE_R + 0.0035, 0.03, segs=36, caps=False), L.M((PIPE_X, by + edge, z)), 'galv')
        # ---- gate valve body (axis Y) at y=0
        body = [(0.0, -0.40), (PIPE_R + 0.01, -0.40), (PIPE_R + 0.03, -0.30), (0.26, -0.16), (0.285, 0.0), (0.26, 0.16), (PIPE_R + 0.03, 0.30), (PIPE_R + 0.01, 0.40), (0.0, 0.40)]
        main.add(L.lathe(body, segs=40), L.M((PIPE_X, 0, z)), 'cast')
        for fy in (-0.42, 0.42):
            flange(main, L.M((PIPE_X, fy, z)), PIPE_R - 0.005, PIPE_R + 0.12, 0.055, 12)
        # bonnet toward -X
        mb = L.M((PIPE_X, 0, z), (0, 0, 90))  # local +Y -> -X
        bon = [(0.0, 0.18), (0.2, 0.18), (0.2, 0.225), (0.165, 0.225), (0.15, 0.27), (0.1, BONNET), (0.0, BONNET)]
        main.add(L.lathe(bon, segs=36), mb, 'cast')
        for k in range(8):
            a = 2 * math.pi * (k + 0.5) / 8
            main.add(L.bolt(0.016, 0.014, segs=6), mb @ L.M((0.18 * math.cos(a), 0.225, 0.18 * math.sin(a))), 'steel')
        # rising stem through the hub, brass yoke nut behind the wheel
        main.add(L.cyl(0.05, 0.05, segs=6, bevel=0.005), L.M((PIPE_X - BONNET - 0.015, 0, z), (0, 0, 90)), 'brass')
        main.add(L.cyl(0.024, 0.26, segs=16), L.M((WHEEL_X - 0.06, 0, z), (0, 0, 90)), 'steel')
        main.add(L.cyl(0.03, 0.02, segs=12, bevel=0.004), L.M((WHEEL_X - 0.19, 0, z), (0, 0, 90)), 'cast')
        # packing gland bolts
        for s in (-1, 1):
            main.add(L.cyl(0.012, 0.1, segs=8), L.M((PIPE_X - 0.24, 0, z + s * 0.07), (0, 0, 90)), 'steel')
        # ---- handwheel object (origin on hub, plane YZ, faces -X)
        wheel = A.part('wheel-' + ln['id'], origin=(WHEEL_X, 0, z))
        hub = Vector((WHEEL_X, 0, z))
        mw = L.M(tuple(hub), (0, 0, -90))  # torus/lathe axis +Y -> +X
        wheel.add(L.torus(0.34, 0.03, segu=56, segv=14), mw, ln['band'])
        wheel.add(L.lathe([(0.0, -0.06), (0.045, -0.06), (0.06, -0.04), (0.06, 0.05), (0.045, 0.07), (0.0, 0.07)], segs=20), mw, 'cast')
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.3
            dvec = Vector((0, math.cos(a), math.sin(a)))
            p0 = hub + dvec * 0.05 + Vector((0.02, 0, 0))
            p1 = hub + dvec * 0.2 + Vector((-0.015, 0, 0))
            p2 = hub + dvec * 0.33 + Vector((-0.02, 0, 0))
            wheel.add(L.sweep([p0, p1, p2], 0.017, segs=10, bend=0.04, radii=[0.022, 0.018, 0.016]), None, ln['band'])
        # grip knob on the rim
        knob = hub + Vector((-0.07, math.cos(0.3 + math.pi / 5) * 0.34, math.sin(0.3 + math.pi / 5) * 0.34))
        wheel.add(L.lathe([(0.0, 0.0), (0.028, 0.0), (0.032, 0.05), (0.03, 0.10), (0.0, 0.11)], segs=14), L.M(tuple(knob + Vector((0.06, 0, 0))), (0, 0, 90)), 'rubber')
        A.anchor('wheel-' + ln['id'], tuple(hub))
        # ---- bypass loop with a small globe valve (south side of the riser)
        bz = z + 0.55
        bp = [(PIPE_X, -0.95, z + PIPE_R - 0.02), (PIPE_X, -0.95, bz), (PIPE_X, 0.95, bz), (PIPE_X, 0.95, z + PIPE_R - 0.02)]
        main.add(L.sweep(bp, 0.045, segs=14, bend=0.12, caps=False), None, 'pipe')
        main.add(L.lathe([(0.0, -0.13), (0.06, -0.13), (0.09, -0.06), (0.1, 0.0), (0.09, 0.06), (0.06, 0.13), (0.0, 0.13)], segs=20), L.M((PIPE_X, 0.0, bz)), 'cast')
        main.add(L.cyl(0.012, 0.3, segs=8), L.M((PIPE_X - 0.15, 0.0, bz), (0, 0, 90)), 'steel')
        main.add(L.torus(0.09, 0.012, segu=24, segv=6), L.M((PIPE_X - 0.29, 0.0, bz), (0, 0, -90)), ln['band'])
        for k in range(3):
            a = 2 * math.pi * k / 3
            main.add(L.sweep([(PIPE_X - 0.29, 0.0, bz), (PIPE_X - 0.29, 0.09 * math.cos(a), bz + 0.09 * math.sin(a))], 0.008, segs=6), None, ln['band'])
        for fy in (-0.6, 0.6):
            flange(main, L.M((PIPE_X, fy, bz)), 0.04, 0.085, 0.025, 4, bolt_r=0.01)
        # ---- Y-strainer below the valve with a drain cock
        sy0 = -2.25
        main.add(L.lathe([(0.0, -0.22), (PIPE_R + 0.02, -0.22), (PIPE_R + 0.05, -0.1), (PIPE_R + 0.05, 0.1), (PIPE_R + 0.02, 0.22), (0.0, 0.22)], segs=36), L.M((PIPE_X, sy0, z)), 'cast')
        ms, lns = L.axis_to((PIPE_X, sy0 + 0.05, z), (PIPE_X - 0.38, sy0 - 0.4, z))
        main.add(L.lathe([(0.0, 0.0), (0.1, 0.0), (0.1, lns - 0.05), (0.14, lns - 0.05), (0.14, lns), (0.0, lns)], segs=28), ms, 'cast')
        for k in range(6):
            a = 2 * math.pi * k / 6
            main.add(L.bolt(0.014, 0.012, segs=6, wsegs=8), ms @ L.M((0.115 * math.cos(a), lns, 0.115 * math.sin(a))), 'steel')
        main.add(L.cyl(0.02, 0.12, segs=8), ms @ L.M((0, lns + 0.06, 0)), 'brass')
        # ---- caged bulkhead lamp above the station (dead)
        lp = Vector((WALL - 0.06, 3.5, z + 1.1))
        main.add(L.box(0.08, 0.3, 0.22, bevel=0.02), L.M(tuple(lp)), 'cast')
        main.add(L.lathe([(0.0, 0.0), (0.09, 0.0), (0.095, 0.04), (0.08, 0.12), (0.0, 0.14)], segs=20), L.M(tuple(lp + Vector((-0.04, 0, 0))), (0, 0, 90)), 'glass_dirty')
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            main.add(L.sweep([tuple(lp + Vector((-0.04, 0.1 * math.cos(a), 0.1 * math.sin(a)))), tuple(lp + Vector((-0.2, 0.06 * math.cos(a), 0.06 * math.sin(a))))], 0.006, segs=6), None, 'steel')
        main.add(L.torus(0.1, 0.006, segu=20, segv=5), L.M(tuple(lp + Vector((-0.08, 0, 0))), (0, 0, 90)), 'steel')
        # ---- hanging tag on a chain from the yoke
        tag_pos = Vector((PIPE_X - 0.33, -0.78, z + 0.36))
        u0 = LINES.index(ln) * 0.25
        tag = L.panel_uv(0.24, 0.48, 0.004, uv_rect=(u0, 0.0, u0 + 0.25, 0.5))
        labels.add(tag, L.M(tuple(tag_pos), (0, -90, 3)), 'label')
        for k in range(6):
            main.add(L.torus(0.011, 0.0028, segu=10, segv=5), L.M((PIPE_X - 0.33, -0.52 + k * 0.019, z + 0.36 - 0.01 * k), (0, 90 * (k % 2), 90)), 'galv')
        main.add(L.cyl(0.012, 0.05, segs=8), L.M((PIPE_X - 0.31, -0.42, z + 0.36), (0, 0, 0)), 'steel')
        # ---- pressure gauge above the valve
        gy = 0.95
        main.add(L.cyl(0.03, 0.34, segs=12), L.M((PIPE_X - 0.2, gy, z), (0, 0, 90)), 'brass')
        main.add(L.torus(0.05, 0.014, segu=16, segv=8, arc=math.pi * 1.5), L.M((PIPE_X - 0.38, gy + 0.05, z), (90, 0, 0)), 'brass')
        main.add(L.cyl(0.018, 0.12, segs=10), L.M((PIPE_X - 0.42, gy + 0.14, z), (0, 0, 0)), 'brass')
        gpos = Vector((PIPE_X - 0.42, gy + 0.30, z))
        main.add(L.lathe([(0.0, -0.035), (0.095, -0.035), (0.105, -0.02), (0.105, 0.025), (0.09, 0.03), (0.0, 0.03)], segs=40), L.M(tuple(gpos), (0, 0, 90)), 'cast')
        main.add(L.torus(0.095, 0.012, segu=40, segv=8), L.M(tuple(gpos + Vector((-0.032, 0, 0))), (0, 0, 90)), 'brass')
        dial = L.quad_uv(0.18, 0.18, uv_rect=(0.765, 0.265, 0.985, 0.485))
        labels.add(dial, L.M(tuple(gpos + Vector((-0.031, 0, 0))), (0, -90, 0)), 'label')
        # wall clamps on two strut rails
    for sy in (-2.25, 2.3):
        main.add(L.box(0.05, 0.045, 17.4, bevel=0.004), L.M((WALL - 0.025, sy, -29.0)), 'galv')
        for k in range(18):
            main.add(L.bolt(0.012, 0.012, segs=6), L.M((WALL - 0.05, sy, -37.6 + k * 1.0), (0, 0, 90)), 'steel')
        for ln in LINES:
            z = ln['z']
            u = [(WALL - 0.05, sy, z - PIPE_R - 0.03)]
            for k in range(13):
                a = math.pi * k / 12
                u.append((PIPE_X - (PIPE_R + 0.014) * math.sin(a), sy, z - (PIPE_R + 0.014) * math.cos(a)))
            u.append((WALL - 0.05, sy, z + PIPE_R + 0.03))
            main.add(L.sweep(u, 0.011, segs=8, smooth_path=True), None, 'galv')
            for s in (-1, 1):
                main.add(L.cyl(0.018, 0.016, segs=6), L.M((WALL - 0.065, sy, z + s * (PIPE_R + 0.03)), (0, 0, 90)), 'steel')
    # ---- secondary runs along the wall: two instrument/condensate lines and a cable tray
    for (iy, ir, kind) in ((4.05, 0.055, 'pipe'), (4.32, 0.04, 'galv'), (-2.62, 0.05, 'pipe')):
        ix = WALL - 0.03 - ir - (0.0 if iy > 0 else 0.0)
        main.add(L.sweep([(ix, iy, -39.6), (ix, iy, -18.4)], ir, segs=14, caps=True), None, kind)
        for k in range(8):
            cz = -39.0 + k * 2.9
            main.add(L.box(0.06, 0.03, 0.05, bevel=0.004), L.M((WALL - 0.03, iy - ir - 0.015, cz)), 'galv')
            main.add(L.torus(ir + 0.006, 0.006, segu=14, segv=5, arc=math.pi), L.M((ix, iy, cz), (90, 0, 90)), 'galv')
    tray_y = 4.75
    main.add(L.box(0.32, 0.012, 21.0, bevel=0.002), L.M((WALL - 0.2, tray_y - 0.06, -29.0)), 'galv')
    for s in (-1, 1):
        main.add(L.box(0.012, 0.11, 21.0, bevel=0.002), L.M((WALL - 0.2 + s * 0.16, tray_y, -29.0)), 'galv')
    for k in range(8):
        cz = -39.0 + k * 2.9
        main.add(L.box(0.36, 0.04, 0.04, bevel=0.004), L.M((WALL - 0.2, tray_y - 0.09, cz)), 'steel')
    for k, cr in enumerate((0.022, 0.03, 0.018, 0.026)):
        main.add(L.sweep([(WALL - 0.3 + k * 0.065, tray_y - 0.03 + cr, -39.5), (WALL - 0.3 + k * 0.065, tray_y - 0.03 + cr, -18.5)], cr, segs=8), None, 'rubber')
    # local valve status box between V-2 and V-3
    jb = Vector((WALL - 0.12, 1.3, -25.5))
    main.add(L.box(0.22, 0.75, 0.55, bevel=0.02), L.M(tuple(jb)), 'motor')
    main.add(L.box(0.03, 0.66, 0.46, bevel=0.01), L.M(tuple(jb + Vector((-0.12, 0, 0)))), 'motor')
    for k, col in enumerate(('band_red', 'band_yellow', 'band_blue')):
        main.add(L.lathe([(0.0, 0.0), (0.03, 0.0), (0.03, 0.02), (0.022, 0.035), (0.0, 0.04)], segs=16), L.M(tuple(jb + Vector((-0.135, 0.18, -0.14 + k * 0.14))), (0, 0, 90)), col)
    main.add(L.cyl(0.045, 0.05, segs=16, bevel=0.006), L.M(tuple(jb + Vector((-0.15, -0.12, 0))), (0, 0, 90)), 'steel')
    main.add(L.box(0.02, 0.012, 0.09, bevel=0.003), L.M(tuple(jb + Vector((-0.185, -0.12, 0)))), 'rubber')
    main.add(L.sweep([tuple(jb + Vector((0, 0.38, 0))), (WALL - 0.12, tray_y - 0.08, -25.5)], 0.02, segs=8), None, 'galv')
    # ---- feed pump skid between V-1 and V-2, discharging into the yellow riser
    pz = -32.6
    px = -1.35
    main.add(L.box(1.25, 0.16, 2.9, bevel=0.01), L.M((px, FLOOR + 0.08, pz - 0.3)), 'motor')
    for s in (-1, 1):
        main.add(L.box(0.08, 0.04, 3.0, bevel=0.006), L.M((px + s * 0.6, FLOOR + 0.02, pz - 0.3)), 'steel')
    for sx in (-0.5, 0.5):
        for sz in (-1.35, 1.05):
            main.add(L.bolt(0.02, 0.03, segs=6), L.M((px + sx, FLOOR + 0.16, pz + sz)), 'steel')
    # motor (axis Z, drive end toward the pump), finned
    mz0 = pz - 0.25
    mm = L.M((px, FLOOR + 0.62, mz0), (90, 0, 0))
    prof = [(0.0, 0.0), (0.24, 0.0), (0.26, 0.02)]
    for k in range(10):
        y = 0.06 + k * 0.075
        prof += [(0.27, y), (0.31, y + 0.012), (0.31, y + 0.035), (0.27, y + 0.047)]
    prof += [(0.27, 0.86), (0.24, 0.9), (0.06, 0.92), (0.04, 1.02), (0.0, 1.02)]
    main.add(L.lathe([(r, -y) for r, y in prof], segs=40), mm, 'motor')
    main.add(L.box(0.22, 0.18, 0.26, bevel=0.012), L.M((px, FLOOR + 0.98, mz0 - 0.45)), 'motor')
    main.add(L.box(0.62, 0.2, 0.7, bevel=0.01), L.M((px, FLOOR + 0.42, mz0 - 0.45)), 'motor')
    # fan cowl
    main.add(L.lathe([(0.0, 0.0), (0.29, 0.0), (0.3, 0.05), (0.3, 0.22), (0.27, 0.25), (0.0, 0.25)], segs=40), L.M((px, FLOOR + 0.62, mz0 - 1.02), (-90, 0, 0)), 'motor')
    # coupling guard
    main.add(L.box(0.3, 0.32, 0.4, bevel=0.015), L.M((px, FLOOR + 0.62, pz - 0.05)), 'safety')
    # volute casing
    vz = pz + 0.5
    vol = [(0.0, -0.17), (0.2, -0.17), (0.34, -0.12), (0.39, 0.0), (0.34, 0.12), (0.2, 0.17), (0.0, 0.17)]
    main.add(L.lathe(vol, segs=40), L.M((px, FLOOR + 0.68, vz), (90, 0, 0)), 'motor')
    main.add(L.box(0.5, 0.36, 0.5, bevel=0.03), L.M((px, FLOOR + 0.42, vz)), 'motor')
    for k in range(10):
        a = 2 * math.pi * k / 10
        main.add(L.bolt(0.016, 0.014, segs=6), L.M((px + 0.31 * math.cos(a), FLOOR + 0.68 + 0.31 * math.sin(a), vz + 0.17), (90, 0, 0)), 'steel')
    # suction from floor and discharge into the yellow riser
    main.add(L.sweep([(px, FLOOR + 0.68, vz + 0.17), (px, FLOOR + 0.68, vz + 0.6), (px, FLOOR + 0.05, vz + 0.6)], 0.11, segs=24, bend=0.2, caps=False), None, 'pipe')
    # discharge kept below y=-1.5 (pod hull floor when parked at the valves)
    DY = FLOOR + 1.28
    disc = [(px, FLOOR + 1.07, vz), (px, DY, vz), (px, DY, -29.0), (PIPE_X, DY, -29.0)]
    main.add(L.sweep(disc, 0.09, segs=24, bend=0.16, caps=False), None, 'band_yellow')
    flange(main, L.M((px, FLOOR + 1.12, vz)), 0.08, 0.16, 0.035, 8)
    flange(main, L.M((-0.9, DY, -29.0), (0, 0, 90)), 0.08, 0.16, 0.035, 8)
    # check valve on discharge
    main.add(L.lathe([(0.0, -0.16), (0.1, -0.16), (0.15, -0.08), (0.15, 0.08), (0.1, 0.16), (0.0, 0.16)], segs=28), L.M((px, DY, -30.9), (90, 0, 0)), 'cast')
    # pump nameplate
    plate = L.panel_uv(0.26, 0.26, 0.004, uv_rect=(0.75, 0.0, 1.0, 0.25))
    labels.add(plate, L.M((px - 0.312, FLOOR + 0.42, mz0 - 0.45), (0, -90, 0)), 'label')
    # conduit from motor terminal box into the wall
    main.add(L.sweep([(px, FLOOR + 1.07, mz0 - 0.45), (px, FLOOR + 1.25, mz0 - 0.45), (WALL - 0.04, FLOOR + 1.25, mz0 - 0.45), (WALL - 0.04, 4.6, mz0 - 0.45)], 0.022, segs=10, bend=0.12, caps=False), None, 'galv')
    # ---- laminated notice zip-tied above the yellow wheel (faces -X, slight curl)
    def curl(u, v, co):
        return Vector((co.x, co.y, co.z + 0.012 * math.sin(math.pi * u) + 0.02 * (v - 0.5) ** 2))
    note = L.grid(1.0, 0.5, 16, 8, curl)
    uvl = note.loops.layers.uv.active
    for f in note.faces:
        for lp in f.loops:
            uvv = lp[uvl].uv
            lp[uvl].uv = (uvv.x, 0.5 + uvv.y * 0.5)
    L.thicken(note, 0.002)
    SIGN = Vector((WALL - 0.035, 0.95, -28.0))
    labels.add(note, L.M(tuple(SIGN), (0, -90, 0)), 'label')
    for s in (-1, 1):
        for t in (-1, 1):
            main.add(L.bolt(0.009, 0.006, segs=8, wsegs=10), L.M(tuple(SIGN + Vector((-0.012, t * 0.22, s * 0.47))), (0, 0, 90)), 'steel')
    A.anchor('sign', tuple(SIGN))
    A.anchor('pump', (px, FLOOR + 0.62, pz))
    rep = A.finish(preview_cfg=dict(view=(-1.0, 0.32, 0.42), fov=36, focus=(-0.9, 0.3, -29.0), radius=8.6, backdrop=[((0.0, 1.0, -29.0), (0.6, 8.0, 24.0)), ((-6.0, -3.25, -29.0), (12.0, 0.5, 24.0))],
                                    dark_lights=[(L.b((-1.0, 4.4, -38.0)), 180, (1.0, 0.25, 0.15)), (L.b((-1.5, 2.0, -24.0)), 40, (0.5, 0.8, 1.0))],
                                    extra_views={'-close': dict(view=(-1.0, 0.25, 0.55), focus=(-0.9, 0.2, -29.0), radius=2.0)}),
                   extra=dict(wheelAxis='local X (Three rotation.x)', lines=[dict(id=ln['id'], tag=ln['tag'], name=ln['long'], z=ln['z']) for ln in LINES]))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
