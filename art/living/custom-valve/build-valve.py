import bpy, math, os
from mathutils import Vector
base='C:/Users/Lenovo/Desktop/tiefei'
col=bpy.data.collections.new('L2_Valve_R10_Source');bpy.context.scene.collection.children.link(col)
def mat(n,c,metal,rough):
 m=bpy.data.materials.new(n);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
paint=mat('L2 valve blue enamel',(.035,.095,.14),.2,.65);steel=mat('L2 valve steel',(.19,.22,.21),.8,.35);red=mat('L2 valve red wheel',(.24,.045,.025),.2,.67)
def loc(v):return Vector((v[0],-v[2],v[1]))
def own(o,n,m,bevel=.006):
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o);o.name='L2V_'+n;o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Machined edge radius','BEVEL');mod.width=bevel;mod.segments=2
  mod=o.modifiers.new('Face weighted normals','WEIGHTED_NORMAL')
 return o
def cyl(n,p,r,l,m,axis=(0,0,1),verts=20):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=l,location=loc(p));o=bpy.context.object;o.rotation_euler=Vector((0,0,1)).rotation_difference(loc(axis)).to_euler();return own(o,n,m)
def box(n,p,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return own(o,n,m,.008)
def rod(n,a,b,r,m,verts=12):
 a,b=Vector(a),Vector(b);return cyl(n,(a+b)/2,r,(b-a).length,m,(b-a).normalized(),verts)
cyl('branch cast barrel',(0,0,.6),.18,1.4,paint)
cyl('bulged valve body',(0,0,.02),.245,.45,paint)
cyl('bonnet shoulder',(0,0,-.24),.165,.16,steel)
cyl('stem packing nut',(0,0,-.34),.09,.12,steel,verts=6)
cyl('stem',(0,0,-.43),.04,.16,steel,verts=12)
for z in [.94,1.06]:cyl('vessel flange',(0,0,z),.29,.08,paint,verts=24)
cyl('compressed gasket',(0,0,1),.266,.022,steel,verts=24)
for i in range(8):
 a=i*math.tau/8;x,y=math.cos(a)*.235,math.sin(a)*.235
 cyl('flange stud',(x,y,1),.025,.24,steel,verts=8)
 for z in [.865,1.135]:cyl('hex nut',(x,y,z),.042,.045,steel,verts=6)
# Cast ribs carry the bonnet load into the barrel.
for x in [-.11,.11]:box('bonnet rib',(x,0,-.15),(.035,.29,.25),paint)
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,rotation=(math.pi/2,0,0),location=loc((0,0,-.52)),major_radius=.28,minor_radius=.032);own(bpy.context.object,'handwheel',red,0)
for i in range(4):
 a=i*math.tau/4;rod('wheel spoke',(0,0,-.52),(.26*math.cos(a),.26*math.sin(a),-.52),.018,red)
cyl('wheel hub',(0,0,-.52),.065,.08,steel,verts=12)
box('cast foot',(0,-.29,.12),(.35,.1,.34),paint)
box('support saddle',(0,-.41,.12),(.44,.15,.42),steel)
for x in [-.15,.15]:cyl('foot bolt',(x,-.335,.12),.035,.16,steel,axis=(0,1,0),verts=6)
# Save editable modifiers before generating disposable export-only merged meshes.
bpy.ops.wm.save_as_mainfile(filepath=base+'/art/living/custom-valve/l2-service-valve.blend',copy=True)
exp=bpy.data.collections.new('L2_Valve_R10_Export');bpy.context.scene.collection.children.link(exp);deps=bpy.context.evaluated_depsgraph_get()
for ma in [paint,steel,red]:
 vs=[];fs=[]
 for o in col.objects:
  if o.type!='MESH' or o.data.materials[0]!=ma:continue
  ev=o.evaluated_get(deps);mesh=ev.to_mesh();offset=len(vs);vs.extend([tuple(o.matrix_world@v.co) for v in mesh.vertices]);fs.extend([tuple(offset+i for i in p.vertices) for p in mesh.polygons]);ev.to_mesh_clear()
 me=bpy.data.meshes.new('L2V_export_'+ma.name);me.from_pydata(vs,[],fs);me.materials.append(ma);ob=bpy.data.objects.new(me.name,me);exp.objects.link(ob)
bpy.ops.object.select_all(action='DESELECT')
for o in exp.objects:o.select_set(True)
bpy.context.view_layer.objects.active=list(exp.objects)[0]
bpy.ops.export_scene.gltf(filepath=base+'/public/assets/deepsea/living/custom-valve/l2-service-valve.glb',export_format='GLB',use_selection=True,export_yup=True)
print({'source_objects':len(col.objects),'export_meshes':len(exp.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exp.objects),'defaults_preserved':all(n in bpy.data.objects for n in ['Cube','Camera','Light'])})
# Remove only our temporary export copies; source collection stays editable.
for o in list(exp.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.collections.remove(exp)
