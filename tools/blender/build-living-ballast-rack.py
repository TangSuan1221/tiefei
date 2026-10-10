"""Level two R4 ballast store: heavy pallet rack with lead ingots, and the removable
'ballast-crate' the pod manipulator lifts, hanging from the rack's hoist in front of
bay B2 (someone was lifting it out when the deck flooded).

Local frame = world translated by (115.5, 0, 32.5); operable face points -X
(heading 270). Room floor y=-3. 'ballast-crate' origin = crate centre =
anchor 'ballast-crate' = world item position (115.5, -0.6, 32.5).
The rack itself stands 1.1 m behind the crate so that at the closest legal parking
pose (pod centre 3.0 m from the crate, nose at local x -0.5) nothing but the crate and
its chain is within 1 m of the nose inside the hull band.

    blender -b -P tools/blender/build-living-ballast-rack.py
"""
import sys, math, random, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'ballast-rack'
FLOOR = -3.0
XF, XB = 0.55, 1.65                   # front / back upright lines (rack set back behind the hanging crate)
XM = (XF + XB) / 2                    # rack centre line
HX = 0.0                              # hoist rail / trolley line, straight over the crate
ZS = (-2.4, -0.8, 0.8, 2.4)           # upright stations
BEAMS = (-2.72, -0.92, 0.92)          # beam top heights
TOP = 1.6
CRATE = Vector((0.0, -0.6, 0.0))
CW, CH, CD = 0.9, 0.56, 0.7           # crate x, y, z
rng = random.Random(7)

