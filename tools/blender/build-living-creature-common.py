"""Shared Blender pipeline for the level-two creature GLBs (lumen / shade / blind).

Loaded by tools/blender/build-living-creature-<name>.py (importlib, the hyphenated name is not importable).
Runs headless (`blender -b --factory-startup -P tools/blender/build-living-creature-shade.py`) or inside a live
Blender through MCP (a fresh scene is created, the user's scenes are left alone).

Authoring happens in Three.js local space (metres, +Y up, head direction per creature) on numpy arrays and is
converted once to Blender space with blender = (x, -z, y); the glTF exporter (+Y up) hands back the authored
numbers.

Per creature:
  1. blockout: closed parts (tubes, ellipsoids, lathes) -> union by voxel remesh (coarse, smoothed = fillets)
     -> optional exact boolean cutters -> fine voxel remesh                                     = sculpt base
  2. macro sculpt (numpy displacement along normals: grooves, folds, ribs, slits)              -> low source
  3. micro sculpt (wrinkles, pores, myomere striations, scars)                                 = high poly
  4. low poly: decimate the macro mesh to the triangle budget, smart UV
  5. bake high -> low (Cycles, selected to active): tangent normal, AO (only_local), albedo, roughness,
     curvature, emission (vertex attributes painted procedurally on the high mesh)
  6. compose colour / ORM / emissive in numpy, plain Principled export materials
  7. thin parts (fins, curtain, tendrils, teeth, lenses) are authored directly as game meshes
  8. armature (spine chain), numpy skin weights, looping clips as NLA tracks -> GLB
  9. LOD1 (decimated ~30 %, same skeleton, no textures: the game rebinds materials by name) -> <name>.lod1.glb
 10. Cycles preview renders (dark lamp pass + neutral pass) to qa/living/creatures-r4/blender/

Texture encoding (glTF export_image_format AUTO keeps the source format):
  colour  lossy WebP q90, alpha = thinness (1 thin / translucent .. 0 thick; baked inside-AO). The material is
          OPAQUE, so renderers ignore that alpha; living-creatures.ts reads it for back-lit transmission.
  normal  lossless WebP (q100 = VP8L: no 4:2:0 chroma subsampling, so X/Y never bleed into each other)
  ORM     occlusion + roughness are re-composed by the exporter into a lossless PNG (no channel crosstalk)
"""
import bpy, bmesh, math, os, sys, time, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/deepsea/living'
QA = ROOT / 'qa/living/creatures-r4/blender'
GENROOT = ROOT / 'assets/blender/living-gen'
BLEND_DIR = ROOT / 'assets/blender'
FPS = 30
for d in (OUT, QA, GENROOT):
    d.mkdir(parents=True, exist_ok=True)


def log(*a):
    print('[creature]', *a, flush=True)


# --------------------------------------------------------------------------- space conversion
def to_b(P):
    P = np.asarray(P, dtype=np.float64)
    return np.stack([P[..., 0], -P[..., 2], P[..., 1]], -1)


def to_t(B):
    B = np.asarray(B, dtype=np.float64)
    return np.stack([B[..., 0], B[..., 2], -B[..., 1]], -1)


def vb(p):
    return Vector((float(p[0]), float(-p[2]), float(p[1])))


# --------------------------------------------------------------------------- numpy noise
def _hash(ix, iy, iz, seed):
    n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (int(seed) * 2654435761 & 0xFFFFFFFF)
    n &= 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return (n & 0xFFFFFF).astype(np.float64) / float(0xFFFFFF)


def vnoise(P, seed=0):
    """Smooth 3D value noise in [0, 1]; P (n, 3)."""
    P = np.asarray(P, dtype=np.float64)
    Pf = np.floor(P)
    f = P - Pf
    i = Pf.astype(np.int64)
    u = f * f * (3 - 2 * f)
    x, y, z = i[:, 0], i[:, 1], i[:, 2]
    c = {}
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c[dx, dy, dz] = _hash(x + dx, y + dy, z + dz, seed)
    ux, uy, uz = u[:, 0], u[:, 1], u[:, 2]
    l = lambda a, b, t: a + (b - a) * t
    return l(l(l(c[0, 0, 0], c[1, 0, 0], ux), l(c[0, 1, 0], c[1, 1, 0], ux), uy),
             l(l(c[0, 0, 1], c[1, 0, 1], ux), l(c[0, 1, 1], c[1, 1, 1], ux), uy), uz)


def fbm(P, octaves=4, seed=0, lac=2.03, gain=0.5):
    P = np.asarray(P, dtype=np.float64)
    acc = np.zeros(len(P))
    amp, tot, f = 1.0, 0.0, 1.0
    for o in range(octaves):
        acc += amp * vnoise(P * f + o * 17.17, seed + o * 31)
        tot += amp
        amp *= gain
        f *= lac
    return acc / tot


def ridged(P, octaves=4, seed=0):
    """Thin ridges (veins, wrinkles) in [0, 1]: 1 on the ridge."""
    return (1 - np.abs(fbm(P, octaves, seed) * 2 - 1)) ** 4


def voronoi(P, seed=0):
    """Distance to the nearest jittered feature point (cell size 1) and the cell hash."""
    P = np.asarray(P, dtype=np.float64)
    Pf = np.floor(P)
    best = np.full(len(P), 9.0)
    cell = np.zeros(len(P))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = Pf + (dx, dy, dz)
                ci = c.astype(np.int64)
                j = np.stack([_hash(ci[:, 0], ci[:, 1], ci[:, 2], seed + k * 101) for k in range(3)], 1)
                d = np.linalg.norm(c + j - P, axis=1)
                m = d < best
                best[m] = d[m]
                cell[m] = _hash(ci[m, 0], ci[m, 1], ci[m, 2], seed + 977)
    return best, cell


def sstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, w):
    return np.exp(-(np.asarray(x) / w) ** 2)


# --------------------------------------------------------------------------- geometry builders (three space)
def _grid_faces(nu, nv, wrap=False):
    """Quads over an (nv+1) x (nu+1) vertex grid (row-major, u fastest)."""
    cols = nu + 1
    F = []
    for j in range(nv):
        for i in range(nu):
            a = j * cols + i
            F.append((a, a + 1, a + cols + 1, a + cols))
    return F


