import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {ReferenceMaterials} from './reference-materials';
import {setHarborPigment} from './harbor-scanned-surfaces';
type V=[number,number,number];
/** Cylindrical service islands in the deepened harbor. Collision follows narrow
 * circle strips, annular galleries and short brace segments, not giant boxes. */
export function createHarborCaissonLayout(parent:T.Group,m:ReferenceMaterials){
 const root=new T.Group();root.name='harbor-deep-caisson-layout';parent.add(root);
 const owned:T.MeshStandardMaterial[]=[],geometries:T.BufferGeometry[]=[];
 // MET-042: struts and service lamps are dressing; only drums, galleries,
 // pedestals and gangway braces block the hull.
 const colliders:T.Box3[]=[],decorColliders:T.Box3[]=[];
 function cylinderBounds(p:V,r:number,h:number,into=colliders){
  const slices=Math.max(2,Math.ceil(2*r/.18)),step=2*r/slices;
  for(let i=0;i<slices;i++){const lo=-r+i*step,hi=lo+step,near=lo>0?lo:hi<0?-hi:0,extent=Math.sqrt(Math.max(0,r*r-near*near));into.push(new T.Box3(new T.Vector3(p[0]+lo,p[1]-h/2,p[2]-extent),new T.Vector3(p[0]+hi,p[1]+h/2,p[2]+extent)));}
 }
 function annulusBounds(x:number,z:number,y0:number,y1:number,inner:number,outer:number){
  const count=Math.ceil(Math.PI*2*outer/.8),step=Math.PI*2/count;
  for(let i=0;i<count;i++){
   const a=i*step,b=a+step,points:T.Vector3[]=[];
   for(const angle of [a,b,Math.ceil(a/(Math.PI/2))*Math.PI/2])if(angle>=a&&angle<=b)for(const r of [inner,outer])for(const y of [y0,y1])points.push(new T.Vector3(x+Math.sin(angle)*r,y,z+Math.cos(angle)*r));
   colliders.push(new T.Box3().setFromPoints(points));
  }
 }
 const batches=new Map<T.Material,T.BufferGeometry[]>();
 const finish=(base:T.MeshStandardMaterial,color:string)=>{const a=base.clone();setHarborPigment(a,color);owned.push(a);return a;};
 const plate=finish(m.hull,'#405651'),steel=finish(m.steel,'#233b37'),trim=finish(m.steel,'#627570'),yellow=finish(m.yellow,'#856c35');
 const deckPlate=finish(m.floor,'#606d67');
 const glow=new T.MeshStandardMaterial({color:'#b9d8d0',emissive:'#83bbb4',emissiveIntensity:1.0,roughness:.5});owned.push(glow);
 function add(g:T.BufferGeometry,mat:T.Material,p:V,rot:V=[0,0,0]){
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rot)),new T.Vector3(1,1,1)));
  if(g.type==='BoxGeometry'){const pos=g.getAttribute('position'),norm=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<pos.count;i++)uv.setXY(i,(Math.abs(norm.getX(i))>.5?pos.getZ(i):pos.getX(i))*.5,(Math.abs(norm.getY(i))>.5?pos.getZ(i):pos.getY(i))*.5);}
  const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();const bucket=batches.get(mat)??[];bucket.push(flat);batches.set(mat,bucket);
 }
 // All mesh UVs use one UV unit per 2 m before each shared surface's repeat.
 // Cylinder caps need a planar map: scaling their default radial UV by body
 // height stretches the same scan differently on the top and vertical shell.
 function cylinderUV(g:T.CylinderGeometry,r:number,h:number){
  const uv=g.getAttribute('uv'),pos=g.getAttribute('position'),normal=g.getAttribute('normal');
  for(let i=0;i<uv.count;i++){
   if(Math.abs(normal.getY(i))>.5)uv.setXY(i,pos.getX(i)*.5,pos.getZ(i)*.5);
   else uv.setXY(i,uv.getX(i)*Math.PI*r,uv.getY(i)*h*.5);
  }
 }
 function cylinder(p:V,r:number,h:number,mat:T.Material=plate,padding=0,into=colliders){const g=new T.CylinderGeometry(r,r,h,48);cylinderUV(g,r,h);add(g,mat,p);cylinderBounds(p,r+padding,h,into);}
 const box=(p:V,s:V,mat:T.Material=steel)=>add(new T.BoxGeometry(...s),mat,p);
 function rod(a:V,b:V,r=.07,mat:T.Material=steel){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa);const length=d.length();const g=new T.CylinderGeometry(r,r,length,8);cylinderUV(g,r,length);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));add(g,mat,aa.clone().add(bb).multiplyScalar(.5).toArray() as V);if(r>=.1){const count=Math.ceil(length/.4);for(let i=0;i<count;i++)colliders.push(new T.Box3().setFromPoints([aa.clone().lerp(bb,i/count),aa.clone().lerp(bb,(i+1)/count)]).expandByScalar(r));}}
 function ring(p:V,r:number,t=.065,mat:T.Material=steel){const g=new T.TorusGeometry(r,t,6,64),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*r,uv.getY(i)*Math.PI*t);add(g,mat,p,[Math.PI/2,0,0]);}
 function gallery(x:number,z:number,y:number,r:number){
  // The deck, sub-frame and closely spaced guard stanchions form a hull-sized
  // exclusion ring. Its center remains genuinely open in both mesh and bounds.
  annulusBounds(x,z,y-.73,y+.94,r-.86,r+.025);
  const shape=new T.Shape();shape.absarc(0,0,r,0,Math.PI*2,false);const hole=new T.Path();hole.absarc(0,0,r-.85,0,Math.PI*2,true);shape.holes.push(hole);add(new T.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false,curveSegments:32}),steel,[x,y,z],[Math.PI/2,0,0]);
  ring([x,y+.87,z],r-.05,.04,yellow);ring([x,y+.43,z],r-.05,.026,steel);
  for(let i=0;i<28;i++){const a=i*Math.PI/14,sa=Math.sin(a),ca=Math.cos(a);rod([x+sa*(r-.05),y,z+ca*(r-.05)],[x+sa*(r-.05),y+.9,z+ca*(r-.05)],.027,yellow);rod([x+sa*(r-.8),y-.65,z+ca*(r-.8)],[x+sa*(r-.05),y-.13,z+ca*(r-.05)],.065,steel);rod([x+sa*(r-.79),y+.015,z+ca*(r-.79)],[x+sa*(r-.09),y+.015,z+ca*(r-.09)],.018,trim);}
 }
 function caisson(x:number,z:number,r:number,top:number,bottom:number){
  cylinder([x,(top+bottom)/2,z],r,top-bottom,plate,.145);
  // Flush radial deck sectors expose drainage joints. All detail stays inside
  // the existing drum envelope, well below the retained operating hull layer.
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6+.009,g=new T.RingGeometry(.46,r-.14,8,1,a,Math.PI/6-.018);
   g.rotateX(-Math.PI/2);const p=g.getAttribute('position'),uv=g.getAttribute('uv');
   for(let j=0;j<p.count;j++)uv.setXY(j,p.getX(j)*.5,p.getZ(j)*.5);
   add(g,deckPlate,[x,top+.008,z]);
   for(const rr of [r-.32,r*.57])for(const da of [.027,Math.PI/6-.045]){
    const angle=a+da;add(new T.CylinderGeometry(.038,.038,.019,6),trim,[x+Math.cos(angle)*rr,top+.016,z-Math.sin(angle)*rr]);
   }
  }
  ring([x,top+.013,z],r-.12,.019,steel);
  const hx=x-r*.26,hz=z-r*.24;
  add(new T.CylinderGeometry(.49,.49,.018,32),steel,[hx,top+.012,hz]);
  add(new T.CylinderGeometry(.43,.43,.017,32),plate,[hx,top+.023,hz]);
  for(const dx of [-.16,.16])box([hx+dx,top+.036,hz],[.12,.013,.032],steel);
  for(let y=top-.30;y>bottom;y-=3.4){ring([x,y,z],r+.05,.095,steel);ring([x,y-.15,z],r+.035,.025,trim);}
  for(let i=0;i<16;i++){const a=i*Math.PI/8;rod([x+Math.sin(a)*(r+.015),top-.2,z+Math.cos(a)*(r+.015)],[x+Math.sin(a)*(r+.015),bottom+.15,z+Math.cos(a)*(r+.015)],.045,steel);}
  gallery(x,z,top-1.1,r+1.05);gallery(x,z,top-6.4,r+.85);
  for(const a of [-.65,.65,2.4]){
   const sx=x+Math.sin(a)*(r+.12),sz=z+Math.cos(a)*(r+.12);
   cylinder([sx,top-5.2,sz],.16,7.0,steel,0,decorColliders);
   for(const y of [top-2.5,top-5.9]){box([sx,y,sz],[.31,.18,.28],steel);box([sx,y-.10,sz+.08],[.20,.025,.19],glow);}
  }
 }
 // Near-bank piers, an offset low central control drum, and north-bank supports.
 caisson(43,23,4.6,-3.2,-19);caisson(81,22,4.5,-3.2,-21);
 caisson(60,14.2,3.5,-5.94,-23);
 cylinderBounds([60,-4.62,14.2],2.64,2.64); // Blender control cabin above the lower drum.
 caisson(45,8,4.0,-3.2,-18);caisson(61,6,4.1,-3.2,-24);caisson(79,8,4.2,-3.2,-21);
 // Existing interaction pedestals retain their precise position and clear
 // sightline. Compact support collars stay below hull height at the task poses.
 for(const [x,z]of [[62.5,24.57],[44.5,25.57],[80.5,23.57]]){
  cylinder([x,-11.35,z],.36,17.4,steel);
  cylinder([x,-2.70,z],.86,.14,steel);
  cylinder([x,-2.46,z],.18,.30,trim);
  ring([x,-2.625,z],.78,.04,trim);
  for(const y of [-4.1,-8.8,-13.5,-18.2])ring([x,y,z],.405,.045,trim);
 }
 // Broken gangway cantilevers descend into separate caissons rather than a
 // monolithic apron. Their upper ends remain below the original deck collision.
 for(const [tip,base]of [[55.3,44],[64.7,80]])for(const z of [18.9,21.1]){
  rod([tip,-3.12,z],[base,-8,z],.18,steel);
  rod([tip,-3.12,z],[base,-3.12,z],.12,steel);
  rod([base,-8,z],[base,-3.12,z],.16,steel);
 }
 // Short-range service lamps rake the torn bridge edges. Their guarded bodies
 // remain below the existing rail tops and outside the navigable hull height.
 for(const x of [55.1,64.9]){
  const p:V=[x,-2.15,21.25];
  box(p,[.22,.28,.18],steel);
  box([x,-2.002,21.25],[.14,.012,.11],glow);
  box([x,-2.12,21.355],[.24,.30,.025],steel);
  for(const dx of [-.085,.085])rod([x+dx,-2.28,21.38],[x+dx,-2.02,21.38],.012,trim);
  decorColliders.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...p),new T.Vector3(.24,.30,.28)));
  const light=new T.PointLight('#cfdee2',2.5,5.5,1.8);light.position.set(x,-1.93,21.32);root.add(light);
 }
 for(const[mat,parts]of batches){const merged=mergeGeometries(parts);for(const p of parts)p.dispose();if(!merged)continue;geometries.push(merged);const mesh=new T.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 return{root,colliders,decorColliders,dispose(){root.removeFromParent();for(const g of geometries)g.dispose();for(const mat of owned)mat.dispose();}};
}




