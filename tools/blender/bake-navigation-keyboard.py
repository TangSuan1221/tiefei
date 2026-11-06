"""Bake the procedural keypad materials into one texture atlas and export a GLB.

Run after build-navigation-keyboard.py in the same Blender session. Works on
copies inside a temporary scene so the authoring scene stays procedural.
Output: public/assets/deepsea/navigation-keyboard.glb (+ assets/blender/*.blend).
"""
import bpy, bmesh, math, os

ROOT = r'C:\Users\Lenovo\Desktop\tiefei'
SIZE = int(os.environ.get('NAVKB_ATLAS', '2048'))
src = bpy.data.scenes['NavKeyboard']
bpy.context.window.scene = src

for n in ('NavKeyboardBake',):
    old = bpy.data.scenes.get(n)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
for n in ('navkb_color', 'navkb_orm'):
    im = bpy.data.images.get(n)
    if im:
        bpy.data.images.remove(im)

bake = bpy.data.scenes.new('NavKeyboardBake')
bpy.context.window.scene = bake
bake.render.engine = 'CYCLES'
bake.cycles.device = 'GPU'
bake.cycles.samples = 64
bake.render.bake.margin = 6

# ---- copy hierarchy -----------------------------------------------------------------
parts = [o for o in src.objects if o.users_collection[0].name in ('NavigationKeyboard', 'NavKeyboardPanel')]
copies = {}
for o in parts:
    c = o.copy()
    if o.type == 'MESH':
        c.data = o.data.copy()
    bake.collection.objects.link(c)
    copies[o] = c
for o, c in copies.items():
    if o.parent in copies:
        c.parent = copies[o.parent]
        c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
meshes = [c for c in copies.values() if c.type == 'MESH']
view_layer = bake.view_layers[0]

# ---- atlas UVs ---------------------------------------------------------------------------
# One combined world-space mesh is unwrapped (operators only see one edit object reliably
# through MCP), then its UVs are copied back to each part by face order.
atlas_me = bpy.data.meshes.new('navkb_atlas')
bm = bmesh.new()
spans = []
for c in meshes:
    me = c.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    part = bmesh.new(); part.from_mesh(me); part.transform(c.matrix_world)
    tmp = bpy.data.meshes.new('tmp'); part.to_mesh(tmp); part.free()
    f0 = len(bm.faces)
    bm.from_mesh(tmp)
    bm.faces.ensure_lookup_table()
    spans.append((c, f0, len(bm.faces)))
    bpy.data.meshes.remove(tmp)
bm.to_mesh(atlas_me); bm.free()
atlas = bpy.data.objects.new('navkb_atlas', atlas_me)
bake.collection.objects.link(atlas)
atlas_me.uv_layers.new(name='UVMap')
with bpy.context.temp_override(window=bpy.context.window, scene=bake, view_layer=view_layer):
    for c in view_layer.objects:
        c.select_set(c is atlas, view_layer=view_layer)
    view_layer.objects.active = atlas
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.002, area_weight=0, scale_to_bounds=False)
    # AABB packing: engraved legends create thousands of tiny islands; concave packing stalls on them.
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=False, scale=True, margin_method='FRACTION', margin=.002, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
auv = atlas_me.uv_layers['UVMap'].data
apoly = atlas_me.polygons
for c, f0, f1 in spans:
    uv = c.data.uv_layers['UVMap'].data
    for poly, src_poly in zip(c.data.polygons, apoly[f0:f1]):
        for li, ai in zip(poly.loop_indices, src_poly.loop_indices):
            uv[li].uv = auv[ai].uv
bpy.data.objects.remove(atlas); bpy.data.meshes.remove(atlas_me)
xs = [d.uv.x for c in meshes for d in c.data.uv_layers['UVMap'].data]
print('uv spread', round(min(xs), 3), round(max(xs), 3), 'caps', sum(1 for c in meshes if c.get('control')))

# ---- bake targets ------------------------------------------------------------------------
color = bpy.data.images.new('navkb_color', SIZE, SIZE, alpha=False)
orm = bpy.data.images.new('navkb_orm', SIZE, SIZE, alpha=False, float_buffer=False)
orm.colorspace_settings.name = 'Non-Color'
mats = sorted({m for c in meshes for m in c.data.materials if m}, key=lambda m: m.name)


def target(img):
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE_TARGET'; n.image = img
        for x in nt.nodes:
            x.select = False
        n.select = True; nt.nodes.active = n


