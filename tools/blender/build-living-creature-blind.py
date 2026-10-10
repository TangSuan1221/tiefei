"""Blind hunter (盲猎者): 3 m eyeless deep-sea predator for the level-two machine room, valve room and atrium.

Head at local -Z (procedural body-group convention). Far-read silhouette: (1) huge blunt eyeless skull on a
body that tapers fast (heavy front, tadpole read), (2) deep underslung jaw hanging open with long irregular
teeth past the lips, (3) dorsal spine crest + fleshy pectoral flaps + tall caudal fin. Near read: skin folds
where eyes would be, a lateral-line pore row on each flank, ampullae on the snout, scars and blotches.

Run: D:/blender/blender.exe -b --factory-startup --python-exit-code 1 -P tools/blender/build-living-creature-blind.py
"""
import importlib.util, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('creature_common', os.path.join(HERE, 'build-living-creature-common.py'))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

NAME = 'blind'
L = 3.0
SX, SY = .9, 1.05
GEN = C.GENROOT / f'creature-{NAME}'
HINGE = np.array([0, -.08, -1.02])
CAV_C, CAV_R, CAV_ROT = np.array([0, -.1, -1.38]), np.array([.22, .12, .33]), (-.2, 0, 0)


def prof(s):
    s = np.asarray(s, dtype=np.float64)
    return np.maximum(.025, np.where(s < .22, .2 + np.sqrt(np.clip(s, 0, None) / .22) * .14, .34 - (np.maximum(s - .22, 0) / .78) ** 1.2 * .31))


zof = lambda s: (np.asarray(s) - .5) * L
sof = lambda z: np.clip(np.asarray(z) / L + .5, 0, 1)


def body_tube(nu=80, nv=260):
    s = np.linspace(.1, 1, nv)
    R = prof(s)
    a = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    ca, sa = np.cos(a), np.sin(a)
    V = np.concatenate([np.stack([ca * R[k] * SX, sa * R[k] * SY * np.where(sa < 0, .9, 1), np.full(nu, zof(s[k]))], 1) for k in range(nv)])
    F = [(k * nu + i, k * nu + (i + 1) % nu, (k + 1) * nu + (i + 1) % nu, (k + 1) * nu + i) for k in range(nv - 1) for i in range(nu)]
    c0, c1 = len(V), len(V) + 1
    V = np.concatenate([V, [[0, 0, zof(.1)], [0, 0, zof(1)]]])
    for i in range(nu):
        F.append((c0, (i + 1) % nu, i))
        F.append((c1, (nv - 1) * nu + i, (nv - 1) * nu + (i + 1) % nu))
    return V, F


def spines():
    """Uneven dorsal spines rising out of a fleshy crest: random height/lean, a few snapped short."""
    rng = np.random.default_rng(31)
    out = []
    for i in range(12):
        s = .25 + i * .037 + (rng.random() - .5) * .01
        z, r = float(zof(s)), float(prof(s))
        base = np.array([(rng.random() - .5) * .012, r * SY * .86, z])
        h = (.21 - i * .011) * (.65 + .55 * rng.random())
        if rng.random() < .25:
            h *= .4
        lean = .3 + .45 * rng.random()
        out.append(C.cone(base, base + np.array([(rng.random() - .5) * .05, h, h * lean]), (.025 - i * .0011) * (.8 + .4 * rng.random()),
                          seg=10, rings=6, bend=(rng.normal() * .012, -.02 * rng.random(), .045 * rng.random())))
    s = np.linspace(.22, .7, 40)
    crest = np.stack([np.zeros_like(s), prof(s) * SY * .84, zof(s)], 1)
    out.append(C.tube(crest, .018 + .008 * np.sin(s * 30), .045 * np.sin((s - .22) / .48 * np.pi) ** .6 + .01, seg=16))
    return out


def spine_mask(P, s):
    top = P[:, 1] - prof(s) * SY * .9
    m = C.sstep(.0, .03, top) * C.sstep(.07, .03, np.abs(P[:, 0])) * C.sstep(.2, .24, s) * (1 - C.sstep(.7, .74, s))
    return m, np.clip(top / .2, 0, 1)


