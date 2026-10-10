"""Lumen (趋光者): pale, emaciated, upright deep-sea drifter for the level-two laundry, observation gallery and atrium.

Faces local +Z, up +Y (procedural fallback convention). It is an animal, not a person: a narrow ribbed trunk
with sunken flanks, long thin forelimbs ending in three fused feeler digits, a smooth faceless elongated head
with sealed slits, a glowing lure on an arching crown stalk and a translucent veined body curtain with
trailing tendrils. Far-read silhouette: (1) narrow ribbed trunk + shoulders above a wide bell curtain,
(2) ragged curtain hem + tendrils trailing ~2 m below, (3) lure stalk arching forward over the head with the
brightest point in frame, (4) long forelimbs hanging forward.

Run: D:/blender/blender.exe -b --factory-startup --python-exit-code 1 -P tools/blender/build-living-creature-lumen.py
"""
import importlib.util, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('creature_common', os.path.join(HERE, 'build-living-creature-common.py'))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
import bpy
from mathutils import Vector, kdtree

NAME = 'lumen'
GEN = C.GENROOT / f'creature-{NAME}'
ZS = .7                                   # trunk depth / width
SHOULDER, ELBOW, WRIST, TIP = (.19, .72, 0), (.27, .36, .1), (.25, .02, .26), (.235, -.22, .34)
NECK0, NECK1, HEADTOP = (0, .74, -.01), (0, .95, -.035), (0, 1.2, -.05)
LURE = np.array([(0, 1.17, -.05), (0, 1.33, -.02), (0, 1.42, .12), (0, 1.38, .32), (0, 1.24, .45), (0, 1.11, .48)])
BULB = np.array([0, 1.065, .48])
NK = 8                                    # curtain bone chains
CH_R = [.1, .28, .48, .72, .9]
CH_Y = [.3, -.2, -.8, -1.55, -2.3]


def r_trunk(y):
    y = np.asarray(y, dtype=np.float64)
    t = np.clip((y - .1) / .68, 0, 1)
    torso = .07 + np.sin(t * np.pi * .92) * .12 - np.maximum(0, t - .85) * .7
    low = .055 + np.clip((y + .35) / .45, 0, 1) * .015
    return np.maximum(.035, np.where(y < .1, low, torso))


def arm(sd):
    return [np.array(p) * np.array([sd, 1, 1]) for p in (SHOULDER, ELBOW, WRIST, TIP)]


def blockout():
    ys = np.linspace(-.35, .8, 160)
    path = np.stack([np.zeros_like(ys), ys, np.zeros_like(ys)], 1)
    r = r_trunk(ys)
    parts = [C.tube(path, r * ZS, r, seg=64)]
    parts.append(C.ellipsoid((0, .705, -.005), (.17, .09, .095)))
    for sd in (-1, 1):
        parts.append(C.tube(np.linspace([sd * .02, .8, -.01], [sd * .19, .72, 0], 10), np.linspace(.032, .04, 10), seg=20))
        parts.append(C.ellipsoid((sd * .17, .72, 0), (.05, .055, .05)))
    parts.append(C.tube(np.linspace(NECK0, NECK1, 12), np.linspace(.045, .034, 12), seg=24))
    parts.append(C.ellipsoid((0, 1.05, -.02), (.072, .145, .1), (-.15, 0, 0)))
    parts.append(C.ellipsoid((0, 1.13, -.09), (.03, .12, .11), (-.55, 0, 0)))
    parts.append(C.ellipsoid((0, .99, .02), (.04, .055, .055), (.2, 0, 0)))
    for sd in (-1, 1):
        parts.append(C.ellipsoid((sd * .05, 1.02, .0), (.03, .1, .07), (-.2, 0, sd * .15)))
        S, E, W, T = arm(sd)
        parts.append(C.tube(np.linspace(S, E, 14), np.linspace(.036, .027, 14), seg=20))
        parts.append(C.tube(np.linspace(E, W, 14), np.linspace(.027, .019, 14), seg=20))
        parts.append(C.ellipsoid(E, (.038, .048, .038)))
        parts.append(C.ellipsoid(W, (.027, .026, .025)))
        palm = W + np.array([sd * -.005, -.045, .02])
        parts.append(C.ellipsoid(palm, (.026, .05, .017), (.45, 0, 0)))
        for f in range(3):
            k0 = palm + np.array([sd * (-.012 + f * .013), -.04, .01])
            k1 = k0 + np.array([sd * (-.004 + f * .006), -.1, .035])
            k2 = k1 + np.array([sd * (-.004 + f * .008), -.11, .03 + f * .004])
            p = np.array([k0 + (k1 - k0) * t for t in np.linspace(0, 1, 6)] + [k1 + (k2 - k1) * t for t in np.linspace(.2, 1, 6)])
            parts.append(C.tube(p, np.linspace(.0095, .0035, len(p)), seg=12))
    for c, rr in (((.045, -.12, .0), (.05, .2, .05)), ((-.045, -.14, .01), (.048, .2, .048)), ((0, -.3, -.02), (.04, .18, .04))):
        parts.append(C.ellipsoid(c, rr))
    return C.merge(parts)


