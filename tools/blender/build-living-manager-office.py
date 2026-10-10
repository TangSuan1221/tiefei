"""Level two R5 accommodation office: the dead accommodation manager slumped over
her desk with the handwritten gate code hanging from her fingers, key cabinet,
filing cabinets, the wall-mounted gate-release placard and the staff notice
board with Delroy Campbell's treatment application.

Local frame = world translated by (167, 0, 104); the desk faces -Z (heading 0).
Floor y=-3. Photo targets (named objects, origin = anchor = world item):
  'code-note'     (0, -2.2, 0)       world (167, -2.2, 104)
  'guide-placard' (6.4, 0, -8)       world (173.4, 0, 96)    faces -X
  'delroy-form'   (-16.4, 0, -12)    world (150.6, 0, 92)    faces +X
The code text uses LIVING_GATE_CODE '0917' from src/pod/view/deepsea/living-hero.ts.

    blender -b -P tools/blender/build-living-manager-office.py
"""
import os, sys, math, random, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import living_common as L
importlib.reload(L)
from mathutils import Vector, Matrix

NAME = 'manager-office'
CODE = '0917'
FLOOR = -3.0
NOTE = Vector((0.0, -2.2, 0.0))
DESK_TOP = -2.30
D_FAR, D_NEAR = -0.35, 0.45
GUIDE = Vector((6.4, 0.0, -8.0))
DELROY = Vector((-16.4, 0.0, -12.0))
WALL_S = 3.7          # south wall face (world z 107.7)
WALL_E = 6.7          # east wall face (world x 173.7)
WALL_W = -16.7        # west wall face (world x 150.3)
HAND = 'C:/Windows/Fonts/STXINGKA.TTF'
HAND_DIGITS = 'C:/Windows/Fonts/segoeprb.ttf'
rng = random.Random(31)

KINDS = {
    'wood': dict(scan='wood', tint=(0.30, 0.20, 0.12), tint_mix=0.5, rough=0.5, wear=0.5, chips=0.3, under=((0.25, 0.2, 0.15), 0.8, 0.0), bio=0.5, silt=0.9, dirt=0.7, grime=1.1, seed=121),
    'steel': dict(scan='rusty_painted_metal', tint=(0.36, 0.37, 0.35), tint_mix=0.9, contrast=0.4, rough=0.45, wear=0.6, chips=0.4, rust=0.6, bio=0.45, silt=0.8, dirt=0.6, seed=122),
    'chrome': dict(scan='rust_coarse', tint=(0.36, 0.34, 0.3), tint_mix=0.85, rough=0.62, rough_var=0.12, metal=0.8, rust=0.55, bio=0.15, silt=0.6, grime=1.0, dirt=0.6, seed=123),
    'plastic': dict(scan='shutter', tint=(0.1, 0.1, 0.11), tint_mix=0.94, contrast=0.2, rough=0.4, grime=1.0, silt=0.8, bio=0.4, dirt=0.7, seed=124),
    'screen': dict(scan='shutter', tint=(0.02, 0.025, 0.03), tint_mix=1.0, contrast=0.1, rough=0.1, grime=0.6, silt=0.6, bio=0.3, dirt=0.6, bump=0.04, seed=125),
    # sodden loose sheets: well below white so the desk lamp and headlamp do not bloom them
    'paper': dict(scan='linen', tint=(0.46, 0.44, 0.38), tint_mix=0.9, contrast=0.3, rough=0.92, bio=0.3, silt=0.4, grime=0.8, dirt=0.9, bump=0.2, seed=126),
    'fabric': dict(scan='linen', tint=(0.13, 0.045, 0.04), tint_mix=0.92, rough=0.85, bio=0.5, silt=0.4, grime=1.0, dirt=0.7, seed=127),
    'rubber': dict(scan='rubber', tint=(0.03, 0.03, 0.03), tint_mix=0.9, rough=0.7, bio=0.4, silt=0.4, grime=0.4, seed=128),
    'cork': dict(scan='carpet', tint=(0.42, 0.30, 0.18), tint_mix=0.6, rough=0.9, bio=0.5, silt=0.6, grime=1.0, dirt=0.7, seed=129),
    # waterlogged wool: dark navy jacket, near-black skirt suit trousers; only a light silt bloom on top surfaces
    'uniform': dict(scan='linen', tint=(0.075, 0.085, 0.115), tint_mix=0.95, contrast=0.6, rough=0.88, rough_var=0.06, wear=0.4, under=((0.05, 0.055, 0.07), 0.9, 0.0), bio=0.12, bio_lo=-3, bio_hi=0.6, silt=0.55, grime=1.0, dirt=0.8, bump=0.6, seed=130),
    'trousers': dict(scan='linen', tint=(0.05, 0.05, 0.06), tint_mix=0.95, contrast=0.6, rough=0.88, rough_var=0.06, bio=0.1, silt=0.6, grime=1.0, dirt=0.8, bump=0.6, seed=131),
    # drowned skin: grey-waxy, slightly blue at the extremities (bio = mottling), wet sheen
    'skin': dict(scan='leather', tint=(0.40, 0.39, 0.37), tint_mix=0.9, contrast=0.4, rough=0.6, rough_var=0.12, bio=0.2, bio_lo=-3, bio_hi=2.5, silt=0.15, grime=0.9, dirt=0.7, bump=0.3, ao_dist=0.05, seed=132),
    'hair': dict(scan='linen', tint=(0.04, 0.034, 0.028), tint_mix=0.97, contrast=0.6, rough=0.72, bio=0.2, silt=0.1, grime=0.5, bump=0.8, seed=133),
    'eye': dict(scan='shutter', tint=(0.55, 0.57, 0.56), tint_mix=1.0, contrast=0.1, rough=0.2, grime=0.4, bio=0.0, silt=0.0, dirt=0.4, seed=134),
    'shoe': dict(scan='leather', tint=(0.045, 0.04, 0.035), tint_mix=0.9, rough=0.72, wear=0.4, bio=0.4, silt=0.7, grime=0.8, seed=135),
    'glass': dict(scan='shutter', tint=(0.5, 0.55, 0.52), tint_mix=1.0, contrast=0.1, rough=0.06, grime=0.7, dirt=0.6, silt=0.5, bio=0.4, seed=136),
    'brass': dict(scan='rust_coarse', tint=(0.42, 0.32, 0.15), tint_mix=0.85, rough=0.6, metal=0.85, rust=0.35, bio=0.3, silt=0.3, grime=0.8, seed=137),
    'decal': dict(scan='shutter', image=None, rough=0.6, rough_var=0.15, grime=0.45, silt=0.35, bio=0.25, rust=0.0, dirt=0.45, bump=0.12, image_mix=0.85, seed=138),
}
GROUPS = {
    'main': dict(res=2048),
    'figure': dict(res=2048, samples=8),
    'decals': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
    'notes': dict(res=2048, uv='keep', maps=('color', 'orm'), orm_scale=0.5),
}
# decals atlas (4 x 4 m canvas)
DECALS = {
    'guide': (0.0, 2.0, 2.0, 1.5),      # placard 2.0 x 1.5
    'delroy': (2.0, 1.6, 1.4, 2.0),     # form 0.7 x 1.0
    'old1': (3.4, 2.6, 0.6, 0.85), 'old2': (3.4, 1.7, 0.6, 0.85),
    'board': (0.0, 3.5, 2.4, 0.5),      # notice board header
    'badge': (0.0, 1.6, 0.6, 0.3),
    'keys': (0.6, 1.6, 1.0, 0.3),
    'files': (0.0, 1.2, 1.6, 0.4),
}
# notes atlas (1 x 1 m canvas): code sheet alone at high texel density (portrait, BOARD aspect)
NOTES = {'code': (0.0, 0.0, 0.806, 1.0)}
# A3 steel drawing board with the code sheet, nearly upright against a ledger stack. It faces the pod's
# closest legal photo pose north of the desk (world 167, -1.2, 100.8 = local 0, -1.2, -3.2; nose clear of the
# desk, 3.1-3.4 m from the note): the digits must read at >= 18 px in a 1080p frame at 1x (the photo zoom
# exists but nothing tells the player about it).
BOARD_W, BOARD_H = 0.5, 0.62
CAM_LOCAL = Vector((0.0, 0.0, -3.2))


