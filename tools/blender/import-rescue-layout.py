"""Editable rescue-layer handoff imported from actual game meshes and textures."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/糖蒜/Desktop/铁肺')
scene=bpy.data.scenes.new('L01_Rescue_Harbor_Deep_Layout')
bpy.context.window.scene=scene
bpy.ops.import_scene.gltf(filepath=str(root/'assets/blender/rescue-harbor-layout.glb'))
def b(p):return Vector((p[0],-p[2],p[1]))
camera_data=bpy.data.cameras.new('Game_Observe_64deg');camera=bpy.data.objects.new('Game_Observe_64deg',camera_data);scene.collection.objects.link(camera)
camera.location=b((60,0,27));camera.rotation_euler=(b((60,0,12))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='PERSP';camera_data.sensor_fit='VERTICAL';camera_data.sensor_height=24;camera_data.lens=12/math.tan(math.radians(32));scene.camera=camera
overview_data=bpy.data.cameras.new('Layout_Overview');overview=bpy.data.objects.new('Layout_Overview',overview_data);scene.collection.objects.link(overview)
overview.location=b((60,8,35));overview.rotation_euler=(b((60,.508,16.456))-overview.location).to_track_quat('-Z','Y').to_euler();overview_data.sensor_fit='VERTICAL';overview_data.sensor_height=24;overview_data.lens=12/math.tan(math.radians(32));scene.camera=overview
scene['layout_review_camera']='Layout_Overview: diagnostic elevated composition, not the normal gameplay camera'
for name,p,target,color,power,size in [('Cold_Key_01',(54,5,16),(57,-1,13),(.55,.85,.80),1700,3),('Cold_Key_03',(80,6,17),(77,-1,12),(.60,.80,.85),1500,3),('Back_Rim',(62,10,1),(60,0,10),(.25,.58,.59),2000,5),('Camera_Fill',(60,1,26),(60,0,14),(.50,.70,.65),300,6)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.color=color;light.shape='DISK';light.size=size
    o=bpy.data.objects.new(name,light);scene.collection.objects.link(o);o.location=b(p);o.rotation_euler=(b(target)-o.location).to_track_quat('-Z','Y').to_euler()
scene.world=bpy.data.worlds.new('Deep_Sea_Ambient');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.025,.065,.065,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.3
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene['runtime_profile']='main-authored / rescue art layer';scene['note']='Editable visual layer; original main-game collisions, triggers, rooms and logic remain authoritative. This is not UE5 or a runtime replacement.'
bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.data.libraries.write(str(root/'assets/blender/rescue-harbor-layout.blend'),{scene},fake_user=True)
print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'saved':'assets/blender/rescue-harbor-layout.blend','rendered':False}))

