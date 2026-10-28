"""Original facility assets. Execute through Blender MCP; meters, Z up source/Y up glTF."""
import bpy, math, os, json
import numpy as np
from mathutils import Vector
ROOT = 'C:/Users/Lenovo/Desktop/tiefei'
OUT = ROOT+'/public/assets/level-03'
COL = 'L03_OriginalFacilityAssets'
if COL in bpy.data.collections:
    raise RuntimeError('Dedicated collection exists; refuse to overwrite without inspecting it.')
col=bpy.data.collections.new(COL); bpy.context.scene.collection.children.link(col)
created=[]
def register(o,name,mat):
    o.name='L03_'+name
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o); created.append(o)
    if mat: o.data.materials.append(mat)
    return o

# Deterministic, original multi-scale corrosion/paint images baked to portable image textures.
rng=np.random.default_rng(203)
N=512
def noise(scale):
    a=rng.random((scale,scale))
    p=np.arange(N)*scale/N;i=np.floor(p).astype(int);f=p-i;f=f*f*(3-2*f)
    rows=a[i%scale,:]*(1-f[:,None])+a[(i+1)%scale,:]*f[:,None]
    return rows[:,i%scale]*(1-f[None,:])+rows[:,(i+1)%scale]*f[None,:]
coarse=noise(12 if N%12==0 else 16)*.30+noise(64)*.40+noise(256)*.30
fine=rng.random((N,N))
def textured(name,base,rust,metal=.7):
    m=bpy.data.materials.new('L03_'+name); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.65
    t=np.clip((coarse-.48)*7,0,1)
    rgb=np.asarray(base)[None,None,:]*(1-t[:,:,None])+np.asarray(rust)[None,None,:]*t[:,:,None]
    rgb*=.75+fine[:,:,None]*.4
    # Fine vertical mineral streaks, etched chips, and varied oxidation.
    streak=(np.sin(np.arange(N)*1.37)>0.94)[None,:]*(.2+.8*np.arange(N)[:,None]/N)
    rgb*=1-streak[:,:,None]*.22
    pix=np.ones((N,N,4),dtype=np.float32); pix[:,:,:3]=np.clip(rgb,0,1)
    im=bpy.data.images.new('L03_'+name+'_albedo',width=N,height=N)
    im.pixels.foreach_set(pix.ravel()); im.filepath_raw=OUT+'/'+name+'-albedo.png'
    im.file_format='PNG'; im.save(); im.pack()
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    roughpix=np.ones((N,N,4),dtype=np.float32);roughpix[:,:,:3]=(.42+coarse*.45)[:,:,None]
    ri=bpy.data.images.new('L03_'+name+'_roughness',width=N,height=N);ri.colorspace_settings.name='Non-Color'
    ri.pixels.foreach_set(roughpix.ravel());ri.filepath_raw=OUT+'/'+name+'-roughness.png';ri.file_format='PNG';ri.save();ri.pack()
    rt=m.node_tree.nodes.new('ShaderNodeTexImage');rt.image=ri
    m.node_tree.links.new(rt.outputs['Color'],p.inputs['Roughness'])
    # Real normal texture, retained by GLTF rather than procedural-only Blender nodes.
    h=coarse*.5+fine*.08
    dx=(np.roll(h,1,1)-np.roll(h,-1,1))*1.8;dy=(np.roll(h,1,0)-np.roll(h,-1,0))*1.8
    normals=np.stack((dx,dy,np.ones_like(dx)),axis=2);normals/=np.linalg.norm(normals,axis=2)[:,:,None]
    pix[:,:,:3]=normals*.5+.5
    nm=bpy.data.images.new('L03_'+name+'_normal',width=N,height=N);nm.colorspace_settings.name='Non-Color'
    nm.pixels.foreach_set(pix.ravel());nm.filepath_raw=OUT+'/'+name+'-normal.png';nm.file_format='PNG';nm.save();nm.pack()
    nt=m.node_tree.nodes.new('ShaderNodeTexImage');nt.image=nm
    nn=m.node_tree.nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.4
    m.node_tree.links.new(nt.outputs['Color'],nn.inputs['Color']);m.node_tree.links.new(nn.outputs['Normal'],p.inputs['Normal'])
    return m
steel=textured('enamel-ivory',(.42,.46,.43),(.16,.065,.027))
iron=textured('oxidized-iron',(.12,.155,.16),(.28,.095,.025))
brass=textured('aged-brass',(.42,.29,.10),(.13,.065,.02))
dark=textured('rubber-dark',(.025,.036,.035),(.065,.055,.04),.15)
def plain(name,color,metal=.5,emission=0):
    m=bpy.data.materials.new('L03_'+name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.45
    if emission: p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
red=plain('warning-red',(.8,.006,.002),.1,3)
lamp=plain('surgical-lamp',(.65,.82,.72),.1,2)
def box(n,loc,size,mat=iron,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=register(bpy.context.object,n,mat);o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def cyl(n,loc,r,depth,mat=iron,axis='Z',verts=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc)
    o=register(bpy.context.object,n,mat)
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o
def ring(n,loc,major,minor,mat=iron,axis='Y'):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=loc,major_radius=major,minor_radius=minor)
    o=register(bpy.context.object,n,mat)
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    for p in o.data.polygons:p.use_smooth=True
    return o
def bolt(loc,axis='Y',r=.055):return cyl('hex_bolt',loc,r,.06,brass,axis,6)
def rod(n,a,b,r,mat=iron):
    a,b=Vector(a),Vector(b);o=cyl(n,(a+b)/2,r,(b-a).length,mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def text(n,s,loc,size=.25,mat=steel):
    bpy.ops.object.text_add(location=loc,rotation=(math.pi/2,0,0));o=register(bpy.context.object,n,mat)
    o.data.body=s;o.data.size=size;o.data.extrude=.002;o.data.align_x='CENTER'
    bpy.ops.object.convert(target='MESH');return o
def export(name,start):
    objects=created[start:]
    # Material-group batching preserves surface detail while avoiding hundreds of draw calls.
    grouped={}
    for o in objects:grouped.setdefault(o.data.materials[0].name,[]).append(o)
    batches=[]
    for mat,items in grouped.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in items:o.select_set(True)
        bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();o=bpy.context.object
        o.name='L03_'+name+'_'+mat; batches.append(o)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in batches:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT+'/'+name+'.glb',use_selection=True,export_format='GLB',export_yup=True)
    corners=[o.matrix_world@v.co for o in batches for v in o.data.vertices]
    bounds=[[min(v[i] for v in corners),max(v[i] for v in corners)] for i in range(3)]
    return {'file':name+'.glb','blender_bounds_xyz':bounds,'draw_meshes':len(batches),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in batches)}

