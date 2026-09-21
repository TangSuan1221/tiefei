import * as T from 'three';
import type {ArmState} from '../../sim/manipulator';

/** Camera-mounted hydraulic manipulator, rendered with scene lighting and depth. */
export function createSalvageArm(){
 const root=new T.Group();root.name='hydraulic-salvage-arm';
 const paint=new T.MeshStandardMaterial({color:0x8b7946,metalness:.65,roughness:.58});
 const steel=new T.MeshStandardMaterial({color:0x929c9e,metalness:.88,roughness:.29});
 const rubber=new T.MeshStandardMaterial({color:0x101817,roughness:.94});
 const dark=new T.MeshStandardMaterial({color:0x293638,metalness:.7,roughness:.6});
 const boltGeo=new T.CylinderGeometry(.013,.013,.015,6);
 function rod(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,mat:T.Material){
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,1,12),mat);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=a.distanceTo(b);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
  mesh.castShadow=true;parent.add(mesh);return mesh;
 }
 const sections=[new T.Group(),new T.Group()];root.add(...sections);
 for(const g of sections){
  rod(g,new T.Vector3(),new T.Vector3(0,1,0),.07,paint);
  rod(g,new T.Vector3(.09,.08,0),new T.Vector3(.09,.58,0),.036,dark);
  rod(g,new T.Vector3(.09,.4,0),new T.Vector3(.09,.94,0),.018,steel);
  for(const y of [.10,.22,.78,.9]){
   const collar=new T.Mesh(new T.CylinderGeometry(.078,.078,.035,16),dark);collar.position.y=y;g.add(collar);
  }
  for(const side of [-1,1]){
   const curve=new T.CatmullRomCurve3([new T.Vector3(-.07,.05,side*.04),new T.Vector3(-.12,.32,side*.06),new T.Vector3(-.10,.72,side*.04),new T.Vector3(-.07,.96,side*.04)]);
   g.add(new T.Mesh(new T.TubeGeometry(curve,18,.009,6,false),rubber));
  }
 }
 const joints=[new T.Group(),new T.Group(),new T.Group()];root.add(...joints);
 joints.forEach(g=>{
  const axle=new T.Mesh(new T.CylinderGeometry(.11,.11,.18,20),dark);axle.rotation.z=Math.PI/2;g.add(axle);
  for(const side of [-1,1])for(let i=0;i<6;i++){
   const a=i*Math.PI/3,b=new T.Mesh(boltGeo,steel);b.rotation.z=Math.PI/2;b.position.set(side*.098,Math.cos(a)*.075,Math.sin(a)*.075);g.add(b);
  }
 });
 const fingers=[new T.Group(),new T.Group(),new T.Group()];
 fingers.forEach((g,i)=>{
  joints[2].add(g);g.rotation.z=i*Math.PI*2/3;
  const a=new T.Vector3(.07,0,0),b=new T.Vector3(.16,0,-.18),c=new T.Vector3(.045,0,-.33);
  rod(g,a,b,.025,steel);rod(g,b,c,.022,dark);
  for(let j=0;j<4;j++){const tooth=new T.Mesh(new T.BoxGeometry(.025,.018,.025),steel);tooth.position.set(.12-j*.018,0,-.20-j*.026);g.add(tooth);}
 });
 return {root,dispose(){
  const geometries=new Set<T.BufferGeometry>();
  root.traverse(o=>{if(o instanceof T.Mesh)geometries.add(o.geometry);});
  geometries.forEach(g=>g.dispose());
  [paint,steel,rubber,dark].forEach(m=>m.dispose());root.removeFromParent();
 },update(arm:ArmState,time:number,anchor?:T.Vector3,normal=new T.Vector3(0,0,1)){
  root.visible=arm.phase!=='stowed'&&arm.phase!=='gone';if(!root.visible)return;
  const out=arm.out;
  const a=new T.Vector3(.68,-.55,-.12);
  // The wrist stays outside the surface by more than the complete claw length.
  // Approach and retreat follow the same bent path to a fixed world-space latch.
  const goal=anchor?anchor.clone().addScaledVector(normal,.40):new T.Vector3(.06,-.08,-2.3);
  const c=new T.Vector3(.60,-.48,-.45).lerp(goal,T.MathUtils.smoothstep(out,0,1));
  const b=a.clone().lerp(c,.5).addScaledVector(normal,.28*Math.sin(Math.PI*out/2));
  b.x+=.20*Math.sin(Math.PI*out);
  joints[2].quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),normal.clone().negate());
  [a,b,c].forEach((p,i)=>joints[i].position.copy(p));
  [[a,b],[b,c]].forEach(([p,q],i)=>{const g=sections[i];g.position.copy(p);g.scale.y=p.distanceTo(q);g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.clone().sub(p).normalize());});
  fingers.forEach((g,i)=>{g.rotation.y=arm.phase==='gripping'?Math.sin(time*5)*.18:arm.phase==='hauling'?-.25:.25;g.rotation.z=i*Math.PI*2/3;});
 }};
}
