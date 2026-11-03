import * as T from 'three';
import {documentMesh,paperWear} from './living-signage';
import {Batcher} from './living-build';
import {Kit} from './living-props';
import type {LivingMaterials} from './living-materials';
/** Compact work faces along the forward route. All fine dressing is visual-only. */
export function buildSurveyFixtures(groups:Map<string,T.Group>,m:LivingMaterials){
 const owned:{dispose():void}[]=[],interactables=new Map<string,T.Object3D>(),photoTargets=new Map<string,T.Object3D>();
 const solids:T.Box3[]=[];
 const box=(space:string,p:number[],size:number[],mat:T.Material)=>{const geo=new T.BoxGeometry(...size as [number,number,number]);owned.push(geo);const o=new T.Mesh(geo,mat);o.position.set(...p as [number,number,number]);o.castShadow=o.receiveShadow=true;groups.get(space)!.add(o);return o;};
 const label=(space:string,p:[number,number,number],yaw:number,w:number,h:number,lines:string[],id?:string)=>{
  const d=documentMesh(w,h,1024,(c,W,H)=>{c.fillStyle='#afb7a8';c.fillRect(0,0,W,H);c.fillStyle='#182a29';c.fillRect(12,12,W-24,H*.2);c.fillStyle='#e1d8bc';c.font=`bold ${Math.floor(Math.min(W*.042,H*.12))}px sans-serif`;c.fillText(lines[0],W*.06,H*.15);c.fillStyle='#182a29';c.font=`bold ${Math.floor(Math.min(W*.037,H*.12))}px sans-serif`;lines.slice(1).forEach((v,i)=>c.fillText(v,W*.06,H*(.36+i*.16)));paperWear(c,W,H,90,.3);},{name:id??'survey-wayfinding'});owned.push(d);d.mesh.position.set(...p);d.mesh.rotation.y=yaw;groups.get(space)!.add(d.mesh);if(id){d.mesh.userData.interactionId=id;interactables.set(id,d.mesh);photoTargets.set(id,d.mesh);}return d.mesh;
 };
 // Painted navigation datum on the actual jambs and deck: no floating HUD arrows.
 for(const d of [
  {space:'C1',axis:'z',at:12,from:49,to:57},
  {space:'R2',axis:'x',at:64,from:22,to:30},
  {space:'C8',axis:'x',at:96,from:22,to:30},
  {space:'R4',axis:'x',at:120,from:13,to:21},
 ]){
  const mid=(d.from+d.to)/2, p=(a:number,y:number,b:number)=>d.axis==='x'?[a,y,b]:[b,y,a];
  // Twin short paint rails reserve a 3.4 m centre lane before the door, exposing
  // the hull margin instead of suggesting the whole room width is navigable.
  for(const side of [-1,1])for(let i=0;i<4;i++)box(d.space,p(d.at-1.1-i*1.5,-2.975,mid+side*1.7),d.axis==='x'?[.9,.025,.1]:[.1,.025,.9],m.bandYellow);
  for(let i=0;i<4;i++)box(d.space,p(d.at-.8-i*1.5,-2.97,mid),d.axis==='x'?[.55,.025,.16]:[.16,.025,.55],m.porcelain);
  for(const edge of [d.from+.09,d.to-.09])for(let j=0;j<5;j++)box(d.space,p(d.at-.36,-2.5+j,edge),d.axis==='x'?[.025,.3,.16]:[.16,.3,.025],j%2?m.porcelain:m.bandYellow);
  box(d.space,p(d.at-.36,2.4,mid),d.axis==='x'?[.025,.12,1.0]:[1.0,.12,.025],m.porcelain);
  label(d.space,p(d.at-.38,2.78,mid) as [number,number,number],d.axis==='x'?-Math.PI/2:Math.PI,2.6,.46,['通航中心 · 净高 5.5m','ALIGN CENTRE / 3.4m LANE']);
 }
 // Battery moved into the repair bay: low shelf supports the existing interaction envelope.
 box('R2',[56,-.88,30.5],[1.2,.12,1],m.frame);
 for(const x of [55.55,56.45])box('R2',[x,-1.95,30.7],[.12,2,.16],m.frame);
 // Shutter leaf is structural and its bounds are separately driven by the site.
 const leaf=box('C5',[128.5,-.25,42],[8.4,5.5,.34],m.indSteel);leaf.name='living-survey-password-door';
 for(const x of [124.55,132.45])box('C5',[x,-.25,41.75],[.18,5.5,.24],m.frame);
 for(const y of [-2,-.9,.2,1.3]){const rib=box('C5',[128.5,y,41.79],[8.1,.12,.1],m.frame);leaf.attach(rib);}
 const gate={mesh:leaf as T.Object3D,bounds:new T.Box3(new T.Vector3(124.3,-3,41.83),new T.Vector3(132.7,2.5,42.17))};
 const lock=box('C5',[132.4,0,38],[.22,1.1,.8],m.frame);lock.name='living.survey.lock';lock.userData.interactionId=lock.name;interactables.set(lock.name,lock);
 label('C5',[132.26,.15,38],-Math.PI/2,.65,.8,['F-03','REMOTE AUTH','人员侧授权 · 门旁确认']);
 label('C5',[128.5,1.5,41.78],Math.PI,3.3,.65,['中庭隔离门 / F-03','向艾里亚斯请求授权码']);
 // A single work face: pipe identity is repeated with colour AND text, no colour-only puzzle.
 for(const [z,band,code] of [[10,m.bandRed,'V-1'],[13.5,m.bandYellow,'V-2'],[17,m.bandBlue,'V-3']] as const){
  box('G',[141.7,0,z],[.22,5.5,.24],m.pipe);box('G',[141.54,-1.4,z],[.18,.22,.32],band);
  label('G',[141.32,.65,z],-Math.PI/2,1.15,.38,[code,code==='V-2'?'含硫温水':'循环回路']);
 }
 label('G',[141.30,1.65,13.5],-Math.PI/2,3.2,1.15,['供水检修 / WATER SERVICE','V-1 供热回流 · 保持开启','S / V-2 含硫温水 · 关闭隔离','V-3 冷却回流 · 保持开启'],'living.photo.sulfur');
 // The instrument rests in a bolted recovery cradle, not in open water. Its interaction
 // envelope remains unchanged; all support stays below the cruise hull's lower surface.
 box('S',[10,-1.52,11.5],[2.5,.12,.72],m.frame);
 box('S',[9.1,-2.2,11.6],[.65,1.3,.6],m.indGreen);
 box('S',[9.1,-1.95,11.24],[.6,.2,.06],m.trim);
 box('S',[9.1,-2.35,11.24],[.6,.25,.06],m.trim);
 for(const x of [9.49,10.51])box('S',[x,-1.42,11.5],[.08,.2,.72],m.bandYellow);
 for(const x of [9.6,10.4]){box('S',[x,-2.2,11.74],[.09,1.3,.12],m.frame);box('S',[x,-2.86,11.8],[.4,.08,.55],m.frame);}
 const db=new Batcher('living-interrupted-camera-service');owned.push(db);const dk=Kit.at(db,[10,-1.46,11.5],0);
 dk.box([-1,0,0],[.35,.09,.32],m.frame);dk.box([-1,.06,0],[.25,.03,.23],m.darkGlass);
 dk.rod([-.45,.2,0],[-.75,.1,0],.018,m.rubber,8);dk.rod([-.75,.1,0],[-1,.1,.05],.018,m.rubber,8);
 dk.box([.95,.04,.08],[.42,.07,.3],m.bandYellow,[0,.18,.25]);
 for(let j=0;j<3;j++)dk.cyl([.7+j*.1,.03,-.12],.025,.025,.03,m.chrome,8);
 // The removed service cover belongs to the open test receiver: gasket groove,
 // captive screws and a cable ending at the meter make the interrupted procedure legible.
 dk.box([.95,.085,.08],[.33,.015,.22],m.rubber,[0,.18,.25]);
 for(const x of [.8,1.1])dk.cyl([x,.11,.06],.022,.022,.035,m.chrome,6);
 dk.cyl([-.5,.17,-.12],.055,.055,.12,m.chrome,12,[Math.PI/2,0,0]);
 dk.rod([-1,.12,.05],[-1.15,.18,.3],.025,m.rubber,10);
 dk.rod([-1.15,.18,.3],[-1.15,.6,.7],.025,m.rubber,10);
 dk.rod([-1.15,.6,.7],[-.2,.8,1.08],.025,m.rubber,10);
 // Folded steel edge and recessed drawer pulls instead of unbroken box faces.
 for(const x of [-1.22,1.22])dk.box([x,-.08,0],[.035,.12,.72],m.trim);
 for(const y of [-.49,-.89]){dk.box([-.9,y,-.31],[.28,.06,.055],m.rubber);dk.rod([-1.02,y,-.35],[-.78,y,-.35],.018,m.chrome,8);}
 db.build(groups.get('S')!);
 const tetherGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(10,-1.5,11.5),new T.Vector3(10.2,-2.3,11.8),new T.Vector3(10,-2.65,11.75)]);owned.push(tetherGeo);const tether=new T.Line(tetherGeo,new T.LineBasicMaterial({color:'#474d43'}));owned.push(tether.material);groups.get('S')!.add(tether);
 // Entrance transfer system: pressure feed above, severed return hose on the landing,
 // opened junction cover and maintenance tag. The corpse lies at the failed service point.
 const eb=new Batcher('living-entry-transfer-chain');owned.push(eb);const ek=Kit.at(eb,[12,-3,13],0);
 ek.rod([0,2.5,-.1],[0,5.4,-.1],.19,m.pipe,24);
 ek.rod([0,5.4,-.1],[-7.5,5.4,-.1],.19,m.pipe,24);
 for(const x of [-7,-4,-1]){ek.box([x,5.4,.15],[.16,.65,.3],m.frame);ek.ring([x,5.4,-.1],.23,.035,m.chrome,[0,Math.PI/2,0],24);}
 ek.box([-2.2,2.5,.05],[.65,1.2,.22],m.indGreen);
 ek.box([-2.7,2.5,-.12],[.65,1.2,.06],m.indGreen,[0,-.8,0]);
 // Recessed terminal rail remains visible in front of the backplate.
 ek.box([-2.2,2.5,-.075],[.55,.98,.055],m.rubber);
 for(let j=0;j<4;j++){const x=-2.4+j*.13;ek.box([x,2.8,-.13],[.085,.16,.09],m.porcelain);ek.rod([x,2,-.12],[x,2.72,-.12],.018,j%2?m.bandBlue:m.bandRed,8);}
 for(const y of [2.05,2.95])ek.cyl([-2.52,y,-.1],.035,.035,.15,m.chrome,10,[Math.PI/2,0,0]);
 ek.rod([-2.2,2,-.12],[-2.2,1.05,-.4],.055,m.rubber,10);
 ek.cyl([-2.2,1.05,-.4],.085,.085,.15,m.chrome,12);
 ek.rod([.4,2.5,-.1],[.7,1.4,-.35],.09,m.rubber,16);
 ek.rod([.7,1.4,-.35],[.3,.2,-.6],.09,m.rubber,16);
 ek.rod([.3,.2,-.6],[-1.4,.12,-.9],.09,m.rubber,16);
 ek.cyl([-1.4,.12,-.9],.16,.16,.2,m.chrome,20,[0,0,Math.PI/2]);
 eb.build(groups.get('S')!);
 label('S',[9.8,-.35,12.65],Math.PI,.65,.55,['检修中','RETURN LINE','未恢复压力']);
 // Clear far-end silhouette: a ballast accumulator and its armoured feed line,
 // tucked on the south wall so it never masks the pod lane or the next east door.
 const cb=new Batcher('living-c8-pressure-route');owned.push(cb);const ck=Kit.at(cb,[0,0,0],0);
 ck.rod([65,2.25,30.1],[95,2.25,30.1],.16,m.pipe,20);
 for(const x of [67,74,83,93]){ck.box([x,2.25,30.65],[.18,.75,.35],m.frame);ck.ring([x,2.25,30.1],.2,.045,m.chrome,[0,Math.PI/2,0],24);}
 ck.box([82,.3,30.55],[2.4,2.1,.35],m.indGreen);ck.box([82,.65,30.33],[1.8,.45,.035],m.screenDead);ck.box([82,1.2,30.29],[1.5,.06,.035],m.lampCyan);
 for(const x of [81.4,82,82.6]){ck.cyl([x,-.15,30.3],.17,.17,.08,m.chrome,24,[Math.PI/2,0,0]);ck.cyl([x,-.15,30.24],.14,.14,.02,m.porcelain,24,[Math.PI/2,0,0]);}
 cb.build(groups.get('C8')!);
 // Mid-distance rupture is visible from the first doorway, not just at the far endpoint.
 const ib=new Batcher('living-c8-interrupted-repair');owned.push(ib);const ik=Kit.at(ib,[72,-3,22],0);
 ik.box([0,1.8,0],[2.5,3.6,.5],m.indGreen);ik.box([0,2.3,.28],[1.8,1.6,.1],m.rubber);
 ik.box([-1.6,2.3,.15],[1.8,1.6,.12],m.indGreen,[0,-.7,0]);
 ik.rod([0,3,0],[0,5.05,0],.23,m.pipe,24);ik.rod([0,5.05,0],[0,5.05,4.4],.23,m.pipe,24);
 ik.ring([0,5.05,4.4],.32,.08,m.chrome,[0,0,0],32);
 for(let j=0;j<6;j++)ik.rod([Math.cos(j)*.25,5.05+Math.sin(j)*.25,4.4],[Math.cos(j)*.32,5.05+Math.sin(j)*.32,4.7],.035,m.chrome,8);
 ik.box([-.9,.15,1.4],[1.7,.15,1.2],m.frame,[0,.4,0]);
 ik.cyl([-.9,.6,1.4],.42,.42,1.05,m.indGreen,24,[Math.PI/2,0,0]);
 for(const z of [1,1.2,1.4,1.6,1.8])ik.ring([-.9,.6,z],.43,.035,m.frame,[0,0,0],20);
 ik.box([-.9,1.02,1.4],[.42,.16,.4],m.trim);
 for(const x of [-1.25,-.55])ik.box([x,.32,1.4],[.12,.3,.9],m.frame);
 ik.rod([-.8,.4,1.5],[.6,.13,2.3],.055,m.rubber,12);ik.rod([.6,.13,2.3],[2,.12,1.5],.055,m.rubber,12);
 // Empty circular pump seat matches the motor on the detached lower skid.
 ik.ring([0,1.5,.39],.47,.065,m.chrome,[0,0,0],24);
 for(const x of [-.52,.52])ik.box([x,1.05,.4],[.18,.26,.22],m.frame);
 for(const x of [-.62,.62])ik.rod([x,1.8,.4],[x,2.9,.4],.065,m.bandBlue,10);
 ik.box([0,2.95,.4],[1.55,.2,.18],m.frame);
 for(let j=0;j<5;j++){const x=-.55+j*.27;ik.box([x,2.62,.43],[.17,.32,.16],m.porcelain);ik.rod([x,2.45,.45],[x,2.1,.42],.025,m.rubber,8);}
 // Captive hinges and perimeter lip give the open door an actual sheet-metal edge.
 for(const y of [1.65,2.95])ik.cyl([-1.28,y,.25],.055,.055,.23,m.chrome,10);
 for(const x of [-1.15,1.15])ik.box([x,2.3,.31],[.06,1.75,.09],m.trim);
 ik.rod([-.52,1.05,.5],[-.7,.65,1.2],.06,m.rubber,12);
 ik.cyl([-.7,.65,1.2],.1,.1,.16,m.chrome,12,[0,0,Math.PI/2]);
 ib.build(groups.get('C8')!);
 const rb=new Batcher('living-r4-accumulator');owned.push(rb);const rk=Kit.at(rb,[118,-3,26],0);
 rk.cyl([0,2.7,0],1.0,1.0,4.2,m.bandBlue,48);rk.sphere([0,4.8,0],[1,.5,1],m.bandBlue,24);
 for(const y of [1,4.4])rk.ring([0,y,0],1.04,.07,m.frame,[Math.PI/2,0,0],40);
 for(const x of [-.65,.65])rk.box([x,.4,0],[.3,.8,1.5],m.frame);
 rk.rod([0,2.5,0],[0,2.5,4.4],.22,m.pipe,20);rk.rod([0,2.5,4.4],[-2,2.5,4.4],.22,m.pipe,20);
 rk.cyl([-1.03,3,0],.35,.35,.12,m.chrome,28,[0,0,Math.PI/2]);
 rb.build(groups.get('R4')!);
 label('R4',[116.95,.4,26],-Math.PI/2,1.5,.7,['压载蓄能器','BALLAST EQUIPMENT']);
 // Short transfer receiver; no personnel corridor is built behind the bulkhead.
 box('S',[12.0,-.5,12.8],[1.3,1.5,.6],m.indSteel);
 label('S',[12.0,.5,12.45],Math.PI,1.8,.6,['设备转交口','EQUIPMENT TRANSFER']);
 
 label('C8',[79,1.5,30.65],Math.PI,4,.65,['压载库 → 供水检修','02 / WATER SERVICE']);
 for(let y=-6;y>-56;y-=8){label('E',[200.36,y,68],Math.PI/2,2,.7,[`${1040-y} m`,'DESCENT']);box('E',[217.5,y,68],[.16,.13,2.2],m.bandYellow);}
 return {gate,solids,interactables,photoTargets,update(open:number,cameraPresent=true){tether.visible=cameraPresent;leaf.position.y=-.25+T.MathUtils.clamp(open,0,1)*5.8;},dispose(){owned.forEach(o=>o.dispose());}};
}