KINDS = {
    'upright': dict(scan='rusty_painted_metal', tint=(0.13, 0.20, 0.30), tint_mix=0.9, contrast=0.4, rough=0.5, wear=0.6, chips=0.4, rust=0.45, bio=0.5, silt=0.6, bio_lo=-3, bio_hi=-1.2, dirt=0.5, seed=61),
    'beam': dict(scan='rusty_painted_metal', tint=(0.62, 0.22, 0.04), tint_mix=0.9, contrast=0.4, rough=0.45, wear=0.7, chips=0.45, rust=0.4, bio=0.4, silt=0.7, dirt=0.5, seed=62),
    'steel': dict(scan='rust_coarse', tint=(0.30, 0.29, 0.27), tint_mix=0.7, rough=0.5, metal=0.85, rust=0.6, bio=0.3, silt=0.6, grime=0.8, seed=63),
    'deck': dict(scan='rust_coarse', tint=(0.24, 0.23, 0.21), tint_mix=0.6, rough=0.6, metal=0.7, rust=0.7, bio=0.5, silt=0.9, seed=64),
    'lead': dict(scan='rust_coarse', tint=(0.30, 0.31, 0.32), tint_mix=0.92, contrast=0.4, rough=0.62, rough_var=0.15, metal=0.55, wear=0.4, under=((0.62, 0.63, 0.6), 0.35, 0.0), rust=0.0, bio=0.3, silt=0.8, grime=0.9, dirt=0.4, seed=65),
    'crate': dict(scan='rusty_painted_metal', tint=(0.62, 0.46, 0.05), tint_mix=0.9, contrast=0.35, rough=0.5, wear=0.9, chips=0.6, rust=0.6, bio=0.5, silt=0.8, dirt=0.75, grime=1.2, seed=66),
    'chain': dict(scan='rust_coarse', tint=(0.28, 0.2, 0.14), tint_mix=0.5, rough=0.55, metal=0.8, rust=0.8, bio=0.25, silt=0.4, seed=67),
    'decal': dict(scan='shutter', image=None, rough=0.55, rough_var=0.15, grime=0.5, silt=0.45, bio=0.3, rust=0.3, dirt=0.5, bump=0.15, image_mix=0.8, seed=68),
}
GROUPS = {
    'main': dict(res=2048),
    'crate': dict(res=1024),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
DECALS = {
    'rack': (0.0, 3.2, 2.0, 0.8),       # rack header 1.5 x 0.6
    'load': (2.0, 3.2, 2.0, 0.8),       # load rating 1.0 x 0.4
    'crate': (0.0, 2.0, 2.0, 1.2),      # crate side 0.6 x 0.36
    'crate2': (2.0, 2.0, 2.0, 1.2),
    'tag': (0.0, 1.2, 1.0, 0.7),
    'bay': (1.0, 1.2, 0.6, 0.6),
}


def duv(k):
    x, y, w, h = DECALS[k]
    return (x / 4, y / 4, (x + w) / 4, (y + h) / 4)


def graphic():
    it = []
    yel, blk, wht, red = (0.86, 0.66, 0.08), (0.05, 0.05, 0.05), (0.92, 0.92, 0.88), (0.72, 0.08, 0.06)
    x, y, w, h = DECALS['rack']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.88, 0.87, 0.82)),
           dict(type='rect', xywh=(x, y + h - 0.26, w, 0.26), color=(0.1, 0.2, 0.4)),
           dict(type='text', text='压载物资 B-04', xy=(x + w / 2, y + h - 0.2), size=0.17, align='CENTER', color=wht),
           dict(type='text', text='铅配重块 · 潜器专用', xy=(x + w / 2, y + 0.3), size=0.17, align='CENTER', color=blk),
           dict(type='text', text='BALLAST · LEAD · SUBMERSIBLE USE', xy=(x + w / 2, y + 0.1), size=0.09, align='CENTER', color=(0.25, 0.25, 0.25), font=L.FONT_STENCIL)]
    x, y, w, h = DECALS['load']
    it += [dict(type='rect', xywh=(x, y, w, h), color=yel),
           dict(type='rect', xywh=(x + 0.04, y + 0.04, w - 0.08, h - 0.08), color=blk),
           dict(type='text', text='每层限载 2000 kg', xy=(x + w / 2, y + 0.43), size=0.2, align='CENTER', color=yel),
           dict(type='text', text='MAX 2000 kg / LEVEL', xy=(x + w / 2, y + 0.15), size=0.13, align='CENTER', color=yel, font=L.FONT_STENCIL)]
    for k in ('crate', 'crate2'):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=(0.66, 0.5, 0.05)),
               dict(type='rect', xywh=(x + 0.08, y + 0.08, w - 0.16, h - 0.16), color=(0.75, 0.58, 0.06)),
               dict(type='text', text='配平压载 400 kg' if k == 'crate' else '配平压载 380 kg', xy=(x + w / 2, y + 0.62), size=0.28, align='CENTER', color=blk),
               dict(type='text', text='TRIM BALLAST · Pb', xy=(x + w / 2, y + 0.26), size=0.2, align='CENTER', color=blk, font=L.FONT_STENCIL)]
        for c in range(6):
            x0 = x + w - 0.5 + c * 0.1
            it.append(dict(type='poly', pts=[(x0, y), (x0 + 0.05, y), (x0 + 0.13, y + 0.16), (x0 + 0.08, y + 0.16)], color=blk))
    x, y, w, h = DECALS['tag']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.9, 0.88, 0.8)),
           dict(type='text', text='出库登记', xy=(x + 0.5, y + 0.52), size=0.11, align='CENTER', color=blk),
           dict(type='line', pts=[(x + 0.08, y + 0.42), (x + 0.92, y + 0.42)], w=0.006, color=blk),
           dict(type='line', pts=[(x + 0.08, y + 0.28), (x + 0.92, y + 0.28)], w=0.006, color=blk),
           dict(type='line', pts=[(x + 0.08, y + 0.14), (x + 0.92, y + 0.14)], w=0.006, color=blk),
           dict(type='text', text='4/12  2×400', xy=(x + 0.1, y + 0.31), size=0.08, align='LEFT', color=(0.1, 0.15, 0.35)),
           dict(type='text', text='4/19  1×380', xy=(x + 0.1, y + 0.17), size=0.08, align='LEFT', color=(0.1, 0.15, 0.35))]
    x, y, w, h = DECALS['bay']
    it += [dict(type='rect', xywh=(x, y, w, h), color=wht),
           dict(type='text', text='B2', xy=(x + w / 2, y + 0.16), size=0.3, align='CENTER', color=blk, font=L.FONT_STENCIL)]
    return L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))


def ingot(l=0.3, w=0.11, h=0.09):
    """Trapezoid lead ingot, long axis +X, base at y=0."""
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2 - 0.018, h), (-w / 2 + 0.018, h)]
    bm = L.prism(pts, l, bevel=0.006, segs=1)
    L.transform(bm, L.M((0, 0, 0), (0, 90, 0)))
    return bm


