import bpy, math
from mathutils import Vector
from pathlib import Path
original=bpy.context.window.scene
source=bpy.data.scenes['Rescue_Power_Cabinet_20261005']
preview=source.copy();preview.name='Control_Pod_Preview'
bpy.context.window.scene=preview
try:
 preview.render.engine='CYCLES';preview.cycles.samples=24;preview.cycles.use_denoising=True
 world=bpy.data.worlds.new('ControlPodPreviewWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.13,.14,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;preview.world=world
 def p(x,y,z):return Vector((x,-z,y))
 camera_data=bpy.data.cameras.new('ControlPodPreviewCamera');camera=bpy.data.objects.new('ControlPodPreviewCamera',camera_data);preview.collection.objects.link(camera);camera.location=p(3.1,1.8,5.8);camera.rotation_euler=(p(0,0,0)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=52;preview.camera=camera
 for name,loc,power,color,size in [('Key',(2,5,5),650,(.77,.91,1),5),('Fill',(-4,3,3),360,(.65,.83,.80),4),('Rim',(1,4,-4),500,(1,.71,.43),3)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);preview.collection.objects.link(obj);obj.location=p(*loc);obj.rotation_euler=(p(0,0,0)-obj.location).to_track_quat('-Z','Y').to_euler()
 preview.render.resolution_x=900;preview.render.resolution_y=760;preview.render.resolution_percentage=100
 preview.render.image_settings.file_format='PNG';preview.render.filepath='C:/Users/糖蒜/Desktop/铁肺/qa/harbor/art-2026-10-05/power-cabinet-blender.png'
 bpy.ops.render.render(write_still=True)
 print('Rendered power-cabinet-blender.png')
finally:
 bpy.context.window.scene=original
 bpy.data.scenes.remove(preview)

