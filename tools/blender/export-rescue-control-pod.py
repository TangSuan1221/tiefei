import bpy,json
from pathlib import Path
original=bpy.context.window.scene
try:
 scene=bpy.data.scenes['Rescue_Control_Pod_20261005'];bpy.context.window.scene=scene
 for obj in scene.objects:
  if obj.type!='MESH':continue
  for material in obj.data.materials:
   canonical=material.name.split('.')[0]
   existing=bpy.data.materials.get(canonical)
   if existing and existing!=material:existing.name=canonical+'_archived'
   material.name=canonical
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath='C:/Users/糖蒜/Desktop/铁肺/public/assets/deepsea/rescue-control-pod.glb',export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_cameras=False,export_lights=False)
 bpy.data.libraries.write('C:/Users/糖蒜/Desktop/铁肺/assets/blender/rescue-control-pod.blend',{scene},fake_user=True)
 report_path=Path('C:/Users/糖蒜/Desktop/铁肺/public/assets/deepsea/rescue-control-pod.json')
 report=json.loads(report_path.read_text(encoding='utf8'));report['materials']=sorted({mat.name for obj in scene.objects if obj.type=='MESH' for mat in obj.data.materials});report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
 print('Control pod exported using active scene only: '+str(len(scene.objects))+' objects')
finally:bpy.context.window.scene=original

