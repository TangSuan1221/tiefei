import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {spiralPoint,ABYSS_ITEMS,ABYSS_PHOTO_STATIONS,type Vec3} from '../../content/abyssal-lab-layout';

/** Borrowed materials: disposal is owned by the parent world. */
export interface AbyssalFacilityMaterials {
 frame:T.Material; paint:T.Material; cream:T.Material; pipe:T.Material;
 rubber:T.Material; glass:T.Material; brass:T.Material; damage:T.Material; lens:T.Material;
}
export interface AbyssalFacilityOptions {
 materials:AbyssalFacilityMaterials;
 fixture?:(position:Vec3,yaw:number,color:'warm'|'red'|'cyan',strength:number,range:number)=>void;
}
/** Entirely decorative equipment, confined to the Q outer recess / O wall bank.
 * No floors, platforms, NPC-side rooms, creatures or gameplay colliders. */
export function createAbyssalFacilityDressing({materials:m,fixture}:AbyssalFacilityOptions){
 const root=new T.Group();root.name='abyss.facility-dressing';
 const decorColliders:T.Box3[]=[],owned:T.BufferGeometry[]=[],ownedMaterials:T.Material[]=[],ownedTextures:T.Texture[]=[];
 const batches=new Map<string,{material:T.Material;geometry:T.BufferGeometry[]}>();let zone='Q';
 function add(g:T.BufferGeometry,mat:T.Material,p:Vec3,yaw=0){
  g.rotateY(yaw);g.translate(...p);g.computeBoundingBox();decorColliders.push(g.boundingBox!.clone());
  const key=zone+':'+mat.uuid;let b=batches.get(key);if(!b){b={material:mat,geometry:[]};batches.set(key,b);}b.geometry.push(g);
 }
 function box(p:Vec3,size:Vec3,mat:T.Material,yaw=0,rounded=false){
  const g=rounded?new RoundedBoxGeometry(...size,2,Math.min(.075,...size.map(v=>v*.14))):new T.BoxGeometry(...size);
  const uv=g.getAttribute('uv'),pos=g.getAttribute('position'),n=g.getAttribute('normal');
  for(let i=0;i<pos.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,ny>.5?pos.getX(i):nx>.5?pos.getZ(i):pos.getX(i),ny>.5?pos.getZ(i):pos.getY(i));}
  add(g,mat,p,yaw);
 }
 function pipe(a:Vec3,b:Vec3,r:number,mat=m.pipe){const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A),g=new T.CylinderGeometry(r,r,d.length(),12);const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2*Math.PI*r,uv.getY(i)*d.length());g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));add(g,mat,A.add(B).multiplyScalar(.5).toArray() as unknown as Vec3);}
 function ring(p:Vec3,r:number,tube:number,mat=m.frame,yaw=0){add(new T.TorusGeometry(r,tube,6,32),mat,p,yaw);}
 function local(origin:Vec3,yaw:number){return (x:number,y:number,z:number):Vec3=>[origin[0]+x*Math.cos(yaw)+z*Math.sin(yaw),origin[1]+y,origin[2]-x*Math.sin(yaw)+z*Math.cos(yaw)];}
 function flanged(p:Vec3,r:number,yaw:number){ring(p,r,.10,m.frame,yaw);for(let i=0;i<8;i++){const a=i*Math.PI/4,at=local(p,yaw);box(at(Math.cos(a)*r,Math.sin(a)*r,.09),[.10,.10,.08],m.brass,yaw);}}
 function plate(text:string,p:Vec3,width:number,height:number,yaw:number){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const c=canvas.getContext('2d')!;c.fillStyle='#b6b19f';c.fillRect(0,0,1024,160);c.fillStyle='#30332d';c.fillRect(10,10,1004,5);c.font='bold 72px sans-serif';c.textAlign='center';c.fillText(text,512,108,980);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;ownedTextures.push(texture);const mat=new T.MeshStandardMaterial({map:texture,roughness:1,metalness:0});ownedMaterials.push(mat);add(new T.PlaneGeometry(width,height),mat,p,yaw);
 }
 function gauge(p:Vec3,r:number,yaw:number){const at=local(p,yaw);ring(p,r,.04,m.frame,yaw);add(new T.CircleGeometry(r*.86,24),m.cream,at(0,0,.012),yaw);
  for(let i=0;i<9;i++){const a=(-.75+i*1.5/8)*Math.PI;pipe(at(Math.sin(a)*r*.68,Math.cos(a)*r*.68,.025),at(Math.sin(a)*r*.81,Math.cos(a)*r*.81,.025),.009,m.frame);}
  pipe(at(0,0,.035),at(-r*.43,r*.40,.035),.012,m.frame);
 }
 function pressureDoor(p:Vec3,r:number,yaw:number){
  const at=local(p,yaw),g=new T.CylinderGeometry(r,r,.32,32);g.rotateX(Math.PI/2);add(g,m.paint,p,yaw);flanged(p,r+.08,yaw);
  ring(at(0,0,.18),r*.91,.048,m.rubber,yaw);const pressed=new T.CylinderGeometry(r*.86,r*.90,.12,32);pressed.rotateX(Math.PI/2);add(pressed,m.cream,at(0,0,.22),yaw);
  pipe(at(0,0,.24),at(0,0,.47),.085,m.frame);ring(at(0,0,.48),r*.48,.06,m.brass,yaw);pipe(at(-r*.48,0,.48),at(r*.48,0,.48),.035,m.brass);pipe(at(0,-r*.48,.48),at(0,r*.48,.48),.035,m.brass);
  for(const yy of [-r*.45,r*.45]){box(at(r*.94,yy,.12),[.32,.36,.25],m.frame,yaw);pipe(at(r*1.06,yy-.25,.22),at(r*1.06,yy+.25,.22),.085,m.brass);}
  for(const a of [Math.PI*.5,Math.PI,Math.PI*1.5]){const x=Math.sin(a)*r*.92,y=Math.cos(a)*r*.92;box(at(x,y,.29),[.30,.17,.24],m.frame,yaw);pipe(at(x-.20,y,.43),at(x+.20,y,.43),.045,m.brass);}
 }

 // A complete sterilisation bank: anchored pressure vessel, loading cradle,
 // drain to pump, closed wash return, wall-mounted supply and overhead services.
 {const t=.56,yaw=-Math.PI-t-Math.PI/2,at=local(spiralPoint(t,12.8),yaw);
  box(at(0,-1.1,-.2),[6.5,6.7,.35],m.paint,yaw);for(const x of [-2.9,2.9]){box(at(x,-1,-.05),[.22,7,.25],m.frame,yaw);for(const y of [-4,1.8])box(at(x,y,.12),[.55,.4,.2],m.damage,yaw);}
  const body=new T.CylinderGeometry(1.32,1.32,2.1,32);body.rotateX(Math.PI/2);add(body,m.paint,at(-1.15,-1.25,.7),yaw);pressureDoor(at(-1.15,-1.25,1.84),1.2,yaw);
  const shoulder=new T.CylinderGeometry(1.37,1.37,.34,32);shoulder.rotateX(Math.PI/2);add(shoulder,m.frame,at(-1.15,-1.25,1.52),yaw);
  pipe(at(-2.47,-1.25,.8),at(-2.92,-1.25,.8),.17);pipe(at(-2.92,-1.25,.8),at(-2.92,-3.9,.8),.17);pipe(at(-2.92,-3.9,.8),at(-1.15,-3.9,.8),.17);
  ring(at(-2.92,-2.35,1.04),.25,.045,m.brass,yaw);box(at(-2.92,-2.35,.8),[.44,.5,.4],m.frame,yaw);
  const inletFlange=new T.TorusGeometry(.27,.06,6,20);inletFlange.rotateX(Math.PI/2);add(inletFlange,m.frame,at(-1.15,.22,.3),yaw);
  for(const x of [-2.05,-.25]){box(at(x,-3.55,.8),[.22,2.7,1.9],m.frame,yaw);box(at(x,-4.8,.8),[.7,.18,2.1],m.damage,yaw);}
  box(at(1.95,-.5,.35),[1.6,4.8,.9],m.cream,yaw,true);box(at(1.95,.65,.84),[1.15,.75,.045],m.glass,yaw);for(const yy of [-.3,-.8])gauge(at(1.95,yy,.88),.19,yaw);
  box(at(-1.15,.38,2.04),[2.45,.34,.06],m.frame,yaw);for(const x of [-1.95,-.35])pipe(at(x,.21,2.04),at(x,-.25,1.84),.035,m.frame);plate('STERILISER  /  02',at(-1.15,.38,2.08),2.3,.27,yaw);plate('PRESSURE / RETURN',at(1.95,-1.35,.83),1.25,.19,yaw);
  for(const x of [1.25,2.65])box(at(x,-.5,.83),[.035,4.5,.05],m.rubber,yaw);
  box(at(2.48,-1.8,.88),[.12,.5,.12],m.frame,yaw);
  for(const y of [-2.4,1.45])box(at(1.25,y,.87),[.18,.38,.12],m.brass,yaw);
  pipe(at(-1.15,-2.48,.6),at(-1.15,-4.35,.6),.16);pipe(at(-1.15,-4.35,.6),at(1.95,-4.35,.6),.16);box(at(1.95,-4.15,.65),[1.35,.9,1.2],m.paint,yaw,true);
  pipe(at(1.95,-3.7,.3),at(1.95,3.9,.3),.19);pipe(at(1.95,3.9,.3),at(-1.15,3.9,.3),.19);pipe(at(-1.15,3.9,.3),at(-1.15,.1,.3),.19);
  box(at(-1.2,-3.1,2.15),[2.9,.18,1.2],m.frame,yaw);for(const x of [-2.35,-.05])pipe(at(x,-3.1,2.45),at(x,-4.8,.85),.08,m.frame);
  fixture?.(at(.6,2.15,1.35),yaw,'warm',8,17);
 }
 // Twin ceiling services follow the curved recess; no cross-route arch/door.
 for(let t=.41;t<1.02;t+=.035){const out=(v:number)=>5+12*Math.sin(Math.PI*(v-.3)/.9);for(const delta of [1.05,2.15])pipe(spiralPoint(t,out(t)-delta,3.8),spiralPoint(Math.min(t+.035,1.02),out(Math.min(t+.035,1.02))-delta,3.8),delta<2?.29:.18);if(Math.round(t/.035)%3===0){box(spiralPoint(t,out(t)-1.6,4.15),[.2,.22,2.3],m.frame,-Math.PI-t-Math.PI/2);}}
 // Return rack: one dropped tray remains caught on its restraint chain. This
 // is a contained equipment failure, not random debris or a navigation block.
 {const t=.95,yaw=-Math.PI-t-Math.PI/2,at=local(spiralPoint(t,12.4),yaw);
  for(const x of [-2.1,2.1])for(const z of [0,1.5])pipe(at(x,-4.8,z),at(x,1.4,z),.09,m.frame);
  for(const y of [-4.4,-2.75,-1.1,.55]){box(at(0,y,.75),[4.4,.12,1.8],m.frame,yaw);for(const x of [-1.3,0,1.3]){box(at(x,y+.4,.7),[1.05,.65,1.3],m.cream,yaw,true);box(at(x,y+.38,1.37),[.6,.08,.025],m.frame,yaw);}}
  const tray=new T.BoxGeometry(1.2,.1,1.6);tray.rotateZ(-.48);add(tray,m.damage,at(-2.35,-3.45,1.25),yaw);pipe(at(-2.1,-2.75,1.5),at(-2.7,-3.2,1.25),.025,m.brass);
  pipe(at(-2.1,-4.5,0),at(2.1,1.2,0),.055,m.frame);fixture?.(at(1.8,1.7,1.4),yaw,'warm',8,13);
 }
 zone='O';
 // Asymmetric sealed service/observation panels: only centimetres of opaque
 // backdrop, not the NPC's side or a navigable balcony. Cable carriers have no floor.
 for(const [a,width,y] of [[3.03,5.8,2.9],[3.27,4.2,2.6],[3.49,5.3,3.2]]){
  const yaw=-a-Math.PI/2,at=local([Math.cos(a)*30.65,0,Math.sin(a)*30.65],yaw);
  box(at(0,y,0),[width,3.0,.65],m.frame,yaw,true);box(at(0,y,.35),[width-.5,2.4,.08],m.glass,yaw);
  for(const x of [-width*.25,width*.25]){box(at(x,y,.41),[.09,2.5,.12],m.brass,yaw);box(at(x,y-.85,.44),[.8,.2,.06],m.cream,yaw);}
  box(at(0,y-1.9,.15),[width,.5,1],m.paint,yaw);for(const x of [-width*.4,width*.4])pipe(at(x,y-1.9,0),at(x,y-3.2,-.7),.12,m.frame);
  if(a<3.1)fixture?.(at(width*.37,y+1.8,.4),yaw,'warm',6,16);else if(a>3.4)fixture?.(at(width*.37,y+1.8,.4),yaw,'warm',2,11);
 }
 for(let a=2.6;a<4.5;a+=.075){const next=Math.min(4.5,a+.075);for(const [r,y,thick] of [[30.8,5.75,.32],[30.2,5.5,.18],[29.8,5.4,.12]])pipe([Math.cos(a)*r,y,Math.sin(a)*r],[Math.cos(next)*r,y,Math.sin(next)*r],thick);if(Math.round(a/.075)%3===0){pipe([Math.cos(a)*31.8,6.1,Math.sin(a)*31.8],[Math.cos(a)*29.5,5.1,Math.sin(a)*29.5],.11,m.frame);}}
 // Medical instrument service bank between the two existing treatment stations.
 {const a=3.32,yaw=-a-Math.PI/2,at=local([Math.cos(a)*30.4,0,Math.sin(a)*30.4],yaw);
  box(at(0,-8.7,.35),[8.1,5.8,1.4],m.paint,yaw,true);
  for(const x of [-2.8,-.9,.9]){box(at(x,-8.6,1.1),[1.65,4.8,.12],m.cream,yaw,true);box(at(x+.53,-8.4,1.19),[.1,.65,.08],m.frame,yaw);for(const y of [-6.6,-10.6])box(at(x-.65,y,1.18),[.18,.35,.1],m.brass,yaw);}
  box(at(0,-10.1,1.7),[8.4,.22,1.2],m.frame,yaw);for(const x of [-3.6,3.6])pipe(at(x,-10.15,2.0),at(x,-11.7,.65),.12,m.frame);
  // Pressed door returns, dark gasket channels and anchored plinth make the
  // cupboard a manufactured cabinet, not four flat floating cream rectangles.
  for(const x of [-2.8,-.9,.9]){
   box(at(x,-8.6,1.20),[1.43,4.52,.06],m.rubber,yaw,true);box(at(x,-8.6,1.25),[1.31,4.38,.07],m.cream,yaw,true);
   box(at(x+.50,-8.4,1.33),[.12,.60,.14],m.frame,yaw,true);for(const y of [-7.2,-10.0]){box(at(x-.65,y,1.27),[.18,.38,.14],m.frame,yaw);pipe(at(x-.65,y-.24,1.35),at(x-.65,y+.24,1.35),.045,m.brass);}
  }
  // One glazed upper compartment and one lower drawer separate instrument
  // inspection from sealed clean storage without adding another repeated bank.
  box(at(-.9,-7.25,1.31),[1.02,1.13,.055],m.frame,yaw);box(at(-.9,-7.25,1.35),[.86,.94,.028],m.glass,yaw);
  for(const y of [-9.15,-9.8])box(at(.9,y,1.31),[1.25,.025,.035],m.frame,yaw);
  plate('STERILE',at(-2.8,-6.85,1.31),.95,.22,yaw);plate('INSTRUMENTS',at(-.9,-8.1,1.32),1.12,.20,yaw);plate('RETURN',at(2.8,-6.35,1.11),.9,.22,yaw);
  box(at(0,-11.65,.55),[8.2,.24,1.35],m.frame,yaw);for(const x of [-3.4,0,3.4]){box(at(x,-11.85,.55),[.75,.28,1.5],m.damage,yaw);box(at(x,-11.97,.6),[1.1,.035,1.8],m.damage,yaw+.04);}
  // Low accumulation is confined to the mounting feet and leaking return side.
  const deposit=new T.CylinderGeometry(1,1.06,.035,14);deposit.scale(1.5,1,.55);add(deposit,m.damage,at(3.7,-11.96,.8),yaw);
  // Two drain/suction receivers connect to the overhead service supply.
  for(const x of [-4.7,4.7]){const cylinder=new T.CylinderGeometry(.64,.64,3.5,24);add(cylinder,m.cream,at(x,-8,.3));pipe(at(x,-6.25,.3),at(x,5.5,.3),.22);for(const yy of [-9.3,-6.7]){box(at(x,yy,-.2),[1.7,.3,.8],m.frame,yaw);}}
  // One open service hatch with a still-attached cable loom establishes a local
  // repair/evacuation trace, rather than duplicating another clean cabinet.
  box(at(2.8,-8.2,1.11),[1.6,3.45,.08],m.frame,yaw);box(at(2.8,-8.2,1.17),[1.38,3.22,.04],m.rubber,yaw);
  for(const y of [-7.7,-9.15])box(at(2.8,y,1.34),[1.3,.10,.32],m.frame,yaw);
  // The door rotates about its actual right hinge; its bottom clears the bench.
  const hingeX=3.53,hingeZ=1.23,open=.82,doorWidth=1.4;
  box(at(hingeX-Math.cos(open)*doorWidth/2,-8.2,hingeZ+Math.sin(open)*doorWidth/2),[doorWidth,3.2,.14],m.paint,yaw+open,true);
  for(const y of [-7.1,-9.3])pipe(at(hingeX,y-.24,hingeZ),at(hingeX,y+.24,hingeZ),.075,m.brass);
  const handleX=hingeX-Math.cos(open)*1.15,handleZ=hingeZ+Math.sin(open)*1.15;box(at(handleX,-8.2,handleZ),[.11,.55,.18],m.frame,yaw+open);
  const curve=new T.CatmullRomCurve3([new T.Vector3(...at(2.6,-7.1,1.4)),new T.Vector3(...at(2.1,-9.4,1.65)),new T.Vector3(...at(3,-10.1,1.6))]);add(new T.TubeGeometry(curve,16,.035,6,false),m.rubber,[0,0,0]);
  fixture?.(at(-2.2,-5.3,2),yaw,'warm',8,18);
 }
 for(const [key,b] of batches){const parts=b.geometry.map(g=>{const p=g.index?g.toNonIndexed():g;if(p!==g)g.dispose();return p;});const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!merged)continue;owned.push(merged);const mesh=new T.Mesh(merged,b.material);mesh.name=`abyss.facility.${key.split(':')[0]}`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
 // Diagnostic metadata: these are conservative keep-clear distances, not hull
 // physics. Root must run production camera/navigation checks after integration.
 const interactionClearance=Math.min(...ABYSS_ITEMS.map(item=>Math.min(...decorColliders.map(b=>b.distanceToPoint(new T.Vector3(...item.position))))));
 const photographyClearance=Math.min(...ABYSS_PHOTO_STATIONS.map(item=>Math.min(...decorColliders.map(b=>b.distanceToPoint(new T.Vector3(...item.position))))));
 return {root,decorColliders,interactionClearance,photographyClearance,dispose(){owned.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());root.clear();}};
}
