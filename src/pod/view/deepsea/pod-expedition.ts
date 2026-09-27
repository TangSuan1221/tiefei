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
import {beginExtend,beginGrip,newArm,ARM_PHASE_CN} from '../../sim/manipulator';
import {createSalvageArm} from './salvage-arm';
import {harborHullClear,sweepHarborHeading} from '../../sim/harbor-navigation';
import {scanNavigationSonar,sonarRay,sonarEchoAlpha,SONAR_RANGE,SONAR_STATIC,SONAR_THREAT} from '../../sim/navigation-sonar';
import {drawSonarSweep} from '../sonar-sweep';
import {HARBOR} from '../../content/harbor-level';
import {runnerNavigation} from '../../sim/runner-path';
import {advanceEncounter,newEncounterPressure} from '../../sim/harbor-encounters';
import {harborGuide,harborGuideMedia,type HarborGuide} from '../../sim/harbor-guidance';
import {newHarborProgress,captureHarborEvidence,resolveHarborEvidence,analyzeHarborEvidence,grantHarborEvent,syncHarborInventory,harborObjective,HARBOR_PHOTO_TARGET,type HarborProgress,type HarborResult} from '../../sim/harbor-progress';

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
 private harborKeys=Array.from({length:2},()=>new T.SpotLight(0xc4cfda,0,24,.78,.65,1.6));
 private ambient=new T.HemisphereLight(0x63818a,0x11191b,.012);
 private atmosphere=createExpeditionAtmosphere();
 private composer:EffectComposer;private ao:SSAOPass;
 private water:ReturnType<typeof createReferenceWater>;
 private ray=new T.Raycaster();private bounds=new Map<string,T.Box3>();
 private width=0;private height=0;private target:{id:string;door:boolean}|null=null;
 private openedAt=new Map<string,number>();private epoch=0;
 private interactionFeedback='';private feedbackUntil=0;
 private guide:HarborGuide|null=null;private guideLeft=0;private guideIdle=0;private guideReminded=false;
 private armObject:string|null=null;
 private pendingCargo:string|null=null;
 private harbor:HarborProgress=newHarborProgress();
 private stableSeconds=0;
 private previousEye=new T.Vector3();
 private previousView=new T.Vector3();
 private broadcastOn=false;
 private broadcastElapsed=0;
 private encounterStarted=false;
 private harborHunt={first:false,dwell:0,pressure:0,cooldown:0};
 private encounterPressure=newEncounterPressure();
 private runner:{id:number;position:T.Vector3;path:T.Vector3[];stage:'alert'|'chase'|'windup'|'charge'|'recover';left:number;repath:number;target:T.Vector3}|null=null;
 get spatialThreat(){return this.index===0&&this.run.threat?.creature.id==='cre.runner';}
 weaponResponse(weapon:string){if(this.runner){this.runner.stage='recover';this.runner.left=weapon==='decoy'?7:5;this.runner.path=[];this.feedback(weapon==='decoy'?'声诱饵干扰了追踪 · 利用窗口撤离':'冲击弹打断突进 · 利用窗口撤离');}}
 private tickRunner(dt:number){
  const t=this.run.threat;if(!this.spatialThreat||!t||['repelled','struck'].includes(t.phase)){this.runner=null;return;}
  const solids=[...this.world.colliders,...[...this.world.doors].filter(([id])=>!this.state.opened.includes(id)).map(([,d])=>d.bounds)];
  if(!this.runner||this.runner.id!==t.encounter){
   const nav=runnerNavigation(this.position,this.world.walkable,solids),forward=this.camera.getWorldDirection(new T.Vector3());
   const index=nav.nodes.findIndex(n=>n.d>=12&&n.d<=20&&n.p.clone().sub(this.position).normalize().dot(forward)<.2);
   if(index<0){this.run.threat=null;this.run.mode='calm';return;}
   this.runner={id:t.encounter,position:nav.nodes[index].p.clone(),path:nav.path(index).slice(1),stage:'alert',left:3,repath:0,target:this.position.clone()};
   this.run.onCue?.('listener.call',.8);
  }
  const r=this.runner;r.left-=dt;r.repath-=dt;
  const delta=r.position.clone().sub(this.position);t.range=Math.min(1,delta.length()/24);t.bearing=Math.atan2(delta.x,-delta.z)-this.run.heading*Math.PI/180;
  if(r.stage==='alert'||r.stage==='recover'){if(r.left<=0){if(r.stage==='recover'&&this.run.lastCombat?.encounter===t.encounter&&this.run.lastCombat.hit)this.run.lastCombat.outcome='returned';r.stage='chase';r.repath=0;}return;}
  if(r.stage==='windup'){if(r.left<=0){r.stage='charge';r.left=1.2;}return;}
  if(r.stage==='charge'){
   const navCheck=(p:T.Vector3)=>!solids.some(b=>b.clone().expandByScalar(.55).containsPoint(p))&&this.world.walkable.some(b=>b.containsPoint(p));
   const direction=r.target.clone().sub(r.position).normalize();let remaining=Math.min(dt,.1)*12;
   while(remaining>0){const step=Math.min(.2,remaining),next=r.position.clone().addScaledVector(direction,step);if(!navCheck(next)){r.left=0;break;}r.position.copy(next);remaining-=step;}
   if(r.position.distanceTo(this.position)<2){this.run.hull=Math.max(.05,this.run.hull-.12);this.run.onShake?.(1);this.run.onCue?.('hull.crack',1);r.left=0;this.feedback('艇体遭到冲撞 · 立即离开原位置');}
   if(r.left<=0||r.position.distanceTo(r.target)<.6){r.stage='recover';r.left=7;}return;
  }
  if(r.repath<=0){
   r.repath=1;const nav=runnerNavigation(this.position,this.world.walkable,solids);
   let best=-1,d=2.5;nav.nodes.forEach((n,i)=>{const distance=n.p.distanceTo(r.position);if(distance<d&&nav.segment(r.position,n.p)){best=i;d=distance;}});
   r.path=best>=0?nav.path(best):[];
  }
  let travel=Math.min(dt,.1)*7;
  while(travel>0&&r.path.length){const next=r.path[0],d=r.position.distanceTo(next),step=Math.min(travel,d,.2),p=d>0?r.position.clone().lerp(next,step/d):next.clone();if(solids.some(b=>b.clone().expandByScalar(.55).containsPoint(p))){r.path=[];r.repath=0;break;}r.position.copy(p);travel-=step;if(d<=step+.001)r.path.shift();}
  if(r.position.distanceTo(this.position)<5&&r.path.length){r.stage='windup';r.left=1.2;r.target.copy(this.position);this.run.onCue?.('hull.crack',.65);this.feedback('急促刮擦逼近 · 突进蓄势，转向避让或发射冲击弹');}
 }
 private lastCollision=0;private interactionNoise=false;private storyContact=false;
 private quietSeconds=0;
 private knockDone=false;
 private knockInvited=false;
 private knockReplyAt=-1;
 private revealElapsed=0;
 private revealSeen=false;
 private lastPowerService=-100;
 private sonarAt=-Infinity;
 private sonarReturns:ReturnType<typeof scanNavigationSonar>=[];
 private narrativeSeen=new Set<string>();
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
  if(index===0){
   this.scene.fog=new T.FogExp2('#071118',.018);this.scene.environmentIntensity=.065;this.lamp.color.set('#e2dfca');this.lamp.distance=48;this.lamp.decay=1.5;this.fill.color.set('#829099');this.ambient.intensity=.045;
   for(const key of this.harborKeys){key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.bias=-.0003;key.shadow.normalBias=.025;this.scene.add(key,key.target);}
  }
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
 get managesThreats(){return this.index===0;}
 get evidenceReady(){return this.index===0&&this.state.inventory.includes(HARBOR.photo);}
 get noiseFloor(){return this.index===0&&this.broadcastOn?.65:0;}
 private currentGuide(){return harborGuide([...this.harbor.grants,...this.state.inventory],harborGuideMedia(this.harbor.exposures));}
 get objective(){return this.index===0?this.currentGuide().action:undefined;}
 private harborResult(result:HarborResult){this.harbor=result.state;this.state.inventory=syncHarborInventory(this.harbor,this.state.inventory);return result;}
 canCounter(action:{kind:string}){return this.index!==0||!this.encounterStarted||(!this.broadcastOn&&this.quietSeconds>=6&&action.kind==='fullstop');}
 tick(dt:number){
  if(this.index!==0)return;
  this.pose();const view=this.camera.getWorldDirection(new T.Vector3());
  this.tickRunner(dt);
  const steady=this.previousEye.distanceTo(this.position)<.015&&this.previousView.dot(view)>.9998;
  this.stableSeconds=steady?this.stableSeconds+dt:0;this.previousEye.copy(this.position);this.previousView.copy(view);
  if(this.run.openingReceived&&!this.state.inventory.includes(HARBOR.permit)){
   this.harborResult(grantHarborEvent(this.harbor,{type:'arrival-report',authorized:true}));
   this.feedback('万斯：调查许可已下发。沿岸电缆去维修湾；先恢复港门控制。');
  }
  if(this.room&&!this.state.visited.includes(this.room.id))this.state.visited.push(this.room.id);
  // The authored broadcast encounter must not leave the entire preceding port safe.
  const hunt=this.harborHunt;
  hunt.cooldown=Math.max(0,hunt.cooldown-dt);
  const occupied=!!this.run.threat&&!['repelled','struck'].includes(this.run.threat.phase);
  if(occupied)hunt.cooldown=Math.max(hunt.cooldown,45);
  const event=advanceEncounter(this.encounterPressure,{
   light:this.run.lit,speed:this.run.pilot.speed,noise:this.run.noise,
   collision:this.run.collisions>this.lastCollision,interaction:this.interactionNoise,
   story:this.revealSeen&&!this.storyContact,active:occupied,
  },dt);
  this.lastCollision=this.run.collisions;this.interactionNoise=false;
  if(this.revealSeen)this.storyContact=true;
  if(event==='warning'){
   this.run.onCue?.('listener.call',.55);
   this.feedback(`远处出现重复异响：${this.encounterPressure.reason}可能引起了注意。关灯、停推可以降低暴露。`);
  }
  if(event==='spawn'){
   this.quietSeconds=0;this.run.spawnThreat('cre.runner',55);
   this.feedback(`移动异常回波正在接近（${this.encounterPressure.reason}）。对准回波曝光；7 声诱饵 / 8 冲击弹。录像到分析台查看。`);
  }
  if(!this.revealSeen&&this.room?.id==='harbor.room.B'){
   const hero=this.world.root.getObjectByName(HARBOR_PHOTO_TARGET);
   if(hero){
    const center=new T.Box3().setFromObject(hero).getCenter(new T.Vector3());
    const direction=center.clone().sub(this.position),distance=direction.length();
    const ray=new T.Raycaster(this.position,direction.normalize(),.05,distance+2);
    let first:T.Object3D|null=ray.intersectObject(this.world.root,true).find(h=>h.object instanceof T.Mesh&&h.object.visible)?.object??null;
    let visible=false;while(first){if(first===hero){visible=true;break;}first=first.parent;}
    if(visible&&view.dot(direction)>.75)this.revealElapsed+=dt;
    if(this.revealElapsed>=7){this.revealSeen=true;this.feedback('万斯：那是接驳救生舱。报告说它已经离港……先留影，别急着下结论。');}
   }
  }
  if(this.broadcastOn){
   this.broadcastElapsed+=dt;this.run.noise=Math.max(this.run.noise,.65);
   if(!this.encounterStarted&&this.broadcastElapsed>=10){
    this.harborResult(grantHarborEvent(this.harbor,{type:'retrieval-complete'}));
    this.encounterStarted=true;if(!this.run.threat||['repelled','struck'].includes(this.run.threat.phase))this.run.spawnThreat('cre.runner',32);
    this.feedback('外放声在空港里回荡。声呐回波正在接近——切断检索台广播，停推保持安静。');
   }
  }
  const quiet=!this.broadcastOn&&Math.abs(this.run.pilot.speed)<.05&&Math.abs(this.run.pilot.verticalSpeed)<.04&&this.run.arm.phase==='stowed';
  this.quietSeconds=quiet?this.quietSeconds+dt:0;
  if(this.encounterStarted&&this.quietSeconds>=6&&this.run.threat&&this.run.threat.phase!=='repelled'&&this.run.threat.phase!=='struck')this.run.tryCounter({kind:'fullstop'});
  if(this.room?.id==='harbor.room.G'&&this.state.inventory.includes(HARBOR.route)&&!this.knockDone&&!this.knockInvited&&(!this.run.threat||this.run.threat.phase==='repelled'||this.run.threat.phase==='struck')){
   this.knockInvited=true;this.run.onCue?.('door.knock',.6);this.feedback('井下传来敲击。可再次操作改道记录台，用外置测试器回敲另一种节奏；也可以离开。');
  }
  if(this.knockReplyAt>=0&&this.run.clock>=this.knockReplyAt){
   this.knockReplyAt=-1;this.knockDone=true;this.run.onCue?.('door.knock',.45);this.feedback('井下复述了你刚敲出的新节奏。万斯：……可能是结构回声。');
  }
  if(this.run.at==='camera')this.guideLeft=Math.max(0,this.guideLeft-dt);
  this.guideIdle+=dt;
  const next=this.currentGuide();
  const danger=!!this.run.threat&&!['repelled','struck'].includes(this.run.threat.phase);
  // Do not overwrite attack instructions, arm feedback or the first incoming call.
  const ownCaption=this.guide&&this.run.storyCaption===`${this.guide.reason}\n${this.guide.action}`;
  if(!danger&&this.run.arm.phase==='stowed'&&performance.now()>=this.feedbackUntil&&(this.run.storyCaptionLeft<=0||ownCaption)){
   const changed=next.id!==this.guide?.id;
   if(changed||(!this.guideReminded&&this.guideIdle>=65)){
    this.guide=next;this.guideLeft=18;this.guideIdle=0;this.guideReminded=!changed;
    this.run.storyCaption=`${next.reason}\n${next.action}`;this.run.storyCaptionLeft=18;
    this.run.pushLog(`${next.reason} ${next.action}`,'system');this.run.onCue?.('radio.squelch',.35);
   }
  }
 }
 captureEvidence():unknown {
  if(this.index!==0)return undefined;
  this.pose();const hero=this.world.root.getObjectByName(HARBOR_PHOTO_TARGET);
  const center=hero?new T.Box3().setFromObject(hero).getCenter(new T.Vector3()):new T.Vector3(60,11,20);
  const toward=center.clone().sub(this.position),distance=toward.length(),view=this.camera.getWorldDirection(new T.Vector3());
  const projected=center.clone().project(this.camera);
  const visible=!!hero&&projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<.8&&Math.abs(projected.y)<.8;
  const ray=new T.Raycaster(this.position,toward.clone().normalize(),.05,distance+2);
  const hits=ray.intersectObject(this.world.root,true).filter(h=>{let p:T.Object3D|null=h.object;while(p){if(!p.visible)return false;p=p.parent;}return h.object instanceof T.Mesh;});
  let hit:T.Object3D|null=hits[0]?.object??null,unobstructed=false;
  while(hit){if(hit===hero){unobstructed=true;break;}hit=hit.parent;}
  const input={id:`harbor.exposure.${this.run.shot.token+1}`,roomId:this.room?.id??'passage',position:this.position.toArray() as [number,number,number],direction:view.toArray() as [number,number,number],capturedAt:this.run.clock,targetId:HARBOR_PHOTO_TARGET,targetVisible:visible,unobstructed,distance,stableSeconds:this.stableSeconds,lightOn:this.run.lit,threat:this.run.threat?.behavior??'calm'};
  const r=this.harborResult(captureHarborEvidence(this.harbor,input));this.feedback(r.message);
  return input;
 }
 analyzeEvidence(snapshot:unknown):string[]{
  if(this.index!==0||this.run.at!=='lab')return ['请到分析台核验实物。'];
  const lines:string[]=[];
  const packet=snapshot as {capture?:{id?:string};media?:{playable:boolean;mediaId?:string;source:'generated-video'|'controlled-video'|'still'|'failed'}}|undefined;
  if(packet?.capture?.id&&packet.media){
   const r=this.harborResult(resolveHarborEvidence(this.harbor,packet.capture.id,packet.media));
   if(r.ok){const a=this.harborResult(analyzeHarborEvidence(this.harbor,this.state.inventory,packet.capture.id));lines.push(a.message);}
   else lines.push(r.message);
  }
  const steps:[string,string,string][]=[['harbor.analysis.compare',HARBOR.discrepancy,'交叉核验：救生舱仍连接泊位，载荷模块没有离泊记录。撤离报告与现场不符。'],['harbor.analysis.card',HARBOR.cardAnalyzed,'员工卡历史记录：登船队列取消后，人员改走下层生活区。此为事故档案，不是当前摄影。'],['harbor.analysis.route',HARBOR.route,'门禁与机械改道记录相符：撤离人员实际向下转移。下一站是生活区。']];
  for(const [id,token,text] of steps){if(this.state.inventory.includes(token))continue;const a=this.harborResult(analyzeHarborEvidence(this.harbor,this.state.inventory,id));if(a.ok)lines.push(text);}
  if(!lines.length)lines.push(this.objective??'暂无线索可比对。');
  for(const line of lines)this.run.pushLog(line,'system');
  return lines;
 }
 private serviceHarbor(){
  if(this.run.clock-this.lastPowerService<8){this.feedback('岸电稳压中，请稍候。');return;}
  this.lastPowerService=this.run.clock;this.run.power=Math.min(1,this.run.power+.45);
  this.run.hull=Math.max(this.run.hull,.72);this.run.leak=0;this.run.flood=Math.max(0,this.run.flood-.15);
  this.run.vitals.restore({oxygen:Math.max(0,900-this.run.vitals.vitals.oxygen)});
  if(this.run.arm.phase==='gone'){this.run.arm=newArm();this.pendingCargo=null;this.armObject=null;this.armAnchor=null;}
  this.feedback('维修脐带接入：补电、补氧，修复外板、漏点与液压接头。维修工具保留，可返回维护。');
 }
 private get room(){return this.level.rooms.find(r=>Math.abs(r.x-this.position.x)<=r.width/2&&Math.abs(r.z-this.position.z)<=r.depth/2);}
 get description(){return `Actual authored location: ${this.level.name}, ${this.room?.name??'connecting passage'}. ${this.level.description} Camera position ${this.position.toArray().map(n=>n.toFixed(2)).join(',')}, heading ${this.run.heading.toFixed(1)}, pitch ${this.run.pitch.toFixed(1)}. Preserve the supplied first frame's visible architecture; do not invent rooms or future evidence.`;}
 get hint(){
  this.aim();
  if(!this.target){
   if(this.index===0&&!this.evidenceReady&&this.room?.id==='harbor.room.B')return '抬起镜头：倒悬救生舱 · 停稳取景后曝光 · 录像到分析台核验';
   return '对准门、工具、记录点 · 3.4 米内按 F / 操作键';
  }
  const t=this.target;return t.door?'F / 操作键 · 开启隔离门':`F / 操作键 · ${this.level.items.find(i=>i.id===t.id)?.name??'设施'}`;
 }
 private pose(){
  this.camera.position.copy(this.position);
  this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');
  this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
 }
 private navigationSolids(){
   const solids=[...this.world.colliders];
   for(const [id,b] of this.bounds){const item=this.level.items.find(i=>i.id===id);if(item?.kind==='pickup'&&this.state.collected.includes(id))continue;solids.push(b);}
   for(const [id,door] of this.world.doors)if(!this.state.opened.includes(id)||this.epoch-(this.openedAt.get(id)??-999)<1.2)solids.push(door.bounds);
   return solids;
 }
 private canMove(p:T.Vector3,heading=this.run.heading){
  if(this.index===0){
   return harborHullClear(p,heading,this.world.walkable,this.navigationSolids());
  }
  const radius=.28;if(p.y< -1.25||p.y>2.75)return false;
  for(const [x,z] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!this.world.walkable.some(b=>b.containsPoint(new T.Vector3(p.x+x,p.y,p.z+z))))return false;
  if(this.world.colliders.some(b=>b.clone().expandByScalar(radius).containsPoint(p)))return false;
  for(const [id,b] of this.bounds){const item=this.level.items.find(i=>i.id===id)!;if(this.state.collected.includes(id)&&item.kind==='pickup')continue;if(b.clone().expandByScalar(radius).containsPoint(p))return false;}
  for(const [id,door] of this.world.doors)if((!this.state.opened.includes(id)||this.epoch-(this.openedAt.get(id)??-999)<1.2)&&door.bounds.clone().expandByScalar(radius).containsPoint(p))return false;
  return true;
 }
 get elevation(){return this.position.y;}
 turn(degrees:number){
  if(this.index!==0)return (this.run.heading+degrees+360)%360;
  return sweepHarborHeading(this.run.heading,degrees,h=>this.canMove(this.position,h));
 }
 private recoverHeading(){
  if(this.index===0&&!this.canMove(this.position))this.run.heading=this.turn(0);
 }
 moveVertical(distance:number){
  this.recoverHeading();
  const steps=Math.max(1,Math.ceil(Math.abs(distance)/.04));
  for(let i=0;i<steps;i++){
   const next=this.position.clone();next.y+=distance/steps;
   if(!this.canMove(next))return false;
   this.position.copy(next);
  }
  return true;
 }
 move(distance:number){
  this.recoverHeading();
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
  if(this.run.arm.phase==='gone'){
   this.pendingCargo=null;this.aim();
   if(this.index===0&&this.target?.id==='harbor.item.power'&&this.state.inventory.includes(HARBOR.power)){this.serviceHarbor();return;}
   this.feedback('机械臂已损毁，无法取物；返回岸电维修湾修复液压接头。');return;
  }
  if(['extending','gripping','hauling','jammed'].includes(this.run.arm.phase)){this.feedback(ARM_PHASE_CN[this.run.arm.phase]);return;}
  if(this.run.shot.viewing){this.feedback('先按 2 或回放键切回实时镜头，再操作外部设施。');return;}
  if((this.run.driveBlock&&this.run.arm.phase!=='aiming')||this.run.outcome.kind!=='alive'){this.feedback(this.run.driveBlock??'航行已结束');return;}
  this.aim();if(!this.target){this.feedback('未锁定物体 · 对准箱体，靠近至 3.4 米内');return;}
  const {id,door}=this.target;
  const item=this.level.items.find(i=>i.id===id);
  if(this.index===0&&!door){
   if(id==='harbor.item.diversion'&&this.knockInvited&&!this.knockDone){
    if(this.knockReplyAt<0){this.knockReplyAt=this.run.clock+2.8;this.run.onCue?.('door.knock',.8);this.run.addNoise(.12);this.feedback('测试器回敲：两短，一长。等待井下响应。');}
    return;
   }
   if(id==='harbor.item.broadcast'&&this.state.collected.includes(id)){
    if(this.broadcastOn){this.broadcastOn=false;this.feedback('外部广播已切断。停推并收回机械臂，等待回波离开。');}
    else if(!this.encounterStarted){this.broadcastOn=true;this.feedback(`恢复疏散检索：还需 ${Math.ceil(10-this.broadcastElapsed)} 秒。外放回路重新接通。`);}
    else this.feedback('外放回路已断开。检索记录保留，不需要再次广播。');
    return;
   }
   if(id==='harbor.item.power'&&this.state.inventory.includes(HARBOR.power)){this.serviceHarbor();return;}
   if(id==='harbor.item.exit'){
    const r=this.harborResult(grantHarborEvent(this.harbor,{type:'depth-check',pressureReady:this.run.hull>=.55,oxygenReady:this.run.vitals.vitals.oxygen>150,energyReady:this.run.power>=.18,propulsionReady:this.run.arm.phase==='stowed'}));
    if(!r.ok){this.feedback(r.message+' 岸电维修湾可修复和充电。');return;}
   }
  }
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
      beginExtend(this.run.arm);this.interactionNoise=true;this.run.power=Math.max(0,this.run.power-.01);this.run.addNoise(.2);this.run.onCue?.('arm.pump-start',.85);
      this.feedback('机械臂伸出中 · 伸出后对准箱体，再按 F 翻找');return;
    }
    if(this.run.arm.phase==='aiming'){
      if(id!==this.armObject){this.feedback('目标已改变，请先收臂再重新锁定');return;}
      beginGrip(this.run.arm,id,0);this.interactionNoise=true;this.run.addNoise(.1);this.run.onCue?.('arm.claw-wet',.8);
      this.feedback('爪头插入 · 正在开盖翻找');return;
    }
  }
  const result=door?openDoor(this.level,this.state,id):interactExpedition(this.level,this.state,id);
  if(result.ok&&door&&!this.openedAt.has(id))this.openedAt.set(id,this.epoch);
  if(result.ok){this.interactionNoise=true;this.run.addNoise(door?.09:.15);this.run.onCue?.('terminal.beep',.4);}
  this.feedback(result.message);
  if(result.ok&&this.index===0&&!door){
   if(id==='harbor.item.power')this.serviceHarbor();
   if(id==='harbor.item.broadcast'){this.broadcastOn=true;this.broadcastElapsed=0;this.feedback('检索开始，外部广播已通电。若出现异常，对准本台再按 F 切断外放。');}
   if(id==='harbor.item.port-record')this.feedback('原始回执：一项深层救援许可曾被人工撤回。签发栏有万斯的确认；撤回理由缺页。');
  }
  if(this.state.completed)this.run.campaign.record(this.index,'evidence');
  this.world.update(this.state,this.epoch);
 }
 armEvent(kind:'grip'|'stowed',id?:string){
  if(kind==='grip'&&id===this.armObject){
    this.state.opened.push(...(this.state.opened.includes(id!)?[]:[id!]));
    this.pendingCargo=id!;this.feedback('翻找完成 · 已夹持物品，按 F 收回机械臂');return true;
  }
  if(kind==='stowed'){
    if(this.pendingCargo){const id=this.pendingCargo;const result=interactExpedition(this.level,this.state,id);this.feedback(result.ok?'机械臂已收妥 · '+result.message:result.message);
     if(result.ok&&this.index===0){
      if(id==='harbor.item.cargo-near')this.run.stock.set('sup.sealant',this.run.stowedCount('sup.sealant')+1);
      if(id==='harbor.item.cargo-deep'){this.run.stock.set('sup.cell',this.run.stowedCount('sup.cell')+1);this.run.stock.set('sup.o2candle',this.run.stowedCount('sup.o2candle')+1);}
     }
    }
    this.pendingCargo=null;this.armObject=null;this.armAnchor=null;return true;
  }
  return false;
 }
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){
  if(this.run.threat&&!['repelled','struck'].includes(this.run.threat.phase)){
   ctx.save();ctx.fillStyle='#d3bd8d';ctx.font=`${Math.max(12,h*.019)}px "Microsoft YaHei"`;
   const shot=this.run.lastCombat;
   const recent=shot&&this.run.clock-shot.at<8;
   ctx.fillText(recent?`${shot.weapon==='decoy'?'声诱饵':'冲击弹'}已发射 · ${shot.hit?'回波响应':'未命中'} · 再次曝光验证效果`:`7 声诱饵 ${this.run.weaponAmmo.decoy}  /  8 冲击弹 ${this.run.weaponAmmo.pulse} · 冲击弹需对准回波`,w*.12,h*.73,w*.76);ctx.restore();
  }
  this.aim();const active=this.target;const message=performance.now()<this.feedbackUntil?this.interactionFeedback:'';
  const atPod=this.index===0&&this.room?.id==='harbor.room.B';
  const contextual=atPod?this.currentGuide():this.guide;
  if(this.index===0&&contextual&&(this.guideLeft>0||atPod)&&!message&&!active&&this.run.arm.phase==='stowed'&&(!this.run.threat||['repelled','struck'].includes(this.run.threat.phase))){
   ctx.save();ctx.textAlign='left';ctx.font=`${Math.max(13,h*.022)}px "Microsoft YaHei"`;ctx.shadowColor='#000';ctx.shadowBlur=5;
   ctx.fillStyle='#d2c1a0';ctx.fillText(atPod&&contextual.id==='photo'?'救生舱 · 摄影取证对象，不是登船入口':contextual.reason,w*.08,h*.80,w*.84);
   ctx.fillStyle='#bdcfcc';ctx.fillText(atPod&&contextual.id==='photo'?'让救生舱完整进入镜头，停稳后按「曝光」；处理完成去分析台核验。':contextual.action,w*.08,h*.845,w*.84);ctx.restore();
  }
  if(!active&&!message&&this.run.arm.phase==='stowed')return;
  const item=this.level.items.find(i=>i.id===(this.armObject??active?.id));
  const title=item?.name??(active?.door?'隔离门':'操作反馈');
  const phase=this.run.arm.phase;
  const status=phase==='aiming'?(this.pendingCargo?'已夹持物品 · F 收回，收妥后入库':'机械臂已伸出 · 对准箱体按 F 翻找'):
   ['extending','gripping','hauling'].includes(phase)?ARM_PHASE_CN[phase]+' · 请等待动作完成':
   message||(active&&this.state.collected.includes(active.id)?'已回收':item&&(item.kind==='cache'||item.kind==='pickup')?'已锁定 · F 伸出机械臂':'已锁定 · F 操作');
  ctx.save();
  const x=w*.055,y=h*.76,pw=w*.69,ph=h*.115;
  ctx.fillStyle='rgba(3,12,18,.56)';ctx.fillRect(x,y,pw,ph);
  ctx.strokeStyle='rgba(210,174,113,.7)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+ph);ctx.stroke();
  ctx.strokeRect(w*.5-8,h*.5-8,16,16);
  ctx.fillStyle='#d9c39e';ctx.font=`${Math.max(12,h*.020)}px "Microsoft YaHei"`;ctx.textAlign='left';
  ctx.fillText(`${title}  /  ${status}`,x+10,y+h*.035,pw-20);
  const emptied=!!item&&this.state.collected.includes(item.id);
  const cargo=emptied?'箱内物资：已回收 · 空箱保留':this.pendingCargo?`已发现：${item?.description??item?.name??'物资'}（待入库）`:'箱内物资：等待翻找核验';
  ctx.fillStyle='#aebbbb';ctx.font=`${Math.max(11,h*.017)}px "Microsoft YaHei"`;
  ctx.fillText(item&&(item.kind==='cache'||item.kind==='pickup')?cargo:(item?.description??'外部设施操作链路'),x+10,y+h*.07,pw-20);
  ctx.fillStyle='#8c9c9c';ctx.fillText(phase==='stowed'?'F 操作':'机械臂链路 / F 下一步 · C 收臂',x+10,y+h*.099,pw-20);
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
  this.lamp.intensity=this.run.lit?(this.index===0?90:48):0;this.fill.position.copy(this.position);this.fill.intensity=this.run.lit?(this.index===0?2.1:1.5):0;
  const lights=this.world.practicalLights.filter(l=>this.index===0?new T.Vector3(...l.position).distanceTo(this.position)<22:this.room?l.room===this.room.id:new T.Vector3(...l.position).distanceTo(this.position)<14)
   .sort((a,b)=>b.intensity/(4+new T.Vector3(...b.position).distanceToSquared(this.position))-a.intensity/(4+new T.Vector3(...a.position).distanceToSquared(this.position)));
  // Emergency fixtures stay visible but must not flood the room like working lights.
  // Their power is independent of the player's searchlight switch.
  this.fixtures.forEach((light,i)=>{const source=lights[i];light.intensity=(source?.intensity??0)*(this.index===0?.35:.16);if(source){light.position.set(...source.position);light.color.set(source.color);light.distance=source.range;}});
  if(this.index===0)this.harborKeys.forEach((key,i)=>{
   const source=lights.filter(l=>l.position[1]>=(this.room?.floorY??-3)+4)[i];
   key.intensity=source?source.intensity*3.8:0;
   if(source){key.position.set(...source.position);key.color.set(source.color);key.distance=source.range*1.4;
    const room=this.level.rooms.find(r=>r.id===source.room);
    key.target.position.set(source.position[0]+((room?.x??source.position[0])-source.position[0])*.25,source.position[1]-6,source.position[2]+((room?.z??source.position[2])-source.position[2])*.25);
   }
  });
  this.atmosphere.update(time,this.camera,this.lamp);this.water.update(this.run.lit?.5:0);this.composer.render();ctx.drawImage(renderer.domElement,0,0,w,h);
 }
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated=false){
  // This is station glass, never part of captureKeyframe / generated footage.
  const size=dedicated?Math.min(w,h/0.93):Math.min(w*(this.run.lit?.28:.40),h*.66),x=dedicated?0:w-size-w*.025,y=dedicated?0:h*.22;
  const cx=x+size/2,cy=y+size*.48,radius=size*.30,scale=radius/SONAR_RANGE;
  const solids=this.navigationSolids();
  if(time-this.sonarAt>.1||time<this.sonarAt||!this.sonarReturns.length){this.sonarReturns=scanNavigationSonar(this.position,this.run.heading,solids);this.sonarAt=time;}
  ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(3,10,14,.91)';ctx.fillRect(x,y,size,size*.93);
  ctx.strokeStyle='#50666e';ctx.lineWidth=1;ctx.strokeRect(x,y,size,size*.93);
  const font=Math.max(11,size*.035);ctx.font=`${font}px "Microsoft YaHei",monospace`;
  ctx.fillStyle='#cadcda';ctx.fillText('近场避障 / 艇首向上',x+size*.04,y+size*.055);
  ctx.fillStyle='#71878b';ctx.fillText('24m · 实时扫描 · 2.4秒/圈',x+size*.04,y+size*.105);
  let above=24,below=24;
  for(const b of solids){
   if(b.max.x<this.position.x-1.4||b.min.x>this.position.x+1.4||b.max.z<this.position.z-1.4||b.min.z>this.position.z+1.4)continue;
   if(b.min.y>=this.position.y)above=Math.min(above,Math.max(0,b.min.y-this.position.y-1.5));
   if(b.max.y<=this.position.y)below=Math.min(below,Math.max(0,this.position.y-b.max.y-1.5));
  }
  ctx.fillStyle=SONAR_STATIC;ctx.fillText(`顶 ${above.toFixed(1)}m / 底 ${below.toFixed(1)}m`,x+size*.04,y+size*.15);
  for(const n of [8,16,24]){ctx.strokeStyle='#294047';ctx.beginPath();ctx.arc(cx,cy,n*scale,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(cx-radius,cy);ctx.lineTo(cx+radius,cy);ctx.moveTo(cx,cy-radius);ctx.lineTo(cx,cy+radius);ctx.stroke();
  const points=this.sonarReturns.map(q=>({x:cx+Math.sin(q.bearing)*q.distance*scale,y:cy-Math.cos(q.bearing)*q.distance*scale,d:q.distance}));
  ctx.strokeStyle=SONAR_STATIC;ctx.fillStyle=SONAR_STATIC;ctx.lineWidth=2;
  points.forEach((p,i)=>{if(p.d>=SONAR_RANGE)return;ctx.globalAlpha=sonarEchoAlpha(time,this.sonarReturns[i].bearing);ctx.fillRect(p.x-1,p.y-1,2,2);const next=points[(i+1)%points.length];if(next.d<SONAR_RANGE&&Math.abs(next.d-p.d)<2){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(next.x,next.y);ctx.stroke();}});
  ctx.globalAlpha=1;drawSonarSweep(ctx,cx,cy,radius,time);
  const heading=this.run.heading*Math.PI/180;
  for(const [id,obj]of this.world.interactables){
   // Only authored gameplay items get a symbol. Decoration contributes to the
   // collision scan above, not this list. Recovered cargo is no longer a target.
   const item=this.level.items.find(item=>item.id===id);
   if(!item||((item.kind==='pickup'||item.kind==='cache')&&this.state.collected.includes(id)))continue;
   if(!obj.visible)continue;const dx=obj.position.x-this.position.x,dz=obj.position.z-this.position.z,dist=Math.hypot(dx,dz);
   if(dist>SONAR_RANGE||dist<.01||Math.abs(obj.position.y-this.position.y)>3)continue;
   const ownBounds=this.bounds.get(id);
   if(sonarRay(this.position,dx/dist,dz/dist,solids.filter(b=>b!==ownBounds))+.15<dist)continue;
   const side=dx*Math.cos(heading)+dz*Math.sin(heading),front=dx*Math.sin(heading)-dz*Math.cos(heading);
   const px=cx+side*scale,py=cy-front*scale;ctx.globalAlpha=sonarEchoAlpha(time,Math.atan2(side,front));ctx.strokeRect(px-3,py-3,6,6);ctx.globalAlpha=1;
  }
  // Nearby sloping connections need vertical guidance, not just an empty 2D gap.
  for(const edge of this.level.edges){
   const path=edge.path;if(!path)continue;
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];if(Math.abs(b[1]-a[1])<2)continue;
    const from=Math.abs(a[1]-this.position.y)<=Math.abs(b[1]-this.position.y)?a:b,to=from===a?b:a;
    if(Math.abs(from[1]-this.position.y)>3)continue;
    const dx=from[0]-this.position.x,dz=from[2]-this.position.z,d=Math.hypot(dx,dz);
    if(d<.1||d>SONAR_RANGE||sonarRay(this.position,dx/d,dz/d,solids)+1<d)continue;
    const side=dx*Math.cos(heading)+dz*Math.sin(heading),front=dx*Math.sin(heading)-dz*Math.cos(heading);
    ctx.fillText(`${to[1]<from[1]?'↓':'↑'}${Math.abs(to[1]-from[1])}m`,cx+side*scale+3,cy-front*scale);
   }
  }
  // Threat returns intentionally reveal only uncertain bearing/range, never a body.
  const threat=this.run.threat;
  if(threat&&threat.phase!=='repelled'&&threat.phase!=='struck'){
   const d=Math.min(.94,Math.max(.08,threat.range))*radius,px=cx+Math.sin(threat.bearing)*d,py=cy-Math.cos(threat.bearing)*d;
   ctx.globalAlpha=Math.max(.6,sonarEchoAlpha(time,threat.bearing));ctx.strokeStyle=SONAR_THREAT;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,py-6);ctx.lineTo(px+6,py);ctx.lineTo(px,py+6);ctx.lineTo(px-6,py);ctx.closePath();ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.fillStyle='#e9f1ea';ctx.fillRect(cx-1.4*scale,cy-2.5*scale,2.8*scale,5*scale);
  ctx.beginPath();ctx.moveTo(cx,cy-9);ctx.lineTo(cx-4,cy-3);ctx.lineTo(cx+4,cy-3);ctx.fill();
  const distances=[0,Math.PI, -Math.PI/2,Math.PI/2].map((a,i)=>Math.max(0,sonarRay(this.position,Math.sin(heading+a),-Math.cos(heading+a),solids)-(i<2?2.5:1.4)));
  ctx.fillStyle=SONAR_STATIC;ctx.fillText(`前 ${distances[0].toFixed(1)}  后 ${distances[1].toFixed(1)}m`,x+size*.04,y+size*.81);
  ctx.fillText(`左 ${distances[2].toFixed(1)}  右 ${distances[3].toFixed(1)}m`,x+size*.04,y+size*.86);
  ctx.font=`${Math.max(10,size*.027)}px "Microsoft YaHei",monospace`;
  ctx.fillStyle=SONAR_STATIC;ctx.fillText('□ 可交互',x+size*.04,y+size*.915);
  ctx.fillText('─ 障碍',x+size*.36,y+size*.915);
  ctx.fillStyle=SONAR_THREAT;ctx.fillText('◇ 异常',x+size*.68,y+size*.915);
  ctx.restore();
 }
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.fillStyle='#061115';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c7b68e';ctx.font=`${Math.max(12,h*.032)}px monospace`;ctx.fillText(this.level.name,w*.05,h*.07);
  const rooms=this.level.rooms,minX=Math.min(...rooms.map(r=>r.x-r.width/2)),maxX=Math.max(...rooms.map(r=>r.x+r.width/2)),minZ=Math.min(...rooms.map(r=>r.z-r.depth/2)),maxZ=Math.max(...rooms.map(r=>r.z+r.depth/2));
  const scale=Math.min(w*.86/(maxX-minX),h*.68/(maxZ-minZ));const xy=(x:number,z:number)=>[w*.07+(x-minX)*scale,h*.14+(z-minZ)*scale];
  ctx.lineWidth=2;for(const e of this.level.edges){const a=rooms.find(r=>r.id===e.from)!,b=rooms.find(r=>r.id===e.to)!;const points=e.path??[[a.x,0,a.z],[b.x,0,b.z]];ctx.strokeStyle=!e.requires?.length||this.state.opened.includes(e.id)?'#8e9d94':'#665a43';ctx.beginPath();points.forEach((p,i)=>{const q=xy(p[0],p[2]);if(i===0)ctx.moveTo(...q as [number,number]);else ctx.lineTo(...q as [number,number]);});ctx.stroke();}
  for(const r of rooms){const [x,z]=xy(r.x-r.width/2,r.z-r.depth/2),visited=this.state.visited.includes(r.id);ctx.fillStyle=visited?'#304047':'#14242c';ctx.fillRect(x,z,r.width*scale,r.depth*scale);
   if(this.index===0&&visited){ctx.fillStyle='#c7bd9e';ctx.font=`${Math.max(9,h*.018)}px "Microsoft YaHei"`;ctx.fillText(r.id.split('.').at(-1)??'',x+3,z+13);ctx.fillText(`${1012-(r.elevation??0)}m`,x+3,z+27);}
  }
  const [x,z]=xy(this.position.x,this.position.z);ctx.fillStyle='#ffc273';ctx.beginPath();ctx.arc(x,z,5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#b5d3ce';ctx.font=`${Math.max(11,h*.027)}px monospace`;ctx.fillText(`已探索 ${this.state.visited.length}/${rooms.length} · 已核验 ${this.state.collected.length}/${this.level.items.length}`,w*.05,h*.90);
  ctx.fillText(this.objective??this.run.departHint,w*.05,h*.95,w*.90);
 }
 snapshot(){return{index:this.index,levelId:this.level.id,position:this.position.toArray(),state:structuredClone(this.state),harbor:structuredClone(this.harbor),events:{hunt:{...this.harborHunt},broadcastOn:this.broadcastOn,broadcastElapsed:this.broadcastElapsed,encounterStarted:this.encounterStarted,knockDone:this.knockDone,knockInvited:this.knockInvited,knockReplyAt:this.knockReplyAt,revealSeen:this.revealSeen},rooms:this.level.rooms.length,doors:this.world.doors.size,anchors:this.world.anchors.length};}
 restore(snapshot:unknown):boolean {
  const s=snapshot as ReturnType<PodExpedition['snapshot']>;
  if(!s||s.index!==this.index||s.levelId!==this.level.id||s.state?.levelId!==this.level.id||s.state.version!==1||!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite))return false;
  if(this.index===0&&(!s.harbor||s.harbor.version!==1||s.harbor.levelId!=='harbor.1'||!Array.isArray(s.harbor.grants)||!Array.isArray(s.harbor.exposures)))return false;
  for(const key of ['inventory','collected','opened','visited','recorded'] as const)if(!Array.isArray(s.state[key])||s.state[key].some(v=>typeof v!=='string'))return false;
  const p=new T.Vector3(...s.position);if(!this.world.walkable.some(b=>b.containsPoint(p)))return false;
  Object.assign(this.state,structuredClone(s.state));this.position.copy(p);
  if(this.index===0){this.harbor=structuredClone(s.harbor);this.state.inventory=syncHarborInventory(this.harbor,this.state.inventory);this.broadcastOn=!!s.events?.broadcastOn;this.broadcastElapsed=s.events?.broadcastElapsed??0;this.encounterStarted=!!s.events?.encounterStarted;this.knockDone=!!s.events?.knockDone;}
  this.revealSeen=!!s.events?.revealSeen;
  const hunt=s.events?.hunt;
  this.harborHunt={first:!!hunt?.first,dwell:Number.isFinite(hunt?.dwell)?Math.max(0,hunt.dwell):0,pressure:Number.isFinite(hunt?.pressure)?Math.max(0,hunt.pressure):0,cooldown:Number.isFinite(hunt?.cooldown)?Math.max(0,hunt.cooldown):0};
  this.knockInvited=!!s.events?.knockInvited;this.knockReplyAt=Number.isFinite(s.events?.knockReplyAt)?s.events.knockReplyAt:-1;
  this.world.update(this.state,0);this.world.root.updateMatrixWorld(true);return true;
 }
 dispose(){this.salvageArm.dispose();this.world.dispose();this.atmosphere.dispose();this.composer.passes.forEach(p=>p.dispose());this.composer.dispose();this.lamp.shadow.dispose();this.harborKeys.forEach(key=>key.shadow.dispose());}
}