manifest=[]
# Tall hydraulic press, massive side columns, retracting platen, ribbed cast base.
s=len(created)
box('press_foundation',(0,0,.22),(5.8,3.8,.44))
box('press_bed',(0,0,.7),(4.6,3.2,.65))
for x in [-2.4,2.4]:
    box('riveted_column',(x,.45,5),(0.65,1.5,9.5),steel)
    box('column_foot',(x,.45,.7),(1.1,2,1.0))
    for z in np.arange(1.4,9.4,.42):
        for xx in [x-.22,x+.22]:bolt((xx,-.34,float(z)))
    cyl('chrome_hydraulic_ram',(x*.68,.15,5.8),.22,6,brass)
    for z in np.arange(3.2,8.5,.17):ring('ram_bellows',(x*.68,.15,float(z)),.26,.045,dark,'Z')
box('top_casting',(0,.45,9.55),(5.8,2.5,.7),steel)
box('suspended_platen',(0,0,4.45),(4.1,3.0,1.65))
box('platen_lip',(0,0,3.6),(4.5,3.35,.18),brass)
for x in np.arange(-1.8,2,.4):
    for z in [4,4.8]:bolt((float(x),-1.53,z))
for x in [-1.8,-.9,0,.9,1.8]:box('bed_reinforcement',(x,-1.45,.85),(.18,.6,1),iron)
text('press_id','PRESS / 03',(0,-1.53,4.35),.35,steel)
for x in [-2.65,2.65]:
    rod('supply_pipe',(x,1.2,1),(x,1.2,9),.1)
    for z in [1.5,3.5,6,8]:ring('pipe_collar',(x,1.2,z),.15,.045,brass,'Z')
manifest.append(export('abyssal-press',s))
# Port cover intended to mount flush into the curved containment wall. No occupants.
s=len(created)
box('containment_bulkhead',(0,.5,3),(6,1.2,6),steel)
cyl('port_dark_recess',(0,-.2,3),2.35,.28,dark,'Y',64)
for r in [2.15,2.34,2.48]:ring('pressure_port_flange',(0,-.4,3),r,.10,iron)
for a in np.arange(0,math.tau,math.tau/24):bolt((2.34*math.cos(a),-.56,3+2.34*math.sin(a)),r=.085)
for x in [-1.5,-.75,0,.75,1.5]:
    extent=math.sqrt(2.12**2-x*x)
    rod('port_guard',(x,-.46,3-extent),(x,-.46,3+extent),.045)
for z in [2,3,4]:rod('port_crossbar',(-1.85,-.48,z),(1.85,-.48,z),.045)
box('alarm_housing',(0,-.32,5.65),(1.1,.4,.45))
cyl('alarm_lens',(0,-.6,5.65),.15,.15,red,'Y')
text('containment_id','CONTAINMENT / 07',(0,-.13,.3),.3,brass)
for x in [-2.7,2.7]:
    cyl('side_hydraulics',(x,-.1,3),.12,4.5,brass)
    for z in [1,2,4,5]:ring('hydraulic_collar',(x,-.1,z),.18,.04,iron,'Z')
manifest.append(export('abyssal-containment',s))
# Patient platform and task luminaire. Environmental furniture, no figure or creature.
s=len(created)
box('table_pedestal',(0,0,.18),(2.7,1.5,.35))
cyl('table_lift',(0,0,.7),.35,.9,iron)
for x in [-.9,.9]:rod('support_link',(x,0,.35),(-x,0,1.1),.065,brass)
box('table_rim',(0,0,1.2),(3.1,1.6,.15),brass)
for x,l,angle in [(-1.05,.85,-.12),(0,1.1,0),(.98,.85,.2)]:
    o=box('segmented_enamel_bed',(x,0,1.32),(l,1.42,.14),steel);o.rotation_euler.y=angle
for y in [-.82,.82]:rod('safety_rail',(-1.3,y,1.5),(1.3,y,1.5),.045,brass)
ring('adjustment_wheel',(.55,-.96,.72),.34,.038,brass)
for a in np.arange(0,math.tau,math.tau/5):rod('wheel_spoke',(.55,-.96,.72),(.55+.32*math.cos(a),-.96,.72+.32*math.sin(a)),.018,brass)
manifest.append(export('abyssal-surgical-table',s))

with open(OUT+'/manifest.json','w') as f:json.dump({'source':'Original procedural Blender MCP authoring; no third-party models or textures','units':'meters','gltf_up':'Y','front':'+Z','collision':'decorative only; do not insert GLB meshes into structural colliders','assets':manifest},f,indent=2)
bpy.data.libraries.write(ROOT+'/assets/blender/level-03/abyssal-facility.blend',{col},fake_user=True)
print(json.dumps(manifest,indent=2))
