import * as T from 'three';
import {setHarborPigment} from './harbor-scanned-surfaces';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {ReferenceMaterials} from './reference-materials';

/** Position-authored wear on existing tower shells and solid cargo jambs.
 * These meshes never enter collision, interaction or photograph target lists. */
export function createHarborSurfaceDetails(parent:T.Group,m:ReferenceMaterials){
 const root=new T.Group();root.name='harbor-structure-bound-surface-wear';parent.add(root);
 const owned:T.Material[]=[],textures:T.Texture[]=[],geometries:T.BufferGeometry[]=[];
 const batches=new Map<T.Material,T.BufferGeometry[]>();
 const matte=(base:T.MeshStandardMaterial,color:string)=>{const a=base.clone();setHarborPigment(a,color);owned.push(a);return a;};
 const patch=matte(m.hull,'#687b71'),weld=matte(m.steel,'#52605b'),fastener=matte(m.steel,'#7c8071');
 const random=(n:number)=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a);};
 function runoffTexture(salt:boolean){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const c=canvas.getContext('2d')!;
  // Each filament begins below a real ring/fastener; irregular lengths keep
  // the stains from becoming a repeated rectangular camouflage mask.
  for(let i=0;i<28;i++){
   const x=12+random(i+2)*232,y=8+random(i+40)*34,len=65+random(i+77)*400;
   const gradient=c.createLinearGradient(x,y,x,y+len);
   gradient.addColorStop(0,salt?'rgba(175,182,155,.25)':'rgba(94,49,22,.58)');
   gradient.addColorStop(.35,salt?'rgba(152,162,142,.12)':'rgba(73,42,23,.27)');
   gradient.addColorStop(1,'rgba(64,43,27,0)');
   c.strokeStyle=gradient;c.lineWidth=1+random(i+54)*(salt?5:8);c.lineCap='round';
   c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+3,y+len*.3,x-4,y+len*.65,x+random(i+9)*5,y+len);c.stroke();
   if(!salt){c.fillStyle='rgba(78,43,25,.38)';c.beginPath();c.ellipse(x,y,2+random(i)*6,1+random(i+10)*4,0,0,Math.PI*2);c.fill();}
  }
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;textures.push(t);
  const a=new T.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:salt?.94:.88,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});owned.push(a);return a;
 }
 const rust=runoffTexture(false),salt=runoffTexture(true);
 function add(g:T.BufferGeometry,mat:T.Material,p:[number,number,number],q=new T.Quaternion()){
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),q,new T.Vector3(1,1,1)));
  const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();
  const bucket=batches.get(mat)??[];bucket.push(flat);batches.set(mat,bucket);
 }
 function arc(cx:number,cz:number,r:number,y:number,h:number,start:number,span:number,mat:T.Material){
  add(new T.CylinderGeometry(r,r,h,Math.max(4,Math.ceil(span*22)),1,true,start,span),mat,[cx,y,cz]);
 }
 function stud(cx:number,cz:number,r:number,a:number,y:number){
  const n=new T.Vector3(Math.sin(a),0,Math.cos(a));
  add(new T.CylinderGeometry(.045,.045,.032,6),fastener,[cx+n.x*r,y,cz+n.z*r],new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),n));
 }
 for(const [cx,cz,r,height] of [[46,1,4.2,17],[62,1,3.4,21],[85,1,3.2,17]]){
  // Horizontal plate-course welds are thin metal beads, with a local rust
  // wash below the load-bearing rings rather than dirt over every surface.
  for(const y of [2.6,6.4,10.2,14]){
   if(y>height-1.8)continue;
   add(new T.TorusGeometry(r+.012,.018,4,72),weld,[cx,y-.15,cz],new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2));
   for(const [j,a] of [-.65,.10,.90].entries()){
    const h=1.0+random(j+y+cx)*1.3;
    arc(cx,cz,r+.018,y-.23-h/2,h,a,j===1?.36:.49,j===1?salt:rust);
   }
  }
  // Curved doubler plates have their own seam and perimeter fasteners.
  // Positions avoid the pressure hatches and practical lamps.
  for(const [y,a,h,span] of [[1.35,.68,1.45,.35],[7.6,-.52,1.25,.40],[12.2,.32,1.10,.28]]){
   arc(cx,cz,r+.027,y,h+.06,a-.008,span+.016,weld);
   arc(cx,cz,r+.041,y,h,a,span,patch);
   for(const yy of [y-h/2+.1,y+h/2-.1])for(const aa of [a+.028,a+span-.028])stud(cx,cz,r+.062,aa,yy);
   arc(cx,cz,r+.049,y-h*.34-.42,.9,a+.015,span-.03,rust);
  }
 }
 // Gate-side vertical stains originate at existing cross-members. Nothing
 // reaches the animated grille or the camera evidence aperture.
 for(const [x,w] of [[71.1,2.1],[83.5,2.3]])for(const y of [1.02,2.85,4.68]){
  add(new T.PlaneGeometry(w,.95),rust,[x,y-.45,16.325]);
 }
 for(const [mat,parts] of batches){
  const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)continue;
  geometries.push(g);const mesh=new T.Mesh(g,mat);mesh.receiveShadow=true;mesh.renderOrder=mat.transparent?2:0;root.add(mesh);
 }
 return{root,dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());owned.forEach(a=>a.dispose());textures.forEach(t=>t.dispose());}};
}
