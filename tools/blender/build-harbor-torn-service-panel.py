"""One damaged, still attached service skin. Not a pressure-hull breach."""
import bpy,math,os
from mathutils import Vector
ROOT=r'C:\Users\糖蒜\Desktop\铁肺'
NAME='HarborTornServicePanel'
old=bpy.data.collections.get(NAME)
if old:
 for o in list(old.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
col=bpy.data.collections.new(NAME);bpy.context.scene.collection.children.link(col)
def material(name,color,rough=.78,metal=.4):
 m=bpy.data.materials.new('harbor_damage_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
paint=material('paint',(.31,.33,.28));edge=material('steel',(.26,.27,.23),.65,.65)
black=material('rubber',(.022,.031,.029),.92,.02);copper=material('copper',(.26,.14,.066),.69,.55)
lens=material('dead_lens',(.11,.14,.13),.54,.12)
def adopt(o,n,m):
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o);o.name=n;o.data.materials.append(m);return o
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=adopt(bpy.context.object,n,m);o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 b=o.modifiers.new('edge radius','BEVEL');b.width=.012;b.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name);return o
def rod(n,a,b,r,m):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2)
 o=adopt(bpy.context.object,n,m);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
cube('recessed service backing',(0,.10,1.3),(2.95,.07,2.60),black)
for x in [-1.5,1.5]:cube('bolted frame cheek',(x,-.01,1.3),(.095,.21,2.7),edge)
for z in [-.025,2.63]:cube('bolted frame rail',(0,-.01,z),(3.09,.21,.085),edge)
for z in [.08,2.51]:
 for x in [-1.4,0,1.4]:rod('retained hex bolt',(x,-.13,z),(x,-.17,z),.035,edge)
for x in [-1.4,0,1.4]:rod('upper captive washer',(x,-.153,2.51),(x,-.161,2.51),.068,edge)
for x in [-1.06,1.04]:
 cube('rear mounting channel',(x,.025,1.32),(.085,.13,2.40),edge)
 for z in [.18,2.45]:cube('rear channel foot',(x,.063,z),(.31,.13,.105),edge)
for x in [-.9,-.48,.27,.70]:
 points=[(x,.02,2.49),(x,-.04,2.05),(x+.08,-.18,1.5),(x-.13,-.23,.97),(x+.04,-.06,.18)]
 for a,b in zip(points,points[1:]):rod('anchored service wire',a,b,.027,copper if x==.27 else black)
 for z in [.22,2.30]:cube('cable retaining clip',(x,-.045,z),(.16,.08,.09),edge)
# The upper seam stays fastened. A folded lower corner and uneven lip reveal
# internal wiring; this is a shallow secondary equipment cover, not the wall.
nx,ny=26,25
vertices=[]
for j in range(ny):
 v=j/(ny-1)
 for i in range(nx):
  u=i/(nx-1);x=-1.38+2.73*u
  # Broad pressure bow transitions into a genuinely rolled lower edge, rather
  # than three planar polygon strips. Upper fastener line remains unchanged.
  if v>=.18:
   peel=.10*(1-v)+.28*(1-v)**2*(1-.22*u)
   yy=-.15-peel;zz=.40+2.11*v
  else:
   curl=(.18-v)/.18*math.pi*.72
   peel=.10*.82+.28*.82**2*(1-.22*u)
   yy=-.15-peel-.15*math.sin(curl)
   zz=.40+2.11*.18-.15*(1-math.cos(curl))
  rip=(.07*math.sin(u*6.3)+.025*math.sin(u*17+.4))*max(0,1-v/.25)
  vertices.append((x,yy,zz+rip))
faces=[]
for j in range(ny-1):
 for i in range(nx-1):
  if i>=nx-5 and j<2+(i-(nx-5))//2:continue
  n=j*nx+i;faces.append((n,n+1,n+nx+1,n+nx))
mesh=bpy.data.meshes.new('buckled skin');mesh.from_pydata(vertices,[],faces);mesh.materials.append(paint)
o=bpy.data.objects.new('retained buckled inspection skin',mesh);col.objects.link(o)
uv=mesh.uv_layers.new()
for poly in mesh.polygons:
 for li in poly.loop_indices:
  v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=((v.x+1.5)/3,v.z/2.6)
bpy.context.view_layer.objects.active=o;o.select_set(True)
sub=o.modifiers.new('continuous bent sheet curvature','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
solid=o.modifiers.new('actual thin sheet gauge','SOLIDIFY');solid.thickness=.012;bpy.ops.object.modifier_apply(modifier=solid.name)
for polygon in o.data.polygons:polygon.use_smooth=True
# Dead luminaire hangs from its two intact brackets; no new gameplay signal.
cube('dead inspection lamp housing',(1.72,-.03,1.97),(.28,.25,.85),edge)
cube('opaque failed lamp diffuser',(1.72,-.164,1.99),(.15,.025,.60),lens)
for z in [1.58,2.37]:cube('lamp retaining bracket',(1.60,.03,z),(.50,.12,.09),edge)
# Narrow attached collection lip, containing only two thin torn skin flakes.
cube('lower retention lip',(0,-.16,-.10),(3.1,.43,.055),edge)
for x,z,ang in [(-.58,-.045,.17),(.67,-.04,-.25)]:
 p=cube('trapped skin fragment',(x,-.17,z),(.40,.20,.013),paint);p.rotation_euler[2]=ang
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('TornPanelExport');scene.collection.children.link(col);bpy.context.window.scene=scene
out=os.path.join(ROOT,'public','assets','deepsea')
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'harbor-torn-service-panel.glb'),export_format='GLB',use_active_scene=True,export_yup=True)
blend=os.path.join(ROOT,'assets','blender');os.makedirs(blend,exist_ok=True)
bpy.data.libraries.write(os.path.join(blend,'harbor-torn-service-panel.blend'),{scene})
bpy.context.window.scene=previous;bpy.data.scenes.remove(scene)
print({'objects':len(col.objects),'glb':os.path.join(out,'harbor-torn-service-panel.glb')})