def arm_dist(P):
    out = np.full(len(P), 9.0)
    for sd in (-1, 1):
        S, E, W, T = arm(sd)
        for a, b in ((S, E), (E, W), (W, T)):
            ab = b - a
            t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
            out = np.minimum(out, np.linalg.norm(P - (a + t[:, None] * ab), axis=1))
    return out


def macro(P, N, ctx):
    x, y, z = P.T
    zz = z / ZS
    ph = np.arctan2(x, zz)
    front, side, back = np.maximum(0, np.cos(ph)), np.abs(np.sin(ph)), np.maximum(0, -np.cos(ph))
    dp = np.abs(np.abs(ph) - np.pi)
    bell = lambda v, c, w: np.exp(-((v - c) / w) ** 2)
    k = np.ones(len(P))
    rib = (y > .33) & (y < .67)
    k -= .07 * (.5 - .5 * np.cos((y - .62) / .07 * np.pi * 2)) ** 1.5 * np.maximum(front, side * .6) * (1 - back) * rib
    k -= .26 * front * bell(y, .22, .09)
    k += .07 * bell(ph, 0, .16) * ((y > .42) & (y < .74))
    k -= .12 * bell(dp, 0, .18) * C.sstep(.12, .3, y)
    k += .05 * bell(dp, 0, .07) * np.maximum(0, np.sin(y / .036 * np.pi * 2)) * C.sstep(.12, .3, y)
    k -= .07 * side * front * bell(y, .7, .03)
    k -= .05 * back * side * bell(y, .58, .08)
    da = arm_dist(P)
    torso = C.sstep(.05, .08, da) * C.sstep(.05, .12, y) * (1 - C.sstep(.76, .8, y))
    rr = np.sqrt(x * x + zz * zz) * ZS ** .5
    d = (k - 1) * rr * torso
    for sd in (-1, 1):
        q = np.array([sd * .034, 1.1, .092])
        dd = P - q
        d += -.006 * np.exp(-(dd[:, 0] / .022) ** 2 - (dd[:, 1] / .0035) ** 2 - (dd[:, 2] / .03) ** 2)
    limb = C.sstep(.05, .03, da)
    d += .0015 * np.sin(P @ np.array([0, 140, 0]) + C.fbm(P * 20, 2, seed=3) * 5) * limb * C.sstep(.6, .3, y) * (y > -.1)
    d += (C.fbm(P * 9, 3, seed=6) - .5) * .004
    ctx.update(slit=np.maximum(*[np.exp(-((P - np.array([sd * .034, 1.1, .092])) ** 2 / np.array([.02, .004, .03]) ** 2).sum(1)) for sd in (-1, 1)]), limb=limb, torso=torso, ribs=rib * front)
    return d


