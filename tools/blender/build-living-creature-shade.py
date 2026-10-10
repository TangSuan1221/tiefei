"""Shade (閬垮厜槌?: 5 m thick-bodied deep-sea eel for the level-two R4 doorway.

Head at local -Z (same as the procedural fallback's body group; the game wraps it in a group turned 180掳).
Far-read silhouette: (1) heavy eel trunk tapering into a ribbon tail under one continuous frilled dorsal fin
plus an anal fin, (2) blunt flattened snout with an underbite and two upward tubular eyes, (3) five gill slits
and fan pectorals behind the head; near read: V-shaped myomeres, pale lateral stripe, mottled back, pale belly.

Run: D:/blender/blender.exe -b --factory-startup --python-exit-code 1 -P tools/blender/build-living-creature-shade.py
"""
import importlib.util, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('creature_common', os.path.join(HERE, 'build-living-creature-common.py'))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
from mathutils import Vector

NAME = 'shade'
L = 5.0
SX = 0.7
GEN = C.GENROOT / f'creature-{NAME}'

def prof(s):
    s = np.asarray(s, dtype=np.float64)
    a = np.where(s < .07, .1 + np.sqrt(np.clip(s, 0, None) / .07) * .1,
                 .2 - np.where(s < .1, (s - .07) * .6, .018) + np.sin(np.minimum(1, s / .3) * np.pi / 2) * .04
                 - (np.maximum(0, s - .3) / .7) ** 1.3 * .21)
    return np.maximum(.012, a)


def SY(s):
    return 1.25 + np.maximum(0, .25 - np.asarray(s)) * .3


zof = lambda s: (np.asarray(s) - .5) * L
sof = lambda z: np.clip(np.asarray(z) / L + .5, 0, 1)


def body_tube(nu=96, nv=420):
    s = np.linspace(0, 1, nv)
    R, sy = prof(s), SY(s)
    a = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    ca, sa = np.cos(a), np.sin(a)
    V = []
    for k in range(nv):
        y = sa * R[k] * sy[k] * np.where(sa < 0, .88, 1)
        V.append(np.stack([ca * R[k] * SX, y, np.full(nu, zof(s[k]))], 1))
    V = np.concatenate(V)
    F = []
    for k in range(nv - 1):
        for i in range(nu):
            a0, a1 = k * nu + i, k * nu + (i + 1) % nu
            F.append((a0, a1, a1 + nu, a0 + nu))
    c0, c1 = len(V), len(V) + 1
    V = np.concatenate([V, [[0, 0, zof(0) + .01], [0, 0, zof(1)]]])
    for i in range(nu):
        j = (i + 1) % nu
        F.append((c0, j, i))
        F.append((c1, (nv - 1) * nu + i, (nv - 1) * nu + j))
    return V, F


def stalk(sd):
    a, b = np.array([sd * .062, .095, -2.27]), np.array([sd * .078, .255, -2.31])
    t = np.linspace(0, 1, 10)[:, None]
    return a + (b - a) * t, b, (b - a) / np.linalg.norm(b - a)


def blockout():
    parts = [body_tube(),
             C.ellipsoid((0, -.015, -2.45), (.105, .092, .19), (.12, 0, 0)),
             C.ellipsoid((0, -.078, -2.49), (.09, .05, .17), (-.06, 0, 0))]
    for sd in (-1, 1):
        path, tip, _ = stalk(sd)
        t = np.linspace(0, 1, len(path))
        parts.append(C.tube(path, .036 - .008 * np.sin(t * np.pi * .8) + .008 * t ** 3, seg=24))
        parts.append(C.ellipsoid(tip - np.array([0, .004, 0]), (.041, .02, .041), (-.24, 0, 0), 32, 16))
        parts.append(C.ellipsoid((sd * .06, .1, -2.28), (.05, .045, .06)))
    return C.merge(parts)


def stalk_dist(P):
    out = np.full(len(P), 9.0)
    for sd in (-1, 1):
        path, tip, _ = stalk(sd)
        a, ab = path[0], tip - path[0]
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        out = np.minimum(out, np.linalg.norm(P - (a + t[:, None] * ab), axis=1))
    return out


