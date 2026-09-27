import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ExpeditionLevel } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';
import type { ExpeditionSurfaceMaps } from './expedition-surface-maps';
import type { ExpeditionWorld } from './expedition-world';
import { pressureDisk, pressureFlange, pressureGateHardware, salvageCaseHardware } from './harbor-hardware';
import {passageEmergency} from './passage-emergency';

type V = [number, number, number];
type Volume = { x0:number;x1:number;y0:number;y1:number;z0:number;z1:number };
const volumeBox = (v:Volume) => new Box3(new Vector3(v.x0,v.y0,v.z0),new Vector3(v.x1,v.y1,v.z1));

/** Harbor-only scene. Absolute Y is shared with the driving/path content contract.
 * The shell is the boundary of a 3D union: no interior cap can seal an entrance.
 * Materials/textures supplied by callers remain caller-owned.
 */
export function createHarborWorld(level:ExpeditionLevel, materials:ReferenceMaterials, surfaceMaps?:ExpeditionSurfaceMaps):ExpeditionWorld {
  const root=new Group();root.name='harbor-world';
  const colliders:Box3[]=[],walkable:Box3[]=[];
  const interactables=new Map<string,Object3D>(),doors:ExpeditionWorld['doors']=new Map();
  const practicalLights:ExpeditionWorld['practicalLights']=[],anchors:ExpeditionWorld['anchors']=[];
  const owned:MeshStandardMaterial[]=[],geometries:BufferGeometry[]=[];
  const batches=new Map<MeshStandardMaterial,BufferGeometry[]>();
  const dressingClearance:Box3[]=[];
  for(const edge of level.edges){const path=edge.path??[];for(let i=1;i<path.length;i++)dressingClearance.push(new Box3().setFromPoints([new Vector3(...path[i-1]),new Vector3(...path[i])]).expandByVector(new Vector3(2.9,1.6,2.9)));}
  function pigment(source:MeshStandardMaterial,color:string){const m=source.clone();m.color.set(color);owned.push(m);return m;}
  const hull=pigment(materials.hull,'#727a76'),steel=pigment(materials.steel,'#424e54'),rust=pigment(materials.hull,'#855035'),deck=pigment(materials.floor,'#555c5b');
  // Caller-owned finishes retain their roughness/normal maps and calibrated strengths.
  if(surfaceMaps)Object.assign(deck,surfaceMaps);
  const ceilingSkin=pigment(hull,'#414946');
  const amber=pigment(materials.yellow,'#b77c32'),pale=pigment(materials.hull,'#aaa99c');
  const equipmentPaint=pigment(materials.hull,'#555e5b'),equipmentBand=pigment(materials.yellow,'#776748');
  const lamp=new MeshStandardMaterial({color:'#e9ceb0',emissive:'#e7b879',emissiveIntensity:2,roughness:.48});owned.push(lamp);
  const lootStrip=new MeshStandardMaterial({color:'#ead391',emissive:'#ffe2a0',emissiveIntensity:3,roughness:.45,toneMapped:false});owned.push(lootStrip);
  function shape(g:BufferGeometry,m:MeshStandardMaterial,p:V,rot:V=[0,0,0],parent?:Group,physicalUV=false){
    if(parent){geometries.push(g);const mesh=new Mesh(g,m);mesh.position.set(...p);mesh.rotation.set(...rot);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return;}
    g.applyMatrix4(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(1,1,1)));
    if(physicalUV){
      // Project after transforming, before merging: one texture repeat per metre.
      // Each box face has independent vertices, preserving hard UV seams. Matching
      // coplanar shell strips consequently share phase instead of restarting a tile.
      const positions=g.getAttribute('position'),normals=g.getAttribute('normal'),uv=g.getAttribute('uv');
      for(let i=0;i<positions.count;i++){
        const nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i);
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        if(Math.abs(ny)>=Math.abs(nx)&&Math.abs(ny)>=Math.abs(nz))uv.setXY(i,x,-Math.sign(ny)*z);
        else if(Math.abs(nx)>=Math.abs(nz))uv.setXY(i,-Math.sign(nx)*z,y);
        else uv.setXY(i,Math.sign(nz)*x,y);
      }
      uv.needsUpdate=true;
    }
    const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();
    const bucket=batches.get(m)??[];bucket.push(flat);batches.set(m,bucket);
  }
  // Substantial world-space set dressing is an obstacle, never an item return.
  // Tiny labels/lamp trims remain cosmetic; articulated props supply their own
  // bounds and explicitly opt out here (their coordinates are parent-local).
  function box(p:V,s:V,m=steel,solid?:boolean,parent?:Group,rot:V=[0,0,0]){
    const obstacle=solid??(!parent&&s.every(v=>v>=.3));
    const bounds=new Box3().setFromCenterAndSize(new Vector3(),new Vector3(...s));
    bounds.applyMatrix4(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(1,1,1)));
    // Remove misplaced decorative geometry as well as its collider: never leave
    // a visible prop that can be driven through just to keep a doorway open.
    if(solid===undefined&&obstacle&&dressingClearance.some(b=>b.intersectsBox(bounds)))return;
    shape(new BoxGeometry(...s),m,p,rot,parent,!parent&&Math.max(...s)>=2.5);if(obstacle)colliders.push(bounds);
  }
  function rounded(p:V,s:V,m=steel,rot:V=[0,0,0]){shape(new RoundedBoxGeometry(...s,2,Math.min(.09,...s.map(v=>v*.18))),m,p,rot);}
  function rod(a:V,b:V,r=.09,m=steel){const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start);const g=new CylinderGeometry(r,r,delta.length(),8);g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));shape(g,m,start.add(end).multiplyScalar(.5).toArray() as V);}
  function ring(p:V,r:number,m=amber,rot:V=[0,0,0]){shape(new TorusGeometry(r,.12,6,24),m,p,rot);}
  function light(room:string,p:V,color='#e6bb7a',intensity=14,range=11){
    // Armoured luminaires: small recessed diffuser, dark gasket, end caps and guards.
    rounded(p,[.92,.23,.43],steel);
    box([p[0],p[1]-.12,p[2]],[.73,.035,.33],materials.rubber,false);
    box([p[0],p[1]-.145,p[2]],[.64,.018,.24],lamp,false);
    for(const dx of [-.43,.43])rounded([p[0]+dx,p[1]-.01,p[2]],[.12,.27,.46],steel);
    for(const dx of [-.23,0,.23])box([p[0]+dx,p[1]-.17,p[2]],[.025,.035,.32],steel,false);
    box([p[0],p[1]+.15,p[2]],[.32,.08,.22],steel,false);
    practicalLights.push({room,position:p,color,intensity,range});
  }
  const rooms=level.rooms.map((r,i)=>{const data=r as typeof r&{elevation?:number;floorY?:number};const y=data.elevation??([0,0,0,-8,-8,-20,-8,0,-20][i]??0);const floor=data.floorY??y-3.5;return {...r,y,floor,top:floor+(r.ceiling??[7,24,8,9,6,14,16,10,12][i]??8)};});
  const byId=new Map(rooms.map(r=>[r.id,r]));
  // Presentation/interaction locations, shared by clutter reservation and meshes.
  // Keep room-centre to doorway routes clear without changing evidence IDs.
  const berthOffsets:Record<string,[number,number]>={
    'harbor.item.power':[7,4],
    'harbor.item.employee-card':[6,-5],
    'harbor.item.shortcut':[6,14],
  };
  const volumes:Volume[]=rooms.map(r=>({x0:r.x-r.width/2,x1:r.x+r.width/2,z0:r.z-r.depth/2,z1:r.z+r.depth/2,y0:r.floor,y1:r.top}));
  const paths=level.edges.map(e=>{
    const a=byId.get(e.from)!,b=byId.get(e.to)!;if(!a||!b)throw new Error(`Harbor missing edge endpoint ${e.id}`);
    const data=e as typeof e&{path?:V[]};
    const path=data.path??[[a.x,a.y,a.z],[a.x,a.y,b.z],[b.x,b.y,b.z]] as V[];
    const width=Math.max(7,e.width),height=7;
    for(let j=1;j<path.length;j++){
      const p=new Vector3(...path[j-1]),q=new Vector3(...path[j]);const steps=Math.max(1,Math.ceil(p.distanceTo(q)/2));
      for(let k=0;k<=steps;k++){const v=p.clone().lerp(q,k/steps);volumes.push({x0:v.x-width/2,x1:v.x+width/2,z0:v.z-width/2,z1:v.z+width/2,y0:v.y-height/2,y1:v.y+height/2});}
      // Guide cables follow actual elevation, so both cargo descents are legible.
      const horizontal=Math.hypot(q.x-p.x,q.z-p.z)||1;
      const cableX=(q.z-p.z)/horizontal*(width/2-.25),cableZ=-(q.x-p.x)/horizontal*(width/2-.25);
      rod([p.x+cableX,p.y-2.5,p.z+cableZ],[q.x+cableX,q.y-2.5,q.z+cableZ],.075,amber);
    }
    // The permit gate stays on the straight inlet before the bend, not across
    // a diagonal tangent where an axis-aligned door would leave a bypass gap.
    const mid=e.id==='harbor.edge.A-C'?1:Math.max(1,Math.floor(path.length/2));const p=new Vector3(...path[mid-1]),q=new Vector3(...path[mid]);
    const doorPos=p.clone().lerp(q,.5);const alongX=Math.abs(q.x-p.x)>Math.abs(q.z-p.z);
    return {e,path,width,doorPos,alongX};
  });
  walkable.push(...volumes.map(volumeBox));
  // Bent passages get continuous inner cheek panels and low guide rails. The
  // wider voxel envelope is only the outer pressure shell; these actual solids
  // define the visible curved edge and are also read by collision and sonar.
  for(const {path,e}of paths){if(path.length<=6)continue;
    const borders=path.map((p,i)=>{
      const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
      const length=Math.hypot(b[0]-a[0],b[2]-a[2])||1;
      return {p,nx:(b[2]-a[2])/length,nz:-(b[0]-a[0])/length};
    });
    for(const side of [-1,1])for(let i=1;i<borders.length;i++){
      const a=borders[i-1],b=borders[i],offset=e.width/2-.30;
      const p=new Vector3(a.p[0]+a.nx*side*offset,a.p[1],a.p[2]+a.nz*side*offset);
      const q=new Vector3(b.p[0]+b.nx*side*offset,b.p[1],b.p[2]+b.nz*side*offset);
      const dx=q.x-p.x,dz=q.z-p.z,length=Math.hypot(dx,dz),mid=p.clone().lerp(q,.5);
      if(length<.02)continue;
      box(mid.toArray() as V,[.12,7+Math.abs(q.y-p.y),length+.04],hull,true,undefined,[0,Math.atan2(dx,dz),0]);
      rod([p.x-side*a.nx*.12,p.y-2.15,p.z-side*a.nz*.12],[q.x-side*b.nx*.12,q.y-2.15,q.z-side*b.nz*.12],.055,amber);
      if(i%3===1)rod([p.x,p.y-2.8,p.z],[p.x,p.y+2.9,p.z],.09,steel);
    }
  }
  // Coordinate-compressed volumetric union. All boundaries are outside free space.
  const axes=[['x0','x1'],['y0','y1'],['z0','z1']] as const;
  const coords=axes.map(([a,b])=>[...new Set(volumes.flatMap(v=>[v[a],v[b]]))].sort((a,b)=>a-b));
  const [xs,ys,zs]=coords;const nx=xs.length-1,ny=ys.length-1,nz=zs.length-1;
  const cells=new Uint8Array(nx*ny*nz),idx=(x:number,y:number,z:number)=>(x*ny+y)*nz+z;
  for(const v of volumes){const x0=xs.indexOf(v.x0),x1=xs.indexOf(v.x1),y0=ys.indexOf(v.y0),y1=ys.indexOf(v.y1),z0=zs.indexOf(v.z0),z1=zs.indexOf(v.z1);for(let x=x0;x<x1;x++)for(let y=y0;y<y1;y++)for(let z=z0;z<z1;z++)cells[idx(x,y,z)]=1;}
  const inside=(x:number,y:number,z:number)=>x>=0&&y>=0&&z>=0&&x<nx&&y<ny&&z<nz&&cells[idx(x,y,z)]===1;
  // Merge face strips along Z (X for horizontal Z walls), reducing collider count.
  for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3;const n=[nx,ny,nz];
    for(let a=0;a<n[axis];a++)for(let b=0;b<n[u];b++)for(const sign of [-1,1]){
      let start=-1;for(let c=0;c<=n[v];c++){const at=[0,0,0];at[axis]=a;at[u]=b;at[v]=c;const next=[...at];next[axis]+=sign;
        const exposed=c<n[v]&&inside(at[0],at[1],at[2])&&!inside(next[0],next[1],next[2]);
        if(exposed&&start<0)start=c;
        if(!exposed&&start>=0){const p:V=[0,0,0],s:V=[0,0,0];p[axis]=coords[axis][a+(sign>0?1:0)]+sign*.10;s[axis]=.2;p[u]=(coords[u][b]+coords[u][b+1])/2;s[u]=coords[u][b+1]-coords[u][b];p[v]=(coords[v][start]+coords[v][c])/2;s[v]=coords[v][c]-coords[v][start];box(p,s,axis===1?(sign<0?deck:ceilingSkin):hull,true);start=-1;}
      }
    }
  }
  const movingDoors:Array<{id:string;group:Group;y:number;amount:number}>=[];
  // Fabricated chamfered pressure ribs, with an open bore rather than a scenic
  // black rectangle. The bevels only occupy the unused upper/lower corners.
  function portalRib(center:V,yaw:number,depth:number,finish:MeshStandardMaterial){
    const outline:Array<[number,number]>=[[-3.85,-2.70],[-2.90,-3.68],[2.90,-3.68],[3.85,-2.70],[3.85,2.70],[2.90,3.68],[-2.90,3.68],[-3.85,2.70]];
    const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw);
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];
      const pos=new Vector3((a[0]+b[0])/2,(a[1]+b[1])/2,0).applyQuaternion(q).add(new Vector3(...center));
      const orientation=q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.atan2(b[1]-a[1],b[0]-a[0])));
      const rotation=new Euler().setFromQuaternion(orientation);
      box(pos.toArray() as V,[Math.hypot(b[0]-a[0],b[1]-a[1])+.12,.36,depth],finish,true,undefined,[rotation.x,rotation.y,rotation.z]);
    }
  }
  // Inspection airlock: deep paired ribs. Maintenance bay: offset service collar,
  // visually unlike the circular powered leaf at A-B. Existing route stays intact.
  for(const z of [19.65,20.65])portalRib([11,0,z],0,.48,steel);
  portalRib([18,0,29.45],0,.48,steel);
  for(const x of [21.65,22.55])portalRib([x,0,35],Math.PI/2,.48,steel);
  for(const x of [7.15,14.85])rod([x,2.35,19.65],[x,2.35,20.65],.12,steel);
  const gateIndicators:Array<{id:string;material:MeshStandardMaterial;open:boolean}>=[];
  const emergencyDoors=new Map<string,ReturnType<typeof passageEmergency>>();
  const seamLight=new MeshStandardMaterial({color:'#77d8d2',emissive:'#60dcd4',emissiveIntensity:2.1,roughness:.38});owned.push(seamLight);
  for(const {e,doorPos:p,alongX,width} of paths){
    // Open connections have no arbitrary door. Locked connections use persistent IDs.
    if(e.id==='harbor.edge.A-B')p.x=22;
    const emergency=passageEmergency(width,6.8);emergency.root.position.copy(p);emergency.root.rotation.y=alongX?Math.PI/2:0;root.add(emergency.root);emergencyDoors.set(e.id,emergency);
    if(!e.lock&&!e.requires?.length){emergency.update(true);continue;}
    const group=new Group();group.name=`harbor-door.${e.id}`;group.userData.doorId=e.id;group.position.copy(p);root.add(group);
    const size:V=alongX?[.32,6.8,width]:[width,6.8,.32];box([0,0,0],size,steel,false,group);
    // Both approaches receive the same pressure-door assembly. The original
    // A-B gate was dressed only from A; every other gate was just a flat box.
    for(const side of [-1,1]){
      const face=new Group();face.name='pressure-door-reference-face';face.rotation.y=(alongX?Math.PI/2:0)+(side<0?Math.PI:0);group.add(face);
      const sx=Math.min(width-.2,6.6)/6.6;face.scale.x=sx;
      if(e.id!=='harbor.edge.A-B'||side===1){
        shape(pressureDisk(3.25,.38),equipmentPaint,[0,0,.28],[Math.PI/2,0,0],face);
        pressureGateHardware(face,shape,{steel,paint:equipmentPaint,rubber:materials.rubber,accent:equipmentBand});
        for(const radius of [3.02,3.25])shape(new TorusGeometry(radius,.065,8,64),steel,[0,0,.53],[0,0,0],face);
      }
      // Recessed centre seam sits behind the real lock hardware, not at the
      // outside edges of a blank rectangular leaf.
      box([0,0,.48],[.13,6.2,.08],materials.rubber,false,face);
      for(const y of [-2.42,-.82,.82,2.42])box([0,y,.535],[.065,1.38,.025],seamLight,false,face);
      const panel=new Group();panel.position.set(2.68,.30,.67);face.add(panel);
      box([0,0,0],[.42,1.25,.25],steel,false,panel);
      const status=new MeshStandardMaterial({color:'#bd3020',emissive:'#ef3020',emissiveIntensity:1.2});owned.push(status);gateIndicators.push({id:e.id,material:status,open:false});
      box([0,.33,.14],[.20,.22,.035],status,false,panel);
      for(const y of [-.10,-.38])shape(new CylinderGeometry(.085,.085,.045,12),equipmentBand,[0,y,.15],[Math.PI/2,0,0],panel);
      for(const y of [-2.25,2.25])box([2.8,y,.6],[.35,.55,.42],steel,false,face);
    }
    if(e.id==='harbor.edge.A-B'){
      // Dress the actual powered gate, not a disconnected scenic door.
      const face=new Group();face.rotation.y=-Math.PI/2;group.add(face);
      shape(pressureDisk(3.32,.28),pale,[0,0,.26],[Math.PI/2,0,0],face);
      for(const radius of [2.9,3.16])shape(new TorusGeometry(radius,.065,8,64),steel,[0,0,.44],[0,0,0],face);
      box([0,0,.43],[.055,6.4,.04],materials.rubber,false,face);
      shape(new CylinderGeometry(.58,.58,.22,32),steel,[0,0,.52],[Math.PI/2,0,0],face);
      for(const y of [-1.55,1.55]){
        box([.85,y,.63],[3.5,.28,.24],steel,false,face);
        for(const x of [-.75,2.35])shape(new CylinderGeometry(.25,.25,.18,16),rust,[x,y,.80],[Math.PI/2,0,0],face);
        box([2.65,y,.44],[.34,.85,.65],steel,false,face);
      }
      for(let j=0;j<32;j++){const a=j*Math.PI/16;shape(new CylinderGeometry(.065,.065,.09,6),steel,[Math.cos(a)*3.04,Math.sin(a)*3.04,.52],[Math.PI/2,0,0],face);}
      pressureGateHardware(face,shape,{steel,paint:equipmentPaint,rubber:materials.rubber,accent:equipmentBand});
      // Recessed light guide on the moving leaf, not another illuminating fixture.
      box([0,-2.16,.50],[.105,.72,.075],steel,false,face);
      box([0,-2.16,.542],[.061,.62,.014],materials.rubber,false,face);
      box([0,-2.16,.552],[.022,.52,.010],lootStrip,false,face);
      // Fixed status module beyond the portal's lateral bounds. Only the lens
      // changes colour; its casing stays attached to the bulkhead as the gate lifts.
      const panel=new Group();panel.name='harbor.gate.A-B.status';
      panel.position.set(p.x-.36,p.y+.25,p.z+4.12);panel.rotation.y=-Math.PI/2;root.add(panel);
      shape(new RoundedBoxGeometry(.38,1.04,.18,2,.035),steel,[0,0,0],[0,0,0],panel);
      box([0,0,.096],[.22,.78,.025],materials.rubber,false,panel);
      const indicator=new MeshStandardMaterial({color:'#76241b',emissive:'#bd3020',emissiveIntensity:.65,roughness:.55});
      owned.push(indicator);gateIndicators.push({id:e.id,material:indicator,open:false});
      box([0,0,.111],[.09,.60,.012],indicator,false,panel);
      for(const y of [-.19,.19])box([0,y,.127],[.20,.028,.025],steel,false,panel);
      for(const y of [-.44,.44])shape(new CylinderGeometry(.031,.031,.025,6),equipmentBand,[0,y,.105],[Math.PI/2,0,0],panel);
      panel.updateMatrixWorld(true);colliders.push(new Box3().setFromObject(panel));
      shape(pressureFlange(3.34,3.86,.32),steel,[p.x-.30,p.y,p.z],[0,Math.PI/2,0]);
      shape(pressureFlange(3.32,3.47,.09),pale,[p.x-.49,p.y,p.z],[0,Math.PI/2,0]);
      // Fixed collar studs sit outside the clear aperture, not on a fake scenic gate.
      for(let k=0;k<24;k++){
        const a=k*Math.PI/12;
        shape(new CylinderGeometry(.08,.08,.12,6),steel,[p.x-.44,p.y+Math.sin(a)*3.60,p.z+Math.cos(a)*3.60],[0,0,Math.PI/2]);
      }
      light('harbor.room.A',[p.x-1,2.8,p.z+3.1],'#db9045',18,12);
    }
    for(const k of [-1,1])box(alongX?[.19,k*2.6,0]:[0,k*2.6,.19],alongX?[.08,.18,width-.3]:[width-.3,.18,.08],amber,false,group);
    doors.set(e.id,{mesh:group,bounds:new Box3().setFromCenterAndSize(p,new Vector3(...size))});movingDoors.push({id:e.id,group,y:p.y,amount:0});
  }
  // Peripheral facilities: keep the center and connection corridors unobstructed.
  for(const [i,r] of rooms.entries()){
    const left=r.x-r.width/2+1.15,right=r.x+r.width/2-1.15;
    for(let z=r.z-r.depth/2+2;i!==0&&z<r.z+r.depth/2-1;z+=4){
      for(const x of [left,right]){box([x,r.floor+1.4,z],[.42,2.8,.4],steel);box([x,r.floor+.25,z],[1.05,.4,1.5],rust);rod([x,r.top-.7,z],[x,r.top-.7,Math.min(z+4,r.z+r.depth/2-1)],.14,steel);}
    }
    for(const sign of [-1,1]){const x=r.x+sign*(r.width/2-1.4);light(r.id,[x,r.y+1,r.z-2],i===2?'#edc48e':'#c4c9c2',i===1?24:12,i===1?18:10);}
    anchors.push({room:r.id,name:r.name,position:[r.x,r.y,r.z],view:[r.x,r.y,r.z+Math.min(5,r.depth/4)],yaw:0,pitch:0});
    if(i===0){
      // Inspection chamber: overhead ring crane, layered wall services and
      // deck rails. All furniture stays outside the swept navigation routes.
      for(const radius of [5.8,6.15])ring([r.x,r.top-.40,r.z],radius,steel,[Math.PI/2,0,0]);
      for(let j=0;j<12;j++){const a=j*Math.PI/6;box([r.x+Math.cos(a)*6,r.top-.18,r.z+Math.sin(a)*6],[.38,.40,.55],rust,false);}
      box([r.x+3,r.top-.7,r.z-4.9],[1.5,.65,.85],rust,false);
      for(let j=0;j<9;j++)shape(new TorusGeometry(.10,.035,6,12),steel,[r.x+3,r.top-1.1-j*.12,r.z-4.9],[0,j%2*Math.PI/2,0]);
      for(const z of [2,6,14,18]){
        box([1,.45,z],[.45,6.6,.48],steel,true);
        box([1.35,-2.65,z],[1.1,.4,1.1],rust,true);
      }
      for(let j=0;j<5;j++){
        rod([1.1,2+j*.23,1],[1.1,2+j*.23,18.4],.085,j===0?amber:steel);
        rod([1.1,2+j*.23,18.4],[6.7,2+j*.23,18.4],.085,j===0?amber:steel);
      }
      // The C-branch opening is a real passage, framed rather than covered.
      for(const x of [7.2,14.8]){box([x,.25,19.5],[.30,6.5,.6],steel,true);rod([x,.2,18.95],[x,2.8,18.95],.10,amber);}
      box([11,3.15,19.5],[7.9,.35,.65],steel,false);
      light(r.id,[9.3,2.9,18.8],'#b5c9d7',18,13);
      light(r.id,[17,3,10],'#c5d0d8',20,17);
      for(const z of [4.8,15.2]){
        box([21.65,.35,z],[.38,6.6,.52],steel,true);
        for(let k=0;k<3;k++)rod([21.4-k*.18,-2.4,z],[21.4-k*.18,2.9,z],.075,k===0?amber:steel);
        for(const y of [-2,-.5,1,2.5])box([21.18,y,z],[.65,.10,.7],rust,false);
      }
      for(let j=0;j<4;j++){
        rod([21.65,2.7+j*.2,.8],[21.65,2.7+j*.2,6],.065,steel);
        rod([21.65,2.7+j*.2,14],[21.65,2.7+j*.2,19],.065,steel);
      }
      // Inset rail seams and drain strips guide the eye toward the powered gate.
      for(const z of [7.1,12.9])box([15,-2.97,z],[14,.045,.12],steel,false);
      for(let x=4;x<22;x+=2){box([x,-2.96,5],[1.8,.045,.7],steel,false);for(let k=0;k<8;k++)box([x-.75+k*.2,-2.93,5],[.055,.035,.65],materials.rubber,false);}
      for(const z of [3,6]){
        box([2.6,-1.2,z],[1.3,3.3,.8],pale,true);
        for(let j=0;j<4;j++){box([2.6,-2.2+j*.65,z+.43],[1.05,.46,.08],steel,false);box([2.3,-2.2+j*.65,z+.5],[.09,.12,.05],amber,false);}
      }
      for(let j=0;j<18;j++){const z=1.5+j*.84;box([3+(j%3)*.32,-2.83,z],[.25,.18,.38],j%2?steel:rust,false,undefined,[0,j*.7,.12]);}
    }
    if(i===2){for(let k=0;k<4;k++){box([left+1,r.floor+1.6,r.z-6+k*3],[1.5,3,2],steel);for(let n=0;n<3;n++)box([left+1.8,r.floor+1+n*.6,r.z-6+k*3],[.1,.22,1.4],amber);}ring([right-1,r.y,r.z],1.3,materials.rubber,[0,Math.PI/2,0]);}
    if(i===3){for(const x of [left+2,right-2]){box([x,r.floor+.35,r.z],[1.2,.6,r.depth-3],amber);rod([x,r.floor+1.3,r.z-6],[x,r.floor+1.3,r.z+6],.09,steel);}}
    if(i===4){for(let k=0;k<12;k++){const x=k%2?left+1:right-1,z=r.z-7+Math.floor(k/2)*2.5;box([x,r.floor+.35,z],[.85,.65,.6],k%3?materials.rubber:rust);box([x,r.floor+.73,z],[.45,.09,.12],steel);}}
    if(i===5){for(const x of [left+2,right-2])for(let k=0;k<4;k++){const z=r.z-7+k*4;for(const y of [r.floor+.3,r.floor+2.6,r.floor+5]){box([x,y,z],[3,.18,2.7],steel);box([x,y+.6,z],[1.5,1,1.3],rust);}for(const dz of [-1.3,1.3])rod([x-1.4,r.floor,z+dz],[x-1.4,r.floor+6,z+dz],.12,steel);}}
    if(i===6){const doorwayZ=r.z+r.depth/2-.3;for(const side of [-1,1]){const x=r.x+side*4.35;rounded([x,r.y,doorwayZ],[.65,6.4,1.1],steel);rounded([x-side*.24,r.y,doorwayZ-.55],[.10,6,.14],materials.rubber);rod([x+side*.45,r.y-2.8,doorwayZ],[x+side*.45,r.y+3.3,doorwayZ],.11,steel);rounded([x,r.y+2.4,doorwayZ],[1,.55,1.25],rust);}rounded([r.x,r.y+3.4,doorwayZ],[9.3,.6,1.1],steel);}
    if(i===7){for(let k=0;k<6;k++){box([left+1,r.floor+1.6,r.z-12+k*4],[1.5,3.2,2.5],steel);for(let n=0;n<5;n++)box([left+1.8,r.floor+.4+n*.5,r.z-12+k*4],[.1,.07,2.2],pale);}box([right-2,r.floor+1.1,r.z],[2,2,7],rust);}
    if(i===8)box([r.x,r.floor+.04,r.z+5],[8,.06,1],amber);
  }
  // Wall-mounted, room-specific harbor equipment. Reserve every 3D passage
  // and interaction approach before dressing a wall, including its door mouths.
  const protectedVolumes=volumes.slice(rooms.length).map(volumeBox);
  for(const item of level.items){const r=byId.get(item.room),offset=berthOffsets[item.id]??[item.x,item.z];if(r)protectedVolumes.push(new Box3().setFromCenterAndSize(new Vector3(r.x+offset[0],r.y,r.z+offset[1]),new Vector3(7,5,13)));}
  for(const [i,r]of rooms.entries()){
    for(const side of [-1,1])for(const axis of ['x','z'] as const){
      const length=axis==='x'?r.depth:r.width;
      const wall=axis==='x'?r.x+side*r.width/2:r.z+side*r.depth/2;
      const start=(axis==='x'?r.z:r.x)-length/2;
      const point=(t:number,y:number,inset:number):V=>axis==='x'?[wall-side*inset,y,t]:[t,y,wall-side*inset];
      const size=(w:number,h:number,d:number):V=>axis==='x'?[d,h,w]:[w,h,d];
      for(let t=start+2;t<start+length-1;t+=3.5){
        const p=point(t,r.floor+(r.top-r.floor)/2,.25);
        const envelope=new Box3().setFromCenterAndSize(new Vector3(...p),new Vector3(...size(3.3,r.top-r.floor,1.6)));
        if(protectedVolumes.some(b=>b.intersectsBox(envelope)))continue;
        box(p,size(.14,r.top-r.floor,.28),steel,true);
        // Recessed access plates break large wall fields without stealing navigation volume.
        for(let panelY=r.floor+1.65;panelY<r.top-1;panelY+=3.2){
          box(point(t,panelY,.13),size(2.9,2.75,.055),ceilingSkin,false);
          for(const dt of [-1.38,1.38]){
            box(point(t+dt,panelY,.18),size(.045,2.65,.055),steel,false);
            for(const dy of [-1.20,1.20])box(point(t+dt,panelY+dy,.23),size(.075,.075,.05),pale,false);
          }
          box(point(t+.86,panelY-.93,.22),size(.3,.10,.06),materials.rubber,false);
        }
        for(let yy=r.floor+1;yy<r.top-.3;yy+=2){
          box(point(t,yy,.18),size(3.3,.08,.12),steel);
          for(const dt of [-1.4,1.4])box(point(t+dt,yy,.27),size(.09,.09,.09),amber);
        }
        // Cable trays at low level and at the roof, with individual conductors.
        for(const yy of [r.floor+.6,r.top-.6])for(let c=0;c<3;c++)rod(point(t-1.5,yy+c*.11,.48),point(t+1.5,yy+c*.11,.48),.04,c===1?amber:materials.rubber);
        const y=r.floor+1.7;
        if(i===2||i===7){
          // Open service panels with relay banks; archives use narrow drawers.
          box(point(t,y,.5),size(2.5,2.8,.45),steel,true);
          for(let n=0;n<5;n++){
            box(point(t,y-1+n*.48,.8),size(2.15,.32,.18),i===7?pale:materials.rubber);
            box(point(t+.6,y-1+n*.48,.92),size(.4,.06,.06),amber);
          }
          rod(point(t-.8,y+1.2,.9),point(t-1,y-.8,.95),.06,materials.rubber);
        }else if(i===5){
          // Boarding luggage shelving versus cargo restraints, never generic cubes.
          for(const dt of [-1.2,1.2])rod(point(t+dt,r.floor,.9),point(t+dt,r.floor+3.6,.9),.085,steel);
          for(let n=0;n<3;n++){
            box(point(t,r.floor+.3+n*1.1,.7),size(2.5,.12,1.25),steel,true);
            box(point(t-.35,r.floor+.65+n*1.1,.8),size(1.1,.55,.8),n%2?rust:materials.rubber,true);
            box(point(t-.35,r.floor+.96+n*1.1,.8),size(.4,.055,.2),pale);
          }
          rod(point(t-1.1,r.floor+.3,1.3),point(t+1,r.floor+3.4,1.3),.05,amber);
        }
      }
    }
    // Survey views follow the onward route, with the working set in peripheral view.
    if(i!==1){const exits:Record<number,V>={0:[11,0,25],2:[22,0,35],3:[60,-8,61],4:[94,-8,63],5:[77,-17,79],6:[113,-12,78],7:[113,-3,44],8:[113,-20,99]};const target=new Vector3(...exits[i]),view:V=[r.x,r.y,r.z];const d=target.clone().sub(new Vector3(...view));const anchor=anchors.find(a=>a.room===r.id);if(anchor){anchor.view=view;anchor.position=target.toArray() as V;anchor.yaw=Math.atan2(-d.x,-d.z);anchor.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));}}
  }
  // D: load-cell supports under a working weighing deck, with a service bench.
  const weighing=rooms[3];if(weighing){const x=weighing.x-weighing.width/2+2,y=weighing.floor,z=weighing.z;
    rounded([x,y+.75,z],[2.6,.18,7],steel);
    for(const dz of [-2.5,2.5])for(const dx of [-.85,.85]){rounded([x+dx,y+.14,z+dz],[.5,.18,.6],rust);rod([x+dx,y+.2,z+dz],[x+dx,y+.65,z+dz],.12,steel);rounded([x+dx,y+.43,z+dz],[.3,.18,.35],pale);rod([x+dx,y+.36,z+dz],[x-1.1,y+.36,z+3.5],.025,materials.rubber);}
    rounded([x,y+1.15,z+5],[2.3,.12,1.1],steel);for(const dx of [-.9,.9])rod([x+dx,y,z+5],[x+dx,y+1.1,z+5],.07,steel);
    rounded([x-.4,y+1.35,z+5],[.65,.3,.42],rust);rod([x+.2,y+1.25,z+4.8],[x+.8,y+1.25,z+5.1],.045,pale);
  }
  // I: each pressure bottle has feet, intake/outlet and a shared terminating manifold.
  const prep=rooms[8];if(prep){for(const side of [-1,1]){const y=prep.floor,z=prep.z-prep.depth/2+1.6;
    for(let k=0;k<3;k++){const x=prep.x+side*(5.6+k*1.8);
      shape(new CylinderGeometry(.58,.58,3.8,16),pale,[x,y+2.1,z]);
      for(const yy of [y+.6,y+3.5])ring([x,yy,z],.61,steel,[Math.PI/2,0,0]);
      for(const dx of [-.45,.45])rounded([x+dx,y+.16,z],[.22,.32,.65],steel);
      rod([x,y+4.1,z],[x,y+4.6,z],.08,steel);rod([x,y+4.6,z],[x+side*.9,y+4.6,z],.08,steel);
      rod([x,y+.6,z],[x+side*.9,y+.6,z],.08,steel);rod([x+side*.9,y+.6,z],[x+side*.9,y+4.6,z],.08,steel);
      rod([x,y+3.2,z],[x-side*.75,y+3.2,z],.04,steel);
      shape(new CylinderGeometry(.20,.20,.1,16),pale,[x-side*.8,y+3.2,z],[0,0,Math.PI/2]);
      rod([x-side*.87,y+3.2,z],[x-side*.87,y+3.32,z+.08],.012,materials.rubber);
      rod([x,y+4.25,z],[x,y+4.25,z+.35],.035,steel);rod([x-.16,y+4.25,z+.35],[x+.16,y+4.25,z+.35],.025,amber);
    }
    rod([prep.x+side*10,y+4.6,z],[prep.x+side*4.3,y+4.6,z],.10,steel);
    rod([prep.x+side*4.3,y+4.6,z],[prep.x+side*4.3,prep.y+4.2,z],.10,steel);
    rod([prep.x+side*4.3,prep.y+4.2,z],[prep.x,prep.y+4.2,z],.10,steel);
    light(prep.id,[prep.x+side*6.5,prep.y+2,z+1],'#d5c5a8',28,15);
  }
    // Central service head sits above the clear entrance; hoses terminate in
    // side quick-connect sockets rather than dangling into the boat envelope.
    const z=prep.z-prep.depth/2+1.6;
    shape(new CylinderGeometry(.65,.65,2.3,20),steel,[prep.x,prep.y+4.2,z],[0,0,Math.PI/2]);
    rounded([prep.x,prep.y+4.2,z+.6],[1.9,.85,.14],pale);
    for(const dx of [-.5,.5]){shape(new CylinderGeometry(.23,.23,.1,16),materials.rubber,[prep.x+dx,prep.y+4.2,z+.72],[Math.PI/2,0,0]);rod([prep.x+dx,prep.y+4.2,z+.8],[prep.x+dx+.10,prep.y+4.30,z+.8],.012,amber);}
    const anchor=anchors.find(a=>a.room===prep.id);if(anchor){anchor.view=[prep.x,prep.y,prep.z+3];anchor.position=[prep.x,prep.y+1,z];anchor.yaw=0;anchor.pitch=Math.atan2(1,prep.z+3-z);anchor.name='准备坞·供能门架与双侧瓶组';}
  }
  const lockWell=rooms[6];if(lockWell){const z=lockWell.z+lockWell.depth/2-.5;
    for(const side of [-1,1])for(let k=0;k<3;k++){const x=lockWell.x+side*4.8,y=lockWell.y-2+k*2;
      shape(new CylinderGeometry(.24,.24,.65,12),steel,[x,y,z],[0,0,Math.PI/2]);rod([x,y,z],[x-side*.4,y,z],.10,pale);
      rounded([x+side*.3,y,z],[.35,.65,.8],rust);
    }
    for(const side of [-1,1])for(let k=0;k<4;k++){const x=lockWell.x+side*6.2,y=lockWell.y-2+k*2;
      box([x,y,z-.3],[2.1,.07,.05],pale);for(let tick=0;tick<k+1;tick++)box([x-.7+tick*.3,y+.17,z-.31],[.07,.2,.06],amber);
    }
  }
  // A: one recessed pressure-regulation bank, not a repeated valve wallpaper.
  const airlock=rooms[0];if(airlock){const x=airlock.x-airlock.width/2+1.2,z=airlock.z+2,y=airlock.floor;
    rounded([x,y+2,z],[1.2,3.7,6],materials.rubber);
    for(let k=0;k<3;k++){const zz=z-2+k*2;rod([x+.45,y+.7,zz],[x+.45,y+3.2,zz],.46,pale);for(const yy of [y+.7,y+3.2]){shape(new SphereGeometry(.46,12,8),pale,[x+.45,yy,zz]);rod([x+.45,yy,zz],[x+1.1,yy,zz],.11,steel);}rounded([x+1.05,y+1.7,zz],[.15,.7,.45],steel);}
    for(let k=0;k<4;k++)rod([x+.6,y+.35+k*.13,z-4],[x+.6,y+.35+k*.13,airlock.z+8],.055,k===0?amber:materials.rubber);
    // Thick jambs and a lintel leave the seven-metre powered passage unobstructed.
    for(const side of [-1,1])rounded([airlock.x+side*4.2,airlock.y,airlock.z+9],[.65,5.8,1.2],steel);
    rounded([airlock.x,airlock.y+3.1,airlock.z+9],[9,.35,1.2],steel);
  }
  // E: abandoned baggage retrieval; rollers and overturned seats replace valves.
  const boarding=rooms[4];if(boarding){const x=boarding.x-boarding.width/2+1.6,y=boarding.floor,z=boarding.z;
    rounded([x,y+.65,z],[1.8,.5,12],steel);
    for(let k=0;k<24;k++)rod([x-.72,y+.96,z-5.7+k*.48],[x+.72,y+.96,z-5.7+k*.48],.085,pale);
    for(const dz of [-4,0,3]){rounded([x,y+1.4,z+dz],[1.15,.7,1.45],dz===0?rust:materials.rubber,[0,.18,0]);rounded([x,y+1.8,z+dz],[.35,.08,.18],steel);}
    // Shattered partition represented by disconnected panes and bent mullions.
    for(const dz of [-5,0,5])rod([x-.7,y+1,z+dz],[x-.7,y+4.4,z+dz+.3],.07,steel);
    for(const dz of [-3.5,2.6])rounded([x-.7,y+3.1,z+dz],[.08,1.5,2.2],materials.glass,[.1,0,.06]);
    const sx=boarding.x+boarding.width/2-1.8;
    for(let k=0;k<3;k++){const zz=z-5+k*2;rounded([sx,y+.5,zz],[.9,.15,1],steel,[0,0,.5]);rounded([sx+.3,y+.9,zz],[.18,1,.95],pale,[0,0,.5]);rod([sx-.4,y+.15,zz-.4],[sx+.4,y+.5,zz-.4],.045,steel);}
  }
  // A lost dock worker, recognisably human, rests beside E's luggage strip.
  // No creature anatomy, movement, or new interactable competing with the card.
  const luggage=rooms[4];if(luggage){const p:V=[luggage.x+luggage.width/2-2.1,luggage.floor+.32,luggage.z-5];
    const body=new SphereGeometry(1,12,8);body.scale(.30,.22,.58);shape(body,materials.cloth,p,[0,0,.1]);
    const head=new SphereGeometry(.23,12,8);shape(head,pale,[p[0],p[1]+.03,p[2]-.72]);
    for(const side of [-1,1]){rod([p[0]+side*.15,p[1],p[2]+.35],[p[0]+side*.22,p[1]-.02,p[2]+1.12],.13,materials.cloth);rod([p[0]+side*.28,p[1],p[2]-.25],[p[0]+side*.44,p[1]-.08,p[2]+.34],.10,materials.cloth);}
  }
  // One unmistakable inverted lifeboat, suspended above the navigable harbor.
  const harbor=rooms[1];if(harbor){const {x,z,top}=harbor;const hero=new Group();hero.name='harbor.asset.rescue-pod';hero.userData.assetId='harbor.asset.rescue-pod';hero.userData.guid='harbor-lifeboat-01';hero.position.set(x,Math.max(harbor.y+6,top-10),z);hero.rotation.z=Math.PI+.13;root.add(hero);
    // Harbor wall ribs, gantry galleries and service bundles live above the boat
    // envelope or in the perimeter strip, never across a passage mouth.
    for(const side of [-1,1]){
      const wx=x+side*(harbor.width/2-.45);
      for(let zz=z-harbor.depth/2+2;zz<z+harbor.depth/2;zz+=4){
        box([wx,harbor.floor+(top-harbor.floor)/2,zz],[.34,top-harbor.floor,.22],steel);
        for(let yy=harbor.floor+4;yy<top;yy+=4){
          box([wx-side*.14,yy,zz+1.7],[.15,.16,3.4],rust);
          box([wx-side*.25,yy+.35,zz],[.16,.6,.7],steel);
        }
      }
      for(const yy of [harbor.y+6,harbor.y+14]){
        box([wx-side*1.1,yy,z],[2.2,.22,harbor.depth-3],steel);
        rod([wx-side*2.1,yy+1.2,z-18],[wx-side*2.1,yy+1.2,z+18],.075,amber);
        rod([wx-side*2.1,yy+.6,z-18],[wx-side*2.1,yy+.6,z+18],.045,steel);
        for(let zz=z-18;zz<=z+18;zz+=3)rod([wx-side*2.1,yy,zz],[wx-side*2.1,yy+1.2,zz],.06,steel);
      }
      for(let cable=0;cable<5;cable++){
        const yy=harbor.y+4+cable*.19;
        rod([wx-side*.45,yy,z-18],[wx-side*.45,yy-.7,z],.065,materials.rubber);
        rod([wx-side*.45,yy-.7,z],[wx-side*.45,yy,z+18],.065,materials.rubber);
      }
      for(let zz=z-12;zz<=z+12;zz+=12){
        rod([wx-side*.6,top-1,zz],[x+side*8,top-5,zz],.14,steel);
        rod([wx-side*.6,harbor.y+7,zz],[x+side*8,top-5,zz],.08,steel);
        light(harbor.id,[wx-side*1.4,harbor.y+5.6,zz],'#c4b398',22,14);
      }
    }
    // North bulkhead panel grid: the four side entrances remain open.
    for(let xx=x-25;xx<=x+25;xx+=5){
      box([xx,harbor.floor+10,z-19.75],[.22,20,.25],steel);
      for(let yy=harbor.floor+3;yy<top-1;yy+=4)box([xx+2.4,yy,z-19.65],[4.8,.12,.15],rust);
    }
    // Torn boarding gangway, hanging well above the shared driving altitude.
    const bridgeY=harbor.y+4.7;
    box([x+10,bridgeY,z+2],[10,.25,2.6],steel);
    box([x+10,bridgeY-.35,z+2],[10,.5,.35],rust);
    for(const zz of [z+.8,z+3.2]){
      rod([x+6,bridgeY+1.2,zz],[x+15,bridgeY+1.2,zz],.07,amber);
      for(let xx=x+6;xx<=x+15;xx+=1.5)rod([xx,bridgeY,zz],[xx,bridgeY+1.2,zz],.055,steel);
    }
    for(let xx=x+5;xx<x+15;xx+=.4)box([xx,bridgeY+.14,z+2],[.08,.06,2.6],pale);
    for(let k=0;k<5;k++)rod([x+5,bridgeY,z+.8+k*.5],[x+3.7-k*.16,bridgeY-.4-k*.16,z+.8+k*.5],.06,steel);
    rod([x+15,bridgeY,z+2],[x+20,top-1,z-3],.08,steel);
    rod([x+6,bridgeY,z+2],[x+1,hero.position.y+2,z-2],.075,steel);
    // Abandoned luggage on fixed peripheral cargo pallets, not in traffic lanes.
    for(let k=0;k<10;k++){
      const px=x-22+(k%2)*1.4,pz=z-12+Math.floor(k/2)*3;
      box([px,harbor.floor+.25,pz],[1.2,.3,1.8],steel);
      box([px,harbor.floor+.8,pz],[.95,.8,1.3],k%3?materials.rubber:rust);
      for(const dx of [-.3,.3])box([px+dx,harbor.floor+.8,pz],[.065,.86,1.34],amber);
    }
    const capsule=new CylinderGeometry(2.65,2.65,10,24);capsule.scale(1,1,.70);shape(capsule,pale,[0,0,0],[Math.PI/2,0,0],hero);
    for(const end of [-1,1]){const dome=new SphereGeometry(2.65,24,12);dome.scale(1,.70,.7);shape(dome,pale,[0,0,end*5],[0,0,0],hero);shape(new TorusGeometry(1.15,.18,8,24),rust,[0,0,end*6.6],[0,0,0],hero);box([0,0,end*6.65],[1.3,1.3,.12],steel,false,hero);}
    box([0,1.9,0],[4.4,.55,10],rust,false,hero);
    // Pressure seams, bolted collars and inset glazing give the capsule scale.
    for(const zz of [-4,-2,0,2,4]){
      const seam=new TorusGeometry(2.67,.045,5,28);seam.scale(1,.70,1);shape(seam,steel,[0,0,zz],[0,0,0],hero);
      for(let k=0;k<12;k++){const angle=k*Math.PI/6;shape(new SphereGeometry(.065,6,4),steel,[Math.cos(angle)*2.69,Math.sin(angle)*1.90,zz],[0,0,0],hero);}
    }
    for(const side of [-1,1])for(const zz of [-3,0,3]){
      box([side*2.57,.15,zz],[.16,1.2,1.55],materials.rubber,false,hero);
      box([side*2.68,.15,zz],[.08,.9,1.25],materials.glass,false,hero);
      for(const yy of [-.48,.78])box([side*2.7,yy,zz],[.11,.09,1.7],steel,false,hero);
      for(const dz of [-.82,.82])box([side*2.7,.15,zz+dz],[.11,1.3,.09],steel,false,hero);
    }
    box([0,0,6.76],[1.5,1.6,.12],materials.rubber,false,hero);
    box([0,0,6.85],[1.3,1.4,.12],pale,false,hero);
    shape(new TorusGeometry(.32,.045,6,16),steel,[0,0,6.96],[0,0,0],hero);
    for(const side of [-1,1])box([side*.42,0,6.97],[.12,.65,.08],amber,false,hero);
    for(let k=-4;k<=4;k+=2){box([0,-1.82,k],[5.55,.18,.25],steel,false,hero);box([2.73,.2,k],[.12,.9,1.1],materials.glass,false,hero);}
    // Accident silhouette: one tensioned mooring and one failed attachment.
    // All endpoints are derived from the unchanged hero transform, not guessed
    // offsets: the ropes meet actual hull lugs even on the inverted capsule.
    hero.updateMatrixWorld(true);
    const lug=(side:number)=>hero.localToWorld(new Vector3(side*2.35,-.7,-3.5));
    for(const side of [-1,1]){
      const end=lug(side),mount=new Vector3(x+side*5.8,top-2.3,z-4);
      box(mount.toArray() as V,[1.1,.65,1.0],steel);
      ring([mount.x,mount.y-.45,mount.z],.36,steel);
      if(side<0){
        rod(mount.toArray() as V,end.toArray() as V,.105,steel);
        // A second parallel strand and in-line sleeve make the loaded cable legible.
        rod([mount.x+.13,mount.y,mount.z],[end.x+.13,end.y,end.z],.045,materials.rubber);
        const mid=mount.clone().lerp(end,.6);rod(mid.toArray() as V,mid.clone().lerp(end,.12).toArray() as V,.18,steel);
      }else{
        // Severed slack cable hangs from its upper anchor, never reaching the route.
        const low=new Vector3(mount.x-1.3,hero.position.y+1.3,mount.z+.9);
        rod(mount.toArray() as V,[mount.x-.25,mount.y-1.5,mount.z+.15],.105,steel);
        rod([mount.x-.25,mount.y-1.5,mount.z+.15],low.toArray() as V,.09,steel);
        for(let strand=0;strand<4;strand++)rod(low.toArray() as V,[low.x-.3+strand*.15,low.y-.45,low.z+.12*strand],.015,steel);
      }
      shape(new TorusGeometry(.22,.065,8,24),steel,[side*2.35,-.7,-3.5],[0,0,0],hero);
    }
    // Torn docking cradle remains behind/below the suspended hull, listing to
    // starboard. Two broad arms and an offset saddle read as structural failure.
    const cradleY=hero.position.y-3.15;
    box([x,cradleY,z-3.5],[8.3,.42,.8],rust,undefined,undefined,[0,0,-.16]);
    for(const side of [-1,1]){
      box([x+side*3.65,cradleY+.8-side*.45,z-3.5],[.45,2.1,.8],steel,undefined,undefined,[0,0,side<0?.14:-.32]);
      box([x+side*2.85,cradleY+1.55-side*.45,z-3.5],[1.2,.3,1.1],materials.rubber,undefined,undefined,[0,0,-.16]);
    }
    for(const dx of [-11,11]){rod([x+dx,harbor.floor,z-10],[x+dx,top-.7,z-10],.5,rust);box([x+dx,top-1,z],[1,1,harbor.depth-3],steel);}
    box([x,top-2,z-4],[25,1.2,1.5],rust);
    for(const dx of [-10,-6,-2,2,6,10]){rod([x+dx-1.5,top-2.6,z-4],[x+dx+1.5,top-1.4,z-4],.12,steel);}
    for(const dx of [-2.4,2.4]){ring([x+dx,top-3,z-4],.65,amber);box([x+dx,top-2.8,z-4],[.3,1.7,.8],steel);}
    light(harbor.id,[x-5,hero.position.y+1,z+5],'#e8bd8e',55,22);
    light(harbor.id,[x+2,hero.position.y-3,z+4],'#d6cbbc',70,18);
    const heroView:V=[x+12,harbor.y+3,z+14];
    const heroAnchor=anchors.find(v=>v.room===harbor.id);
    if(heroAnchor){heroAnchor.name='倒悬救生舱·侧面与断桥';heroAnchor.view=heroView;heroAnchor.position=hero.position.toArray() as V;heroAnchor.yaw=Math.atan2(12,14);heroAnchor.pitch=Math.atan2(hero.position.y-heroView[1],Math.hypot(12,14));hero.userData.exposureView={view:heroView,yaw:heroAnchor.yaw,pitch:heroAnchor.pitch};}
    hero.updateMatrixWorld(true);colliders.push(new Box3().setFromObject(hero));root.userData.heroGuid=hero.userData.guid;
  }
  const items:Array<{id:string;kind:string;group:Group;lid?:Group;amount:number}>=[];
  for(const item of level.items){const r=byId.get(item.room);if(!r)continue;const group=new Group();group.name=item.id;group.userData.interactionId=item.id;const data=item as typeof item&{y?:number};const offset=berthOffsets[item.id]??[item.x,item.z];group.position.set(r.x+offset[0],data.y??r.y-.7,r.z+offset[1]);root.add(group);interactables.set(item.id,group);let lid:Group|undefined;
    if(item.kind==='cache'||item.kind==='pickup'){
      lid=new Group();lid.name=`${item.id}.lid`;lid.position.set(0,.25,-.52);group.add(lid);
      salvageCaseHardware(group,lid,shape,{steel,paint:equipmentPaint,rubber:materials.rubber,accent:equipmentBand},lootStrip);
      group.userData.interactionAnchor=[0,.15,.6];
    }
    else{box([0,0,0],[1.2,1.3,.55],steel,false,group);box([0,.15,.3],[.86,.7,.08],materials.rubber,false,group);box([-.35,-.4,.32],[.18,.12,.06],lamp,false,group);group.userData.interactionAnchor=[0,0,.35];}
    // Bow remains 0.15m clear of the closed crate; target is inside 3.4m reach.
    // World-space QA positions, local interactionAnchor retained for the arm.
    const facing=group.position.z+5.7>r.z+r.depth/2-.2?-1:1;
    group.rotation.y=facing<0?Math.PI:0;
    group.userData.approach=[group.position.x,r.y,group.position.z+facing*3.2];
    group.updateMatrixWorld(true);
    group.userData.lookAt=group.localToWorld(new Vector3(...group.userData.interactionAnchor as V)).toArray();
    group.userData.approachYaw=facing<0?180:0;
    // Runtime owns item bounds and removes collected pickups from its solid list.
    items.push({id:item.id,kind:item.kind,group,lid,amount:0});
  }
  for(const [material,parts] of batches){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!g)throw new Error('Harbor geometry merge failed');geometries.push(g);const mesh=new Mesh(g,material);mesh.name=`harbor.static.${material.name||material.color.getHexString()}`;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
  const a=byId.get(level.startRoom)??rooms[0],c=rooms[2]??a;
  // Shore-power coupling silhouettes frame the first view toward C. The central
  // seven-metre aperture stays clear; no freestanding sign or screen overlay.
  for(const side of [-1,1]){
    const px=a.x+side*4.8,pz=a.z+a.depth/2-1;
    box([px,a.y,pz],[.65,5.2,1],rust,true);
    for(const yy of [-1.5,0,1.5]){ring([px,a.y+yy,pz-.6],.43,amber);box([px,a.y+yy,pz-.8],[.55,.12,.15],steel);}
    rod([px,a.y-1.9,pz],[px,a.y-1.9,c.z-7],.17,materials.rubber);
    light(a.id,[px,a.y+2.2,pz-.5],'#d6b485',20,13);
  }
  const entryView={name:'岸电缆引向维修湾',view:[level.spawn[0],a.y,level.spawn[1]] as V,yaw:Math.atan2(-(c.x-level.spawn[0]),-(c.z-level.spawn[1])),pitch:0};
  root.userData.entryView=entryView;root.userData.geometryContract={elevation:'driving-center absolute Y',floorY:'absolute Y',path:'absolute [x,y,z]',minimumPassageWidth:7};
  let last:number|undefined;
  return {root,colliders,walkable,interactables,doors,anchors,practicalLights,entryView,storyViews:[],passageViews:[],
    update(state,time){const dt=last===undefined?1:Math.min(.1,Math.max(0,time-last));last=time;const ease=1-Math.exp(-dt*6);
      for(const [id,lights] of emergencyDoors)lights.update(!doors.has(id)||state.opened.includes(id));
      for(const indicator of gateIndicators){
        const open=state.opened.includes(indicator.id);
        if(open!==indicator.open){indicator.open=open;indicator.material.color.set(open?'#b7a483':'#76241b');indicator.material.emissive.set(open?'#d4b478':'#bd3020');}
      }
      for(const d of movingDoors){d.amount+=((state.opened.includes(d.id)?1:0)-d.amount)*ease;d.group.position.y=d.y+d.amount*7.2;}
      for(const it of items){const collected=state.collected.includes(it.id);it.group.userData.collected=collected;it.group.visible=it.kind!=='pickup'||!collected;if(it.lid){it.amount+=((state.opened.includes(it.id)||collected?1:0)-it.amount)*ease;it.lid.rotation.x=-it.amount*1.3;}}
    },
    dispose(){emergencyDoors.forEach(x=>x.dispose());root.clear();geometries.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());colliders.length=walkable.length=0;interactables.clear();doors.clear();}
  };
}