def blockout():
    parts = [body_tube(),
             C.ellipsoid((0, .06, -1.2), (.31, .23, .38)),
             C.ellipsoid((0, .17, -1.22), (.28, .08, .31), (.1, 0, 0)),
             C.ellipsoid((0, -.02, -1.45), (.27, .12, .18)),
             C.ellipsoid((0, -.22, -1.35), (.27, .11, .36), (-.43, 0, 0))]
    for sd in (-1, 1):
        parts.append(C.ellipsoid((sd * .22, -.02, -1.05), (.12, .14, .18)))
    parts += spines()
    return C.merge(parts)


def inside_cavity(P, scale=1.0):
    R = C.euler3(CAV_ROT)
    q = (P - CAV_C) @ R
    return np.linalg.norm(q / (CAV_R * scale), axis=1)


def macro(P, N, ctx):
    x, y, z = P.T
    s = sof(z)
    d = np.zeros(len(P))
    for sd in (-1, 1):
        r = np.linalg.norm(P - np.array([sd * .27, .1, -1.24]), axis=1)
        d += (-.02 * C.gauss(r, .03) + .005 * np.sin(r * 120) * C.gauss(r, .06)) * (np.sign(x) == sd)
    top = C.sstep(.05, .2, y) * C.sstep(-.9, -1.1, z)
    d += .0028 * np.sin(z * 70 + C.fbm(P * 6, 2, seed=2) * 3) * top
    neck = C.sstep(-.65, -.85, z) * (1 - C.sstep(-1.0, -1.08, z))
    d += .0045 * np.sin(z * 85 + C.fbm(P * 5, 2, seed=4) * 4) * neck
    v = np.clip(y / (prof(s) * SY + 1e-6), -1, 1)
    d += -.0025 * C.gauss(v - .1, .03) * C.sstep(.12, .16, s) * (1 - C.sstep(.88, .95, s))
    d += (C.fbm(P * 4.5, 3, seed=6) - .5) * .008
    mouth = C.sstep(1.12, .98, inside_cavity(P))
    d += -.003 * mouth * C.ridged(P * 18, 2, seed=8)
    R = prof(s)
    flank = C.sstep(.35, .8, np.abs(x) / (R * SX + 1e-6))
    # emaciated ribs showing through the flanks behind the head
    rib = (.5 + .5 * np.cos(2 * np.pi * (z / .085 + .2 * C.fbm(P * 3, 2, seed=60)))) ** 3
    ribband = C.sstep(.17, .24, s) * (1 - C.sstep(.46, .56, s)) * flank * C.sstep(-.85, -.25, v) * (1 - C.sstep(.5, .85, v))
    d += (.0085 * rib - .0045) * ribband
    # epaxial / hypaxial muscle masses split by the horizontal septum groove, myomere chevrons over them
    mus = C.sstep(.24, .34, s) * (1 - C.sstep(.9, .98, s))
    d += (.0075 * C.gauss(v - .5, .25) + .005 * C.gauss(v + .45, .25) - .0045 * C.gauss(v - .08, .06)) * mus * R / .3
    p = (z + .45 * np.abs(v - .08) * R * 2) / (.06 + .03 * s) + (C.fbm(P * np.array([2, 2, .8]), 3, seed=61) - .5) * .8
    d += -.0024 * C.gauss(np.abs(p - np.round(p)), .12) * mus * flank * (.5 + C.fbm(P * 3, 2, seed=64))
    # puckered radial folds at the lip corners
    for sd in (-1, 1):
        q = P - np.array([sd * .25, -.08, -1.1])
        r = np.linalg.norm(q, axis=1)
        ang = np.arctan2(q[:, 1], q[:, 2])
        side = (np.sign(x) == sd)
        d += (.0065 * np.sin(ang * 7 + r * 30) * C.gauss(r - .065, .05) - .004 * C.gauss(r, .03)) * side
    # ventral throat pleats under the lower jaw
    thr = C.sstep(-1.58, -1.42, z) * (1 - C.sstep(-1.0, -.86, z)) * C.sstep(-.14, -.24, y) * (1 - mouth)
    d += -.004 * (.5 + .5 * np.cos(x * 75 + C.fbm(P * 4, 2, seed=62) * 2)) ** 4 * thr
    # bony tubercles over the eyeless skull
    vd, _ = C.voronoi(P * 14, seed=63)
    d += .0055 * C.sstep(.38, .0, vd) * C.sstep(.05, .2, y) * C.sstep(-.9, -1.1, z) * (1 - mouth)
    ctx.update(s=s, v=v, mouth=mouth, ribs=ribband * rib, flank=flank)
    return d


