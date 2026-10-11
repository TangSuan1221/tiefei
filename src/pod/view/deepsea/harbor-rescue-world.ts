import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {setHarborPigment} from './harbor-scanned-surfaces';
import {createHarborSign} from './harbor-sign-art';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {ExpeditionWorld} from './expedition-world';
import type {ReferenceMaterials} from './reference-materials';
import {createHarborRescueDressing} from './harbor-rescue-dressing';
import {createHarborFractureArt} from './harbor-fracture-art';
import {createEliasPoser,type EliasRig} from './harbor-elias-pose';
import {createHarborEliasSkin} from './harbor-elias-skin';
import {createHarborCreatureSkin} from './harbor-creature-skin';
type V=[number,number,number];
export const HARBOR_RESCUE_LAYOUT={observe:[60,0,27] as V,power:[42,0,28] as V,lure:[77,1,7] as V,elias:[57,-1.2,11] as V,monster:[64,-1.2,9] as V,cargo:[77,-1.2,9] as V,gate:[77,0,16] as V};
export interface HarborRescueVisualState {powered:boolean;gateOpen:boolean;bridgeExtended:boolean;monsterPosition?:V;eliasPosition?:V;monsterVisible?:boolean;rescued?:boolean;walking?:boolean;/** Story performance key for the survivor's acting; '' keeps the default idle. */eliasBeat?:string}
/** Presentation only. Caller owns progression, collision registration and interaction routing. */
export function createHarborRescueWorld(world:ExpeditionWorld,m:ReferenceMaterials){
 const root=new T.Group();root.name='harbor-rescue-world';world.root.add(root);
 const dressing=createHarborRescueDressing(root,m);
 const fractureArt=createHarborFractureArt(root,m);
 const solids:T.Box3[]=[...dressing.colliders],decor:T.Box3[]=[...dressing.decorColliders],owned:T.Material[]=[],geometries:T.BufferGeometry[]=[],textures:T.Texture[]=[];
 const anchors:ExpeditionWorld['anchors']=[];
 const panels=new Map<string,T.Group>();
 const signs:ReturnType<typeof createHarborSign>[]=[];
 const mat=(source:T.MeshStandardMaterial,color:string)=>{const a=source.clone();setHarborPigment(a,color);owned.push(a);return a;};
 const steel=mat(m.steel,'#343f41'),paint=mat(m.hull,'#82908a'),yellow=mat(m.yellow,'#c6a35f'),deck=mat(m.floor,'#424e4b'),suit=mat(m.cloth,'#b1a58c'),skin=mat(m.rubber,'#414a43');
 const frameSteel=mat(m.steel,'#10201e');frameSteel.roughness=.95;frameSteel.metalness=.15;
 const lightMat=new T.MeshStandardMaterial({color:'#d8bf83',emissive:'#d8a45c',emissiveIntensity:.8,roughness:.4});owned.push(lightMat);
 const helmetLamp=new T.MeshStandardMaterial({color:'#fff0c8',emissive:'#ffd98f',emissiveIntensity:2.2,roughness:.3});owned.push(helmetLamp);
 function mesh(g:T.BufferGeometry,material:T.Material,p:V,parent:T.Group=root){geometries.push(g);const o=new T.Mesh(g,material);o.position.set(...p);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
 function box(p:V,s:V,material:T.Material=steel,solid=false,parent:T.Group=root){const geometry=new T.BoxGeometry(...s),pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');for(let i=0;i<pos.count;i++)uv.setXY(i,Math.abs(normal.getX(i))>.5?pos.getZ(i):pos.getX(i),Math.abs(normal.getY(i))>.5?pos.getZ(i):pos.getY(i));const o=mesh(geometry,material,p,parent);if(solid)solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...p),new T.Vector3(...s)));return o;}
 function rounded(p:V,s:V,material:T.Material=paint,parent:T.Group=root){return mesh(new RoundedBoxGeometry(...s,2,Math.min(.09,...s.map(x=>x*.2))),material,p,parent);}
 function rod(a:V,b:V,r=.06,material:T.Material=steel,parent:T.Group=root){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa);if(d.lengthSq()<1e-10)return;const o=mesh(new T.CylinderGeometry(r,r,d.length(),8),material,aa.add(bb).multiplyScalar(.5).toArray() as V,parent);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
 function label(text:string,sub:string,p:V,w=3,parent:T.Group=root){const sign=createHarborSign(text,sub,w);sign.root.position.set(...p);parent.add(sign.root);signs.push(sign);return sign.root;}
 function anchor(name:string,view:V,target:V){const d=new T.Vector3(...target).sub(new T.Vector3(...view));anchors.push({room:'harbor.room.B',name,view,position:target,yaw:Math.atan2(-d.x,-d.z),pitch:Math.atan2(d.y,Math.hypot(d.x,d.z))});}
 const railWear=mat(m.steel,'#493d2f'),railPaint=mat(m.yellow,'#85724d');railPaint.roughness=.9;railPaint.metalness=.15;railPaint.roughnessMap=null;
 function fracturedStub(p:V,width:number,depth:number,height:number,north:boolean){
  fractureArt.addStub(p,width,depth,height,north);
  solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...p),new T.Vector3(width,height,depth)));
 }
 // The collapsed bulkhead has a genuine 2.4m viewing slit. A 3m-high hull cannot
 // cross it at any depth, while light and photography use the same visible gap.
 // A 12m breach breaks the frontage. In the breach, exposed short piles
 // replace the solid apron: visible gaps remain narrower than the hull beam.


 // Thin tensioned arrestor lines expose the deep shaft while retaining the
 // original hull operating layer. 2.335m clear slots are narrower than the hull.
 for(let x=33.2;x<90;x+=2.4){
  box([x,-3.006,29],[.012,.012,22],frameSteel,true);
  for(const z of [18.05,39.95])box([x,-3.04,z],[.22,.20,.42],steel);
 } // Opposed cantilevers cross the shaft horizontally, leaving a genuine 8m rupture.
 for(const [p,length,yaw] of [[[49.5,-2.72,20],13,-Math.PI/2],[[72.5,-2.72,20],17,Math.PI/2]] as const){
  const span=fractureArt.addStub([...p],3,length,.44,false,yaw);solids.push(...span.colliders);
 } // Tensioned anti-collision cables retain the hull exclusion envelope while
 // exposing the caisson silhouettes. Each line terminates in a real upper/lower beam.
 for(let x=33.2;x<90;x+=2.4){
  if(x>72&&x<82)continue; // Cargo entrance admits the full submarine hull.
  box([x,-2.5,18],[.018,47,.018],frameSteel,true);
  for(const y of [-25.8,20.98]){box([x,y,18],[.22,.36,.22],steel);rod([x,y-.35,18],[x,y+.35,18],.055,steel);}
 }
 for(const y of [-25.8,20.6])box([60,y,18],[56,.11,.18],frameSteel,true); label('断裂接驳层 / 禁止驶入','FRACTURED DECK — HULL CLEARANCE 2.4 M',[50,-1.72,21.64],3.3);
 // The survivor stays on the north platform. Rescue releases the inner
 // escape walkway, not a traversable bridge over the main rupture.
 // Separate tower-head galleries, connected only along the existing NPC route.
 for(const [x,z,r]of [[45,8,7.5],[61,6,9.1],[79,8,8.8]]){
  const g=new T.CylinderGeometry(r,r,.6,64),pos=g.getAttribute('position'),norm=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<pos.count;i++)if(Math.abs(norm.getY(i))>.5)uv.setXY(i,(pos.getX(i)+x)*.5,(pos.getZ(i)+z)*.5);else uv.setXY(i,uv.getX(i)*Math.PI*r,uv.getY(i)*.3);
  mesh(g,deck,[x,-1.5,z]);
  const count=Math.ceil(r*2/.3),step=r*2/count;
  for(let i=0;i<count;i++){const lo=-r+i*step,hi=lo+step,near=lo>0?lo:hi<0?-hi:0,extent=Math.sqrt(Math.max(0,r*r-near*near));solids.push(new T.Box3(new T.Vector3(x+lo,-1.8,z-extent),new T.Vector3(x+hi,-1.2,z+extent)));}
  for(const side of [-1,1]){rod([x+side*2.2,-1.8,z+Math.sqrt(r*r-4.84)-.4],[x+side*2.2,-8,z],.19,steel);}
 }
 box([70,-1.5,9],[4,.6,2.2],deck,true);
 box([53.35,-1.5,9.9],[1.9,.6,3.2],deck,true); // Original escape turn remains continuously supported.
 box([77.35,-1.5,8.5],[15.8,.6,15.5],deck,true); // Cargo enclosure footing matches its four existing walls.
 // The released walkway is strictly inside the north bank. It never repairs
 // the principal rupture or suggests the submarine can cross to the survivor.
 const bridge=new T.Group();bridge.name='rescue-north-inner-walkway';root.add(bridge);
 box([55,-1.18,11],[4.5,.06,1.0],deck,false,bridge);
 for(let x=52.9;x<57.2;x+=.3)box([x,-1.13,11],[.06,.035,.95],steel,false,bridge);
 for(const z of [10.55,11.45])box([55,-1.10,z],[4.5,.025,.035],yellow,false,bridge);
 // Glass-side handrail the survivor can steady himself on; stops short of the inner door turn.
 for(const x of [53.9,55.4,56.9])rod([x,-1.15,11.5],[x,-.25,11.5],.025,steel,bridge);rod([53.9,-.25,11.5],[56.9,-.25,11.5],.03,yellow,bridge);
 // Cargo isolation enclosure: west/north/east solid walls and a sliding south gate.
 box([69.7,2.1,8.5],[.5,7.2,15],paint,true);box([85,2.1,8.5],[.5,7.2,15],paint,true);box([77.35,2.1,1.3],[15.8,7.2,.5],steel,true);
 box([71.1,2.1,16],[2.8,7.2,.5],paint,true);box([83.5,2.1,16],[3.0,7.2,.5],paint,true);
 const gateMesh=new T.Group();gateMesh.name='rescue-isolation-gate';gateMesh.position.set(77,0,16);root.add(gateMesh);
 const gateOccluders:T.Box3[]=[];
 for(let x=-4.3;x<4.5;x+=.72){box([x,1.5,.24],[.12,5.4,.2],paint,false,gateMesh);gateOccluders.push(new T.Box3().setFromCenterAndSize(new T.Vector3(77+x,1.5,16.24),new T.Vector3(.12,5.4,.2)));}
 for(const y of [-.9,3.9]){box([0,y,.30],[9.4,.14,.13],yellow,false,gateMesh);gateOccluders.push(new T.Box3().setFromCenterAndSize(new T.Vector3(77,y,16.30),new T.Vector3(9.4,.14,.13)));}
 const gate={mesh:gateMesh,bounds:new T.Box3(new T.Vector3(72.3,-1.25,15.7),new T.Vector3(81.7,4.25,16.3)),occluders:gateOccluders};
 label('03 / 隔离货仓','CARGO ISOLATION — KEEP CLEAR',[77,3.1,18.91],4.8);
 for(const x of [72.7,82]){box([x,1.5,16.45],[.3,6.4,.6],steel,true);box([x,3.2,16.8],[.12,.9,.08],lightMat);}
 for(const p of [[73,-.25,4],[81,-.25,5],[82,-.25,10]] as V[]){rounded(p,[2,1.8,2],paint);for(const dx of [-.72,.72])box([p[0]+dx,p[1],p[2]+1.03],[.10,1.9,.05],yellow);}
 const indicators:T.Mesh[]=[];
 function panel(id:string,title:string,p:V,approach:V){const g=new T.Group();g.name=id;g.position.set(...p);g.userData.interactionId=id;g.userData.approach=approach;g.userData.interactionAnchor=[0,0,.19];g.userData.lookAt=[p[0],p[1],p[2]+.19];root.add(g);panels.set(id,g);
  rounded([0,-.1,0],[1.25,1.05,.3],steel,g);rounded([0,.14,.19],[1.03,.41,.09],paint,g);label(title,'REMOTE STATION',[0,.14,.246],.97,g);
  box([0,-1.4,-.1],[.32,1.6,.35],steel,false,g);box([0,-2.25,-.1],[1.0,.12,.8],steel,false,g);
  for(const x of [-.36,0,.36]){const b=mesh(new T.CylinderGeometry(.105,.105,.075,16),x===0?yellow:paint,[x,-.4,.22],g);b.rotation.x=Math.PI/2;}
  const indicator=box([.47,.42,.23],[.11,.07,.06],lightMat,false,g);indicators.push(indicator);
  // A narrow pedestal leaves room for the full hull's swept turn, not just
  // its final 45-degree pose. Keep the visible cabinet and collider aligned.
  g.scale.set(.5,1,.8);
  solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(p[0],p[1]-.3,p[2]+.04),new T.Vector3(.625,1.45,.4)));
  anchor(title,approach,[p[0],p[1],p[2]+.2]);return g;
 }
 panel('harbor.rescue.observe','01 / 闸机·接驳',[62.5,0,24.57],HARBOR_RESCUE_LAYOUT.observe);
 panel('harbor.rescue.power','02 / 配电箱',[44.5,0,25.57],HARBOR_RESCUE_LAYOUT.power);
 // Gate opening and closure both use the existing 01 terminal.
 // Cable routes stay on floor; dressing does not introduce invisible obstacles.
 for(const [x,z]of [[44.5,25.57],[62.5,24.57],[80.5,23.57]]){
  rod([x+.40,-1.1,z-.12],[x+.40,-25.65,z-.12],.055,m.rubber);
  rod([x+.40,-25.65,z-.12],[42,-25.65,z-.12],.055,m.rubber);
  for(let y=-2.3;y>-24;y-=2.4)box([x+.37,y,z-.12],[.13,.08,.16],steel);
 }
 solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(41,-.6,20.7),new T.Vector3(2.1,3.2,.65)));
 for(const x of [40.15,41.85])for(const z of [20.48,20.92]){box([x,-2.695,z],[.12,.99,.12],steel,true);box([x,-3.17,z],[.30,.06,.30],steel,true);}
 label('02 / 岸电恢复','AUXILIARY POWER',[41,1.18,21.15],2.4);
 function ellipsoid(p:V,s:V,material:T.Material,parent:T.Group){const o=mesh(new T.SphereGeometry(1,18,12),material,p,parent);o.scale.set(...s);return o;}
 function human():EliasRig{const g=new T.Group();g.name='rescue-elias';root.add(g);
  // A tired industrial diver: soft pressure suit, bent knees, uneven stance.
  // Parts hang from real joints so story beats can pose him (see harbor-elias-pose).
  const joint=(parent:T.Object3D,p:V,name:string)=>{const h=new T.Group();h.name=name;h.position.set(...p);parent.add(h);return h;};
  const hipY=.67,upper=joint(g,[0,hipY,-.03],'elias-upper'),U=(p:V):V=>[p[0],p[1]-hipY,p[2]+.03];
  ellipsoid(U([0,.99,-.02]),[.27,.37,.19],suit,upper);ellipsoid(U([0,.66,-.03]),[.23,.16,.18],suit,upper);
  const head=joint(upper,U([0,1.27,.0]),'elias-head');
  const helmet=ellipsoid([-.015,.20,.03],[.245,.265,.23],paint,head);helmet.rotation.z=.1;
  ellipsoid([-.015,.21,.222],[.174,.132,.053],m.glass,head);
  box([0,.33,.225],[.12,.07,.07],steel,false,head);box([0,.33,.262],[.085,.045,.012],helmetLamp,false,head);
  const collar=mesh(new T.TorusGeometry(.186,.04,8,24),steel,U([0,1.27,.015]),upper);collar.rotation.x=Math.PI/2;
  const arms:EliasRig['arms']=[],legs:EliasRig['legs']=[];
  for(const s of [-1,1]){
   const thigh=.32,shin=.265,hip=joint(g,[s*.135,hipY,-.035],'elias-hip');
   rod([0,0,0],[0,-thigh,0],.108,suit,hip);const knee=joint(hip,[0,-thigh,0],'elias-knee');
   ellipsoid([0,0,0],[.113,.115,.11],m.rubber,knee);rod([0,0,0],[0,-shin,0],.079,suit,knee);
   const foot=joint(knee,[0,-shin,0],'elias-foot');rounded([0,-.02,.1],[.22,.15,.37],m.rubber,foot);
   legs.push({hip,knee,foot,side:s,thigh,shin});
   const upperArm=.31,fore=.29,shoulder=joint(upper,U([s*.245,1.16,0]),'elias-shoulder');
   ellipsoid([0,0,0],[.12,.14,.14],suit,shoulder);rod([0,0,0],[0,-upperArm,0],.08,suit,shoulder);
   const elbow=joint(shoulder,[0,-upperArm,0],'elias-elbow');ellipsoid([0,0,0],[.085,.09,.085],m.rubber,elbow);rod([0,0,0],[0,-fore,0],.072,suit,elbow);
   const hand=joint(elbow,[0,-fore,0],'elias-hand');ellipsoid([0,-.06,0],[.09,.115,.06],m.rubber,hand);
   arms.push({shoulder,elbow,hand,side:s,upper:upperArm,fore});
   box(U([s*.17,1.11,.163]),[.065,.30,.035],yellow,false,upper);
  }
  rounded(U([.015,1.0,.19]),[.24,.21,.07],steel,upper);box(U([.015,1.0,.231]),[.13,.035,.01],lightMat,false,upper);
  for(const x of [-.115,.115]){const tank=mesh(new T.CapsuleGeometry(.105,.42,5,12),steel,U([x,1.03,-.27]),upper);tank.rotation.z=x<0?-.05:.05;rod(U([x,1.33,-.25]),U([x,1.4,-.2]),.024,yellow,upper);}
  rod(U([-.2,1.43,.09]),U([-.32,1.20,.19]),.027,m.rubber,upper);rod(U([-.32,1.20,.19]),U([-.23,.95,.22]),.027,m.rubber,upper);rod(U([-.23,.95,.22]),U([.02,.93,.21]),.027,m.rubber,upper);
  for(const y of [.87,1.03])rod(U([-.22,y,.11]),U([.22,y,.11]),.022,steel,upper);
  return {root:g,upper,head,arms,legs};
 }
 const eliasRig=human(),elias=eliasRig.root;elias.position.set(...HARBOR_RESCUE_LAYOUT.elias);
 const eliasSkin=createHarborEliasSkin(eliasRig);
 const eliasPose=createEliasPoser(eliasRig,{pod:HARBOR_RESCUE_LAYOUT.observe,door:HARBOR_RESCUE_LAYOUT.monster,gate:HARBOR_RESCUE_LAYOUT.gate});
 const monster=new T.Group();monster.name='rescue-acoustic-creature';root.add(monster);monster.position.set(...HARBOR_RESCUE_LAYOUT.monster);
 // Uneven amphibious anatomy; limbs fold through actual joints rather than
 // radiating as identical rods from one spherical primitive.
 const torso=ellipsoid([0,1.04,-.05],[.48,.59,1.04],skin,monster);torso.rotation.z=.11;
 ellipsoid([.04,1.25,.56],[.61,.42,.53],skin,monster);
 const head=ellipsoid([.06,1.06,1.08],[.32,.34,.52],skin,monster);head.rotation.x=.19;
 ellipsoid([.08,.88,1.43],[.22,.11,.26],skin,monster);
 for(const side of [-1,1]){
  const shoulder:V=[side*.42,1.32,.48],elbow:V=[side*(side<0?.91:1.15),.58,side<0?.65:.90],wrist:V=[side*(side<0?1.04:1.19),.08,side<0?1.42:1.65];
  ellipsoid(shoulder,[.23,.27,.26],skin,monster);rod(shoulder,elbow,.135,skin,monster);ellipsoid(elbow,[.15,.13,.17],skin,monster);rod(elbow,wrist,.065,skin,monster);ellipsoid(wrist,[.13,.06,.22],skin,monster);
  const hip:V=[side*.30,.85,-.72],knee:V=[side*.67,.46,-1.18],foot:V=[side*.81,.07,-.64];rod(hip,knee,.14,skin,monster);ellipsoid(knee,[.16,.15,.18],skin,monster);rod(knee,foot,.071,skin,monster);
  for(let n=0;n<3;n++){rod(wrist,[wrist[0]+(n-1)*.11,.04,wrist[2]+.28+n*.025],.023,skin,monster);rod(foot,[foot[0]+(n-1)*.08,.03,foot[2]+.21],.024,skin,monster);}
 }
 const crest=mat(m.cloth,'#536055');
 for(let i=0;i<8;i++){const z=-.85+i*.23,y=1.55+Math.sin(i/7*Math.PI)*.09;ellipsoid([.025,y,z],[.075,.15+Math.sin(i)*.025,.13],crest,monster);}
 for(const side of [-1,1])for(let i=0;i<5;i++){const z=-.6+i*.23;rod([side*.38,1.41,z],[side*.49,1.14,z+.10],.027,crest,monster);}
 rod([0,.72,-.95],[.11,.38,-1.50],.12,skin,monster);rod([.11,.38,-1.50],[.40,.08,-1.9],.06,skin,monster);
 const creatureSkin=createHarborCreatureSkin(monster);
 // A service alcove frames the survivor without identity-revealing decoration.
 for(const x of [55,59])box([x,.2,10.8],[.14,3.0,.25],paint);
 box([57,1.7,10.8],[4.15,.15,.3],paint);label('04 / 维修接驳','EMERGENCY TRANSFER',[57,1.2,10.97],2.6);
 // An actual inner escape doorway gives the survivor's exit a visible destination.
 const innerDoor=new T.Group();innerDoor.name='rescue-inner-escape-door';innerDoor.position.set(53,-1.2,9.5);root.add(innerDoor);
 for(const x of [-.75,.75])box([x,1.35,0],[.22,2.7,.48],paint,false,innerDoor);
 box([0,2.65,0],[1.72,.22,.48],paint,false,innerDoor);
 const innerLeaf=new T.Group();innerLeaf.name='rescue-inner-door-leaf';innerDoor.add(innerLeaf);
 rounded([0,1.25,0],[1.28,2.45,.15],steel,innerLeaf);
 rounded([0,1.63,.10],[.60,.60,.07],m.glass,innerLeaf);
 rod([.65,.80,.12],[.65,1.2,.12],.045,yellow,innerLeaf);
 label('内侧逃生通道','INNER PASSAGE',[53,1.90,9.76],3.0);
 // Short returned walls frame the view into the existing north platform.
 for(const x of [52.1,53.9])box([x,.2,7.8],[.18,2.8,3.4],paint);
 box([53,1.6,7.8],[2.0,.15,3.4],steel);box([53,-1.16,7.8],[2.0,.08,3.4],deck);
 const escapeLamp=new T.MeshStandardMaterial({color:'#ffe2a9',emissive:'#f3b965',emissiveIntensity:1.6,roughness:.5});owned.push(escapeLamp);box([53,1.38,7.4],[.8,.08,.3],escapeLamp);
 const escapeLight=new T.PointLight('#f0bd7b',0,5,2);escapeLight.position.set(53,.9,8.5);root.add(escapeLight);
 const addedLights:ExpeditionWorld['practicalLights']=[{room:'harbor.room.B',position:[57,2.7,12],color:'#a4b9ad',intensity:11,range:10},{room:'harbor.room.B',position:[77,5.4,17],color:'#c7b182',intensity:15,range:13}];world.practicalLights.push(...addedLights);
 // A restrained photographic side fill separates the recorded animal from
 // the dark bulkhead. The animal remains hidden from live observation.
 const recordRim=new T.PointLight('#9fae9d',0,5.5,2);root.add(recordRim);
 let disposed=false,lastVisualTime:number|undefined;
 function update(state:HarborRescueVisualState,time:number){const dt=lastVisualTime===undefined?1.2:Math.max(0,time-lastVisualTime);lastVisualTime=time;const approach=(current:number,target:number,speed:number)=>current+Math.sign(target-current)*Math.min(Math.abs(target-current),speed*dt);gateMesh.position.y=approach(gateMesh.position.y,state.gateOpen?5.7:0,5.7/1.2);innerLeaf.position.x=approach(innerLeaf.position.x,state.bridgeExtended?-1.55:0,1.55/1.2);escapeLight.intensity=state.bridgeExtended?7:0;bridge.visible=state.bridgeExtended;monster.visible=state.monsterVisible===true;monster.position.set(...(state.monsterPosition??HARBOR_RESCUE_LAYOUT.monster));recordRim.position.copy(monster.position).add(new T.Vector3(-1.8,2.0,-.3));recordRim.intensity=state.monsterVisible?5.5:0;elias.visible=!state.rescued;eliasPose.update(state.eliasPosition??HARBOR_RESCUE_LAYOUT.elias,!!state.walking,state.eliasBeat??'',time,dt);eliasSkin.update();creatureSkin.update(time);torso.rotation.z=Math.sin(time*1.8)*.025;head.rotation.y=Math.sin(time*.65)*.09;for(const i of indicators)i.scale.x=state.powered?1:.4;lightMat.emissiveIntensity=state.powered?1.2:.3;}
 // Batch immobile root meshes only; articulated characters, doors, signs and
 // interaction groups retain their identity and raycast behaviour.
 const staticBatches=new Map<T.Material,T.BufferGeometry[]>();
 for(const o of [...root.children]){if(!(o instanceof T.Mesh)||Array.isArray(o.material))continue;o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();const list=staticBatches.get(o.material)??[];list.push(flat);staticBatches.set(o.material,list);root.remove(o);}
 for(const [material,parts]of staticBatches){const g=mergeGeometries(parts);for(const part of parts)part.dispose();if(!g)continue;geometries.push(g);const o=new T.Mesh(g,material);o.castShadow=o.receiveShadow=true;root.add(o);}
 update({powered:false,gateOpen:false,bridgeExtended:false},0);
 function dispose(){if(disposed)return;disposed=true;creatureSkin.dispose();eliasSkin.dispose();dressing.dispose();fractureArt.dispose();for(const sign of signs)sign.dispose();root.removeFromParent();for(const g of geometries)g.dispose();for(const mm of owned)mm.dispose();for(const tx of textures)tx.dispose();for(const l of addedLights){const index=world.practicalLights.indexOf(l);if(index>=0)world.practicalLights.splice(index,1);}}
 return{root,solids,decor,anchors,panels,gate,monster,elias,bridge,innerDoor,update,dispose};
}