def ingot_stack(part, base, nx, nz, layers, kind='lead', jitter=0.01, skip=0.0):
    for ly in range(layers):
        rot = ly % 2
        for i in range(nx):
            for j in range(nz):
                if rng.random() < skip * (ly / max(1, layers - 1)):
                    continue
                if rot:
                    p = base + Vector((-0.15 + j * 0.3 / max(1, nz - 1) * 0 + (j - (nz - 1) / 2) * 0.32, ly * 0.09, (i - (nx - 1) / 2) * 0.12))
                    m = L.M(tuple(p + Vector((rng.uniform(-jitter, jitter), 0, rng.uniform(-jitter, jitter)))), (0, rng.uniform(-3, 3), 0))
                else:
                    p = base + Vector(((i - (nx - 1) / 2) * 0.12, ly * 0.09, (j - (nz - 1) / 2) * 0.32))
                    m = L.M(tuple(p + Vector((rng.uniform(-jitter, jitter), 0, rng.uniform(-jitter, jitter)))), (0, 90 + rng.uniform(-3, 3), 0))
                part.add(ingot(), m, kind)


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(115.5, 0, 32.5), front='-X',
                notes="Free-standing ballast rack in R4. 'ballast-crate' is the removable manipulator target (lift by its bail).")
    KINDS['decal']['image'] = graphic()
    rack = A.part('ballast-rack')
    crate = A.part('ballast-crate', origin=tuple(CRATE), group='crate')
    stn = A.part('stencils', group='decals')

    H = TOP - FLOOR
    for z in ZS:
        for x in (XF, XB):
            rack.add(L.box(0.09, H, 0.08, bevel=0.008), L.M((x, FLOOR + H / 2, z)), 'upright')
            rack.add(L.box(0.2, 0.012, 0.18, bevel=0.003), L.M((x, FLOOR + 0.006, z)), 'steel')
            for s in (-1, 1):
                rack.add(L.bolt(0.012, 0.02, segs=6, wsegs=8), L.M((x + s * 0.07, FLOOR + 0.012, z + s * 0.06)), 'steel')
            face = -1 if x == XF else 1
            for k in range(int(H / 0.1) - 1):
                rack.add(L.box(0.004, 0.05, 0.022, bevel=0.0), L.M((x + face * 0.044, FLOOR + 0.1 + k * 0.1, z)), 'steel')
        # side frame bracing
        y = FLOOR + 0.25
        rack.add(L.box(XB - XF, 0.035, 0.03, bevel=0.004), L.M((XM, y, z)), 'upright')
        while y < TOP - 0.9:
            y2 = y + 0.85
            m, ln = L.axis_to((XF + 0.04, y, z), (XB - 0.04, y2, z))
            rack.add(L.box(0.035, ln, 0.03, bevel=0.004), m @ L.M((0, ln / 2, 0)), 'upright')
            rack.add(L.box(XB - XF, 0.035, 0.03, bevel=0.004), L.M((XM, y2, z)), 'upright')
            y = y2
    # step beams and decks
    for bi, by in enumerate(BEAMS):
        for k in range(3):
            za, zb = ZS[k], ZS[k + 1]
            for x in (XF, XB):
                rack.add(L.box(0.06, 0.12, zb - za - 0.08, bevel=0.01), L.M((x, by - 0.06, (za + zb) / 2)), 'beam')
                for zz in (za + 0.07, zb - 0.07):
                    rack.add(L.box(0.065, 0.16, 0.04, bevel=0.004), L.M((x, by - 0.07, zz)), 'steel')
            if bi == 1 and k == 1:
                deck_w = zb - za - 0.1
                for xx in (XF + 0.1, XM, XB - 0.1):
                    rack.add(L.box(0.05, 0.05, deck_w, bevel=0.006), L.M((xx, by - 0.025, (za + zb) / 2)), 'deck')
                for t in range(14):
                    rack.add(L.box(XB - XF - 0.04, 0.012, 0.03, bevel=0.0), L.M((XM, by + 0.006, za + 0.1 + t * (deck_w - 0.05) / 13)), 'deck')
            else:
                nb = 3 if bi else 4
                for t in range(nb):
                    zz = za + 0.1 + t * (zb - za - 0.2) / (nb - 1)
                    rack.add(L.box(XB - XF + 0.02, 0.04, 0.05, bevel=0.005), L.M((XM, by - 0.02, zz)), 'deck')
                rack.add(L.box(XB - XF - 0.06, 0.008, zb - za - 0.12, bevel=0.0), L.M((XM, by + 0.004, (za + zb) / 2)), 'deck')
    # top hoist rail cantilevered off the front uprights, trolley parked over the crate (rail bottom y 1.6:
    # above the hull band of a pod parked at y 0)
    rack.add(L.box(0.1, 0.18, ZS[-1] - ZS[0] + 0.8, bevel=0.012), L.M((HX, TOP + 0.09, 0)), 'beam')
    for z in (ZS[0], ZS[-1]):
        rack.add(L.box(XF - HX + 0.05, 0.08, 0.08, bevel=0.01), L.M(((XF + HX) / 2, TOP + 0.04, z)), 'upright')
    tro = Vector((HX, TOP - 0.05, CRATE.z))
    rack.add(L.box(0.28, 0.16, 0.3, bevel=0.03), L.M(tuple(tro)), 'beam')
    for s in (-1, 1):
        rack.add(L.cyl(0.05, 0.03, segs=16), L.M(tuple(tro + Vector((s * 0.09, 0.12, 0.0))), (0, 0, 90)), 'steel')
    rack.add(L.lathe([(0, 0), (0.12, 0), (0.13, 0.04), (0.13, 0.26), (0.12, 0.3), (0, 0.3)], segs=24), L.M(tuple(tro + Vector((0, -0.42, 0))), (0, 0, 0)), 'beam')
    # load chain from the hoist block down to the hook through the crate bail (bail apex = anchor 'crate-bail')
    bail_top = CRATE.y + CH / 2 + 0.05 + CW / 2 - 0.05
    y = tro.y - 0.46
    while y > bail_top + 0.16:
        rack.add(L.torus(0.028, 0.008, segu=10, segv=5), L.M((tro.x + 0.006 * math.sin(y * 9.0), y, tro.z), (0, 90 * (round(y / 0.042) % 2), 90)), 'chain')
        y -= 0.042
    hook = Vector((tro.x, bail_top + 0.05, tro.z + 0.02))
    rack.add(L.torus(0.06, 0.016, segu=20, segv=8, arc=math.radians(260)), L.M(tuple(hook), (0, 0, 90)), 'steel')
    rack.add(L.cyl(0.018, 0.08, segs=10), L.M(tuple(hook + Vector((0, 0.09, 0)))), 'steel')
    # chain draped on lower beam
    for k in range(26):
        t = k / 25
        rack.add(L.torus(0.028, 0.008, segu=10, segv=5), L.M((XF - 0.05, BEAMS[0] + 0.02 - 0.35 * math.sin(t * math.pi), -2.3 + t * 1.3), (90 * (k % 2), 0, 0)), 'chain')
    # lead ingot stacks: bottom (bays 1,3), top shelf partial
    ingot_stack(rack, Vector((XM - 0.1, BEAMS[0] + 0.008, -1.6)), 6, 3, 4)
    ingot_stack(rack, Vector((XM - 0.1, BEAMS[0] + 0.008, 1.6)), 6, 3, 3, skip=0.4)
    ingot_stack(rack, Vector((XM + 0.05, BEAMS[2] + 0.008, -1.6)), 5, 2, 2, skip=0.5)
    ingot_stack(rack, Vector((XM + 0.05, BEAMS[0] + 0.008, 0.0)), 6, 3, 2, skip=0.25)
    # a spare crate on the top shelf (static)
    sc_ = Vector((XM + 0.05, BEAMS[2] + CH / 2 + 0.01, 1.55))
    # floor spill: a few ingots in silt under the hanging crate
    for i in range(7):
        rack.add(ingot(), L.M((-0.95 - rng.uniform(0, 0.9), FLOOR + (0.0 if i % 3 else 0.09), rng.uniform(-1.8, 2.0)), (0, rng.uniform(0, 180), 0 if i % 3 else 0)), 'lead')

    def crate_geo(part, c, decal_key, shelf_rot=0.0, kind='crate', target=None):
        R = L.M(tuple(c), (0, shelf_rot, 0))
        hx, hy, hz = CW / 2, CH / 2, CD / 2
        e = 0.035
        for sx in (-1, 1):
            for sz in (-1, 1):
                part.add(L.box(e, CH, e, bevel=0.006), R @ L.M((sx * (hx - e / 2), 0, sz * (hz - e / 2))), kind)
        for sy in (-1, 1):
            for sz in (-1, 1):
                part.add(L.box(CW, e, e, bevel=0.006), R @ L.M((0, sy * (hy - e / 2), sz * (hz - e / 2))), kind)
            for sx in (-1, 1):
                part.add(L.box(e, e, CD, bevel=0.006), R @ L.M((sx * (hx - e / 2), sy * (hy - e / 2), 0)), kind)
        part.add(L.box(CW - 0.02, 0.01, CD - 0.02, bevel=0.0), R @ L.M((0, -hy + 0.008, 0)), kind)
        for sx in (-1, 1):     # slatted ends
            for t in range(3):
                part.add(L.box(0.012, 0.07, CD - 0.06, bevel=0.003), R @ L.M((sx * (hx - 0.012), -hy + 0.1 + t * 0.15, 0)), 'steel')
        for sz in (-1, 1):     # solid stencilled sides
            part.add(L.box(CW - 0.06, CH - 0.07, 0.01, bevel=0.002), R @ L.M((0, 0, sz * (hz - 0.012))), kind)
            stn_m = R @ L.M((0, 0, sz * (hz - 0.004)), (0, 0 if sz > 0 else 180, 0))
            (target or stn).add(L.panel_uv(0.6, 0.36, 0.003, duv(decal_key)), stn_m, 'decal')
        for i in range(6):     # ingots inside, visible through the open top
            for j in range(2):
                part.add(ingot(), R @ L.M(((i - 2.5) * 0.12, -hy + 0.015, (j - 0.5) * 0.32), (0, 90, 0)), 'lead')
                part.add(ingot(), R @ L.M(((i - 2.5) * 0.12, -hy + 0.105, (j - 0.5) * 0.32), (0, 90, 0)), 'lead')
        # lifting bail across the long axis + lugs
        for sx in (-1, 1):
            part.add(L.box(0.05, 0.08, 0.06, bevel=0.01), R @ L.M((sx * (hx - 0.05), hy + 0.03, 0)), 'steel')
        part.add(L.torus(hx - 0.05, 0.016, segu=28, segv=8, arc=math.pi), R @ L.M((0, hy + 0.05, 0), (90, 0, 0)), 'steel')

    cstn = A.part('ballast-crate-stencils', origin=tuple(CRATE), group='decals', parent='ballast-crate')
    crate_geo(crate, CRATE, 'crate', target=cstn)
    crate_geo(rack, sc_, 'crate2', shelf_rot=4.0, kind='crate')
    # signage
    stn.add(L.panel_uv(1.5, 0.6, 0.004, duv('rack')), L.M((XF - 0.05, TOP - 0.5, -1.6), (0, -90, 0)), 'decal')
    stn.add(L.panel_uv(1.0, 0.4, 0.004, duv('load')), L.M((XF - 0.035, BEAMS[1] - 0.06, 1.6), (0, -90, 0)), 'decal')
    stn.add(L.panel_uv(0.2, 0.14, 0.003, duv('tag')), L.M((XF - 0.035, BEAMS[1] - 0.06, -0.55), (0, -90, 6)), 'decal')
    stn.add(L.panel_uv(0.12, 0.12, 0.003, duv('bay')), L.M((XF - 0.035, BEAMS[1] - 0.06, 0.0), (0, -90, 0)), 'decal')

    A.anchor('ballast-crate', tuple(CRATE))
    A.anchor('crate-bail', (0.0, CRATE.y + CH / 2 + 0.05 + CW / 2 - 0.05, 0.0))
    A.anchor('pod-park', (-3.4, -0.6, 0.0))
    wall = [((4.75, 1.0, 0), (0.5, 8.0, 12.0)), ((0, FLOOR - 0.25, 0), (12.0, 0.5, 12.0))]
    rep = A.finish(preview_cfg=dict(view=(-1.0, 0.3, -0.55), fov=40, focus=(0, -0.6, 0), radius=4.0, backdrop=wall,
                                    dark_lights=[(L.b((-2.5, 1.5, 3.5)), 60, (1.0, 0.5, 0.15))],
                                    extra_views={'-crate': dict(view=(-1.0, 0.45, 0.35), focus=tuple(CRATE), radius=0.9)}))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
