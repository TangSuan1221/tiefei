"""Comparison renders for the navigation keypad (run after build-navigation-keyboard.py).

Writes qa/navigation-keyboard/blender-{front,side,back,beauty}.png. The render rig
lives in its own collection and is never exported.
"""
import bpy, math, os
from mathutils import Vector

ROOT = r'C:\Users\Lenovo\Desktop\tiefei'
OUT = os.path.join(ROOT, 'qa', 'navigation-keyboard')
VIEWS = os.environ.get('NAVKB_VIEWS', 'front,side,back,beauty').split(',')
scene = bpy.data.scenes['NavKeyboard']
bpy.context.window.scene = scene

old = bpy.data.collections.get('NavKeyboardRender')
if old:
    for o in list(old.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
rig = bpy.data.collections.new('NavKeyboardRender')
scene.collection.children.link(rig)


def add(o):
    rig.objects.link(o)
    return o


def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, loc, target, energy, color, size):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color; ld.size = size
    o = add(bpy.data.objects.new(name, ld)); o.location = loc; aim(o, target)
    return o


def floor(color, rough):
    me = bpy.data.meshes.new('floor')
    me.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    o = add(bpy.data.objects.new('floor', me))
    m = bpy.data.materials.get('render_floor') or bpy.data.materials.new('render_floor')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = color; b.inputs['Roughness'].default_value = rough
    me.materials.append(m)
    return o


# Bounds of the exported asset.
pts = []
for o in scene.objects:
    if o.type == 'MESH' and o.users_collection[0].name in ('NavigationKeyboard', 'NavKeyboardPanel'):
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid = (lo + hi) / 2
panel = scene.objects['nav_keyboard_panel']
normal = (panel.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
panel_mid = panel.matrix_world @ Vector((0, .129, .01))

world = bpy.data.worlds.get('NavKeyboardWorld') or bpy.data.worlds.new('NavKeyboardWorld')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
scene.world = world
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for dv in prefs.devices:
    dv.use = dv.type == 'OPTIX'
scene.cycles.device = 'GPU'
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'

cam_data = bpy.data.cameras.new('cam')
cam = add(bpy.data.objects.new('cam', cam_data))
scene.camera = cam


def shoot(name, samples=96, res=(900, 760)):
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(OUT, 'blender-' + name + '.png')
    bpy.ops.render.render(write_still=True)


def studio():
    """Neutral sheet lighting like the 3-view concept."""
    bg.inputs[0].default_value = (.045, .047, .05, 1); bg.inputs[1].default_value = 1
    lights = [area('s_key', mid + Vector((-.5, -.6, .7)), mid, 30, (1, .96, .9), .8),
              area('s_fill', mid + Vector((.6, -.4, .2)), mid, 10, (.9, .94, 1), .9),
              area('s_back', mid + Vector((.2, .7, .5)), mid, 14, (1, .97, .92), .8)]
    return lights


if {'front', 'side', 'back'} & set(VIEWS):
    lights = studio()
    cam_data.type = 'ORTHO'
    scene.view_settings.look = 'AgX - Base Contrast'
    if 'front' in VIEWS:
        cam_data.ortho_scale = .36
        cam.location = panel_mid + normal * .6; aim(cam, panel_mid)
        shoot('front')
    if 'side' in VIEWS:
        cam_data.ortho_scale = .36
        cam.location = Vector((.8, mid.y, mid.z)); aim(cam, (0, mid.y, mid.z))
        shoot('side')
    if 'back' in VIEWS:
        cam_data.ortho_scale = .36
        cam.location = Vector((0, .8, mid.z)); aim(cam, (0, 0, mid.z))
        shoot('back')
    for l in lights:
        bpy.data.objects.remove(l, do_unlink=True)

if 'beauty' in VIEWS:
    # Matches reference-render.webp: low 3/4 view from front-left, warm low-key light.
    f = floor((.03, .016, .013, 1), .5)
    bg.inputs[0].default_value = (.018, .008, .007, 1); bg.inputs[1].default_value = 1
    area('b_key', panel_mid + Vector((-.45, -.25, .6)), panel_mid, 16, (1, .74, .52), .35)
    area('b_rim', panel_mid + Vector((.55, .05, .25)), panel_mid, 10, (1, .5, .25), .2)
    area('b_fill', panel_mid + Vector((.05, -.7, .15)), panel_mid, 1.5, (.8, .8, .9), .8)
    cam_data.type = 'PERSP'; cam_data.lens = 50
    cam_data.dof.use_dof = True; cam_data.dof.aperture_fstop = 5.6
    side = Vector((1, 0, 0))
    cam.location = panel_mid + normal * .43 - side * .17 + Vector((0, 0, .1))
    target = panel_mid + Vector((.02, .0, -.01))
    aim(cam, target)
    cam_data.dof.focus_distance = (target - cam.location).length
    scene.view_settings.look = 'AgX - Medium High Contrast'
    shoot('beauty', 160, (1280, 720))
    cam_data.dof.use_dof = False
print({'views': VIEWS, 'mid': tuple(round(v, 3) for v in mid), 'size': tuple(round(v, 3) for v in hi - lo)})
