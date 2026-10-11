"""MCP-authored damaged distribution cassette; metres, local front -Y."""
import bpy, math, os, random
from mathutils import Vector
random.seed(41)
ROOT = r'C:\Users\糖蒜\Desktop\铁肺'
name='HarborAccidentCassette'
old=bpy.data.collections.get(name)
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(old)
col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
def mat(n,c,metal=.5,rough=.65):
    m=bpy.data.materials.new('harbor_cassette_'+n);m.diffuse_color=(*c,1);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
    return m
paint=mat('paint',(.19,.25,.23));steel=mat('steel',(.29,.31,.29),.85,.43)
black=mat('rubber',(.025,.032,.031),.05,.89);copper=mat('copper',(.33,.16,.075),.7,.58)
ivory=mat('ivory',(.62,.58,.44),.1,.8);rust=mat('rust',(.19,.095,.038),.2,.96)
def adopt(o,n,m):
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o);o.name=n;o.data.materials.append(m);return o
def cube(n,p,s,m,bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=adopt(bpy.context.object,n,m);o.dimensions=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def rod(n,a,b,r,m,verts=10):
    d=Vector(b)-Vector(a);p=(Vector(a)+Vector(b))/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=p)
    o=adopt(bpy.context.object,n,m);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
cube('backplate',(0,.13,1.12),(1.62,.12,2.24),paint)
for x in [-.8,.8]:cube('folded cabinet cheek',(x,-.05,1.12),(.065,.44,2.24),paint)
for z in [.02,2.22]:cube('folded cabinet cap',(0,-.05,z),(1.64,.44,.07),paint)
cube('dark recessed cavity',(0,.048,1.12),(1.46,.04,2.06),black)
for z in [.56,1.18,1.8]:
    cube('DIN steel rail',(0,-.025,z),(1.35,.055,.055),steel)
    for x in [-.5,-.25,0,.25,.5]:
        cube('aged ceramic fuse',(x,-.115,z+.05),(.17,.19,.29),ivory,.025)
        cube('fuse toggle',(x,-.225,z+.06),(.085,.04,.09),black,.009)
        for zz in [z-.055,z+.17]:rod('terminal screw',(x,-.222,zz),(x,-.235,zz),.024,steel)
for i in range(9):
    x=-.61+i*.15
    pts=[(x,-.04,.07),(x,-.11,.25),(x+.025,-.15,.36),(x+.025,-.15,.45)]
    if i%3==0:pts=[(x,-.03,1.05),(x-.06,-.19,.86),(x+.04,-.28,.65),(x+.09,-.33,.23)]
    for a,b in zip(pts,pts[1:]):rod('dislodged insulated lead',a,b,.016,copper if i%3==0 else black)
# Torn service door stays attached to its left hinge and projects less than .75m.
door=cube('hanging inspection door',(-1.12,-.35,1.13),(.62,.055,2.12),paint)
door.rotation_euler[2]=-.72;door.rotation_euler[1]=-.07
for z in [.35,1.78]:rod('hinge barrel',(-.84,-.23,z-.10),(-.84,-.23,z+.10),.045,steel)
plaque=cube('service serial plaque',(0,-.038,.51),(.37,.012,.19),ivory,.004);plaque.parent=door
for i in range(6):
    line=cube('plaque engraving',(0,-.046,.47+i*.013),(.24 if i%2 else .29,.003,.003),black,0);line.parent=door
for z in [.2,2.02]:
    for x in [-.7,.7]:rod('hex fastener',(x,-.272,z),(x,-.295,z),.027,steel,6)
# Flaked edges are actual flat irregular islands instead of uniform orange boxes.
for i in range(64):
    x=random.choice([-.77,.77])+random.uniform(-.022,.022);z=random.uniform(.08,2.16)
    w=random.uniform(.006,.025);h=random.uniform(.009,.06)
    vertices=[(x-w,-.274,z-h),(x+w*.8,-.274,z-h*.4),(x+w,-.274,z+h*.3),(x-w*.2,-.274,z+h)]
    mesh=bpy.data.meshes.new('irregular paint scar');mesh.from_pydata(vertices,[],[(0,1,2,3)]);mesh.materials.append(rust)
    o=bpy.data.objects.new('oxidised paint loss',mesh);col.objects.link(o)
# Export only this asset; preserve other MCP-authored scene contents.
# Explicit isolated export scene avoids hidden selected objects in an existing file.
previous=bpy.context.window.scene
isolated=bpy.data.scenes.new('HarborCassetteExport');isolated.collection.children.link(col)
bpy.context.window.scene=isolated
out=os.path.join(ROOT,'public','assets','deepsea');os.makedirs(out,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'harbor-accident-cassette.glb'),export_format='GLB',use_active_scene=True,export_yup=True)
source=os.path.join(ROOT,'assets','blender');os.makedirs(source,exist_ok=True)
bpy.data.libraries.write(os.path.join(source,'harbor-accident-cassette.blend'),{isolated})
bpy.context.window.scene=previous
bpy.data.scenes.remove(isolated)
print({'asset':'harbor-accident-cassette','objects':len(col.objects),'export':out})