def micro(P, N, ctx):
    d = .0007 * C.ridged(P * 9, 4, seed=13)
    d += -.0006 * C.ridged(P * np.array([60, 25, 60]), 3, seed=17)
    d += (C.fbm(P * 140, 2, seed=5) - .5) * .00035
    tips = C.sstep(-.05, -.15, P[:, 1]) * ctx['limb']
    d += -.0008 * np.abs(np.sin(P[:, 1] * 900)) * tips
    vein = C.ridged(P * 7, 4, seed=13)
    slit = ctx['slit']
    ridge, halo, fresh = C.scar_field(P, N, 505, 14, length=(.04, .16), width=(.002, .006), weight=(1 - slit) * (.3 + ctx['torso']))
    d += .0011 * ridge * (1 - fresh) - .0013 * fresh - .0004 * halo * (1 - ridge)
    ph, cover, crater = C.parasite_field(P, N, 606, 6, rad=(.005, .012), weight=(1 - slit) * (C.gauss(P[:, 1] - .2, .25) + .2 * ctx['limb']) + 1e-4)
    d += ph
    ctx.update(vein=vein, ridge=ridge, halo=halo, fresh=fresh, cover=cover, crater=crater)
    return d


def photophores(P):
    pts = []
    for sd in (-1, 1):
        pts += [(sd * (.04 + i * .033), .757 - i * .006, .085) for i in range(5)]
        S, E, W, T = arm(sd)
        pts += [tuple(E + (W - E) * t + np.array([0, 0, .02])) for t in np.linspace(.1, .9, 6)]
        pts += [(sd * .034, 1.1, .095)]
    pts += [(math.sin(i * 1.7) * .02, .7 - i * .07, .11) for i in range(8)]
    rng = np.random.default_rng(9)
    for _ in range(46):
        a = rng.random() * 2 * np.pi
        y = .55 + rng.random() * .65
        pts.append((math.sin(a) * .2, y, math.cos(a) * .2))
    kd = kdtree.KDTree(len(P))
    for i, p in enumerate(P):
        kd.insert(p, i)
    kd.balance()
    snapped = []
    for p in pts:
        co, idx, dist = kd.find(p)
        if dist < .06:
            snapped.append((np.array(co), .007 if len(snapped) < 33 else .0045))
    e = np.zeros(len(P))
    for c, r in snapped:
        e = np.maximum(e, np.exp(-(np.linalg.norm(P - c, axis=1) / r) ** 2))
    return e


def shade_vertex(P, curv, ctx):
    x, y, z = P.T
    PAL, mix = C.PAL, C.mix
    warp = (C.fbm(P * 2.5, 3, seed=40) - .5)[:, None]
    # grey-violet gelatinous hide; sooty blotches; thin extremities and the rib field go translucent off-white
    col = np.repeat(np.array([.042, .038, .044])[None], len(P), 0) * (.75 + .5 * C.fbm(P * 8, 3, seed=43))[:, None]
    big = C.sstep(.44, .62, C.fbm(P * 3.2 + warp, 4, seed=41))
    col = mix(col, PAL['soot'], big * .8)
    thin = np.clip(ctx['limb'] * C.sstep(.3, -.2, y) + C.sstep(.55, .8, C.fbm(P * 5 + warp, 3, seed=42)) * .6, 0, 1)
    col = mix(col, PAL['rot'] * 1.3, thin * .7)
    marb = C.sstep(.55, .85, ctx['vein'])
    col = mix(col, np.array([.012, .02, .02]), marb * .6)
    ribs = ctx['ribs'] * C.sstep(.2, .6, ctx['torso'])
    col = mix(col, np.array([.1, .095, .088]), ribs * C.sstep(.5, .35, curv) * .5)
    col = mix(col, PAL['scar'], ctx['ridge'] * (1 - ctx['fresh']) * .7)
    col = mix(col, PAL['wound'], ctx['fresh'] * .85)
    col = mix(col, PAL['crust'], ctx['cover'])
    col = mix(col, np.array([.012, .01, .008]), ctx['crater'] * .9)
    cav = C.sstep(.55, .88, curv)
    col *= (1 - .6 * cav)[:, None]
    col *= (1 + .2 * C.sstep(.5, .2, curv))[:, None]
    col = mix(col, np.array([.01, .014, .014]), ctx['slit'])
    emit = np.clip(photophores(P) + ctx['slit'] * .7, 0, 1)
    col = mix(col, np.array([.03, .07, .075]), emit * .6)
    rough, wet = C.wet_rough(P * 2.2, 90, wet_bias=.04, cav=curv, extra_wet=thin * .6 + emit,
                             extra_dry=np.clip(ctx['cover'] + ctx['ridge'] * .7, 0, 1))
    return col, rough, emit


