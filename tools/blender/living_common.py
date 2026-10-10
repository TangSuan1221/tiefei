"""Shared pipeline for the level-two (living deck) hero assets.

Authoring happens in game (Three.js) local coordinates: metres, +Y up, +X east,
+Z south. Every part is converted once with blender = (x, -z, y), so the glTF
exporter's +Y-up conversion hands the game back exactly the authored numbers.

Pipeline per asset: build bmesh parts -> procedural "authoring" shaders
(scanned CC0 detail, edge wear, AO grime, silt, biofilm, rust runs) ->
Cycles bake to a per-group atlas (base colour, ORM, tangent normal) ->
plain Principled export materials -> GLB -> JSON manifest -> re-import the
GLB and render a dark underwater pass plus a neutral pass.

Runs both inside a live Blender (MCP) and headless (`blender -b -P`).
"""
import bpy, bmesh, math, json, os, sys, random, time, hashlib
from mathutils import Vector, Matrix, Euler, Quaternion
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/deepsea/living'
SRC = OUT / 'src'
GEN = ROOT / 'assets/blender/living-gen'
BLEND_DIR = ROOT / 'assets/blender'
QA = ROOT / 'qa/living/blender'
VENDOR = ROOT / 'assets/blender/vendor'
FONT_CJK = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_STENCIL = 'C:/Windows/Fonts/bahnschrift.ttf'
for d in (OUT, SRC, GEN, QA):
    d.mkdir(parents=True, exist_ok=True)

C3 = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
C4 = C3.to_4x4()


def log(*a):
    print('[living]', *a, flush=True)


def b(p):
    return C3 @ Vector(p)


def M(pos=(0, 0, 0), rot=(0, 0, 0), scale=None, order='XYZ'):
    m = Matrix.Translation(Vector(pos)) @ Euler([math.radians(a) for a in rot], order).to_matrix().to_4x4()
    if scale is not None:
        s = scale if hasattr(scale, '__len__') else (scale, scale, scale)
        m = m @ Matrix.Diagonal((s[0], s[1], s[2], 1))
    return m


def look_at(pos, target, up=(0, 1, 0)):
    """Matrix whose local +Z points from pos to target (three space)."""
    z = (Vector(target) - Vector(pos)).normalized()
    upv = Vector(up)
    if abs(z.dot(upv)) > 0.99:
        upv = Vector((1, 0, 0))
    x = upv.cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(pos)
    return m


def axis_to(a, c):
    """Matrix mapping local +Y onto segment a->c, origin at a."""
    a, c = Vector(a), Vector(c)
    d = c - a
    q = Vector((0, 1, 0)).rotation_difference(d.normalized())
    m = q.to_matrix().to_4x4()
    m.translation = a
    return m, d.length


# --------------------------------------------------------------- scenes

_STATE = {'prev': None, 'scene': None, 'asset': None}


def begin_scene(name):
    if bpy.app.background or bpy.context.window is None:
        sc = bpy.context.scene
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        sc.name = name
    else:
        prev = bpy.context.window.scene
        old = bpy.data.scenes.get(name)
        if old:
            if old == prev:
                prev = next((s for s in bpy.data.scenes if s != old), None) or bpy.data.scenes.new('Scene')
                bpy.context.window.scene = prev
            purge_scene(old)
        sc = bpy.data.scenes.new(name)
        bpy.context.window.scene = sc
        _STATE['prev'] = prev
    _STATE['scene'] = sc
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    return sc


def purge_scene(sc):
    for o in list(sc.objects):
        if len(o.users_scene) <= 1:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)


def end_scene():
    prev = _STATE.get('prev')
    if prev and not bpy.app.background and bpy.context.window:
        try:
            bpy.context.window.scene = prev
        except ReferenceError:
            pass


def purge_prefix(prefix):
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.node_groups, bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.armatures, bpy.data.actions):
        for item in list(coll):
            if item.name.startswith(prefix) and item.users == 0:
                coll.remove(item)


def link(obj, sc=None):
    (sc or _STATE['scene']).collection.objects.link(obj)
    return obj


def view_layer():
    return _STATE['scene'].view_layers[0]


def select_only(objs, active=None):
    vl = view_layer()
    for o in _STATE['scene'].objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or (objs[0] if objs else None)


def use_cycles(sc, samples=32):
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        log('cycles unavailable', e)
        raise
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
                    break
            except TypeError:
                continue
    except Exception as e:
        log('gpu setup failed, CPU', e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False


# --------------------------------------------------------------- primitives (local three space)

def _new():
    return bmesh.new()


def _bevel_edges(bm, edges, width, segs=2, profile=0.5):
    if width <= 0 or not edges:
        return
    bmesh.ops.bevel(bm, geom=list(edges), offset=width, offset_type='OFFSET', segments=segs,
                    profile=profile, affect='EDGES', clamp_overlap=True, harden_normals=False)


def _sharp_edges(bm, angle_deg):
    lim = math.cos(math.radians(angle_deg))
    out = []
    for e in bm.edges:
        if len(e.link_faces) == 2:
            n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
            if n0.dot(n1) < lim:
                out.append(e)
        elif len(e.link_faces) == 1:
            pass
    return out


def box(sx, sy, sz, bevel=0.01, segs=2):
    bm = _new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    bevel = min(bevel, 0.45 * min(sx, sy, sz))
    if bevel > 0.0005:
        _bevel_edges(bm, bm.edges[:], bevel, segs)
    return bm


def cyl(r, h, segs=24, bevel=0.0, r2=None, caps=True, bsegs=2):
    """Cylinder along local +Y, centred on origin."""
    bm = _new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                          radius2=(r if r2 is None else r2), depth=h)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    if bevel > 0 and caps:
        bm.normal_update()
        _bevel_edges(bm, _sharp_edges(bm, 50), min(bevel, 0.45 * min(r, h)), bsegs)
    return bm


def lathe(profile, segs=32, smooth=True, close_top=True, close_bottom=True):
    """Revolve [(r, y), ...] around local +Y. r==0 makes a pole."""
    bm = _new()
    rings = []
    for (r, y) in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, y, 0))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), y, -r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for a, c in zip(rings, rings[1:]):
        if len(a) == 1 and len(c) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1:
                vs = (a[0], c[i], c[j])
            elif len(c) == 1:
                vs = (a[i], c[0], a[j])
            else:
                vs = (a[i], c[i], c[j], a[j])
            try:
                f = bm.faces.new(vs)
                f.smooth = smooth
            except ValueError:
                pass
    if close_bottom and len(rings[0]) > 1:
        f = bm.faces.new(list(reversed(rings[0])))
    if close_top and len(rings[-1]) > 1:
        f = bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def torus(R, r, segu=32, segv=12, arc=2 * math.pi):
    """Torus in local XZ plane (axis +Y)."""
    bm = _new()
    full = abs(arc - 2 * math.pi) < 1e-6
    nu = segu if full else segu + 1
    rings = []
    for i in range(nu):
        u = arc * i / segu
        cu, su = math.cos(u), math.sin(u)
        ring = []
        for j in range(segv):
            v = 2 * math.pi * j / segv
            rr = R + r * math.cos(v)
            ring.append(bm.verts.new((rr * cu, r * math.sin(v), -rr * su)))
        rings.append(ring)
    for i in range(segu):
        a, c = rings[i], rings[(i + 1) % nu]
        for j in range(segv):
            k = (j + 1) % segv
            f = bm.faces.new((a[j], c[j], c[k], a[k]))
            f.smooth = True
    if not full:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prism(pts, depth, bevel=0.0, segs=2):
    """Polygon in local XY extruded along Z (centred)."""
    bm = _new()
    lo = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    hi = [bm.verts.new((x, y, depth / 2)) for x, y in pts]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bm.normal_update()
        _bevel_edges(bm, _sharp_edges(bm, 40), bevel, segs)
    return bm


