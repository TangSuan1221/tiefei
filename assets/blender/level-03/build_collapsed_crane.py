"""Original collapsed cell-handling crane. Blender MCP authoring, local assets only.
Z-up Blender -> Y-up glTF. The origin is the centre of the fixed radius-6 structural footprint.
"""
import bpy, math, json, os
from mathutils import Vector
ROOT='C:/Users/Lenovo/Desktop/tiefei'
OUT=ROOT+'/public/assets/level-03/'
NAME='L03_CollapsedCrane'
if NAME in bpy.data.collections: raise RuntimeError('Inspect existing authored crane before replacing it')
col=bpy.data.collections.new(NAME);bpy.context.scene.collection.children.link(col)
made=[]
def mat(name,color,metal=.1,rough=.8,source=None):
 m=bpy.data.materials.new('L03_Crane_'+name);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if source:
  for suf,socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
   image=bpy.data.images.load(OUT+'materials/'+source+'_'+suf+'_1k.jpg',check_existing=True);image.pack()
   if suf!='diff':image.colorspace_settings.name='Non-Color'
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image
   if suf=='nor_gl':
    nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.22;m.node_tree.links.new(t.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs[socket])
   else:m.node_tree.links.new(t.outputs['Color'],p.inputs[socket])
 return m
paint=mat('painted-steel',(.12,.18,.2),.08,1,'blue_metal_plate')
iron=mat('oxide-steel',(.14,.075,.038),.18,1,'rusty_painted_metal')
bare=mat('exposed-edges',(.16,.18,.17),.55,.72)
black=mat('wire-rope',(.028,.033,.03),.35,.9)
cream=mat('stencil',(.68,.61,.43),0,.9)
def reg(o,n,m):
 o.name='L03_Crane_'+n
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o);o.data.materials.append(m);made.append(o);return o
def box(n,p,d,m=paint,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=reg(bpy.context.object,n,m);o.dimensions=d
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  be=o.modifiers.new('rolled steel edges','BEVEL');be.width=bevel;be.segments=2;bpy.ops.object.modifier_apply(modifier=be.name)
 return o
def cylinder(n,p,r,length,m=bare,axis='Y',verts=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=length,location=p);o=reg(bpy.context.object,n,m)
 if axis=='Y':o.rotation_euler.x=math.pi/2
 if axis=='X':o.rotation_euler.y=math.pi/2
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o
def tube(n,a,b,r,m=bare):
 a,b=Vector(a),Vector(b);o=cylinder(n,(a+b)*.5,r,(b-a).length,m,'Z',12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def beam(n,a,b,width=.22,depth=.18,m=paint):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)*.5,(width,depth,(b-a).length),m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def ring(n,p,r,t,m=bare):
 bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,location=p,major_radius=r,minor_radius=t)
 o=reg(bpy.context.object,n,m);o.rotation_euler.x=math.pi/2
 for f in o.data.polygons:f.use_smooth=True
 return o
