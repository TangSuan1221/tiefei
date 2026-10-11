"""Fuse the existing authored amphibious silhouette; metre-scale, same foot origin."""
import bpy,bmesh,math,os
from mathutils import Vector
ROOT=r'C:\Users\糖蒜\Desktop\铁肺'
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('HarborCreatureSkinSource');bpy.context.window.scene=scene
def xyz(p):return (p[0],-p[2],p[1])
parts=[]
def sphere(p,s):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(o);return o
def rod(a,b,r):
 aa=Vector(xyz(a));bb=Vector(xyz(b));d=bb-aa
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d.length,location=(aa+bb)/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();parts.append(o)
def jaw_loft():
 # One connected cranial mass, with a longer neck transition and a broad,
 # restrained lower plane. This replaces the previous egg-shaped head lump.
 sections=[(.70,1.08,.255,.235),(.91,1.075,.300,.280),(1.14,1.045,.305,.285),(1.36,1.015,.250,.255),(1.54,.970,.145,.170),(1.63,.940,.045,.080)]
 vertices=[];faces=[];count=24
 for forward,height,width,depth in sections:
  for i in range(count):
   angle=i/count*math.pi*2;side=math.cos(angle);vertical=math.sin(angle)
   # Flatter underside supplies a jaw plane; the top stays rounded and eyeless.
   lower=vertical if vertical>=0 else vertical*.70
   vertices.append(xyz((.06+width*side,height+depth*lower,forward)))
 for j in range(len(sections)-1):
  for i in range(count):
   n=j*count+i;q=j*count+(i+1)%count;faces.append((n,q,q+count,n+count))
 faces.append(tuple(reversed(range(count))));faces.append(tuple((len(sections)-1)*count+i for i in range(count)))
 mesh=bpy.data.meshes.new('continuous neck and jaw');mesh.from_pydata(vertices,[],faces);mesh.update()
 o=bpy.data.objects.new('continuous neck and jaw',mesh);scene.collection.objects.link(o);parts.append(o);return o
torso=sphere((0,1.04,-.05),(.48,.59,1.04));torso.rotation_euler.y=-.11
sphere((.04,1.19,.56),(.53,.27,.60))
sphere((.05,1.10,.86),(.33,.265,.40))
head=jaw_loft()
sphere((.075,.885,1.435),(.215,.085,.245))
joints=[]
for side in [-1,1]:
 shoulder=(side*.42,1.24,.50);elbow=(side*(.91 if side<0 else 1.15),.58,.65 if side<0 else .90);wrist=(side*(1.04 if side<0 else 1.19),.08,1.42 if side<0 else 1.65)
 sphere(shoulder,(.20,.19,.30));rod(shoulder,elbow,.135);sphere(elbow,(.15,.13,.17));rod(elbow,wrist,.065);sphere(wrist,(.13,.06,.22))
 hip=(side*.30,.85,-.72);knee=(side*.67,.46,-1.18);foot=(side*.81,.07,-.64)
 rod(hip,knee,.14);sphere(knee,(.16,.15,.18));rod(knee,foot,.071);sphere(foot,(.085,.063,.10))
 joints.extend([xyz(elbow),xyz(knee),xyz(wrist)])
 for n in range(3):
  finger=(wrist[0]+(n-1)*.11,.04,wrist[2]+.28+n*.025);toe=(foot[0]+(n-1)*.08,.03,foot[2]+.21)
  rod(wrist,finger,.023);sphere(finger,(.023,.023,.023));rod(foot,toe,.024);sphere(toe,(.024,.024,.024))
for i in range(8):
 z=-.85+i*.23;y=1.55+math.sin(i/7*math.pi)*.09
 # Lower the neck-end crest into the newly flattened shoulders. The broader
 # submerged root creates one remeshed tissue transition, not another spike.
 neck_blend=max(0,(i-4)/3);neck_blend=neck_blend*neck_blend*(3-2*neck_blend)
 y-=.18*neck_blend
 sphere((.025,y,z),(.075+.045*neck_blend,.15+math.sin(i)*.025-.055*neck_blend,.13+.045*neck_blend))
 sphere((.025,y-.13,z),(.13+.13*neck_blend,.14,.17+.065*neck_blend))