def micro(P, N, ctx):
    x, y, z = P.T
    s, v = ctx['s'], ctx['v']
    d = -.0013 * C.ridged(P * np.array([24, 30, 24]), 3, seed=11)
    d += (C.fbm(P * 80, 2, seed=5) - .5) * .0007
    pore = np.zeros(len(P))
    zs = zof(.14 + np.arange(34) / 34 * .76)
    near = zs[np.clip(np.searchsorted(zs, z), 1, len(zs) - 1) - 1]
    nxt = zs[np.clip(np.searchsorted(zs, z), 0, len(zs) - 1)]
    dz = np.minimum(np.abs(z - near), np.abs(z - nxt))
    dy = y - prof(s) * SY * .1
    r = np.sqrt(dz ** 2 + dy ** 2)
    band = C.sstep(.12, .14, s) * (1 - C.sstep(.9, .92, s)) * C.sstep(.4, .7, np.abs(x) / (prof(s) * SX + 1e-6))
    pore = (C.gauss(r, .0065) * band)
    d += -.006 * pore + .0026 * C.gauss(r - .012, .0045) * band
    vd, _ = C.voronoi(P * 32, seed=7)
    amp = C.gauss(vd, .1) * C.sstep(-1.3, -1.5, z) * C.sstep(-.05, .05, y) * (1 - ctx['mouth'])
    d += -.0032 * amp
    mo = ctx['mouth']
    spine, _ = spine_mask(P, s)
    flank = ctx['flank']
    ridge, halo, fresh = C.scar_field(P, N, 101, 24, length=(.14, .5), width=(.008, .02), weight=(1 - mo) * (1 - spine) * (.25 + flank + C.sstep(-.8, -1.2, z)))
    d += .0028 * ridge * (1 - fresh) - .003 * fresh - .001 * halo * (1 - ridge)
    pw = (C.gauss(z + .6, .14) * (y < 0) * 1.5 + C.sstep(.72, .86, s) * .7 + C.gauss(z + 1.0, .1) * C.sstep(-.05, -.2, y)) * (1 - mo) * (1 - spine)
    ph, cover, crater = C.parasite_field(P, N, 202, 14, rad=(.016, .034), weight=pw + 1e-4, cluster=(3, 8))
    d += ph
    rotp = C.patch_field(P, N, 207, 5, rad=(.06, .13), weight=(1 - mo) * (1 - spine) * C.sstep(.1, -.3, v) * C.sstep(.15, .25, s) + 1e-4)
    d += -.0015 * rotp + .0006 * C.ridged(P * 60, 2, seed=208) * rotp
    ctx.update(pore=np.maximum(pore, amp), ridge=ridge, halo=halo, fresh=fresh, cover=cover, crater=crater, rotp=rotp)
    return d


