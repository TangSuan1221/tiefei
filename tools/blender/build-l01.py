"""Deterministic Blender 5.x build: DS_L01, first-level vertical slice only.
Run: blender --background --python tools/blender/build-l01.py
Or through Blender MCP: d=runpy.run_path(path); d['build_base'](); d['build_details'](); d['finish']()
All design coordinates are metres, Three.js Y-up, forward -Z.
Blender mapping is (x, -z, y); glTF exporter performs the sole Y-up conversion.
Original scenes/objects are preserved. No paid assets or external image services.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/deepsea'
SOURCE = ROOT / 'assets/blender'
EVIDENCE = SOURCE / 'evidence'
TEX = SOURCE / 'textures/l01'
SCENE = None
COL = None
PREVIEW = None
MATS = {}
GROUPS = {}
LAYOUT = {}
BEVEL = set()


def b(p):
    return Vector((p[0], -p[2], p[1]))


def three(p):
    return [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]


def obj_mesh(name, verts, faces, mat, group='structure', uv=None):
    mesh = bpy.data.meshes.new(name + '_mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if uv is not None:
        layer = mesh.uv_layers.new(name='UVMap')
        for poly, uvs in zip(mesh.polygons, uv):
            for li, value in zip(poly.loop_indices, uvs):
                layer.data[li].uv = value
    o = bpy.data.objects.new(name, mesh)
    COL.objects.link(o)
    if mat:
        mesh.materials.append(MATS[mat])
    o['ds_group'] = group
    o['ds_asset'] = 'l01-processing'
    if group:
        GROUPS.setdefault(group, []).append(o)
    return o


def box(name, p, size, mat='steel', group='structure', bevel=True):
    x, y, z = [q * .5 for q in size]
    verts = [b((sx*x, sy*y, sz*z)) for sx, sy, sz in
             [(-1,-1,-1), (1,-1,-1), (1,1,-1), (-1,1,-1),
              (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1)]]
    faces = [(0,3,2,1), (4,5,6,7), (0,4,7,3), (1,2,6,5), (0,1,5,4), (3,7,6,2)]
    axes = [(0,1),(0,1),(2,1),(2,1),(0,2),(0,2)]
    # Derive UVs from physical coordinates, not face-edge ordering. The old
    # ordering exchanged wall length/height and stretched rust into wood grain.
    local_three = [(v.x,v.z,-v.y) for v in verts]
    uv = [[((local_three[i][a]+p[a])/2,(local_three[i][c]+p[c])/2) for i in face]
          for face,(a,c) in zip(faces,axes)]
    o = obj_mesh(name, verts, faces, mat, group, uv)
    o.location = b(p)
    if bevel:
        BEVEL.add(o.name)
    return o


def tube(name, points, radius, mat='steel', group='pipework', sides=16, cap=True):
    pts = [b(p) for p in points]
    verts = []
    for k,p in enumerate(pts):
        tangent = (pts[min(k+1,len(pts)-1)] - pts[max(k-1,0)]).normalized()
        side = tangent.cross(Vector((0,0,1)))
        if side.length < .01:
            side = tangent.cross(Vector((0,1,0)))
        side.normalize()
        up = tangent.cross(side).normalized()
        verts.extend(p + radius*(math.cos(i*math.tau/sides)*side + math.sin(i*math.tau/sides)*up) for i in range(sides))
    faces=[]; uvs=[]
    dist=0
    for k in range(len(pts)-1):
        seg=(pts[k+1]-pts[k]).length
        for i in range(sides):
            j=(i+1)%sides
            faces.append((k*sides+i,k*sides+j,(k+1)*sides+j,(k+1)*sides+i))
            uvs.append([(i/sides,dist/2),((i+1)/sides,dist/2),((i+1)/sides,(dist+seg)/2),(i/sides,(dist+seg)/2)])
        dist+=seg
    if cap:
        faces += [tuple(range(sides-1,-1,-1)), tuple((len(pts)-1)*sides+i for i in range(sides))]
        uvs += [[(.5+.5*math.cos(i*math.tau/sides),.5+.5*math.sin(i*math.tau/sides)) for i in range(sides)]]*2
    o=obj_mesh(name,verts,faces,mat,group,uvs)
    for f in o.data.polygons[:(len(pts)-1)*sides]:
        f.use_smooth=True
    return o


def cylinder(name, p, radius, depth, mat='steel', group='mechanical', axis=(0,1,0), sides=24):
    v=Vector(axis).normalized()*depth*.5
    return tube(name,[Vector(p)-v,Vector(p)+v],radius,mat,group,sides)


def sphere(name,p,size,mat='rubber',group='diver',rings=10,sides=20):
    verts=[]
    for r in range(rings+1):
        phi=math.pi*r/rings
        for i in range(sides):
            theta=math.tau*i/sides
            verts.append(b((p[0]+size[0]*.5*math.sin(phi)*math.cos(theta),
                            p[1]+size[1]*.5*math.cos(phi),
                            p[2]+size[2]*.5*math.sin(phi)*math.sin(theta))))
    faces=[]; uv=[]
    for r in range(rings):
        for i in range(sides):
            j=(i+1)%sides
            faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
            uv.append([(i/sides,r/rings),((i+1)/sides,r/rings),((i+1)/sides,(r+1)/rings),(i/sides,(r+1)/rings)])
    o=obj_mesh(name,verts,faces,mat,group,uv)
    for f in o.data.polygons: f.use_smooth=True
    return o


def ring(name,p,radius,thickness,mat='steel',group='mechanical',axis=(0,1,0),sides=32):
    normal=Vector(axis).normalized()
    side=normal.cross(Vector((0,0,1)))
    if side.length < .01: side=normal.cross(Vector((0,1,0)))
    side.normalize(); up=normal.cross(side).normalized()
    pts=[Vector(p)+radius*(math.cos(i*math.tau/sides)*side+math.sin(i*math.tau/sides)*up) for i in range(sides+1)]
    return tube(name,pts,thickness,mat,group,8,False)


def empty(name,p,props=None):
    o=bpy.data.objects.new(name,None)
    COL.objects.link(o); o.location=b(p); o.empty_display_size=.25
    if props:
        for key,value in props.items(): o[key]=value
    return o


def stencil(name, value, p, size=.12, group='stencils'):
    curve=bpy.data.curves.new(name+'_font','FONT')
    curve.body=value; curve.size=size; curve.extrude=.0005
    obj=bpy.data.objects.new(name,curve); COL.objects.link(obj)
    obj.location=b(p); obj.rotation_euler=(math.pi/2,0,0)
    obj.data.materials.append(MATS['white'])
    for other in SCENE.objects: other.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    assert 'MESH' in [i.identifier for i in bpy.ops.object.convert.get_rna_type().properties['target'].enum_items]
    bpy.ops.object.convert(target='MESH')
    obj=bpy.context.object
    GROUPS.setdefault(group,[]).append(obj)
    return obj


def parent_keep(o,parent):
    world=o.matrix_world.copy()
    o.parent=parent
    o.matrix_world=world


def noise(n,cells,rng):
    src=rng.random((cells,cells),dtype=np.float32)
    v=np.arange(n,dtype=np.float32)*cells/n
    i=v.astype(int); f=v-i; f=f*f*(3-2*f)
    lo=src[i[:,None]%cells,i[None,:]%cells]*(1-f[None,:])+src[i[:,None]%cells,(i[None,:]+1)%cells]*f[None,:]
    hi=src[(i[:,None]+1)%cells,i[None,:]%cells]*(1-f[None,:])+src[(i[:,None]+1)%cells,(i[None,:]+1)%cells]*f[None,:]
    return lo*(1-f[:,None])+hi*f[:,None]


def image(name, rgb, noncolor=False):
    n=rgb.shape[0]
    rgba=np.ones((n,n,4),np.float32); rgba[:,:,:3]=np.clip(rgb,0,1)
    im=bpy.data.images.new('DS_L01_'+name,width=n,height=n,alpha=False)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(rgba.ravel())
    enums=[x.identifier for x in im.bl_rna.properties['file_format'].enum_items]
    assert 'PNG' in enums
    im.file_format='PNG'; im.filepath_raw=str(TEX/(name+'.png')); im.save(); im.pack()
    return im


def materials():
    n=1024; rng=np.random.default_rng(3107)
    coarse=noise(n,8,rng); fine=noise(n,64,rng); micro=noise(n,256,rng)
    rust=np.clip((coarse*.65+fine*.35-.67)*6,0,1)
    scratches=(micro>.82).astype(np.float32)*.008
    height=fine*.12+micro*.035+rust*.08
    dy,dx=np.gradient(height)
    normal=np.stack((-dx*9,-dy*9,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    normal_im=image('steel_normal',normal*.5+.5,True)
    orm=np.stack((np.ones_like(rust),.74+rust*.14+micro*.025,.50*(1-rust*.8)),axis=-1)
    orm_im=image('steel_roughness_metalness',orm,True)
    palettes={'steel':(.19,.235,.25),'ochre':(.26,.285,.275),'silt':(.21,.235,.23),
              'rubber':(.055,.072,.08),'ceramic':(.42,.445,.40),'visor':(.032,.055,.07),
              'white':(.65,.68,.62),'fresh':(.28,.33,.35)}
    for key,col in palettes.items():
        m=bpy.data.materials.new('DS_L01_'+key); m.use_nodes=True
        m.diffuse_color=(*col,1)
        bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        bs.inputs['Base Color'].default_value=(*col,1)
        bs.inputs['Roughness'].default_value=.75
        bs.inputs['Metallic'].default_value=.0
        MATS[key]=m
        if key in ('steel','ochre','ceramic','silt'):
            influence={'steel':.22,'ochre':.10,'ceramic':.06,'silt':.03}[key]
            factor=.94+fine*.07+micro*.025
            rgb=np.array(col)[None,None,:]*factor[:,:,None]
            rustcol=np.array((.27,.185,.135))[None,None,:]*(.70+fine[:,:,None]*.3)
            rgb=rgb*(1-rust[:,:,None]*influence)+rustcol*rust[:,:,None]*influence
            rgb+=scratches[:,:,None]
            im=image(key+'_basecolor',rgb)
            tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
            m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
            if key=='steel':
                packed=m.node_tree.nodes.new('ShaderNodeTexImage'); packed.image=orm_im
                split=m.node_tree.nodes.new('ShaderNodeSeparateColor')
                valid_modes=[i.identifier for i in split.bl_rna.properties['mode'].enum_items]
                assert 'RGB' in valid_modes
                split.mode='RGB'
                m.node_tree.links.new(packed.outputs['Color'],split.inputs['Color'])
                m.node_tree.links.new(split.outputs['Green'],bs.inputs['Roughness'])
                m.node_tree.links.new(split.outputs['Blue'],bs.inputs['Metallic'])
            elif key=='ochre': bs.inputs['Metallic'].default_value=.12
            norm=m.node_tree.nodes.new('ShaderNodeTexImage'); norm.image=normal_im
            nm=m.node_tree.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.40 if key=='silt' else .65
            m.node_tree.links.new(norm.outputs['Color'],nm.inputs['Color']); m.node_tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
        elif key=='visor':
            bs.inputs['Roughness'].default_value=.20; bs.inputs['Metallic'].default_value=.4
        elif key=='fresh':
            bs.inputs['Roughness'].default_value=.34; bs.inputs['Metallic'].default_value=.85
        elif key=='rubber': bs.inputs['Roughness'].default_value=.86


def setup():
    global SCENE,COL,PREVIEW,LAYOUT
    for p in (OUT,SOURCE,EVIDENCE,TEX): p.mkdir(parents=True,exist_ok=True)
    if bpy.data.scenes.get('DS_L01'):
        raise RuntimeError('DS_L01 already exists; use its existing build functions or start from a fresh Blender file. Original scenes are never removed.')
    SCENE=bpy.data.scenes.new('DS_L01')
    SCENE['asset_scope']='First-level vertical slice: processing hall and 3m connecting corridor, not all seven levels.'
    bpy.context.window.scene=SCENE
    COL=bpy.data.collections.new('DS_L01_EXPORT'); SCENE.collection.children.link(COL)
    PREVIEW=bpy.data.collections.new('DS_L01_PREVIEW_ONLY'); SCENE.collection.children.link(PREVIEW)
    SCENE.unit_settings.system='METRIC'; SCENE.unit_settings.scale_length=1
    LAYOUT={'version':1,'asset':'l01-processing.glb','scope':'first-level vertical slice only: main hall + 3m short corridor',
        'coordinateSystem':{'up':'+Y','forward':'-Z','units':'meters','blenderToThree':'(x,z,-y); glTF already converted, do not rotate again'},
        'bounds':{'min':[-9,-4,-11],'max':[9,4,11]},
        'corridor':{'min':[-2.2,-2.1,-14],'max':[2.2,2.1,-11]},
        'spawn':{'name':'spawn_player','position':[0,0,8],'forward':[0,0,-1]},
        'doors':[{'id':'door_transfer','anchor':'int_door_transfer','center':[0,0,-11],'width':4.4,'height':4.2,'thickness':.30,
                  'initialState':'open','panelNode':'geo_door_transfer','closedPosition':[0,0,-11.16],
                  'openPosition':[-4.65,0,-11.16],'slideAxis':[1,0,0]},
                 {'id':'door_entry','center':[0,0,11],'width':4.4,'height':4.2,'initialState':'open','connectsExternalWorld':False}],
        'crates':[{'id':'supply','anchor':'int_cache_supply','position':[6,-2.3,3],'size':[1.4,1.1,.9],
                   'lidNode':'crate_lid_supply','hinge':[6,-1.86,2.57],'hingeAxis':[1,0,0],'openAngleRadians':-1.85,
                   'items':['sup.cell','sup.lure'],'itemNodes':['item_supply_cell','item_supply_lure']},
                  {'id':'tools','anchor':'int_cache_tools','position':[-6,-2.3,-4],'size':[1.4,1.1,.9],
                   'lidNode':'crate_lid_tools','hinge':[-6,-1.86,-4.43],'hingeAxis':[1,0,0],'openAngleRadians':-1.85,
                   'items':['sup.tape','sup.tape','sup.cutter'],'itemNodes':['item_tools_tape01','item_tools_tape02','item_tools_cutter']}],
        'obstacles':[], 'walls':[], 'safeRoute':[[0,0,8],[3.5,0,4.5],[4.8,0,0],[4.8,0,-6.5],[0,0,-9],[0,0,-13]],
        'observations':[{'name':'int_body_diver01','position':[5.8,-3,-5.2]},{'name':'trigger_echo_observe','position':[0,0,-10]}],
        'notes':['The supplied hall-local brief supersedes the larger A/B/C/D/E/F map positions for this build.',
                 'No lights, camera, water volume, particle systems or invisible collision proxies are exported.',
                 'Doors are supplied open, separately movable. JSON door state must be respected by runtime collision.',
                 'Collision records are conservative object-group AABBs in Three coordinates. Small bolts/cables/fauna are decorative.']}
    materials()


def add_collision(o, kind='obstacles'):
    bpy.context.view_layer.update()
    pts=[o.matrix_world@Vector(c) for c in o.bound_box]
    pts=[three(p) for p in pts]
    LAYOUT[kind].append({'name':o.name,'min':[min(p[i] for p in pts) for i in range(3)],
                         'max':[max(p[i] for p in pts) for i in range(3)]})


def structure():
    for sign in (-1,1):
        o=box('geo_wall_'+('left' if sign<0 else 'right'),(sign*9.15,0,0),(.3,8.6,22.6))
        add_collision(o,'walls')
    for name,y in [('floor',-4.15),('ceiling',4.15)]:
        o=box('geo_'+name,(0,y,0),(18,.3,22)); add_collision(o,'walls')
    for label,z in [('front',-11.15),('rear',11.15)]:
        for sign in (-1,1):
            o=box('geo_'+label+'_pier_'+str(sign),(sign*5.6,0,z),(6.8,8.6,.3)); add_collision(o,'walls')
        for sign in (-1,1):
            o=box('geo_'+label+'_lintel_'+str(sign),(0,sign*3.05,z),(4.4,1.9,.3)); add_collision(o,'walls')
        for x in (-2.34,2.34):
            box('geo_'+label+'_jamb',(x,0,z),(.26,4.65,.64),'fresh','doorframes')
        for y in (-2.25,2.25):
            box('geo_'+label+'_header',(0,y,z),(4.95,.28,.64),'fresh','doorframes')
    for x in (-2.35,2.35):
        o=box('geo_corridor_side',(x,0,-12.65),(.3,4.8,3)); add_collision(o,'walls')
    for y in (-2.25,2.25):
        o=box('geo_corridor_slab',(0,y,-12.65),(4.4,.3,3)); add_collision(o,'walls')
    for z in (-11.4,-12.7,-14):
        for x in (-2.1,2.1): box('geo_corridor_rib',(x,0,z),(.15,4.2,.13),'steel','doorframes')
        box('geo_corridor_rib_top',(0,2,z),(4.2,.15,.13),'steel','doorframes')
    door=box('geo_door_transfer',(-4.65,0,-11.16),(4.34,4.12,.24),'ochre',None)
    door['closedPositionThree']=[0,0,-11.16]; door['slideAxisThree']=[1,0,0]
    door['openPositionThree']=[-4.65,0,-11.16]
    empty('int_door_transfer',(-2.95,-.4,-10.7),{'interaction':'door_transfer'})
    empty('spawn_player',(0,0,8),{'forwardThree':[0,0,-1]})
    empty('trigger_exit',(0,0,-13.7),{'halfExtents':[1.6,1.5,.25]})
    empty('trigger_echo_observe',(0,0,-10))
    # Stable structural rhythm: columns and ribs remain close to the shell.
    for z in (-9,-5,-1,3,7):
        for sign in (-1,1):
            x=sign*8.77
            box('geo_column_flange',(x,0,z),(.22,8,.48),'steel','ribs')
            box('geo_column_web',(sign*8.55,0,z),(.34,8,.14),'steel','ribs')
            box('geo_column_foot',(sign*8.65,-3.82,z),(.65,.2,.9),'ochre','ribs')
        box('geo_overhead_crossbeam',(0,3.67,z),(17.2,.55,.19),'steel','ribs')
        box('geo_overhead_flange',(0,3.38,z),(17.2,.10,.46),'steel','ribs')
    # Flush floor panel seams and wall panel cover strips.
    for z in range(-10,11,2):
        box('geo_floor_seam',(0,-3.986,z),(17.9,.012,.032),'rubber','surface_details',False)
        for sign in (-1,1):
            box('geo_wall_seam',(sign*8.989,0,z),(.016,7.95,.025),'rubber','surface_details',False)
    for x in (-6,-3,0,3,6):
        box('geo_floor_long_seam',(x,-3.982,0),(.024,.012,21.9),'rubber','surface_details',False)


def crates():
    for kind,p in [('supply',(6,-2.3,3)),('tools',(-6,-2.3,-4))]:
        x,y,z=p
        root=empty('int_cache_'+kind,p,{'interaction':'cache','crateId':kind,'sizeThree':[1.4,1.1,.9]})
        group='crate_'+kind+'_body'
        parts=[]
        parts.append(box('geo_crate_'+kind+'_base',(x,y-.47,z),(1.4,.16,.9),'steel',group))
        for dx in (-.65,.65): parts.append(box('geo_crate_'+kind+'_side',(x+dx,y-.03,z),(.10,.78,.9),'ochre',group))
        for dz in (-.4,.4): parts.append(box('geo_crate_'+kind+'_wall',(x,y-.03,z+dz),(1.2,.78,.10),'ochre',group))
        parts.append(box('geo_crate_'+kind+'_liner',(x,y-.355,z),(1.18,.07,.68),'rubber',group))
        for dx in (-.54,.54):
            for dz in (-.44,.44):
                parts.append(box('geo_crate_'+kind+'_corner',(x+dx,y-.02,z+dz),(.12,.84,.045),'steel',group))
        for dx in (-.4,.4):
            parts.append(box('geo_crate_'+kind+'_latch',(x+dx,y+.21,z+.46),(.13,.28,.07),'fresh',group))
            parts.append(box('geo_crate_'+kind+'_latch_inset',(x+dx,y+.23,z+.501),(.072,.13,.015),'rubber',group))
            cylinder('geo_crate_'+kind+'_latch_pin',(x+dx,y+.09,z+.51),.025,.17,'steel',group,(1,0,0),12)
        # Recessed transport grip, folded plate rim and a real asset-local stencil.
        parts.append(box('geo_crate_'+kind+'_handle_recess',(x,y+.07,z+.454),(.39,.17,.025),'rubber',group))
        tube('geo_crate_'+kind+'_handle',[(x-.15,y+.06,z+.49),(x-.15,y+.13,z+.52),(x+.15,y+.13,z+.52),(x+.15,y+.06,z+.49)],.018,'fresh',group,10)
        stencil('geo_crate_'+kind+'_stencil','SUPPLY / 03' if kind=='supply' else 'TOOLS / 02',(x-.39,y-.23,z+.455),.105)
        lid=box('crate_lid_'+kind,(x,y+.44,z),(1.4,.22,.9),'ochre',None)
        # Geometry is offset relative to the rear hinge: local X is Three X.
        pivot=b((x,y+.44,z-.43))
        delta=lid.location-pivot
        for vert in lid.data.vertices: vert.co+=delta
        lid.location=pivot
        lid['hingeAxisThree']=[1,0,0]; lid['openAngleRadians']=-1.85
        lid['crateId']=kind
        bpy.context.view_layer.update()
        parent_keep(lid,root)
        # Raised lid ribs are children so the hinge drives every cover detail.
        for dx in (-.52,.52):
            rib=box('geo_lid_'+kind+'_rib',(x+dx,y+.561,z),(.085,.024,.74),'steel',None)
            bpy.context.view_layer.update(); parent_keep(rib,lid)
        for dx in (-.43,.43):
            h=cylinder('geo_hinge_'+kind,(x+dx,y+.44,z-.45),.07,.23,'fresh',group,(1,0,0),16)
            parts.append(h)
        # Fixed rack puts the crate bottom at -2.85 rather than floating.
        box('geo_cache_'+kind+'_rack_top',(x,-2.96,z),(1.7,.2,1.15),'steel','racks')
        for dx in (-.65,.65):
            for dz in (-.4,.4): box('geo_cache_'+kind+'_rack_leg',(x+dx,-3.49,z+dz),(.12,.98,.12),'steel','racks')
        for dx in (-.76,.76): box('geo_cache_'+kind+'_rack_brace',(x+dx,-3.46,z),(.1,.12,1.05),'steel','racks')
        LAYOUT['obstacles'].append({'name':'rack_and_cache_'+kind,'min':[x-.85,-4,z-.575],'max':[x+.85,y+.55,z+.575]})
        if kind=='supply':
            item=cylinder('item_supply_cell',(x-.28,y-.17,z),.16,.40,'ceramic',None,(0,1,0),24)
            item2=sphere('item_supply_lure',(x+.30,y-.20,z),(.24,.24,.30),'ochre',None)
            bpy.context.view_layer.update(); parent_keep(item,root); parent_keep(item2,root)
        else:
            for k,dx in enumerate((-.38,-.06)):
                item=ring('item_tools_tape0'+str(k+1),(x+dx,y-.24,z),.105,.05,'rubber',None)
                bpy.context.view_layer.update(); parent_keep(item,root)
            item=box('item_tools_cutter',(x+.32,y-.22,z),(.16,.17,.49),'ceramic',None)
            bpy.context.view_layer.update(); parent_keep(item,root)


def separator():
    group='separator'
    # A toppled industrial shaker rather than a plain rectangular prop.
    for x in (-4.5,.1):
        for z in (-3.4,1.8):
            box('geo_separator_foot',(x,-3.8,z),(.85,.36,.9),'ochre',group)
            tube('geo_separator_leg',[(x,-3.65,z),(x+.35,-1.4,z)],.15,'steel',group,12)
            ring('geo_separator_isolation_spring',(x+.23,-2.2,z),.23,.065,'fresh',group)
    for z in (-3.4,1.8):
        box('geo_separator_crossbase',(-2.2,-2.9,z),(5.0,.25,.24),'steel',group)
    # Screen slopes 12 degrees along Z. All parts share this geometric slope.
    slope=math.tan(math.radians(12))
    for x in (-4.65,.25):
        tube('geo_separator_screen_side',[(x,-1.65,-3.7),(x,-.3,2.65)],.18,'steel',group,12)
        tube('geo_separator_guard',[(x,-.5,-3.7),(x,.85,2.65)],.11,'ochre',group,12)
        for z in (-3.6,-1.6,.4,2.5):
            yy=-.85+(z+.3)*slope
            tube('geo_separator_upright',[(x,yy-.6,z),(x,yy+.7,z)],.07,'steel',group,10)
    for z in np.linspace(-3.7,2.65,27):
        yy=-1.65+(float(z)+3.7)*slope
        box('geo_separator_screen_slat',(-2.2,yy,float(z)),(4.85,.09,.09),'fresh',group)
    for x in np.linspace(-4.6,.2,17):
        tube('geo_separator_screen_long',[(float(x),-1.60,-3.7),(float(x),-.25,2.65)],.029,'steel',group,8)
    # Large drum, bearing housings and motor determine the recognizable silhouette.
    cylinder('geo_separator_drum',(-2.2,-.25,-2.6),1.0,4.45,'steel',group,(1,0,0),48)
    for x in (-4.5,.1):
        cylinder('geo_separator_drum_end',(x,-.25,-2.6),1.06,.15,'ochre',group,(1,0,0),40)
        cylinder('geo_separator_bearing',(x+(-.15 if x<0 else .15),-.25,-2.6),.37,.4,'fresh',group,(1,0,0),24)
        for a in range(0,360,45):
            q=math.radians(a)
            cylinder('geo_separator_end_bolt',(x+(-.09 if x<0 else .09),-.25+math.cos(q)*.81,-2.6+math.sin(q)*.81),.055,.09,'fresh',group,(1,0,0),6)
    box('geo_separator_motor',(-4.5,-1.30,.75),(1.0,.75,1.4),'ochre',group)
    for z in np.linspace(.22,1.25,9): box('geo_motor_cooling_fin',(-5.04,-1.3,float(z)),(.09,.68,.04),'steel',group)
    cylinder('geo_separator_drive',(-3.95,-1.15,.8),.35,.65,'rubber',group,(1,0,0),24)
    # Angled hopper walls and a lower receiving tray.
    box('geo_separator_chute',(-2.2,-2.55,-.4),(3.4,.18,3.8),'steel',group)
    for x in (-3.95,-.45): box('geo_separator_chute_wall',(x,-2.12,-.4),(.12,.85,3.8),'ochre',group)
    LAYOUT['obstacles'].append({'name':'geo_separator','min':[-5.10,-4,-3.9],'max':[.75,1.0,2.9]})


def build_base():
    setup(); structure(); crates(); separator()
    bpy.context.view_layer.update()
    set_viewport()
    export_asset('base')
    print('DS_L01 BASE EXPORTED',len(COL.objects),'objects')


def set_viewport():
    from mathutils import Quaternion
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            s=area.spaces.active
            s.shading.type='MATERIAL'
            s.overlay.show_overlays=False
            s.lens=24
            direction=b((-.7,-.4,-1))
            s.region_3d.view_rotation=direction.to_track_quat('-Z','Y')
            s.region_3d.view_distance=13
            s.region_3d.view_location=b((-1,-.5,-1.4))
            s.region_3d.view_perspective='PERSP'


def export_asset(stage='final'):
    bpy.context.window.scene=SCENE
    for o in SCENE.objects: o.select_set(False)
    for o in COL.objects: o.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in COL.objects if o.type=='MESH')
    # export_format uses dynamic enum items in 5.1; provoke argument validation only.
    try:
        bpy.ops.export_scene.gltf(export_format='__QUERY_VALID_FORMATS__')
    except TypeError as exc:
        valid=str(exc)
        if 'GLB' not in valid: raise RuntimeError('GLB not advertised by exporter: '+valid)
    kwargs=dict(filepath=str(OUT/'l01-processing.glb'),export_format='GLB',use_selection=True,
                export_yup=True,export_apply=True,export_extras=True,export_cameras=False,
                export_lights=False,export_animations=False)
    props=bpy.ops.export_scene.gltf.get_rna_type().properties
    if 'use_active_scene' not in props: raise RuntimeError('Exporter cannot isolate the authored scene')
    kwargs['use_active_scene']=True
    if 'AUTO' in [i.identifier for i in props['export_image_format'].enum_items]: kwargs['export_image_format']='AUTO'
    bpy.ops.export_scene.gltf(**kwargs)
    LAYOUT['buildStage']=stage
    LAYOUT['exportObjects']=len(COL.objects)
    (OUT/'l01-layout.json').write_text(json.dumps(LAYOUT,ensure_ascii=False,indent=2),encoding='utf-8')
    SCENE['buildStage']=stage
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'l01-processing.blend'))


def build_details():
    """Static authored details; main right-hand route remains unobstructed."""
    # Service pipes hug the shell, not the player's approach to either crate.
    for side in (-1, 1):
        for height, radius in ((2.6, .18), (3.05, .11)):
            x = side * 8.32
            tube('geo_service_pipe', [(x,height,10.7),(x,height,-8.7),(side*7.9,height,-10.5)], radius)
            for z in (-8,-4,0,4,8):
                ring('geo_pipe_flange',(x,height,z),radius+.065,.045,axis=(0,0,1))
                box('geo_pipe_bracket',(side*8.65,height,z),(.65,.10,.12),'steel','pipework')
    tube('geo_loose_umbilical',[(6.1,-3.6,-5),(7,-3.85,-5.5),(7.8,-3.85,-4),(8.5,-2.9,-3)],.045,'rubber','cables',10)
    tube('geo_hanging_cable',[(-7,3.8,5),(-7.1,2.9,5.2),(-6.8,1.3,5.4),(-7.2,.7,5.3)],.028,'rubber','cables',8)
    tube('geo_ceiling_cable',[(7,3.8,-5),(6.2,2.7,-5.3),(5.5,2.5,-5.7),(4.5,3.8,-6)],.025,'rubber','cables',8)
    # Hard-shell deep-sea work suit, slumped at the floor; no gore or bubbles.
    sphere('geo_diver_torso',(5.8,-3.43,-5.15),(.65,.57,.8),'ochre')
    sphere('geo_diver_helmet',(5.8,-3.31,-5.76),(.53,.53,.52),'ceramic')
    sphere('geo_diver_visor',(5.8,-3.08,-5.80),(.34,.075,.30),'visor')
    ring('geo_diver_neck',(5.8,-3.40,-5.48),.22,.06,'fresh','diver',axis=(0,0,1))
    ring('geo_diver_face_rim',(5.8,-3.095,-5.80),.175,.027,'fresh','diver',axis=(0,1,0))
    box('geo_diver_chest_module',(5.8,-3.115,-5.2),(.35,.075,.31),'steel','diver')
    for x in (5.67,5.93):
        tube('geo_diver_harness',[(x,-3.21,-5.43),(x,-3.10,-5.18),(x,-3.23,-4.9)],.031,'rubber','diver',10)
    for z in (-5.29,-5.16):
        cylinder('geo_diver_chest_valve',(5.8,-3.062,z),.045,.026,'fresh','diver',(0,1,0),12)
    tube('geo_diver_chest_hose',[(5.95,-3.09,-5.24),(6.17,-3.20,-5.33),(6.18,-3.41,-5.65),(5.97,-3.37,-5.79)],.025,'rubber','diver',10)
    for side in (-1,1):
        x=5.8+side*.22
        tube('geo_diver_leg',[(x,-3.48,-4.84),(x+side*.09,-3.67,-4.40),(x+side*.12,-3.69,-4.02)],.14,'ochre','diver',16)
        ring('geo_diver_knee',(x+side*.09,-3.67,-4.4),.155,.05,'fresh','diver',axis=(0,0,1))
        box('geo_diver_boot',(x+side*.12,-3.67,-3.88),(.29,.32,.35),'rubber','diver')
        tube('geo_diver_arm',[(5.8+side*.33,-3.42,-5.35),(5.8+side*.52,-3.63,-5.03),(5.8+side*.60,-3.73,-4.80)],.115,'ochre','diver',14)
        sphere('geo_diver_glove',(5.8+side*.60,-3.73,-4.76),(.23,.18,.27),'rubber')
    empty('int_body_diver01',(5.8,-3.25,-5.15),{'interaction':'observe','notLoot':True})
    LAYOUT['obstacles'].append({'name':'geo_diver','min':[4.95,-4,-6.1],'max':[6.65,-2.98,-3.65]})
    # Transfer door guides, manual wheel and latch, each visually readable close up.
    for y in (-2.48,2.48):
        box('geo_door_rail',(-2.4,y,-10.88),(9.2,.14,.18),'steel','doorframes')
    cylinder('geo_door_wheel_hub',(-2.95,-.4,-10.55),.12,.25,'fresh','doorframes',(0,0,1))
    ring('geo_door_wheel',(-2.95,-.4,-10.4),.37,.055,'ochre','doorframes',axis=(0,0,1))
    for angle in (0,math.pi*2/3,math.pi*4/3):
        tube('geo_wheel_spoke',[(-2.95,-.4,-10.4),(-2.95+.34*math.cos(angle),-.4+.34*math.sin(angle),-10.4)],.028,'steel','doorframes',8)
    # Sparse bolts and broad sediment patches. Avoid high-frequency full-floor grids.
    for side in (-1,1):
        for z in (-9,-5,-1,3,7):
            for y in (-3.3,-1.7,0,1.7,3.3):
                cylinder('geo_structural_bolt',(side*8.41,y,z),.055,.09,'fresh','fasteners',(1,0,0),6)
    rng=random.Random(3107)
    for i in range(15):
        x=rng.choice((-1,1))*rng.uniform(6.8,8.6); z=rng.uniform(-10,10)
        sphere('geo_sediment',(x,-3.978,z),(rng.uniform(.5,1.5),.04,rng.uniform(.5,1.8)),'silt','sediment',5,12)
    for i in range(3):
        x=7.7+i*.23; z=-7.5+i*.55
        sphere('geo_crab_shell',(x,-3.87,z),(.22,.14,.26),'silt','fauna',6,12)
        for side in (-1,1):
            for dz in (-.075,0,.075):
                tube('geo_crab_leg',[(x+side*.08,-3.87,z+dz),(x+side*.18,-3.86,z+dz+.03),(x+side*.21,-3.97,z+dz+.07)],.012,'silt','fauna',5)
    SCENE['detailStage']='authored static industrial props and hard-shell diver'


def finish():
    # Apply modest bevels once, then batch static groups to reduce WebGL draw calls.
    for name in sorted(BEVEL):
        o=bpy.data.objects.get(name)
        if o is None: continue
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Edge wear silhouette','BEVEL')
        mod.width=min(.028,min(o.dimensions)*.15); mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    for group,objects in GROUPS.items():
        meshes=[o for o in objects if o.type=='MESH' and o.parent is None]
        if len(meshes)<2: continue
        for o in SCENE.objects: o.select_set(False)
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        bpy.ops.object.join()
        meshes[0].name='batch_'+group
    bpy.context.view_layer.update()
    # Actual bounds, including every mesh in its final world transform.
    all_points=[three(o.matrix_world@v.co) for o in COL.objects if o.type=='MESH' for v in o.data.vertices]
    LAYOUT['meshBounds']={'min':[min(p[i] for p in all_points) for i in range(3)],'max':[max(p[i] for p in all_points) for i in range(3)]}
    LAYOUT['stats']={'objects':len(COL.objects),'meshes':sum(o.type=='MESH' for o in COL.objects),
        'polygons':sum(len(o.data.polygons) for o in COL.objects if o.type=='MESH'),'materials':len(MATS)}
    LAYOUT['buildMethod']='local Blender background process; live MCP dispatch unavailable on 2026-09-18'
    LAYOUT['limitations']=['Main hall and short corridor only; not the full first-level route or seven levels.',
        'No real-world scan assets; textures are deterministic packed PBR images.',
        'Runtime inventory and door-state integration are not implemented by this asset build.']
    export_asset('detailed')
    (EVIDENCE/'l01-build-report.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'scenes':[s.name for s in bpy.data.scenes],
        'stats':LAYOUT['stats'],'meshBounds':LAYOUT['meshBounds'],'buildMethod':LAYOUT['buildMethod']},indent=2),encoding='utf-8')
    print('DS_L01 FINISHED',json.dumps(LAYOUT['stats']))


if __name__=='__main__':
    # --factory-startup is specified by the caller; the user's live document is untouched.
    build_base()
    build_details()
    finish()

