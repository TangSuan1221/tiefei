import bpy, math, json
scene=bpy.data.scenes['L01_Rescue_Harbor_Deep_Layout']
for obj in scene.objects:
    if obj.type=='CAMERA':
        obj.data.sensor_fit='VERTICAL'
        obj.data.sensor_height=24
        obj.data.lens=12/math.tan(math.radians(32))
scene.camera=next(o for o in scene.objects if o.name.startswith('Layout_Overview') and o.type=='CAMERA')
bpy.data.libraries.write('C:/Users/糖蒜/Desktop/铁肺/assets/blender/rescue-harbor-layout.blend',{scene},fake_user=True)
print(json.dumps({'camera':scene.camera.name,'vertical_fov_degrees':64,'saved':True}))