def rounded_rect(w, h, r, segs=4):
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(segs + 1):
            a = math.radians(a0 + 90 * i / segs)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle_pts(r, n, a0=0.0):
    return [(r * math.cos(a0 + 2 * math.pi * i / n), r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def _fillet_path(points, bend):
    pts = [Vector(p) for p in points]
    if bend <= 0 or len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        d0, d1 = (p0 - p1), (p2 - p1)
        l0, l1 = d0.length, d1.length
        if l0 < 1e-6 or l1 < 1e-6:
            continue
        d0n, d1n = d0 / l0, d1 / l1
        ang = d0n.angle(d1n)
        if ang > math.pi - 1e-3:
            out.append(p1)
            continue
        t = min(bend / math.tan(ang / 2), 0.49 * l0, 0.49 * l1)
        a, c = p1 + d0n * t, p1 + d1n * t
        n = 10
        for k in range(n + 1):
            s = k / n
            q = (1 - s) ** 2 * a + 2 * (1 - s) * s * p1 + s ** 2 * c
            out.append(q)
    out.append(pts[-1])
    return out


def sweep(points, radius, segs=20, bend=0.0, caps=True, radii=None, smooth_path=False):
    """Circle swept along a polyline (three space) with filleted corners."""
    path = _fillet_path(points, bend)
    if smooth_path:
        path = [Vector(p) for p in points]
    bm = _new()
    n = len(path)
    tangents = []
    for i in range(n):
        if i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = (path[i + 1] - path[i - 1])
        tangents.append(t.normalized())
    ref = Vector((0, 1, 0)) if abs(tangents[0].y) < 0.9 else Vector((1, 0, 0))
    nrm = tangents[0].cross(ref).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            q = tangents[i - 1].rotation_difference(tangents[i])
            nrm = (q @ nrm).normalized()
        bi = tangents[i].cross(nrm).normalized()
        rr = radius if radii is None else radii[min(i, len(radii) - 1)]
        rings.append([bm.verts.new(path[i] + (nrm * math.cos(2 * math.pi * k / segs) + bi * math.sin(2 * math.pi * k / segs)) * rr) for k in range(segs)])
    for a, c in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            f = bm.faces.new((a[k], a[j], c[j], c[k]))
            f.smooth = True
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def grid(w, h, nx, ny, fn=None, uv=True):
    """Plane in local XY (normal +Z) from -w/2..w/2, -h/2..h/2. fn(u, v, co) -> co."""
    bm = _new()
    uvl = bm.loops.layers.uv.new('UVMap') if uv else None
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            co = Vector(((u - 0.5) * w, (v - 0.5) * h, 0))
            if fn:
                co = fn(u, v, co)
            row.append(bm.verts.new(co))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            f.smooth = True
            if uvl:
                for loop, (a, c) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    loop[uvl].uv = (a / nx, c / ny)
    return bm


def thicken(bm, t):
    """Give an open sheet thickness t along its normals (cloth, paper, leaves)."""
    bm.normal_update()
    ret = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=t)
    return bm


def from_object(obj, keep=False):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    bm = _new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    if not keep:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and getattr(data, 'users', 1) == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)
    return bm


def bm_object(bm, name='lv_tmp'):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    o = bpy.data.objects.new(name, me)
    link(o)
    return o


def boolean(bm, cutters, op='DIFFERENCE'):
    """Exact boolean on bmeshes (local space). Returns new bmesh."""
    target = bm_object(bm, 'lv_tmp_bool')
    tmp = []
    for c in cutters:
        co = bm_object(c, 'lv_tmp_cut')
        co.hide_render = True
        tmp.append(co)
        m = target.modifiers.new('b', 'BOOLEAN')
        m.operation = op
        m.solver = 'EXACT'
        m.object = co
    out = from_object(target)
    for co in tmp:
        me = co.data
        bpy.data.objects.remove(co, do_unlink=True)
        bpy.data.meshes.remove(me)
    return out


def text_mesh(text, size, depth=0.0, font=FONT_CJK, align='CENTER', valign='CENTER', spacing=1.0, bevel=0.0):
    """Text lying in local XY facing +Z, height `size` (cap height approx)."""
    cu = bpy.data.curves.new('lv_tmp_text', 'FONT')
    cu.body = text
    fnt = load_font(font)
    cu.font = fnt
    cu.size = size
    cu.extrude = depth / 2
    cu.bevel_depth = bevel
    cu.align_x = align
    cu.align_y = valign
    cu.space_character = spacing
    cu.resolution_u = 3
    o = bpy.data.objects.new('lv_tmp_text', cu)
    link(o)
    bm = from_object(o)
    if depth > 0:
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, depth / 2))
    return bm


_FONTS = {}


def load_font(path):
    if path in _FONTS and _FONTS[path].name in bpy.data.fonts:
        return _FONTS[path]
    f = bpy.data.fonts.load(path, check_existing=True)
    _FONTS[path] = f
    return f


def bolt(r=0.02, h=0.016, washer=True, segs=6, bevel=False, wsegs=10):
    bm = cyl(r, h, segs=segs, bevel=r * 0.15 if bevel else 0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, h / 2, 0))
    if washer:
        w = cyl(r * 1.45, h * 0.25, segs=wsegs, bevel=0)
        bmesh.ops.translate(w, verts=w.verts, vec=(0, h * 0.125, 0))
        merge_bm(bm, w)
    return bm


def merge_bm(dst, src, matrix=None, uv=True):
    vmap = {}
    uv_src = src.loops.layers.uv.active if uv else None
    uv_dst = dst.loops.layers.uv.active
    if uv_src is not None and uv_dst is None:
        uv_dst = dst.loops.layers.uv.new('UVMap')
    for v in src.verts:
        vmap[v] = dst.verts.new(matrix @ v.co if matrix is not None else v.co.copy())
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.smooth = f.smooth
        nf.material_index = f.material_index
        if uv_src is not None and uv_dst is not None:
            for la, lb in zip(f.loops, nf.loops):
                lb[uv_dst].uv = la[uv_src].uv
    return dst