def labels(cen, nrm):
    s = sof(cen[:, 2])
    side = (cen[:, 0] > 0).astype(int)
    strip = np.searchsorted([.09, .3, .55, .8], s)
    lab = strip * 2 + side
    lab[(stalk_dist(cen) < .06) & (cen[:, 1] > .11)] = 20
    lab[(stalk_dist(cen) < .06) & (cen[:, 1] > .11) & (cen[:, 0] > 0)] = 21
    return lab


def macro(P, N, ctx):
    x, y, z = P.T
    s = sof(z)
    R = prof(s)
    ry = R * SY(s)
    d = np.zeros(len(P))
    head = C.sstep(-2.28, -2.42, z)
    ymouth = -.056 + (z + 2.5) * .06
    mouth = C.gauss(y - ymouth, .0055) * head * (y < .02)
    d += -.011 * mouth
    side = C.sstep(.35, .75, np.abs(x) / (R * SX + 1e-6))
    gm = np.zeros(len(P))
    for i in range(5):
        zs = zof(.085 + i * .018) + .025 * (y / .1)
        band = C.gauss(y - .005, .07)
        g = C.gauss(z - zs, .0042) * band * side
        d += -.011 * g + .0035 * C.gauss(z - zs - .010, .006) * band * side
        gm = np.maximum(gm, g)
    v = np.clip(y / (ry + 1e-6), -1, 1)
    warp = (C.fbm(P * np.array([2, 2, .8]), 3, seed=41) - .5) * .9
    p = (z + .5 * np.abs(v) * R * 2.2) / (.075 + .03 * s) + warp
    my = C.gauss(np.abs(p - np.round(p)), .14) * (.15 + .85 * C.sstep(.35, .7, C.fbm(P * np.array([3, 3, 1.4]), 3, seed=43)))
    flank = C.sstep(.12, .2, s) * (1 - C.sstep(.8, 1, s)) * C.sstep(.25, .7, np.abs(x) / (R * SX + 1e-6))
    d += -.0022 * my * flank
    d += .005 * C.sstep(.5, .9, v) * C.gauss(x, .014 + R * .05) * C.sstep(.18, .25, s)
    d += (C.fbm(P * 5.0, 3, seed=3) - .5) * .007
    # dorsal / ventral muscle masses either side of a sunken lateral septum
    mus = C.sstep(.1, .2, s) * (1 - C.sstep(.85, .97, s))
    d += (.006 * C.gauss(v - .5, .28) + .004 * C.gauss(v + .5, .28) - .004 * C.gauss(v, .07)) * mus * R / .2
    # loose skin wrinkling across the nape and throat where the eel bends
    nape = C.sstep(-2.32, -2.2, z) * (1 - C.sstep(-1.85, -1.65, z))
    d += -.003 * (.5 + .5 * np.sin(z * 95 + C.fbm(P * 6, 2, seed=44) * 5 + np.abs(v) * 3)) ** 3 * nape
    # puckered folds at the mouth corners
    for sd in (-1, 1):
        q = P - np.array([sd * .085, -.055, -2.4])
        r = np.linalg.norm(q, axis=1)
        d += .0035 * np.sin(np.arctan2(q[:, 1], q[:, 2]) * 6 + r * 50) * C.gauss(r - .03, .025) * (np.sign(x) == sd)
    ctx.update(gill=gm, mouth=mouth, myo=my * flank, v=v, s=s, flank=flank)
    return d


def micro(P, N, ctx):
    x, y, z = P.T
    s, v = ctx['s'], ctx['v']
    d = -.0011 * C.ridged(P * np.array([26, 26, 10]), 3, seed=11)
    d += (C.fbm(P * 70, 2, seed=5) - .5) * .0007
    vd, _ = C.voronoi(P * 55, seed=7)
    d += -.0013 * C.gauss(vd, .12) * C.sstep(-2.0, -2.3, z)
    ll = C.gauss(v, .03) * C.sstep(.08, .12, s) * (1 - C.sstep(.85, .95, s))
    lp, _ = C.voronoi(np.stack([np.zeros_like(z), np.sign(x) * 3, z * 18], 1), seed=13)
    d += -.0012 * ll - .0012 * ll * C.gauss(lp, .12)
    sc = C.ridged(P * np.array([4, 30, 1.5]), 2, seed=19)
    d += .0009 * C.sstep(.7, .95, sc) * C.sstep(.2, .6, s)
    eye = C.sstep(.06, .04, stalk_dist(P)) * C.sstep(.1, .14, y)
    ridge, halo, fresh = C.scar_field(P, N, 303, 30, length=(.15, .6), width=(.006, .016), weight=(1 - eye) * (.3 + ctx['flank']) * C.sstep(.05, .1, s))
    d += .0024 * ridge * (1 - fresh) - .0026 * fresh - .0008 * halo * (1 - ridge)
    pw = (C.gauss(z - zof(.13), .12) * 1.5 + C.sstep(.6, .8, s) * C.sstep(-.2, -.6, v) * .8) * (1 - eye)
    ph, cover, crater = C.parasite_field(P, N, 404, 14, rad=(.012, .026), weight=pw + 1e-4, cluster=(3, 7))
    d += ph
    rotp = C.patch_field(P, N, 505, 6, rad=(.04, .1), weight=(1 - eye) * C.sstep(.12, .2, s) * (.3 + C.sstep(.2, -.4, v)) + 1e-4)
    d += -.0012 * rotp + .0005 * C.ridged(P * 70, 2, seed=506) * rotp
    ctx.update(ll=ll, ridge=ridge, halo=halo, fresh=fresh, cover=cover, crater=crater, rotp=rotp)
    return d