def cable(n,pts,r=.025,m=black):
 c=bpy.data.curves.new(n,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2
 s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for bp,p in zip(s.bezier_points,pts):bp.co=p;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
 o=bpy.data.objects.new(n,c);bpy.context.scene.collection.objects.link(o);reg(o,n,m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return o
def bolt(p,r=.075):return cylinder('hex_fastener',p,r,.08,bare,'Y',6)
def ibeam(n,a,b,w=.55,d=.7):
 # Three rolled plates form a recognisable I section instead of a solid block.
 a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');mid=(a+b)/2;l=(b-a).length
 for off,size in [((0,0,0),(.11,d,l)),((0,-d/2,0),(w,.10,l)),((0,d/2,0),(w,.10,l))]:
  o=box(n,mid+q@Vector(off),size,paint);o.rotation_euler=q.to_euler()
def pulley(p,r=.48):
 cylinder('sheave_core',p,r,.18,bare)
 for dy in [-.13,.13]:ring('sheave_cheek',(p[0],p[1]+dy,p[2]),r,.065,iron)
 cylinder('sheave_pin',p,.13,.48,bare)
 for a in range(0,360,60):
  aa=math.radians(a);tube('sheave_spoke',(p[0],p[1]-.16,p[2]),(p[0]+r*.8*math.cos(aa),p[1]-.16,p[2]+r*.8*math.sin(aa)),.035,bare)

# Derailment base: flanged steel bogies and two displaced running rails.
for y in [-1.42,1.42]:
 ibeam('distorted_running_rail',(-4.8,y,.23),(3.6,y+.18,.45),.36,.32)
 for x in [-3.2,-.7]:
  cylinder('flanged_bogie_wheel',(x,y,.64),.44,.32,bare)
  ring('wheel_flange',(x,y-.19,.64),.44,.065,iron)
  box('bearing_cheek',(x,y-.25,.88),(.64,.13,.62),paint)
  bolt((x,y-.34,.95),.12)
for y in [-1.1,1.1]:ibeam('trolley_chassis',(-3.7,y,1.05),(.2,y,1.45),.5,.6)
for x in [-3.25,-1.8,-.3]:ibeam('chassis_crossmember',(x,-1.25,1.3),(x,1.25,1.3),.42,.4)

# Winch: large grooved drum, flange, shaft, reduction housing and cooling motor fins.
drum=(-1.8,-.45,2.3)
cylinder('wire_rope_drum',drum,.7,1.65,bare)
for y in [-1.36,.46]:
 cylinder('drum_flange',(-1.8,y,2.3),.91,.12,paint,verts=48)
 for a in range(0,360,60):
  aa=math.radians(a);bolt((-1.8+.68*math.cos(aa),y-.075,2.3+.68*math.sin(aa)))
for k in range(30):ring('wound_steel_wire',(-1.8,-1.23+k*.052,2.3),.72,.023,black)
cylinder('winch_axle',(-1.8,-.25,2.3),.19,3.0,bare)
box('gear_reduction_case',(-1.8,.99,2.3),(1.55,.9,1.55),paint,.16)
cylinder('motor',(-1.8,1.75,2.3),.43,.8,iron)
for k in range(8):ring('motor_cooling_fin',(-1.8,1.42+k*.085,2.3),.45,.035,bare)
box('brake_actuator',(-2.75,-.9,1.85),(.4,.7,.6),iron)

# Broken luffing structure: a tall A support folded toward the passage.
fallen_start=len(made)
for y in [-.85,.85]:
 ibeam('luffing_mast',(-3.35,y,1.25),(-1.1,y,7.9),.48,.52)
 ibeam('rear_mast_brace',(-.25,y,1.4),(-1.1,y,7.9),.35,.40)
 for x,z in [(-3.35,1.35),(-1.1,7.9)]:
  cylinder('hinge_boss',(x,y,z),.32,.3,iron);bolt((x,y-.21,z),.14)
for z in [3.3,5.3,7.3]:
 x=-3.35+(z-1.25)/6.65*2.25
 beam('cross_brace',(x,-.85,z),(x,.85,z),.2,.2)
pulley((-1.1,-1.04,7.9),.55)

# Collapsed triangular lattice jib, bent at the broken welded node.
# Chords curve in depth and pitch at the impact rather than lying on a perfect straight beam.
stations=[(-3.1,0,4.3),(-1.5,0,5.65),(.15,.05,6.8),(1.8,.3,4.7),(4.25,.65,1.85)]
for k in range(len(stations)-1):
 a,b=Vector(stations[k]),Vector(stations[k+1])
 for yoff,zoff in [(-.72,-.48),(.72,-.48),(0,.68)]:
  aa=a+Vector((0,yoff,zoff));bb=b+Vector((0,yoff,zoff))
  if k==2:aa+=Vector((.13,.02,-.08))
  beam('bent_box_chord',aa,bb,.27,.25,paint)
 for side in [-1,1]:
  beam('lattice_diagonal',a+Vector((0,side*.72,-.48)),b+Vector((0,0,.68)),.15,.13,paint)
  beam('lattice_tie',a+Vector((0,side*.72,-.48)),b+Vector((0,-side*.72,-.48)),.14,.12,iron)
 for yy in [-.72,.72]:
  box('joint_gusset',(a.x,a.y+yy,a.z-.45),(.48,.075,.5),iron)
  for dx in [-.15,.15]:bolt((a.x+dx,a.y+yy-.06,a.z-.46),.055)

# Jagged torn plate at elbow: irregular solid profile exposes an unpainted cut edge.
for side in [-1,1]:
 pts=[(-.10,6.26),(.12,6.37),(.25,6.22),(.36,6.53),(.40,6.32),(.53,6.64),(.62,6.47),(.55,6.02),(.02,5.96)]
 verts=[(x,side*.75+d,z) for d in [-.035,.035] for x,z in pts];n=len(pts)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new('torn_plate');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('torn_plate',mesh);bpy.context.scene.collection.objects.link(o);reg(o,'torn_welded_flange',bare)
pulley((3.85,-.16,2.4),.4)
pulley((-.05,-.8,6.85),.42)

# Review 9: fail at the mast foot, not a whole-object tilt. The trolley remains on
# the floor while its upper frame falls towards the pit and lands on a buckled
# deck truss. The original pulley, chord and joint geometry move together.
def fallen(p):
 x,y,z=p;dz=(z-1.3)*.72;a=math.radians(73)
 return Vector((x,y*math.cos(a)-dz*math.sin(a),1.3+y*math.sin(a)+dz*math.cos(a)))
for o in made[fallen_start:]:
 bpy.context.view_layer.update()
 inv=o.matrix_world.inverted()
 for v in o.data.vertices:v.co=inv@fallen(o.matrix_world@v.co)
 o.data.update()
# A very visible fractured leg on the near-left side: a short anchored stump,
# jagged lips, and a separate fallen continuation bearing down onto the trolley.
ibeam('fractured_left_leg_stump',(-3.35,-1.35,1.15),(-3.15,-1.35,2.35),.58,.55)
for dx,dz in [(-.22,.12),(-.08,.30),(.08,.05),(.23,.20)]:
 beam('torn_leg_lip',(-3.15+dx,-1.55,2.25),(-3.12+dx,-1.55,2.35+dz),.07,.10,bare)
ibeam('fallen_severed_leg',(-3.0,-1.65,2.85),(-4.15,-3.05,.35),.58,.55)
for dx in [-.22,0,.22]:beam('fallen_leg_torn_lip',(-3.0+dx,-1.85,2.85),(-2.96+dx,-1.85,2.98+abs(dx)*.5),.07,.08,bare)
# Buckled bearing members rest at both floor ends, carrying the fallen crosshead.
ibeam('crushed_deck_truss',(-3.9,-3.8,.19),(-1.1,-4.45,2.05),.55,.55)
ibeam('crushed_deck_truss',(-1.1,-4.45,2.05),(1.8,-3.8,.19),.55,.55)
beam('truss_tie',(-3.9,-3.8,.19),(1.8,-3.8,.19),.24,.24,iron)
for x in [-3.5,-2.6,-1.7,-.8,.1,.9]:
 h=2.05*(1-abs(x+1.1)/3.2)
 beam('buckled_diagonal',(x,-3.8,.23),(x+.45,-4.2,max(.35,h)),.14,.16,iron)
# The failed overhead rail support remains wedged at the back of the opening,
# buckles visibly in its exposed left half, and bears on the toppled frame.
# This retains a tall physical obstruction without restoring an upright crane.
for y in [-.45,.45]:
 ibeam('buckled_overhead_support',(-3.45,y+.6,8.4),(-3.2,y-.2,5.25),.56,.48)
 ibeam('buckled_overhead_support',(-3.2,y-.2,5.25),(-.9,y-1.9,3.1),.56,.48)
 for x,z,yy in [(-3.45,8.4,y+.6),(-3.2,5.25,y-.2),(-.9,3.1,y-1.9)]:
  box('bent_gusset',(x,yy,z),(.75,.08,.5),iron)
  for dx in [-.22,.22]:bolt((x+dx,yy-.08,z),.08)
beam('support_cross_tie',(-3.2,-.65,5.25),(-3.2,.25,5.25),.26,.24,iron)
for dx in [-.2,-.05,.15]:
 beam('exposed_split_flange',(-3.2+dx,-.72,5.25),(-3.4+dx,-.84,5.58+dx),.08,.12,bare)

# Reeving and visibly slack broken pendant. Cable routes connect actual mechanisms.
cable('hoist_wire',[(-1.8,-1.1,2.95),(-2.1,-2.4,1.0),fallen((-1.1,-1.1,8.45)),fallen((-.05,-.85,7.27)),fallen((3.85,-.2,2.82))],.032)
cable('slack_return_wire',[(3.85,-.3,2.75),(2.8,-1.5,.5),(1.1,-1.1,.3),(-1.9,-1.1,1.6)],.03)
cable('torn_pendant',[fallen((-1.1,.85,7.9)),(-.8,-3.7,.28),(1.2,-2.6,.18),(3.5,1.3,.4)],.038)
# Heavy lower hook block and curved forged hook, resting at an angle near floor.
box('hook_block',(2.75,-1.05,1.15),(.9,.48,.8),iron,.12)
pulley((2.75,-1.05,1.15),.31)
cable('hook_wire',[fallen((3.85,-.3,2.82)),(3.4,-1.5,.6),(2.75,-1.05,1.55)],.028)
cable('forged_hook',[(2.75,-1.05,.75),(2.8,-1.05,.35),(3.2,-1.05,.22),(3.5,-1.05,.48),(3.36,-1.05,.68)],.14,bare)

# Functional cabinet and restrained nameplate, no giant hazard-yellow beams.
box('electrical_control',(-3.25,-1.52,2.3),(.75,.32,1.0),paint,.06)
for z in [2.1,2.4,2.65]:cylinder('switch',(-3.25,-1.71,z),.075,.06,bare)
box('capacity_plate',(-1.8,-1.47,2.3),(1.15,.035,.31),black,.015)
bpy.ops.object.text_add(location=(-1.8,-1.5,2.23),rotation=(math.pi/2,0,0))
o=reg(bpy.context.object,'capacity_stencil',cream);o.data.body='12t / CELL 04';o.data.size=.125;o.data.align_x='CENTER';o.data.extrude=.001;bpy.ops.object.convert(target='MESH')

# Fix UV density with dominant-axis world projection; no runtime procedural material.
groups={}
for o in made:groups.setdefault(o.data.materials[0].name,[]).append(o)
batches=[]
for key,obs in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 if len(obs)>1:bpy.ops.object.join()
 o=bpy.context.object;o.name='L03_Crane_Batch_'+key;bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 # Projected material coordinates preserve real-world grain sizes without arbitrary per-object stretches.
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in p.loop_indices:
   co=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]]/2.5,co[axes[1]]/2.5)
 batches.append(o)