def transform(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def deform(bm, fn):
    for v in bm.verts:
        v.co = fn(v.co)
    return bm


def noise3(p, scale=1.0, seed=0):
    from mathutils import noise
    return noise.noise(Vector(p) * scale + Vector((seed * 17.3, seed * 5.1, seed * 9.7)))


# --------------------------------------------------------------- material kinds

SCANS = {
    'rusty_painted_metal': 'rusty_painted_metal',
    'rust_coarse': 'rust_coarse_01',
    'carpet': 'dirty_carpet',
    'wood': 'wood_table_worn',
    'leather': 'fabric_leather_02',
    'linen': 'rough_linen',
    'rubber': 'rubber_tiles',
    'shutter': 'painted_metal_shutter',
    'green_rust': 'green_metal_rust',
    'tile': 'worn_tile_floor',
}

BASE_KIND = dict(scan='rusty_painted_metal', tile=1.0, tint=None, tint_mix=1.0, contrast=1.0,
                 rough=0.6, rough_var=0.25, metal=0.0, wear=0.0, wear_radius=0.01, chips=0.0,
                 under=((0.30, 0.29, 0.27), 0.38, 1.0), grime=0.6, silt=0.5, bio=0.25, rust=0.0,
                 bump=0.35, dirt=0.35, image=None, image_mix=1.0, bio_lo=-1.0, bio_hi=1.5, silt_up=0.45, ao_dist=0.25,
                 emit=None, seed=0)


def srgb(c):
    def f(x):
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return tuple(f(x) for x in c[:3])


_SCAN_CACHE = {}


def scan_images(key):
    sid = SCANS.get(key, key)
    if sid in _SCAN_CACHE:
        try:
            _SCAN_CACHE[sid]['diff'].name
            return _SCAN_CACHE[sid]
        except ReferenceError:
            pass
    out = {}
    for ch in ('diff', 'rough', 'nor_gl'):
        p = SRC / f'{sid}_{ch}_2k.jpg'
        img = bpy.data.images.load(str(p), check_existing=True)
        if ch != 'diff':
            img.colorspace_settings.name = 'Non-Color'
        out[ch] = img
    import numpy as np
    d = out['diff']
    w, h = d.size
    px = np.empty(w * h * 4, dtype=np.float32)
    d.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[::7, :3] ** 2.2
    out['mean'] = float((px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean())
    _SCAN_CACHE[sid] = out
    return out


class G:
    """Tiny node-graph helper."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.n = self.nt.nodes
        self.x = 0

    def node(self, t, **kw):
        nd = self.n.new(t)
        nd.location = (self.x, 0)
        self.x += 40
        for k, v in kw.items():
            setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, c=None, clamp=False):
        nd = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self._in(nd.inputs[0], a)
        if c is not None:
            self._in(nd.inputs[1], c)
        return nd.outputs[0]

    def _in(self, sock, v):
        if isinstance(v, (int, float)):
            sock.default_value = v
        else:
            self.link(v, sock)

    def mrange(self, v, a, c, lo=0.0, hi=1.0, smooth=False):
        nd = self.node('ShaderNodeMapRange', clamp=True, interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR')
        self._in(nd.inputs['Value'], v)
        nd.inputs['From Min'].default_value = a
        nd.inputs['From Max'].default_value = c
        nd.inputs['To Min'].default_value = lo
        nd.inputs['To Max'].default_value = hi
        return nd.outputs[0]

    def mix(self, a, c, fac, blend='MIX'):
        nd = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_result=True)
        self._in(nd.inputs[0], fac)
        for sock, v in ((nd.inputs[6], a), (nd.inputs[7], c)):
            if isinstance(v, (tuple, list)):
                sock.default_value = (*v[:3], 1.0)
            else:
                self.link(v, sock)
        return nd.outputs[2]

    def mixf(self, a, c, fac):
        nd = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self._in(nd.inputs[0], fac)
        self._in(nd.inputs[2], a)
        self._in(nd.inputs[3], c)
        return nd.outputs[0]

    def noise(self, vec, scale, detail=6.0, rough=0.6, dist=0.0):
        nd = self.node('ShaderNodeTexNoise', noise_dimensions='3D')
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Distortion'].default_value = dist
        return nd.outputs['Fac']

    def mapping(self, vec, scale=(1, 1, 1), loc=(0, 0, 0)):
        nd = self.node('ShaderNodeMapping')
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Location'].default_value = loc
        return nd.outputs[0]


def authoring_material(name, kind):
    k = dict(BASE_KIND)
    k.update(kind)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    g = G(mat)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    geo = g.node('ShaderNodeNewGeometry')
    seed = (k['seed'] * 13.7, k['seed'] * 3.1, k['seed'] * 7.9)
    obj = g.mapping(tc.outputs['Object'], loc=seed)
    vec = g.mapping(tc.outputs['Object'], scale=(1 / k['tile'],) * 3, loc=seed)
    sc = scan_images(k['scan'])
    td = g.node('ShaderNodeTexImage', image=sc['diff'], projection='BOX', projection_blend=0.3)
    g.link(vec, td.inputs['Vector'])
    tr = g.node('ShaderNodeTexImage', image=sc['rough'], projection='BOX', projection_blend=0.3)
    g.link(vec, tr.inputs['Vector'])
    bw = g.node('ShaderNodeRGBToBW')
    g.link(td.outputs['Color'], bw.inputs[0])
    lumn = g.math('MULTIPLY', bw.outputs[0], 1.0 / max(sc['mean'], 0.02))
    if k['contrast'] != 1.0:
        lumn = g.math('POWER', lumn, k['contrast'])
    lumn_c = g.math('MINIMUM', lumn, 2.2)
    if k['image'] is not None:
        ti = g.node('ShaderNodeTexImage', image=k['image'], interpolation='Cubic', extension='EXTEND')
        g.link(tc.outputs['UV'], ti.inputs['Vector'])
        detail = g.mix((1, 1, 1), lumn_c, 0.22 * k['image_mix'], 'MIX')
        paint = g.mix(ti.outputs['Color'], detail, 1.0, 'MULTIPLY')
    elif k['tint'] is not None:
        tinted = g.mix(srgb(k['tint']), lumn_c, 1.0, 'MULTIPLY')
        tinted = g.mix(srgb(k['tint']), tinted, 1.0, 'MIX')
        paint = g.mix(td.outputs['Color'], tinted, k['tint_mix'])
    else:
        paint = td.outputs['Color']
    rough_p = g.mrange(tr.outputs['Color'], 0.0, 1.0, k['rough'] - k['rough_var'], k['rough'] + k['rough_var'])

    # edge wear / chips -> under layer
    wear_mask = None
    if k['wear'] > 0 or k['chips'] > 0:
        bev = g.node('ShaderNodeBevel', samples=8)
        bev.inputs['Radius'].default_value = k['wear_radius']
        dp = g.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        g.link(bev.outputs['Normal'], dp.inputs[0])
        g.link(geo.outputs['Normal'], dp.inputs[1])
        edge = g.mrange(dp.outputs['Value'], 0.995, 0.82, 0.0, 1.0)
        nw = g.noise(g.mapping(obj, scale=(1, 1, 1)), 22.0, 8.0, 0.65)
        e2 = g.math('ADD', g.math('MULTIPLY', edge, 1.1 * k['wear']), g.math('MULTIPLY', g.math('SUBTRACT', nw, 0.5), 1.6))
        wear_mask = g.mrange(e2, 0.42, 0.52, 0.0, 1.0)
        if k['chips'] > 0:
            nc = g.noise(obj, 5.0, 12.0, 0.7, 0.3)
            chip = g.mrange(nc, 0.70 - 0.08 * k['chips'], 0.72 - 0.08 * k['chips'], 0.0, 1.0)
            wear_mask = g.math('MAXIMUM', wear_mask, chip)
        ucol, urough, umetal = k['under']
        paint = g.mix(paint, srgb(ucol), wear_mask)
        rough_p = g.mixf(rough_p, urough, wear_mask)
        metal = g.mixf(k['metal'], umetal, wear_mask)
    else:
        metal = g.mixf(k['metal'], k['metal'], 0.0)

    # cavity grime from AO
    aon = g.node('ShaderNodeAmbientOcclusion', samples=16, only_local=True)
    aon.inputs['Distance'].default_value = k['ao_dist']
    ao = aon.outputs['AO']
    ng = g.noise(obj, 3.0, 6.0, 0.6)
    grime = g.math('MULTIPLY', g.mrange(ao, 0.30, 0.95, 1.0, 0.0), g.math('MULTIPLY', g.math('ADD', ng, 0.4), k['grime']), clamp=True)
    col = g.mix(paint, srgb((0.055, 0.047, 0.036)), g.math('MULTIPLY', grime, 0.85))
    if k['dirt'] > 0:
        nd_ = g.noise(g.mapping(obj, scale=(1, 1, 0.45)), 3.5, 9.0, 0.68, 0.5)
        dirt = g.math('MULTIPLY', g.mrange(nd_, 0.42, 0.78), k['dirt'], clamp=True)
        dcol = g.mix(col, srgb((0.30, 0.24, 0.16)), 1.0, 'MULTIPLY')
        col = g.mix(col, dcol, dirt)
        grime = g.math('MAXIMUM', grime, g.math('MULTIPLY', dirt, 0.5))
    rough = g.mixf(rough_p, 0.85, grime)
    metal = g.mixf(metal, 0.0, grime)

    sep = g.node('ShaderNodeSeparateXYZ')
    g.link(geo.outputs['Normal'], sep.inputs[0])
    # rust runs on vertical faces
    if k['rust'] > 0:
        vert = g.mrange(sep.outputs['Z'], 0.75, 0.2, 0.0, 1.0)
        nr = g.noise(g.mapping(obj, scale=(7, 7, 0.9)), 1.0, 5.0, 0.55, 0.5)
        nr2 = g.noise(obj, 1.6, 4.0, 0.5)
        runs = g.math('MULTIPLY', g.mrange(nr, 0.56, 0.74), g.mrange(nr2, 0.48, 0.64))
        runs = g.math('MULTIPLY', g.math('MULTIPLY', runs, vert), k['rust'], clamp=True)
        rc = g.mix(srgb((0.30, 0.13, 0.05)), lumn_c, 0.6, 'MULTIPLY')
        col = g.mix(col, rc, g.math('MULTIPLY', runs, 0.8))
        rough = g.mixf(rough, 0.8, runs)
        metal = g.mixf(metal, 0.0, runs)

    # silt on up-facing surfaces
    up = g.mrange(sep.outputs['Z'], k['silt_up'], 0.95, 0.0, 1.0)
    ns = g.noise(obj, 2.5, 7.0, 0.62)
    silt = g.math('MULTIPLY', g.math('MULTIPLY', up, g.mrange(ns, 0.32, 0.6)), k['silt'], clamp=True)
    silt = g.math('MAXIMUM', silt, g.math('MULTIPLY', grime, 0.35 * k['silt']))
    scol = g.mix(srgb((0.20, 0.185, 0.15)), lumn_c, 0.25, 'MULTIPLY')
    col = g.mix(col, scol, silt)
    rough = g.mixf(rough, 0.95, silt)
    metal = g.mixf(metal, 0.0, silt)

    # biofilm: lower regions and blotches, wet and slick
    if k['bio'] > 0:
        sz = g.node('ShaderNodeSeparateXYZ')
        g.link(tc.outputs['Object'], sz.inputs[0])
        low = g.mrange(sz.outputs['Z'], k['bio_lo'], k['bio_hi'], 1.0, 0.25)
        nb = g.noise(obj, 1.3, 10.0, 0.7, 0.6)
        nb2 = g.noise(obj, 9.0, 4.0, 0.5)
        bio = g.math('MULTIPLY', g.mrange(g.math('ADD', g.math('MULTIPLY', nb, 1.0), g.math('MULTIPLY', nb2, 0.25)), 0.58, 0.68), low)
        bio = g.math('MULTIPLY', bio, k['bio'], clamp=True)
        bcol = g.mix(srgb((0.10, 0.12, 0.06)), srgb((0.16, 0.11, 0.05)), nb2)
        col = g.mix(col, bcol, g.math('MULTIPLY', bio, 0.9))
        rough = g.mixf(rough, 0.28, bio)
        metal = g.mixf(metal, 0.0, bio)
    else:
        bio = 0.0

    # height for bump
    h = g.math('MULTIPLY', lumn_c, 0.35)
    if wear_mask is not None:
        h = g.math('ADD', h, g.math('MULTIPLY', g.math('SUBTRACT', 1.0, wear_mask), 0.5))
    h = g.math('ADD', h, g.math('MULTIPLY', silt, 0.8))
    if not isinstance(bio, float):
        h = g.math('ADD', h, g.math('MULTIPLY', bio, 0.6))
    bump = g.node('ShaderNodeBump')
    bump.inputs['Strength'].default_value = min(1.0, k['bump'])
    bump.inputs['Distance'].default_value = 0.002
    g.link(h, bump.inputs['Height'])

    bsdf = g.node('ShaderNodeBsdfPrincipled')
    g.link(col, bsdf.inputs['Base Color'])
    g.link(rough, bsdf.inputs['Roughness'])
    g.link(metal, bsdf.inputs['Metallic'])
    g.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    g.link(bsdf.outputs[0], out.inputs['Surface'])
    ao_out = g.mrange(ao, 0.0, 1.0, 0.35, 1.0)
    comb = g.node('ShaderNodeCombineColor')
    g.link(ao_out, comb.inputs[0])
    g.link(rough, comb.inputs[1])
    g.link(metal, comb.inputs[2])
    emis = g.node('ShaderNodeEmission')
    mat['lv_sockets'] = 1
    _AUTH[mat.name] = dict(color=col, orm=comb.outputs[0], bsdf=bsdf, out=out, emis=emis, kind=k)
    return mat


_AUTH = {}


# --------------------------------------------------------------- asset model

class Part:
    def __init__(self, asset, name, origin, group):
        self.asset, self.name, self.origin, self.group = asset, name, Vector(origin), group
        self.bm = bmesh.new()
        self.kinds = []

    def mi(self, kind):
        if kind not in self.kinds:
            self.kinds.append(kind)
        return self.kinds.index(kind)

    def add(self, src, matrix=None, kind='steel'):
        idx = self.mi(kind)
        for f in src.faces:
            f.material_index = idx
        merge_bm(self.bm, src, matrix)
        src.free()
        return self


class Asset:
    def __init__(self, name, kinds, groups, placement=(0, 0, 0), rotation_y=0.0, front='-X', notes=''):
        self.name = name
        self.prefix = 'lv_' + name.replace('-', '_') + '_'
        self.kinds = kinds
        self.groups = groups
        self.parts = {}
        self.anchors = {}
        self.placement = list(placement)
        self.rotation_y = rotation_y
        self.front = front
        self.notes = notes
        self.objects = {}
        self.extra = {}
        purge_prefix(self.prefix)
        self.scene = begin_scene('Living_' + name)
        old_prev = bpy.data.scenes.get('Living_' + name + '_Preview')
        if old_prev:
            purge_scene(old_prev)
        purge_prefix(self.prefix)
        purge_prefix('lv_graphic_')
        _STATE['asset'] = self
        self.t0 = time.time()

    def part(self, name, origin=(0, 0, 0), group='main', parent=None):
        if name not in self.parts:
            self.parts[name] = Part(self, name, origin, group)
            self.parts[name].parent = parent
        return self.parts[name]

    def add(self, part, src, matrix=None, kind='steel'):
        if isinstance(part, str):
            part = self.part(part)
        return part.add(src, matrix, kind)

    def anchor(self, name, pos):
        self.anchors[name] = [round(float(v), 4) for v in pos]

    # -------------------------------------------------- realise
    def realise(self, sharp_angle=35.0):
        self.mats = {}
        for p in self.parts.values():
            bm = p.bm
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            bmesh.ops.translate(bm, verts=bm.verts, vec=-p.origin)
            bmesh.ops.transform(bm, matrix=C4, verts=bm.verts)
            me = bpy.data.meshes.new(self.prefix + p.name)
            bm.to_mesh(me)
            bm.free()
            for poly in me.polygons:
                poly.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
            ob = bpy.data.objects.new(p.name, me)
            ob.location = b(p.origin)
            link(ob)
            for kname in p.kinds:
                key = (p.group, kname)
                if key not in self.mats:
                    kd = dict(self.kinds[kname])
                    gcfg = self.groups[p.group]
                    if gcfg.get('kind_override'):
                        kd.update(gcfg['kind_override'])
                    self.mats[key] = authoring_material(f'{self.prefix}auth_{p.group}_{kname}', kd)
                me.materials.append(self.mats[key])
            self.objects[p.name] = ob
        for p in self.parts.values():
            if getattr(p, 'parent', None):
                ch, par = self.objects[p.name], self.objects[p.parent]
                ch.parent = par
                ch.matrix_parent_inverse = Matrix.Identity(4)
                ch.location = b(p.origin) - b(self.parts[p.parent].origin)
        self.tris = {n: sum(len(pl.vertices) - 2 for pl in o.data.polygons) for n, o in self.objects.items()}
        total = sum(self.tris.values())
        log(self.name, 'objects', len(self.objects), 'tris', total)
        return total

    # -------------------------------------------------- uv + bake
    def unwrap(self):
        for gname, gcfg in self.groups.items():
            objs = [o for n, o in self.objects.items() if self.parts[n].group == gname]
            if not objs:
                continue
            if gcfg.get('uv', 'smart') == 'keep':
                for o in objs:
                    assert o.data.uv_layers, f'{o.name} needs authored UVs'
                continue
            for o in objs:
                if not o.data.uv_layers:
                    o.data.uv_layers.new(name='UVMap')
            select_only(objs)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(gcfg.get('angle', 50)), island_margin=0.0015,
                                     area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
            try:
                bpy.ops.uv.average_islands_scale()
            except Exception as e:
                log('avg islands', e)
            bpy.ops.uv.pack_islands(rotate=True, margin=gcfg.get('margin', 0.0025))
            bpy.ops.object.mode_set(mode='OBJECT')

    def bake(self):
        sc = self.scene
        use_cycles(sc, samples=48)
        sc.render.bake.margin = 6
        sc.render.bake.use_clear = True
        sc.render.bake.target = 'IMAGE_TEXTURES'
        bakedir = GEN / self.name
        bakedir.mkdir(parents=True, exist_ok=True)
        self.images = {}
        for gname, gcfg in self.groups.items():
            objs = [o for n, o in self.objects.items() if self.parts[n].group == gname]
            if not objs:
                continue
            res = gcfg.get('res', 2048)
            maps = gcfg.get('maps', ('color', 'orm', 'normal'))
            mats = [m for (g, _), m in self.mats.items() if g == gname]
            imgs = {}
            for mp in maps:
                r = res if mp == 'color' else int(res * gcfg.get(mp + '_scale', 1.0))
                im = bpy.data.images.new(f'{self.prefix}{gname}_{mp}', r, r, alpha=False, float_buffer=False)
                im.colorspace_settings.name = 'sRGB' if mp == 'color' else 'Non-Color'
                im.generated_color = (0.5, 0.5, 1.0, 1.0) if mp == 'normal' else (0.5, 0.5, 0.5, 1.0)
                imgs[mp] = im
            for mp in maps:
                for m in mats:
                    a = _AUTH[m.name]
                    nt = m.node_tree
                    tex = nt.nodes.get('lv_bake_target') or nt.nodes.new('ShaderNodeTexImage')
                    tex.name = 'lv_bake_target'
                    tex.image = imgs[mp]
                    nt.nodes.active = tex
                    for l in list(a['out'].inputs['Surface'].links):
                        nt.links.remove(l)
                    if mp == 'normal':
                        nt.links.new(a['bsdf'].outputs[0], a['out'].inputs['Surface'])
                    else:
                        nt.links.new(a['color'] if mp == 'color' else a['orm'], a['emis'].inputs['Color'])
                        nt.links.new(a['emis'].outputs[0], a['out'].inputs['Surface'])
                select_only(objs)
                t = time.time()
                sc.cycles.samples = 4 if mp == 'normal' else gcfg.get('samples', 48)
                if mp == 'normal':
                    sc.render.bake.normal_space = 'TANGENT'
                    bpy.ops.object.bake(type='NORMAL', margin=6, use_clear=True)
                else:
                    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
                path = bakedir / f'{gname}_{mp}.png'
                imgs[mp].filepath_raw = str(path)
                imgs[mp].file_format = 'PNG'
                imgs[mp].save()
                log(f'baked {self.name}/{gname}/{mp} {imgs[mp].size[0]}px in {time.time() - t:.1f}s')
            self.images[gname] = imgs

    def export_materials(self):
        self.export_mats = {}
        for gname, gcfg in self.groups.items():
            objs = [o for n, o in self.objects.items() if self.parts[n].group == gname]
            if not objs:
                continue
            imgs = self.images[gname]
            mat = bpy.data.materials.new(f'{self.prefix}{gname}')
            mat.use_nodes = True
            nt = mat.node_tree
            bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            tc = nt.nodes.new('ShaderNodeTexImage')
            tc.image = imgs['color']
            nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
            if 'orm' in imgs:
                to = nt.nodes.new('ShaderNodeTexImage')
                to.image = imgs['orm']
                sp = nt.nodes.new('ShaderNodeSeparateColor')
                nt.links.new(to.outputs['Color'], sp.inputs[0])
                nt.links.new(sp.outputs[1], bsdf.inputs['Roughness'])
                nt.links.new(sp.outputs[2], bsdf.inputs['Metallic'])
                og = gltf_output_group()
                gn = nt.nodes.new('ShaderNodeGroup')
                gn.node_tree = og
                nt.links.new(sp.outputs[0], gn.inputs['Occlusion'])
            else:
                bsdf.inputs['Roughness'].default_value = gcfg.get('rough', 0.6)
                bsdf.inputs['Metallic'].default_value = 0.0
            if 'normal' in imgs:
                tn = nt.nodes.new('ShaderNodeTexImage')
                tn.image = imgs['normal']
                nm = nt.nodes.new('ShaderNodeNormalMap')
                nm.inputs['Strength'].default_value = gcfg.get('normal_strength', 1.0)
                nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
                nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
            if gcfg.get('transmission'):
                bsdf.inputs['Transmission Weight'].default_value = gcfg['transmission']
                bsdf.inputs['IOR'].default_value = gcfg.get('ior', 1.5)
                if gcfg.get('thickness'):
                    og = gltf_output_group()
                    gn = next((n for n in nt.nodes if n.type == 'GROUP' and n.node_tree == og), None)
                    if gn is None:
                        gn = nt.nodes.new('ShaderNodeGroup')
                        gn.node_tree = og
                    gn.inputs['Thickness'].default_value = gcfg['thickness']
                    va = nt.nodes.new('ShaderNodeVolumeAbsorption')
                    va.inputs['Color'].default_value = (*srgb(gcfg.get('attenuation', (0.8, 0.5, 0.15))), 1)
                    va.inputs['Density'].default_value = gcfg.get('density', 2.0)
                    outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
                    nt.links.new(va.outputs[0], outn.inputs['Volume'])
            if gcfg.get('emission'):
                ec, es = gcfg['emission']
                bsdf.inputs['Emission Color'].default_value = (*srgb(ec), 1)
                bsdf.inputs['Emission Strength'].default_value = es
            mat.use_backface_culling = not gcfg.get('double_sided', False)
            if gcfg.get('blend'):
                mat.surface_render_method = 'BLENDED'
            self.export_mats[gname] = mat
            for o in objs:
                o.data.materials.clear()
                o.data.materials.append(mat)
                for poly in o.data.polygons:
                    poly.material_index = 0

    def export(self):
        path = OUT / f'{self.name}.glb'
        select_only(list(self.objects.values()))
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, use_active_scene=True,
                                  export_yup=True, export_cameras=False, export_lights=False,
                                  export_image_format='JPEG', export_jpeg_quality=self.extra.get('jpeg', 86))
        size = path.stat().st_size
        log('exported', path, size)
        self.size = size
        return path

    def manifest(self, extra=None):
        objs = []
        for n, o in self.objects.items():
            loc = o.location
            wl = o.matrix_world.translation
            objs.append(dict(name=n, tris=self.tris[n], origin=[round(wl.x, 4), round(wl.z, 4), round(-wl.y, 4)], group=self.parts[n].group,
                             parent=getattr(self.parts[n], 'parent', None)))
        pts = [o.matrix_world @ v.co for o in self.objects.values() for v in o.data.vertices]
        lo = [min(p.x for p in pts), min(p.z for p in pts), min(-p.y for p in pts)]
        hi = [max(p.x for p in pts), max(p.z for p in pts), max(-p.y for p in pts)]
        rot = math.radians(self.rotation_y)

        def world(p):
            x, y, z = p
            c, s = math.cos(rot), math.sin(rot)
            return [round(self.placement[0] + c * x + s * z, 3), round(self.placement[1] + y, 3), round(self.placement[2] - s * x + c * z, 3)]
        rep = dict(
            asset=self.name, scene=self.scene.name, units='metres',
            axes='Three.js local: +Y up, +X east, +Z south (Blender authored as (x,-z,y), exported with export_yup)',
            front=self.front,
            placement=dict(position=self.placement, rotationYDeg=self.rotation_y,
                           note='apply as root.position / root.rotation.y in the living-deck world'),
            bounds=dict(min=[round(v, 3) for v in lo], max=[round(v, 3) for v in hi]),
            triangles=sum(self.tris.values()), bytes=self.size, objects=objs,
            anchors={k: dict(local=v, world=world(v)) for k, v in self.anchors.items()},
            materials=sorted(m.name for m in self.export_mats.values()),
            textures={g: {mp: list(im.size) for mp, im in d.items()} for g, d in self.images.items()},
            build=f'tools/blender/build-living-{self.name}.py', preview=f'qa/living/blender/{self.name}.png',
            sources='public/assets/deepsea/living/SOURCES.md', notes=self.notes,
            built=time.strftime('%Y-%m-%d %H:%M'), buildSeconds=round(time.time() - self.t0, 1))
        if extra:
            rep.update(extra)
        (OUT / f'{self.name}.json').write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding='utf8')
        self.report = rep
        return rep

    def save_blend(self):
        try:
            bpy.data.libraries.write(str(BLEND_DIR / f'living-{self.name}.blend'), {self.scene}, fake_user=True, compress=True)
        except Exception as e:
            log('blend save failed', e)

    def finish(self, preview_cfg=None, extra=None, budget_tris=120000, budget_bytes=8 * 1024 * 1024):
        tris = self.realise()
        if os.environ.get('LIVING_GEO_ONLY'):
            log('geometry only', tris, self.tris)
            return dict(triangles=tris)
        assert tris <= budget_tris, f'{self.name}: {tris} tris over budget'
        self.unwrap()
        self.bake()
        self.export_materials()
        self.export()
        assert self.size <= budget_bytes, f'{self.name}: {self.size} bytes over budget'
        rep = self.manifest(extra)
        self.save_blend()
        preview(self, **(preview_cfg or {}))
        log(f'{self.name} done in {time.time() - self.t0:.0f}s')
        return rep


_GLTF_GROUP = 'glTF Material Output'


def gltf_output_group():
    g = bpy.data.node_groups.get(_GLTF_GROUP)
    if g is None:
        g = bpy.data.node_groups.new(_GLTF_GROUP, 'ShaderNodeTree')
    names = [s.name for s in g.interface.items_tree if getattr(s, 'in_out', None) == 'INPUT']
    for nm in ('Occlusion', 'Thickness'):
        if nm not in names:
            s = g.interface.new_socket(nm, in_out='INPUT', socket_type='NodeSocketFloat')
            s.default_value = 1.0 if nm == 'Occlusion' else 0.0
    return g


# --------------------------------------------------------------- previews

def _frame_camera(cam, center, radius, direction, fov=40):
    d = Vector(direction).normalized()
    cam.data.lens_unit = 'FOV'
    cam.data.angle = math.radians(fov)
    dist = radius / math.sin(math.radians(fov) / 2) * 1.02
    cam.location = center + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = dist * 4 + 50


def _backdrop(sc, asset, boxes, temp):
    """Context-only wall/floor slabs for previews (never exported)."""
    m = bpy.data.materials.new(asset.prefix + 'backdrop')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.5
    nz.inputs['Detail'].default_value = 10
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.035, 0.04, 0.038, 1)
    ramp.color_ramp.elements[1].color = (0.11, 0.115, 0.105, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    for (c, s) in boxes:
        bm = box(*s, bevel=0)
        transform(bm, Matrix.Translation(Vector(c)))
        transform(bm, C4)
        me = bpy.data.meshes.new(asset.prefix + 'backdrop')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        o = bpy.data.objects.new(asset.prefix + 'backdrop', me)
        sc.collection.objects.link(o)
        temp.append(o)
    return m


def preview(asset, view=(-1.0, 0.45, 0.6), fov=38, dark_lights=None, size=(1280, 760), focus=None, radius=None, samples=96, extra_views=None, backdrop=None):
    """Re-import the exported GLB into an isolated scene and render two lighting passes."""
    import numpy as np
    sc_name = 'Living_' + asset.name + '_Preview'
    prev_scene = bpy.context.window.scene if (bpy.context.window and not bpy.app.background) else None
    old = bpy.data.scenes.get(sc_name)
    if old:
        purge_scene(old)
    if bpy.app.background:
        sc = asset.scene
        hide = list(sc.objects)
        for o in hide:
            o.hide_render = True
    else:
        sc = bpy.data.scenes.new(sc_name)
        bpy.context.window.scene = sc
    _STATE['scene'] = sc
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUT / f'{asset.name}.glb'))
    imported = [o for o in bpy.data.objects if o not in before]
    for o in imported:
        if o.name not in sc.collection.all_objects:
            try:
                sc.collection.objects.link(o)
            except RuntimeError:
                pass
    meshes = [o for o in imported if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = b(focus) if focus is not None else (lo + hi) / 2
    rad = radius if radius is not None else (hi - lo).length / 2
    use_cycles(sc, samples=samples)
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    sc.cycles.max_bounces = 8
    sc.cycles.transmission_bounces = 8
    camd = bpy.data.cameras.new(asset.prefix + 'cam')
    cam = bpy.data.objects.new(asset.prefix + 'cam', camd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    views = [('', view)] + list((extra_views or {}).items())
    world = bpy.data.worlds.new(asset.prefix + 'world')
    world.use_nodes = True
    sc.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    temp = [cam]
    outs = []
    stage = []
    bd_mat = _backdrop(sc, asset, backdrop, stage) if backdrop else None

    def add_light(kind, pos, energy, color, size=0.3, spot=None, target=None):
        ld = bpy.data.lights.new(asset.prefix + 'l', kind)
        ld.energy = energy
        ld.color = color
        if kind in ('POINT', 'SPOT', 'AREA'):
            ld.shadow_soft_size = size
        if kind == 'AREA':
            ld.size = size
        if kind == 'SPOT' and spot:
            ld.spot_size = math.radians(spot)
            ld.spot_blend = 0.6
        lo_ = bpy.data.objects.new(asset.prefix + 'l', ld)
        lo_.location = pos
        if target is not None:
            lo_.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(lo_)
        temp.append(lo_)
        return lo_

    base_center, base_rad = center, rad
    for tag, vdir in views:
        center, rad = base_center, base_rad
        if isinstance(vdir, dict):
            if vdir.get('focus') is not None:
                center = b(vdir['focus'])
            rad = vdir.get('radius', rad)
            vdir = vdir['view']
        dirv = b(vdir).normalized()
        _frame_camera(cam, center, rad, dirv, fov)
        # neutral pass
        bg.inputs['Color'].default_value = (0.32, 0.33, 0.34, 1)
        bg.inputs['Strength'].default_value = 0.9
        right = dirv.cross(Vector((0, 0, 1))).normalized()
        key = add_light('AREA', center + dirv * rad * 1.6 + Vector((0, 0, rad * 1.4)) + right * rad, 900 * rad * rad / 4 + 400, (1, 0.97, 0.92), size=rad * 1.2, target=center)
        fill = add_light('AREA', center + dirv * rad * 1.4 - right * rad * 1.4 + Vector((0, 0, rad * 0.2)), 250 * rad * rad / 4 + 120, (0.85, 0.9, 1.0), size=rad, target=center)
        p = QA / f'{asset.name}{tag}-neutral.png'
        sc.render.filepath = str(p)
        bpy.ops.render.render(write_still=True, scene=sc.name)
        outs.append(p)
        for lo_ in (key, fill):
            ld = lo_.data
            bpy.data.objects.remove(lo_, do_unlink=True)
            bpy.data.lights.remove(ld)
            temp.remove(lo_)
        # dark underwater pass: pod lamp + emergency practicals in a scattering volume
        bg.inputs['Color'].default_value = (0.0012, 0.004, 0.005, 1)
        bg.inputs['Strength'].default_value = 1.0
        vb = bpy.data.meshes.new(asset.prefix + 'vol')
        vbm = bmesh.new()
        bmesh.ops.create_cube(vbm, size=1.0)
        span = (hi - lo) + Vector((1, 1, 1)) * rad * 6
        for v in vbm.verts:
            v.co = Vector((v.co.x * span.x, v.co.y * span.y, v.co.z * span.z)) + (lo + hi) / 2
        vbm.to_mesh(vb)
        vbm.free()
        vol = bpy.data.objects.new(asset.prefix + 'vol', vb)
        sc.collection.objects.link(vol)
        vm = bpy.data.materials.new(asset.prefix + 'volmat')
        vm.use_nodes = True
        vn = vm.node_tree
        for n in list(vn.nodes):
            if n.type == 'BSDF_PRINCIPLED':
                vn.nodes.remove(n)
        pv = vn.nodes.new('ShaderNodeVolumePrincipled')
        pv.inputs['Density'].default_value = 0.009
        pv.inputs['Color'].default_value = (0.35, 0.62, 0.62, 1)
        pv.inputs['Anisotropy'].default_value = 0.55
        pv.inputs['Absorption Color'].default_value = (0.25, 0.55, 0.55, 1)
        outn = next(n for n in vn.nodes if n.type == 'OUTPUT_MATERIAL')
        vn.links.new(pv.outputs[0], outn.inputs['Volume'])
        vb.materials.append(vm)
        temp.append(vol)
        lamp_pos = cam.location + right * rad * 0.35 + Vector((0, 0, rad * 0.25))
        add_light('SPOT', lamp_pos, 2600 * (rad / 3) ** 2, (1.0, 0.93, 0.80), size=0.08, spot=44, target=center)
        for (pos, energy, color) in (dark_lights or [((center + Vector((0, 0, rad * 0.9)) - right * rad * 0.8), 60 * rad, (1.0, 0.32, 0.18))]):
            add_light('POINT', b(pos) if not isinstance(pos, Vector) else pos, energy, color, size=0.12)
        p = QA / f'{asset.name}{tag}-dark.png'
        sc.render.filepath = str(p)
        bpy.ops.render.render(write_still=True, scene=sc.name)
        outs.append(p)
        for o in [o for o in temp if o != cam]:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
            elif isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
        temp[:] = [cam]
        bpy.data.materials.remove(vm)
    # side by side composite of the first view
    ims = [bpy.data.images.load(str(p), check_existing=False) for p in outs[:2]]
    w, h = ims[0].size
    arr = []
    for im in ims:
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        arr.append(a.reshape(h, w, 4))
    comp = np.concatenate([arr[1], arr[0]], axis=1)
    out = bpy.data.images.new(asset.prefix + 'preview', w * 2, h, alpha=False)
    out.pixels.foreach_set(comp.ravel())
    out.filepath_raw = str(QA / f'{asset.name}.png')
    out.file_format = 'PNG'
    out.save()
    for im in ims + [out]:
        bpy.data.images.remove(im)
    log('preview', QA / f'{asset.name}.png')
    if prev_scene is not None:
        bpy.context.window.scene = asset.scene
    else:
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
    _STATE['scene'] = asset.scene
    return outs


# --------------------------------------------------------------- printed graphics (signs, stencils, notes)

def render_graphic(path, w_px, h_px, w_m, h_m, items, bg=(0.9, 0.9, 0.86)):
    """Render flat 2D artwork with Workbench. items: dicts with type rect/text/circle/ring/poly/line.
    Coordinates in metres, origin bottom-left, colours sRGB."""
    prev_scene = _STATE['scene']
    sc = bpy.data.scenes.new('lv_tmp_graphic')
    _STATE['scene'] = sc
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.render_aa = '16'
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('lv_tmp_graphic_world')
    sc.world = w
    w.color = srgb(bg)
    camd = bpy.data.cameras.new('lv_tmp_graphic_cam')
    camd.type = 'ORTHO'
    camd.ortho_scale = max(w_m, h_m)
    cam = bpy.data.objects.new('lv_tmp_graphic_cam', camd)
    cam.location = (w_m / 2, h_m / 2, 10)
    sc.collection.objects.link(cam)
    sc.camera = cam
    made = [cam]
    mats = {}

    def mat(col):
        key = tuple(round(c, 4) for c in col)
        if key not in mats:
            m = bpy.data.materials.new('lv_tmp_graphic_mat')
            m.diffuse_color = (*srgb(col), 1)
            mats[key] = m
        return mats[key]

    def add_bm(bmx, col, z):
        me = bpy.data.meshes.new('lv_tmp_graphic_me')
        bmx.to_mesh(me)
        bmx.free()
        me.materials.append(mat(col))
        o = bpy.data.objects.new('lv_tmp_graphic_o', me)
        o.location.z = z
        sc.collection.objects.link(o)
        made.append(o)

    bgm = _new()
    bmesh.ops.create_grid(bgm, x_segments=1, y_segments=1, size=0.5)
    for v in bgm.verts:
        v.co = Vector((v.co.x * w_m * 1.2 + w_m / 2, v.co.y * h_m * 1.2 + h_m / 2, 0))
    add_bm(bgm, bg, -0.01)
    for i, it in enumerate(items):
        z = 0.001 * (i + 1)
        t = it['type']
        col = it.get('color', (0, 0, 0))
        if t == 'rect':
            x, y, ww, hh = it['xywh']
            bmx = prism(rounded_rect(ww, hh, it.get('r', 0.0001), 3) if it.get('r') else [(-ww / 2, -hh / 2), (ww / 2, -hh / 2), (ww / 2, hh / 2), (-ww / 2, hh / 2)], 0.0001)
            transform(bmx, Matrix.Translation((x + ww / 2, y + hh / 2, 0)))
            add_bm(bmx, col, z)
        elif t == 'poly':
            bmx = prism(it['pts'], 0.0001)
            add_bm(bmx, col, z)
        elif t == 'circle':
            x, y, r = it['xyr']
            bmx = prism(circle_pts(r, 64), 0.0001)
            transform(bmx, Matrix.Translation((x, y, 0)))
            add_bm(bmx, col, z)
        elif t == 'ring':
            x, y, r, th = it['xyrt']
            a0, a1 = it.get('arc', (0, 360))
            n = 72
            pts_o = [(x + (r + th / 2) * math.cos(math.radians(a0 + (a1 - a0) * k / n)), y + (r + th / 2) * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
            pts_i = [(x + (r - th / 2) * math.cos(math.radians(a0 + (a1 - a0) * k / n)), y + (r - th / 2) * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
            bmx = _new()
            vo = [bmx.verts.new((p[0], p[1], 0)) for p in pts_o]
            vi = [bmx.verts.new((p[0], p[1], 0)) for p in pts_i]
            for k in range(n):
                bmx.faces.new((vi[k], vo[k], vo[k + 1], vi[k + 1]))
            add_bm(bmx, col, z)
        elif t == 'line':
            th = it.get('w', 0.01)
            for (x0, y0), (x1, y1) in zip(it['pts'], it['pts'][1:]):
                d = Vector((x1 - x0, y1 - y0))
                nrm = Vector((-d.y, d.x)).normalized() * th / 2
                bmx = prism([(x0 + nrm.x, y0 + nrm.y), (x0 - nrm.x, y0 - nrm.y), (x1 - nrm.x, y1 - nrm.y), (x1 + nrm.x, y1 + nrm.y)], 0.0001)
                add_bm(bmx, col, z)
        elif t == 'text':
            cu = bpy.data.curves.new('lv_tmp_graphic_txt', 'FONT')
            cu.body = it['text']
            cu.font = load_font(it.get('font', FONT_CJK))
            cu.size = it['size']
            cu.align_x = it.get('align', 'LEFT')
            cu.align_y = it.get('valign', 'BOTTOM_BASELINE')
            cu.space_character = it.get('spacing', 1.0)
            cu.space_line = it.get('line', 1.0)
            if it.get('bold_offset'):
                cu.offset = it['bold_offset']
            o = bpy.data.objects.new('lv_tmp_graphic_txt', cu)
            o.location = (it['xy'][0], it['xy'][1], z)
            o.rotation_euler.z = math.radians(it.get('rot', 0))
            cu.materials.append(mat(col))
            sc.collection.objects.link(o)
            made.append(o)
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=sc.name)
    for o in made:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
    for m in mats.values():
        bpy.data.materials.remove(m)
    bpy.data.scenes.remove(sc)
    bpy.data.worlds.remove(w)
    _STATE['scene'] = prev_scene
    img = bpy.data.images.load(str(path), check_existing=False)
    img.name = 'lv_graphic_' + Path(path).stem
    return img


def quad_uv(w, h, uv_rect=(0, 0, 1, 1)):
    """Quad in local XY facing +Z with UVs, centred."""
    u0, v0, u1, v1 = uv_rect
    bm = _new()
    uvl = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(c) for c in ((-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0))]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
        loop[uvl].uv = uv
    return bm


def panel_uv(w, h, t, uv_rect=(0, 0, 1, 1), edge_uv=None):
    """Thin board from z=0 (back) to z=t (printed +Z face, UV mapped); edges/back sample one UV."""
    u0, v0, u1, v1 = uv_rect
    bm = _new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * h, (v.co.z + 0.5) * t))
    bm.normal_update()
    uvl = bm.loops.layers.uv.new('UVMap')
    eu = edge_uv or (u0 + 0.004, v0 + 0.004)
    for f in bm.faces:
        for l in f.loops:
            if f.normal.z > 0.9:
                l[uvl].uv = (u0 + (l.vert.co.x / w + 0.5) * (u1 - u0), v0 + (l.vert.co.y / h + 0.5) * (v1 - v0))
            else:
                l[uvl].uv = eu
    return bm


# --------------------------------------------------------------- human figures
HUMAN_BLEND = ROOT / 'assets/blender/vendor/human-base-meshes/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend'

# Blender rest space of the CC0 base meshes: z up, figure faces -Y, its left is +X.
# bone: (parent, head, tail); 'S' entries are mirrored to .L (+X) and .R (-X).
_SKEL = {
    'male': dict(
        pelvis=(None, (0, 0, 0.88), (0, 0, 1.0)), spine=('pelvis', (0, 0, 1.0), (0, -0.01, 1.18)),
        chest=('spine', (0, -0.01, 1.18), (0, -0.02, 1.40)), neck=('chest', (0, -0.02, 1.40), (0, -0.03, 1.50)),
        head=('neck', (0, -0.03, 1.50), (0, -0.03, 1.70)),
        S_clav=('chest', (0.03, -0.02, 1.40), (0.18, 0.0, 1.39)), S_upper=('S_clav', (0.19, 0.0, 1.38), (0.29, 0.0, 1.10)),
        S_fore=('S_upper', (0.29, 0.0, 1.10), (0.375, -0.05, 0.875)), S_hand=('S_fore', (0.375, -0.05, 0.875), (0.43, -0.12, 0.70)),
        S_thigh=('pelvis', (0.095, 0.0, 0.90), (0.13, 0.01, 0.49)), S_shin=('S_thigh', (0.13, 0.01, 0.49), (0.165, 0.05, 0.10)),
        S_foot=('S_shin', (0.165, 0.05, 0.10), (0.22, -0.09, 0.02)),
        arm_x=0.2, arm_z=1.40, leg_z=0.86, neck_z=1.43),
    'female': dict(
        pelvis=(None, (0, 0, 0.84), (0, 0, 0.97)), spine=('pelvis', (0, 0, 0.97), (0, -0.01, 1.13)),
        chest=('spine', (0, -0.01, 1.13), (0, -0.02, 1.35)), neck=('chest', (0, -0.02, 1.35), (0, -0.03, 1.44)),
        head=('neck', (0, -0.03, 1.44), (0, -0.03, 1.64)),
        S_clav=('chest', (0.03, -0.02, 1.35), (0.18, 0.01, 1.33)), S_upper=('S_clav', (0.19, 0.01, 1.33), (0.25, 0.03, 1.07)),
        S_fore=('S_upper', (0.25, 0.03, 1.07), (0.33, -0.02, 0.86)), S_hand=('S_fore', (0.33, -0.02, 0.86), (0.41, -0.07, 0.70)),
        S_thigh=('pelvis', (0.085, 0.0, 0.86), (0.11, 0.01, 0.48)), S_shin=('S_thigh', (0.11, 0.01, 0.48), (0.12, 0.04, 0.10)),
        S_foot=('S_shin', (0.12, 0.04, 0.10), (0.15, -0.10, 0.02)),
        arm_x=0.2, arm_z=1.34, leg_z=0.82, neck_z=1.37),
}


def _skeleton(sex):
    d = _SKEL[sex]
    bones = {}
    for k, v in d.items():
        if not isinstance(v, tuple):
            continue
        par, h, t = v
        if k.startswith('S_'):
            for side, s in (('L', 1), ('R', -1)):
                p = (par[2:] + '.' + side) if par and par.startswith('S_') else par
                bones[k[2:] + '.' + side] = (p, Vector((h[0] * s, h[1], h[2])), Vector((t[0] * s, t[1], t[2])))
        else:
            bones[k] = (par, Vector(h), Vector(t))
    return bones, d


def _seg_dist(p, a, c):
    ab = c - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


class Figure:
    """CC0 base-mesh human with procedural skinning and world-axis FK posing.

    pose: {bone: [(axis 'x'|'y'|'z' in Blender rest axes, degrees), ...]} applied at the bone head,
    composed down the hierarchy. Output meshes are in three space (figure faces +Z, up +Y).
    """

    def __init__(self, sex='male', height=None):
        name = f'GEO-body_{sex}_realistic'
        with bpy.data.libraries.load(str(HUMAN_BLEND)) as (src, dst):
            dst.objects = [name, name + '.eye.L', name + '.eye.R']
        body, eyes = dst.objects[0], dst.objects[1:]
        self.sex = sex
        bm = bmesh.new()
        bm.from_mesh(body.data)
        base_inv = body.matrix_basis.inverted()
        self.n_body = len(bm.verts)
        for e in eyes:
            ebm = bmesh.new()
            ebm.from_mesh(e.data)
            merge_bm(bm, ebm, base_inv @ e.matrix_basis)
            ebm.free()
        for o in [body] + list(eyes):
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        zmax = max(v.co.z for v in bm.verts)
        self.scale = (height / zmax) if height else 1.0
        self.bm = bm
        self.bones, self.cfg = _skeleton(sex)
        self.rest = [v.co.copy() for v in bm.verts]
        bm.normal_update()
        self.rest_n = [v.normal.copy() for v in bm.verts]
        self._weights()

    def _allowed(self, i, co):
        c = self.cfg
        if i >= self.n_body:
            return ['head']
        s = 'L' if co.x > 0 else 'R'
        if co.z > c['neck_z'] + 0.02 and abs(co.x) < 0.13:
            return ['head', 'neck']
        if abs(co.x) > c['arm_x'] and co.z < c['arm_z'] and co.z > 0.6:
            return [f'clav.{s}', f'upper.{s}', f'fore.{s}', f'hand.{s}', 'chest']
        if co.z < c['leg_z'] and abs(co.x) < 0.26:
            return ['pelvis', f'thigh.{s}', f'shin.{s}', f'foot.{s}']
        return ['pelvis', 'spine', 'chest', 'neck', f'clav.{s}', f'upper.{s}', f'thigh.{s}']

    def _weights(self):
        names = list(self.bones)
        idx = {n: k for k, n in enumerate(names)}
        W = []
        for i, co in enumerate(self.rest):
            al = self._allowed(i, co)
            ws = {}
            for n in al:
                _, h, t = self.bones[n]
                d = _seg_dist(co, h, t)
                ws[idx[n]] = 1.0 / (d + 0.015) ** 6
            top = sorted(ws.items(), key=lambda kv: -kv[1])[:3]
            s = sum(w for _, w in top)
            W.append({k: w / s for k, w in top})
        nb = [[] for _ in self.rest]
        for e in self.bm.edges:
            a, c = e.verts[0].index, e.verts[1].index
            nb[a].append(c)
            nb[c].append(a)
        for _ in range(4):
            W2 = []
            for i, w in enumerate(W):
                if i >= self.n_body or not nb[i]:
                    W2.append(w)
                    continue
                acc = dict((k, v * 0.5) for k, v in w.items())
                f = 0.5 / len(nb[i])
                allowed = set(idx[n] for n in self._allowed(i, self.rest[i]))
                for j in nb[i]:
                    for k, v in W[j].items():
                        if k in allowed:
                            acc[k] = acc.get(k, 0.0) + v * f
                top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
                s = sum(v for _, v in top)
                W2.append({k: v / s for k, v in top})
            W = W2
        self.names, self.W = names, W

    def chain(self, spec):
        T = {}
        for n in self.names:
            par, h, _ = self.bones[n]
            R = Matrix.Identity(4)
            for ax, deg in spec.get(n, []):
                R = Matrix.Rotation(math.radians(deg), 4, ax.upper()) @ R
            local = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
            T[n] = (T[par] if par else Matrix.Identity(4)) @ local
        return T

    def posed_point(self, spec_or_T, bone, p_blender):
        """Posed position (three space, figure-local) of a rest point rigidly following bone."""
        T = spec_or_T if isinstance(spec_or_T, dict) and spec_or_T and isinstance(next(iter(spec_or_T.values())), Matrix) else self.chain(spec_or_T)
        return C4.inverted() @ ((T[bone] @ Vector(p_blender)) * self.scale)

    def solve(self, spec, bones_axes, bone, p_blender, target, world=Matrix.Identity(4), ranges=None, steps=9, rounds=3):
        """Coarse-to-fine search over [(bone, axis)] angles so `p_blender` on `bone` reaches `target` (three space via `world`)."""
        keys = list(bones_axes)
        ranges = ranges or [(-120.0, 120.0)] * len(keys)
        best = [sum(r) / 2 for r in ranges]
        span = [(r[1] - r[0]) for r in ranges]
        import itertools

        def err(vals):
            s = {k: list(v) for k, v in spec.items()}
            for (b, ax), v in zip(keys, vals):
                s[b] = s.get(b, []) + [(ax, v)]
            return (world @ self.posed_point(self.chain(s), bone, p_blender) - Vector(target)).length, s
        cur_err, cur_spec = err(best)
        for _ in range(rounds):
            grids = [[max(r[0], min(r[1], b + sp * (k / (steps - 1) - 0.5))) for k in range(steps)] for b, sp, r in zip(best, span, ranges)]
            for vals in itertools.product(*grids):
                e, s = err(vals)
                if e < cur_err:
                    cur_err, cur_spec, best = e, s, list(vals)
            span = [s_ / (steps - 1) * 2 for s_ in span]
        return cur_spec, cur_err

    def smooth_rest(self, mask, iterations=6, factor=0.5):
        """Laplacian-smooth the rest shape where mask[i] is true (hides anatomy under suits)."""
        nb = [[] for _ in self.rest]
        for e in self.bm.edges:
            a, c = e.verts[0].index, e.verts[1].index
            nb[a].append(c)
            nb[c].append(a)
        P = [c.copy() for c in self.rest]
        for _ in range(iterations):
            Q = list(P)
            for i, ns in enumerate(nb):
                if mask[i] and ns:
                    avg = sum((P[j] for j in ns), Vector()) / len(ns)
                    Q[i] = P[i].lerp(avg, factor)
            P = Q
        self.rest = P

    def pose(self, spec, inflate=None):
        """Return posed bmesh in Blender rest space; inflate(i, co) -> metres along the rest normal."""
        T = self.chain(spec)
        self.T = T
        Ts = [T[n] for n in self.names]
        bm = self.bm.copy()
        bm.verts.ensure_lookup_table()
        for i, v in enumerate(bm.verts):
            co = self.rest[i]
            if inflate:
                co = co + self.rest_n[i] * inflate(i, co)
            p = Vector((0.0, 0.0, 0.0))
            for k, w in self.W[i].items():
                p += (Ts[k] @ co) * w
            v.co = p * self.scale
        bm.normal_update()
        return bm

    def bone_matrix(self, bone):
        """Posed transform for rigid attachments authored in three-space rest coordinates."""
        S = Matrix.Scale(self.scale, 4)
        return C4.inverted() @ S @ self.T[bone] @ S.inverted() @ C4

    def rest_three(self, p_blender):
        return C4.inverted() @ (Vector(p_blender) * self.scale)

    def bone_weight(self, i, prefix):
        return sum(w for k, w in self.W[i].items() if self.names[k].startswith(prefix))

    def split(self, bm, label_fn):
        """label_fn(face_vertex_indices) -> label. Returns {label: bmesh in three space}."""
        bm.faces.ensure_lookup_table()
        labels = [label_fn([v.index for v in f.verts]) for f in bm.faces]
        out = {}
        for lab in set(labels):
            c = bm.copy()
            c.faces.ensure_lookup_table()
            dead = [c.faces[k] for k, l in enumerate(labels) if l != lab]
            bmesh.ops.delete(c, geom=dead, context='FACES')
            transform(c, C4.inverted())
            out[lab] = c
        bm.free()
        return out


def run_main(fn):
    t = time.time()
    try:
        fn()
    finally:
        if not os.environ.get('LIVING_GEO_ONLY'):
            end_scene()
    log(f'total {time.time() - t:.0f}s')