def ellipsoid(c, r, rot=(0, 0, 0), nu=48, nv=32):
    V = []
    for j in range(nv + 1):
        th = math.pi * j / nv
        for i in range(nu):
            ph = 2 * math.pi * i / nu
            V.append((math.sin(th) * math.cos(ph) * r[0], math.cos(th) * r[1], math.sin(th) * math.sin(ph) * r[2]))
    V = np.array(V)
    F = []
    for j in range(nv):
        for i in range(nu):
            a, b = j * nu + i, j * nu + (i + 1) % nu
            F.append((a, b, b + nu, a + nu))
    R = euler3(rot)
    return V @ R.T + np.asarray(c, dtype=np.float64), F


def euler3(rot):
    ax, ay, az = rot
    cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def frames(path, up=(0, 1, 0)):
    """Rotation-minimising frames (T, N, B) along a polyline."""
    P = np.asarray(path, dtype=np.float64)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    upv = np.asarray(up, dtype=np.float64)
    n = np.cross(T[0], upv)
    if np.linalg.norm(n) < 1e-6:
        n = np.cross(T[0], (1, 0, 0))
    n /= np.linalg.norm(n)
    N, B = [], []
    for t in T:
        n = n - np.dot(n, t) * t
        n /= np.linalg.norm(n) + 1e-12
        N.append(n.copy())
        B.append(np.cross(t, n))
    return T, np.array(N), np.array(B)


def tube(path, rx, ry=None, seg=24, up=(0, 1, 0), caps=True, uv=False, twist=None):
    """Elliptic tube along a polyline. rx/ry: scalar or per-point radii. UV: u around (seam duplicated), v along."""
    P = np.asarray(path, dtype=np.float64)
    n = len(P)
    rx = np.broadcast_to(np.asarray(rx, dtype=np.float64), (n,))
    ry = rx if ry is None else np.broadcast_to(np.asarray(ry, dtype=np.float64), (n,))
    _, N, B = frames(P, up)
    cols = seg + 1 if uv else seg
    V, UV = [], []
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    for k in range(n):
        for i in range(cols):
            a = 2 * math.pi * i / seg + (twist[k] if twist is not None else 0)
            V.append(P[k] + N[k] * math.cos(a) * rx[k] + B[k] * math.sin(a) * ry[k])
            UV.append((i / seg, L[k] / max(L[-1], 1e-9)))
    F = []
    for k in range(n - 1):
        for i in range(seg):
            a, b = k * cols + i, k * cols + (i + 1) % cols if not uv else k * cols + i + 1
            F.append((a, b, b + cols, a + cols))
    V = list(V)
    if caps:
        c0 = len(V)
        V.append(P[0])
        UV.append((0.5, 0))
        c1 = len(V)
        V.append(P[-1])
        UV.append((0.5, 1))
        for i in range(seg):
            j = (i + 1) % cols if not uv else i + 1
            F.append((c0, j, i))
            F.append((c1, (n - 1) * cols + i, (n - 1) * cols + j))
    return (np.array(V), F, np.array(UV)) if uv else (np.array(V), F)


def cone(base, tip, r, seg=8, rings=4, bend=(0, 0, 0)):
    """Tapered, optionally bent spike (teeth, spines). bend: offset at the tip, quadratic along the length."""
    base, tip, bend = (np.asarray(v, dtype=np.float64) for v in (base, tip, bend))
    t = np.linspace(0, 1, rings + 1)
    path = base[None] + (tip - base)[None] * t[:, None] + bend[None] * (t ** 2)[:, None]
    rad = r * (1 - t) ** 0.9 + 0.0004
    return tube(path, rad, seg=seg, caps=True)


def merge(parts):
    V, F, off = [], [], 0
    for v, f in parts:
        V.append(np.asarray(v, dtype=np.float64))
        F.extend(tuple(x + off for x in face) for face in f)
        off += len(v)
    return np.concatenate(V), F


# --------------------------------------------------------------------------- scene / objects
_S = {}


def begin(name):
    if bpy.app.background or bpy.context.window is None:
        sc = bpy.context.scene
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        old = bpy.data.scenes.get('Creature_' + name)
        if old and bpy.context.window.scene == old:
            bpy.context.window.scene = next(s for s in bpy.data.scenes if s != old) if len(bpy.data.scenes) > 1 else bpy.data.scenes.new('Scene')
        if old:
            for o in list(old.objects):
                if len(o.users_scene) <= 1:
                    bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.scenes.remove(old)
        sc = bpy.data.scenes.new('Creature_' + name)
        bpy.context.window.scene = sc
    sc.name = 'Creature_' + name
    sc.render.fps = FPS
    _S['scene'] = sc
    return sc


def scene():
    return _S['scene']


def link(o):
    scene().collection.objects.link(o)
    return o


def select_only(objs, active=None):
    vl = bpy.context.view_layer
    for o in scene().objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or objs[0]