def shade_vertex(P, curv, ctx):
    x, y, z = P.T
    s, v = ctx['s'], ctx['v']
    PAL, mix = C.PAL, C.mix
    warp = C.fbm(P * 1.5, 3, seed=50) - .5
    back = C.sstep(-.55, .45, v + warp * .6)
    warp = warp[:, None]
    col = mix(PAL['belly'][None], PAL['brown'], back)
    # large sooty-violet blotches (30-50 cm) that break the silhouette, mottled at a medium scale
    big = C.sstep(.38, .58, C.fbm(P * np.array([1.4, 1.8, 1.1]) + warp, 4, seed=51))
    col = mix(col, PAL['soot'], big * .85)
    col *= (.62 + .76 * C.fbm(P * 7, 3, seed=52))[:, None]
    # patches of dead, translucent off-white skin (mostly lower flanks / old bite sites)
    col = C.hue_vary(P, col, 56)
    rot = np.maximum(C.sstep(.61, .68, C.fbm(P * 2.6 + warp * 1.5, 4, seed=53)) * (1 - .6 * back), ctx['rotp']) * (1 - ctx['mouth'])
    rot *= .55 + .45 * C.sstep(.35, .65, C.fbm(P * 14, 3, seed=57))
    col = mix(col, PAL['rot'] * (.7 + .6 * C.fbm(P * 30, 2, seed=54))[:, None], rot * .75)
    col = mix(col, PAL['scar'], ctx['halo'] * .25)
    col = mix(col, PAL['scar'], ctx['ridge'] * (1 - ctx['fresh']) * .8)
    col = mix(col, PAL['wound'], ctx['fresh'] * .9)
    col = mix(col, PAL['crust'] * (.7 + .6 * C.fbm(P * 90, 2, seed=55))[:, None], ctx['cover'])
    col = mix(col, np.array([.012, .01, .008]), ctx['crater'] * .9)
    sp, tip = spine_mask(P, s)
    col = mix(col, mix(PAL['horn'][None], np.array([.09, .085, .07]), C.sstep(.5, 1, tip)), sp)
    cav = C.sstep(.56, .9, curv)
    col *= (1 - .42 * cav)[:, None]
    col *= (1 + .25 * C.sstep(.5, .2, curv))[:, None]
    col = mix(col, np.array([.008, .004, .004]), ctx['pore'] * .85)
    gullet = C.sstep(-1.2, -1.02, z)
    col = mix(col, mix(PAL['flesh'][None], PAL['gullet'], gullet), ctx['mouth'])
    rough, wet = C.wet_rough(P, 70, cav=curv, extra_wet=np.maximum(ctx['mouth'], ctx['fresh']) + .5 * ctx['pore'],
                             extra_dry=np.clip(ctx['cover'] + ctx['ridge'] * .7 + sp * .6 + rot * .4, 0, 1))
    return col, rough, np.zeros(len(P))


def labels(cen, nrm):
    x, y, z = cen.T
    s = sof(z)
    side = (x > 0).astype(int)
    lab = np.searchsorted([.12, .3, .5, .72], s) * 2 + side
    lab[(s < .12) & (y > .02)] = 30 + side[(s < .12) & (y > .02)]
    lab[(s < .17) & (y <= .02) & (inside_cavity(cen) > 1.05)] = 40 + side[(s < .17) & (y <= .02) & (inside_cavity(cen) > 1.05)]
    lab[inside_cavity(cen) <= 1.05] = 50 + side[inside_cavity(cen) <= 1.05]
    return lab


def teeth(bvh):
    rng = np.random.default_rng(77)
    out_up, out_lo = [], []
    for row, n, ydir in (('lo', 15, -1), ('up', 13, 1)):
        for i in range(n):
            a = (i / (n - 1) - .5) * 2.5 + (rng.random() - .5) * .08
            x = math.sin(a) * (.205 if row == 'lo' else .215)
            zc = -1.38 - math.cos(a) * (.29 if row == 'lo' else .25)
            org = C.vb((x, -.11, zc))
            hit = bvh.ray_cast(org, C.vb((0, ydir, 0)), .4)
            if hit[0] is None:
                continue
            p = C.to_t(np.array(hit[0][:]))
            front = .5 + math.cos(a) * .6
            ln = (.05 + rng.random() * .1) * front * (1.25 if row == 'lo' else 1)
            if rng.random() < .12:
                ln *= .35
            up = -ydir
            inward = np.array([-math.sin(a), 0, math.cos(a)]) * .25
            tip = p + np.array([0, up * ln, 0]) + inward * ln + (rng.random(3) - .5) * ln * .45
            root = p - np.array([0, up * .012, 0])
            spec = (root, tip, (.011 + rng.random() * .007) * (.7 + .5 * front), inward * ln * (.3 + .6 * rng.random()))
            (out_lo if row == 'lo' else out_up).append(spec)
            if front > .55 and rng.random() < .7:
                # second, shorter needle row set back inside the mouth
                p2 = p + np.array([math.sin(a), 0, -math.cos(a)]) * -.035 + np.array([0, -up * .006, 0])
                ln2 = ln * (.35 + .3 * rng.random())
                (out_lo if row == 'lo' else out_up).append((p2, p2 + np.array([0, up * ln2, 0]) + inward * ln2 * 1.6, .006 + rng.random() * .003, inward * ln2 * .5))
    return out_up, out_lo


