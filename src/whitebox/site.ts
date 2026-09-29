import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import type {AuthoredSite} from '../pod/sim/authored-site';
import type {PodRun} from '../pod/sim/run';
import {harborHullClear,sweepHarborHeading} from '../pod/sim/harbor-navigation';
import {createExpeditionAtmosphere} from '../pod/view/deepsea/expedition-atmosphere';
import {createReferenceWater} from '../pod/view/deepsea/reference-water';
import {createWhiteboxWorld} from './world';

type Evidence={version:1; epoch:number; kind:'threat'|'lure'|'gate'|'empty'; visible:boolean; gateClosed:boolean; monsterInside:boolean};
/** Isolated chapter-one experiment. Facts belong to the exposed reel, never to analysis time. */
export class WhiteboxSite implements AuthoredSite {
 readonly index=0; readonly managesThreats=true; readonly spatialThreat=false;
 readonly world=createWhiteboxWorld(); readonly position=new T.Vector3(0,2,18);
 recording=false; complete=false; identified=false; powered=false; lured=false; verified=false; rescued=false;
 gateClosed=false; monsterInside=false; epoch=0; lureTime=0; elapsed=0;
 readonly events:{time:number;event:string}[]=[];
 private analyzed=new Set<string>();
 private lurePath:T.Vector3[]=[];
 private renderer=new T.WebGLRenderer({antialias:true});
 private camera=new T.PerspectiveCamera(64,1,.08,120);
 private lamp=new T.SpotLight(0xc0e7e7,90,32,.72,.6,1.65);
 private fill=new T.PointLight(0x568b9a,2.1,7,2);
 private atmosphere=createExpeditionAtmosphere();
 private composer:EffectComposer; private water:ReturnType<typeof createReferenceWater>;
 private ao:SSAOPass;
 private size='';
 constructor(readonly run:PodRun){
  this.renderer.setPixelRatio(1);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
  this.world.scene.add(this.lamp,this.lamp.target,this.fill,new T.HemisphereLight(0x63818a,0x11191b,.012),this.atmosphere.root);
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.world.scene,this.camera));
  this.ao=new SSAOPass(this.world.scene,this.camera,512,360);this.ao.kernelRadius=8;this.ao.minDistance=.005;this.ao.maxDistance=.12;this.composer.addPass(this.ao);
  this.water=createReferenceWater(this.camera,this.lamp,this.ao.normalRenderTarget.depthTexture!);this.composer.addPass(this.water.pass);this.composer.addPass(new OutputPass());
  this.world.monster.position.set(3,2,-10);this.world.gate.position.y=10;
  run.heading=0;this.say('万斯：接驳层有人回应。先找到维修笼；录像处理期间你仍能航行。');
 }
 get evidenceReady(){return this.verified;}
 get elevation(){return this.position.y;}
 get description(){return '独立白模 / 接驳层；使用实际艇外底片，禁止添加不存在的生物或建筑。';}
 get objective(){
  if(this.complete)return '验证完成：埃利亚斯已成为同伴。可重启独立白模。';
  if(this.rescued)return '前往东南下潜接口 05，按 F 完成本次验证';
  if(this.verified)return '前往中央维修笼 04，靠近面板按 F 接驳救援';
  if(this.gateClosed)return '拍摄东仓观察窗，去分析台确认隔离结果';
  if(this.lured)return '怪物已入仓：控制台 F 关闭隔离门，再拍结果录像';
  if(this.lureTime>0)return '诱饵绞盘工作中：等待拖行声停止，拍摄东仓并分析';
  if(this.powered)return '前往东侧绞盘台 03，按 F 启动诱饵';
  if(this.identified)return '去西侧配电台 02，按 F 恢复隔离设施供电';
  return '靠近中央观察位 01，拍摄维修笼与周围，显影后去分析台';
 }
 get hint(){return this.objective+' · 2 摄影 / 5 分析 / F 设施 · 图上圆点为合法停船位';}
 private say(text:string){this.run.pushLog(text,'system');this.events.push({time:this.elapsed,event:text});}
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');this.camera.updateMatrixWorld();}
 private solids(){return this.gateClosed?[...this.world.solids,new T.Box3(new T.Vector3(7,0,-5.3),new T.Vector3(17,6.5,-4.7))]:this.world.solids;}
 private clear(p:T.Vector3,h=this.run.heading){return harborHullClear(p,h,this.world.walkable,this.solids());}
 move(distance:number){let moved=false;const n=Math.max(1,Math.ceil(Math.abs(distance)/.08));const h=T.MathUtils.degToRad(this.run.heading);for(let i=0;i<n;i++){const p=this.position.clone().add(new T.Vector3(Math.sin(h)*distance/n,0,-Math.cos(h)*distance/n));if(!this.clear(p))break;this.position.copy(p);moved=true;}return moved;}
 turn(degrees:number){return sweepHarborHeading(this.run.heading,degrees,h=>this.clear(this.position,h));}
 moveVertical(distance:number){const n=Math.max(1,Math.ceil(Math.abs(distance)/.04));let moved=false;for(let i=0;i<n;i++){const p=this.position.clone();p.y+=distance/n;if(!this.clear(p))break;this.position.copy(p);moved=true;}return moved;}
 private visible(target:T.Vector3,max=25,ignoreTargetBody=false){
  this.pose();const delta=target.clone().sub(this.position),d=delta.length();if(d>max||d<.1)return false;
  const local=target.clone().project(this.camera);if(Math.abs(local.x)>.85||Math.abs(local.y)>.85||local.z>1||local.z< -1)return false;
  const ray=new T.Ray(this.position,delta.normalize());return !this.world.solids.some(b=>{if(ignoreTargetBody&&b.containsPoint(target))return false;const hit=ray.intersectBox(b,new T.Vector3());return hit&&hit.distanceTo(this.position)<d-.3;});
 }
 captureEvidence():Evidence{
  let kind:Evidence['kind']='empty';let target=this.world.monster.position.clone();
  if(!this.identified)kind='threat';else if(this.gateClosed){kind='gate';target=new T.Vector3(12,2,-5);}else if(this.monsterInside)kind='lure';
  return {version:1,epoch:this.epoch,kind,visible:kind!=='empty'&&this.visible(target),gateClosed:this.gateClosed,monsterInside:this.monsterInside};
 }
 analyzeEvidence(value:unknown):string[]{
  const v=value as {capture?:Evidence;media?:{playable:boolean;mediaId:string}};const e=v?.capture;
  if(!e||e.version!==1||!v.media?.playable)return ['没有可播放的连续影像；重新曝光。'];
  if(!e.visible)return ['目标不在画面内或被设施挡住。回到圆形观察标记，对准目标重新拍摄。'];
  if(this.analyzed.has(v.media.mediaId))return ['此录像已核验；重复播放不改变现场。'];
  this.analyzed.add(v.media.mediaId);
  if(e.epoch!==this.epoch)return ['这是设施状态改变前的旧片。可作为历史记录，不能确认当前隔离状态。'];
  if(e.kind==='threat'){
   this.identified=true;this.say('万斯：笼外有东西贴着支架。先别开笼。西侧配电台可恢复货仓绞盘，用声音把它引开。');
   return ['底片：维修笼旁有完整生物轮廓；埃利亚斯仍被困在笼内。','已确认威胁。下一步：西侧配电台 02。'];
  }
  if(e.kind==='lure'&&e.monsterInside&&!e.gateClosed){this.lured=true;this.say('万斯：影像里它整个进入了货仓。现在可以关门，之后再核验门后的结果。');return ['怪物全部进入货仓，隔离门尚未关闭。','返回绞盘控制台，F 关闭隔离门。'];}
  if(e.kind==='gate'&&e.gateClosed&&e.monsterInside){this.verified=true;this.say('万斯：闸板落到底，观察窗内仍有那个轮廓。隔离成立，接埃利亚斯上艇。');return ['闸板闭合，观察窗内可见怪物；笼外通路已安全。','前往中央维修笼 04，F 接驳救援。'];}
  return ['门已关闭，但怪物没有进入仓内。隔离失败；回控制台 F 重新开门，再 F 启动诱饵。'];
 }
 private aimedPanel():string|null{
  this.pose();const forward=this.camera.getWorldDirection(new T.Vector3());
  for(const key of ['power','control','rescue','exit']){const p=this.world.anchors[key+'Panel'];if(!p)continue;const d=p.clone().sub(this.position),len=d.length();if(len<=3.4&&d.normalize().dot(forward)>.94&&this.visible(p,3.4,true))return key;}
  return null;
 }
 interact(){
  if(this.run.driveBlock){this.say(this.run.driveBlock);return;}
  const panel=this.aimedPanel();if(!panel){this.say('靠近编号面板（3.4 米以内），让镜头对准它；地面圆环是停船位置。');return;}
  if(panel==='power'){
   if(!this.identified){this.say('万斯：先确认维修笼旁的危险，再给设施通电。');return;}
   this.powered=true;this.run.power=1;this.say('配电接通；船用电池补满。可随时返回此处补电。东仓诱饵与隔离闸已可用。');return;
  }
  if(panel==='control'){
   if(!this.powered){this.say('控制台无电；先去西侧配电台 02。');return;}
   if(this.gateClosed){this.gateClosed=false;this.verified=false;this.lured=false;this.lureTime=0;this.epoch++;this.say('隔离门重新开启。F 再次启动诱饵；先拍摄确认入仓，再关门。');return;}
   if(this.lureTime<=0){this.lureTime=.001;this.lurePath=this.monsterInside?[this.world.monster.position.clone(),new T.Vector3(12,2,-10)]:[this.world.monster.position.clone(),new T.Vector3(3,2,0),new T.Vector3(12,2,0),new T.Vector3(12,2,-10)];this.epoch++;this.say('绞盘开始拖动空货箱。约 9 秒后停止；拍摄货仓内的实际结果。');return;}
   this.gateClosed=true;this.epoch++;this.say(this.monsterInside?'闸门已关闭。仍需拍摄观察窗确认隔离。':'闸门过早关闭，仓外传来撞击。拍摄核验，或 F 重开后重试。');return;
  }
  if(panel==='rescue'){
   if(!this.verified){this.say('埃利亚斯：先别开笼，我这边还看不清。万斯：需要隔离后的结果录像。');return;}
   if(!this.rescued){this.rescued=true;this.world.elias.visible=false;this.say('接驳密封完成。埃利亚斯进入艇内：谢谢……我来盯着压力表。万斯：带他去东南下潜接口。');}return;
  }
  if(panel==='exit'){if(!this.rescued){this.say('救援尚未完成：先接回埃利亚斯。');return;}this.complete=true;this.run.pilot.stop();this.say('白模验证通关：三轮摄影核验完成，埃利亚斯已安全登艇。');}
 }
 tick(dt:number){
  this.elapsed+=dt;
  if(this.lureTime>0&&!this.gateClosed){this.lureTime+=dt;const t=Math.min(1,this.lureTime/9),segments=this.lurePath.length-1,part=Math.min(segments-1,Math.floor(t*segments));if(part>=0)this.world.monster.position.lerpVectors(this.lurePath[part],this.lurePath[part+1],Math.min(1,t*segments-part));if(t===1&&!this.monsterInside){this.monsterInside=true;this.say('拖行声停止。万斯：先看录像；听见绞盘停下，不等于它已经进仓。');}}
  this.world.gate.position.y=this.gateClosed?3.25:10;
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number){
  this.pose();this.world.monster.visible=this.recording;this.world.scene.updateMatrixWorld(true);
  if(this.size!==`${w}:${h}`){this.renderer.setSize(w,h,false);this.composer.setSize(w,h);this.size=`${w}:${h}`;}this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  this.lamp.position.copy(this.position);this.lamp.position.y-=.18;this.lamp.target.position.copy(this.position).addScaledVector(this.camera.getWorldDirection(new T.Vector3()),12);
  this.lamp.intensity=this.run.lit?90:0;this.fill.position.copy(this.position);this.fill.intensity=this.run.lit?2.1:0;
  this.atmosphere.update(time,this.camera,this.lamp);this.water.update(this.run.lit?.5:0);this.composer.render();ctx.drawImage(this.renderer.domElement,0,0,w,h);
  if(!this.recording){
   ctx.save();const fs=Math.max(13,Math.round(w*.018));ctx.font=`${fs}px "Microsoft YaHei"`;
   ctx.fillStyle='rgba(4,14,18,.85)';ctx.fillRect(w*.06,h*.78,w*.88,h*.14);
   ctx.fillStyle='#d1dfcf';let line='',row=0;for(const ch of this.objective){if(ctx.measureText(line+ch).width>w*.82){ctx.fillText(line,w*.08,h*.825+row*fs*1.3);line='';row++;}line+=ch;}ctx.fillText(line,w*.08,h*.825+row*fs*1.3);
   ctx.restore();
  }
 }
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){const panel=this.aimedPanel();if(!panel)return;ctx.save();ctx.fillStyle='#b7d8ce';ctx.font='16px "Microsoft YaHei"';ctx.fillText(`F · ${{power:'补电 / 设施供电',control:!this.powered?'控制台无电 · 先去 02':this.gateClosed?'重新开门':this.lureTime>0?'关闭隔离门':'启动诱饵绞盘',rescue:this.verified?'接驳维修笼':'等待隔离核验',exit:this.rescued?'下潜接口':'等待同伴登艇'}[panel]}`,w*.3,h*.735);ctx.restore();}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.fillStyle='#091215';ctx.fillRect(0,0,w,h);const s=Math.min(w/48,h/49),ox=w/2,oz=h*.43;
  const point=(p:T.Vector3)=>[ox+p.x*s,oz+p.z*s];ctx.strokeStyle='#566b6c';ctx.strokeRect(ox-20*s,oz-18*s,40*s,42*s);
  ctx.font='13px "Microsoft YaHei"';for(const [key,label] of Object.entries({observe:'01 摄影',power:'02 配电',control:'03 诱饵/闸门',rescue:'04 接驳',exit:'05 下潜'})){const p=this.world.anchors[key];const [x,y]=point(p);ctx.strokeStyle='#80a99c';ctx.beginPath();ctx.arc(x,y,1.8*s,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#bfd0c7';ctx.fillText(label,x+8,y-5);}
  ctx.fillStyle='#e9c786';const [x,y]=point(this.position);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();const a=this.run.heading*Math.PI/180;ctx.strokeStyle='#e9c786';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(a)*15,y-Math.cos(a)*15);ctx.stroke();ctx.restore();
 }
 snapshot(){return {levelId:'whitebox.chapter1',index:0,position:this.position.toArray(),heading:this.run.heading,identified:this.identified,powered:this.powered,lureTime:this.lureTime,lured:this.lured,gateClosed:this.gateClosed,monsterInside:this.monsterInside,verified:this.verified,rescued:this.rescued,complete:this.complete,epoch:this.epoch,elapsed:this.elapsed,objective:this.objective,events:this.events};}
 dispose(){this.atmosphere.dispose();this.ao.dispose();this.composer.dispose();this.renderer.dispose();this.world.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
}