# The original short side rods become shallow skin folds below, not separate
# bar-shaped objects pasted onto the flank.
rod((0,.72,-.95),(.11,.38,-1.50),.12);sphere((.11,.38,-1.50),(.12,.12,.12));rod((.11,.38,-1.50),(.40,.08,-1.9),.06)
# Joining within this dedicated scene cannot pull in old harbor selections.
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=torso;bpy.ops.object.join();body=torso;body.name='harbor_creature_fused_body'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
remesh=body.modifiers.new('continuous anatomy','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.017;remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=body.modifiers.new('connective tissue relaxation','SMOOTH');smooth.factor=.67;smooth.iterations=12;bpy.ops.object.modifier_apply(modifier=smooth.name)
# Very shallow folds only around the known elbow/knee/wrist coordinates. No
# global random displacement; the back and head retain clean anatomical masses.
for v in body.data.vertices:
 p=v.co;weight=0
 for joint in joints:
  d=(p-Vector(joint)).length;weight=max(weight,math.exp(-((d/.22)**4)))
 if weight>.001:p+=v.normal*(math.sin(p.z*102+p.y*17)*.0035*weight)
 forward=-p.y
 if -.7<forward<.6:
  fold=math.exp(-((abs(p.x)-.43)/.16)**4-((p.z-1.29)/.25)**4)
  fade=math.sin((forward+.7)/1.3*math.pi)**2
  p+=v.normal*(.006*math.sin((forward+.6)*27)*fold*fade)
 p.z=max(.007,p.z)
dec=body.modifiers.new('runtime triangle budget','DECIMATE');dec.ratio=.52;bpy.ops.object.modifier_apply(modifier=dec.name)
# Local head refinement happens AFTER the body budget pass, so small facial
# folds survive without increasing tessellation across the torso and limbs.
# Blender axes here are (Three X, -Three Z, Three Y).
old_min=[min(v.co[k] for v in body.data.vertices) for k in range(3)]
old_max=[max(v.co[k] for v in body.data.vertices) for k in range(3)]
bm=bmesh.new();bm.from_mesh(body.data)
head_edges=[]
for edge_item in bm.edges:
 centre=(edge_item.verts[0].co+edge_item.verts[1].co)*.5
 if abs(centre.x-.06)<.40 and .84<-centre.y<1.73 and .63<centre.z<1.36:head_edges.append(edge_item)
if head_edges:bmesh.ops.subdivide_edges(bm,edges=head_edges,cuts=1,use_grid_fill=True)
bm.normal_update();bm.to_mesh(body.data);bm.free();body.data.update()
def smoothstep(lo,hi,value):
 t=max(0,min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t)
head_detail_count=0
for v in body.data.vertices:
 p=v.co;x=p.x-.06;forward=-p.y;height=p.z
 if not(abs(x)<.41 and .78<forward<1.73 and .59<height<1.39):continue
 # Closed shallow mouth edge. Both corners taper into the existing surface;
 # it has no opening, teeth, eye sockets or separately attached lip geometry.
 corner=1-smoothstep(.21,.31,abs(x))
 mouth_height=.943-.047*(x/.30)**2+.012*(x/.30)
 mouth=math.exp(-((height-mouth_height)/.015)**2)*corner*smoothstep(1.15,1.39,forward)
 # Unequal, short folds beneath the jaw where the low head compresses the neck.
 # Their lengths and spacing differ; the last fold fades on the right side.
 jaw_region=math.exp(-((height-.785)/.12)**4)*(1-smoothstep(.25,.36,abs(x)))
 jaw=0
 for location,width,depth,offset in [(1.19,.017,.006,.11),(1.075,.022,.008,-.06),(.925,.020,.005,.15)]:
  asym=1 if location>.95 else 1-smoothstep(-.03,.15,x)
  jaw+=depth*math.exp(-((forward-location-offset*x)/width)**2)*jaw_region*asym
 # Two shallow tension creases on each side, flowing from the mouth corners
 # toward the neck. They are recessed skin, not raised gill-like bars.
 side=smoothstep(.15,.255,abs(x))*(1-smoothstep(.34,.40,abs(x)))
 along=smoothstep(.86,.99,forward)*(1-smoothstep(1.30,1.42,forward))
 pull=0
 for shift,strength in [(0,.0045),(.082,.003)]:
  curve=.955+(1.37-forward)*.39+shift+(.009 if x>0 else -.008)
  pull+=strength*math.exp(-((height-curve)/.016)**2)*side*along
 depth=.0085*mouth+jaw+pull
 if depth>.00005:
  p-=v.normal*depth;head_detail_count+=1
  for k in range(3):p[k]=min(old_max[k],max(old_min[k],p[k]))
body['head_detail_vertices']=head_detail_count
body['head_detail_recipe']='closed shallow mouth edge; unequal compressed jaw folds; short recessed tension creases; no added organs'
# Preserve the previously verified external envelope. The anatomy changes are
# confined to shoulder/neck volume inside it; toe locations and root are intact.
envelope_min=(-1.1624383926391602,-1.9859766960144043,.011915856972336769)
envelope_max=(1.3104851245880127,1.9227564334869385,1.7849867343902588)
for v in body.data.vertices:
 for k in range(3):v.co[k]=min(envelope_max[k],max(envelope_min[k],v.co[k]))
for p in body.data.polygons:p.use_smooth=True
# Attribute colour supplies broad, muted dorsal/ventral anatomy, not random spots.
colors=body.data.color_attributes.new(name='SkinTone',type='FLOAT_COLOR',domain='POINT')
for i,v in enumerate(body.data.vertices):
 x,forward,height=v.co.x,-v.co.y,v.co.z
 dorsal=max(0,min(1,(height-.30)/1.10));dorsal=dorsal*dorsal*(3-2*dorsal)
 belly=(.24,.225,.19);back=(.115,.125,.112)
 c=tuple(belly[k]*(1-dorsal)+back[k]*dorsal for k in range(3))
 colors.data[i].color=(*c,1)
mat=bpy.data.materials.new('harbor_creature_mottled_skin');mat.use_nodes=True
nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF');attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='SkinTone';mat.node_tree.links.new(attr.outputs['Color'],bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value=.67;bsdf.inputs['Metallic'].default_value=0
body.data.materials.clear();body.data.materials.append(mat)
out=os.path.join(ROOT,'public','assets','deepsea');os.makedirs(out,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'harbor-creature-skin.glb'),export_format='GLB',use_active_scene=True,export_yup=True)
sources=os.path.join(ROOT,'assets','blender');os.makedirs(sources,exist_ok=True)
bpy.data.libraries.write(os.path.join(sources,'harbor-creature-skin.blend'),{scene})
bounds=[min(v.co[k] for v in body.data.vertices) for k in range(3)]+[max(v.co[k] for v in body.data.vertices) for k in range(3)]
print({'vertices':len(body.data.vertices),'faces':len(body.data.polygons),'bounds_blender':bounds})
bpy.context.window.scene=previous
