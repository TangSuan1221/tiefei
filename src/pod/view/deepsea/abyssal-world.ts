import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ABYSS_SPACES,ABYSS_ITEMS,ABYSS_WINDOWS,ABYSS_GATES,ABYSS_TANKS,ABYSS_TABLE,ABYSS_SOLIDS,PIT,CAGE_TIERS,CAGE_07,DRAIN,DOME,alarmBeacons,abyssWater,abyssSpaceAt,spiralPoint,spiralHeading,spiralRadius,pitAt,type Vec3,type Band,type Shape} from '../../content/abyssal-lab-layout';
import {createLivingMaterials,withStaticLights} from './living-materials';
import {createAtmosphere} from './living-atmosphere';
import {createAbyssalFacilityDressing} from './abyssal-facility-dressing';
import type {LivingPractical} from './living-render';

export interface AbyssalWorldState {time:number;collected:readonly string[];sluiceOpen?:boolean;pressOpen?:boolean;pressClosed?:boolean;drainOpen?:boolean;alarmOn?:boolean}
const v=(p:Vec3)=>new T.Vector3(...p);
const mixY=(a:readonly(readonly[number,number])[],t:number)=>{for(let i=1;i<a.length;i++)if(t<=a[i][0])return T.MathUtils.lerp(a[i-1][1],a[i][1],(t-a[i-1][0])/(a[i][0]-a[i-1][0]));return a.at(-1)![1];};
/** Curved water-union boundary. No corridor AABBs: collision uses abyssWater in the site. */
export function createAbyssalWorld(){
 const root=new T.Group();root.name='abyssal-lab-world';
 const m=createLivingMaterials(),colliders:T.Box3[]=[],decorColliders:T.Box3[]=[];
 m.rustSheet.color.set('#a17c58');m.pipe.color.set('#8b6f55');m.concrete.color.set('#a29d91');m.indGreen.color.set('#746b58');
 m.lampRed.color.set('#7c0802');m.lampRed.emissive.set('#ff1603');m.lampRed.emissiveIntensity=4;
 m.darkGlass.roughness=.3;
 const interactables=new Map<string,T.Object3D>(),itemBounds=new Map<string,T.Box3>(),photoTargets=new Map<string,T.Object3D>();
 const practicalLights:LivingPractical[]=[],moodLights:LivingPractical[]=[];
 const batches=new Map<string,{material:T.Material;geometries:T.BufferGeometry[]}>(),geometries=new Set<T.BufferGeometry>(),extraMaterials:T.Material[]=[],textures:T.Texture[]=[];
 let bucket='S',disposed=false;
 // CC0 Poly Haven scans; sources, physical tile sizes and hashes are kept
 // beside the files. Colour is sRGB, normal/roughness remain linear data.
 const scanLoads:Promise<void>[]=[];
 function scan(id:string,metres:number){
  const one=(channel:string)=>{let tex:T.Texture;
   if(typeof window!=='undefined'){let done!:()=>void,failed!:(error:unknown)=>void;scanLoads.push(new Promise<void>((resolve,reject)=>{done=resolve;failed=reject;}));tex=new T.TextureLoader().load(`/assets/level-03/materials/${id}_${channel}_1k.jpg`,loaded=>{if(disposed)loaded.dispose();done();},undefined,failed);}
   else tex=new T.Texture();
   tex.colorSpace=channel==='diff'?T.SRGBColorSpace:T.NoColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(1/metres,1/metres);tex.anisotropy=8;textures.push(tex);return tex;};
  return {map:one('diff'),normalMap:one('nor_gl'),roughnessMap:one('rough')};
 }
 const concreteScan=scan('concrete_wall_007',2.16),paintScan=scan('blue_metal_plate',2.5),damageScan=scan('rusty_painted_metal',2.2);
 function scanned(name:string,maps:ReturnType<typeof scan>,color:string,metalness:number,normal:number,desaturate=0){const mat=withStaticLights(new T.MeshStandardMaterial({...maps,color,roughness:1,metalness,normalScale:new T.Vector2(normal,normal)}),name);mat.name=`abyss.scan.${name}`;
  const base=mat.onBeforeCompile,minRough=name==='concrete'?.84:name==='dark-frame'?.67:name==='service-paint'?.62:.70;
  // Scope the roughness floor and practical specular correction to L3 scans.
  // Fail loudly if Three/shared shader hooks change; never silently lose the fix.
  mat.onBeforeCompile=(shader,renderer)=>{base.call(mat,shader,renderer);
   for(const hook of ['#include <map_fragment>','#include <roughnessmap_fragment>','(.18 * (1. - material.roughness * .7))'])if(!shader.fragmentShader.includes(hook))throw new Error(`Abyssal scanned material shader hook missing: ${hook}`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722))), ${desaturate.toFixed(2)});`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, ${minRough.toFixed(2)});`)
    .replace('(.18 * (1. - material.roughness * .7))','(.04 * pow(1. - material.roughness, 2.))');
  };mat.customProgramCacheKey=()=>`abyss.scan.${name}.${desaturate}.rough-${minRough}.v2`;
  extraMaterials.push(mat);return mat;
 }
 m.concrete=scanned('concrete',concreteScan,'#b5b1a5',0,.32);
 m.indSteel=scanned('equipment-blue-paint',paintScan,'#c2bbb0',.08,.35,.55);
 m.rustSheet=scanned('aged-shell-paint',paintScan,'#b5ada0',.08,.3,.86);
 m.frame=scanned('dark-frame',paintScan,'#606568',.25,.28,.92);
 m.pipe=scanned('service-paint',paintScan,'#9a9181',.08,.3,.88);
 const damageMetal=scanned('local-corrosion',damageScan,'#b1a59a',.06,.38,.32);

 const vesselGlass=new T.MeshPhysicalMaterial({color:'#647578',roughness:.1,metalness:.08,transparent:true,opacity:.10,depthWrite:false,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.08});
 const medium=new T.MeshPhysicalMaterial({color:'#5b3c13',roughness:.16,metalness:0,transparent:true,opacity:.15,depthWrite:false,side:T.DoubleSide,clearcoat:.45});
 const enamel=new T.MeshStandardMaterial({color:'#b9b3a0',map:m.paintCream.map,normalMap:m.paintCream.normalMap,roughnessMap:m.paintCream.roughnessMap,roughness:.72,metalness:.28});
 const hose=new T.MeshStandardMaterial({color:'#101315',roughness:.76,metalness:.05});
 extraMaterials.push(vesselGlass,medium,enamel,hose);
 m.lampCyan.color.set('#ddd9c9');m.lampCyan.emissive.set('#c9c8ba');
 function add(g:T.BufferGeometry,mat:T.Material,pos:Vec3=[0,0,0],rot=0,decor=false){
  if(g instanceof T.CylinderGeometry){const uv=g.getAttribute('uv'),p=g.parameters;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*2*Math.max(p.radiusTop,p.radiusBottom),uv.getY(i)*p.height);}
  g.rotateY(rot);g.translate(...pos);g.computeBoundingBox();if(decor&&g.boundingBox)decorColliders.push(g.boundingBox.clone());
  const key=bucket+':'+mat.uuid;let b=batches.get(key);if(!b){b={material:mat,geometries:[]};batches.set(key,b);}b.geometries.push(g);
 }
 function box(pos:Vec3,size:Vec3,mat:T.Material=m.frame,rot=0,decor=true){const g=new T.BoxGeometry(...size);const uv=g.getAttribute('uv');/* world-metre UV projection for worn scanned material */const p=g.getAttribute('position'),n=g.getAttribute('normal');for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,ny>.5?p.getX(i):nx>.5?p.getZ(i):p.getX(i),ny>.5?p.getZ(i):p.getY(i));}add(g,mat,pos,rot,decor);}
 function pipe(a:Vec3,b:Vec3,r=.13,mat:T.Material=m.pipe){const A=v(a),B=v(b),d=B.clone().sub(A);const g=new T.CylinderGeometry(r,r,d.length(),10,1);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));add(g,mat,A.add(B).multiplyScalar(.5).toArray() as unknown as Vec3,0,true);}
 function ring(pos:Vec3,r:number,tube:number,mat:T.Material=m.frame,axis:'y'|'z'='y',rotation=0){const g=new T.TorusGeometry(r,tube,6,Math.max(32,Math.ceil(r*5)));if(axis==='y')g.rotateX(Math.PI/2);add(g,mat,pos,rotation,true);}
 function corpse(pos:Vec3,yaw:number){
  const at=(p:Vec3):Vec3=>[pos[0]+p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),pos[1]+p[1],pos[2]-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)];
  const limb=(a:Vec3,b:Vec3,r:number,mat:T.Material)=>pipe(at(a),at(b),r,mat);
  limb([0,.16,-.36],[0,.16,.24],.22,m.corpseCloth);limb([-.14,.13,.2],[-.25,.13,.83],.105,m.corpseCloth);limb([.14,.13,.2],[.22,.12,.8],.105,m.corpseCloth);
  limb([-.23,.16,-.3],[-.48,.12,.1],.075,m.corpseCloth);limb([-.48,.12,.1],[-.58,.12,.37],.065,m.corpseSkin);limb([.23,.16,-.3],[.52,.12,-.13],.075,m.corpseCloth);limb([.52,.12,-.13],[.62,.12,.15],.065,m.corpseSkin);
  const head=new T.SphereGeometry(.145,12,8);head.scale(.86,1,1.12);add(head,m.corpseSkin,at([0,.16,-.57]),yaw,true);for(const x of [-.25,.22])box(at([x,.12,.9]),[.15,.18,.27],m.rubber,yaw);
 }
 function label(text:string,pos:Vec3,width:number,height:number,rot:number,color='#c7c8b4'){
  const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!;x.fillStyle='#1b2421';x.fillRect(0,0,1024,256);x.fillStyle=color;x.fillRect(8,8,1008,5);x.fillRect(8,243,1008,5);x.font='bold 100px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,512,132,980);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);const mat=new T.MeshStandardMaterial({map:tex,roughness:.8,metalness:.25,emissive:color,emissiveMap:tex,emissiveIntensity:.10,side:T.DoubleSide});extraMaterials.push(mat);add(new T.PlaneGeometry(width,height),mat,pos,rot);
 }
 function fixture(pos:Vec3,rot:number,color:'warm'|'red'|'cyan'='warm',strength=5,range=17){
  const lens=color==='red'?m.lampRed:color==='cyan'?m.lampCyan:m.lampWarm;
  box(pos,color==='red'?[.88,.76,.28]:[.68,.38,.28],m.frame,rot);add(new T.SphereGeometry(color==='red'?.28:.17,10,6),lens,[pos[0]+Math.sin(rot)*.18,pos[1],pos[2]+Math.cos(rot)*.18]);
  if(color==='red')ring([pos[0]+Math.sin(rot)*.3,pos[1],pos[2]+Math.cos(rot)*.3],.37,.055,m.rustSheet,'z',rot);
  practicalLights.push({position:[pos[0]+Math.sin(rot)*.5,pos[1]-.2,pos[2]+Math.cos(rot)*.5],color:color==='red'?'#ff2918':color==='cyan'?'#d1d0c4':'#ffc887',intensity:strength,range,dir:[Math.sin(rot),-.35,Math.cos(rot)],flicker:'steady',seed:practicalLights.length*.73});
 }
 // Each quad is retained only when one normal side is water and the other is structural shell.
 // Subdivision at 0.65 m avoids closing real doorways at overlapping space boundaries.
 const seen=new Set<string>();
 const shellBuffers=new Map<string,{material:T.Material;position:number[];normal:number[];uv:number[]}>();
 function patch(a:Vec3,b:Vec3,c:Vec3,d:Vec3,mat:T.Material){
  const A=v(a),B=v(b),C=v(c),D=v(d),mid=A.clone().add(B).add(C).add(D).multiplyScalar(.25),normal=B.clone().sub(A).cross(D.clone().sub(A)).normalize();
  const p=mid.clone().addScaledVector(normal,.045),q=mid.clone().addScaledVector(normal,-.045);
  const iw=abyssWater(p.toArray() as unknown as Vec3),ow=abyssWater(q.toArray() as unknown as Vec3);if(iw===ow)return;
  const k=mid.toArray().map(n=>n.toFixed(2)).join(',');if(seen.has(k))return;seen.add(k);
  const points=iw?[a,b,c,a,c,d]:[a,d,c,a,c,b],key=bucket+':'+mat.uuid;
  let buf=shellBuffers.get(key);if(!buf){buf={material:mat,position:[],normal:[],uv:[]};shellBuffers.set(key,buf);}
  if(!iw)normal.negate();for(const p of points){buf.position.push(...p);buf.normal.push(normal.x,normal.y,normal.z);buf.uv.push(...(Math.abs(normal.y)>.6?[p[0],p[2]]:Math.abs(normal.x)>.6?[p[2],p[1]]:[p[0],p[1]]));}
 }
 function surface(fn:(u:number,w:number)=>Vec3,nu:number,nv:number,mat:T.Material){for(let i=0;i<nu;i++)for(let j=0;j<nv;j++)patch(fn(i/nu,j/nv),fn((i+1)/nu,j/nv),fn((i+1)/nu,(j+1)/nv),fn(i/nu,(j+1)/nv),mat);}
 function shell(s:Shape){
  if(s.kind==='band'){
   const t=(u:number)=>T.MathUtils.lerp(s.t0,s.t1,u),outer=(u:number)=>s.outer+(s.bump??0)*Math.sin(Math.PI*u),floor=(u:number)=>mixY(s.floor,t(u)),top=(u:number)=>s.top?mixY(s.top,t(u)):s.ceil,N=Math.ceil((s.t1-s.t0)*spiralRadius(s.t0)/.7);
   for(const side of [-1,1])surface((u,w)=>spiralPoint(t(u),side<0?-s.inner:outer(u),T.MathUtils.lerp(floor(u),top(u),w)),N,Math.ceil((s.ceil-Math.min(...s.floor.map(p=>p[1])))/.7),m.concrete);
   for(const upper of [false,true])surface((u,w)=>spiralPoint(t(u),T.MathUtils.lerp(-s.inner,outer(u),w),upper?top(u):floor(u)),N,Math.ceil((s.inner+s.outer+(s.bump??0))/.7),upper?m.rustSheet:m.tread);
   for(const u of [0,1])surface((a,b)=>spiralPoint(t(u),T.MathUtils.lerp(-s.inner,outer(u),a),T.MathUtils.lerp(floor(u),top(u),b)),32,24,m.concrete);
  }else if(s.kind==='cyl'){
   const pt=(a:number,r:number,y:number):Vec3=>[s.centre[0]+Math.cos(a)*r,y,s.centre[2]+Math.sin(a)*r];
   surface((u,w)=>pt(u*Math.PI*2,s.radius,T.MathUtils.lerp(s.floor,s.ceil,w)),Math.ceil(s.radius*2*Math.PI/.7),Math.ceil((s.ceil-s.floor)/.7),m.concrete);
   for(const y of [s.floor,s.ceil])surface((u,w)=>pt(u*Math.PI*2,w*s.radius,y),Math.ceil(s.radius*2*Math.PI/.8),Math.ceil(s.radius/.7),y===s.floor?m.plate:m.rustSheet);
  }else{
   const h=s.heading*Math.PI/180,pt=(x:number,y:number,z:number):Vec3=>[s.centre[0]+x*Math.cos(h)+z*Math.sin(h),y,s.centre[2]+x*Math.sin(h)-z*Math.cos(h)];
   for(const x of [-s.halfW,s.halfW])surface((u,w)=>pt(x,T.MathUtils.lerp(s.floor,s.ceil,w),T.MathUtils.lerp(-s.halfL,s.halfL,u)),Math.ceil(s.halfL*3),18,m.wallTile);
   for(const z of [-s.halfL,s.halfL])surface((u,w)=>pt(T.MathUtils.lerp(-s.halfW,s.halfW,u),T.MathUtils.lerp(s.floor,s.ceil,w),z),20,18,m.wallTile);
   for(const y of [s.floor,s.ceil])surface((u,w)=>pt(T.MathUtils.lerp(-s.halfW,s.halfW,u),y,T.MathUtils.lerp(-s.halfL,s.halfL,w)),20,Math.ceil(s.halfL*3),m.tread);
  }
 }
 for(const sp of ABYSS_SPACES){bucket=sp.id;for(const s of sp.shapes)shell(s);}
 for(const [key,b] of shellBuffers){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(b.position,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(b.normal,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));batches.set(key,{material:b.material,geometries:[geometry]});}shellBuffers.clear();seen.clear();
 // Functional industrial ribs and utility bundles follow the true spiral, leaving the 8–16 m waterway clear.
 for(const sp of ABYSS_SPACES){bucket=sp.id;for(const shape of sp.shapes){if(shape.kind!=='band')continue;const s=shape as Band;
  for(let t=s.t0+.04;t<s.t1;t+=.075){const u=(t-s.t0)/(s.t1-s.t0),out=s.outer+(s.bump??0)*Math.sin(Math.PI*u),fy=mixY(s.floor,t),cy=s.top?mixY(s.top,t):s.ceil,ang=Math.PI+t;
   const inner=spiralPoint(t,-s.inner+.18,(fy+cy)/2),outer=spiralPoint(t,out-.18,(fy+cy)/2);
   if(Math.hypot(inner[0]-PIT.centre[0],inner[2]-PIT.centre[2])<PIT.radius-1&&inner[1]>PIT.floor)continue;
   box(inner,[.26,cy-fy,.32],m.frame,-ang);box(outer,[.26,cy-fy,.32],m.frame,-ang);
   // Riveted overhead pressure arches: the profile stays above the authored ceiling
   // clearance and gives the long waterway a legible industrial cross-section.
   const mid=(out-s.inner)/2,half=(out+s.inner)/2;
   for(let j=0;j<10;j++){const f0=j/10,f1=(j+1)/10;pipe(spiralPoint(t,mid+Math.cos(f0*Math.PI)*half,cy-.12-Math.sin(f0*Math.PI)*.08),spiralPoint(t,mid+Math.cos(f1*Math.PI)*half,cy-.12-Math.sin(f1*Math.PI)*.08),.13,m.frame);}
   if(Math.round(t/.075)%3===0){for(const side of [-1,1]){const off=side<0?-s.inner+.33:out-.33;box(spiralPoint(t,off,fy+1.5),[.2,1.6,1.3],m.indGreen,-ang);box(spiralPoint(t,off+(side<0?.12:-.12),fy+1.8),[.05,.3,.6],m.hazard,-ang);}}
   for(const off of [-s.inner+.45,out-.45])for(const yy of [cy-.5,fy+.45]){pipe(spiralPoint(t,off,yy),spiralPoint(Math.min(t+.075,s.t1),off,yy),yy===cy-.5?.24:.13);}
   if(Math.round(t/.075)%2===0)fixture(spiralPoint(t,-s.inner+.42,cy-1.1),-ang-Math.PI/2,sp.id==='P'?'warm':'cyan',sp.id==='P'?8:5,20);
  }
 }}
 // Specimen gallery: empty pressure vessels; fauna only exists in generated video.
 bucket='S';{const c=spiralPoint(0);for(let i=0;i<4;i++){const a=i*Math.PI/2,p:Vec3=[c[0]+Math.cos(a)*6.55,1,c[2]+Math.sin(a)*6.55];label('北 005°  ·  检疫通道',p,4.5,.75,-a-Math.PI/2,'#f0dbac');fixture([p[0],2.15,p[2]],-a-Math.PI/2,'warm',9,15);}}
 // Repeated physical plaques and warm-white edge lamps are visible from the
 // entry driving height. They follow the curved channel, not a through-wall bearing.
 bucket='S';for(const t of [.12,.24,.36,.5,.64]){const p=spiralPoint(t,3.9,1.1),rot=-spiralHeading(t)*Math.PI/180;
  label('检疫泊位  →',p,3.8,.85,rot,'#e4d8b6');fixture(spiralPoint(t,-4.45,-.8),-Math.PI-t-Math.PI/2,'warm',11,19);
  for(const x of [-1.35,1.35]){const xx=p[0]+Math.cos(rot)*x,zz=p[2]-Math.sin(rot)*x;pipe([xx,1.55,zz],[xx,4.85,zz],.027,hose);}
 }
 bucket='Q';label('检疫 / 医疗补给',spiralPoint(.72,12.6,1.6),5.5,1.1,-spiralHeading(.72)*Math.PI/180,'#e5d7b2');
 bucket='Q';corpse(spiralPoint(.65,9,-4.75),.8);corpse(spiralPoint(.87,8,-4.75),2.3);
 for(const t of [.62,.72,.83,.93]){const off=10+3*Math.sin((t-.3)/.9*Math.PI);box(spiralPoint(t,off,-3.3),[2.2,2.8,.7],m.rustSheet,-t-Math.PI/2);for(const y of [-4.1,-3.1,-2.1])box(spiralPoint(t,off-.2,y),[2.3,.08,1.2],m.frame,-t-Math.PI/2);}
 bucket='Q';{const t=.88,rot=-Math.PI-t-Math.PI/2;
  box(spiralPoint(t,12,-3.45),[4.2,2.8,1.2],enamel,rot);label('检疫耗材 / STERILE',spiralPoint(t,11.3,-2.3),3.6,.55,rot,'#d7c9a7');
  for(const dt of [-.012,.012]){box(spiralPoint(t+dt,11.2,-3.7),[1.5,1.25,.9],m.paintCream,rot);box(spiralPoint(t+dt,10.72,-3.65),[.75,.18,.03],m.bandRed,rot);box(spiralPoint(t+dt,10.70,-3.65),[.18,.7,.03],m.bandRed,rot);}
  box(spiralPoint(t+.025,12,-4.25),[1.9,.35,1.3],m.rustSheet,rot+.3);fixture(spiralPoint(t,10.6,-.8),rot,'warm',8,13);
 }
 bucket='G';for(let t=1.24,i=0;t<2.38;t+=.065,i++){
  const p=spiralPoint(t,4.1,-1.3),rot=-t-Math.PI/2,r=.62+(i%3)*.08,top=1.4-(i%3)*.35,bottom=-3.7;
  box(spiralPoint(t,4.2,-4.35),[1.85,1.3,1.4],m.indSteel,rot);box(spiralPoint(t,4.7,-1.15),[1.7,5.5,.16],m.paintDark,rot);
  add(new T.CylinderGeometry(r,r,top-bottom,24,1,true),vesselGlass,[p[0],(top+bottom)/2,p[2]],0,true);
  const fill=1.3+(i%3)*.7;add(new T.CylinderGeometry(r*.92,r*.92,fill,24),medium,[p[0],bottom+fill/2,p[2]],0,true);
  ring([p[0],bottom+fill,p[2]],r*.91,.009,medium);for(const y of [bottom+.18,top-.18])ring([p[0],y,p[2]],r-.025,.035,vesselGlass);
  for(const y of [bottom,top]){add(new T.CylinderGeometry(r+.1,r+.1,.22,24),m.rustSheet,[p[0],y,p[2]],0,true);ring([p[0],y,p[2]],r+.08,.06,m.brass);ring([p[0],y+(y===top?-.14:.14),p[2]],r,.027,hose);for(let k=0;k<8;k++){const a=k*Math.PI/4;add(new T.CylinderGeometry(.045,.045,.09,6),m.chrome,[p[0]+Math.cos(a)*(r+.03),y+.14,p[2]+Math.sin(a)*(r+.03)],0,true);}}
  // Empty retaining cradle and dip tube explain a preserved-sample vessel without a creature model.
  pipe([p[0],bottom+.2,p[2]],[p[0],top-.15,p[2]],.035,m.chrome);for(const y of [bottom+.7,top-.65])ring([p[0],y,p[2]],r*.6,.035,m.chrome);
  for(const a of [0,Math.PI]){const px=p[0]+Math.cos(a)*r,pz=p[2]+Math.sin(a)*r;pipe([px,bottom,pz],[px,top,pz],.045,m.brass);}
  pipe([p[0],top+.1,p[2]],spiralPoint(t,4.3,3.8),.08,m.pipe);
  pipe([p[0],bottom,p[2]],spiralPoint(t,3.75,-4.3),.09,m.brass);pipe(spiralPoint(t,3.75,-4.3),spiralPoint(t+.035,3.75,-4.3),.09,m.pipe);
  for(const y of [bottom+.7,top-.65])for(const sign of [-1,1])pipe([p[0],y,p[2]],[p[0]+sign*r*.6,y,p[2]],.025,m.chrome);
  label(`SPECIMEN ${String(i+1).padStart(2,'0')}`,spiralPoint(t,3.35,-4.2),1.45,.35,rot);if(i%3===0)fixture(spiralPoint(t,3.9,2.1),rot,'warm',7,12);
 }
 // Five tiers of 24 sealed containment cells. Six beacon rings are exactly 144 sources.
 bucket='G';{const t=1.55,rot=-Math.PI-t+Math.PI/2;
  box(spiralPoint(t,-4.82,.2),[5,4.2,.35],m.rustSheet,rot);box(spiralPoint(t,-4.57,.2),[4.25,3.35,.12],m.darkGlass,rot);
  for(const y of [-1.6,2])box(spiralPoint(t,-4.38,y),[4.65,.25,.42],m.frame,rot);
  for(const dt of [-.021,.021])box(spiralPoint(t+dt,-4.38,.2),[.23,3.8,.42],m.frame,rot);
  fixture(spiralPoint(t,-4.25,2.6),rot,'warm',9,16);
  for(const y of [3.1,3.55,4])for(let tt=1.3;tt<1.8;tt+=.04)pipe(spiralPoint(tt,-4.45,y),spiralPoint(tt+.04,-4.45,y),y===3.55?.18:.10,m.pipe);
  for(const tt of [1.34,1.46,1.58,1.7])box(spiralPoint(tt,-4.65,3.55),[.18,1.4,.6],m.frame,rot);
 }
 bucket='C';
 for(const y of CAGE_TIERS){
  ring([PIT.centre[0],y-4.6,PIT.centre[2]],33.3,.25,m.rustSheet);
  ring([PIT.centre[0],y+4.6,PIT.centre[2]],33.4,.2,m.pipe);
  for(let i=0;i<24;i++){const a=i*Math.PI/12,rot=-a-Math.PI/2,p=pitAt(a,33.55,y);if(abyssWater(pitAt(a,34.1,y)))continue;
   box(p,[6.5,8,.2],m.paintDark,rot);box(pitAt(a,33.34,y),[5.5,5.5,.16],m.rustSheet,rot);box(pitAt(a,33.20,y+.6),[4.5,2.6,.12],m.darkGlass,rot);
   for(const j of [-1,1])box(pitAt(a+j*.085,33.12,y),[.22,8.6,.3],m.rustSheet,rot);
   for(const yy of [y-3.9,y+3.9])box(pitAt(a,33.18,yy),[6.7,.27,.35],m.rustSheet,rot);
   for(const yy of [y-.9,y+2.1])box(pitAt(a,33.04,yy),[4.9,.18,.2],m.frame,rot);
   for(const j of [-1,1])box(pitAt(a+j*.073,33.04,y+.6),[.18,3.2,.2],m.frame,rot);
   label(`${String(i+1).padStart(2,'0')} / ${1+CAGE_TIERS.indexOf(y)}`,pitAt(a,32.98,y+3.13),2.3,.62,rot);
  }
 }
 alarmBeacons().forEach((p,i)=>{const a=Math.atan2(p[2]-PIT.centre[2],p[0]-PIT.centre[0]);fixture(p,-a-Math.PI/2,'red',9,19);});
 for(let i=0;i<12;i++){const a=(i+.25)*Math.PI/6;pipe(pitAt(a,32.95,9),pitAt(a,32.95,-59),.45,m.pipe);for(const y of [7,-5,-17,-29,-41,-53]){const rot=-a-Math.PI/2;box(pitAt(a,32.45,y),[1.15,.35,.55],m.brass,rot);}}
 for(const y of [-9,-21,-33,-45]){const a=CAGE_07.angle+.6;label('排水通道  -60m  ↓',pitAt(a,32.85,y),5,.8,-a-Math.PI/2,'#c6a66d');}
 // Three larger hydraulic risers and suspended service yokes give a cross-tier
 // scale reference. These are wall equipment, never walkable platforms.
 for(const [j,a] of [1.2,2.85,4.45].entries()){
  const rot=-a-Math.PI/2;pipe(pitAt(a,32.55,8),pitAt(a,32.55,-57),.92,m.rustSheet);
  for(const y of [3,-14,-32,-50]){
   ring(pitAt(a,32.55,y),1.05,.13,m.frame);box(pitAt(a,33.3,y),[3.5,.55,1.4],m.frame,rot);
   pipe(pitAt(a-.08,33.2,y+2.5),pitAt(a,32.25,y),.13,m.frame);pipe(pitAt(a+.08,33.2,y+2.5),pitAt(a,32.25,y),.13,m.frame);
  }
  const yy=-10-j*13;box(pitAt(a+.075,32.8,yy),[3.6,5.2,1.5],enamel,rot);box(pitAt(a+.075,31.95,yy+.6),[2.5,1.2,.12],m.darkGlass,rot);
  pipe(pitAt(a,32.5,yy-1),pitAt(a+.075,32.5,yy-1),.35,m.pipe);ring(pitAt(a+.075,31.8,yy-1.2),.62,.09,m.bandRed,'z',rot);
  label(`HYDRAULIC / ${j+1}`,pitAt(a+.075,31.9,yy+1.9),2.7,.4,rot,'#ccbca0');
 }
 // Unique 07 evidence subject: buckled rim and glass fragments, unlike intact cells.
 {const a=CAGE_07.angle,rot=-a-Math.PI/2;box(pitAt(a,33.5,-55),[8,8,.15],m.darkGlass,rot);for(const da of [-.12,.12]){box(pitAt(a+da,33.05,-55),[.4,8.6,.5],damageMetal,rot+.08*Math.sign(da));}for(const y of [-59,-51])box(pitAt(a,32.95,y),[8.4,.4,.6],damageMetal,rot);
  for(let i=0;i<7;i++){const p=pitAt(a+(i-3)*.028,32.6,-58.4+Math.abs(i-3)*.12);const g=new T.ConeGeometry(.35,.9,3);g.rotateZ((i-3)*.3);add(g,m.darkGlass,p,rot,true);}fixture(pitAt(a-.15,32.5,-52),rot,'warm',10,15);
 }
 label('07',pitAt(CAGE_07.angle,32.2,-49.8),4,1.5,-CAGE_07.angle-Math.PI/2,'#d1b99c');
 // Pit bottom recovery trough and collapsed upper crane are real structural subjects.
 for(const s of ABYSS_SOLIDS){bucket='C';colliders.push(new T.Box3(new T.Vector3(s.centre[0]-s.radius,s.floor,s.centre[2]-s.radius),new T.Vector3(s.centre[0]+s.radius,s.ceil,s.centre[2]+s.radius)));
  if(s.id==='trough'){add(new T.CylinderGeometry(s.radius,s.radius,.65,64),m.rustSheet,[s.centre[0],s.ceil-.32,s.centre[2]]);ring([s.centre[0],s.ceil,s.centre[2]],s.radius,.3,m.frame);}
  else {label('通道坍塌 / 下至坑底',spiralPoint(5.20,0,2.5),7,1.2,Math.atan2(PIT.centre[0]-spiralPoint(5.2)[0],PIT.centre[2]-spiralPoint(5.2)[2]),'#e2ba78');}
 }
 // The collapsed crane visual is an authored Blender asset below. Its existing
 // structural Box3 above and the navigation SolidCyl remain the sole blockers.
 bucket='C';for(let i=0;i<9;i++){const a=i*2.399;corpse([PIT.centre[0]+Math.cos(a)*(1+i*.55),-56.85,PIT.centre[2]+Math.sin(a)*(1+i*.55)],a);}
 // Culture tanks, steel collars and numbered plaques are photo subjects, not creature models.
 bucket='P';for(const [i,t] of ABYSS_TANKS.entries()){
  const pos:Vec3=[t.centre[0],(t.floor+t.ceil)/2,t.centre[2]];
  add(new T.CylinderGeometry(t.radius,t.radius,5.2,32,1,true),vesselGlass,[pos[0],-7.4,pos[2]]);
  add(new T.CylinderGeometry(t.radius*.94,t.radius*.94,3.5+(i%3)*.4,32),medium,[pos[0],-9.7+(3.5+(i%3)*.4)/2,pos[2]]);
  ring([pos[0],-9.7+3.5+(i%3)*.4,pos[2]],t.radius*.94,.014,medium);
  add(new T.CylinderGeometry(t.radius,t.radius,5.8,24),m.indSteel,[pos[0],-12.9,pos[2]]);
  add(new T.CylinderGeometry(t.radius,t.radius,1.8,24),enamel,[pos[0],-3.9,pos[2]]);
  colliders.push(new T.Box3(new T.Vector3(pos[0]-t.radius,t.floor,pos[2]-t.radius),new T.Vector3(pos[0]+t.radius,t.ceil,pos[2]+t.radius)));
  for(const y of [t.floor+.3,t.ceil-.3,-10]){add(new T.CylinderGeometry(t.radius+.12,t.radius+.12,.3,24),m.rustSheet,[pos[0],y,pos[2]],0,true);ring([pos[0],y,pos[2]],t.radius+.1,.1,m.brass);}
  const a=Math.atan2(pos[2],pos[0]);label(String(i+1).padStart(2,'0'),[pos[0]-Math.cos(a)*1.57,-5,pos[2]-Math.sin(a)*1.57],1.5,1,-a-Math.PI/2,'#e2cbb0');fixture([pos[0]-Math.cos(a)*1.9,-3.8,pos[2]-Math.sin(a)*1.9],-a-Math.PI/2,'warm',12,15);
  const tt=6.38+i*5/89,rot=-a-Math.PI/2;
  // Outlet → valve → pump → filling conveyor. All parts remain on the outer bank.
  pipe(spiralPoint(tt,6.3,-10.9),spiralPoint(tt,3.9,-10.9),.18,m.pipe);ring(spiralPoint(tt,4.55,-10.9),.42,.07,m.bandRed,'z',rot);
  box(spiralPoint(tt,4.3,-12),[1.3,1.7,1.6],m.indSteel,rot);add(new T.CylinderGeometry(.48,.48,1.4,16),m.rustSheet,spiralPoint(tt,4.3,-12.8),0,true);
  pipe(spiralPoint(tt,4.1,-11),spiralPoint(tt,3.25,-11),.12,m.chrome);
  box(spiralPoint(tt,3.35,-12.3),[5.08,.24,1.2],m.frame,rot);
  for(let b=0;b<9;b++){const bt=tt+(b-4)*.005;add(new T.CylinderGeometry(.075,.085,.25,12),vesselGlass,spiralPoint(bt,3.35,-12.02),0,true);add(new T.CylinderGeometry(.035,.065,.06,12),vesselGlass,spiralPoint(bt,3.35,-11.865),0,true);add(new T.CylinderGeometry(.035,.035,.08,12),vesselGlass,spiralPoint(bt,3.35,-11.795),0,true);add(new T.CylinderGeometry(.045,.045,.04,12),m.brass,spiralPoint(bt,3.35,-11.735),0,true);}
  for(const off of [2.9,3.85]){pipe(spiralPoint(tt-.029,off,-12.3),spiralPoint(tt+.029,off,-12.3),.12,m.frame);for(const dt of [-.022,.022]){pipe(spiralPoint(tt+dt,off,-12.3),spiralPoint(tt+dt,off,-15.7),.12,m.frame);box(spiralPoint(tt+dt,off,-15.75),[.5,.18,.5],m.rustSheet,0);}}
  for(const off of [4.8,5.7])ring(spiralPoint(tt,off,-10.9),.27,.055,m.brass,'z',rot);
  for(const y of [-13.7,-12.5])pipe(spiralPoint(tt-.028,3.8,y),spiralPoint(tt+.028,3.8,y),.10,m.frame);
  box(spiralPoint(tt,4.7,-10.8),[.6,.7,.18],enamel,rot);ring(spiralPoint(tt,4.55,-10.8),.19,.025,m.brass,'z',rot);
 }
 bucket='P';{const t=6.38+8*5/89,rot=-Math.PI-t-Math.PI/2;box(spiralPoint(t,3.35,-12.6),[2.3,1.6,1.6],m.indSteel,rot);add(new T.CylinderGeometry(.45,.45,1.2,16),m.rustSheet,spiralPoint(t,3.35,-12.1),0,true);
  for(const dt of [-.023,.023])box(spiralPoint(t+dt,3.5,-9.7),[.28,5.5,.5],m.indSteel,rot);box(spiralPoint(t,3.5,-7),[4.5,.5,1.4],m.rustSheet,rot);box(spiralPoint(t,3.6,-7.7),[1.1,1.2,.9],enamel,rot);pipe(spiralPoint(t,3.6,-8.2),spiralPoint(t,3.6,-11.4),.16,m.chrome);
  label('装瓶 / 接收站',spiralPoint(t,2.4,-8.3),3.8,.8,-spiralHeading(t)*Math.PI/180);fixture(spiralPoint(t,2.7,-7.8),rot,'warm',18,24);
 }
 // Windows are shallow closed backdrops only; no hidden NPC corridor geometry.
 for(const w of ABYSS_WINDOWS){bucket=w.space;const g=new T.Group();g.name=`abyss.window.${w.id}`;g.position.copy(v(w.window));g.rotation.y=w.podHeading*Math.PI/180;root.add(g);
  const pane=new T.Mesh(new T.BoxGeometry(2.9,2.2,.13),m.darkGlass);g.add(pane);geometries.add(pane.geometry);
  for(const x of [-1.65,1.65]){const o=new T.Mesh(new T.BoxGeometry(.28,2.8,.38),m.brass);o.position.x=x;g.add(o);geometries.add(o.geometry);}
  for(const y of [-1.25,1.25]){const o=new T.Mesh(new T.BoxGeometry(3.6,.28,.38),m.brass);o.position.y=y;g.add(o);geometries.add(o.geometry);}
  fixture([w.window[0],w.window[1]+1.65,w.window[2]],w.podHeading*Math.PI/180,'warm',12,16);label(`${w.id}  ${w.name}`, [w.window[0],w.window[1]+2.2,w.window[2]],4.7,.55,w.podHeading*Math.PI/180);photoTargets.set(w.id,g);
 }
 const medicalCase=new T.MeshStandardMaterial({color:'#92988d',roughness:1,metalness:0});
 const caseRed=new T.MeshBasicMaterial({color:'#ab1d16',polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide});
 const caseInk=new T.MeshBasicMaterial({color:'#171d19',polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide});
 extraMaterials.push(medicalCase,caseRed,caseInk);
 for(const it of ABYSS_ITEMS){bucket=it.space;const g=new T.Group();g.name=it.id;g.position.copy(v(it.position));g.rotation.y=it.face*Math.PI/180;root.add(g);
  const service=!!it.supplies;const body=new T.Mesh(new RoundedBoxGeometry(.96,.85,.96,2,.035),service?m.bandYellow:it.id.includes('key')?m.bandRed:medicalCase);g.add(body);geometries.add(body.geometry);
  // Original +Z marker establishes the unchanged historical interaction box.
  const cross=new T.Mesh(new T.BoxGeometry(.5,.13,.025),service?caseInk:caseRed);cross.position.z=.49;g.add(cross);geometries.add(cross.geometry);if(!service){const vertical=cross.clone();vertical.rotation.z=Math.PI/2;g.add(vertical);}else{const bat=new T.Mesh(new T.BoxGeometry(.35,.3,.025),caseInk);bat.position.z=.49;g.add(bat);geometries.add(bat.geometry);}
  // Four coplanar decals stay within the body, so arbitrary heading conventions
  // cannot hide the pickup's identity. Depth bias avoids coplanar flickering.
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const face=new T.Group();face.position.set(Math.sin(a)*.48,0,Math.cos(a)*.48);face.rotation.y=a;g.add(face);
   const stripe=new T.Mesh(new T.PlaneGeometry(service?.38:.54,service?.3:.14),service?caseInk:caseRed);face.add(stripe);geometries.add(stripe.geometry);
   const upright=new T.Mesh(new T.PlaneGeometry(service?.10:.14,service?.08:.54),service?caseInk:caseRed);upright.position.y=service?.19:0;face.add(upright);geometries.add(upright.geometry);
  }
  // Recessed lid seam, corner guards, four-face catches and top handle remain
  // inside the original .96 x .85 x .96 body. All dressing has its own channel.
  const detail=(geo:T.BufferGeometry,mat:T.Material,x:number,y:number,z:number,ry=0)=>{const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.rotation.y=ry;g.add(mesh);geometries.add(geo);g.updateMatrixWorld(true);decorColliders.push(new T.Box3().setFromObject(mesh));return mesh;};
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
   const n=new T.Vector3(Math.sin(a),0,Math.cos(a)),u=new T.Vector3(Math.cos(a),0,-Math.sin(a));
   detail(new T.PlaneGeometry(.87,.016),caseInk,n.x*.48,.285,n.z*.48,a);
   for(const sign of [-1,1]){const at=n.clone().multiplyScalar(.474).addScaledVector(u,sign*.31);detail(new T.BoxGeometry(.09,.16,.009),m.chrome,at.x,.27,at.z,a);detail(new T.PlaneGeometry(.055,.025),caseInk,at.x+n.x*.005,.255,at.z+n.z*.005,a);}
  }
  for(const sign of [-1,1])detail(new T.BoxGeometry(.055,.022,.32),m.frame,sign*.13,.409,0);
  detail(new T.BoxGeometry(.31,.022,.055),m.frame,0,.409,.135);
  for(const x of [-.438,.438])for(const z of [-.438,.438])detail(new T.BoxGeometry(.065,.13,.065),m.frame,x,-.35,z);
  g.traverse(o=>{o.userData.interactionId=it.id;});interactables.set(it.id,g);g.updateMatrixWorld(true);const b=new T.Box3(new T.Vector3(-.48,-.425,-.48),new T.Vector3(.48,.425,.48)).applyMatrix4(g.matrixWorld).union(new T.Box3().setFromObject(cross));itemBounds.set(it.id,b);colliders.push(b);
  fixture([it.position[0],it.position[1]+1.5,it.position[2]],it.face*Math.PI/180,'warm',4,8);
 }
 // Sluice and stamping crossheads use the site's authoritative physical states.
 const gates=new Map<string,T.Group>();for(const gate of ABYSS_GATES){bucket=gate.id==='sluice'?'K':'P';const p=spiralPoint(gate.t),g=new T.Group();g.name=`abyss.gate.${gate.id}`;g.position.copy(v(p));g.rotation.y=spiralHeading(gate.t)*Math.PI/180;root.add(g);gates.set(gate.id,g);
  const leaf=new T.Mesh(new T.BoxGeometry(gate.halfW*2,gate.ceil-gate.floor,.65),m.rustSheet);leaf.position.y=(gate.ceil+gate.floor)/2;g.add(leaf);geometries.add(leaf.geometry);
  for(const x of [-gate.halfW+.3,gate.halfW-.3]){const o=new T.Mesh(new T.BoxGeometry(.5,gate.ceil-gate.floor,.85),m.hazard);o.position.set(x,(gate.ceil+gate.floor)/2,-.45);g.add(o);geometries.add(o.geometry);}photoTargets.set(gate.id,g);
 }
 bucket='O';colliders.push(new T.Box3(v(ABYSS_TABLE.min),v(ABYSS_TABLE.max)));
 // Bolted floor plinth and paired hydraulics support the Blender operating table.
 box([0,-11.78,0],[2.6,.44,6.4],m.frame,0,false);box([0,-10.6,0],[2.3,.25,4.8],m.indSteel,0,false);
 for(const z of [-1.8,1.8]){add(new T.CylinderGeometry(.36,.44,1.15,16),m.chrome,[0,-11.15,z]);for(const x of [-1,1])add(new T.CylinderGeometry(.08,.08,.12,8),m.brass,[x,-11.5,z],0,true);}
 for(const x of [-1.05,1.05]){pipe([x,-10.35,-2.1],[x,-10.35,2.1],.07,m.chrome);pipe([x,-11.7,-2.3],[x,-10.4,-2.3],.07,m.chrome);}
 for(const x of [-1.312,1.312])for(const z of [-1.6,1.6]){pipe([x,-8.58,z],[x,-8.1,z],.055,m.brass);box([x,-8.57,z],[.15,.1,.25],m.chrome);}
 pipe([1.53,-9.348,-.88],[0,-9.348,-.88],.065,m.chrome);box([.15,-9.348,-.88],[.5,.4,.4],m.indSteel);
 for(const z of [-.75,.8])box([0,-8.42,z],[2.34,.04,.035],hose,0);
 pipe([1.12,-11.55,-2.6],[1.12,-5.3,-2.6],.085,m.chrome);pipe([1.12,-5.3,-2.6],[0,-5.3,-.6],.075,m.chrome);
 add(new T.CylinderGeometry(.55,.72,.26,24),m.frame,[0,-5.45,-.6],0,true);const lampFace=new T.CircleGeometry(.62,24);lampFace.rotateX(Math.PI/2);add(lampFace,m.lampWarm,[0,-5.59,-.6],0,true);
 fixture([.3,-5.65,-.5],0,'warm',1.5,6);
 const cable=new T.CatmullRomCurve3([new T.Vector3(0,13,0),new T.Vector3(-2.5,11,-1),new T.Vector3(-3,5,-1),new T.Vector3(-2,-8,-1),new T.Vector3(0,-10,-1)]);add(new T.TubeGeometry(cable,36,.045,6,false),hose,[0,0,0],0,true);
 for(const r of [27.8,30.8]){ring([0,6.8,0],r,.23,m.frame);ring([0,8.1,0],r,.07,m.brass);}
 for(let i=0;i<32;i++){const a=i*Math.PI/16;pipe([Math.cos(a)*28,6.8,Math.sin(a)*28],[Math.cos(a)*28,8.2,Math.sin(a)*28],.06,m.brass);if(i%2===0)fixture([Math.cos(a)*29,5.8,Math.sin(a)*29],-a-Math.PI/2,'warm',12,20);}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;pipe([Math.cos(a)*31,-11,Math.sin(a)*31],[Math.cos(a)*31,6.5,Math.sin(a)*31],.55,m.pipe);}
 for(const y of [-6,3])ring([0,y,0],30.8,.3,m.pipe);
 for(let i=0;i<24;i++){const a=i*Math.PI/12;
  for(let j=0;j<8;j++){const f=j/8,f1=(j+1)/8,r=27*(1-f),r1=27*(1-f1);pipe([Math.cos(a)*r,7+7*Math.sin(f*Math.PI/2),Math.sin(a)*r],[Math.cos(a)*r1,7+7*Math.sin(f1*Math.PI/2),Math.sin(a)*r1],.18,m.rustSheet);}
  const rot=-a-Math.PI/2;box([Math.cos(a)*31.7,-2,Math.sin(a)*31.7],[4.8,12,.35],m.paintCream,rot);box([Math.cos(a)*31.35,-2,Math.sin(a)*31.35],[3.7,4.8,.2],m.darkGlass,rot);
  for(const yy of [-3.8,-2.8,-1.8,-.8])box([Math.cos(a)*31.18,yy,Math.sin(a)*31.18],[3.8,.15,.35],m.frame,rot);
  // The authored instrument bank replaces these generic low wall racks.
  // Keeping both makes their shelves cut through cabinet doors and handles.
  if(Math.abs(a-3.32)>.24){
   box([Math.cos(a)*30,-9,Math.sin(a)*30],[3,4,.8],m.rustSheet,rot);
   for(const yy of [-10,-8.4])box([Math.cos(a)*29.4,yy,Math.sin(a)*29.4],[3.1,.1,1],m.frame,rot);
  }
  if(i%3===0){fixture([Math.cos(a)*28,-6,Math.sin(a)*28],rot,'warm',14,18);fixture([Math.cos(a)*30,3.5,Math.sin(a)*30],rot,'warm',18,23);}
 }
 // Equipment helmets are inert, empty wall-mounted objects, never character models.
 for(let i=0;i<12;i++){const a=Math.PI*.8+i*.055,rot=-a-Math.PI/2,p:Vec3=[Math.cos(a)*29.15,-7.45,Math.sin(a)*29.15];box([Math.cos(a)*29.65,-8,Math.sin(a)*29.65],[1.3,2.2,.3],m.frame,rot);
  const shell=new T.SphereGeometry(.48,20,12);shell.scale(1,1.04,.9);add(shell,m.brass,p,rot,true);const normal=new T.Vector3(Math.sin(rot),0,Math.cos(rot));const front=v(p).addScaledVector(normal,.43).toArray() as unknown as Vec3;ring(front,.31,.065,m.chrome,'z',rot);add(new T.CircleGeometry(.265,20),m.darkGlass,front,rot,true);
  add(new T.CylinderGeometry(.4,.48,.2,16),m.rustSheet,[p[0],p[1]-.51,p[2]],0,true);pipe([p[0],p[1]-.5,p[2]],[p[0],-9.3,p[2]],.055,m.rubber);
 }
 // Two complete wall-mounted treatment stations establish the room's medical
 // scale. Their gantries carry pipes/cables only, with no floor or walkable deck.
 function treatmentBay(a:number,number:string){
  const rot=-a-Math.PI/2,origin:Vec3=[Math.cos(a)*29,0,Math.sin(a)*29];
  const p=(x:number,y:number,z:number):Vec3=>[origin[0]+x*Math.cos(rot)+z*Math.sin(rot),y,origin[2]-x*Math.sin(rot)+z*Math.cos(rot)];
  box(p(0,-7.3,0),[8.8,8.5,1.3],m.indSteel,rot);box(p(0,-7.3,.75),[4.4,6.7,.3],enamel,rot);
  const disk=new T.CylinderGeometry(2.1,2.1,.55,48);disk.rotateX(Math.PI/2);add(disk,m.frame,p(0,-6.8,1.05),rot,true);ring(p(0,-6.8,1.4),1.85,.17,m.brass,'z',rot);add(new T.CircleGeometry(1.65,48),m.darkGlass,p(0,-6.8,1.47),rot,true);
  for(const x of [-3.25,3.25]){add(new T.CylinderGeometry(.67,.67,6.5,24),enamel,p(x,-7,1),0,true);for(const y of [-9.8,-4.2])ring(p(x,y,1),.74,.09,m.frame);pipe(p(x,-3.7,1),p(x,3.8,.5),.22,m.pipe);pipe(p(x,3.8,.5),p(0,3.8,.5),.22,m.pipe);}
  box(p(0,-10.8,1.5),[5.7,.35,1.9],m.frame,rot);for(const x of [-2.5,2.5])pipe(p(x,-10.8,1.5),p(x,-11.8,1.5),.15,m.frame);
  for(const x of [-2.7,2.7]){box(p(x,-6.4,1.8),[1.1,1.4,.4],m.paintCream,rot);ring(p(x,-6.15,2.06),.35,.055,m.brass,'z',rot);add(new T.CircleGeometry(.29,24),m.porcelain,p(x,-6.15,2.09),rot);}
  box(p(0,4.2,0),[9.6,.7,1.2],m.frame,rot);for(const x of [-4.2,4.2])pipe(p(x,-11.8,-.2),p(x,4.5,-.2),.28,m.rustSheet);
  label(`治疗控制 ${number}`,p(0,-2.35,1.1),5,.85,rot,'#d4c5a1');fixture(p(-2,-2.8,2.1),rot,'warm',20,23);fixture(p(2,-2.8,2.1),rot,'warm',12,18);
 }
 treatmentBay(Math.PI*.88,'01');treatmentBay(Math.PI*1.34,'02');
 const drain=new T.Group();drain.name='abyss.drain.grate';root.add(drain);for(let x=-5.5;x<=5.5;x+=.65){const len=2*Math.sqrt(36-x*x),mesh=new T.Mesh(new T.BoxGeometry(.14,.23,len),m.frame);mesh.position.set(DRAIN.centre[0]+x,DRAIN.top,DRAIN.centre[2]);drain.add(mesh);geometries.add(mesh.geometry);}ring([DRAIN.centre[0],DRAIN.top,DRAIN.centre[2]],6,.25,m.brass);
 label('排水井 / -3 ↓',[DRAIN.centre[0],-11.6,DRAIN.centre[2]-5.6],5,1,0,'#c9bb88');
 for(let y=-18;y>-68;y-=8){bucket='D';ring([DRAIN.centre[0],y,DRAIN.centre[2]],5.8,.13,m.rustSheet);fixture([DRAIN.centre[0],y,DRAIN.centre[2]-5.7],0,'cyan',5,12);}
 const facility=createAbyssalFacilityDressing({materials:{frame:m.frame,paint:m.indSteel,cream:enamel,pipe:m.pipe,rubber:hose,glass:m.darkGlass,brass:m.brass,damage:damageMetal,lens:m.lampCyan},fixture:(p,yaw,color,strength,range)=>{const previous=bucket;bucket=abyssSpaceAt(p)??'O';fixture(p,yaw,color,strength,range);bucket=previous;}});
 root.add(facility.root);decorColliders.push(...facility.decorColliders);
 // Merge static geometry by space/material. Culling remains spatial; no thousand-draw-call dressing.
 for(const [key,b] of batches){const gs=b.geometries.map(g=>{const n=g.index?g.toNonIndexed():g; if(n!==g)g.dispose();return n;});const merged=mergeGeometries(gs,false);gs.forEach(g=>g.dispose());if(!merged)continue;geometries.add(merged);const mesh=new T.Mesh(merged,b.material);mesh.name=`abyss.batch.${key.split(':')[0]}`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
 const atmosphere=createAtmosphere(practicalLights.map(p=>({position:p.position as Vec3,color:p.color,intensity:p.intensity,flicker:'steady',seed:p.seed??0})));root.add(atmosphere.root);const focus=new T.Vector3();
 // The level-two near-camera snow is too dense for the 70 m pit. Keep the same
 // physical particle lighting but reduce both particle coverage and gain locally.
 atmosphere.root.traverse(o=>{if(o instanceof T.Points){o.geometry.setDrawRange(0,Math.floor(o.geometry.getAttribute('position').count*.34));const mat=o.material as T.ShaderMaterial;if(mat.defines?.GAIN)mat.defines.GAIN=(Number(mat.defines.GAIN)*.32).toFixed(3);}});
 const ambient=new T.HemisphereLight('#7a989d','#29261f',.12);root.add(ambient);
 const regionalLights:{light:T.Light;centre:T.Vector3;radius:number}[]=[];
 {const pos=spiralPoint(6.38+8*5/89,1.9,-8.3),light=new T.PointLight('#d9bb81',95,16,1.2);light.position.set(...pos);root.add(light);regionalLights.push({light,centre:v(pos),radius:70});}
 // Limited red pools expose lamp housings and pressure hardware while all
 // 144 authored beacon sources remain unchanged.
 for(const [a,y] of [[1.2,3],[1.2,-32],[2.85,-14],[2.85,-50],[4.45,3],[4.45,-32]]){const p=pitAt(a,30.5,y),light=new T.PointLight('#d6412b',27,12,1.4);light.position.set(...p);root.add(light);regionalLights.push({light,centre:v(PIT.centre),radius:80});}
 {const p=spiralPoint(5.2,0,3),light=new T.PointLight('#cdb58b',85,24,1.3);light.position.set(...p);root.add(light);regionalLights.push({light,centre:v(p),radius:65});}
 for(const y of [4,-10,-24,-38,-52]){const light=new T.PointLight('#929895',18,80,1.1);light.position.set(PIT.centre[0],y,PIT.centre[2]);root.add(light);regionalLights.push({light,centre:v(PIT.centre),radius:78});}
 const surgical=new T.SpotLight('#ded8c5',68,10,.63,.5,1.5);surgical.position.set(0,-5.7,-.6);surgical.target.position.set(0,-8.4,0);root.add(surgical,surgical.target);regionalLights.push({light:surgical,centre:new T.Vector3(),radius:64});
 for(let i=0;i<4;i++){const a=i*Math.PI/2,light=new T.PointLight('#aca697',22,60,1.2);light.position.set(Math.cos(a)*16,10,Math.sin(a)*16);root.add(light);regionalLights.push({light,centre:new T.Vector3(),radius:65});}
 addSurgeryLamp();
 function addSurgeryLamp(){const housing=new T.Mesh(new T.CylinderGeometry(1.4,1.8,.4,32),m.frame);housing.position.set(0,10.5,0);root.add(housing);geometries.add(housing.geometry);const lensMat=m.lampCyan.clone();lensMat.emissiveIntensity=.16;extraMaterials.push(lensMat);const lens=new T.Mesh(new T.CircleGeometry(1.55,32),lensMat);lens.rotation.x=Math.PI/2;lens.position.set(0,10.27,0);root.add(lens);geometries.add(lens.geometry);}
 // Authored Blender assets share the layout coordinates and never register hull collision.
 // Late results are disposed when a player has already left the level.
 const glbLoads:Promise<void>[]=[];
 function hero(file:string,placements:{position:Vec3;rotation:number;scale?:number}[]){
  if(typeof window==='undefined')return;
  glbLoads.push(new GLTFLoader().loadAsync(`/assets/level-03/${file}.glb`).then(gltf=>{
   const source=gltf.scene;source.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material]){extraMaterials.push(mat);for(const val of Object.values(mat))if(val instanceof T.Texture)textures.push(val);}o.castShadow=true;o.receiveShadow=true;}});
   if(disposed){source.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])mat.dispose();}});return;}
   for(const placement of placements){const object=source.clone(true);object.name=`abyss.blender.${file}`;object.position.set(...placement.position);object.rotation.y=placement.rotation;object.scale.setScalar(placement.scale??1);root.add(object);object.updateMatrixWorld(true);decorColliders.push(new T.Box3().setFromObject(object));}
  }).catch(error=>console.warn(`Abyssal asset unavailable: ${file}`,error)));
 }
 hero('abyssal-containment',[-.24,0,.24].flatMap(da=>[0,-24].map(y=>{const a=CAGE_07.angle+da;return {position:pitAt(a,33.7,y-3),rotation:-a-Math.PI/2};})));
 hero('abyssal-press',[{position:spiralPoint(7.19,5.7,-16),rotation:spiralHeading(7.19)*Math.PI/180,scale:.78},{position:spiralPoint(7.31,5.7,-15.6),rotation:spiralHeading(7.31)*Math.PI/180,scale:.78}]);
 hero('abyssal-surgical-table',[{position:[0,-10.5,0],rotation:Math.PI/2,scale:1.6}]);
 {const crane=ABYSS_SOLIDS.find(s=>s.id==='crane')!;
  // The derailed jib lies across the passage: glTF local +Z faces the pit,
  // exposing the drum/sheaves instead of presenting the narrow rail end-on.
  // The whole mesh stays within the unchanged radius 6 / height 10 blocker.
  hero('abyssal-collapsed-crane',[{position:[crane.centre[0],crane.floor,crane.centre[2]],rotation:Math.atan2(PIT.centre[0]-crane.centre[0],PIT.centre[2]-crane.centre[2])}]);
 }
 const ready=Promise.all([m.ready,...scanLoads,...glbLoads]).then(()=>undefined);
 return {root,colliders,decorColliders,interactables,itemBounds,photoTargets,gates,practicalLights,moodLights,optics:atmosphere.optics,ready,
  fogAt(p:Vec3){const space=abyssSpaceAt(p);return {color:space==='P'?'#151b16':space==='C'?'#081519':'#0c191b',density:space==='C'?.013:.021};},
  setFocus(p:Vec3){focus.set(...p);for(const {light,centre,radius} of regionalLights){if(light.userData.ratedIntensity===undefined)light.userData.ratedIntensity=light.intensity;light.intensity=focus.distanceTo(centre)<radius?Number(light.userData.ratedIntensity):0;}},
  update(s:AbyssalWorldState,_dt=0){for(const [id,o] of interactables)o.visible=!s.collected.includes(id);const sluice=gates.get('sluice')!;sluice.visible=!s.sluiceOpen;const press=gates.get('press')!;press.visible=s.pressClosed??!s.pressOpen;drain.visible=!s.drainOpen;atmosphere.update(s.time,focus);},
  dispose(){if(disposed)return;disposed=true;facility.dispose();geometries.forEach(g=>g.dispose());extraMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());atmosphere.dispose();m.dispose();root.clear();},
 };
}
export type AbyssalWorld=ReturnType<typeof createAbyssalWorld>;



