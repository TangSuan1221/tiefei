import bpy,os
from mathutils import Vector
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('Cassette visual QA');scene.collection.children.link(bpy.data.collections['HarborAccidentCassette']);bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world=bpy.data.worlds.new('Cassette QA world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.09,.09,1)
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(3,-5,3));cam=bpy.context.object;cam.rotation_euler=(Vector((-.25,0,1.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.5;scene.camera=cam
for p,power,size in [((1,-3,4),450,3),((-3,-1,2),250,2)]:
 bpy.ops.object.light_add(type='AREA',location=p);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,1))-l.location).to_track_quat('-Z','Y').to_euler()
out=r'C:\Users\糖蒜\Desktop\铁肺\artifacts\harbor-visual-iteration';os.makedirs(out,exist_ok=True);scene.render.filepath=os.path.join(out,'accident-cassette-blender.png')
bpy.ops.render.render(write_still=True)
bpy.context.window.scene=previous;bpy.data.scenes.remove(scene)
print('Cassette preview rendered')