def duv(k, tab=DECALS, size=4.0):
    x, y, w, h = tab[k]
    return (x / size, y / size, (x + w) / size, (y + h) / size)


def graphic():
    it = []
    blk, wht, red, ink = (0.05, 0.05, 0.05), (0.95, 0.94, 0.9), (0.68, 0.1, 0.07), (0.03, 0.04, 0.13)
    x, y, w, h = DECALS['guide']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.86, 0.66, 0.08)),
           dict(type='rect', xywh=(x + 0.04, y + 0.04, w - 0.08, h - 0.08), color=(0.95, 0.94, 0.9)),
           dict(type='rect', xywh=(x + 0.04, y + h - 0.32, w - 0.08, 0.28), color=red),
           dict(type='text', text='闸门F 应急开闸步骤', xy=(x + w / 2, y + h - 0.24), size=0.17, align='CENTER', color=wht),
           dict(type='text', text='GATE F · EMERGENCY RELEASE · INNER SIDE', xy=(x + w / 2, y + 0.07), size=0.065, align='CENTER', color=(0.3, 0.3, 0.3), font=L.FONT_STENCIL)]
    steps = (('①', '拉下手动泄压杆'), ('②', '输入密码'), ('③', '顺时针转动锁轮'))
    for i, (n, t) in enumerate(steps):
        yy = y + h - 0.6 - i * 0.3
        it += [dict(type='circle', xyr=(x + 0.2, yy + 0.07, 0.11), color=red),
               dict(type='text', text=str(i + 1), xy=(x + 0.2, yy + 0.015), size=0.15, align='CENTER', color=wht, font=L.FONT_STENCIL),
               dict(type='text', text=t, xy=(x + 0.38, yy), size=0.16, align='LEFT', color=blk)]
    # pictograms on the right: lever, keypad, wheel with arrow
    px = x + 1.62
    it += [dict(type='rect', xywh=(px - 0.2, y + h - 0.66, 0.4, 0.04), color=blk),
           dict(type='line', pts=[(px - 0.15, y + h - 0.64), (px + 0.1, y + h - 0.5)], w=0.03, color=red),
           dict(type='poly', pts=[(px + 0.12, y + h - 0.7), (px + 0.2, y + h - 0.6), (px + 0.2, y + h - 0.75)], color=red),
           dict(type='rect', xywh=(px - 0.09, y + h - 1.02, 0.18, 0.24), color=(0.2, 0.2, 0.2))]
    for r in range(3):
        for c in range(3):
            it.append(dict(type='rect', xywh=(px - 0.07 + c * 0.05, y + h - 0.93 + r * 0.05, 0.035, 0.035), color=(0.8, 0.8, 0.78)))
    it += [dict(type='ring', xyrt=(px, y + h - 1.2, 0.1, 0.02), color=blk),
           dict(type='line', pts=[(px - 0.1, y + h - 1.2), (px + 0.1, y + h - 1.2)], w=0.015, color=blk),
           dict(type='line', pts=[(px, y + h - 1.3), (px, y + h - 1.1)], w=0.015, color=blk),
           dict(type='line', pts=[(px - 0.13, y + h - 1.08), (px, y + h - 1.04), (px + 0.13, y + h - 1.08)], w=0.02, color=red),
           dict(type='poly', pts=[(px + 0.17, y + h - 1.12), (px + 0.1, y + h - 1.04), (px + 0.18, y + h - 1.02)], color=red)]
    x, y, w, h = DECALS['delroy']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.93, 0.92, 0.86)),
           dict(type='rect', xywh=(x, y + h - 0.3, w, 0.3), color=(0.12, 0.2, 0.38)),
           dict(type='text', text='员工治疗申请', xy=(x + w / 2, y + h - 0.22), size=0.17, align='CENTER', color=wht),
           dict(type='text', text='申请人', xy=(x + 0.1, y + h - 0.48), size=0.09, align='LEFT', color=(0.35, 0.35, 0.35)),
           dict(type='text', text='Delroy Campbell', xy=(x + 0.1, y + h - 0.7), size=0.15, align='LEFT', color=blk, font=L.FONT_STENCIL),
           dict(type='text', text='德尔罗伊·坎贝尔', xy=(x + 0.1, y + h - 0.88), size=0.12, align='LEFT', color=blk),
           dict(type='line', pts=[(x + 0.08, y + h - 0.95), (x + w - 0.08, y + h - 0.95)], w=0.006, color=(0.4, 0.4, 0.4)),
           dict(type='text', text='申请对象：孙子', xy=(x + 0.1, y + h - 1.15), size=0.15, align='LEFT', color=blk),
           dict(type='line', pts=[(x + 0.08, y + h - 1.24), (x + w - 0.08, y + h - 1.24)], w=0.006, color=(0.4, 0.4, 0.4)),
           dict(type='text', text='状态', xy=(x + 0.1, y + h - 1.42), size=0.09, align='LEFT', color=(0.35, 0.35, 0.35)),
           dict(type='rect', xywh=(x + 0.12, y + 0.12, w - 0.24, 0.36), color=(0.93, 0.92, 0.86)),
           dict(type='rect', xywh=(x + 0.12, y + 0.12, w - 0.24, 0.04), color=red),
           dict(type='rect', xywh=(x + 0.12, y + 0.44, w - 0.24, 0.04), color=red),
           dict(type='rect', xywh=(x + 0.12, y + 0.12, 0.04, 0.36), color=red),
           dict(type='rect', xywh=(x + w - 0.16, y + 0.12, 0.04, 0.36), color=red),
           dict(type='text', text='等待治疗资格', xy=(x + w / 2, y + 0.23), size=0.17, align='CENTER', color=red)]
    for k in ('old1', 'old2'):
        x, y, w, h = DECALS[k]
        it += [dict(type='rect', xywh=(x, y, w, h), color=(0.86, 0.84, 0.74)),
               dict(type='rect', xywh=(x, y + h - 0.12, w, 0.12), color=(0.12, 0.2, 0.38)),
               dict(type='text', text='员工治疗申请', xy=(x + w / 2, y + h - 0.09), size=0.06, align='CENTER', color=wht),
               dict(type='text', text='Delroy Campbell', xy=(x + 0.05, y + h - 0.25), size=0.055, align='LEFT', color=blk, font=L.FONT_STENCIL),
               dict(type='text', text='申请对象：孙子', xy=(x + 0.05, y + h - 0.38), size=0.06, align='LEFT', color=blk),
               dict(type='text', text='等待治疗资格', xy=(x + w / 2, y + 0.1), size=0.07, align='CENTER', color=red)]
    x, y, w, h = DECALS['board']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.12, 0.2, 0.38)),
           dict(type='text', text='员工公告栏  STAFF NOTICES', xy=(x + w / 2, y + 0.16), size=0.2, align='CENTER', color=wht)]
    x, y, w, h = DECALS['badge']
    it += [dict(type='rect', xywh=(x, y, w, h), color=wht),
           dict(type='rect', xywh=(x, y + h - 0.08, w, 0.08), color=(0.12, 0.2, 0.38)),
           dict(type='text', text='住宿管理处', xy=(x + w / 2, y + 0.1), size=0.08, align='CENTER', color=blk)]
    x, y, w, h = DECALS['keys']
    it += [dict(type='rect', xywh=(x, y, w, h), color=(0.9, 0.88, 0.8)),
           dict(type='text', text='钥匙柜 · 未经许可不得取用', xy=(x + w / 2, y + 0.1), size=0.08, align='CENTER', color=blk)]
    x, y, w, h = DECALS['files']
    for k in range(4):
        it += [dict(type='rect', xywh=(x + k * 0.4, y, 0.38, h), color=(0.9, 0.88, 0.8)),
               dict(type='text', text=('住客档案', '设备巡检', '疗养区', '员工申请')[k], xy=(x + k * 0.4 + 0.19, y + 0.14), size=0.08, align='CENTER', color=blk)]
    deco = L.render_graphic(L.GEN / NAME / 'decals.png', 2048, 2048, 4.0, 4.0, it, bg=(0.5, 0.5, 0.5))
    x, y, w, h = NOTES['code']
    # paper kept below white so the headlamp at 3 m does not bloom it over the ink
    nt = [dict(type='rect', xywh=(x, y, w, h), color=(0.74, 0.72, 0.64))]
    for r in range(9):
        nt.append(dict(type='line', pts=[(x + 0.03, y + 0.08 + r * 0.085), (x + w - 0.03, y + 0.08 + r * 0.085)], w=0.003, color=(0.5, 0.56, 0.7)))
    # top 0.16 of the sheet sits under the clip
    # digits in thick marker across the whole sheet: glyphs ~0.17 sheet units (~0.105 m), >= 18 px at 3.4 m, 1x
    marker = (0.012, 0.012, 0.04)
    nt += [dict(type='text', text='闸门', xy=(x + 0.05, y + 0.64), size=0.1, align='LEFT', color=ink, font=HAND),
           dict(type='text', text='F', xy=(x + 0.27, y + 0.64), size=0.1, align='LEFT', color=ink, font=HAND_DIGITS),
           dict(type='text', text=CODE, xy=(x + w / 2, y + 0.27), size=0.5, align='CENTER', color=marker, font=HAND_DIGITS, spacing=0.94, bold_offset=0.008),
           dict(type='line', pts=[(x + 0.04, y + 0.235), (x + w - 0.04, y + 0.225)], w=0.012, color=marker),
           dict(type='text', text='对不起', xy=(x + w / 2, y + 0.1), size=0.11, align='CENTER', color=ink, font=HAND),
           dict(type='text', text='为了让里面的人安全', xy=(x + w / 2, y + 0.025), size=0.05, align='CENTER', color=ink, font=HAND)]
    note = L.render_graphic(L.GEN / NAME / 'notes.png', 2048, 2048, 1.0, 1.0, nt, bg=(0.5, 0.5, 0.5))
    return deco, note