# Impact flattens the lower lips at the floor rather than allowing protruding
# flange corners below the fixed support plane.
for o in batches:
 inv=o.matrix_world.inverted()
 for vert in o.data.vertices:
  world=o.matrix_world@vert.co
  if world.z<.02:world.z=.02;vert.co=inv@world
coords=[o.matrix_world@v.co for o in batches for v in o.data.vertices]
radius=max(math.hypot(v.x,v.y) for v in coords);height=max(v.z for v in coords);bottom=min(v.z for v in coords)
assert radius<6 and bottom>=-.01 and height<10,(radius,bottom,height)
bpy.ops.object.select_all(action='DESELECT')
for o in batches:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT+'abyssal-collapsed-crane.glb',use_selection=True,use_active_scene=True,export_format='GLB',export_yup=True)
bpy.data.libraries.write(ROOT+'/assets/blender/level-03/abyssal-collapsed-crane.blend',{col},fake_user=True)
manifest={'asset':'abyssal-collapsed-crane.glb','origin':'bottom centre','blender_z_up':True,'gltf_y_up':True,'front_gltf':'+Z','radius':radius,'bottom':bottom,'height':height,'bounds_blender_xyz':[[min(v[i] for v in coords),max(v[i] for v in coords)] for i in range(3)],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in batches),'draw_meshes':len(batches),'collision':'decor only; fixed ABYSS_SOLIDS crane radius6 floor-5 ceil5 remains authoritative','license':'Original geometry. Embedded Poly Haven CC0 blue_metal_plate and rusty_painted_metal; see materials/README.md'}
json.dump(manifest,open(OUT+'abyssal-collapsed-crane.json','w'),indent=2)
print(json.dumps(manifest,indent=2))