def labels(cen, nrm):
    x, y, z = cen.T
    side = (x > 0).astype(int)
    front = (nrm[:, 2] > 0).astype(int)
    lab = np.zeros(len(cen), dtype=int)
    da = np.full(len(cen), 9.0)
    seg_id = np.zeros(len(cen), dtype=int)
    for si, sd in enumerate((-1, 1)):
        S, E, W, T = arm(sd)
        for k, (a, b) in enumerate(((S, E), (E, W), (W, T))):
            ab = b - a
            t = np.clip(((cen - a) @ ab) / (ab @ ab), 0, 1)
            d = np.linalg.norm(cen - (a + t[:, None] * ab), axis=1)
            m = d < da
            da[m] = d[m]
            seg_id[m] = si * 3 + k
    r = np.sqrt(x * x + (z / ZS) ** 2)
    is_arm = (da < .05) & (r > r_trunk(y) * .95)
    lab[:] = np.searchsorted([.1, .45, .76, .93], y) * 4 + side * 2 + (z > 0)
    lab[is_arm] = 40 + seg_id[is_arm] * 2 + front[is_arm]
    return lab


def curtain():
    NY, NA = 44, 72
    V, UV, F = [], [], []
    for i in range(NY + 1):
        t = i / NY
        y = .32 - t * 1.87
        base = .1 + t ** 1.35 * .62
        for j in range(NA + 1):
            a = j / NA * 2 * np.pi
            pleat = 1 + math.sin(a * 10) * .07 * t + math.sin(a * 3 + 1) * .05 * t + math.sin(a * 23) * .015 * t * t
            rr = base * pleat
            V.append((math.sin(a) * rr, y + math.sin(a * 7) * .04 * t * t, math.cos(a) * rr * .85))
            UV.append((j / NA, t))
    F = C._grid_faces(NA, NY)
    return np.array(V), F, np.array(UV)


def tendrils():
    rng = np.random.default_rng(14)
    parts = []
    for i in range(14):
        a = i / 14 * 2 * np.pi + rng.random() * .3
        d0, ln = .04 + rng.random() * .05, 1.4 + rng.random() * 1.0
        ctrl = np.array([[math.sin(a) * d0, .05, math.cos(a) * d0],
                         [math.sin(a) * (d0 + .08), .05 - ln * .35, math.cos(a) * (d0 + .08)],
                         [math.sin(a) * (d0 + .15 + rng.random() * .2), .05 - ln * .7, math.cos(a) * (d0 + .15 + rng.random() * .2)],
                         [math.sin(a) * (d0 + .2 + rng.random() * .3), .05 - ln, math.cos(a) * (d0 + .2 + rng.random() * .3)]])
        t = np.linspace(0, 1, 27)
        idx = np.minimum((t * 3).astype(int), 2)
        f = t * 3 - idx
        p = ctrl[idx] * (1 - f[:, None]) + ctrl[idx + 1] * f[:, None]
        for _ in range(3):
            p[1:-1] = (p[:-2] + p[1:-1] * 2 + p[2:]) / 4
        p += np.stack([np.sin(t * 9 + i) * .02 * t, np.zeros_like(t), np.cos(t * 7 + i) * .02 * t], 1)
        parts.append(C.tube(p, np.linspace(.02 + rng.random() * .01, .002, len(p)), seg=6))
    return C.merge(parts)


def frill():
    """Soft dorsal membrane from the crown down the neck and spine: base on the midline, edge swept back."""
    nu, nv = 90, 6
    s = np.linspace(0, 1, nu + 1)
    base = np.stack([np.zeros_like(s), 1.2 - s * .78, -.075 - np.sin(s * np.pi) * .06 + s * .02], 1)
    base[:, 2] -= np.interp(base[:, 1], [.4, .7, .95, 1.2], [.07, .03, .0, .0])
    h = (.035 + np.sin(s * np.pi) ** .7 * .09) * (1 + np.sin(s * 70) * .08) * C.sstep(0, .06, s) * C.sstep(1, .9, s)
    V, UV = [], []
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            off = np.array([math.sin(s[i] * 41 + v * 2) * .012 * v * v, h[i] * v * .25, -h[i] * v])
            V.append(base[i] + off)
            UV.append((s[i], v))
    return np.array(V), C._grid_faces(nu, nv), np.array(UV)


