"""Editable sealed shore-power cabinet. Local X +/-1.05, Y +/-1.6, Z +/-0.325.
Positive game Z is front. Isolated scene, active-scene-only export.
"""
import bpy, math, json
from mathutils import Vector
from pathlib import Path
ROOT=Path('C:/Users/糖蒜/Desktop/铁肺');OUT=ROOT/'public/assets/deepsea';SOURCE=ROOT/'assets/blender'
previous=bpy.context.window.scene
stale=bpy.data.scenes.get('Rescue_Power_Cabinet_20261005')
if stale and stale!=previous:
    for obj in list(stale.objects):
        if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(stale)
scene=bpy.data.scenes.new('Rescue_Power_Cabinet_20261005');bpy.context.window.scene=scene
materials={}
def build():
    for name,color,metal,rough in [('ochre',(.26,.22,.105,1),.48,.53),('teal',(.06,.115,.105,1),.65,.46),('steel',(.21,.255,.23,1),.86,.35),('rubber',(.008,.014,.012,1),0,.86),('brass',(.32,.25,.12,1),.75,.4),('ivory',(.43,.46,.36,1),.1,.56)]:
        mat=bpy.data.materials.new('rescue_power_'+name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;materials[name]=mat
    def b(p):return Vector((p[0],-p[2],p[1]))
    def finish(o,name,mat,bevel=0):
        o.name=name;o.data.materials.append(materials[mat])
        if bevel:
            mod=o.modifiers.new('Rolled edge radius','BEVEL');mod.width=bevel;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        return o
    def box(name,p,s,mat='ochre',bevel=.008):
        bpy.ops.mesh.primitive_cube_add(size=1,location=b(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bevel)
    def rod(name,a,c,r=.035,mat='steel',vertices=16):
        aa,cc=b(a),b(c);d=cc-aa;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(aa+cc)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');return finish(o,name,mat,.003 if r>.045 else 0)
    def cut(o,p,s):
        cutter=box('temporary_window_cutter',p,s,'rubber',.012)
        bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Actual recessed aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    # Folded shell: separate side, rear and cap meshes; the cabinet is not a box
    # with black rectangles painted over its apertures.
    box('rear_pan',(0,0,-.297),(2.06,3.16,.046),'teal',.018)
    for x in [-.982,.982]:box('side_return',(x,0,-.005),(.116,3.18,.624),'teal',.020)
    for y in [-1.545,1.545]:box('end_cap',(0,y,-.005),(2.08,.11,.63),'teal',.018)
    for x in [-.904,.611,.892]:box('vertical_seal',(x,0,.238),(.041,2.94,.042),'rubber',.005)
    for y in [-1.465,1.465]:box('horizontal_seal',(-.015,y,.238),(1.84,.037,.042),'rubber',.004)
    door=box('primary_door',(-.153,0,.256),(1.46,2.91,.056),'ochre',.022)
    cut(door,(-.25,.64,.27),(1.075,.91,.15))
    cut(door,(.405,-.04,.27),(.19,.46,.15))
    box('louver_back_cavity',(-.25,.64,.174),(1.085,.92,.019),'rubber',.01)
    for i in range(9):
        blade=box('tilted_vent_blade',(-.25,.277+i*.09,.246),(1.025,.025,.12),'ochre',.004);blade.rotation_euler.x=.40
    for x in [-.795,.295]:box('vent_side_return',(x,.64,.247),(.026,.925,.11),'teal',.004)
    box('handle_pocket_back',(.405,-.04,.185),(.187,.455,.032),'rubber',.015)
    for y in [-.23,.15]:box('handle_pocket_end',(.405,y,.247),(.168,.04,.09),'teal',.006)
    rod('flush_latch_grip',(.405,-.16,.275),(.405,.08,.275),.024,'steel')
    rod('latch_key_insert',(.405,-.165,.295),(.405,-.165,.309),.037,'brass')
    for y in [-1.13,-.37,.45,1.17]:
        box('hinge_strap',(-.839,y,.283),(.11,.22,.039),'teal',.01)
        rod('hinge_barrel',(-.856,y-.13,.287),(-.856,y+.13,.287),.033,'steel')
        for yy in [y-.075,y+.075]:rod('hinge_fastener',(-.805,yy,.305),(-.805,yy,.316),.018,'brass',6)
    # Independent narrow service strip, physically recessed indicator ports.
    box('service_strip',(.756,0,.25),(.247,2.91,.056),'teal',.015)
    for y in [.96,.66,.36]:
        box('indicator_recess',(.756,y,.282),(.15,.18,.025),'rubber',.012)
        box('unlit_glass_insert',(.756,y,.300),(.089,.10,.012),'ivory',.008)
    for y in [-1.35,1.35]:
        for x in [-.72,.50,.755]:rod('panel_hex_bolt',(x,y,.284),(x,y,.303),.024,'steel',6)
    # Sealed lower cable connectors and two restrained service loops.
    for x in [-.62,-.27,.08]:
        rod('sealed_gland_back',(x,-1.15,.22),(x,-1.15,.265),.080,'rubber')
        rod('gland_hex_nut',(x,-1.15,.263),(x,-1.15,.304),.067,'brass',6)
        rod('gland_socket',(x,-1.15,.30),(x,-1.15,.318),.043,'rubber')
    for x in [-.62,.08]:
        points=[(x,-1.15,.300),(x,-1.28,.292),(x+.08,-1.38,.21),(x+.12,-1.47,.12),(x+.12,-1.53,.03)]
        for a,c in zip(points,points[1:]):rod('sealed_cable_loop',a,c,.016,'rubber',10)
    for y in [-.53,-.71,-.89]:box('pressed_door_stiffener',(-.25,y,.289),(1.03,.029,.025),'ochre',.01)
    # Small exposed metal chips follow edges and high-contact zones, deterministic
    # and sparse; no story text or baked lighting.
    for i in range(16):
        x=-.75+(i%4)*.33;y=-1.31+(i//4)*.81
        chip=box('paint_edge_chip',(x,y,.285),(.015+(i%3)*.016,.008,.003),'steel',0);chip.rotation_euler.y=(i%3-1)*.2
    box('blank_equipment_plate',(-.23,1.26,.291),(.56,.17,.015),'teal',.008)
    for x in [-.465,.005]:rod('nameplate_rivet',(x,1.26,.30),(x,1.26,.31),.013,'steel',8)
    for name,mat in materials.items():
        bpy.ops.object.select_all(action='DESELECT');objects=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        for o in objects:o.select_set(True)
        if objects:bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='rescue_power_'+name
        canonical='rescue_power_'+name;existing=bpy.data.materials.get(canonical)
        if existing and existing!=mat:existing.name=canonical+'_archived'
        mat.name=canonical
    points=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' for v in o.data.vertices]
    low=[min(v.x for v in points),min(v.z for v in points),min(-v.y for v in points)];high=[max(v.x for v in points),max(v.z for v in points),max(-v.y for v in points)]
    for i,limit in enumerate([1.05,1.6,.325]):
        assert low[i]>=-limit-.00001 and high[i]<=limit+.00001,(i,low,high)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/'rescue-power-cabinet.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_cameras=False,export_lights=False)
    bpy.data.libraries.write(str(SOURCE/'rescue-power-cabinet.blend'),{scene},fake_user=True)
    report={'scene':scene.name,'bounds':{'min':low,'max':high},'meshes':len(scene.objects),'vertices':sum(len(o.data.vertices)for o in scene.objects),'materials':[m.name for m in materials.values()],'front':'+Z','original_scene':previous.name}
    (OUT/'rescue-power-cabinet.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
try:build()
finally:bpy.context.window.scene=previous