def mesh_obj(name, V, F, uv=None, smooth=True):
    """Object from three-space arrays; uv: per-vertex (n, 2)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in to_b(V)], [], [tuple(f) for f in F])
    me.validate(clean_customdata=False)
    if uv is not None:
        lay = me.uv_layers.new(name='UVMap')
        lv = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get('vertex_index', lv)
        lay.data.foreach_set('uv', np.asarray(uv, dtype=np.float32)[lv].ravel())
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    return link(o)


def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear()
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def remesh(o, voxel, smooth=0, factor=0.5):
    m = o.modifiers.new('rm', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.adaptivity = 0.0
    m.use_smooth_shade = True
    if smooth:
        s = o.modifiers.new('sm', 'SMOOTH')
        s.factor = factor
        s.iterations = smooth
    return apply_mods(o)


def boolean(o, cutter, op='DIFFERENCE'):
    m = o.modifiers.new('b', 'BOOLEAN')
    m.operation = op
    m.solver = 'EXACT'
    m.object = cutter
    cutter.hide_render = True
    apply_mods(o)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)
    return o


def arrays(o):
    me = o.data
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    nr = np.empty(n * 3, dtype=np.float32)
    me.vertex_normals.foreach_get('vector', nr)
    return to_t(co.reshape(-1, 3)), to_t(nr.reshape(-1, 3))


def set_co(o, P):
    o.data.vertices.foreach_set('co', to_b(P).astype(np.float32).ravel())
    o.data.update()


def edges(o):
    E = np.empty(len(o.data.edges) * 2, dtype=np.int64)
    o.data.edges.foreach_get('vertices', E)
    return E.reshape(-1, 2)


def neighbour_mean(X, E, n):
    acc = np.zeros((n,) + X.shape[1:])
    deg = np.zeros(n)
    np.add.at(acc, E[:, 0], X[E[:, 1]])
    np.add.at(acc, E[:, 1], X[E[:, 0]])
    np.add.at(deg, E[:, 0], 1)
    np.add.at(deg, E[:, 1], 1)
    return acc / np.maximum(deg, 1).reshape((-1,) + (1,) * (X.ndim - 1))


def curvature(o, smooth=2):
    """Per-vertex signed mean-curvature proxy in [0, 1]: 0.5 flat, > 0.5 cavity, < 0.5 convex edge."""
    P, N = arrays(o)
    E = edges(o)
    n = len(P)
    el = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1).mean()
    c = np.einsum('ij,ij->i', neighbour_mean(P, E, n) - P, N) / (el + 1e-9)
    for _ in range(smooth):
        c = 0.5 * c + 0.5 * neighbour_mean(c, E, n)
    s = np.percentile(np.abs(c), 98) + 1e-9
    return np.clip(0.5 + 0.5 * c / s, 0, 1)


def displace(o, fn, ctx=None):
    P, N = arrays(o)
    d = fn(P, N, ctx if ctx is not None else {})
    set_co(o, P + N * d[:, None])
    return P, N


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def copy_obj(o, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    return link(c)


def decimate(o, target):
    t = tris(o)
    if t > target:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = target / t
        m.use_collapse_triangulate = True
        apply_mods(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def unwrap(o, angle=62, margin=0.004):
    if not o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')
    select_only([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception as e:
        log('average islands', e)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def seam_unwrap(o, label_fn, margin=0.004):
    """Seams between face groups (label_fn(centroids3, normals3) -> int per face), angle-based unwrap, pack.
    Compact, roughly rectangular islands pack far better than smart-project's 5 m strips."""
    if not o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    cen = to_t(np.array([f.calc_center_median()[:] for f in bm.faces]))
    nrm = to_t(np.array([f.normal[:] for f in bm.faces]))
    lab = np.asarray(label_fn(cen, nrm))
    idx = {f: int(l) for f, l in zip(bm.faces, lab)}
    for e in bm.edges:
        lf = e.link_faces
        e.seam = len(lf) == 2 and idx[lf[0]] != idx[lf[1]]
    bm.to_mesh(o.data)
    bm.free()
    select_only([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    log('seam unwrap', o.name, 'islands', len(np.unique(lab)))


def set_attr(o, name, rgb, alpha=None):
    me = o.data
    a = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    rgb = np.asarray(rgb, dtype=np.float64)
    if rgb.ndim == 1:
        rgb = np.repeat(rgb[:, None], 3, 1)
    al = np.ones((len(rgb), 1)) if alpha is None else np.asarray(alpha, dtype=np.float64).reshape(-1, 1)
    rgba = np.concatenate([rgb, al], 1).astype(np.float32)
    a.data.foreach_set('color', rgba.ravel())


# --------------------------------------------------------------------------- skin authoring (deep-sea animal)
# Linear albedo palette. Deep-sea fish are dark and low-saturation: brown-grey backs, sooty violet blotches,
# grey (not pink) bellies; pale only where tissue is dead, scarred, crusted or thin.
# Under the near-coaxial headlamp and the 2.95 film exposure, pale patches more than ~2.5x the back read as
# white "cow" spots, so rot/scar/crust stay within that ratio and the back carries the hue (brown / violet).
PAL = dict(brown=np.array([.048, .03, .02]), soot=np.array([.017, .008, .02]), belly=np.array([.06, .053, .044]),
           rot=np.array([.13, .12, .1]), scar=np.array([.092, .08, .066]), wound=np.array([.04, .012, .009]),
           crust=np.array([.088, .078, .058]), flesh=np.array([.045, .013, .014]), gullet=np.array([.006, .002, .003]),
           horn=np.array([.02, .017, .014]))


def mix(a, b, t):
    t = np.asarray(t, dtype=np.float64)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1 - t) + np.asarray(b) * t


def pick_sites(P, n, seed, weight=None, min_sep=0.0):
    """n vertex indices drawn by weight, optionally at least min_sep apart (greedy)."""
    rng = np.random.default_rng(seed)
    w = np.ones(len(P)) if weight is None else np.clip(np.asarray(weight, dtype=np.float64), 0, None)
    w = w / w.sum()
    cand = rng.choice(len(P), size=n * 6, p=w)
    out = []
    for i in cand:
        if all(np.linalg.norm(P[i] - P[j]) >= min_sep for j in out):
            out.append(int(i))
        if len(out) >= n:
            break
    return out


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t


def scar_field(P, N, seed, n, length=(.08, .32), width=(.004, .011), weight=None):
    """Healed and fresh scars: wiggly 3-segment cuts across the surface.
    Returns ridge (0..1 raised scar line), halo (wider puckered skin), fresh (0..1, 1 = recent dark wound)."""
    rng = np.random.default_rng(seed)
    ridge, halo, fresh = np.zeros(len(P)), np.zeros(len(P)), np.zeros(len(P))
    for i in pick_sites(P, n, seed, weight, .05):
        c, nn = P[i], N[i]
        t = np.cross(nn, rng.normal(size=3))
        t /= np.linalg.norm(t) + 1e-9
        b = np.cross(nn, t)
        L = rng.uniform(*length)
        w = rng.uniform(*width)
        pts = [c - t * L / 2]
        for k in range(3):
            pts.append(pts[-1] + t * L / 3 + b * rng.normal() * L * .12)
        near = np.linalg.norm(P - c, axis=1) < L
        if not near.any():
            continue
        Pi, Ni = P[near], N[near]
        facing = np.clip((Ni @ nn - .2) / .5, 0, 1)
        d = np.full(len(Pi), 9.0)
        along = np.zeros(len(Pi))
        for k in range(3):
            dk, tk = seg_dist(Pi, pts[k], pts[k + 1])
            m = dk < d
            d[m], along[m] = dk[m], (k + tk[m]) / 3
        taper = np.sin(np.clip(along, 0, 1) * np.pi) ** .5
        r = np.exp(-(d / (w * taper + 1e-4)) ** 2) * facing
        h = np.exp(-(d / (w * 3.5)) ** 2) * facing
        ridge[near] = np.maximum(ridge[near], r)
        halo[near] = np.maximum(halo[near], h)
        if rng.random() < .3:
            fresh[near] = np.maximum(fresh[near], r)
    return ridge, halo, fresh


def parasite_field(P, N, seed, n, rad=(.008, .022), weight=None, cluster=(2, 6)):
    """Barnacle/copepod-like crusts: clusters of small cratered cones. Returns height (m), cover (0..1), crater (0..1)."""
    rng = np.random.default_rng(seed)
    hgt, cover, crater = np.zeros(len(P)), np.zeros(len(P)), np.zeros(len(P))
    for i in pick_sites(P, n, seed, weight, .06):
        c0, n0 = P[i], N[i]
        t = np.cross(n0, rng.normal(size=3))
        t /= np.linalg.norm(t) + 1e-9
        b = np.cross(n0, t)
        for k in range(int(rng.integers(*cluster))):
            R = rng.uniform(*rad) * (1 if k == 0 else rng.uniform(.4, .8))
            c = c0 + (t * rng.normal() + b * rng.normal()) * R * 1.6 * (k > 0)
            near = np.linalg.norm(P - c, axis=1) < R * 1.4
            if not near.any():
                continue
            q = np.linalg.norm(P[near] - c, axis=1) / R
            facing = np.clip((N[near] @ n0 - .3) / .4, 0, 1)
            body = sstep(1.15, .55, q) * facing
            pit = np.exp(-(q / .32) ** 2) * facing
            hgt[near] = np.maximum(hgt[near], (body * .75 - pit * .45) * R)
            cover[near] = np.maximum(cover[near], sstep(1.25, .9, q) * facing)
            crater[near] = np.maximum(crater[near], pit)
    return hgt, cover, crater


def patch_field(P, N, seed, n, rad=(.06, .14), weight=None):
    """A few irregular patches (dead skin, sloughing): noisy-edged discs on the surface, 0..1."""
    rng = np.random.default_rng(seed)
    out = np.zeros(len(P))
    edge = fbm(P * 22, 3, seed=seed + 5)
    for i in pick_sites(P, n, seed, weight, .2):
        R = rng.uniform(*rad)
        near = np.linalg.norm(P - P[i], axis=1) < R * 1.8
        q = np.linalg.norm(P[near] - P[i], axis=1) / R + (edge[near] - .5) * .9
        out[near] = np.maximum(out[near], sstep(1.0, .7, q) * np.clip((N[near] @ N[i] - .1) / .4, 0, 1))
    return out


def hue_vary(P, col, seed, amount=1.0):
    """Regional hue drift between warm brown and cold violet (keeps luminance)."""
    h = fbm(P * 1.1, 3, seed=seed) - .5
    tint = np.stack([1 + .5 * h, 1 - .1 * np.abs(h), 1 - .45 * h], 1)
    return col * (1 + (tint - 1) * amount)


def wet_rough(P, seed, wet_bias=0.0, cav=None, extra_wet=None, extra_dry=None):
    """Roughness with strong contrast: slime-wet sheets (~.2) against dry, matte skin (~.82).
    Wet stays at ~.2 or above: below that the GGX peak under a near spot blows out into bloom."""
    warp = (fbm(P * 1.3, 2, seed=seed + 1) - .5)[:, None]
    # ~30 % coverage: slime sheets and runs, the rest dry
    wet = sstep(.52, .62, fbm(P * np.array([2.2, 2.6, 1.6]) + warp, 4, seed=seed) + wet_bias)
    if cav is not None:
        wet = np.maximum(wet, sstep(.7, .92, cav) * .6)
    if extra_wet is not None:
        wet = np.maximum(wet, extra_wet)
    if extra_dry is not None:
        wet = wet * (1 - extra_dry)
    streak = ridged(P * np.array([5, 18, 4]), 2, seed=seed + 7)
    r = .84 - .62 * wet + .07 * (fbm(P * 24, 2, seed=seed + 3) - .5) - .06 * streak * wet
    return np.clip(r, .18, .95), wet


# --------------------------------------------------------------------------- cycles + bake
def use_cycles(samples=32):
    sc = scene()
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for dev in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                prefs.compute_device_type = dev
                prefs.get_devices()
                if any(d.type == dev for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == dev
                    sc.cycles.device = 'GPU'
                    log('cycles device', dev)
                    break
            except TypeError:
                continue
    except Exception as e:
        log('gpu setup failed, CPU', e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False


def _img(name, res, float_buffer=True):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, res, res, alpha=False, float_buffer=float_buffer)
    im.colorspace_settings.name = 'Non-Color'
    return im


def pixels(im):
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def save_png(path, arr, name='lv_creature_tmp', quality=100):
    """arr (h, w, 3|4) already encoded (sRGB for colour); written as-is. The suffix picks the format:
    .png lossless, .webp lossy at `quality` < 100 or lossless (VP8L) at 100."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), dtype=arr.dtype)], 2)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    path = Path(path)
    im.filepath_raw = str(path)
    im.file_format = 'WEBP' if path.suffix == '.webp' else 'PNG'
    try:
        im.save(filepath=str(path), quality=int(quality))
    except TypeError:
        im.save()
    bpy.data.images.remove(im)
    return path


def save_skin_maps(gen, maps, ao_floor=.45, thin_from='thick', emit_tint=None, reflectance=.15):
    """Standard body map set from bake(): colour.webp (sRGB albedo x AO, alpha = thinness), normal.webp
    (lossless), orm.png (R occlusion, G roughness, B 0).
    reflectance scales the painted palette down to deep-sea skin (ultra-black fish skin reflects ~0.5-3 %):
    under the living-deck probe lamp (living-render 'recording', exposure 2.95) a linear albedo of .002
    already reads as dark grey at 3 m, so the palette's .05-.2 values must not ship as-is."""
    ao = maps['ao'][..., 0]
    res = ao.shape[0]
    alb = maps['alb'][..., :3] * (ao_floor + (1 - ao_floor) * ao[..., None]) * reflectance
    thin = 1 - maps[thin_from][..., 0] if thin_from in maps else np.zeros_like(ao)
    thin = np.kron(thin, np.ones((res // thin.shape[0], res // thin.shape[0]))) if thin.shape[0] != res else thin
    save_png(gen / 'body_color.webp', np.concatenate([lin2srgb(alb), np.clip(thin, 0, 1)[..., None]], -1), quality=90)
    save_png(gen / 'body_normal.webp', maps['normal'][..., :3], quality=100)
    r = maps['rough'].shape[0]
    save_png(gen / 'body_orm.png', np.stack([resize(ao[..., None], r)[..., 0], maps['rough'][..., 0], np.zeros((r, r))], -1))
    save_png(gen / 'body_curv.png', np.repeat(maps['curv'][..., :1], 3, -1))
    if emit_tint is not None and 'emit' in maps:
        save_png(gen / 'body_emit.webp', lin2srgb(maps['emit'][..., :1] * np.asarray(emit_tint)), quality=92)
    return {k: gen / f'body_{k}.{e}' for k, e in (('color', 'webp'), ('normal', 'webp'), ('orm', 'png'), ('emit', 'webp'))}


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def srgb2lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def resize(arr, res):
    h = arr.shape[0]
    if h == res:
        return arr
    k = h // res
    return arr.reshape(res, k, res, k, -1).mean(axis=(1, 3))


def bake(low, high, gen, res=2048, ext=0.02, maxd=0.06, ao_dist=0.25, passes=('normal', 'alb', 'ao', 'rough', 'curv', 'emit', 'thick'), samples=24, thick_dist=.06):
    """Selected-to-active bakes; returns {pass: float array (res, res, 4)} (linear values)."""
    use_cycles(samples)
    sc = scene()
    sc.render.bake.margin = 16
    sc.render.bake.use_clear = True
    hm = bpy.data.materials.new(high.name + '_bake')
    hm.use_nodes = True
    nt = hm.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    src = {}
    for a in ('alb', 'rough', 'curv', 'emit'):
        if high.data.color_attributes.get(a):
            nd = nt.nodes.new('ShaderNodeAttribute')
            nd.attribute_name = a
            src[a] = nd.outputs['Color']
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.only_local = True
    ao.samples = 24
    ao.inputs['Distance'].default_value = ao_dist
    src['ao'] = ao.outputs['AO']
    # inside AO: rays go into the body; thin tissue (lips, gill flaps, fin roots) is hit within thick_dist -> dark
    th = nt.nodes.new('ShaderNodeAmbientOcclusion')
    th.only_local = True
    th.inside = True
    th.samples = 16
    th.inputs['Distance'].default_value = thick_dist
    src['thick'] = th.outputs['AO']
    high.data.materials.clear()
    high.data.materials.append(hm)
    lm = bpy.data.materials.new(low.name + '_bake')
    lm.use_nodes = True
    tex = lm.node_tree.nodes.new('ShaderNodeTexImage')
    lm.node_tree.nodes.active = tex
    low.data.materials.clear()
    low.data.materials.append(lm)
    select_only([low, high], active=low)
    res_out = {}
    gen.mkdir(parents=True, exist_ok=True)
    for p in passes:
        if p != 'normal' and p not in src:
            continue
        r = res if p in ('normal', 'alb', 'ao') else res // 2
        im = _img(f'{low.name}_{p}', r)
        tex.image = im
        t0 = time.time()
        if p == 'normal':
            sc.cycles.samples = 4
            sc.render.bake.normal_space = 'TANGENT'
            bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=ext, max_ray_distance=maxd, margin=16, use_clear=True)
        else:
            for l in list(em.inputs['Color'].links):
                nt.links.remove(l)
            nt.links.new(src[p], em.inputs['Color'])
            sc.cycles.samples = samples if p in ('ao', 'thick') else 4
            bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=ext, max_ray_distance=maxd, margin=16, use_clear=True)
        res_out[p] = pixels(im).copy()
        log(f'baked {low.name}/{p} {r}px {time.time() - t0:.1f}s')
        bpy.data.images.remove(im)
    return res_out


# --------------------------------------------------------------------------- export materials
_GLTF_GROUP = 'glTF Material Output'


def gltf_group():
    g = bpy.data.node_groups.get(_GLTF_GROUP)
    if g is None:
        g = bpy.data.node_groups.new(_GLTF_GROUP, 'ShaderNodeTree')
    names = [s.name for s in g.interface.items_tree if getattr(s, 'in_out', None) == 'INPUT']
    for nm in ('Occlusion', 'Thickness'):
        if nm not in names:
            s = g.interface.new_socket(nm, in_out='INPUT', socket_type='NodeSocketFloat')
            s.default_value = 1.0 if nm == 'Occlusion' else 0.0
    return g


def load_image(path, color=True):
    im = bpy.data.images.load(str(path), check_existing=False)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return im


def material(name, color=None, orm=None, normal=None, emit=None, base=(0.5, 0.5, 0.5), rough=0.5, metal=0.0,
             emit_color=None, emit_strength=1.0, alpha=None, normal_strength=1.0, double=False, vcol=None):
    """Plain Principled export material. color/orm/normal/emit: image paths; alpha: True (colour alpha) or float;
    vcol: colour attribute name driving Base Color (exported as COLOR_0)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if vcol:
        a = nt.nodes.new('ShaderNodeVertexColor')
        a.layer_name = vcol
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    if color:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = load_image(color)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha is True:
            t.image.alpha_mode = 'STRAIGHT'
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    if isinstance(alpha, float):
        bsdf.inputs['Alpha'].default_value = alpha
    if alpha is not None:
        m.surface_render_method = 'BLENDED'
    if orm:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = load_image(orm, False)
        sp = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sp.inputs[0])
        nt.links.new(sp.outputs[1], bsdf.inputs['Roughness'])
        gn = nt.nodes.new('ShaderNodeGroup')
        gn.node_tree = gltf_group()
        nt.links.new(sp.outputs[0], gn.inputs['Occlusion'])
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = load_image(normal, False)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emit:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = load_image(emit)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    elif emit_color:
        bsdf.inputs['Emission Color'].default_value = (*emit_color, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    m.use_backface_culling = not double
    return m


def assign(o, mat):
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.material_index = 0


# --------------------------------------------------------------------------- rig + clips
def armature(name, bones):
    """bones: [(name, head3, tail3, parent)] in three space."""
    ad = bpy.data.armatures.new(name)
    arm = link(bpy.data.objects.new(name, ad))
    select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    for n, h, t, _ in bones:
        eb = ad.edit_bones.new(n)
        eb.head, eb.tail = vb(h), vb(t)
    for n, _, _, p in bones:
        if p:
            ad.edit_bones[n].parent = ad.edit_bones[p]
            ad.edit_bones[n].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def normalise_weights(W, k=4):
    W = np.asarray(W, dtype=np.float64).copy()
    if W.shape[1] > k:
        idx = np.argsort(-W, axis=1)[:, k:]
        np.put_along_axis(W, idx, 0.0, axis=1)
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)


def skin(o, arm, names, W):
    W = normalise_weights(W)
    for b, n in enumerate(names):
        if n not in o.vertex_groups:
            o.vertex_groups.new(name=n)
        vg = o.vertex_groups[n]
        idx = np.nonzero(W[:, b] > 1e-4)[0]
        # group vertices by quantised weight: one call per weight level instead of per vertex
        q = np.round(W[idx, b] * 1000).astype(np.int64)
        for lvl in np.unique(q):
            vg.add([int(i) for i in idx[q == lvl]], float(lvl) / 1000, 'REPLACE')
    o.parent = arm
    m = o.modifiers.new('rig', 'ARMATURE')
    m.object = arm


def chain_weights(coord, n_bones, sharp=1.0):
    """Hat weights along a 1D bone coordinate (0..n_bones, bone b covers [b, b+1]); smoothstep blending."""
    c = np.clip(np.asarray(coord, dtype=np.float64) - 0.5, 0, n_bones - 1)
    i0 = np.floor(c).astype(np.int64)
    i1 = np.minimum(i0 + 1, n_bones - 1)
    f = c - i0
    f = f * f * (3 - 2 * f) if sharp else f
    W = np.zeros((len(c), n_bones))
    W[np.arange(len(c)), i0] += 1 - f
    W[np.arange(len(c)), i1] += f
    return W


def seg_weights(P, segs, power=4.0, eps=0.02):
    """Inverse-distance-to-segment weights; segs: [(head3, tail3)]."""
    P = np.asarray(P, dtype=np.float64)
    W = np.zeros((len(P), len(segs)))
    for k, (a, c) in enumerate(segs):
        a, c = np.asarray(a, dtype=np.float64), np.asarray(c, dtype=np.float64)
        ab = c - a
        t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        W[:, k] = 1.0 / (d + eps) ** power
    return W


def bone_q(arm, bone, rots):
    """Local pose quaternion for rotations about three-space axes [(axis3, radians)], applied in order."""
    M = arm.data.bones[bone].matrix_local.to_3x3().inverted()
    q = Quaternion()
    for ax, ang in rots:
        a = M @ vb(ax)
        a.normalize()
        q = Quaternion(a, ang) @ q
    return q


def bone_loc(arm, bone, off3):
    M = arm.data.bones[bone].matrix_local.to_3x3().inverted()
    return M @ vb(off3)


def clip(arm, name, frames, pose_fn):
    """pose_fn(t in [0, 1]) -> {bone: [(axis3, angle), ...] | ('loc', off3, rots)}; frame frames+1 == frame 1."""
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    names = [b.name for b in arm.pose.bones]
    for f in range(frames + 1):
        pose = pose_fn(f / frames)
        for bn in names:
            pb = arm.pose.bones[bn]
            pb.rotation_mode = 'QUATERNION'
            spec = pose.get(bn, [])
            loc = (0, 0, 0)
            if isinstance(spec, tuple) and spec and spec[0] == 'loc':
                _, loc, spec = spec
            pb.rotation_quaternion = bone_q(arm, bn, spec)
            pb.location = bone_loc(arm, bn, loc)
            pb.keyframe_insert('rotation_quaternion', frame=f + 1)
            pb.keyframe_insert('location', frame=f + 1)
    tr = ad.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    ad.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    return act


UP, SIDE = (0, 1, 0), (1, 0, 0)


def eel_rig(name, J, extra=()):
    """Fish/eel rig along local z. J: joint z values [snout tip, neck, ..., tail tip]. 'root' sits at the neck,
    'head' runs neck -> snout, 'spineNN' run neck -> tail, so head and body motions pivot at the neck."""
    neck = J[1]
    bones = [('root', (0, 0, neck), (0, .08, neck), None), ('head', (0, 0, neck), (0, 0, J[0]), 'root')]
    prev = 'root'
    for i in range(1, len(J) - 1):
        n = f'spine{i:02d}'
        bones.append((n, (0, 0, J[i]), (0, 0, J[i + 1]), prev))
        prev = n
    bones += list(extra)
    arm = armature(name, bones)
    names = ['head'] + [f'spine{i:02d}' for i in range(1, len(J) - 1)]
    return arm, names


def eel_weights(z, J):
    return chain_weights(np.interp(z, J, np.arange(len(J))), len(J) - 1)


def wave_theta(J, L, t, amp_fn, k, cycles=1, head_scale=.6):
    """Absolute heading (radians) of each eel bone for a travelling lateral wave X(s,t) = A(s) sin(2πct - ks).
    J joints in z; L body length; s = (z - J[0]) / L. Returns (theta per bone, theta at the neck)."""
    J = np.asarray(J, dtype=np.float64)
    mids = (J[:-1] + J[1:]) / 2
    s = np.clip((mids - J[0]) / L, 0, 1)
    eps = 1e-3

    def X(ss):
        return amp_fn(ss) * np.sin(2 * np.pi * cycles * t - k * ss)

    th = np.arctan((X(s + eps) - X(s - eps)) / (2 * eps) / L)
    sn = (J[1] - J[0]) / L
    neck = float(np.arctan((X(sn + eps) - X(sn - eps)) / (2 * eps) / L))
    th[0] = neck + (th[0] - neck) * head_scale
    return th, neck


def eel_pose(names, th, neck, extra=None):
    out = {'root': [(UP, neck)], names[0]: [(UP, float(th[0]) - neck)]}
    prev = neck
    for i, n in enumerate(names[1:], 1):
        out[n] = [(UP, float(th[i]) - prev)]
        prev = float(th[i])
    for k, v in (extra or {}).items():
        out[k] = out.get(k, []) + list(v)
    return out


def fin_texture(path, base=(.014, .017, .02), ray=(.022, .026, .03), tip=(.02, .024, .028), alpha=.78, rays=24, size=(1024, 256), seed=3, reflectance=.4):
    """Fin membrane (u: along the fin, rays at constant u; v: base -> free edge), RGBA PNG, torn scalloped edge."""
    U, Vv = uv_grid(*size)
    n1 = tile_noise(U, Vv, 12, 4, seed)
    n2 = tile_noise(U, Vv, 30, 3, seed + 6)
    uw = U * rays + (n1 - .5) * .6
    r = (1 - np.abs(np.sin(np.pi * uw))) ** 6 * (1 - .5 * Vv)
    b = 1 - sstep(0, .35, Vv)
    col = np.asarray(base)[None, None] + r[..., None] * np.asarray(ray) + Vv[..., None] * np.asarray(tip)
    col *= (1 - .45 * n1[..., None]) * (1 - .3 * b[..., None])
    # large sooty blotches on the membrane and a pale, dead, frayed rim around the tears and the free edge
    blot = sstep(.5, .62, tile_noise(U, Vv, 5, 4, seed + 11))
    col *= (1 - .55 * blot)[..., None]
    edgev = Vv + (n1 - .5) * .14 + .05 * np.abs(np.sin(np.pi * uw))
    edge = 1 - sstep(.86, .99, edgev)
    torn = sstep(.66, .71, n2) * sstep(.45, .85, Vv)
    rot = np.clip(sstep(.8, .93, edgev) + (sstep(.63, .67, n2) - torn) * sstep(.55, .85, Vv), 0, 1)
    col = col * (1 - rot[..., None] * .5) + np.array([.09, .086, .076]) * rot[..., None] * .5
    a = np.clip((alpha + .22 * r - .2 * sstep(.4, .95, Vv) + .2 * b - .15 * rot) * edge * (1 - torn), 0, 1)
    return save_png(path, np.concatenate([lin2srgb(col * reflectance), a[..., None]], -1), quality=92)


def solo(arm, name, frame):
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != name
    scene().frame_set(frame)


# --------------------------------------------------------------------------- texture helpers (numpy canvases)
def uv_grid(w, h):
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    U, Vv = np.meshgrid(u, v)
    return U, Vv


def tile_noise(U, V, freq, octaves=4, seed=0):
    """Seamless (u-periodic) fbm on a canvas via a cylinder embedding."""
    a = U * 2 * np.pi
    P = np.stack([np.cos(a) * freq / (2 * np.pi), np.sin(a) * freq / (2 * np.pi), V * freq], -1).reshape(-1, 3)
    return fbm(P, octaves, seed).reshape(U.shape)


# --------------------------------------------------------------------------- teeth (vertex-coloured, irregular)
def teeth_mesh(specs, seed):
    """specs: [(root3, tip3, radius, bend3)]. Flattened, uneven, partly chipped cones with a vertex-colour ramp:
    dark gum at the root, stained yellow-grey dentine, a thin grey translucent tip; per-tooth grime and tint.
    Returns V, F, colour (n, 3 linear), thin (n,) for the alpha channel."""
    rng = np.random.default_rng(seed)
    V, F, Cc, Th, off = [], [], [], [], 0
    for root, tip, r, bend in specs:
        root, tip, bend = (np.asarray(v, dtype=np.float64) for v in (root, tip, bend))
        rings, seg = 7, 8
        chip = rng.random() < .22
        tt = np.linspace(0, .62 if chip else 1, rings + 1)
        path = root[None] + (tip - root)[None] * tt[:, None] + bend[None] * (tt ** 2)[:, None]
        wob = 1 + (rng.random(rings + 1) - .5) * .25
        rad = (r * (1 - tt) ** .85 + (r * .32 if chip else .0004)) * wob
        flat = rng.uniform(.5, .75)
        v, f = tube(path, rad, rad * flat, seg=seg, caps=True)
        t = np.concatenate([np.repeat(tt, seg), [0, tt[-1]]])
        # fluted, pitted enamel: radial noise around the ring centre
        cen = np.concatenate([np.repeat(path, seg, 0), path[[0, -1]]])
        radial = v - cen
        nz = fbm(v * 420 + rng.random(3) * 7, 2, seed=int(rng.integers(1e6))) - .5
        flute = np.concatenate([np.tile(np.sin(np.arange(seg) / seg * 2 * np.pi * 3 + rng.random() * 6), rings + 1), [0, 0]])
        v = cen + radial * (1 + .35 * nz + .12 * flute)[:, None]
        stain = rng.uniform(.55, 1.1)
        g = fbm(v * 160 + rng.random(3) * 9, 2, seed=int(rng.integers(1e6)))
        gum = np.array([.006, .0025, .002])
        dentine = np.array([.014, .0125, .009]) * stain
        enamel = np.array([.026, .026, .024]) * (.8 + .3 * rng.random())
        col = mix(gum[None], dentine, sstep(.04, .18, t))
        col = mix(col, enamel, sstep(.45, .95, t) * (0.6 if chip else 1))
        grime = np.clip(sstep(.45, .7, g) * (1 - sstep(.75, 1, t)) * .8 + sstep(.0, .3, -t + .3) * .5, 0, 1)
        col = mix(col, np.array([.004, .003, .002]), grime)
        col = mix(col, np.array([.007, .006, .004]), sstep(.62, .7, fbm(v * 600, 2, seed=int(rng.integers(1e6)))) * .6)
        V.append(v)
        F.extend(tuple(i + off for i in face) for face in f)
        Cc.append(col)
        Th.append(np.clip(sstep(.3, 1, t) * (.6 if chip else 1), 0, 1))
        off += len(v)
    return np.concatenate(V), F, np.concatenate(Cc), np.concatenate(Th)


# --------------------------------------------------------------------------- export + report + preview
def _enum(op_props, prop, want, fallback):
    try:
        ids = [i.identifier for i in op_props[prop].enum_items]
        return want if want in ids else fallback
    except Exception:
        return want


def export(name, objs, lod=False):
    path = OUT / f'living-creature-{name}{".lod1" if lod else ""}.glb'
    select_only(objs)
    rna = bpy.ops.export_scene.gltf.get_rna_type().properties
    props = rna.keys()
    kw = dict(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_skins=True,
              export_animations=not lod, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_optimize_animation_size=True,
              export_image_format=_enum(rna, 'export_image_format', 'NONE' if lod else 'AUTO', 'AUTO'),
              export_image_webp_fallback=False, export_cameras=False, export_lights=False, export_apply=False,
              export_def_bones=False, export_anim_slide_to_zero=True)
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    bpy.ops.export_scene.gltf(**kw)
    log('exported', path, path.stat().st_size)
    return path


def make_lod(name, meshes, arm, ratio=.3, ratios=None):
    """LOD1: decimated copies on the same armature (skin weights interpolated by Decimate), exported without
    textures and clips. The game binds these meshes to the LOD0 skeleton and reuses LOD0 materials by name."""
    ratios = ratios or {}
    lods = []
    for o in meshes:
        c = o.copy()
        c.data = o.data.copy()
        c.name = o.name + '_lod1'
        link(c)
        rig = [(m.name, m.object) for m in c.modifiers if m.type == 'ARMATURE']
        for m in list(c.modifiers):
            c.modifiers.remove(m)
        m = c.modifiers.new('dec', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = ratios.get(o.name, ratio)
        m.use_collapse_triangulate = True
        apply_mods(c)
        for nm, ob in rig:
            c.modifiers.new(nm, 'ARMATURE').object = ob
        lods.append(c)
    path = export(name, lods + [arm], lod=True)
    info = dict(file=path.name, bytes=path.stat().st_size, triangles={c.name: tris(c) for c in lods}, totalTriangles=sum(tris(c) for c in lods))
    for c in lods:
        me = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    log('lod1', json.dumps({k: info[k] for k in ('totalTriangles', 'bytes')}))
    return info


def bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3) @ np.array(ev.matrix_world.to_3x3()).T + np.array(ev.matrix_world.translation)
        pts.append(to_t(co))
        ev.to_mesh_clear()
    P = np.concatenate(pts)
    return P.min(0), P.max(0)


def report(name, meshes, arm, clips, textures, path, extra=None):
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    arm.data.pose_position = 'POSE'
    rep = dict(asset=f'living-creature-{name}', units='metres',
               axes='Three.js local, +Y up (Blender authored as (x,-z,y), glTF +Y up)',
               triangles={o.name: tris(o) for o in meshes}, totalTriangles=sum(tris(o) for o in meshes),
               bounds=dict(min=[round(float(v), 3) for v in lo], max=[round(float(v), 3) for v in hi],
                           size=[round(float(v), 3) for v in hi - lo]),
               bones=[b.name for b in arm.data.bones], clips={k: round(v / FPS, 3) for k, v in clips.items()},
               textures=textures, bytes=path.stat().st_size,
               build=f'tools/blender/build-living-creature-{name}.py', previews=f'qa/living/creatures-r4/blender/{name}-*.png',
               sources='public/assets/deepsea/living/SOURCES.md', built=time.strftime('%Y-%m-%d %H:%M'))
    if extra:
        rep.update(extra)
    (OUT / f'living-creature-{name}.json').write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding='utf8')
    log('report', json.dumps({k: rep[k] for k in ('totalTriangles', 'bounds', 'clips', 'bytes')}))
    return rep


def preview(name, arm, focus, radius, views, poses, size=(1100, 700), samples=48):
    """Cycles renders of the rigged asset: dark (lamp + cyan rim in thin scattering water) and neutral passes.
    views: {tag: dir3 (from focus towards camera)}; poses: [(clip, frame)]."""
    sc = scene()
    use_cycles(samples)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('creature_world')
    world.use_nodes = True
    sc.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    camd = bpy.data.cameras.new('creature_cam')
    cam = link(bpy.data.objects.new('creature_cam', camd))
    sc.camera = cam
    temp = []

    def light(kind, pos, energy, color, size_=0.2, spot=None, target=None):
        ld = bpy.data.lights.new('creature_l', kind)
        ld.energy = energy
        ld.color = color
        ld.shadow_soft_size = size_
        if spot:
            ld.spot_size = math.radians(spot)
            ld.spot_blend = 0.5
        lo = link(bpy.data.objects.new('creature_l', ld))
        lo.location = pos
        if target is not None:
            lo.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        temp.append(lo)
        return lo

    c = vb(focus)
    outs = []
    for clip_name, frame in poses:
        solo(arm, clip_name, frame)
        for tag, d in views.items():
            dv = vb(d).normalized()
            camd.angle = math.radians(38)
            dist = radius / math.sin(math.radians(19))
            cam.location = c + dv * dist
            cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
            camd.clip_end = dist * 6
            right = dv.cross(Vector((0, 0, 1))).normalized()
            for mode in ('dark', 'neutral'):
                for o in temp:
                    bpy.data.objects.remove(o, do_unlink=True)
                temp.clear()
                if mode == 'dark':
                    bg.inputs['Color'].default_value = (0.002, 0.006, 0.008, 1)
                    bg.inputs['Strength'].default_value = 1
                    light('SPOT', cam.location + right * radius * 0.3 + Vector((0, 0, radius * 0.2)), 900 * radius * radius, (1.0, 0.94, 0.84), 0.06, 40, c)
                    light('POINT', c - dv * radius * 1.2 + Vector((0, 0, radius * 0.9)) - right * radius * 0.6, 260 * radius * radius, (0.35, 0.8, 0.9), 0.3)
                else:
                    bg.inputs['Color'].default_value = (0.3, 0.31, 0.32, 1)
                    bg.inputs['Strength'].default_value = 0.8
                    light('AREA', c + dv * radius * 2 + Vector((0, 0, radius * 1.6)) + right * radius, 700 * radius * radius, (1, 0.97, 0.92), radius * 1.2, None, c)
                p = QA / f'{name}-{clip_name}-{tag}-{mode}.png'
                sc.render.filepath = str(p)
                bpy.ops.render.render(write_still=True)
                outs.append(p)
                log('preview', p)
    for o in temp:
        bpy.data.objects.remove(o, do_unlink=True)
    for tr in arm.animation_data.nla_tracks:
        tr.mute = False
    return outs


def save_blend(name):
    try:
        bpy.data.libraries.write(str(BLEND_DIR / f'living-creature-{name}.blend'), {scene()}, fake_user=True, compress=True)
    except Exception as e:
        log('blend save failed', e)


def run(fn):
    t = time.time()
    try:
        fn()
    finally:
        log(f'total {time.time() - t:.0f}s')