def curtain_textures():
    U, Vv = C.uv_grid(1024, 1024)
    n = C.tile_noise(U, Vv, 8, 4, 3)
    n2 = C.tile_noise(U, Vv, 22, 3, 13)
    warp = C.tile_noise(U, Vv, 4, 3, 5)
    vein = (1 - np.abs(np.sin(np.pi * (U * 18 + warp * 1.5)))) ** 16
    vein2 = (1 - np.abs(np.sin(np.pi * (U * 54 + warp * 4 + Vv * 2)))) ** 20 * C.sstep(.3, .7, Vv)
    v = np.maximum(vein, vein2 * .6)
    col = np.stack([.075 + v * .05, .09 + v * .07, .088 + v * .07], -1) * (1 - .25 * Vv[..., None]) * (.8 + .4 * n[..., None])
    a = (.62 - .25 * C.sstep(.1, .7, Vv) + .25 * v) * (1 - C.sstep(.86, .97, Vv + (n - .5) * .22))
    a *= 1 - C.sstep(.62, .7, n2) * C.sstep(.45, .9, Vv) * .95
    C.save_png(GEN / 'curtain_color.webp', np.concatenate([C.lin2srgb(col * .35), np.clip(a, 0, 1)[..., None]], -1), quality=92)
    e = (v * C.sstep(.1, .5, Vv) * (1 - C.sstep(.85, .97, Vv)))[..., None] * np.array([.35, .85, .95])
    C.save_png(GEN / 'curtain_emit.webp', C.lin2srgb(C.resize(e, 512)), quality=92)