def shade_vertex(P, curv, ctx):
    x, y, z = P.T
    s, v = ctx['s'], ctx['v']
    PAL, mix = C.PAL, C.mix
    warp = C.fbm(P * np.array([1.6, 1.6, .6]), 3, seed=22) - .5
    back = C.sstep(-.7, .15, v + warp * .6)
    warp = warp[:, None]
    # sooty slate back, dirty translucent off-white belly (the "half-transparent long body" of the design doc)
    col = mix(np.array([.058, .055, .05])[None] * (.75 + .5 * C.fbm(P * 9, 2, seed=29))[:, None], np.array([.024, .025, .029]), back)
    big = C.sstep(.45, .62, C.fbm(P * np.array([1.8, 1.8, .7]) + warp, 4, seed=21))
    col = mix(col, PAL['soot'], big * (.5 + .45 * back))
    col *= (.75 + .5 * C.fbm(P * np.array([7, 7, 3]), 3, seed=27))[:, None]
    fv, _ = C.voronoi(P * np.array([14, 14, 9]), seed=4)
    col = mix(col, np.array([.05, .052, .05]), C.gauss(fv, .1) * C.sstep(-.3, .3, v) * .5)
    col = mix(col, np.array([.06, .065, .066]), C.gauss(v, .045) * C.sstep(.1, .15, s) * .7)
    col = mix(col, np.array([.008, .008, .009]), ctx['ll'] * .7)
    col *= (1 - .1 * ctx['myo'])[:, None]
    col = C.hue_vary(P, col, 27)
    rot = np.maximum(C.sstep(.61, .69, C.fbm(P * np.array([2.4, 2.4, 1.2]) + warp, 4, seed=24)) * (1 - .6 * back), ctx['rotp'])
    col = mix(col, PAL['rot'] * (.75 + .5 * C.fbm(P * 30, 2, seed=28))[:, None], rot * .8)
    col = mix(col, PAL['scar'], ctx['halo'] * .2)
    col = mix(col, PAL['scar'] * .8, ctx['ridge'] * (1 - ctx['fresh']) * .75)
    col = mix(col, PAL['wound'], ctx['fresh'] * .9)
    col = mix(col, PAL['crust'] * (.7 + .6 * C.fbm(P * 110, 2, seed=55))[:, None], ctx['cover'])
    col = mix(col, np.array([.012, .01, .008]), ctx['crater'] * .9)
    cav = C.sstep(.58, .92, curv)
    col *= (1 - .4 * cav)[:, None]
    col *= (1 + .22 * C.sstep(.5, .2, curv))[:, None]
    gill = C.sstep(.15, .6, ctx['gill'])
    col = mix(col, np.array([.04, .008, .01]), gill)
    mo = C.sstep(.2, .7, ctx['mouth'])
    col = mix(col, np.array([.025, .006, .008]), mo)
    eye = C.sstep(.06, .04, stalk_dist(P)) * C.sstep(.1, .14, y)
    col = mix(col, np.array([.01, .01, .012]), eye)
    rough, wet = C.wet_rough(P, 80, cav=curv, extra_wet=np.maximum(gill, mo) + .1 * (1 - back),
                             extra_dry=np.clip(ctx['cover'] + ctx['ridge'] * .7 + rot * .3, 0, 1))
    return col, rough, np.zeros(len(P))