def emit_from(sock_name, channel_map=None):
    """Route a reroute (BC/RG/MT) into an Emission shader for EMIT bake."""
    for m in mats:
        nt = m.node_tree
        out = nt.nodes['OUT']
        em = nt.nodes.get('BAKE_EMIT') or nt.nodes.new('ShaderNodeEmission')
        em.name = 'BAKE_EMIT'
        for l in list(em.inputs[0].links):
            nt.links.remove(l)
        if sock_name == 'ORM':
            comb = nt.nodes.get('BAKE_COMB') or nt.nodes.new('ShaderNodeCombineXYZ')
            comb.name = 'BAKE_COMB'
            for i in range(3):
                for l in list(comb.inputs[i].links):
                    nt.links.remove(l)
            comb.inputs[0].default_value = 1.0
            nt.links.new(nt.nodes['RG'].outputs[0], comb.inputs[1])
            nt.links.new(nt.nodes['MT'].outputs[0], comb.inputs[2])
            nt.links.new(comb.outputs[0], em.inputs[0])
        else:
            nt.links.new(nt.nodes[sock_name].outputs[0], em.inputs[0])
        nt.links.new(em.outputs[0], out.inputs[0])


def restore():
    for m in mats:
        nt = m.node_tree
        nt.links.new(nt.nodes['BSDF'].outputs[0], nt.nodes['OUT'].inputs[0])
        for n in ('BAKE_EMIT', 'BAKE_COMB', 'BAKE_TARGET'):
            if nt.nodes.get(n):
                nt.nodes.remove(nt.nodes[n])


def run_bake(kind):
    with bpy.context.temp_override(window=bpy.context.window, scene=bake, view_layer=view_layer):
        for c in view_layer.objects:
            c.select_set(c.type == 'MESH', view_layer=view_layer)
        view_layer.objects.active = meshes[0]
        bpy.ops.object.bake(type=kind, margin=6, use_clear=True)


try:
    target(color); emit_from('BC'); run_bake('EMIT')
    target(orm); emit_from('ORM'); run_bake('EMIT')
    # Occlusion channel from a real AO bake (whole assembly, so keys darken the pocket).
    ao = bpy.data.images.new('navkb_ao', SIZE, SIZE, alpha=False); ao.colorspace_settings.name = 'Non-Color'
    restore(); target(ao)
    bake.cycles.samples = 96
    bake.world = src.world
    with bpy.context.temp_override(window=bpy.context.window, scene=bake, view_layer=view_layer):
        for c in view_layer.objects:
            c.select_set(c.type == 'MESH', view_layer=view_layer)
        view_layer.objects.active = meshes[0]
        bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
    import numpy as np
    a = np.array(ao.pixels[:], dtype=np.float32).reshape(-1, 4)
    o = np.array(orm.pixels[:], dtype=np.float32).reshape(-1, 4)
    o[:, 0] = .35 + .65 * a[:, 0]
    orm.pixels[:] = o.ravel()
    bpy.data.images.remove(ao)
finally:
    restore()

tex_dir = os.path.join(ROOT, 'assets', 'blender', 'navigation-keyboard')
os.makedirs(tex_dir, exist_ok=True)
for img, name in ((color, 'navkb_color.png'), (orm, 'navkb_orm.png')):
    img.filepath_raw = os.path.join(tex_dir, name); img.file_format = 'PNG'; img.save()

# ---- export materials: one atlas material per surface family -------------------------------
# Keys keep a separate material so the runtime can tint hover/press without touching the frame.
def export_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs[0])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = color
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tc.outputs[0], b.inputs['Base Color'])
    nt.links.new(tr.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], b.inputs['Roughness'])
    nt.links.new(sep.outputs[2], b.inputs['Metallic'])
    # glTF exporter picks occlusion from a glTF Material Output group; R of the ORM is AO.
    grp = bpy.data.node_groups.get('glTF Material Output')
    if grp is None:
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp
    nt.links.new(sep.outputs[0], g.inputs['Occlusion'])
    return m


body = export_mat('navkb_body')
keys = export_mat('navkb_key')
for c in meshes:
    c.data.materials.clear()
    c.data.materials.append(keys if c.get('control') else body)

# Names in the GLB must be stable; strip Blender's .001 suffixes from the copies.
for o, c in copies.items():
    c.name = o.name.split('.')[0] if o.get('control') or o.type == 'EMPTY' else o.name.split('.')[0]

out_dir = os.path.join(ROOT, 'public', 'assets', 'deepsea')
path = os.path.join(out_dir, 'navigation-keyboard.glb')
with bpy.context.temp_override(window=bpy.context.window, scene=bake, view_layer=view_layer):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_active_scene=True, export_yup=True,
                              export_extras=True, export_apply=True, export_image_format='WEBP',
                              export_image_quality=88, export_materials='EXPORT')
bpy.data.libraries.write(os.path.join(ROOT, 'assets', 'blender', 'navigation-keyboard.blend'), {src, bake}, fake_user=True)
bpy.context.window.scene = src
print({'glb': path, 'kb': round(os.path.getsize(path) / 1024), 'meshes': len(meshes), 'atlas': SIZE})