def build():
    C.begin(NAME)
    GEN.mkdir(parents=True, exist_ok=True)
    V, F = blockout()
    hi = C.mesh_obj('lumen_high', V, F)
    C.remesh(hi, .01, smooth=7)
    C.remesh(hi, .0026, smooth=2)
    ctx = {}
    C.displace(hi, macro, ctx)
    lo = C.copy_obj(hi, 'body')
    C.decimate(lo, 20000)
    C.seam_unwrap(lo, labels)
    C.displace(hi, micro, ctx)
    P, _ = C.arrays(hi)
    curv = C.curvature(hi)
    col, rough, emit = shade_vertex(P, curv, ctx)
    C.set_attr(hi, 'alb', col)
    C.set_attr(hi, 'rough', rough)
    C.set_attr(hi, 'curv', curv)
    C.set_attr(hi, 'emit', emit)
    C.log('high tris', C.tris(hi), 'low tris', C.tris(lo))
    maps = C.bake(lo, hi, GEN, res=2048, ext=.008, maxd=.025, ao_dist=.15, thick_dist=.035)
    tex = C.save_skin_maps(GEN, maps, emit_tint=(.45, .92, 1.0), reflectance=.2)
    me = hi.data
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.data.meshes.remove(me)
    C.assign(lo, C.material('creature_lumen_skin', tex['color'], tex['orm'], tex['normal'], tex['emit'], emit_strength=1.0))

    cV, cF, cUV = curtain()
    co = C.mesh_obj('curtain', cV, cF, cUV)
    curtain_textures()
    C.assign(co, C.material('creature_lumen_curtain', GEN / 'curtain_color.webp', emit=GEN / 'curtain_emit.webp', alpha=True, rough=.35, double=True))
    tV, tF = tendrils()
    to = C.mesh_obj('tendrils', tV, tF)
    C.assign(to, C.material('creature_lumen_tendril', base=(.012, .015, .015), rough=.35, emit_color=(.006, .024, .027), emit_strength=1.0))
    fV, fF, fUV = frill()
    fo = C.mesh_obj('frill', fV, fF, fUV)
    C.fin_texture(GEN / 'frill_color.webp', base=(.03, .032, .034), ray=(.06, .062, .06), tip=(.04, .06, .062), alpha=.7, rays=40, size=(1024, 128), seed=11)
    C.assign(fo, C.material('creature_lumen_frill', GEN / 'frill_color.webp', alpha=True, rough=.4, double=True))
    t = np.linspace(0, 1, 30)
    idx = np.minimum((t * (len(LURE) - 1)).astype(int), len(LURE) - 2)
    f = t * (len(LURE) - 1) - idx
    lp = LURE[idx] * (1 - f[:, None]) + LURE[idx + 1] * f[:, None]
    for _ in range(4):
        lp[1:-1] = (lp[:-2] + lp[1:-1] * 2 + lp[2:]) / 4
    sV, sF = C.tube(lp, np.linspace(.012, .0045, len(lp)), seg=8)
    so = C.mesh_obj('lure_stalk', sV, sF)
    C.assign(so, C.material('creature_lumen_tendril_stalk', base=(.014, .016, .016), rough=.35))
    bV, bF = C.merge([C.ellipsoid(BULB, (.03, .04, .03), (0, 0, 0), 24, 16)] +
                     [C.cone(BULB + np.array([0, -.03, 0]), BULB + np.array([math.sin(a) * .03, -.11 - .02 * math.cos(a * 3), math.cos(a) * .03]), .0025, seg=5, rings=4) for a in np.linspace(0, 2 * np.pi, 5, endpoint=False)])
    bo = C.mesh_obj('lure', bV, bF)
    C.assign(bo, C.material('creature_lumen_lure', base=(.08, .12, .12), rough=.2, emit_color=(.72, .98, 1.0), emit_strength=1.4))

    # rig
    bones = [('root', (0, .1, 0), (0, .3, 0), None), ('spine', (0, .3, 0), (0, .55, 0), 'root'),
             ('chest', (0, .55, 0), (0, .76, 0), 'spine'), ('neck', NECK0, NECK1, 'chest'), ('head', NECK1, HEADTOP, 'neck'),
             ('lure1', tuple(LURE[0]), tuple(LURE[2]), 'head'), ('lure2', tuple(LURE[2]), tuple(LURE[4]), 'lure1'), ('lure3', tuple(LURE[4]), tuple(BULB), 'lure2')]
    for tag, sd in (('L', 1), ('R', -1)):
        S, E, W, T = arm(sd)
        bones += [(f'clav.{tag}', (sd * .03, .74, 0), tuple(S), 'chest'), (f'upper.{tag}', tuple(S), tuple(E), f'clav.{tag}'),
                  (f'fore.{tag}', tuple(E), tuple(W), f'upper.{tag}'), (f'hand.{tag}', tuple(W), tuple(T), f'fore.{tag}')]
    ang = [k / NK * 2 * np.pi for k in range(NK)]
    jp = lambda a, j: (math.sin(a) * CH_R[j], CH_Y[j], math.cos(a) * CH_R[j] * .85)
    for k, a in enumerate(ang):
        for j in range(4):
            bones.append((f'skirt{k}.{j}', jp(a, j), jp(a, j + 1), f'skirt{k}.{j - 1}' if j else 'root'))
    arm_o = C.armature('lumen_rig', bones)
    names = [b[0] for b in bones]
    bi = {n: i for i, n in enumerate(names)}

    def body_w(Pm):
        W = np.zeros((len(Pm), len(names)))
        Jy = [.1, .3, .55, .76, .95, 1.2]
        cw = C.chain_weights(np.interp(Pm[:, 1], Jy, np.arange(6)), 5)
        for c, n in enumerate(['root', 'spine', 'chest', 'neck', 'head']):
            W[:, bi[n]] = cw[:, c]
        segs, sn = [], []
        for tag, sd in (('L', 1), ('R', -1)):
            S, E, Wr, T = arm(sd)
            segs += [((sd * .03, .74, 0), S), (S, E), (E, Wr), (Wr, T)]
            sn += [f'clav.{tag}', f'upper.{tag}', f'fore.{tag}', f'hand.{tag}']
        A = C.normalise_weights(C.seg_weights(Pm, segs, power=6, eps=.01), 3)
        r = np.sqrt(Pm[:, 0] ** 2 + (Pm[:, 2] / ZS) ** 2)
        armness = C.sstep(-.012, .02, r - r_trunk(Pm[:, 1])) * C.sstep(.075, .04, arm_dist(Pm)) * (Pm[:, 1] < .79)
        armness = np.maximum(armness, C.sstep(.12, .2, np.abs(Pm[:, 0])) * (Pm[:, 1] > .66) * (Pm[:, 1] < .8))
        W *= (1 - armness)[:, None]
        for c, n in enumerate(sn):
            W[:, bi[n]] += A[:, c] * armness
        return W

    def skirt_w(Pm):
        W = np.zeros((len(Pm), len(names)))
        a = np.mod(np.arctan2(Pm[:, 0], Pm[:, 2] / .85), 2 * np.pi) / (2 * np.pi) * NK
        k0 = np.floor(a).astype(int) % NK
        k1 = (k0 + 1) % NK
        fa = a - np.floor(a)
        cw = C.chain_weights(np.interp(-Pm[:, 1], [-y for y in CH_Y], np.arange(5)), 4)
        for j in range(4):
            W[np.arange(len(Pm)), [bi[f'skirt{k}.{j}'] for k in k0]] += cw[:, j] * (1 - fa)
            W[np.arange(len(Pm)), [bi[f'skirt{k}.{j}'] for k in k1]] += cw[:, j] * fa
        top = C.sstep(.12, .3, Pm[:, 1])
        W *= (1 - top)[:, None]
        W[:, bi['root']] += top
        return W

    def lure_w(Pm):
        segs = [(NECK1, HEADTOP), (LURE[0], LURE[2]), (LURE[2], LURE[4]), (LURE[4], BULB)]
        A = C.seg_weights(Pm, segs, power=6, eps=.01)
        W = np.zeros((len(Pm), len(names)))
        for c, n in enumerate(['head', 'lure1', 'lure2', 'lure3']):
            W[:, bi[n]] = A[:, c]
        return W

    meshes = [lo, co, to, so, bo, fo]
    for o, fn in ((lo, body_w), (co, skirt_w), (to, skirt_w), (so, lure_w), (bo, lure_w), (fo, body_w)):
        Pm, _ = C.arrays(o)
        C.skin(o, arm_o, names, fn(Pm))

    X, Yv = (1, 0, 0), (0, 1, 0)
    tang = lambda a: (math.cos(a), 0, -math.sin(a))
    two = 2 * math.pi

    def skirt(t, flare, ripple, speed=1, around=1.0):
        out = {}
        for k, a in enumerate(ang):
            for j in range(4):
                ph = two * speed * t - j * .9 + k * around * two / NK * 2
                out[f'skirt{k}.{j}'] = [(tang(a), -flare[j] + ripple[j] * math.sin(ph)), (Yv, ripple[j] * .5 * math.cos(ph + .7))]
        return out

    def drift(t):
        p = skirt(t, [.0, .02, .04, .05], [.04, .07, .1, .14])
        p['root'] = ('loc', (math.sin(two * t) * .012, math.sin(two * t + 1) * .04, 0), [(Yv, .06 * math.sin(two * t)), (X, .03 * math.sin(two * t + 2))])
        p['spine'] = [(X, .03 * math.sin(two * t + .5))]
        p['chest'] = [(X, .025 * math.sin(two * t + 1))]
        p['head'] = [(X, .05 * math.sin(two * t + 1.4)), (Yv, .08 * math.sin(two * t + 3))]
        for tag, sd in (('L', 1), ('R', -1)):
            p[f'upper.{tag}'] = [(X, -.15 + .08 * math.sin(two * t + sd)), ((0, 0, 1), sd * .05 * math.sin(two * t))]
            p[f'fore.{tag}'] = [(X, -.12 + .1 * math.sin(two * t + sd + .8))]
            p[f'hand.{tag}'] = [(X, .15 * math.sin(two * t + sd + 1.6))]
        p['lure1'] = [(X, .05 * math.sin(two * t)), ((0, 0, 1), .04 * math.sin(two * t + 1))]
        p['lure2'] = [(X, .07 * math.sin(two * t + .7))]
        p['lure3'] = [(X, .1 * math.sin(two * t + 1.4)), ((0, 0, 1), .08 * math.sin(two * t + 2))]
        return p

    def swim(t):
        pulse = math.sin(two * t)
        p = skirt(t, [.12 * pulse, .18 * pulse, .2 * pulse, .16 * pulse], [.02, .04, .06, .1], speed=2)
        p['root'] = ('loc', (0, .06 * math.sin(two * t - .6), 0), [(X, .04 * pulse)])
        p['chest'] = [(X, -.04 * pulse)]
        p['head'] = [(X, .06 * math.sin(two * t + .5))]
        for tag, sd in (('L', 1), ('R', -1)):
            p[f'upper.{tag}'] = [(X, -.1 + .12 * pulse), ((0, 0, 1), sd * .1 * (1 + pulse))]
            p[f'fore.{tag}'] = [(X, -.2 + .12 * math.sin(two * t + .6))]
            p[f'hand.{tag}'] = [(X, .2 * math.sin(two * t + 1.2))]
        p['lure1'] = [(X, -.08 * pulse)]
        p['lure3'] = [(X, .15 * math.sin(two * t + 1))]
        return p

    def reach(t):
        e = .85 + .15 * math.sin(two * t)
        tr = math.sin(two * 4 * t)
        p = skirt(t, [.05, .07, .08, .06], [.03, .04, .05, .06 + .02 * tr], speed=3)
        p['root'] = ('loc', (0, .02 * math.sin(two * t), .03), [(X, .12)])
        p['spine'] = [(X, .1 * e)]
        p['chest'] = [(X, .12 * e)]
        p['neck'] = [(X, .15 * e)]
        p['head'] = [(X, .12 * e + .03 * tr)]
        for tag, sd in (('L', 1), ('R', -1)):
            p[f'clav.{tag}'] = [((0, 0, 1), sd * .1 * e)]
            p[f'upper.{tag}'] = [(X, -1.15 * e), ((0, 0, 1), -sd * .15 * e)]
            p[f'fore.{tag}'] = [(X, -.45 * e + .05 * math.sin(two * t * 2 + sd))]
            p[f'hand.{tag}'] = [(X, -.3 * e + .12 * math.sin(two * 3 * t + sd))]
        p['lure1'] = [(X, -.3 * e)]
        p['lure2'] = [(X, -.15 * e)]
        p['lure3'] = [(X, .2 * math.sin(two * 2 * t))]
        return p

    clips = {'drift': 120, 'swim': 60, 'reach': 60}
    for k, fn in (('drift', drift), ('swim', swim), ('reach', reach)):
        C.clip(arm_o, k, clips[k], fn)
    path = C.export(NAME, meshes + [arm_o])
    lod = C.make_lod(NAME, meshes, arm_o, .3, {'curtain': .4, 'tendrils': .4, 'lure_stalk': .5, 'lure': .5, 'frill': .5})
    C.report(NAME, meshes, arm_o, clips, {'skin': {'color': '2048 webp q90 (alpha = thinness)', 'normal': '2048 webp lossless', 'orm': '1024 png', 'emit': '1024 webp'}, 'curtain': {'color': 1024, 'emit': 512}}, path,
             extra=dict(silhouette=['narrow ribbed trunk + shoulders above a wide bell curtain', 'ragged curtain hem with tendrils trailing ~2 m', 'glowing lure arching forward over a faceless head', 'long forelimbs with three feeler digits'],
                        front='+Z', lureTip='bone lure3 tail', lod1=lod))
    C.save_blend(NAME)
    C.preview(NAME, arm_o, (0, .1, 0), 1.75, {'front': (.45, .2, 1.0), 'side': (1, .15, .2)}, [('drift', 1), ('reach', 20)])
    C.preview(NAME, arm_o, (0, .85, .05), .45, {'headclose': (.5, .15, 1.0)}, [('drift', 1)])


C.run(build)