def fin_strip(s0, s1, nu, y0, h, ruffle=.012, lean=.03, rep=6.0):
    s = np.linspace(s0, s1, nu + 1)
    vv = np.linspace(0, 1, 7)
    V, UV = [], []
    for v in vv:
        for k, sk in enumerate(s):
            V.append((ruffle * v * math.sin(sk * 55), y0(sk) + h(sk) * v, float(zof(sk)) + lean * v))
            UV.append(((sk - s0) / (s1 - s0) * rep, v))
    return np.array(V), C._grid_faces(nu, len(vv) - 1), np.array(UV)


def pectoral(sd):
    sp = .19
    o = np.array([sd * float(prof(sp)) * SX * .85, -.07, float(zof(sp))])
    V, UV = [], []
    for j in range(7):
        u = j / 6
        for i in range(9):
            a = i / 8
            V.append(o + np.array([sd * (.02 + .27 * u), -.03 * u - .05 * u * u + .015 * math.sin(a * 6), (a - .5) * .18 * (1 - .4 * u) + .12 * u]))
            UV.append((a, u))
    return np.array(V), C._grid_faces(8, 6), np.array(UV)


def build():
    C.begin(NAME)
    GEN.mkdir(parents=True, exist_ok=True)
    V, F = blockout()
    hi = C.mesh_obj('shade_high', V, F)
    C.remesh(hi, .014, smooth=6)
    C.remesh(hi, .0045, smooth=2)
    ctx = {}
    C.displace(hi, macro, ctx)
    lo = C.copy_obj(hi, 'body')
    C.decimate(lo, 24000)
    C.seam_unwrap(lo, labels)
    C.displace(hi, micro, ctx)
    P, _ = C.arrays(hi)
    curv = C.curvature(hi)
    col, rough, emit = shade_vertex(P, curv, ctx)
    C.set_attr(hi, 'alb', col)
    C.set_attr(hi, 'rough', rough)
    C.set_attr(hi, 'curv', curv)
    C.log('high tris', C.tris(hi), 'low tris', C.tris(lo))
    maps = C.bake(lo, hi, GEN, res=2048, ext=.015, maxd=.04, ao_dist=.3, thick_dist=.09)
    tex = C.save_skin_maps(GEN, maps)
    hm = hi.data
    bpy_remove(hi, hm)
    C.assign(lo, C.material('creature_shade_skin', tex['color'], tex['orm'], tex['normal']))

    # thin parts
    top = lambda s: float(prof(s) * SY(s)) * .93
    bot = lambda s: -float(prof(s) * SY(s)) * .88 * .93
    fins = [fin_strip(.2, .995, 150, top, lambda s: (.1 + math.sin((s - .2) / .8 * math.pi) * .1) * (1 + math.sin(s * 80) * .05)),
            fin_strip(.5, .995, 90, bot, lambda s: -(.06 + math.sin((s - .5) / .5 * math.pi) * .08), rep=3.5),
            pectoral(-1), pectoral(1)]
    fV, fF, fUV, off = [], [], [], 0
    for v_, f_, uv_ in fins:
        fV.append(v_); fUV.append(uv_); fF.extend(tuple(i + off for i in f) for f in f_); off += len(v_)
    fo = C.mesh_obj('fins', np.concatenate(fV), fF, np.concatenate(fUV))
    C.fin_texture(GEN / 'fin_color.webp', base=(.012, .013, .016), ray=(.02, .021, .024), tip=(.03, .03, .03), alpha=.7)
    C.assign(fo, C.material('creature_shade_fin', GEN / 'fin_color.webp', alpha=True, rough=.52, double=True))

    rng = np.random.default_rng(5)
    teeth = []
    for k in range(18):
        a = -1.25 + 2.5 * k / 17 + (rng.random() - .5) * .06
        p = np.array([math.sin(a) * .082, -.06, -2.52 - math.cos(a) * .135])
        teeth.append((p, p + np.array([math.sin(a) * .006 + (rng.random() - .5) * .006, .022 + rng.random() * .02, -.006]), .0034 + rng.random() * .0016, (0, 0, -.004 * rng.random())))
    for k in range(12):
        a = -1.1 + 2.2 * k / 11 + (rng.random() - .5) * .06
        p = np.array([math.sin(a) * .088, -.046, -2.505 - math.cos(a) * .13])
        teeth.append((p, p + np.array([(rng.random() - .5) * .005, -.014 - rng.random() * .012, -.004]), .0028 + rng.random() * .0012, (0, 0, 0)))
    tV, tF, tC, tT = C.teeth_mesh(teeth, 55)
    to = C.mesh_obj('teeth', tV, tF)
    C.set_attr(to, 'tcol', tC, alpha=tT)
    C.assign(to, C.material('creature_shade_teeth', rough=.38, vcol='tcol'))
    lens = []
    for sd in (-1, 1):
        _, tip, _ = stalk(sd)
        lens.append(C.ellipsoid(tip + np.array([0, .007, -.002]), (.021, .011, .021), (-.24, 0, 0), 24, 12))
    lV, lF = C.merge(lens)
    eo = C.mesh_obj('lens', lV, lF)
    C.assign(eo, C.material('creature_shade_lens', base=(.01, .012, .012), rough=.05, emit_color=(.79, .91, .54), emit_strength=.35))

    # rig: root at the neck, head -> snout, spine01..11 -> tail
    J = [-2.66] + list(np.linspace(-2.15, 2.5, 12))
    arm, names = C.eel_rig('shade_rig', J)
    meshes = [lo, fo, to, eo]
    for o in meshes:
        Pm, _ = C.arrays(o)
        C.skin(o, arm, names, C.eel_weights(Pm[:, 2], J))
    UP, SIDE = C.UP, C.SIDE
    amp = lambda a: (lambda s: (.05 + .30 * s * s) * a)

    def swim(t):
        th, nk = C.wave_theta(J, L, t, amp(1.0), 9.4)
        return C.eel_pose(names, th, nk)

    def idle(t):
        th, nk = C.wave_theta(J, L, t, amp(.45), 7.0)
        return C.eel_pose(names, th, nk, {n: [(SIDE, .015 * math.sin(2 * math.pi * t + i * .5))] for i, n in enumerate(names[1:])})

    def curl(t):
        br = 1 + .04 * math.sin(2 * math.pi * t)
        out = {'root': [], 'head': [(UP, .12 * math.sin(2 * math.pi * t)), (SIDE, .1)]}
        for i, n in enumerate(names[1:], 1):
            out[n] = [(UP, .5 * br * float(C.sstep(0, 2.5, i))), (SIDE, -.05)]
        return out

    def attack(t):
        wind = float(C.sstep(0, .72, t) * (1 - C.sstep(.74, .86, t)))
        th, nk = C.wave_theta(J, L, t, amp(.25 * (1 - wind)), 9.4, cycles=2)
        S = {'spine01': .5, 'spine02': -.8, 'spine03': .55, 'spine04': -.2}
        return C.eel_pose(names, th, nk, {**{k: [(UP, v * wind)] for k, v in S.items()}, 'head': [(SIDE, .22 * wind), (UP, -.3 * wind)]})

    clips = {'swim': 60, 'idle': 120, 'curl': 90, 'attack': 54}
    for k, fn in (('swim', swim), ('idle', idle), ('curl', curl), ('attack', attack)):
        C.clip(arm, k, clips[k], fn)
    path = C.export(NAME, meshes + [arm])
    lod = C.make_lod(NAME, meshes, arm, .3, {'teeth': .5, 'fins': .5, 'lens': .5})
    C.report(NAME, meshes, arm, clips, {'skin': {'color': '2048 webp q90 (alpha = thinness)', 'normal': '2048 webp lossless', 'orm': '1024 png'}, 'fin': {'color': [1024, 256]}, 'teeth': 'COLOR_0 (alpha = thinness)'}, path,
             extra=dict(silhouette=['continuous frilled dorsal fin + anal fin over a heavy eel trunk', 'blunt underbite snout with upward tubular eyes', 'five gill slits + fan pectorals behind the head'],
                        headAxis='-Z (procedural body group convention)', lod1=lod))
    C.save_blend(NAME)
    C.preview(NAME, arm, (0, 0, 0), 2.7, {'side': (1, .45, .35), 'head': (.9, .35, -1.0)}, [('swim', 15), ('curl', 30)])
    C.preview(NAME, arm, (0, .05, -2.15), .55, {'headclose': (.8, .45, -.9)}, [('idle', 1)])


def bpy_remove(o, me):
    import bpy
    bpy.data.objects.remove(o, do_unlink=True)
    if me.users == 0:
        bpy.data.meshes.remove(me)


C.run(build)

