import bpy,os
from mathutils import Vector
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('CreatureSkinVisualQA')
with bpy.data.libraries.load(r'C:\Users\糖蒜\Desktop\铁肺\assets\blender\harbor-creature-skin.blend',link=False) as (source,target):
 target.objects=[n for n in source.objects if n.startswith('harbor_creature_fused_body')]
body=target.objects[0];scene.collection.objects.link(body);bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Creature QA');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.085,.09,1)
bpy.ops.object.camera_add(location=(4.2,-5.6,3.5));camera=bpy.context.object;camera.rotation_euler=(Vector((0,-.1,.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.2;scene.camera=camera
for p,power,size in [((1,-3,5),500,4),((-3,1,3),350,3)]:
 bpy.ops.object.light_add(type='AREA',location=p);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,.8))-light.location).to_track_quat('-Z','Y').to_euler()
out=r'C:\Users\糖蒜\Desktop\铁肺\qa\harbor\visual-2026-10-11\creature-skin';os.makedirs(out,exist_ok=True);scene.render.filepath=os.path.join(out,'blender-neutral.png');bpy.ops.render.render(write_still=True)
bpy.context.window.scene=previous;bpy.data.scenes.remove(scene)
print('Creature neutral inspection render saved')
