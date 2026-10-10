import * as T from 'three';
import {setHarborPigment} from './harbor-scanned-surfaces';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {ReferenceMaterials} from './reference-materials';
import {loadHarborBlenderDressing} from './harbor-blender-dressing';
import {createHarborSurfaceDetails} from './harbor-surface-details';
import {loadHarborPowerCabinet} from './harbor-power-cabinet';
import {loadHarborControlPod} from './harbor-control-pod';
import {createHarborCaissonLayout} from './harbor-caisson-layout';
type V=[number,number,number];
/** Visual finish restricted to existing solids and inaccessible north-bank scenery. */
export function createHarborRescueDressing(parent:T.Group,m:ReferenceMaterials){
 const root=new T.Group();root.name='rescue-industrial-architecture';parent.add(root);
 const blender=loadHarborBlenderDressing(root,m);
 const controlPod=loadHarborControlPod(root,m);
 const powerCabinet=loadHarborPowerCabinet(root,m);
 const surfaces=createHarborSurfaceDetails(root,m);
 const caissons=createHarborCaissonLayout(root,m);
 const owned:T.MeshStandardMaterial[]=[],geometries:T.BufferGeometry[]=[];
 const batches=new Map<T.MeshStandardMaterial,T.BufferGeometry[]>();
 const pigment=(base:T.MeshStandardMaterial,color:string)=>{const a=base.clone();setHarborPigment(a,color);owned.push(a);return a;};
 const iron=pigment(m.steel,'#374744'),shell=pigment(m.hull,'#586b66'),edge=pigment(m.steel,'#708078'),ochre=pigment(m.yellow,'#937137'),rubber=pigment(m.rubber,'#111c1c');
 const lamp=new T.MeshStandardMaterial({color:'#e2bc7a',emissive:'#ffbd68',emissiveIntensity:1.5,roughness:.4});owned.push(lamp);
 function add(g:T.BufferGeometry,mat:T.MeshStandardMaterial,p:V,rot:V=[0,0,0]){
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rot)),new T.Vector3(1,1,1)));
  if(g.type==='BoxGeometry'){const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,(nx>.5?p.getZ(i):p.getX(i))*.5,(ny>.5?p.getZ(i):p.getY(i))*.5);}}
  const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();const bucket=batches.get(mat)??[];bucket.push(flat);batches.set(mat,bucket);
 }
 const box=(p:V,s:V,mat=iron)=>add(new T.BoxGeometry(...s),mat,p);
 function rod(a:V,b:V,r=.055,mat=iron){const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start);const g=new T.CylinderGeometry(r,r,d.length(),10);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));add(g,mat,start.add(end).multiplyScalar(.5).toArray() as V);}
 const ring=(p:V,r:number,t:number,mat=iron)=>add(new T.TorusGeometry(r,t,6,48),mat,p,[Math.PI/2,0,0]);
 const bolt=(p:V,r=.055)=>add(new T.CylinderGeometry(r,r,.045,6),edge,p,[Math.PI/2,0,0]);
 // West enclosure skin: shallow seated fittings remain on the existing wall.
 // Keep the z=8..10 animation crossing and all lower character silhouettes bare.
 const westBolt=(y:number,z:number)=>add(new T.CylinderGeometry(.041,.041,.027,6),edge,[69.347,y,z],[0,0,Math.PI/2]);
 box([69.405,5.54,8.45],[.09,.20,14.62],iron);
 box([69.348,5.60,8.45],[.036,.058,14.62],edge);
 for(const z of [2.5,6.05,13.65]){
  box([69.412,3.28,z],[.074,4.38,.20],rubber);
  box([69.367,3.28,z],[.065,4.38,.13],iron);
  for(const y of [1.25,2.65,4.05,5.30])westBolt(y,z);
  for(const y of [1.22,5.30])box([69.377,y,z],[.085,.20,.48],iron);
 }
 for(const [z,w]of [[4.25,2.72],[9.65,5.30],[14.76,1.30]]){
  box([69.431,3.20,z],[.022,3.49,w],rubber);
  box([69.411,3.20,z],[.027,3.39,w-.10],shell);
  for(const dz of [-(w-.20)/2,(w-.20)/2])for(const y of [1.61,3.2,4.79])westBolt(y,z+dz);
  box([69.373,2.82,z-.24],[.075,.056,.32],iron);
 }
 // A paired capillary bundle follows the upper shell, clear of the cage opening.
 for(const y of [5.06,5.22]){
  rod([69.376,y,2.65],[69.376,y,14.75],.027,iron);
  for(const z of [3,5.8,8.6,11.4,14.2])box([69.337,y,z],[.033,.09,.12],edge);
 }
 const sideLens=new T.MeshStandardMaterial({color:'#d3dcd5',emissive:'#c9d9d3',emissiveIntensity:1.25,roughness:.38});owned.push(sideLens);
 // Hooded, short-range practical only grazes the cargo side's front corner.
 box([69.325,5.09,14.95],[.24,.28,.84],iron);
 box([69.187,5.08,14.95],[.024,.12,.62],sideLens);
 box([69.225,5.25,14.95],[.43,.07,.92],iron);
 for(const z of [14.51,15.39])box([69.232,5.07,z],[.39,.30,.048],iron);
 const sideLight=new T.PointLight('#c7d8d1',4,4.2,2);sideLight.position.set(69.10,5.04,14.95);root.add(sideLight);
 // Only the solid jambs receive ribs: animated grille and photo aperture stay clear.
 for(const [cx,w] of [[71.1,2.8],[83.5,3]] as const){
  for(const x of [cx-w/2+.16,cx+w/2-.16]){box([x,2.08,16.28],[.13,7,.055]);for(let y=-1.05;y<5.55;y+=.46)bolt([x,y,16.33]);}
  for(const y of [-.72,1.1,2.93,4.76]){box([cx,y,16.28],[w-.4,.075,.04],rubber);box([cx,y+.08,16.29],[w-.4,.065,.07],edge);}
  box([cx,4.35,16.32],[w-.5,.38,.13]);for(let n=0;n<9;n++)box([cx-(w-.7)/2+n*(w-.7)/8,4.35,16.4],[.04,.29,.035],edge);
 }
 for(const x of [69.38,85.32]){rod([x,-1.1,15.5],[x,5.8,15.5],.14);for(const y of [-.65,1.4,3.6,5.4]){ring([x,y,15.5],.18,.045,edge);box([x,y,15.30],[.48,.14,.18]);}for(const dx of [-.24,.24])rod([x+dx,-1.1,15.4],[x+dx,5.65,15.4],.035,rubber);}
 // Gate hardware is entirely over the opaque jamb footprints. Rollers, guide
 // channels and inspection plates never project sideways into the evidence slit.
 for(const [x,side] of [[71.94,-1],[82.48,1]] as const){
  box([x,2.0,16.33],[.22,6.65,.09],rubber);
  for(const dx of [-.12,.12])box([x+dx,2.0,16.40],[.055,6.65,.09],edge);
  for(const y of [-.52,.95,2.5,4.06]){
   box([x+side*.20,y,16.39],[.43,.48,.09],iron);
   add(new T.CylinderGeometry(.18,.18,.085,20),edge,[x,y,16.49],[Math.PI/2,0,0]);
   add(new T.CylinderGeometry(.112,.112,.092,20),iron,[x,y,16.50],[Math.PI/2,0,0]);
   bolt([x,y,16.559],.061);
   for(const dy of [-.17,.17])bolt([x+side*.34,y+dy,16.46],.035);
  }
  // A sealed gear drive and small bolted access panel sit outboard of the rail.
  box([x+side*.45,4.85,16.35],[.7,.80,.18],iron);
  add(new T.CylinderGeometry(.25,.25,.075,24),edge,[x+side*.45,4.85,16.49],[Math.PI/2,0,0]);
  add(new T.CylinderGeometry(.205,.205,.08,24),iron,[x+side*.45,4.85,16.51],[Math.PI/2,0,0]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;bolt([x+side*.45+Math.sin(a)*.174,4.85+Math.cos(a)*.174,16.56],.025);}
  const cover=x+side*.74;
  box([cover,.23,16.34],[.64,.76,.035],rubber);
  box([cover,.23,16.365],[.58,.70,.025],shell);
  for(const dx of [-.23,.23])for(const dy of [-.28,.28])bolt([cover+dx,.23+dy,16.396],.034);
  box([cover,.18,16.391],[.21,.052,.02],iron);
  // Captive latch indicator is a mechanical recess, with no interaction affordance.
  box([x+side*.36,-.80,16.38],[.41,.20,.09],iron);
  box([x+side*.36,-.80,16.431],[.14,.045,.012],ochre);
 }
 // Pressure vessels are north of all NPC routes and behind the camera targets.
 function tower(cx:number,cz:number,r:number,height:number){
  const body=new T.CylinderGeometry(r,r,height,48);const uv=body.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*r,uv.getY(i)*height*.5);
  add(body,shell,[cx,height/2-1.45,cz]);
  const point=(a:number,y:number,rad=r):V=>[cx+Math.sin(a)*rad,y,cz+Math.cos(a)*rad];
  const radialBox=(a:number,y:number,w:number,h:number,d:number,offset:number,mat=iron)=>add(new T.BoxGeometry(w,h,d),mat,point(a,y,r+offset),[0,a,0]);
  function fastener(a:number,y:number,offset=.19,size=.046){
   const g=new T.CylinderGeometry(size,size,.065,6);
   g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.sin(a),0,Math.cos(a))));
   add(g,edge,point(a,y,r+offset));
  }
  // Curved armour panels expose actual recessed gasket seams. Surface UVs
  // retain the shared half-repeat-per-metre convention rather than stretching.
  for(let y=-1.30;y<height-1.5;y+=3.65){
   const h=Math.min(3.48,height-1.5-y);
   for(let i=0;i<12;i++){
    const a=i*Math.PI/6+.018,arc=Math.PI/6-.036;
    const g=new T.CylinderGeometry(r+.026,r+.026,h,5,1,true,a,arc),uv=g.getAttribute('uv');
    for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*(r+.026)*arc*.5,uv.getY(j)*h*.5);
    add(g,i===4&&y>5&&y<10?edge:shell,[cx,y+h/2,cz]);
    for(const yy of [y+.16,y+h-.16])for(const da of [.035,arc-.035])fastener(a+da,yy,.067,.033);
   }
  }
  // Bolted flange bands, not just thin painted rings.
  for(const y of [-1.05,2.6,6.4,10.2,14,17.8]){
   if(y>height-1.4)continue;
   const g=new T.CylinderGeometry(r+.12,r+.12,.23,48,1,true),uv=g.getAttribute('uv');
   for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*(r+.12),uv.getY(i)*.115);
   add(g,iron,[cx,y,cz]);
   ring([cx,y-.115,cz],r+.13,.026,edge);ring([cx,y+.115,cz],r+.13,.026,edge);
   for(let i=0;i<32;i++)fastener(i*Math.PI/16,y,.165,.052);
  }
  // Asymmetric service racks stay inside a 0.7 m belt around each vessel.
  for(const rack of [-.86,1.32])for(let n=0;n<3;n++){
   const a=rack+n*.095,rad=r+.25+n*.045,pr=[.145,.073,.040][n],lo=-1.24,hi=height-1.65;
   const g=new T.CylinderGeometry(pr,pr,hi-lo,12),uv=g.getAttribute('uv');
   for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*pr,uv.getY(i)*(hi-lo)*.5);
   add(g,n===2?rubber:iron,point(a,(hi+lo)/2,rad));
   for(let y=.25;y<hi;y+=2.2){
    ring(point(a,y,rad),pr+.023,.022,edge);
    radialBox(a,y,.36,.10,.22,rad-r-.11,iron);
    if(n===0){ring(point(a,y+.21,rad),pr+.048,.033,iron);ring(point(a,y+.28,rad),pr+.048,.033,edge);}
   }
  }
  for(const [a,y] of [[-.36,7.9],[.49,12.55],[1.95,3.65]]){
   if(y>height-2)continue;
   radialBox(a,y,1.04,1.38,.065,.066,rubber);radialBox(a,y,.97,1.30,.085,.12,shell);
   for(const da of [-.39/r,.39/r])for(const dy of [-.54,.54])fastener(a+da,y+dy,.18,.043);
   radialBox(a,y-.10,.27,.065,.10,.20,iron);
   for(const dy of [-.40,.40])radialBox(a-.42/r,y+dy,.10,.21,.075,.18,edge);
  }
  radialBox(.78,7.5,.87,1.65,.30,.22,iron);
  for(let k=0;k<11;k++)radialBox(.78,6.82+k*.135,.77,.037,.20,.43,edge);
  radialBox(.78,8.58,.62,.42,.18,.20,shell);
  for(const da of [-.21/r,.21/r])fastener(.78+da,8.58,.31,.064);
  for(const y of [4.8,10.9]){
   if(y>height-1.8)continue;
   const deck=new T.RingGeometry(r+.025,r+.60,48);deck.rotateX(-Math.PI/2);
   const uv=deck.getAttribute('uv'),pos=deck.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)*.5,pos.getZ(i)*.5);
   add(deck,iron,[cx,y,cz]);
  }
  for(const y of [-1.05,2.6,6.4,10.2,14]){if(y>height-1.4)continue;ring([cx,y,cz],r+.055,.09);ring([cx,y+.18,cz],r+.04,.035,edge);}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([cx+Math.sin(a)*(r+.04),-1.3,cz+Math.cos(a)*(r+.04)],[cx+Math.sin(a)*(r+.04),height-1.5,cz+Math.cos(a)*(r+.04)],.045);}
  for(const y of [4.8,10.9]){if(y>height-1.8)continue;ring([cx,y,cz],r+.48,.18);ring([cx,y+.94,cz],r+.64,.046,ochre);ring([cx,y+.45,cz],r+.64,.032,ochre);for(let i=0;i<16;i++){const a=i*Math.PI/8,x=cx+Math.sin(a)*(r+.64),z=cz+Math.cos(a)*(r+.64);rod([x,y,z],[x,y+.96,z],.035,ochre);rod([cx+Math.sin(a)*r,y-.65,cz+Math.cos(a)*r],[x,y-.08,z],.065);}}
  for(const y of [3.5,9.5]){if(y>height-2)continue;box([cx,y,cz+r+.045],[1,.24,.10]);box([cx,y-.04,cz+r+.106],[.74,.09,.024],lamp);}
 }
 tower(45,8,4.2,17);tower(62,1,3.4,21);tower(85,5,3.2,17);
 for(const x of [43.7,46.3]){box([x,1.35,11.4],[1.95,1.85,.12]);box([x,1.35,11.48],[1.62,1.48,.035],rubber);box([x,1.95,11.51],[1.45,.1,.018],lamp);for(const dx of [-.77,.77])box([x+dx,1.35,11.55],[.055,1.58,.1],edge);box([x,1.35,11.57],[.05,1.55,.06]);}
 // Curved perimeter girders follow the three independent platform footprints.
 for(const [cx,cz,r]of [[45,8,7.5],[61,6,9.1],[79,8,8.8]])for(let i=0;i<16;i++){
  const a=-Math.PI/2+i*Math.PI/16,b=a+Math.PI/16,mid=(a+b)/2;
  const p:V=[cx+Math.sin(a)*r,-1.69,cz+Math.cos(a)*r],q:V=[cx+Math.sin(b)*r,-1.69,cz+Math.cos(b)*r];
  rod(p,q,.11);const foot:V=[cx+Math.sin(mid)*(r-.8),-2.6,cz+Math.cos(mid)*(r-.8)];rod(p,foot,.065);rod(foot,q,.065);
 } // Practical housings coincide with the two authored light origins. The
 // yoke, rear heat sinks and protected lens make illumination physically legible.
 const whiteLens=new T.MeshStandardMaterial({color:'#bed9d4',emissive:'#bee8df',emissiveIntensity:2.2,roughness:.23});owned.push(whiteLens);
 for(const [origin,target] of [[[54,5,16],[57,-.1,11]],[[80,6,17],[77,-1,12]]] as [V,V][]){
  rod([origin[0],origin[1]+.70,origin[2]],[origin[0],20.9,origin[2]],.024,iron);box([origin[0],20.9,origin[2]],[.45,.13,.45],iron);
  const direction=new T.Vector3(...target).sub(new T.Vector3(...origin)).normalize();
  const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction);
  function housing(g:T.BufferGeometry,mat:T.MeshStandardMaterial,offset:number){g.applyQuaternion(rotation);add(g,mat,new T.Vector3(...origin).addScaledVector(direction,offset).toArray() as V);}
  housing(new T.CylinderGeometry(.26,.20,.40,24),iron,-.1);
  housing(new T.CylinderGeometry(.27,.27,.075,24),edge,.12);
  housing(new T.CylinderGeometry(.213,.213,.012,24),whiteLens,.165);
  for(const d of [-.20,-.12,-.04])housing(new T.CylinderGeometry(.28,.28,.028,24),iron,d);
  rod([origin[0]-.38,origin[1]+.1,origin[2]],[origin[0]+.38,origin[1]+.1,origin[2]],.05,iron);
  for(const dx of [-.37,.37])rod([origin[0]+dx,origin[1]+.1,origin[2]],[origin[0]+dx,origin[1]+.65,origin[2]],.045,iron);
  box([origin[0],origin[1]+.66,origin[2]],[.88,.12,.24],iron);
 }
 const amberLens=new T.MeshStandardMaterial({color:'#ffc46b',emissive:'#ff921f',emissiveIntensity:1.5,roughness:.29});owned.push(amberLens);
 for(const [x,z]of [[55,12.3],[65,13.5]]){
  const y=-.6;
  add(new T.CylinderGeometry(.23,.27,.10,16),iron,[x,y-.4,z]);
  add(new T.CylinderGeometry(.19,.19,.57,16),amberLens,[x,y,z]);
  add(new T.CylinderGeometry(.27,.23,.13,16),iron,[x,y+.35,z]);
  for(const dy of [-.26,0,.26])ring([x,y+dy,z],.24,.024,iron);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,dx=Math.sin(a)*.24,dz=Math.cos(a)*.24;rod([x+dx,y-.31,z+dz],[x+dx,y+.32,z+dz],.017,iron);}
  rod([x,y-.44,z],[x,-1.22,z],.07,iron);
  const light=new T.PointLight('#ff9d42',8,5,2);light.position.set(x,y,z+.31);root.add(light);
 }
 // Merge static pieces by material.
 for(const [mat,parts] of batches){const g=mergeGeometries(parts);for(const p of parts)p.dispose();if(!g)continue;geometries.push(g);const mesh=new T.Mesh(g,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 return{root,colliders:caissons.colliders,decorColliders:caissons.decorColliders,dispose(){powerCabinet.dispose();controlPod.dispose();caissons.dispose();surfaces.dispose();blender.dispose();root.removeFromParent();for(const g of geometries)g.dispose();for(const material of owned)material.dispose();}};
}










