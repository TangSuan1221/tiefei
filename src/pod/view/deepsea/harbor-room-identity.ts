import {Box3,BoxGeometry,BufferGeometry,Group,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {ExpeditionLevel} from '../../content/expedition';
import type {ExpeditionWorld} from './expedition-world';
import type {ReferenceMaterials} from './reference-materials';

/** Room-specific service equipment; reserves actual ship routes and item approaches. */
export function addHarborRoomIdentity(level:ExpeditionLevel,world:ExpeditionWorld,m:ReferenceMaterials){
 const root=new Group();root.name='harbor-room-service-equipment';world.root.add(root);
 const guideGlass=new MeshStandardMaterial({color:0xd9c59b,emissive:0xd9ad69,emissiveIntensity:.65,roughness:.38});
 const reserve:Box3[]=[],batches=new Map<MeshStandardMaterial,BufferGeometry[]>(),geometries:BufferGeometry[]=[];
 for(const edge of level.edges){const p=edge.path??[];for(let i=1;i<p.length;i++)reserve.push(new Box3().setFromPoints([new Vector3(...p[i-1]),new Vector3(...p[i])]).expandByVector(new Vector3(3,1.7,3)));}
 for(const o of world.interactables.values())if(o.userData.approach)reserve.push(new Box3().setFromPoints([o.position,new Vector3(...o.userData.approach)]).expandByVector(new Vector3(2,2,2)));
 function box(p:number[],s:number[],mat=m.steel){
  const bounds=new Box3().setFromCenterAndSize(new Vector3(...p),new Vector3(...s));if(reserve.some(v=>v.intersectsBox(bounds)))return;
  const g=new BoxGeometry(s[0],s[1],s[2]);const pos=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<pos.count;i++)uv.setXY(i,Math.abs(n.getX(i))>.5?pos.getZ(i):pos.getX(i),Math.abs(n.getY(i))>.5?pos.getZ(i):pos.getY(i));
  g.translate(p[0],p[1],p[2]);const flat=g.toNonIndexed();g.dispose();flat.clearGroups();const parts=batches.get(mat)??[];parts.push(flat);batches.set(mat,parts);world.colliders.push(bounds);
 }
 // Recessed fixtures at corridor bends provide a real destination beyond each
 // doorway. They are above the swept hull, not arrows painted on the camera.
 for(const edge of level.edges){const path=edge.path??[];
  for(let i=1;i<path.length;i++){
   if(path.length>6&&i%3!==1&&i!==path.length-1)continue;
   const p=new Vector3(...path[i-1]).lerp(new Vector3(...path[i]),.5);p.y+=3.10;
   const g=new BoxGeometry(.75,.10,.28),mesh=new Mesh(g,m.steel);mesh.position.copy(p);root.add(mesh);geometries.push(g);
   const glass=new BoxGeometry(.56,.035,.16),pane=new Mesh(glass,guideGlass);pane.position.copy(p);pane.position.y-=.07;root.add(pane);geometries.push(glass);
   world.practicalLights.push({room:edge.from,position:[p.x,p.y-.13,p.z],color:'#c8bc9f',intensity:12,range:10});
  }
 }
 for(const [index,r]of level.rooms.entries()){
  const floor=r.floorY??-3,top=floor+(r.ceiling??7),left=r.x-r.width/2,right=r.x+r.width/2;
  // Independent overhead service bays break up empty ceiling planes, safely
  // above the ship. Structural rhythm follows room function rather than colour.
  const spacing=index===1?8:index===5?6:4;
  for(let z=r.z-r.depth/2+2;z<r.z+r.depth/2-1;z+=spacing){
   for(const side of [-1,1]){
    const x=side<0?left+1.8:right-1.8;
    box([x,top-.35,z],[3,.45,1.6]);
    for(let k=0;k<5;k++)box([x-1+k*.5,top-.60,z],[.16,.14,1.3],m.rubber);
   }
  }
  if(index===2){ // C: maintenance bench, paired disconnect cabinets, cable trunk.
   for(let k=0;k<3;k++){
    const x=left+2.2,z=r.z-6+k*5;
    box([x,floor+1.1,z],[2.5,2.2,1.6],m.hull);
    box([x,floor+2.25,z],[2.8,.16,1.8]);
    box([x+.4,floor+2.6,z],[.85,.55,1.1],m.rubber);
    for(const dz of [-.55,.55])box([x+1.28,floor+1.3,z+dz],[.08,1.6,.09],m.yellow);
   }
  }
  if(index===3){ // D: side-mounted load-cell housings with compression layers.
   for(const side of [-1,1])for(let k=0;k<3;k++){
    const x=r.x+side*(r.width/2-2),z=r.z-5+k*5;
    box([x,floor+.6,z],[2,1.2,2.4],m.hull);
    for(let n=0;n<4;n++)box([x,floor+1.2+n*.13,z],[1.6,.065,2],n%2?m.rubber:m.steel);
    box([x,floor+1.8,z],[2.1,.20,2.5],m.yellow);
   }
  }
  if(index===4){ // E: conveyor rollers and trapped sealed baggage, not loot.
   for(let k=0;k<14;k++){
    const z=r.z-7+k;
    box([left+2,floor+1,z],[2.3,.18,.35]);
    if(k%4===0)box([left+2,floor+1.55,z],[1.2,.85,.72],m.rubber);
   }
   for(const x of [left+.65,left+3.35])box([x,floor+1.3,r.z],[.08,.35,15],m.yellow);
  }
  if(index===5){ // F: overhead cargo retainers create a high, layered store.
   for(const side of [-1,1])for(let k=0;k<5;k++){
    const x=r.x+side*(r.width/2-3),z=r.z-8+k*4;
    box([x,top-2,z],[3.4,2.8,2.7],m.hull);
    for(const dx of [-1.5,1.5])box([x+dx,top-2,z],[.1,3,2.85]);
   }
  }
  if(index===7){ // H: ordered archive bays, recessed trays, service desk.
   for(let k=0;k<6;k++){
    const x=right-1.8,z=r.z-14+k*5;
    box([x,floor+1.8,z],[1.4,3.6,2.8],m.hull);
    for(let n=0;n<6;n++)box([x-.73,floor+.4+n*.48,z],[.08,.30,2.4],m.rubber);
   }
  }
  if(index===8){ // I: paired pressure-service pylons, not bonus supplies.
   for(const side of [-1,1])for(let k=0;k<3;k++){
    const x=r.x+side*(r.width/2-2),z=r.z-5+k*5;
    box([x,floor+2.3,z],[1.5,4.6,1.4],m.hull);
    box([x-side*.8,floor+2.4,z],[.12,2.7,.9],m.rubber);
    for(let n=0;n<5;n++)box([x-side*.88,floor+1.3+n*.45,z],[.10,.075,.75],m.yellow);
   }
  }
 }
 for(const [material,parts]of batches){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!g)continue;geometries.push(g);const mesh=new Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 return ()=>{root.removeFromParent();geometries.forEach(g=>g.dispose());guideGlass.dispose();};
}
