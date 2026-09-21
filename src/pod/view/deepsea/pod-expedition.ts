import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createExpedition,newExpeditionState,openDoor,interactExpedition} from '../../content/expedition';
import type {PodRun} from '../../sim/run';
import type {AuthoredSite} from '../../sim/authored-site';
import {createExpeditionWorld} from './expedition-world';
import {createReferenceMaterials} from './reference-materials';
import {createExpeditionSurfaceMaps} from './expedition-surface-maps';
import {createExpeditionAtmosphere} from './expedition-atmosphere';
import {createReferenceWater} from './reference-water';
import {EXPEDITION_ART} from './expedition-art-direction';
import {beginExtend,beginGrip,ARM_PHASE_CN} from '../../sim/manipulator';
import {createSalvageArm} from './salvage-arm';

// One context for all seven chapters, not one WebGL context per room/screen.
let shared:ReturnType<typeof createShared>|null=null;
function createShared(){
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 const materials=createReferenceMaterials(),surfaces=createExpeditionSurfaceMaps();
 const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
 const environment=pmrem.fromScene(room,.14);room.dispose();pmrem.dispose();
 return{renderer,materials,surfaces,environment};
}

export class PodExpedition implements AuthoredSite {
 readonly level;readonly state;readonly world;
 readonly position=new T.Vector3();
 private scene=new T.Scene();private camera=new T.PerspectiveCamera(64,1,.08,120);
 private lamp=new T.SpotLight(0xc0e7e7,40,32,.72,.6,1.65);
 private fill=new T.PointLight(0x568b9a,1.5,7,2);
 private fixtures=Array.from({length:4},()=>new T.PointLight());
 private ambient=new T.HemisphereLight(0x63818a,0x11191b,.012);
 private atmosphere=createExpeditionAtmosphere();
 private composer:EffectComposer;private ao:SSAOPass;
 private water:ReturnType<typeof createReferenceWater>;
 private ray=new T.Raycaster();private bounds=new Map<string,T.Box3>();
 private width=0;private height=0;private target:{id:string;door:boolean}|null=null;
 private openedAt=new Map<string,number>();private epoch=0;
 private interactionFeedback='';private feedbackUntil=0;
 private armObject:string|null=null;
 private pendingCargo:string|null=null;
 private armAnchor:T.Vector3|null=null;
 private armNormal=new T.Vector3();
 private salvageArm=createSalvageArm();
 private feedback(message:string){this.interactionFeedback=message;this.feedbackUntil=performance.now()+4000;this.run.pushLog(message,'system');}
 private resources;
 constructor(readonly run:PodRun,readonly index:number){
  this.resources=shared??=createShared();const {renderer,materials,surfaces,environment}=this.resources;
  this.level=createExpedition(index);this.state=newExpeditionState(this.level);
  this.world=createExpeditionWorld(this.level,materials,surfaces.maps);
  this.scene.add(this.world.root,this.lamp,this.lamp.target,this.fill,this.ambient,this.atmosphere.root,...this.fixtures);
  this.camera.add(this.salvageArm.root);this.scene.add(this.camera);
  const art=EXPEDITION_ART[index];this.scene.background=new T.Color('#030b10');this.scene.fog=new T.FogExp2(art.fog,art.density);
  this.scene.environment=environment.texture;this.scene.environmentIntensity=.008;
  this.lamp.color.set(art.key);this.fill.color.set(art.fill);this.lamp.castShadow=true;
  this.lamp.shadow.mapSize.set(1024,1024);this.lamp.shadow.bias=-.0008;
  this.camera.rotation.order='YXZ';this.position.set(this.level.spawn[0],0,this.level.spawn[1]);
  const entry=this.world.entryView;
  const edge=this.level.edges.find(e=>e.from===this.level.startRoom||e.to===this.level.startRoom)!;
  const next=this.level.rooms.find(r=>r.id===(edge.from===this.level.startRoom?edge.to:edge.from))!;
  run.heading=T.MathUtils.radToDeg(Math.atan2(next.x-this.position.x,-(next.z-this.position.z)));
  run.pitch=0;run.camPan=0;run.camTilt=0;
  if(entry){this.position.set(...entry.view);run.heading=-T.MathUtils.radToDeg(entry.yaw);run.pitch=-T.MathUtils.radToDeg(entry.pitch);}
  this.world.update(this.state,0);this.world.root.updateMatrixWorld(true);
  for(const [id,obj] of this.world.interactables)this.bounds.set(id,new T.Box3().setFromObject(obj));
  this.composer=new EffectComposer(renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
  this.ao=new SSAOPass(this.scene,this.camera,1024,720);this.ao.kernelRadius=.2;this.ao.minDistance=.002;this.ao.maxDistance=.12;this.composer.addPass(this.ao);
  this.water=createReferenceWater(this.camera,this.lamp,this.ao.normalRenderTarget.depthTexture!);this.composer.addPass(this.water.pass);this.composer.addPass(new OutputPass());
  run.pushLog(`${this.level.name}。摄像窗对准门、工具或记录点，靠近后按 F 操作；领航台显示本设施平面。`,'system');
 }
 get complete(){return this.state.completed;}
 private get room(){return this.level.rooms.find(r=>Math.abs(r.x-this.position.x)<=r.width/2&&Math.abs(r.z-this.position.z)<=r.depth/2);}
 get description(){return `Actual authored location: ${this.level.name}, ${this.room?.name??'connecting passage'}. ${this.level.description} Camera position ${this.position.toArray().map(n=>n.toFixed(2)).join(',')}, heading ${this.run.heading.toFixed(1)}, pitch ${this.run.pitch.toFixed(1)}. Preserve the supplied first frame's visible architecture; do not invent rooms or future evidence.`;}
 get hint(){this.aim();if(!this.target)return '对准门、工具、记录点 · 3.4 米内按 F / 操作键';const t=this.target;return t.door?'F / 操作键 · 开启隔离门':`F / 操作键 · ${this.level.items.find(i=>i.id===t.id)?.name??'设施'}`;}
 private pose(){
  this.camera.position.copy(this.position);
  this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');
  this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
 }
 private canMove(p:T.Vector3){
  const radius=.28;if(p.y< -1.25||p.y>2.75)return false;
  for(const [x,z] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!this.world.walkable.some(b=>b.containsPoint(new T.Vector3(p.x+x,p.y,p.z+z))))return false;
  if(this.world.colliders.some(b=>b.clone().expandByScalar(radius).containsPoint(p)))return false;
  for(const [id,b] of this.bounds){const item=this.level.items.find(i=>i.id===id)!;if(this.state.collected.includes(id)&&item.kind==='pickup')continue;if(b.clone().expandByScalar(radius).containsPoint(p))return false;}
  for(const [id,door] of this.world.doors)if((!this.state.opened.includes(id)||this.epoch-(this.openedAt.get(id)??-999)<1.2)&&door.bounds.clone().expandByScalar(radius).containsPoint(p))return false;
  return true;
 }
 get elevation(){return this.position.y;}
 moveVertical(distance:number){
  const steps=Math.max(1,Math.ceil(Math.abs(distance)/.04));
  for(let i=0;i<steps;i++){
   const next=this.position.clone();next.y+=distance/steps;
   if(!this.canMove(next))return false;
   this.position.copy(next);
  }
  return true;
 }
 move(distance:number){
  const h=T.MathUtils.degToRad(this.run.heading),p=T.MathUtils.degToRad(this.run.pitch);
  const direction=new T.Vector3(Math.sin(h)*Math.cos(p),-Math.sin(p),-Math.cos(h)*Math.cos(p));
  const steps=Math.max(1,Math.ceil(Math.abs(distance)/.08));
  for(let i=0;i<steps;i++){const next=this.position.clone().addScaledVector(direction,distance/steps);if(!this.canMove(next))return false;this.position.copy(next);}
  if(this.room&&!this.state.visited.includes(this.room.id))this.state.visited.push(this.room.id);
  return true;
 }
 private aim(){
  this.pose();this.world.root.updateMatrixWorld(true);this.ray.setFromCamera(new T.Vector2(),this.camera);this.ray.far=3.4;
  const hit=this.ray.intersectObject(this.world.root,true).find(h=>{let o:T.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object instanceof T.Mesh;});
  this.target=null;let o:T.Object3D|null=hit?.object??null;
  while(o){if(o.userData.interactionId){this.target={id:o.userData.interactionId,door:false};break;}if(o.userData.doorId){this.target={id:o.userData.doorId,door:true};break;}o=o.parent;}
 }
 interact(){
  if(this.run.arm.phase==='aiming'&&this.pendingCargo){this.run.retractArm();this.feedback('取物已夹紧 · 正在回收，收臂完成后才入库');return;}
  if(this.run.arm.phase==='gone'){this.pendingCargo=null;this.feedback('机械臂已损毁，无法取物');return;}
  if(['extending','gripping','hauling','jammed'].includes(this.run.arm.phase)){this.feedback(ARM_PHASE_CN[this.run.arm.phase]);return;}
  if(this.run.shot.viewing){this.feedback('先按 2 或回放键切回实时镜头，再操作外部设施。');return;}
  if((this.run.driveBlock&&this.run.arm.phase!=='aiming')||this.run.outcome.kind!=='alive'){this.feedback(this.run.driveBlock??'航行已结束');return;}
  this.aim();if(!this.target){this.feedback('未锁定物体 · 对准箱体，靠近至 3.4 米内');return;}
  const {id,door}=this.target;
  const item=this.level.items.find(i=>i.id===id);
  if(item&&(item.kind==='cache'||item.kind==='pickup')){
    if(this.state.collected.includes(id)){this.feedback('此物品已回收');return;}
    if(!this.run.lit||!this.run.powered){this.feedback('打开照明并恢复液压供电后才能操作');return;}
    if(item.requires?.some(r=>!this.state.inventory.includes(r))){this.feedback('缺少核验条件，暂不能打开');return;}
    if(this.run.arm.phase==='stowed'){
      const obj=this.world.interactables.get(id)!;
      // Lock one authored face point, not a camera-relative distance or a moving ray hit.
      const local=obj.worldToLocal(this.position.clone());
      const side=Math.abs(local.x)/.675>Math.abs(local.z)/.48;
      const normal=side?new T.Vector3(Math.sign(local.x)||1,0,0):new T.Vector3(0,0,Math.sign(local.z)||1);
      const anchor=item.kind==='cache'?new T.Vector3(normal.x*.70,.07,normal.z*.49):new T.Vector3(normal.x*.55,0,normal.z*.15);
      this.armAnchor=obj.localToWorld(anchor);
      this.armNormal.copy(normal).transformDirection(obj.matrixWorld);
      this.armObject=id;this.pendingCargo=null;this.run.pilot.stop();this.run.navDriveEngaged=false;
      beginExtend(this.run.arm);this.run.power=Math.max(0,this.run.power-.01);this.run.addNoise(.2);this.run.onCue?.('arm.pump-start',.85);
      this.feedback('机械臂伸出中 · 伸出后对准箱体，再按 F 翻找');return;
    }
    if(this.run.arm.phase==='aiming'){
      if(id!==this.armObject){this.feedback('目标已改变，请先收臂再重新锁定');return;}
      beginGrip(this.run.arm,id,0);this.run.addNoise(.1);this.run.onCue?.('arm.claw-wet',.8);
      this.feedback('爪头插入 · 正在开盖翻找');return;
    }
  }
  const result=door?openDoor(this.level,this.state,id):interactExpedition(this.level,this.state,id);
  if(result.ok&&door&&!this.openedAt.has(id))this.openedAt.set(id,this.epoch);
  if(result.ok){this.run.addNoise(door?.09:.15);this.run.onCue?.('terminal.beep',.4);}
  this.feedback(result.message);
  if(this.state.completed)this.run.campaign.record(this.index,'evidence');
  this.world.update(this.state,this.epoch);
 }
 armEvent(kind:'grip'|'stowed',id?:string){
  if(kind==='grip'&&id===this.armObject){
    this.state.opened.push(...(this.state.opened.includes(id!)?[]:[id!]));
    this.pendingCargo=id!;this.feedback('翻找完成 · 已夹持物品，按 F 收回机械臂');return true;
  }
  if(kind==='stowed'){
    if(this.pendingCargo){const result=interactExpedition(this.level,this.state,this.pendingCargo);this.feedback(result.ok?'机械臂已收妥 · '+result.message:result.message);}
    this.pendingCargo=null;this.armObject=null;this.armAnchor=null;return true;
  }
  return false;
 }
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){
  this.aim();const active=this.target;const message=performance.now()<this.feedbackUntil?this.interactionFeedback:'';
  if(!active&&!message&&this.run.arm.phase==='stowed')return;
  const item=this.level.items.find(i=>i.id===(this.armObject??active?.id));
  const title=item?.name??(active?.door?'隔离门':'操作反馈');
  const phase=this.run.arm.phase;
  const status=phase==='aiming'?(this.pendingCargo?'已夹持物品 · F 收回，收妥后入库':'机械臂已伸出 · 对准箱体按 F 翻找'):
   ['extending','gripping','hauling'].includes(phase)?ARM_PHASE_CN[phase]+' · 请等待动作完成':
   message||(active&&this.state.collected.includes(active.id)?'已回收':item&&(item.kind==='cache'||item.kind==='pickup')?'已锁定 · F 伸出机械臂':'已锁定 · F 操作');
  ctx.save();
  const x=w*.54,y=h*.23,pw=w*.41,ph=h*.22;
  ctx.fillStyle='rgba(3,20,25,.83)';ctx.fillRect(x,y,pw,ph);
  ctx.strokeStyle='rgba(126,218,212,.85)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(w*.5,h*.5);ctx.lineTo(x,y);ctx.lineTo(x+pw,y);ctx.stroke();
  ctx.strokeRect(w*.5-12,h*.5-12,24,24);
  ctx.fillStyle='#97e2d8';ctx.font=`${Math.max(13,h*.025)}px "Microsoft YaHei"`;ctx.textAlign='left';
  ctx.fillText(`◇ ${title}`,x+12,y+h*.04,pw-24);
  ctx.fillStyle='#e5eee3';ctx.font=`${Math.max(12,h*.021)}px "Microsoft YaHei"`;
  ctx.fillText(status,x+12,y+h*.086,pw-24);
  const emptied=!!item&&this.state.collected.includes(item.id);
  const cargo=emptied?'箱内物资：已回收 · 空箱保留':this.pendingCargo?`已发现：${item?.description??item?.name??'物资'}（待入库）`:'箱内物资：等待翻找核验';
  ctx.fillStyle='#c7dcb7';ctx.fillText(cargo,x+12,y+h*.13,pw-24);
  ctx.fillStyle='#6eaaa7';ctx.fillText('机械臂链路 / F 下一步 · C 收臂',x+12,y+h*.18,pw-24);
  ctx.restore();
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number){
  this.epoch=time;this.pose();this.world.update(this.state,time);
  this.salvageArm.update(this.run.arm,time,this.armAnchor?this.camera.worldToLocal(this.armAnchor.clone()):undefined,this.armNormal.clone().transformDirection(this.camera.matrixWorldInverse));
  const renderer=this.resources.renderer;
  if(this.width!==w||this.height!==h){renderer.setSize(w,h,false);this.composer.setSize(w,h);this.width=w;this.height=h;}
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  const dir=this.camera.getWorldDirection(new T.Vector3());this.lamp.position.copy(this.position);this.lamp.position.y-=.18;
  this.lamp.target.position.copy(this.position).addScaledVector(dir,12);
  this.lamp.intensity=this.run.lit?48:0;this.fill.position.copy(this.position);this.fill.intensity=this.run.lit?1.5:0;
  const lights=this.world.practicalLights.filter(l=>this.room?l.room===this.room.id:new T.Vector3(...l.position).distanceTo(this.position)<14);
  // Emergency fixtures stay visible but must not flood the room like working lights.
  // Their power is independent of the player's searchlight switch.
  this.fixtures.forEach((light,i)=>{const source=lights[i];light.intensity=(source?.intensity??0)*.16;if(source){light.position.set(...source.position);light.color.set(source.color);light.distance=source.range;}});
  this.atmosphere.update(time,this.camera,this.lamp);this.water.update(this.run.lit?.5:0);this.composer.render();ctx.drawImage(renderer.domElement,0,0,w,h);
 }
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.fillStyle='#061115';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c7b68e';ctx.font=`${Math.max(12,h*.032)}px monospace`;ctx.fillText(this.level.name,w*.05,h*.07);
  const rooms=this.level.rooms,minX=Math.min(...rooms.map(r=>r.x-r.width/2)),maxX=Math.max(...rooms.map(r=>r.x+r.width/2)),minZ=Math.min(...rooms.map(r=>r.z-r.depth/2)),maxZ=Math.max(...rooms.map(r=>r.z+r.depth/2));
  const scale=Math.min(w*.86/(maxX-minX),h*.68/(maxZ-minZ));const xy=(x:number,z:number)=>[w*.07+(x-minX)*scale,h*.14+(z-minZ)*scale];
  ctx.lineWidth=2;for(const e of this.level.edges){const a=rooms.find(r=>r.id===e.from)!,b=rooms.find(r=>r.id===e.to)!;const p=xy(a.x,a.z),q=xy(b.x,b.z);ctx.strokeStyle=this.state.opened.includes(e.id)?'#81b4a3':'#40575d';ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}
  for(const r of rooms){const [x,z]=xy(r.x-r.width/2,r.z-r.depth/2);ctx.fillStyle=this.state.visited.includes(r.id)?'#345b5c':'#142b32';ctx.fillRect(x,z,r.width*scale,r.depth*scale);}
  const [x,z]=xy(this.position.x,this.position.z);ctx.fillStyle='#ffc273';ctx.beginPath();ctx.arc(x,z,5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#b5d3ce';ctx.font=`${Math.max(11,h*.027)}px monospace`;ctx.fillText(`已探索 ${this.state.visited.length}/${rooms.length} · 已核验 ${this.state.collected.length}/${this.level.items.length}`,w*.05,h*.90);
  ctx.fillText(this.run.departHint,w*.05,h*.95,w*.90);
 }
 snapshot(){return{index:this.index,levelId:this.level.id,position:this.position.toArray(),state:structuredClone(this.state),rooms:this.level.rooms.length,doors:this.world.doors.size,anchors:this.world.anchors.length};}
 dispose(){this.salvageArm.dispose();this.world.dispose();this.atmosphere.dispose();this.composer.passes.forEach(p=>p.dispose());this.composer.dispose();this.lamp.shadow.dispose();}
}