def drawer_cabinet(part, base, n, w=0.46, d=0.62, h=1.32, open_k=None, stn=None, kind='steel'):
    part.add(L.box(w, h, d, bevel=0.01), L.M((base.x, base.y + h / 2, base.z)), kind)
    dh = (h - 0.06) / n
    for k in range(n):
        yy = base.y + 0.03 + dh * (k + 0.5)
        dz = 0.32 if k == open_k else 0.0
        part.add(L.box(w - 0.04, dh - 0.02, 0.02, bevel=0.004), L.M((base.x, yy, base.z - d / 2 - 0.01 - dz)), kind)
        part.add(L.box(0.14, 0.025, 0.03, bevel=0.006), L.M((base.x, yy + dh * 0.2, base.z - d / 2 - 0.035 - dz)), 'chrome')
        if k == open_k:
            for s in (-1, 1):
                part.add(L.box(0.01, dh - 0.06, d - 0.05, bevel=0.0), L.M((base.x + s * (w / 2 - 0.04), yy - 0.02, base.z - dz - 0.01)), kind)
            for f in range(9):
                part.add(L.box(w - 0.12, dh - 0.12 - rng.uniform(0, 0.06), 0.012, bevel=0.0), L.M((base.x + rng.uniform(-0.01, 0.01), yy - 0.03, base.z - dz - d / 2 + 0.1 + f * 0.05), (rng.uniform(-8, 8), 0, 0)), 'paper')