def flap(sd):
    o = np.array([sd * .28, -.12, -.62])
    V, UV = [], []
    for j in range(8):
        u = j / 7
        for i in range(10):
            a = i / 9
            V.append(o + np.array([sd * (.02 + .5 * u), -.1 * u - .08 * u * u + .02 * math.sin(a * 7 + u * 3), (a - .5) * .3 * (1 - .35 * u) + .22 * u]))
            UV.append((a, u))
    return np.array(V), C._grid_faces(9, 7), np.array(UV)


def caudal(top=True):
    s0, s1 = (.8, 1.0) if top else (.85, 1.0)
    s = np.linspace(s0, s1, 20)
    V, UV = [], []
    for v in np.linspace(0, 1, 7):
        for sk in s:
            r = float(prof(sk))
            y0 = r * .9 if top else -r * .9
            h = (sk - s0) * (1.7 if top else 1.5) * (1 + math.sin(sk * 70) * .06)
            V.append((.01 * v * math.sin(sk * 40), y0 + (h if top else -h) * v, float(zof(sk)) + .05 * v * (sk - s0) / (s1 - s0)))
            UV.append(((sk - s0) / (s1 - s0) * 1.5, v))
    return np.array(V), C._grid_faces(len(s) - 1, 6), np.array(UV)


