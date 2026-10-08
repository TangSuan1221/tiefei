import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {ReferenceMaterials} from './reference-materials';
type V=[number,number,number];
/** Layered steel fracture artwork. Folded long-span ends carry separate tight
 * bounds; the intact girder and guardrails retain their ordinary envelopes. */
export function createHarborFractureArt(parent:T.Group,m:ReferenceMaterials){
 const root=new T.Group();root.name='layered-torn-steel-bridge';parent.add(root);
 const materials:T.MeshStandardMaterial[]=[],geometries:T.BufferGeometry[]=[];
 function finish(source:T.MeshStandardMaterial,color:string){const a=source.clone();a.color.set(color);materials.push(a);return a;}
 const steel=finish(m.steel,'#354540'),edge=finish(m.steel,'#78847b'),rust=finish(m.steel,'#645044'),shadow=finish(m.rubber,'#14221e');
 function addStub(p:V,width:number,depth:number,height:number,north:boolean,yaw=0){
  const group=new T.Group();group.position.set(...p);group.rotation.y=(north?Math.PI:0)+yaw;root.add(group);
  const rotation=group.rotation.y,c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation));
  const bounds=new T.Box3().setFromCenterAndSize(new T.Vector3(...p),new T.Vector3(c*width+s*depth,height,s*width+c*depth));
  const colliders:T.Box3[]=[bounds];
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  function damageBounds(g:T.BufferGeometry){g.computeBoundingBox();if(!g.boundingBox)return;const b=g.boundingBox.clone();b.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),rotation),new T.Vector3(1,1,1)));colliders.push(b);}
  function add(g:T.BufferGeometry,mat:T.Material,v:V=[0,0,0],rotation:V=[0,0,0]){
   g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...v),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1)));
   const pos=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv');
   for(let i=0;i<pos.count;i++)uv.setXY(i,Math.abs(normal.getX(i))>.5?pos.getZ(i):pos.getX(i),Math.abs(normal.getY(i))>.5?pos.getZ(i):pos.getY(i));
   const flat=g.index?g.toNonIndexed():g;if(g!==flat)g.dispose();flat.clearGroups();const bucket=batches.get(mat)??[];bucket.push(flat);batches.set(mat,bucket);
  }
  const box=(v:V,size:V,mat:T.Material=steel)=>add(new T.BoxGeometry(...size),mat,v);
  function skin(y:number,thickness:number,offset:number,mat:T.Material){
   if(depth>4){
    const rootZ=-depth/2+.80;
    box([0,y-thickness/2,(rootZ+depth/2)/2],[width,thickness,depth/2-rootZ],mat);
    // Three broad leaves share one failure direction: port skin buckles up,
    // central web tears down, starboard skin rolls down more gently. These
    // are volumetric segmented plates, not random teeth over an intact slab.
    for(const [x0,x1,fold]of [[-width/2,-width*.16,.35],[-width*.135,width*.14,-.47],[width*.17,width/2,-.22]]){
     const station=(q:number,x:number,h:number)=>[x-Math.sign(x)*.065*q*q,y+h+fold*q*q,rootZ-(.67-offset*.4)*q+.10*q*q] as V;
     for(let s=0;s<4;s++){
      const a=s/4,b=(s+1)/4,vs=[station(a,x0,0),station(a,x1,0),station(b,x1,0),station(b,x0,0),station(a,x0,-thickness),station(a,x1,-thickness),station(b,x1,-thickness),station(b,x0,-thickness)];
      const idx=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(idx.flatMap(i=>vs[i]),3));g.setAttribute('uv',new T.Float32BufferAttribute(new Array(idx.length*2).fill(0),2));g.computeVertexNormals();damageBounds(g);add(g,mat);
     }
    }
    return;
   }
   const shape=new T.Shape();shape.moveTo(-width/2,depth/2);shape.lineTo(width/2,depth/2);shape.lineTo(width/2,-depth/2+.20+offset);
   for(let i=12;i>=0;i--){const x=-width/2+width*i/12;const torn=.07+((i*17+3)%7)*.028+offset;shape.lineTo(x,-depth/2+torn);if(i%3===1)shape.lineTo(x-width/32,-depth/2+torn+.085);}
   shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:false});add(g,mat,[0,y,0],[Math.PI/2,0,0]);
  }
  skin(height/2,.046,0,steel);skin(-height/2+.041,.04,.15,rust);
  // Stiffeners are recessed from the torn edge, showing actual interstitial voids.
  for(let i=0;i<7;i++){
   const x=-width*.44+i*width*.88/6,z0=-depth/2+(depth>4?.82:.27)+(i%3)*.055;
   box([x,-.005,(z0+depth/2-.045)/2],[.036,height-.10,depth/2-.045-z0],rust);
   box([x,height/2-.065,(z0+depth/2-.08)/2],[.12,.025,depth/2-.08-z0],edge);
   // Folded web termination stays below the top skin and inside the old width.
   add(new T.BoxGeometry(.031,height*.52,.16),edge,[x+(i%2?.035:-.035),-.01,z0+.06],[.12*(i%3-1),.20*(i%2?1:-1),.08*(i%2?1:-1)]);
  }
  // Intact near edge is a real recessed web, with slotted doubler plates rather
  // than one bright unbroken slab. All details lie inside the original envelope.
  box([0,0,depth/2-.072],[width-.04,height-.07,.034],shadow);
  for(const y of [-height/2+.024,height/2-.024])box([0,y,depth/2-.04],[width,.046,.07],edge);
  const count=5,span=(width-.12)/count;
  for(let i=0;i<count;i++){
   const x=-width/2+.06+span*(i+.5);
   box([x,0,depth/2-.032],[span-.018,height-.088,.025],steel);
   // Drain apertures sit low in the web; vertical seams carry the load. Avoid
   // rows of identical centered handles which made the girder resemble drawers.
   if(i!==2)box([x+span*.13,-height*.18,depth/2-.015],[span*.32,.025,.016],shadow);
   const seam=x-span/2+.012;
   box([seam,0,depth/2-.018],[.035,height-.056,.021],rust);
   for(const y of [-height*.29,height*.29])add(new T.CylinderGeometry(.018,.018,.018,6),edge,[seam,y,depth/2-.010],[Math.PI/2,0,0]);
  }
  for(const x of [-width/2+.031,width/2-.031]){
   box([x,0,depth>4?.43:.12],[.04,height-.06,depth-(depth>4?.87:.25)],steel);
   for(const y of [-height/2+.035,height/2-.035])box([x,y,depth>4?.43:.1],[.06,.025,depth-(depth>4?.87:.25)],edge);
  }
  if(depth>4){
   // Long opposing cantilevers use the same torn end, with fabricated deck
   // sections and low rails. The rails top out below the mission hull at Y=0.
   const rail=finish(m.yellow,'#7d693d');
   function tornRod(a:V,b:V,r:number,mat:T.Material){const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av),g=new T.CylinderGeometry(r,r,d.length(),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray() as V);damageBounds(g);add(g,mat);}
   for(let z=-depth/2+.95;z<depth/2-.1;z+=1.15){
    box([0,height/2-.004,z],[width-.10,.008,.018],shadow);
    for(const x of [-width/2+.048,width/2-.048]){
     box([x,0,z],[.028,height-.075,.065],edge);
     add(new T.CylinderGeometry(.018,.018,.016,6),edge,[x,0,z],[0,0,Math.PI/2]);
    }
   }
   for(const x of [-width/2+.07,width/2-.07]){
    box([x,height/2+.76,.43],[.048,.045,depth-.94],rail);
    box([x,height/2+.37,.43],[.035,.03,depth-.94],steel);
    for(let z=-depth/2+.98;z<depth/2-.1;z+=1.6)box([x,height/2+.385,z],[.048,.77,.048],rail);
    const direction=Math.sign(x),z=-depth/2;
    for(const h of [.76,.37]){const a:V=[x,height/2+h,z+.9],b:V=[x-direction*.16,height/2+h-.23,z+.54],end:V=[x-direction*.34,height/2+h-.51,z+.20];tornRod(a,b,.023,rail);tornRod(b,end,.021,steel);}
    const local=new T.Box3().setFromCenterAndSize(new T.Vector3(x,height/2+.395,.43),new T.Vector3(.06,.79,depth-.94));
    local.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),rotation),new T.Vector3(1,1,1)));colliders.push(local);
   }
   for(const x of [-width*.3,0,width*.3]){tornRod([x,-height*.1,-depth/2+.85],[x+.045,-height*.35,-depth/2+.42],.028,edge);tornRod([x+.045,-height*.35,-depth/2+.42],[x+.11,-height*.85,-depth/2+.13],.024,rust);}
  }
  // Thin weld beads terminate at each stiffener, not a painted fake shadow.
  for(let i=0;i<7;i++){const x=-width*.44+i*width*.88/6;for(let n=0;n<8;n++)add(new T.SphereGeometry(.009,5,3),rust,[x+(.005*(n%2)),height/2-.009,.04+n*.07]);}
  for(const [mat,parts]of batches){const merged=mergeGeometries(parts);for(const part of parts)part.dispose();if(!merged)continue;geometries.push(merged);const object=new T.Mesh(merged,mat);object.castShadow=object.receiveShadow=true;group.add(object);}
  return{root:group,bounds,colliders};
 }
 return{addStub,dispose(){root.removeFromParent();for(const g of geometries)g.dispose();for(const material of materials)material.dispose();}};
}