def build():
    (L.GEN / NAME).mkdir(parents=True, exist_ok=True)
    A = L.Asset(NAME, KINDS, GROUPS, placement=(167, 0, 104), front='-Z',
                notes='Manager slumped over the desk; the code note hangs from her right hand over the far desk edge, facing -Z.')
    deco, note_img = graphic()
    KINDS['decal']['image'] = deco
    KINDS['note'] = dict(KINDS['decal'], image=note_img, grime=0.2, dirt=0.25, bio=0.1, silt=0.15, image_mix=0.6, seed=139)
    main = A.part('office')
    body = A.part('manager-corpse', group='figure')
    stn = A.part('stencils', group='decals')
    note = A.part('code-note', origin=tuple(NOTE), group='notes')
    guide = A.part('guide-placard', origin=tuple(GUIDE), group='decals')
    delroy = A.part('delroy-form', origin=tuple(DELROY), group='decals')

    # ---------------- clipboard frame (needed by the hand solve): bottom edge on the desk, nearly upright;
    # the normal is raised 16 deg so it points at the doorway photo station (12.8 deg above), no foreshortening
    lean = math.radians(16)
    board_c = Vector((0.0, DESK_TOP + BOARD_H / 2 * math.cos(lean) + 0.006, 0.0))
    hz = Vector((CAM_LOCAL.x - board_c.x, 0, CAM_LOCAL.z - board_c.z)).normalized()
    face = hz * math.cos(lean) + Vector((0, 1, 0)) * math.sin(lean)
    BOARD = L.look_at(tuple(board_c), tuple(board_c + face))
    bx, by, bzv = (BOARD.to_3x3() @ Vector(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))
    edge = max((board_c + bx * (BOARD_W / 2 + 0.01), board_c - bx * (BOARD_W / 2 + 0.01)), key=lambda p: p.x)
    grip = edge - by * 0.12 - bzv * 0.03
    grip.y = max(grip.y, DESK_TOP + 0.04)

    # ---------------- the manager
    fig = L.Figure('female', height=1.62)
    cfg = fig.cfg
    nb = fig.n_body
    YAW = L.M((0, 0, 0), (0, 180, 0))
    # Seated weight on the cushion; whatever the solve still drives into the desk top is flattened onto it
    # (see the clearance log below).
    PELVIS = Vector((-0.02, -2.43, float(os.environ.get('MGR_PZ', 0.86))))
    BODY = Matrix.Translation(PELVIS - YAW @ fig.rest_three(fig.bones['pelvis'][1])) @ YAW
    pose = {
        'pelvis': [('x', 12)], 'chest': [('z', -5)],
        'neck': [('x', 10), ('z', -12)], 'head': [('z', -40), ('y', -30)],
        'thigh.L': [('x', -92), ('y', -5)], 'thigh.R': [('x', -86), ('y', 7)],
        'shin.L': [('x', 78)], 'shin.R': [('x', 96)],
        'foot.L': [('x', -10)], 'foot.R': [('x', -6)],
        'clav.R': [('x', -14)], 'hand.R': [('x', 25)], 'hand.L': [('x', 10)],
    }
    head_c = (0.0, -0.05, 1.53)
    pose, e1 = fig.solve(pose, [('spine', 'x'), ('chest', 'x')], 'head', head_c, (0.08, DESK_TOP + 0.12, 0.28), world=BODY, ranges=[(0, 60), (0, 60)])
    wrist_rest = tuple(fig.bones['hand.R'][1])
    pose, e2 = fig.solve(pose, [('upper.R', 'x'), ('upper.R', 'y'), ('fore.R', 'x')], 'hand.R', wrist_rest, tuple(grip), world=BODY, ranges=[(-130, 30), (-45, 45), (-120, 0)])
    pose, e3 = fig.solve(pose, [('upper.L', 'x'), ('upper.L', 'y'), ('fore.L', 'x')], 'hand.L', tuple(fig.bones['hand.L'][1]), (PELVIS.x - 0.3, -2.62, PELVIS.z - 0.2), world=BODY, ranges=[(-40, 120), (-45, 45), (-60, 0)])
    L.log('manager solve errors', round(e1, 3), round(e2, 3), round(e3, 3))

    def region(i, co):
        if i >= nb:
            return 'eye'
        if co.z > cfg['neck_z'] + 0.02 and abs(co.x) < 0.13:
            if co.z > 1.555 and co.y > -0.1 or co.z > 1.6 or (co.y > 0.0 and co.z > 1.44):
                return 'hair'
            return 'skin'
        if fig.bone_weight(i, 'hand') > 0.5 or (co.z > 1.33 and abs(co.x) < 0.07 and co.y < -0.05):
            return 'skin'
        if fig.bone_weight(i, 'foot') > 0.5 or co.z < 0.1:
            return 'shoe'
        if co.z < cfg['leg_z'] + 0.04 and abs(co.x) < 0.26:
            return 'trousers'
        if abs(co.x) > cfg['arm_x'] and co.z < 0.93:
            return 'skin'
        return 'uniform'
    reg = [region(i, c) for i, c in enumerate(fig.rest)]
    # clothes stand off the body (jacket 2.6 cm, trousers 2 cm) and are smoothed so they drape, not paint on
    infl = {'eye': 0.0, 'skin': 0.0, 'hair': 0.012, 'shoe': 0.014, 'trousers': 0.02, 'uniform': 0.026}
    fig.smooth_rest([r in ('uniform', 'trousers', 'shoe') for r in reg], iterations=10, factor=0.5)
    bm = fig.pose(pose, inflate=lambda i, co: infl[reg[i]])
    # Soft contact: flesh and cloth that the solve pushed into the desk top are flattened onto it.
    Binv = BODY.inverted()
    dx0, dx1 = 0.2 - 0.85, 0.2 + 0.85
    flat = 0
    for v in bm.verts:
        p = BODY @ fig.rest_three(tuple(v.co))
        if dx0 < p.x < dx1 and D_FAR < p.z < D_NEAR and DESK_TOP - 0.09 < p.y < DESK_TOP + 0.003:
            p.y = DESK_TOP + 0.003
            v.co = (L.C4 @ (Binv @ p)) / fig.scale
            flat += 1
    L.log('manager flattened on desk', flat)
    pts = [BODY @ fig.rest_three(tuple(v.co)) for v in bm.verts]

    wrist_b = fig.bones['hand.R'][1]
    wrist = BODY @ fig.bone_matrix('hand.R') @ fig.rest_three(wrist_b)
    pel = BODY @ fig.bone_matrix('pelvis') @ fig.rest_three(fig.bones['pelvis'][1])
    feet = [BODY @ fig.bone_matrix(f'foot.{s}') @ fig.rest_three(fig.bones[f'foot.{s}'][2]) for s in 'LR']
    L.log('manager wrist', tuple(round(v, 3) for v in wrist), 'pelvis', tuple(round(v, 3) for v in pel), 'toes', [tuple(round(v, 3) for v in f) for f in feet])

    def lab(vs):
        rs = [reg[v] for v in vs]
        return max(set(rs), key=rs.count)
    for k, piece in fig.split(bm, lab).items():
        body.add(piece, BODY, k)

    def att(bone, m=Matrix.Identity(4)):
        return BODY @ fig.bone_matrix(bone) @ m

    def rp(x, y, z):
        return fig.rest_three((x, y, z))
    # hair bun, badge, lanyard keys
    body.add(L.lathe([(0, 0), (0.045, 0.005), (0.055, 0.035), (0.045, 0.065), (0, 0.075)], segs=18), att('head', L.M(tuple(rp(0, 0.035, 1.555)), (-75, 0, 0))), 'hair')
    # ---------------- desk: far edge just behind the wrist, top under the forearm
    desk_top = DESK_TOP
    dz0, dz1 = D_FAR, D_NEAR
    DW, DD = 1.7, dz1 - dz0
    dc = Vector((0.2, desk_top, (dz0 + dz1) / 2))
    main.add(L.box(DW, 0.04, DD, bevel=0.008), L.M((dc.x, desk_top - 0.02, dc.z)), 'wood')
    for s in (-1, 1):
        main.add(L.box(0.04, desk_top - FLOOR - 0.04, DD - 0.04, bevel=0.006), L.M((dc.x + s * (DW / 2 - 0.03), (desk_top + FLOOR) / 2 - 0.02, dc.z)), 'wood')
    main.add(L.box(DW - 0.1, 0.5, 0.02, bevel=0.004), L.M((dc.x, desk_top - 0.35, dz0 + 0.03)), 'wood')
    drawer_cabinet(main, Vector((dc.x + DW / 2 - 0.3, FLOOR, dc.z)), 3, w=0.42, d=DD - 0.06, h=desk_top - FLOOR - 0.05, kind='wood')
    # desk clutter: monitor (knocked over), keyboard, lamp, papers, ledger, phone
    main.add(L.box(0.5, 0.32, 0.04, bevel=0.01), L.M((dc.x + 0.5, desk_top + 0.03, dc.z - 0.05), (88, 0, 18)), 'plastic')
    main.add(L.box(0.46, 0.28, 0.005, bevel=0.0), L.M((dc.x + 0.5, desk_top + 0.053, dc.z - 0.05), (88, 0, 18)), 'screen')
    main.add(L.box(0.2, 0.015, 0.16, bevel=0.004), L.M((dc.x + 0.7, desk_top + 0.008, dc.z + 0.15)), 'plastic')
    main.add(L.lathe([(0, 0), (0.08, 0), (0.08, 0.02), (0.015, 0.03), (0, 0.03)], segs=16), L.M((dc.x - 0.8, desk_top, dz1 - 0.15)), 'brass')
    main.add(L.sweep([(dc.x - 0.8, desk_top + 0.02, dz1 - 0.15), (dc.x - 0.8, desk_top + 0.3, dz1 - 0.12), (dc.x - 0.92, desk_top + 0.4, dz1 - 0.2)], 0.008, segs=6, bend=0.05), None, 'brass')
    main.add(L.lathe([(0, 0), (0.06, 0.0), (0.1, 0.08), (0.0, 0.08)], segs=16, close_bottom=False), L.M((dc.x - 0.95, desk_top + 0.36, dz1 - 0.22), (-150, 0, 0)), 'brass')
    for k in range(9):
        main.add(L.box(0.21, 0.002, 0.297, bevel=0.0), L.M((dc.x - 0.2 + rng.uniform(-0.3, 0.4), desk_top + 0.002 + k * 0.002, dc.z + rng.uniform(-0.2, 0.2)), (0, rng.uniform(-40, 40), 0)), 'paper')
    for k in range(6):    # sheets settled on the floor (nothing left hanging in the water column)
        main.add(L.box(0.21, 0.002, 0.297, bevel=0.0), L.M((rng.uniform(-3.5, 3.5), FLOOR + 0.004 + k * 0.001, rng.uniform(-3.0, 3.2)), (rng.uniform(-3, 3), rng.uniform(0, 360), rng.uniform(-3, 3))), 'paper')
    main.add(L.box(0.25, 0.05, 0.33, bevel=0.01), L.M((dc.x + 0.05, desk_top + 0.025, dz1 - 0.25), (0, 12, 0)), 'fabric')
    # chair under the pelvis: cushion top at the buttocks (pelvis joint - 14 cm), slightly behind the hips
    butt = min((p.y for p in pts if abs(p.x - pel.x) < 0.2 and abs(p.z - pel.z) < 0.1), default=pel.y - 0.14)
    seat = Vector((pel.x, butt + 0.01, pel.z + 0.06))
    # clearance: body vertices inside the desk slab, the seat cushion or the drawer cabinet
    dmin = Vector((dc.x - DW / 2, desk_top - 0.045, dz0)); dmax = Vector((dc.x + DW / 2, desk_top - 0.004, dz1))
    smin = Vector((seat.x - 0.25, seat.y - 0.08, seat.z - 0.24)); smax = Vector((seat.x + 0.25, seat.y - 0.012, seat.z + 0.24))
    cmin = Vector((dc.x + DW / 2 - 0.51, FLOOR, dz0)); cmax = Vector((dc.x + DW / 2 - 0.09, desk_top - 0.05, dz1 - 0.03))
    inside = lambda p, a, b: a.x < p.x < b.x and a.y < p.y < b.y and a.z < p.z < b.z
    hit = {}
    for i, p in enumerate(pts):
        if inside(p, dmin, dmax):
            k = reg[i] if i < len(reg) else '?'
            hit[k] = (hit.get(k, (0, 9.0, 9.0))[0] + 1, round(min(hit.get(k, (0, 9.0, 9.0))[1], p.y - desk_top), 3), round(min(hit.get(k, (0, 9.0, 9.0))[2], p.z), 2))
    L.log('manager desk hits by region (count, deepest below top, min z)', hit)
    above = [p.y for p in pts if abs(p.x - seat.x) < 0.2 and abs(p.z - pel.z) < 0.1]
    L.log('manager seat gap (buttocks - cushion top)', round(min(above, default=9) - seat.y, 3))
    L.log('manager clearance desk', sum(inside(p, dmin, dmax) for p in pts), 'seat', sum(inside(p, smin, smax) for p in pts),
          'cabinet', sum(inside(p, cmin, cmax) for p in pts), 'bbox', [tuple(round(f(p[i] for p in pts), 2) for i in range(3)) for f in (min, max)], 'verts', len(pts))
    main.add(L.box(0.5, 0.08, 0.48, bevel=0.03), L.M((seat.x, seat.y - 0.04, seat.z)), 'fabric')
    main.add(L.box(0.46, 0.55, 0.07, bevel=0.03), L.M((seat.x, seat.y + 0.32, seat.z + 0.28), (-10, 0, 0)), 'fabric')
    main.add(L.cyl(0.025, seat.y - 0.08 - FLOOR - 0.08, segs=10), L.M((seat.x, (seat.y + FLOOR) / 2, seat.z)), 'chrome')
    for k in range(5):
        a = k * 2 * math.pi / 5
        main.add(L.box(0.03, 0.025, 0.3, bevel=0.006), L.M((seat.x + 0.14 * math.sin(a), FLOOR + 0.08, seat.z + 0.14 * math.cos(a)), (0, math.degrees(a), 0)), 'plastic')
        main.add(L.cyl(0.025, 0.03, segs=10), L.M((seat.x + 0.29 * math.sin(a), FLOOR + 0.03, seat.z + 0.29 * math.cos(a)), (0, math.degrees(a), 90)), 'rubber')
    # ---------------- steel clipboard with the code sheet, under her right hand, propped on a ledger stack
    # code-note origin stays on the layout photo point; geometry is placed in the BOARD frame around board_c
    note.add(L.box(BOARD_W + 0.02, BOARD_H + 0.03, 0.004, bevel=0.002), BOARD @ L.M((0, 0.005, -0.003)), 'steel')
    note.add(L.panel_uv(BOARD_W, BOARD_H, 0.0012, duv('code', NOTES, 1.0)), BOARD, 'note')
    note.add(L.box(0.13, 0.05, 0.022, bevel=0.006), BOARD @ L.M((0, BOARD_H / 2 - 0.02, 0.012)), 'chrome')
    note.add(L.cyl(0.006, 0.12, segs=10), BOARD @ L.M((0, BOARD_H / 2 - 0.045, 0.024), (0, 0, 90)), 'chrome')
    # ledger stack behind the board: its top front edge carries the board's back 0.12 m above the board centre
    depth, rise = 0.31, 0.12
    gap = rise * math.tan(lean) + 0.006
    stack_h = (board_c.y - desk_top) + rise
    sb = Vector((board_c.x, desk_top, board_c.z)) - hz * (gap + depth / 2)
    yaw = math.degrees(math.atan2(hz.x, hz.z))
    y0 = desk_top
    for k, (frac, dx, dr) in enumerate(((0.4, 0.0, 0), (0.35, 0.01, 4), (0.25, -0.01, -3))):
        hh = stack_h * frac
        main.add(L.box(0.24, hh - 0.002, 0.31, bevel=0.004), L.M((sb.x + dx, y0 + hh / 2, sb.z), (0, yaw + dr, 0)), 'fabric' if k == 1 else 'plastic')
        y0 += hh
    main.add(L.lathe([(0, 0), (0.04, 0), (0.042, 0.11), (0.038, 0.11), (0.036, 0.005), (0, 0.005)], segs=16), L.M((NOTE.x - 0.3, desk_top, NOTE.z + 0.18)), 'plastic')
    for k in range(4):
        main.add(L.cyl(0.004, 0.14, segs=6), L.M((NOTE.x - 0.3 + rng.uniform(-0.015, 0.015), desk_top + 0.1, NOTE.z + 0.18 + rng.uniform(-0.015, 0.015)), (rng.uniform(-12, 12), 0, rng.uniform(-12, 12))), 'plastic')
    L.log('clipboard centre', tuple(round(v, 3) for v in board_c), 'face', tuple(round(v, 3) for v in face), 'grip', tuple(round(v, 3) for v in grip))
    # ---------------- south wall: key cabinet + filing cabinets
    kc = Vector((dc.x + 1.4, -1.25, WALL_S - 0.06))
    main.add(L.box(0.7, 0.9, 0.12, bevel=0.012), L.M(tuple(kc)), 'wood')
    hinge = Vector((kc.x + 0.35, kc.y, kc.z - 0.06))
    Dm = L.M(tuple(hinge), (0, 60, 0)) @ L.M(tuple(-hinge))
    main.add(L.box(0.7, 0.9, 0.025, bevel=0.008), Dm @ L.M((kc.x, kc.y, kc.z - 0.073)), 'wood')
    main.add(L.box(0.6, 0.8, 0.006, bevel=0.0), Dm @ L.M((kc.x, kc.y, kc.z - 0.088)), 'glass')
    for r in range(4):
        for c in range(6):
            hp = Vector((kc.x - 0.27 + c * 0.108, kc.y + 0.3 - r * 0.2, kc.z - 0.05))
            main.add(L.cyl(0.004, 0.04, segs=6), L.M(tuple(hp), (90, 0, 0)), 'brass')
            if not (r == 1 and c == 3) and rng.random() < 0.8:
                main.add(L.torus(0.012, 0.0025, segu=10, segv=4), L.M(tuple(hp + Vector((0, -0.02, -0.02))), (90, 0, rng.uniform(-10, 10))), 'chrome')
                main.add(L.box(0.012, 0.045, 0.003, bevel=0.0), L.M(tuple(hp + Vector((0, -0.055, -0.02)))), 'brass')
    stn.add(L.panel_uv(0.33, 0.1, 0.002, duv('keys')), L.M((kc.x, kc.y + 0.52, WALL_S - 0.002), (0, 180, 0)), 'decal')
    for k in range(3):
        drawer_cabinet(main, Vector((dc.x - 1.6 - k * 0.5, FLOOR, WALL_S - 0.32)), 4, open_k=(2 if k == 1 else None))
    main.add(L.box(0.46, 0.62, 0.02, bevel=0.0), L.M((dc.x - 2.6, FLOOR + 1.33, WALL_S - 0.32)), 'steel')
    for k in range(4):
        stn.add(L.panel_uv(0.1, 0.025, 0.002, duv('files')), L.M((dc.x - 1.6 - (k % 3) * 0.5 - 0.1, FLOOR + 1.2 - k * 0.1, WALL_S - 0.635), (0, 180, 0)), 'decal')
    # ---------------- guide placard on the east wall (faces -X)
    G = guide
    SG = 0.2    # proud of the shell's frame rib at z 96
    for sy in (-0.6, 0.6):
        for sz in (-0.85, 0.85):
            G.add(L.box(SG, 0.06, 0.05, bevel=0.006), L.M((WALL_E - SG / 2, GUIDE.y + sy, GUIDE.z + sz)), 'steel')
    G.add(L.box(0.06, 1.6, 2.1, bevel=0.012), L.M((WALL_E - SG - 0.03, GUIDE.y, GUIDE.z)), 'steel')
    G.add(L.panel_uv(2.0, 1.5, 0.006, duv('guide')), L.M((WALL_E - SG - 0.06, GUIDE.y, GUIDE.z), (0, -90, 0)), 'decal')
    for sy in (-1, 1):
        for sz in (-1, 1):
            G.add(L.bolt(0.012, 0.01, segs=6, wsegs=8), L.M((WALL_E - SG - 0.066, GUIDE.y + sy * 0.72, GUIDE.z + sz * 0.97), (0, 0, 90)), 'chrome')
    # ---------------- notice board on the west wall (faces +X) with the Delroy form
    # the R5 shell runs a 0.17 m frame rib down this wall at z 92.3: the board stands proud of it on rails
    SO = 0.2
    nbc = Vector((WALL_W + SO + 0.02, -0.1, DELROY.z))
    for rz in (-0.95, 0.95):
        for ry in (-0.65, 0.55):
            main.add(L.box(SO, 0.06, 0.05, bevel=0.006), L.M((WALL_W + SO / 2, ry - 0.1, DELROY.z + rz)), 'steel')
    main.add(L.box(0.04, 1.7, 2.6, bevel=0.01), L.M(tuple(nbc)), 'wood')
    main.add(L.box(0.02, 1.55, 2.45, bevel=0.0), L.M(tuple(nbc + Vector((0.025, 0, 0)))), 'cork')
    stn.add(L.panel_uv(2.4, 0.5, 0.003, duv('board')), L.M((WALL_W + SO + 0.065, 0.98, DELROY.z), (0, 90, 0)), 'decal')
    for k, (dz, dy, rz) in enumerate(((-0.75, 0.1, -4), (0.78, 0.05, 6))):
        stn.add(L.panel_uv(0.42, 0.6, 0.002, duv('old%d' % (k + 1))), L.M((WALL_W + SO + 0.06, dy, DELROY.z + dz), (0, 90, 0)) @ L.M((0, 0, 0), (0, 0, rz)), 'decal')
    delroy.add(L.panel_uv(0.7, 1.0, 0.003, duv('delroy')), L.M(tuple(DELROY + Vector((SO - 0.235, -0.12, 0)))) @ L.M((0, 0, 0), (0, 90, 0)), 'decal')
    for py, pz in ((0.35, -0.3), (0.35, 0.3), (-0.6, -0.3)):
        delroy.add(L.lathe([(0, 0), (0.008, 0), (0.008, 0.01), (0.002, 0.01), (0.002, 0.02), (0, 0.02)], segs=10), L.M((WALL_W + SO + 0.068, DELROY.y - 0.12 + py, DELROY.z + pz), (0, 0, -90)), 'fabric')

    A.anchor('code-note', tuple(NOTE))
    A.anchor('guide-placard', tuple(GUIDE))
    A.anchor('delroy-form', tuple(DELROY))
    A.anchor('manager-head', tuple(att('head') @ rp(0, -0.05, 1.55)))
    wall = [((0, FLOOR - 0.25, 0), (8.0, 0.5, 8.0)), ((0, 1.0, WALL_S + 0.3), (8.0, 8.0, 0.6))]
    rep = A.finish(preview_cfg=dict(view=(-0.35, 0.75, -1.0), fov=40, focus=(0.1, -2.3, 0.4), radius=1.9, backdrop=wall,
                                    dark_lights=[(L.b((dc.x - 0.6, desk_top + 0.5, dz0 + 0.2)), 8, (1.0, 0.6, 0.3))],
                                    extra_views={'-body': dict(view=(0.8, 0.45, 0.7), focus=(0.0, -2.35, 0.55), radius=1.2), '-note': dict(view=(-0.15, 0.1, -1.0), focus=tuple(NOTE), radius=0.35),
                                                 '-guide': dict(view=(-1.0, 0.05, 0.0), focus=tuple(GUIDE), radius=1.4),
                                                 '-delroy': dict(view=(1.0, 0.05, 0.0), focus=tuple(DELROY), radius=1.4)}))
    print(rep.get('triangles'), rep.get('bytes'))


L.run_main(build)