def build():
    C.begin(NAME)
    GEN.mkdir(parents=True, exist_ok=True)
    V, F = blockout()
    hi = C.mesh_obj('blind_high', V, F)
    C.remesh(hi, .012, smooth=5)
    cV, cF = C.merge([C.ellipsoid(CAV_C, CAV_R, CAV_ROT, 48, 32),
                      C.tube(np.linspace([0, -.07, -1.12], [0, -.04, -.86], 8), np.linspace(.09, .05, 8), seg=24)])
    C.boolean(hi, C.mesh_obj('blind_cavity', cV, cF))
    C.remesh(hi, .0036, smooth=2)
    ctx = {}
    C.displace(hi, macro, ctx)
    lo = C.copy_obj(hi, 'body')
    C.decimate(lo, 26000)
    C.seam_unwrap(lo, labels)
    C.displace(hi, micro, ctx)
    P, _ = C.arrays(hi)
    curv = C.curvature(hi)
    col, rough, _ = shade_vertex(P, curv, ctx)
    C.set_attr(hi, 'alb', col)
    C.set_attr(hi, 'rough', rough)
    C.set_attr(hi, 'curv', curv)
    C.log('high tris', C.tris(hi), 'low tris', C.tris(lo))
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(lo, dg)
    up_t, lo_t = teeth(bvh)
    maps = C.bake(lo, hi, GEN, res=2048, ext=.014, maxd=.04, ao_dist=.25, thick_dist=.07)
    tex = C.save_skin_maps(GEN, maps)
    me = hi.data
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.data.meshes.remove(me)
    C.assign(lo, C.material('creature_blind_skin', tex['color'], tex['orm'], tex['normal']))

    fins = [flap(-1), flap(1), caudal(True), caudal(False)]
    fV, fF, fUV, off = [], [], [], 0
    for v_, f_, uv_ in fins:
        fV.append(v_); fUV.append(uv_); fF.extend(tuple(i + off for i in f) for f in f_); off += len(v_)
    fo = C.mesh_obj('fins', np.concatenate(fV), fF, np.concatenate(fUV))
    C.fin_texture(GEN / 'fin_color.webp', base=(.03, .024, .022), ray=(.035, .026, .022), tip=(.03, .025, .022), alpha=.84, rays=18, seed=11)
    C.assign(fo, C.material('creature_blind_fin', GEN / 'fin_color.webp', alpha=True, rough=.52, double=True))
    tV, tF, tC, tT = C.teeth_mesh(up_t + lo_t, 78)
    to = C.mesh_obj('teeth', tV, tF)
    C.set_attr(to, 'tcol', tC, alpha=tT)
    C.assign(to, C.material('creature_blind_teeth', rough=.38, vcol='tcol'))

    # rig: root at the neck, head -> snout, spine01..08 -> tail, jaw hinged under the skull
    J = [-1.74, -.95, -.65, -.35, -.05, .25, .55, .85, 1.15, 1.5]
    arm, names = C.eel_rig('blind_rig', J, extra=[('jaw', tuple(HINGE), (0, -.36, -1.66), 'head')])
    meshes = [lo, fo, to]
    split = lambda z: -.1 - (-(z + 1.38)) * math.sin(.2)
    for o in meshes:
        Pm, _ = C.arrays(o)
        W = C.eel_weights(Pm[:, 2], J)
        jaw = C.sstep(.025, -.02, Pm[:, 1] - split(Pm[:, 2])) * C.sstep(-.92, -1.06, Pm[:, 2])
        if o is to:
            n_up = len(up_t) * 66
            jaw = np.zeros(len(Pm))
            jaw[n_up:] = 1
        W = np.concatenate([W * (1 - jaw[:, None]), jaw[:, None]], 1)
        C.skin(o, arm, names + ['jaw'], W)
    UP, SIDE = C.UP, C.SIDE
    amp = lambda a: (lambda s: (.02 + .24 * s * s) * a)

    def swim(t):
        th, nk = C.wave_theta(J, L, t, amp(1.0), 7.0)
        return C.eel_pose(names, th, nk, {'jaw': [(SIDE, -.05 - .03 * math.sin(2 * math.pi * t))]})

    def idle(t):
        th, nk = C.wave_theta(J, L, t, amp(.5), 6.0)
        return C.eel_pose(names, th, nk, {'jaw': [(SIDE, -.04 - .05 * math.sin(2 * math.pi * t))], 'head': [(SIDE, .02 * math.sin(2 * math.pi * t))]})

    def sleep(t):
        th, nk = C.wave_theta(J, L, t, amp(.12), 4.0)
        return C.eel_pose(names, th, nk, {'jaw': [(SIDE, .03 - .06 * (.5 + .5 * math.sin(2 * math.pi * t)))], 'head': [(SIDE, -.05)]})

    def attack(t):
        wind = float(C.sstep(0, .7, t) * (1 - C.sstep(.74, .84, t)))
        snap = float(C.sstep(.7, .78, t) * (1 - C.sstep(.86, 1, t)))
        th, nk = C.wave_theta(J, L, t, amp(.4 * (1 - wind)), 7.0, cycles=2)
        S = {'spine01': .35, 'spine02': -.5, 'spine03': .3}
        ex = {k: [(UP, v * wind)] for k, v in S.items()}
        ex['head'] = [(SIDE, .2 * wind - .08 * snap)]
        ex['jaw'] = [(SIDE, -.05 - .5 * wind - .2 * snap)]
        return C.eel_pose(names, th, nk, ex)

    clips = {'swim': 36, 'idle': 90, 'sleep': 150, 'attack': 42}
    for k, fn in (('swim', swim), ('idle', idle), ('sleep', sleep), ('attack', attack)):
        C.clip(arm, k, clips[k], fn)
    path = C.export(NAME, meshes + [arm])
    lod = C.make_lod(NAME, meshes, arm, .3, {'teeth': .5, 'fins': .5})
    C.report(NAME, meshes, arm, clips, {'skin': {'color': '2048 webp q90 (alpha = thinness)', 'normal': '2048 webp lossless', 'orm': '1024 png'}, 'fin': {'color': [1024, 256]}, 'teeth': 'COLOR_0 (alpha = thinness)'}, path,
             extra=dict(silhouette=['huge blunt eyeless skull on a fast-tapering body', 'underslung open jaw with long irregular teeth past the lips', 'dorsal spine crest + fleshy pectoral flaps + tall caudal fin'],
                        headAxis='-Z (procedural body group convention)', lod1=lod))
    C.save_blend(NAME)
    C.preview(NAME, arm, (0, 0, -.2), 1.75, {'side': (1, .3, .25), 'front': (.55, .2, -1.0)}, [('idle', 1), ('attack', 30)])
    C.preview(NAME, arm, (0, -.08, -1.3), .5, {'headclose': (.75, .15, -.9)}, [('idle', 1)])


C.run(build)
