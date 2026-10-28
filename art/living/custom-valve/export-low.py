import bpy
from mathutils import Vector
base='C:/Users/Lenovo/Desktop/tiefei'
src=bpy.data.collections['L2_Valve_R10_Source']
tmp=bpy.data.collections.new('L2_Valve_Low_Export');bpy.context.scene.collection.children.link(tmp)
for original in src.objects:
 if original.name.startswith('L2V_hex nut') and -original.location.y>1:continue
 if original.name.startswith('L2V_flange stud'):continue
 o=original.copy();o.data=original.data.copy();tmp.objects.link(o)
 for mod in list(o.modifiers):o.modifiers.remove(mod)
 if any(s in original.name for s in ['bulged valve body','bonnet shoulder','branch cast barrel']):
  m=o.modifiers.new('Large silhouette bevel','BEVEL');m.width=.006;m.segments=1
 if original.name=='L2V_handwheel':
  m=o.modifiers.new('Low ring','DECIMATE');m.ratio=.5
deps=bpy.context.evaluated_depsgraph_get()
mats=list({o.data.materials[0] for o in tmp.objects})
merged=[]
for ma in mats:
 vs=[];fs=[]
 for o in list(tmp.objects):
  if o.data.materials[0]!=ma:continue
  ev=o.evaluated_get(deps);me=ev.to_mesh();offset=len(vs);vs.extend([tuple(o.matrix_world@v.co) for v in me.vertices]);fs.extend([tuple(offset+i for i in p.vertices) for p in me.polygons]);ev.to_mesh_clear()
 me=bpy.data.meshes.new('L2V_low_'+ma.name);me.from_pydata(vs,[],fs);me.materials.append(ma)
 ob=bpy.data.objects.new(me.name,me);tmp.objects.link(ob);merged.append(ob)
bpy.ops.object.select_all(action='DESELECT')
for ob in merged:ob.select_set(True)
bpy.context.view_layer.objects.active=merged[0]
bpy.ops.export_scene.gltf(filepath=base+'/public/assets/deepsea/living/custom-valve/l2-service-valve.glb',export_format='GLB',use_selection=True,export_yup=True)
print({'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in merged),'meshes':len(merged),'source_objects':len(src.objects)})
for o in list(tmp.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.collections.remove(tmp)
