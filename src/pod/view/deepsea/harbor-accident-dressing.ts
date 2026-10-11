import {Box3,BoxGeometry,BufferGeometry,CanvasTexture,CylinderGeometry,DoubleSide,Group,Mesh,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace,TorusGeometry,Vector3,type Material} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ExpeditionLevel} from '../../content/expedition';
import type {ExpeditionWorld} from './expedition-world';
import type {ReferenceMaterials} from './reference-materials';
import {setHarborPigment} from './harbor-scanned-surfaces';

/** MET-042: thin perimeter dressing only. Never registers structural colliders. */
export function addHarborAccidentDressing(level:ExpeditionLevel,world:ExpeditionWorld,materials:ReferenceMaterials){
 const root=new Group();root.name='harbor-accident-dressing';world.root.add(root);
 const geometries=new Set<BufferGeometry>(),owned=new Set<Material>(),textures:CanvasTexture[]=[];
 const reserve:Box3[]=[];let disposed=false;
 for(const edge of level.edges){const p=edge.path??[];for(let i=1;i<p.length;i++)reserve.push(new Box3().setFromPoints([new Vector3(...p[i-1]),new Vector3(...p[i])]).expandByVector(new Vector3(3.2,2,3.2)));}
 for(const object of world.interactables.values()){const p=object.getWorldPosition(new Vector3());reserve.push(new Box3().setFromCenterAndSize(p,new Vector3(8,7,8)));}
 const placements:{x:number;y:number;z:number;yaw:number}[]=[];
 function cassette(x:number,y:number,z:number,yaw:number){
  const b=new Box3().setFromCenterAndSize(new Vector3(x,y+1.1,z),new Vector3(Math.abs(Math.sin(yaw))>.5?1.4:3.2,2.4,Math.abs(Math.sin(yaw))>.5?3.2:1.4));
  if(reserve.some(v=>v.intersectsBox(b)))return;placements.push({x,y,z,yaw});world.decorColliders.push(b);
 }
 // Deliberate compositions visible beside the two first pressure doors.
 cassette(4.6,-1.95,19.65,Math.PI);
 // The opposite side of this wall holds the mission power-item approach.
 cassette(21.65,-1.95,29.9,-Math.PI/2);
 const paper=materials.hull.clone();setHarborPigment(paper,'#8c8b74');paper.roughness=.98;paper.side=DoubleSide;owned.add(paper);
 const fragments=new Map<MeshStandardMaterial,BufferGeometry[]>();
 function batch(mesh:Mesh){mesh.updateMatrix();const raw=mesh.geometry.clone().applyMatrix4(mesh.matrix);const g=raw.index?raw.toNonIndexed():raw;if(raw!==g)raw.dispose();g.clearGroups();const mat=mesh.material as MeshStandardMaterial;const bucket=fragments.get(mat)??[];bucket.push(g);fragments.set(mat,bucket);mesh.geometry.dispose();}
 let stain:MeshStandardMaterial|undefined;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d')!;
  const gradient=c.createRadialGradient(64,64,5,64,64,62);gradient.addColorStop(0,'rgba(34,30,20,.54)');gradient.addColorStop(.5,'rgba(41,40,27,.25)');gradient.addColorStop(1,'rgba(41,40,27,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;textures.push(map);
  stain=new MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1});owned.add(stain);
 }
 for(const [index,r] of level.rooms.entries()){
  // The main rescue caisson has a separate authored composition.
  if(![3,5,7].includes(index))continue;
  const floor=r.floorY??(r.elevation??0)-3.5;
  for(const side of [index===7?1:-1])for(let k=0;k<1;k++){
   const x=r.x+side*(r.width/2-.32),z=r.z+(k?1:-1)*Math.min(6,r.depth*.28);
   const bounds=new Box3().setFromCenterAndSize(new Vector3(x-side*.45,floor+1.8,z),new Vector3(1.5,2.4,3.4));
   if(reserve.some(b=>b.intersectsBox(bounds)))continue;
   placements.push({x,y:floor+.65,z,yaw:side<0?Math.PI/2:-Math.PI/2});world.decorColliders.push(bounds);
   // Fallen paperwork and panel chips stay in a shallow strip against the wall.
   for(let n=0;n<5;n++){
    const mesh=new Mesh(new PlaneGeometry(.16+(n%3)*.1,.25+(n%2)*.13),paper);
    mesh.position.set(x-side*(.25+n*.14),floor+.025+n*.002,z-1+n*.43);mesh.rotation.set(-Math.PI/2,0,n*1.7);batch(mesh);
   }
   const chip=new Mesh(new BoxGeometry(.4,.025,.7),materials.steel);chip.position.set(x-side*.6,floor+.035,z+.6);chip.rotation.y=.43;batch(chip);
   if(stain){const s=new Mesh(new PlaneGeometry(2.4,3.7),stain);s.position.set(x-side*.6,floor+.018,z);s.rotation.x=-Math.PI/2;batch(s);}
  }
 }
 // Mid-scale service assemblies are confined to shallow wall pockets. All parts
 // are visual dressing; neither these brackets nor the loose hose seal a route.
 const panel=materials.hull.clone();setHarborPigment(panel,'#555c59');panel.roughness=.84;owned.add(panel);
 const ceramic=materials.hull.clone();setHarborPigment(ceramic,'#8c8878');ceramic.roughness=.9;owned.add(ceramic);
 function fitting(origin:Vector3,yaw:number){
  const frame=new Group();frame.position.copy(origin);frame.rotation.y=yaw;frame.updateMatrix();
  return(g:BufferGeometry,m:MeshStandardMaterial,p:[number,number,number],rot:[number,number,number]=[0,0,0])=>{
   const mesh=new Mesh(g,m);mesh.position.set(...p);mesh.rotation.set(...rot);mesh.updateMatrix();g.applyMatrix4(mesh.matrix).applyMatrix4(frame.matrix);batch(new Mesh(g,m));
  };
 }
 // Entry lock: mismatched removable panels, joint covers, exposed conduit clips.
 for(const [x,z,yaw] of [[18.1,19.72,Math.PI]]){
  const put=fitting(new Vector3(x,-.2,z),yaw);
  put(new BoxGeometry(2.5,3.5,.07),panel,[0,0,0]);
  for(const xx of [-1.27,1.27])put(new BoxGeometry(.035,3.65,.04),materials.steel,[xx,0,.06]);
  for(const yy of [-1.78,.42,1.78])put(new BoxGeometry(2.55,.035,.04),materials.steel,[0,yy,.06]);
  for(const xx of [-.9,.9])for(const yy of [-1.5,1.5])put(new CylinderGeometry(.035,.035,.025,6),materials.steel,[xx,yy,.064],[Math.PI/2,0,0]);
  put(new BoxGeometry(.72,.5,.12),ceramic,[.3,.8,.14]);
  for(let i=0;i<3;i++){
   put(new CylinderGeometry(.035,.035,2.2,8),materials.steel,[-.68+i*.17,-.1,.18]);
   for(const yy of [-.9,.6])put(new BoxGeometry(.61,.06,.22),materials.steel,[-.51,yy,.16]);
  }
 }
 // Main harbor, west wall between the two arrival apertures: an abandoned hose
 // service rack. Large silhouette, sparse fittings, no new point light or clue.
 {
  const put=fitting(new Vector3(32.28,1.1,21.5),Math.PI/2);
  put(new BoxGeometry(5.7,4.6,.09),panel,[0,1,0]);
  for(const x of [-2.82,2.82])put(new BoxGeometry(.12,4.9,.21),materials.steel,[x,1,.12]);
  for(const y of [-1.45,3.45])put(new BoxGeometry(5.8,.13,.24),materials.steel,[0,y,.12]);
  for(let i=0;i<3;i++)put(new TorusGeometry(1.14-i*.105,.047,6,56),materials.rubber,[-.8,.8,.22+i*.04]);
  for(const x of [-1.8,.2]){
   put(new BoxGeometry(.12,.6,.55),materials.steel,[x,1.58,.28]);
   put(new BoxGeometry(.38,.09,.6),materials.steel,[x,1.84,.28]);
  }
  put(new CylinderGeometry(.055,.055,2.9,10),materials.rubber,[.28,-.48,.3],[0,0,.08]);
  put(new CylinderGeometry(.09,.09,.29,10),materials.steel,[.4,-1.96,.3]);
  for(const x of [1.48,1.72,1.96])put(new CylinderGeometry(.065,.065,3.8,10),materials.steel,[x,1.25,.28]);
  for(const y of [-.25,2.8])put(new BoxGeometry(.94,.1,.42),ceramic,[1.72,y,.22]);
  // Offset plate leaves a visible dark seam and its bent edge catches the lamp.
  put(new BoxGeometry(.62,1.08,.035),ceramic,[1.75,1.1,.33],[0,.11,-.08]);
 }
 // C bay hose reel replaces the former unsupported torus. It is bolted to
 // the wall above a genuine bracket and kept shallower than the former ring.
 {
  const iron=new MeshStandardMaterial({color:'#37403b',roughness:.86,metalness:.28,normalMap:materials.steel.normalMap});owned.add(iron);
  const bearing=new MeshStandardMaterial({color:'#555b53',roughness:.56,metalness:.65,normalMap:materials.steel.normalMap});owned.add(bearing);
  const put=fitting(new Vector3(21.67,.15,40),-Math.PI/2);
  // Thin compressed seal and inset edge returns give the existing backplate
  // contact depth without enlarging the service assembly's envelope.
  put(new BoxGeometry(2.54,3.09,.022),materials.rubber,[0,-.28,.063]);
  put(new BoxGeometry(2.6,3.15,.09),iron,[0,-.28,.12]);
  put(new BoxGeometry(.36,1.22,.17),iron,[0,-2.4,.21]);
  for(const y of [-2.84,-2.0])put(new BoxGeometry(.48,.08,.21),iron,[0,y,.24]);
  for(const x of [-1.15,1.15])for(const y of [-1.6,1.1]){
   put(new CylinderGeometry(.09,.09,.012,20),bearing,[x,y,.171],[Math.PI/2,0,0]);
   put(new CylinderGeometry(.055,.055,.033,6),iron,[x,y,.193],[Math.PI/2,0,0]);
   put(new BoxGeometry(.041,.009,.003),materials.rubber,[x,y,.211]);
  }
  for(const x of [-1.276,1.276])put(new BoxGeometry(.025,3.09,.022),bearing,[x,-.28,.134]);
  for(const y of [-1.835,1.275])put(new BoxGeometry(2.53,.025,.022),iron,[0,y,.134]);
  for(const x of [-.73,.73]){
   put(new BoxGeometry(.12,1.2,.13),iron,[x,-.85,.24]);
   put(new BoxGeometry(.12,.11,.8),iron,[x,-.34,.52]);
   put(new CylinderGeometry(.045,.045,.89,8),iron,[x,-.65,.52],[-Math.PI/4,0,0]);
  }
  put(new CylinderGeometry(.28,.28,.65,16),iron,[0,0,.52],[Math.PI/2,0,0]);
  for(const depth of [.32,.76]){
   put(new TorusGeometry(1.05,.045,8,56),iron,[0,0,depth]);
   for(let i=0;i<6;i++){const angle=i*Math.PI/3;
    put(new BoxGeometry(.06,.79,.045),iron,[Math.sin(angle)*.64,Math.cos(angle)*.64,depth],[0,0,-angle]);
   }
  }
  for(const depth of [.43,.57,.68])for(const radius of [.45,.58,.71,.84,.95])put(new TorusGeometry(radius,.058,8,56),materials.rubber,[0,0,depth]);
  // Stepped bearing race, recessed seal, and removable hub cap: all remain
  // inside the old 0.88 m front extent and the original shaft diameter.
  put(new CylinderGeometry(.265,.265,.027,24),bearing,[0,0,.822],[Math.PI/2,0,0]);
  put(new TorusGeometry(.235,.014,8,32),materials.rubber,[0,0,.839]);
  put(new CylinderGeometry(.21,.21,.033,24),iron,[0,0,.849],[Math.PI/2,0,0]);
  put(new CylinderGeometry(.092,.092,.01,6),bearing,[0,0,.871],[Math.PI/2,0,0]);
  for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;
   put(new CylinderGeometry(.022,.022,.012,6),bearing,[Math.sin(a)*.156,Math.cos(a)*.156,.872],[Math.PI/2,0,0]);
  }
  put(new CylinderGeometry(.065,.065,1.14,10),materials.rubber,[.92,-.82,.62],[0,0,.10]);
  put(new CylinderGeometry(.10,.10,.25,12),iron,[.98,-1.46,.62]);
  put(new TorusGeometry(.13,.022,6,20),iron,[.98,-1.62,.62],[Math.PI/2,0,0]);
 }
 function flush(){for(const [material,parts]of fragments){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(g){geometries.add(g);const mesh=new Mesh(g,material);mesh.receiveShadow=true;mesh.castShadow=!material.transparent;root.add(mesh);}}fragments.clear();}
 root.userData.cassettePlacements=placements.map(p=>({...p}));
 flush();
 const release=()=>{geometries.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometries.clear();owned.clear();};
 if(typeof window!=='undefined'){
  // One shallow, attached failure on the outer cargo service wall. Its entire
  // envelope is x=68.5..69.5, y=1.85..4.7, z=9.75..13.05: outside the
  // x72+ rack passage and away from the central NPC/pressure-door photograph.
  root.userData.damageReady=new GLTFLoader().loadAsync('/assets/deepsea/harbor-torn-service-panel.glb').then(gltf=>{
   const sourceGeometry=new Set<BufferGeometry>(),finishes=new Map<Material,MeshStandardMaterial>();
   const transform=new Group();transform.position.set(69.25,2,11.3);transform.rotation.y=-Math.PI/2;transform.updateMatrix();gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;sourceGeometry.add(o.geometry);const original=o.material as MeshStandardMaterial;owned.add(original);
    if(!finishes.has(original)){
     const finish=original.name.includes('paint')?materials.hull.clone():original.clone();
     if(original.name.includes('paint'))setHarborPigment(finish,'#7c7765');
     finish.roughness=original.roughness;finish.emissive.set(0);owned.add(finish);finishes.set(original,finish);
    }
   });
   if(disposed){sourceGeometry.forEach(g=>g.dispose());release();return;}
   gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform.matrix);batch(new Mesh(geometry,finishes.get(o.material as Material)!));});
   sourceGeometry.forEach(g=>g.dispose());flush();root.userData.damageLoaded=true;
  }).catch(error=>{root.userData.damageError=String(error);console.warn('Harbor torn service panel:',error);});
  root.userData.ready=new GLTFLoader().loadAsync('/assets/deepsea/harbor-accident-cassette.glb').then(gltf=>{
   const sources=new Set<BufferGeometry>(),finishes=new Map<Material,MeshStandardMaterial>();
   gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;sources.add(o.geometry);const original=o.material as MeshStandardMaterial;owned.add(original);if(!finishes.has(original)){
    const finish=(original.name.includes('rubber')?materials.rubber:original.name.includes('paint')?materials.hull:materials.steel).clone();
    setHarborPigment(finish,original.color);finish.roughness=original.roughness;finish.metalness=original.metalness;owned.add(finish);finishes.set(original,finish);
   }});
   if(disposed){sources.forEach(g=>g.dispose());release();return;}
   // Bake the many small Blender parts into one mesh per finish for all copies.
   for(const p of placements){const transform=new Group();transform.position.set(p.x,p.y,p.z);transform.rotation.y=p.yaw;transform.updateMatrix();
    gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;const geo=o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform.matrix);batch(new Mesh(geo,finishes.get(o.material as Material)!));});
   }
   sources.forEach(g=>g.dispose());flush();root.userData.loaded=true;root.userData.instances=placements.length;
  }).catch(error=>{root.userData.loadError=String(error);console.warn('Harbor accident dressing:',error);});
 }
 return()=>{disposed=true;root.removeFromParent();root.clear();release();};
}

