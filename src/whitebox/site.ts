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

type Evidence={version:1; epoch:number; kind:'threat'|'lure'|'gate'|'departure'|'empty'; visible:boolean; gateClosed:boolean; monsterInside:boolean};
/** Isolated chapter-one experiment. Facts belong to the exposed reel, never to analysis time. */
export class WhiteboxSite implements AuthoredSite {
 readonly index=0; readonly managesThreats=true; readonly spatialThreat=false;
 readonly world=createWhiteboxWorld(); readonly position=new T.Vector3(0,2,18);
 recording=false; complete=false; identified=false; powered=false; lured=false; verified=false; rescued=false;
 gateClosed=false; monsterInside=false; epoch=0; lureTime=0; elapsed=0;
 departureConfirmed=false; departureTime=0;
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
 private lastBlocked=-10;
 private soundBeat=0;
 constructor(readonly run:PodRun){
  this.renderer.setPixelRatio(1);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
  this.world.scene.add(this.lamp,this.lamp.target,this.fill,new T.HemisphereLight(0x63818a,0x11191b,.012),this.atmosphere.root);
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.world.scene,this.camera));
  this.ao=new SSAOPass(this.world.scene,this.camera,512,360);this.ao.kernelRadius=8;this.ao.minDistance=.005;this.ao.maxDistance=.12;this.composer.addPass(this.ao);
  this.water=createReferenceWater(this.camera,this.lamp,this.ao.normalRenderTarget.depthTexture!);this.composer.addPass(this.water.pass);this.composer.addPass(new OutputPass());
  this.world.monster.position.set(3,2,-10);this.world.gate.position.y=10;
  run.heading=0;this.say('艾里亚斯〔港口应急频道〕：有人吗？我是这里的维修员。断桥北面，门口有东西……我不敢出去。');
 }
 get evidenceReady(){return this.verified;}
 get elevation(){return this.position.y;}
 get description(){return '独立白模 / 接驳层；使用实际艇外底片，禁止添加不存在的生物或建筑。';}
 get objective(){
  if(this.complete)return '接驳港完成：艾里亚斯沿内侧通道撤离，你从外侧水道下潜。';
  if(this.rescued&&!this.departureConfirmed)return this.departureTime<4?'留在 04，等待艾里亚斯到内侧门后发来信号':'留在 04 面向北：拍摄艾里亚斯穿过内侧门的结果，在分析台核验';
  if(this.rescued)return '前往东南下潜接口 05，按 F 完成本次验证';
  if(this.verified)return '沿中央通道抵达 04，面向北侧控制面板，F 接通内侧逃生门';
  if(this.gateClosed)return '留在 03，船头转向北 0°，拍摄仓门观察窗；分析隔离结果';
  if(this.lured)return '怪物已入仓：在 03 面朝东 90°按 F 关门，再转向北拍摄仓门';
  if(this.lureTime>0)return this.monsterInside?'拖行声已经停止：在 03 面朝北拍摄仓内，显影后分析':'诱饵绞盘工作中：等待拖行声停止，拍摄东仓并分析';
  if(this.powered)return '前往东侧 03，船头朝东 90°对准面板，按 F 启动诱饵';
  if(this.identified)return '去西侧配电台 02，船头朝北 0°靠近面板，按 F 恢复供电';
  return '沿中央通道到观察位 01，船头朝北 0°拍摄维修隔间周围，显影后分析';
 }
 get hint(){return this.objective+' · 2 摄影 / 5 分析 / F 设施 · 图上圆点为合法停船位';}
 private say(text:string){this.run.pushLog(text,'system');this.run.storyCaption=text;this.run.storyCaptionLeft=12;if(text.includes('艾里亚斯：'))this.run.onCue?.('radio.squelch',.24);this.events.push({time:this.elapsed,event:text});}
 get targetKey(){return this.rescued?(this.departureConfirmed?'exit':'rescue'):this.verified?'rescue':this.powered?'control':this.identified?'power':'observe';}
 get stage(){return this.complete?6:this.departureConfirmed?5:this.rescued?4:this.verified?3:this.powered?2:this.identified?1:0;}
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;
  const s=value as ReturnType<WhiteboxSite['snapshot']>;
  const flags=['identified','powered','lured','gateClosed','monsterInside','verified','rescued','complete','departureConfirmed'] as const;
  if(s.levelId!=='whitebox.chapter1'||s.version!==2||!flags.every(k=>typeof s[k]==='boolean'))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||![s.heading,s.epoch,s.elapsed,s.lureTime,s.departureTime].every(Number.isFinite))return false;
  if((s.verified&&(!s.gateClosed||!s.monsterInside))||(s.rescued&&!s.verified)||(s.departureConfirmed&&!s.rescued)||(s.complete&&!s.departureConfirmed))return false;
  // Check against the proposed door state before mutating any live state.
  const solids=s.gateClosed?[...this.world.solids,new T.Box3(new T.Vector3(7,0,-5.3),new T.Vector3(17,6.5,-4.7))]:this.world.solids;
  if(!harborHullClear(new T.Vector3(...s.position),s.heading,this.world.walkable,solids))return false;
  for(const k of flags)this[k]=s[k];
  this.position.set(...s.position);this.run.heading=s.heading;this.epoch=s.epoch;this.elapsed=s.elapsed;this.lureTime=s.lureTime;this.departureTime=s.departureTime;
  this.world.monster.position.set(s.monsterInside?12:3,2,-10);
  this.lurePath=[this.world.monster.position.clone(),new T.Vector3(3,2,0),new T.Vector3(12,2,0),new T.Vector3(12,2,-10)];
  this.events.length=0;this.analyzed.clear();this.tick(0);return true;
 }
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');this.camera.updateMatrixWorld();}
 private solids(){return this.gateClosed?[...this.world.solids,new T.Box3(new T.Vector3(7,0,-5.3),new T.Vector3(17,6.5,-4.7))]:this.world.solids;}
 private clear(p:T.Vector3,h=this.run.heading){return harborHullClear(p,h,this.world.walkable,this.solids());}
 private blocked(){if(this.elapsed-this.lastBlocked<5)return;this.lastBlocked=this.elapsed;this.say('艇体靠设施太近：先倒退腾出转弯空间，再转船头。');}
 move(distance:number){let moved=false;const n=Math.max(1,Math.ceil(Math.abs(distance)/.08));const h=T.MathUtils.degToRad(this.run.heading);for(let i=0;i<n;i++){const p=this.position.clone().add(new T.Vector3(Math.sin(h)*distance/n,0,-Math.cos(h)*distance/n));if(!this.clear(p)){this.blocked();break;}this.position.copy(p);moved=true;}return moved;}
 turn(degrees:number){const h=sweepHarborHeading(this.run.heading,degrees,h=>this.clear(this.position,h));if(Math.abs(degrees)>.01&&Math.abs(((h-this.run.heading+540)%360)-180)<.01)this.blocked();return h;}
 moveVertical(distance:number){const n=Math.max(1,Math.ceil(Math.abs(distance)/.04));let moved=false;for(let i=0;i<n;i++){const p=this.position.clone();p.y+=distance/n;if(!this.clear(p))break;this.position.copy(p);moved=true;}return moved;}
 private visible(target:T.Vector3,max=25,ignoreTargetBody=false){
  this.pose();const delta=target.clone().sub(this.position),d=delta.length();if(d>max||d<.1)return false;
  const local=target.clone().project(this.camera);if(Math.abs(local.x)>.85||Math.abs(local.y)>.85||local.z>1||local.z< -1)return false;
  const ray=new T.Ray(this.position,delta.normalize());return !this.world.solids.some(b=>{if(ignoreTargetBody&&b.containsPoint(target))return false;const hit=ray.intersectBox(b,new T.Vector3());return hit&&hit.distanceTo(this.position)<d-.3;});
 }
 captureEvidence():Evidence{
  let kind:Evidence['kind']='empty';let target=this.world.monster.position.clone();
  if(this.rescued&&!this.departureConfirmed){kind=this.departureTime>=4?'departure':'empty';target=this.world.elias.position.clone().add(new T.Vector3(0,.65,0));}
  else if(!this.identified)kind='threat';else if(this.gateClosed){kind='gate';target=new T.Vector3(12,2,-5);}else if(this.monsterInside)kind='lure';
  return {version:1,epoch:this.epoch,kind,visible:kind!=='empty'&&this.visible(target),gateClosed:this.gateClosed,monsterInside:this.monsterInside};
 }
 analyzeEvidence(value:unknown):string[]{
  const v=value as {capture?:Evidence;media?:{playable:boolean;mediaId:string}};const e=v?.capture;
  if(!e||e.version!==1||!v.media?.playable)return ['没有可播放的连续影像；重新曝光。'];
  if(!e.visible)return ['目标不在画面内或被设施挡住。回到圆形观察标记，对准目标重新拍摄。'];
  if(this.analyzed.has(v.media.mediaId))return ['此录像已核验；重复播放不改变现场。'];
  this.analyzed.add(v.media.mediaId);
  if(e.epoch!==this.epoch)return ['这是设施状态改变前的旧片。可作为历史记录，不能确认当前隔离状态。'];
  if(e.kind==='departure'&&this.rescued){this.departureConfirmed=true;this.say('艾里亚斯：我进来了。桥断了，你的艇过不来。我沿楼内往下走，你走外面；下一层保持这个频道。');return ['影像：艾里亚斯从维修隔间走到内侧门后，与你隔着断桥挥手。','他已脱离仓外危险。你与他分路下潜；前往东南 05 接口。'];}
  if(e.kind==='threat'){
   this.identified=true;this.say('罗温：那是什么……它的腿是反着的。艾里亚斯：我不知道。西边配电恢复后，东仓能拖动货箱，也许能把它引过去。');
   return ['底片：维修笼旁有完整生物轮廓；埃利亚斯仍被困在笼内。','已确认威胁。下一步：西侧配电台 02。'];
  }
  if(e.kind==='lure'&&e.monsterInside&&!e.gateClosed){this.lured=true;this.say('罗温：它整个进去了。货箱还在响，我去关门。');return ['怪物全部进入货仓，隔离门尚未关闭。','返回绞盘控制台，F 关闭隔离门，再拍摄确认隔离。'];}
  if(e.kind==='gate'&&e.gateClosed&&e.monsterInside){this.verified=true;this.say('罗温：门落到底了，它在栏后。艾里亚斯，我去接通你那边的逃生门。');return ['闸板闭合，观察窗内可见怪物；笼外通路已安全。','前往中央 04 控制面板，F 接通内侧门。'];}
  return ['门已关闭，但怪物没有进入仓内。隔离失败；回控制台 F 重新开门，再 F 启动诱饵。'];
 }
 private aimedPanel():string|null{
  this.pose();const forward=this.camera.getWorldDirection(new T.Vector3());
  for(const key of ['power','control','rescue','exit']){const p=this.world.anchors[key+'Panel'];if(!p)continue;const d=p.clone().sub(this.position),len=d.length();if(len<=3.4&&d.normalize().dot(forward)>.94&&this.visible(p,3.4,true))return key;}
  return null;
 }
 interact(){
  // Shore-fed supply panel remains usable even when the boat battery is empty.
  const supply=this.aimedPanel()==='power'&&!['exposing','developing'].includes(this.run.shot.phase)&&!this.run.shot.viewing;
  if(this.run.driveBlock&&!supply){this.say(this.run.driveBlock);return;}
  const panel=this.aimedPanel();if(!panel){
   const nearby=['power','control','rescue','exit'].map(key=>this.world.anchors[key+'Panel']).filter(p=>p.distanceTo(this.position)<=3.4);
   if(!nearby.length)this.say('距离不足：向当前目标的编号面板靠近，进入 3.4 米操作范围。地面圆环是停船位置。');
   else{this.pose();const forward=this.camera.getWorldDirection(new T.Vector3());const faced=nearby.some(p=>p.clone().sub(this.position).normalize().dot(forward)>.94);this.say(faced?'视线受阻：调整船位，让镜头能直接看到面板。':'距离已经足够，朝向未对准：转动船头对准面板；贴得太近转不动时先倒退。');}
   return;
  }
  if(panel==='power'){
   this.run.power=1;this.run.blackout=false;this.run.vitals.restore({oxygen:this.run.vitals.vitals.oxygenMax-this.run.vitals.vitals.oxygen});
   if(!this.identified){this.say('船用电池已补满。艾里亚斯：先拍清门外的东西，我再告诉你隔离设施怎么接电。');return;}
   this.powered=true;this.say('配电接通；船用电池与氧气补满。可返回此处补给。东仓诱饵与隔离闸已可用。');return;
  }
  if(panel==='control'){
   if(this.rescued){this.say('艾里亚斯已经撤离，保留隔离门关闭，前往下潜接口。');return;}
   if(!this.powered){this.say('控制台无电；先去西侧配电台 02。');return;}
   if(this.gateClosed){this.gateClosed=false;this.verified=false;this.lured=false;this.lureTime=0;this.epoch++;this.say('隔离门重新开启。F 再次启动诱饵；先拍摄确认入仓，再关门。');return;}
   if(this.lureTime<=0){this.lureTime=.001;this.lurePath=this.monsterInside?[this.world.monster.position.clone(),new T.Vector3(12,2,-10)]:[this.world.monster.position.clone(),new T.Vector3(3,2,0),new T.Vector3(12,2,0),new T.Vector3(12,2,-10)];this.epoch++;this.say('绞盘开始拖动空货箱。约 9 秒后停止；拍摄货仓内的实际结果。');return;}
   this.gateClosed=true;this.epoch++;this.say(this.monsterInside?'闸门已关闭。仍需拍摄观察窗确认隔离。':'闸门过早关闭，仓外传来撞击。拍摄核验，或 F 重开后重试。');return;
  }
  if(panel==='rescue'){
   if(!this.verified){this.say('艾里亚斯：先别开门，它还可能回来。你拍到隔离门关严了吗？');return;}
   if(!this.rescued){this.rescued=true;this.departureTime=0;this.epoch++;this.say('内侧门恢复供电。艾里亚斯：我试着过去……别走，等我到另一侧给你信号。');}return;
  }
  if(panel==='exit'){if(!this.departureConfirmed){this.say('先确认艾里亚斯抵达内侧门：在 04 拍摄并分析撤离结果。');return;}this.complete=true;this.run.pilot.stop();this.say('艾里亚斯：我听到楼下也有那种声音。罗温：别开门，等我到下一层再看。接驳港完成。');}
 }
 tick(dt:number){
  this.elapsed+=dt;
  this.soundBeat-=dt;
  if(this.soundBeat<=0&&!this.complete){this.soundBeat=this.lureTime>0&&!this.monsterInside?2:11;this.run.onCue?.(this.lureTime>0&&!this.monsterInside?'arm.pump-start':this.gateClosed?'hull.ping-return':'creature.skitter',this.gateClosed?.12:.22);}
  if(this.rescued){const before=this.departureTime;this.departureTime+=dt;this.world.elias.position.set(-Math.min(1,this.departureTime/2)*1.6,2,-13-Math.max(0,Math.min(1,(this.departureTime-2)/2))*.8);if(before<4&&this.departureTime>=4)this.say('艾里亚斯：我到内侧门了，看见我了吗？我在门后等你。');}
  if(this.lureTime>0&&!this.gateClosed){this.lureTime+=dt;const t=Math.min(1,this.lureTime/9),segments=this.lurePath.length-1,part=Math.min(segments-1,Math.floor(t*segments));if(part>=0)this.world.monster.position.lerpVectors(this.lurePath[part],this.lurePath[part+1],Math.min(1,t*segments-part));if(t===1&&!this.monsterInside){this.monsterInside=true;this.say('拖行声从桥下移向东仓，然后停住。艾里亚斯：我听不到它了……它进去了吗？');}}
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
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){const panel=this.aimedPanel();if(!panel)return;ctx.save();ctx.fillStyle='#b7d8ce';ctx.font='16px "Microsoft YaHei"';ctx.fillText(`F · ${{power:'氧气 / 补电 / 设施供电',control:!this.powered?'控制台无电 · 先去 02':this.gateClosed?'重新开门':this.lureTime>0?'关闭隔离门':'启动诱饵绞盘',rescue:this.verified?'接通内侧门':'等待隔离核验',exit:this.departureConfirmed?'下潜接口':'等待撤离录像核验'}[panel]}`,w*.3,h*.735);ctx.restore();}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.fillStyle='#091215';ctx.fillRect(0,0,w,h);const s=Math.min(w/48,h/49),ox=w/2,oz=h*.43;
  const point=(p:T.Vector3)=>[ox+p.x*s,oz+p.z*s];ctx.strokeStyle='#566b6c';ctx.strokeRect(ox-20*s,oz-18*s,40*s,42*s);
  ctx.fillStyle='#405153';for(const solid of this.world.solids){if(solid.min.y>3||solid.max.y<1)continue;ctx.fillRect(ox+solid.min.x*s,oz+solid.min.z*s,Math.max(1,(solid.max.x-solid.min.x)*s),Math.max(1,(solid.max.z-solid.min.z)*s));}
  ctx.font='11px "Microsoft YaHei"';ctx.textAlign='center';for(const [key,label] of Object.entries({observe:'01 观察',power:'02 配电',control:'03 东仓',rescue:'04 内侧门',exit:'05 下潜'})){const p=this.world.anchors[key];const [x,y]=point(p);const active=key===this.targetKey;ctx.strokeStyle=active?'#f5cf77':'#80a99c';ctx.lineWidth=active?2:1;ctx.beginPath();ctx.arc(x,y,1.8*s,0,Math.PI*2);ctx.stroke();ctx.fillStyle=active?'#f5cf77':'#bfd0c7';ctx.fillText(label,x,y-12);}
  ctx.fillStyle='#e9c786';const [x,y]=point(this.position);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();const a=this.run.heading*Math.PI/180;ctx.strokeStyle='#e9c786';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(a)*15,y-Math.cos(a)*15);ctx.stroke();ctx.restore();
 }
 snapshot(){return {version:2,levelId:'whitebox.chapter1',index:0,position:this.position.toArray() as [number,number,number],heading:this.run.heading,identified:this.identified,powered:this.powered,lureTime:this.lureTime,lured:this.lured,gateClosed:this.gateClosed,monsterInside:this.monsterInside,verified:this.verified,rescued:this.rescued,departureConfirmed:this.departureConfirmed,departureTime:this.departureTime,complete:this.complete,epoch:this.epoch,elapsed:this.elapsed,objective:this.objective,events:this.events};}
 dispose(){this.atmosphere.dispose();this.ao.dispose();this.composer.dispose();this.renderer.dispose();this.world.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
}
