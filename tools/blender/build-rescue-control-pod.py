"""Blender MCP: editable octagonal control pod, game metres, Y-up.
Builds in an isolated scene; restores the user's active scene after export.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path('C:/Users/糖蒜/Desktop/铁肺')
OUT=ROOT/'public/assets/deepsea'
SOURCE=ROOT/'assets/blender'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE.mkdir(parents=True,exist_ok=True)
previous_scene=bpy.context.window.scene
stale=bpy.data.scenes.get('Rescue_Control_Pod_20261005')
if stale and stale!=previous_scene:
    for obj in list(stale.objects):
        if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(stale)
    for mat in list(bpy.data.materials):
        if mat.name.startswith('rescue_control_') and mat.users==0:bpy.data.materials.remove(mat)
scene=bpy.data.scenes.new('Rescue_Control_Pod_20261005')
bpy.context.window.scene=scene
materials={}
def build():
    specs=[('paint',(.12,.20,.19,1),.55,.46),('steel',(.065,.095,.09,1),.85,.34),('rubber',(.009,.016,.014,1),0,.86),('brass',(.30,.23,.095,1),.7,.39),('glass',(.18,.28,.27,.14),.08,.16),('screen_cold',(.12,.27,.27,1),.05,.48),('warm',(.48,.23,.09,1),.05,.45),('ivory',(.48,.49,.41,1),.1,.56)]
    for name,color,metal,rough in specs:
        m=bpy.data.materials.new('rescue_control_'+name);m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
        if name=='glass':
            p.inputs['Alpha'].default_value=.14
            p.inputs['IOR'].default_value=1.45
            if hasattr(m,'surface_render_method'):m.surface_render_method='DITHERED'
            m.use_nodes=True
        if name in ('screen_cold','warm'):
            p.inputs['Emission Color'].default_value=(.38,.64,.63,1) if name=='screen_cold' else (1,.48,.18,1)
            p.inputs['Emission Strength'].default_value=.75 if name=='screen_cold' else 1.0
        materials[name]=m
    def b(p):return Vector((p[0],-p[2],p[1]))
    def finish(o,name,mat,bevel=0):
        o.name=name;o.data.materials.append(materials[mat])
        if bevel:
            mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
            bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        return o
    def box(name,p,s,mat='paint',bevel=.008,yaw=0):
        bpy.ops.mesh.primitive_cube_add(size=1,location=b(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.rotation_euler.z=yaw
        return finish(o,name,mat,bevel)
    def rod(name,a,c,r=.04,mat='steel',vertices=16):
        aa,cc=b(a),b(c);d=cc-aa;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(aa+cc)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');return finish(o,name,mat,.003 if r>.06 else 0)
    def horizontal_disc(name,y,r,h,mat='steel',vertices=64):return rod(name,(0,y-h/2,0),(0,y+h/2,0),r,mat,vertices)
    def hoop(name,y,r,t,mat='steel'):
        bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=64,minor_segments=8,location=b((0,y,0)));return finish(bpy.context.object,name,mat)
    # Local minimum Y=0, maximum Y=2.2, maximum radial footprint=2.2.
    horizontal_disc('octagonal_base',.065,2.17,.13,'steel',8)
    horizontal_disc('sealed_floor',.145,2.06,.08,'rubber',8)
    horizontal_disc('roof_pressure_plate',2.095,2.17,.15,'paint',64)
    hoop('roof_edge_flange',2.175,2.175,.025,'steel')
    hoop('roof_drip_groove',2.184,2.045,.012,'rubber')
    hoop('roof_inner_drain',2.184,1.76,.012,'rubber')
    for i in range(32):
        a=math.tau*i/32;r=2.08;x,z=math.sin(a)*r,math.cos(a)*r
        rod('roof_captive_bolt',(x,2.181,z),(x,2.197,z),.026,'brass',6)
    for i in range(8):
        a=math.tau*i/8
        px,pz=math.sin(a)*1.985,math.cos(a)*1.985
        # Five forward-facing bays contain actual holes, not black painted panes.
        window=i in (0,1,2,6,7)
        if window:
            box('bay_lower_armor',(px,.435,pz),(1.53,.53,.11),'paint',.015,a)
            box('bay_header',(px,1.945,pz),(1.53,.15,.13),'steel',.012,a)
            box('window_sill',(px,.775,pz),(1.52,.09,.16),'brass',.009,a)
            box('window_top_seal',(px,1.835,pz),(1.49,.055,.15),'rubber',.004,a)
            box('clear_glass_pane',(math.sin(a)*2.005,1.303,math.cos(a)*2.005),(1.37,1.0,.012),'glass',0,a)
            # A narrow central mullion makes two panes per main bay.
            box('window_centre_mullion',(math.sin(a)*2.028,1.3,math.cos(a)*2.028),(.038,1.10,.12),'steel',.006,a)
        else:box('aft_armor_panel',(px,1.09,pz),(1.53,1.81,.12),'paint',.018,a)
        corner=a+math.pi/8;x,z=math.sin(corner)*2.035,math.cos(corner)*2.035
        rod('structural_corner_post',(x,.17,z),(x,2.03,z),.075,'steel',8)
        for y in [.27,.67,1.88]:
            cx,cz=math.sin(a)*2.055,math.cos(a)*2.055
            for dx in [-.57,.57]:
                bx=cx+math.cos(a)*dx;bz=cz-math.sin(a)*dx
                rod('panel_fixing',(bx,y,bz),(bx+math.sin(a)*.018,y,bz+math.cos(a)*.018),.023,'brass',6)
    # Visible internal workstations sit behind the forward windows and face +Z.
    for i,x in enumerate([-.93,0,.93]):
        box('console_plinth',(x,.50,-.65),(.77,.64,.46),'steel',.022)
        box('console_tilt_deck',(x,.855,-.53),(.80,.09,.55),'paint',.012)
        box('monitor_housing',(x,1.15,-.79),(.70,.47,.12),'rubber',.025)
        box('monitor_phosphor',(x,1.15,-.721),(.57,.34,.015),'screen_cold',.009)
        for row in range(4):box('screen_scan_row',(x,1.03+row*.073,-.710),(.49,.009,.003),'steel',0)
        for col in range(7):box('console_button',(x-.25+col*.082,.912,-.43),(.045,.022,.06),'ivory',.003)
        box('console_status_lamp',(x+.30,.921,-.64),(.055,.022,.045),'warm',.004)
    # Center operator seat, pedestal and backrest remain modest hard-surface proxies.
    rod('chair_pedestal',(0,.18,.46),(0,.47,.46),.075,'steel')
    box('chair_seat',(0,.53,.46),(.49,.10,.46),'rubber',.05)
    box('chair_back',(0,.82,.68),(.48,.52,.10),'rubber',.04)
    for x in [-.34,.34]:rod('chair_arm',(x,.68,.24),(x,.68,.64),.028,'steel')
    # Under-roof practical strips: restrained emissive surfaces, no baked lights.
    for x in [-1.1,1.1]:
        box('interior_lamp_cage',(x,1.997,.25),(.52,.055,.13),'steel',.008)
        box('interior_warm_diffuser',(x,1.959,.25),(.41,.014,.075),'warm',.004)
    # Roof service caps and recessed drainage channels stay within 2.2 m height.
    for x in [-.55,.55]:
        box('roof_service_plate',(x,2.181,-.25),(.82,.025,.80),'paint',.01)
        for j in range(5):box('roof_drain_slot',(x-.29+j*.145,2.196,-.25),(.035,.004,.56),'rubber',0)
    for name,mat in materials.items():
        bpy.ops.object.select_all(action='DESELECT')
        objects=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        for o in objects:o.select_set(True)
        if objects:
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='rescue_control_'+name
    for name,mat in materials.items():
        canonical='rescue_control_'+name
        existing=bpy.data.materials.get(canonical)
        if existing and existing!=mat:existing.name=canonical+'_archived'
        mat.name=canonical
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/'rescue-control-pod.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_cameras=False,export_lights=False)
    bpy.data.libraries.write(str(SOURCE/'rescue-control-pod.blend'),{scene},fake_user=True)
    points=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' for v in o.data.vertices]
    report={'scene':scene.name,'mesh_count':len([o for o in scene.objects if o.type=='MESH']),'vertices':sum(len(o.data.vertices)for o in scene.objects if o.type=='MESH'),'game_bounds':{'x':[min(v.x for v in points),max(v.x for v in points)],'y':[min(v.z for v in points),max(v.z for v in points)],'z':[min(-v.y for v in points),max(-v.y for v in points)]},'materials':[m.name for m in materials.values()],'front_game_axis':'+Z','placement':[60,-5.94,14.2],'user_scene_restored':previous_scene.name}
    (OUT/'rescue-control-pod.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))
try:build()
finally:bpy.context.window.scene=previous_scene



