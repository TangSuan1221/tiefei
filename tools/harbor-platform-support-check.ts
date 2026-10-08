import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {Vector3,Raycaster,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,DoubleSide} from 'three';
import {createHarborLevel} from '../src/pod/content/harbor-level';
import {createReferenceMaterials} from '../src/pod/view/deepsea/reference-materials';
import {createExpeditionWorld} from '../src/pod/view/deepsea/expedition-world';
import {createHarborRescueWorld} from '../src/pod/view/deepsea/harbor-rescue-world';

// Canvas is only used to manufacture decorative labels. Geometry and solids
// come from the real factory; no platform coordinates are reimplemented here.
const context=new Proxy({measureText:(s:string)=>({width:s.length*20}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray(512*512*4)}),createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),createPattern:()=>({setTransform(){}})},{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}});
const oldDocument=globalThis.document;
const materials=createReferenceMaterials(),world=createExpeditionWorld(createHarborLevel(),materials);
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const visual=createHarborRescueWorld(world,materials);
try{
 world.root.updateMatrixWorld(true);
 // Extract exact world-space support triangles once; repeated raycasts over
 // every bolt and character triangle would make the dense route sweep costly.
 const topTriangles:number[]=[],a=new Vector3(),b=new Vector3(),c=new Vector3();
 visual.root.traverse(object=>{if(!(object instanceof Mesh))return;const g=object.geometry,p=g.getAttribute('position'),idx=g.index;for(let i=0;i<(idx?.count??p.count);i+=3){a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(object.matrixWorld);b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(object.matrixWorld);c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(object.matrixWorld);if([a,b,c].every(v=>Math.abs(v.y+1.2)<.003))topTriangles.push(...a.toArray(),...b.toArray(),...c.toArray());}});
 const supportGeometry=new BufferGeometry();supportGeometry.setAttribute('position',new Float32BufferAttribute(topTriangles,3));const supportMaterial=new MeshBasicMaterial({side:DoubleSide}),supportMesh=new Mesh(supportGeometry,supportMaterial);supportMesh.updateMatrixWorld();
 const failures:{name:string;x:number;z:number;mesh:boolean;solid:boolean}[]=[],counts={elias:0,monster:0,lamps:0};
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0),0,.35);
 function supported(name:string,x:number,z:number){
  ray.ray.origin.set(x,-1.05,z);
  const mesh=ray.intersectObject(supportMesh,false).some(h=>Math.abs(h.point.y+1.2)<.003);
  const solid=visual.solids.some(b=>Math.abs(b.max.y+1.2)<.003&&x>=b.min.x&&x<=b.max.x&&z>=b.min.z&&z<=b.max.z);
  if(!mesh||!solid)failures.push({name,x,z,mesh,solid});
 }
 function route(name:'elias'|'monster',a:[number,number],b:[number,number],radius:number){
  const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05);
  for(let i=0;i<=steps;i++){const t=i/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
   supported(name,x,z);for(let j=0;j<8;j++){const angle=j*Math.PI/4;supported(name,x+Math.cos(angle)*radius,z+Math.sin(angle)*radius);}counts[name]+=9;
  }
 }
 route('elias',[57,11],[53,11],.18);route('elias',[53,11],[53,8.5],.18);
 route('monster',[64,9],[77,9],.42);
 for(const [x,z]of [[55,12.3],[65,13.5]]){supported('lamp-center',x,z);counts.lamps++;for(let j=0;j<16;j++){const a=j*Math.PI/8;supported('lamp-footprint',x+Math.cos(a)*.22,z+Math.sin(a)*.22);counts.lamps++;}}
 mkdirSync('qa/harbor/platform-support',{recursive:true});writeFileSync('qa/harbor/platform-support/results.json',JSON.stringify({passed:failures.length===0,counts,failures},null,2));
 supportGeometry.dispose();supportMaterial.dispose();console.log(JSON.stringify({counts,failureCount:failures.length,firstFailures:failures.slice(0,8)},null,2));assert.equal(failures.length,0,'Visible platform and collider must support complete NPC routes and lamp bases');
}finally{visual.dispose();world.dispose();materials.dispose();Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});}
