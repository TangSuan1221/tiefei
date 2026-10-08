"""Blender MCP authored pressure-service module. New scene, preserves user objects.
Coordinates are game metres (X,Y-up,Z); glTF performs the sole axis conversion.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path('C:/Users/糖蒜/Desktop/铁肺')
OUT=ROOT/'public/assets/deepsea'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/blender'
SOURCE.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.new('Rescue_Pressure_Service_20261005')
bpy.context.window.scene=scene
materials={}
for name,color,metal,rough in [('paint',(0.18,.27,.26,1),.65,.38),('steel',(.09,.13,.14,1),.85,.3),('copper',(.25,.13,.065,1),.8,.35),('rubber',(.012,.019,.018,1),.05,.86),('ivory',(.52,.57,.48,1),.3,.57),('amber',(1,.29,.055,1),.1,.3)]:
    m=bpy.data.materials.new('rescue_'+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if name=='amber':p.inputs['Emission Color'].default_value=color;p.inputs['Emission Strength'].default_value=3
    materials[name]=m
def b(p):return Vector((p[0],-p[2],p[1]))
def finish(o,name,mat,bevel=0):
    o.name=name;o.data.materials.append(materials[mat])
    if bevel:
        mod=o.modifiers.new('Machined edge radii','BEVEL');mod.width=bevel;mod.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4 and name.startswith(('pipe','ring'))
    return o
def box(name,p,s,mat='paint',bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=b(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bevel)
def rod(name,a,c,r=.06,mat='copper',vertices=20):
    aa,cc=b(a),b(c);d=cc-aa;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(aa+cc)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');return finish(o,name,mat,.008 if r>.07 else 0)
def ring(name,p,r,t=.08,mat='steel'):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=80,minor_segments=10,location=b(p),rotation=(math.pi/2,0,0));return finish(bpy.context.object,name,mat)
def disc(name,p,r,depth,mat='steel'):
    return rod(name,(p[0],p[1],p[2]-depth/2),(p[0],p[1],p[2]+depth/2),r,mat,64)
# Layered, sealed service hatch: not an additional usable doorway.
box('pressure_backplate',(0,0,0),(5.5,6,.18),'paint',.06)
for x in [-2.63,2.63]:box('welded_edge_rib',(x,0,.16),(.16,5.8,.18),'steel')
for y in [-2.8,2.8]:box('welded_cross_rib',(0,y,.16),(5.2,.16,.18),'steel')
disc('pressure_dished_cover',(0,-.15,.16),1.94,.21,'paint')
for r,z,t,mat in [(2.13,.25,.15,'steel'),(1.95,.4,.065,'copper'),(1.82,.42,.038,'rubber'),(1.71,.30,.026,'steel')]:ring('ring_pressure_flange',(0,-.15,z),r,t,mat)
for i in range(32):
    a=i*math.tau/32;x,y=2.13*math.cos(a),-.15+2.13*math.sin(a)
    disc('flange_washer',(x,y,.39),.09,.035,'rubber');rod('hex_bolt',(x,y,.4),(x,y,.49),.062,'steel',6)
for y in [-1.15,.65]:
    box('door_stiffener',(0,y,.4),(2.8,.10,.08),'steel')
    for x in [-1.25,1.25]:disc('stiffener_fastener',(x,y,.47),.042,.028)
ring('ring_dogwheel',(.55,-.20,.64),.38,.032,'copper')
for i in range(5):
    a=i*math.tau/5;rod('wheel_spoke',(.55,-.2,.64),(.55+.38*math.cos(a),-.2+.38*math.sin(a),.64),.018,'steel')
disc('wheel_hub',(.55,-.2,.63),.09,.14)
for y in [-1.25,.85]:box('pressure_hinge',(-1.87,y,.48),(.3,.42,.28),'steel',.035)
# Twin side manifold risers, unions, curved elbow segments and mounting saddles.
for side in [-1,1]:
    x=side*2.4
    rod('pipe_riser',(x,-2.6,.35),(x,2.0,.35),.105)
    for y in [-2.35,-1.8,.9,1.7]:
        rod('pipe_union',(x,y-.05,.35),(x,y+.05,.35),.16,'steel')
        box('pipe_mount',(x,y,.13),(.37,.13,.21),'steel')
    for i in range(10):
        a=i*math.pi/20;c=(i+1)*math.pi/20
        rod('pipe_elbow',(x-side*.35+side*.35*math.cos(a),2+.35*math.sin(a),.35),(x-side*.35+side*.35*math.cos(c),2+.35*math.sin(c),.35),.105)
    rod('pipe_header',(x-side*.35,2.35,.35),(side*.9,2.35,.35),.105)
    disc('gauge_body',(side*1.2,2.38,.48),.26,.17)
    disc('gauge_face',(side*1.2,2.38,.58),.22,.015,'ivory')
    ring('ring_gauge_rim',(side*1.2,2.38,.60),.235,.025,'copper')
    for i in range(13):
        a=.3+i*math.pi*1.7/12;cx,cy=side*1.2,2.38
        rod('gauge_tick',(cx+.175*math.cos(a),cy+.175*math.sin(a),.595),(cx+.202*math.cos(a),cy+.202*math.sin(a),.595),.005,'rubber',6)
    rod('gauge_needle',(side*1.2,2.38,.615),(side*1.2+.12,2.48,.615),.009,'rubber',8)
# Caged emergency practicals, glass tube and service label panel.
for side in [-1,1]:
    x=side*2.35
    box('lamp_bracket',(x,-2.5,.39),(.35,.54,.16),'steel')
    rod('lamp_diffuser',(x,-2.66,.56),(x,-2.3,.56),.055,'amber')
    for dx in [-.105,.105]:rod('lamp_guard',(x+dx,-2.75,.57),(x+dx,-2.2,.57),.012,'steel',8)
    for y in [-2.75,-2.5,-2.2]:rod('lamp_crossguard',(x-.12,y,.59),(x+.12,y,.59),.012,'steel',8)
box('equipment_plate',(-.6,-.2,.38),(.70,.32,.025),'ivory',.006)
for x in [-.9,-.3]:disc('plate_rivet',(x,-.2,.41),.02,.02)
# Merge by finish: preserve true modeled bevels, minimise runtime draw calls.
for name,mat in materials.items():
    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
    for o in objects:o.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='rescue_service_'+name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'rescue-pressure-service.glb'),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'rescue-pressure-service.blend'),copy=True)
report={'scene':scene.name,'objects':len(scene.objects),'vertices':sum(len(o.data.vertices) for o in scene.objects if o.type=='MESH'),'asset':'/assets/deepsea/rescue-pressure-service.glb','source':'assets/blender/rescue-pressure-service.blend','transport':'Blender MCP TCP 9876','gameplay':'decorative sealed service module, no new interactions'}
(OUT/'rescue-pressure-service.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
