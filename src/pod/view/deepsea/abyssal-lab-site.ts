import {isNoVideoMode} from '../gm';
import {abyssalVideoAuthorized} from '../../net/abyssal-video-authorization';
import {prewarmAbyssalMaterials} from './abyssal-prewarm';
import {harborHullClear} from '../../sim/harbor-navigation';
import {AbyssalMediaPlayer} from './abyssal-media-player';
import {createLivingRender,type LivingRender} from './living-render';
import * as T from 'three';
import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import {StoryRuntime,type StorySnapshot} from '../../../story-pipeline/runtime';
import {level03} from '../../../story-pipeline/level-03';
import {ABYSS_SPAWN,ABYSS_TANKS,ABYSS_GATES,spiralPoint,ABYSS_ITEMS,ABYSS_WINDOWS,ABYSS_PHOTO_STATIONS,ABYSS_EXIT_Y,ABYSS_SPACES,DRAIN,PIT,abyssSpaceAt,abyssWater,type Vec3} from '../../content/abyssal-lab-layout';
import {abyssHullClear} from '../../sim/abyssal-navigation';
import {createAbyssalWorld} from './abyssal-world';
import {sharedExpeditionRenderer} from './pod-expedition';
import {LivingNavigation} from './living-navigation';
import {beginExtend,beginGrip} from '../../sim/manipulator';
import {createSalvageArm} from './salvage-arm';
import {WindowLocks} from '../window-locks';
const V=(p:Vec3)=>new T.Vector3(...p);
const BOUNDS=[new T.Box3(new T.Vector3(-1000,-1000,-1000),new T.Vector3(1000,1000,1000))];
export interface AbyssMediaRequest {shotId:string;kind:'elias'|'player';referenceFrame?:string;at:number;snapshot?:StorySnapshot}
export class AbyssalLabSite implements AuthoredSite {
 readonly index=2;readonly managesNarrative=true;readonly managesThreats=true;readonly diegeticGuidance=true;readonly coordinateDatum=200;
 readonly story=new StoryRuntime(level03);readonly position=V(ABYSS_SPAWN.position);readonly navigationConsole:LivingNavigation;
 readonly presentation={sensorFrame:{width:1280,height:720},labLargeFrame:true};
 readonly pendingMedia:AbyssMediaRequest[]=[];readonly deliveredMedia=new Map<string,string>();
 readonly world=createAbyssalWorld();private scene=new T.Scene();private camera=new T.PerspectiveCamera(64,1,.08,220);
 private lamp=new T.SpotLight('#e1e9d6',190,55,1.1,.55,1.25);private fill=new T.PointLight('#93b8b6',1.2,9,2);
 private debugEvidence=false;private media:AbyssalMediaPlayer;private view:LivingRender;private arm=createSalvageArm();private locks=new WindowLocks();private collected:string[]=[];private analyzed:string[]=[];
 readonly materialsReady:Promise<void>;private disposed=false;
 private width=0;private height=0;private time=0;private selected:string|null=null;private cargo:string|null=null;private feedback='';private feedbackUntil=0;private ended=false;
 private collisionHintAt=-99;private bottomNotified=false;private acousticPressure=0;private eelHitAt=-99;private fakeMessageShown=false;private pressHitCycle=-1;private lastZone='';private lastMediaHint=-99;private aimHelpUntil=0;private sonarSamples:{x:number;z:number}[]=[];private sonarOrigin=new T.Vector3();private lastSonar=-1;
 constructor(readonly run:PodRun){
  this.media=new AbyssalMediaPlayer(this);
  this.run.heading=ABYSS_SPAWN.heading;this.run.pitch=0;this.run.camPan=0;this.run.camTilt=0;
  this.scene.background=new T.Color('#061115');this.scene.fog=new T.FogExp2('#071719',.022);
  this.scene.add(this.world.root,this.camera);this.camera.add(this.arm.root);
  this.view=createLivingRender({renderer:sharedExpeditionRenderer().renderer,scene:this.scene,camera:this.camera,world:this.world,width:1280,height:720,profiles:{recording:{scatter:.28,grain:.02},live:{scatter:.18,fogTint:1,grain:.025,lampNearFull:5.1,meter:1,meterKey:.032,meterRange:[.15,1],whiteKnee:2.5}}});
  this.lamp.castShadow=true;this.lamp.shadow.mapSize.set(1024,1024);this.lamp.shadow.normalBias=.04;
  this.camera.rotation.order='YXZ';this.navigationConsole=new LivingNavigation({run,position:this.position,datum:this.coordinateDatum,receiverLabel:'−2层研究所 · 被动阵列常开 · 文字发送 / 录像回复',contacts:()=>[],passiveSources:()=>this.passiveSources(),drawActive:(c,w,h)=>this.drawDrivingSonar(c,w,h),waypointCatalog:[...ABYSS_WINDOWS.map(x=>({position:x.pod,name:x.id+' '+x.name,detail:'抵达后通过终端发送文字'})),...ABYSS_PHOTO_STATIONS.map(x=>({position:x.position,name:x.id+' '+x.name,detail:x.note}))]});
  this.run.stopSonarPulses();this.event('进入 −2 层 · 深渊生物研究所。W向前走到操作台，E坐下。先点击中央舷窗下方的照明按钮开灯。驾驶：Space前进、N倒车、J/L转向、PageDown下潜、PageUp上浮；井底深度200米。');
  this.materialsReady=this.world.ready.then(()=>{if(!this.disposed)return prewarmAbyssalMaterials(sharedExpeditionRenderer().renderer,this.scene,this.camera,()=>!this.disposed);}).catch(error=>console.warn('Abyssal material prewarm unavailable',error));
  if(import.meta.env.DEV)(window as unknown as {__abyss?:AbyssalLabSite}).__abyss=this;
 }
 private passiveSources(){const sources=[{id:'abyss.alarm',point:PIT.centre,frequency:38.2,form:'重复的宽带警报脉冲',active:this.story.state['alarm.state']==='on'},{id:'abyss.press',point:spiralPoint(7.25),frequency:41.2,form:'间隔约十秒的重型机械敲击',active:true}];return sources.filter(s=>s.active&&V(s.point).distanceTo(this.position)<150).map(s=>{const dx=s.point[0]-this.position.x,dz=s.point[2]-this.position.z,angle=(Math.atan2(dx,-dz)*180/Math.PI-this.run.heading+360)%360;return {id:s.id,kind:'unknown' as const,label:'未登记声源',form:s.form,frequency:s.frequency,width:.55,intensity:.65,bearing:['前方','右前方','右舷','右后方','后方','左后方','左舷','左前方'][Math.round(angle/45)%8]};});} private vec():Vec3{return [this.position.x,this.position.y,this.position.z];}
 private event(s:string){this.feedback=s;this.feedbackUntil=this.time+7;this.run.pushLog(s,'system');this.run.storyCaption=s;this.run.storyCaptionLeft=7;}
 get saveSafe(){return !this.selected&&!this.cargo&&this.run.arm.phase==='stowed'&&this.clear(this.vec());}
 get complete(){return this.ended&&(!this.debugEvidence||isNoVideoMode());}
 private get inEntryShaft(){const p=spiralPoint(0);return Math.hypot(this.position.x-p[0],this.position.z-p[2])<=8;}
 get elevation(){return this.position.y;}
 get description(){return '−2层 · 深渊生物研究所 · 术前检查';}
 get objective(){if(!this.run.lit)return '探照灯已关闭 · 点击中央舷窗下方实体照明按钮开灯，再驾驶观察航道';if(abyssSpaceAt(this.vec())==='S'){if(!this.inEntryShaft)return '已出井口 · 水道向右弯，跟随右侧暖灯，缓慢右转（L）；不要沿北直推。贴壁时先N倒退再转向。';return this.position.y>2?'沿沉降井下潜 · PageDown下潜 / PageUp上浮 · 到深度200米附近':'井底出口标识：北侧005° / 深度200米 · J/L转向对准北侧，Space前进，N倒车';}const stage=level03.stages.find(s=>s.id===this.story.state['lab.stage']);
  const expected:Record<string,string>={quarantine:'L3-E01',lab:'L3-E03',pit_arrive:'L3-E04',plant_arrive:'L3-E06',prep:'L3-E08',dome_look:'L3-E09'};
  const pending=this.pendingMedia.find(r=>r.kind==='elias'&&!this.analyzed.includes(r.shotId));
  const unread=[...this.deliveredMedia.keys()].find(id=>id.startsWith('L3-E')&&!this.analyzed.includes(id));
  const shot=unread??pending?.shotId??(stage?expected[stage.id]:undefined);
  if(shot&&!this.analyzed.includes(shot)){
   const number=shot.replace('L3-E','').replace(/^0/,'');
   const delivered=this.deliveredMedia.has(shot)&&this.run.tapes.some(t=>t.ready!==false&&t.videoResult==='video'&&!t.creatureMissing&&(t.siteEvidence as {shotId?:string})?.shotId===shot);
   if(delivered)return `艾里亚斯第${number}卷已收到 · 在分析台选择该卷，完整看片并分析`;
   const media=this.media.status(shot);
   if(media.phase==='failed')return `艾里亚斯第${number}卷未完成 · 到分析台【通讯】点击“重新接收” · ${media.message.slice(0,70)}`;
   if(media.phase==='generating')return `艾里亚斯第${number}卷处理中 · ${media.message} · 可先检查附近补给`;
   if(media.phase==='disabled')return `第${number}卷尚未取得 · ${media.message} · 可先查看附近补给`;
   if(shot==='L3-E01')return '等待艾里亚斯第1卷录像 · 可先靠近白色医疗箱，用机械臂取回宁神剂';
   return pending?`等待艾里亚斯第${number}卷录像回复 · 可先检查附近设施与补给`:`艾里亚斯第${number}卷尚未收到 · 靠近本区通话窗，发送文字联系他`;
  }
  return stage?.objective.replace(/看第[0-9]+卷\s*[·…]?\s*/,'')??'沿沉降井下潜到研究所';}
 get hint(){return this.time<this.feedbackUntil?this.feedback:this.aim()?.hint??this.objective;}
 get evidenceReady(){return (!this.debugEvidence||isNoVideoMode())&&this.story.recomputeQuota();}
 get noiseFloor(){return this.story.state['alarm.state']==='on'&&abyssSpaceAt(this.vec())==='C'?.45:0;}
 get micTarget(){return this.nearWindow()?'艾里亚斯 · 文字发送 / 录像回复':'艇内终端（宁神剂 / 录像重试）';}
 get micReady(){return true;}
 get mediaRetryable(){return this.media.retryable;}
 retryMedia(){const result=this.media.retry();this.event(result.message);return result.message;}
 get dialogueChoices(){const id=this.inputWindow();return id?this.story.suggestions(id).map(s=>s.text):[...(Number(this.story.state['pod.sedatives'])>0?['使用宁神剂']:[]),...(this.pendingMedia.length?['重试录像']:[])];}
 chooseDialogue(index:number){const text=this.dialogueChoices[index];return !!text&&this.radioSay(text);}
 private nearWindow(){return ABYSS_WINDOWS.find(w=>V(w.pod).distanceTo(this.position)<=w.radius);}
 private inputWindow():string|null{
  const w=this.nearWindow();if(!w)return null;const i=ABYSS_WINDOWS.indexOf(w),has=(id:string)=>this.analyzed.includes(id);
  if(i===0&&has('L3-E01')&&!has('L3-E02'))return 'l3-quarantine';if(i===2&&has('L3-E02'))return 'l3-lab';
  if(i===3&&has('L3-E03')&&this.story.state['keybox.delivered'])return has('L3-E05')?'l3-pit-explore':has('L3-E04')&&this.story.state['photo.pit']?'l3-pit-order':'l3-pit-arrive';
  if(i===4&&has('L3-E05'))return has('L3-E06')?'l3-plant-order':'l3-plant-arrive';if(i===6&&has('L3-E09')&&this.story.state['photo.domeTop'])return 'l3-dome-look';if(i===7&&has('L3-E10'))return 'l3-shaft';return null;
 }
 radioSay(text:string){
  if(text.trim()==='重试录像'){const result=this.media.retry();this.event(result.message);return true;}
  if(/^(使用|服用|吃).*(宁神剂)|^宁神剂$/.test(text)){const n=Number(this.story.state['pod.sedatives']);if(n<1){this.event('没有宁神剂。检疫泊位外侧货架有医疗箱。');return true;}this.story.sync({'pod.sedatives':n-1});this.run.vitals.restore({san:25});this.event('使用一支宁神剂。理智逐渐稳定。');return true;}
  const id=this.inputWindow();if(!id){this.event('没有接通的通话窗；靠近有编号的观察窗，先在分析台看已收到的录像。');return false;}
  const result=this.story.say(id,text);if(!result)return false;
  this.navigationConsole.recordDialogue('罗温（文字）：'+text);this.event('文字已发送。等待艾里亚斯的录像回复。');
  const shots:Record<string,string>={'l3-quarantine':'L3-E02','l3-lab':'L3-E03','l3-pit-arrive':'L3-E04','l3-pit-order':'L3-E05','l3-plant-arrive':'L3-E06','l3-plant-order':'L3-E07','l3-dome-look':'L3-E10','l3-shaft':'L3-E11'};
  if(id==='l3-pit-explore')this.requestMedia(result.tag?.id==='cage07'?'L3-E05C':'L3-E05B');else if(shots[id])this.requestMedia(shots[id]);return true;
 }
 private canRequestMedia(id:string){const prerequisites:Record<string,string>={'L3-E02':'L3-E01','L3-E03':'L3-E02','L3-E04':'L3-E03','L3-E05':'L3-E04','L3-E05B':'L3-E05','L3-E05C':'L3-E05','L3-E06':'L3-E05','L3-E07':'L3-E06','L3-E08':'L3-E07','L3-E09':'L3-E08','L3-E10':'L3-E09','L3-E11':'L3-E10'};return !prerequisites[id]||this.analyzed.includes(prerequisites[id]);} requestMedia(shotId:string,referenceFrame?:string){if(!level03.shots.some(s=>s.id===shotId)||!this.canRequestMedia(shotId))return;if(this.analyzed.includes(shotId)||this.deliveredMedia.has(shotId)||this.pendingMedia.some(r=>r.shotId===shotId))return;this.pendingMedia.push({shotId,kind:shotId.includes('-E')?'elias':'player',referenceFrame,at:this.time,snapshot:this.story.snapshot()});const status=this.media.status(shotId);this.event(status.phase==='disabled'?status.message+'，剧情证据暂未取得。可继续驾驶和检查设施。':`录像 ${shotId} 已排队。素材未返回前不会写入剧情证据；可以继续驾驶、取物。`);}
 /** Called only by successful video delivery, never by a local still-frame render. */
 deliverDebugMedia(shotId:string){if(!isNoVideoMode()||!this.pendingMedia.some(r=>r.shotId===shotId))return false;this.debugEvidence=true;this.run.gmLevelSession=true;this.deliveredMedia.set(shotId,'gm-debug:'+shotId);this.pendingMedia.splice(this.pendingMedia.findIndex(r=>r.shotId===shotId),1);return true;}
 deliverMedia(shotId:string,videoUrl:string){if((!/^(https?:|blob:)/.test(videoUrl)&&!this.run.tapes.some(t=>t.cacheKey===videoUrl&&t.videoResult==='video'&&(t.siteEvidence as {shotId?:string})?.shotId===shotId))||!this.pendingMedia.some(r=>r.shotId===shotId))return false;this.deliveredMedia.set(shotId,videoUrl);this.pendingMedia.splice(this.pendingMedia.findIndex(r=>r.shotId===shotId),1);return true;}
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-(this.run.pitch*Math.PI/180+this.run.camTilt),-this.run.heading*Math.PI/180-this.run.camPan,0);this.camera.fov=64/this.run.camZoom;this.camera.aspect=1280/720;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
 private get pressClosed(){return this.time%10>=3;}
 private clear(p:Vec3,h=this.run.heading){return abyssHullClear(p,h,!!this.story.state['sluice.open'],!!this.story.state['drain.open']&&this.story.recomputeQuota(),this.pressClosed)&&harborHullClear(V(p),h,BOUNDS,[...this.world.itemBounds].filter(([id])=>!this.collected.includes(id)).map(([,b])=>b));}
 private blockingPickup(p:T.Vector3){return [...this.world.itemBounds].find(([id,b])=>!this.collected.includes(id)&&!harborHullClear(p,this.run.heading,BOUNDS,[b]))?.[0];}
 private translate(d:T.Vector3){const n=Math.ceil(d.length()/.08);if(!n)return true;const step=d.clone().divideScalar(n);for(let i=0;i<n;i++){const next=this.position.clone().add(step);if(!this.clear([next.x,next.y,next.z])){if(this.time-this.collisionHintAt>6){this.collisionHintAt=this.time;const pickup=this.blockingPickup(next);this.event(pickup?'艇身碰到近侧箱体。松开推进，用方向键查看近侧箱子，或先N倒退让出艇身。':Math.abs(d.y)>.001?(this.inEntryShaft?'井底出口在北侧005°、深度200米。PageUp上浮，J/L转向对准北侧，再按Space驶出。':'升降被结构挡住。松开升降键，稍微反向离开表面，再找通道。'):'艇身被结构挡住。按N倒退留出余量，再用J/L转向；水闸关闭时先完成钥匙传递。');}return false;}this.position.copy(next);}return true;}
 move(distance:number){const h=this.run.heading*Math.PI/180;return this.translate(new T.Vector3(Math.sin(h)*distance,0,-Math.cos(h)*distance));}
 moveVertical(distance:number){return this.translate(new T.Vector3(0,distance,0));}
 turn(degrees:number){const n=Math.ceil(Math.abs(degrees)/.5);let moved=0;for(let i=0;i<n;i++){const d=degrees/n;if(!this.clear(this.vec(),this.run.heading+moved+d)){if(this.time-this.collisionHintAt>6){this.collisionHintAt=this.time;this.event('艇尾转动空间不足。松开推进，按N倒退，再用J/L转向；必要时用相反方向微调。');}break;}moved+=d;}return (this.run.heading+moved+360)%360;}
 private aim(maxDistance=3.4){this.pose();const ray=new T.Ray(this.position,this.camera.getWorldDirection(new T.Vector3()));let best:{id:string;distance:number;hint:string;point:T.Vector3;bounds:T.Box3}|null=null;
  for(const item of ABYSS_ITEMS){if(this.collected.includes(item.id))continue;const object=this.world.interactables.get(item.id);const box=object?new T.Box3().setFromObject(object):new T.Box3().setFromCenterAndSize(V(item.position),new T.Vector3(1,.9,.96));const hit=ray.intersectBox(box,new T.Vector3());if(!hit)continue;const distance=hit.distanceTo(this.position);if(distance>maxDistance)continue;
   let blocked=this.world.colliders.some(b=>{if(b.intersectsBox(box))return false;const q=ray.intersectBox(b,new T.Vector3());return !!q&&q.distanceTo(this.position)<distance-.1;});for(let t=.2;t<distance-.2;t+=.2){const q=ray.at(t,new T.Vector3());if(!abyssWater([q.x,q.y,q.z])){blocked=true;break;}}if(blocked)continue;
   if(!best||distance<best.distance)best={id:item.id,distance,point:hit,bounds:box,hint:`${item.name} · ${distance.toFixed(1)}m · F ${item.kind==='box'?'伸臂 / 夹取 / 收回':'传递钥匙箱'}`};}
  return best;}
 interact(){const a=this.aim();if(this.run.arm.phase==='aiming'&&this.cargo){this.run.retractArm();return;}if(this.run.arm.phase==='aiming'&&!this.cargo&&(!a||a.id!==this.selected)){this.event('机械臂已伸出，镜头已离开原目标。方向键重新对准原箱，或按 C 收回空臂后选择其他箱子。');return;}if(!a){this.aimHelpUntil=this.time+14;this.event('方向键↑↓←→调整镜头，把箱子对准中心十字。进入3.4米后按F伸臂、夹取、收回；不必开艇撞向箱子。');return;}if(!this.run.lit||this.run.power<=.01){this.event('机械臂需要照明和供电。');return;}
  if(a.id==='abyss.hatch.pass'){if(!this.analyzed.includes('L3-E03')){this.event('先在分析台核验第3卷，确认传递口和钥匙用途。');return;}if(!this.collected.includes('abyss.box.key')){this.event('传递口需要3号实验舱的红色应急钥匙箱。');return;}this.story.sync({'keybox.delivered':true,'sluice.open':true});this.event('钥匙箱送入传递口。控制室开闸回路接通，水闸抬起。');return;}
  if(this.run.arm.phase==='stowed'){this.selected=a.id;beginExtend(this.run.arm);}else if(this.run.arm.phase==='aiming'&&this.selected===a.id)beginGrip(this.run.arm,a.id,0);
 }
 armEvent(kind:'grip'|'stowed',id?:string){if(kind==='stowed'&&!this.cargo){this.selected=null;this.event('空臂已收回，未取得物品。可重新瞄准箱子后按 F 伸臂。');return true;}if(kind==='grip'&&this.selected&&id===this.selected){this.cargo=this.selected;return true;}if(kind==='stowed'&&this.cargo){const item=this.cargo;if(this.collected.includes(item)){this.cargo=null;this.selected=null;return false;}this.collected.push(item);this.cargo=null;this.selected=null;const supplies=ABYSS_ITEMS.find(i=>i.id===item)?.supplies;if(supplies){this.event('维护物资已入库：'+this.run.receiveAuthoredSupplies(supplies)+'。在生命维持台使用；满格物资留在打捞台，起步前先整理。');return true;}if(item.includes('.med'))this.story.sync({'pod.sedatives':Number(this.story.state['pod.sedatives'])+1});this.event(item.includes('.med')?'宁神剂已入库。按 M 输入“使用宁神剂”服用。':'红色应急钥匙箱已入库。送到T3下方传递口。');return true;}return !!this.selected;}
 private photoPrerequisites(id:string){const prior:Record<string,string>={P01:'L3-E04',P02:'L3-E06',P03:'L3-E09',P04:'L3-E10'};return (!prior[id]||this.analyzed.includes(prior[id]))&&(id!=='P04'||!!this.story.state['drain.open']);}
 private tanksInFrame(){return [2,3,6].every(n=>{const t=ABYSS_TANKS[n-1],point=new T.Vector3(t.centre[0],-7,t.centre[2]),p=point.clone().project(this.camera);return Math.abs(p.x)<.98&&Math.abs(p.y)<.95&&point.clone().applyMatrix4(this.camera.matrixWorldInverse).z<0;});} private photoVisible(target:Vec3){const end=V(target),delta=end.clone().sub(this.position),distance=delta.length();const ray=new T.Ray(this.position,delta.normalize());for(let t=.25;t<distance-1.8;t+=.25){const p=ray.at(t,new T.Vector3());if(!abyssWater([p.x,p.y,p.z]))return false;}for(const b of this.world.colliders){if(b.distanceToPoint(end)<2)continue;const hit=ray.intersectBox(b,new T.Vector3());if(hit&&hit.distanceTo(this.position)<distance-1.8)return false;}return true;} videoContext(){const consent=abyssalVideoAuthorized();const cap=this.captureEvidence();const shot=level03.shots.find(s=>s.id===cap.shotId);const body=shot?this.story.performance(shot.id).map(x=>x.hit?.en??'').join(' '):'';const bio=cap.shotId&&['L3-P01','L3-P02','L3-P03','L3-P04'].includes(cap.shotId);return {generatedMonsters:true,story:!!shot&&consent,settled:true,stateKey:JSON.stringify([cap.shotId,this.story.state]),nearestMonster:bio&&consent?10:Infinity,scene:'Flooded abyssal biological laboratory. Preserve the supplied fixed camera, architecture, tank numbers and lighting. '+body,actors:[],monsters:bio?[body]:[],outcome:'Only the authored situation in this shot. No cuts, no camera motion, no new creature species.'};} captureEvidence(){this.pose();const dir=this.camera.getWorldDirection(new T.Vector3());const found=ABYSS_PHOTO_STATIONS.find(s=>V(s.position).distanceTo(this.position)<6&&V(s.target).sub(this.position).normalize().dot(dir)>.9&&this.photoVisible(s.target)&&this.run.lit&&this.photoPrerequisites(s.id)&&(s.id!=='P02'||this.tanksInFrame()));return {id:`abyss.shot.${this.time}`,shotId:found?.shot??null,at:this.time,position:this.vec(),generated:false,debugNoVideo:isNoVideoMode()};}
 prepareCapture(){if(Math.abs(this.run.pilot.speed)>.12)return {ok:false,message:'先停止推进，等艇身稳定后曝光。'};return {ok:true};}
 commitEvidence(_capture:unknown){}
 describeEvidence(capture:unknown){const c=capture as {shotId?:string};return c?.shotId?`现场曝光 ${c.shotId}；等待实际生成录像核验，不以空场截图认定生物。`:'现场环境记录；未覆盖登记摄影目标。';}
 analyzeEvidence(capture:unknown){const wrapper=capture as {capture?:unknown};const c=(wrapper?.capture??capture) as {shotId?:string;debugNoVideo?:boolean};if((this.debugEvidence||c?.debugNoVideo)&&!isNoVideoMode())return ['此进度含 GM 合成证据。请恢复无视频模式，或重新开始正式流程。'];if(!c?.shotId)return ['现场环境记录，无登记证据目标。'];if(c.debugNoVideo&&isNoVideoMode()){this.debugEvidence=true;this.run.gmLevelSession=true;this.deliveredMedia.set(c.shotId,'gm-debug:'+c.shotId);}const tape=this.run.tapes.find(t=>(t.siteEvidence as {shotId?:string})?.shotId===c.shotId&&t.videoResult==='video'&&!t.creatureMissing);if(tape)this.deliveredMedia.set(c.shotId,tape.cacheKey??'verified-player-video');if(!this.deliveredMedia.has(c.shotId))return ['录像媒体尚未成功返回。现场静帧不证明生物存在，不计入收容配额。'];if(this.analyzed.includes(c.shotId))return ['该卷已经核验。'];this.analyzed.push(c.shotId);
  const facts:Record<string,Record<string,string|number|boolean>>={'L3-E01':{'rowan.knows.videoOnly':true},'L3-E02':{'rowan.knows.helmetsUnscrewed':true},'L3-E05':{'alarm.state':this.story.state['order.alarm']==='cut'?'off':'on'},'L3-E07':{'tanks.state':this.story.state['order.tanks']==='photo'?'right_three':'wrong_three'},'L3-E08':{'rowan.knows.protocol':true},'L3-E10':{'tape.helmetOff':true,'elias.helmet':'removed_then_on','elias.tag':'passed','rowan.knows.eliasNoBreath':true,'drain.open':true},'L3-P01':{'photo.pit':true},'L3-P02':{'photo.tanks':true},'L3-P03':{'photo.domeTop':true},'L3-P04':{'photo.caretaker':true},'L3-P05':{'photo.cage07':true},'L3-P06':{'photo.trough':true}};
  this.story.sync(facts[c.shotId]??{});this.story.sync({'containment.captured':['L3-P01','L3-P02','L3-P04'].filter(id=>this.analyzed.includes(id)).length});return [`${this.debugEvidence?'GM 合成调试证据（非真实录像） · ':''}已核验 ${c.shotId}。`,...this.story.performance(c.shotId).flatMap(s=>[...(this.debugEvidence&&s.hit?.zh?[s.hit.zh]:[]),...(s.hit?.dialogue?[s.hit.dialogue]:[])])];}
 evidenceStatus(capture:unknown){const c=capture as {shotId?:string};return {accepted:!!c?.shotId&&this.analyzed.includes(c.shotId),next:this.objective};}
 tick(dt:number){if(this.debugEvidence&&!isNoVideoMode()){this.run.videoStatus='此进度含 GM 合成证据：请重新开启无视频模式，或开始新游戏。';return;}this.media.tick();const wasPressClosed=this.pressClosed;this.time+=Math.min(.25,dt);this.navigationConsole.tick(dt);
  // The external press is audible at the same instant its physical gate changes.
  // It is not a pod noise emission and grants no sonar distance or story evidence.
  if(wasPressClosed!==this.pressClosed){const gate=ABYSS_GATES.find(g=>g.id==='press')!,source=V(spiralPoint(gate.t,0,gate.floor+3)),delta=source.sub(this.position),dist=delta.length();if(dist<65){const h=this.run.heading*Math.PI/180,pan=T.MathUtils.clamp((delta.x*Math.cos(h)+delta.z*Math.sin(h))/Math.max(1,dist),-1,1);this.run.onCue?.(this.pressClosed?'door.close':'door.open',this.pressClosed?.5:.25,{dist,pan,room:30,flooded:true});}}
  const zone=abyssSpaceAt(this.vec());if(zone!==this.lastZone){this.lastZone=zone??'';const stages:Record<string,string>={S:'descend',Q:'quarantine',G:'quarantine',L:'lab',K:'lab',C:'pit_arrive',J:'pit_cross',P:'plant_arrive',R:'prep',O:'dome_look',D:'shaft'};if(zone)this.story.sync({'lab.stage':stages[zone]});}
  const w=this.nearWindow();if(w){const i=ABYSS_WINDOWS.indexOf(w);const first:Record<number,string>={0:'L3-E01',5:'L3-E08',6:'L3-E09'};if(first[i])this.requestMedia(first[i]);}
  if(zone==='C'&&this.story.state['alarm.state']==='off'){const loud=this.run.sonarEmitting||Math.abs(this.run.pilot.speed)>.5||this.run.arm.phase!=='stowed';this.acousticPressure=T.MathUtils.clamp(this.acousticPressure+dt*(loud?.4:-.18),0,1);if(this.acousticPressure>=1&&this.time-this.eelHitAt>8){this.eelHitAt=this.time;this.run.hull=Math.max(.05,this.run.hull-.08);this.run.onShake?.(.7);this.event('急促刮擦撞上艇壳。停止主动脉冲，收臂，低速贴井壁移动。');}}else this.acousticPressure=Math.max(0,this.acousticPressure-dt*.2);
  if(zone==='S'&&this.inEntryShaft&&this.position.y<=2&&!this.bottomNotified){this.bottomNotified=true;this.event('井底已到达。看不清时点击舷窗下方照明按钮开探照灯。WASD只用于艇内走动；驾驶用Space前进，N倒车，J/L转向，PageUp上浮。出口标识：北侧005°、深度200米。先对准北侧，切勿沿当前朝向盲推。');}
  if(zone==='P'&&this.story.state['tanks.state']==='wrong_three'){this.run.power=Math.max(0,this.run.power-dt*.0008);this.run.noise=Math.min(1,this.run.noise+dt*.002);}
  if(zone==='P'&&this.run.vitals.vitals.san<25&&!this.fakeMessageShown){this.fakeMessageShown=true;this.run.storyCaption='艾里亚斯〔文字〕：往下沉，沟底能躲过去。';this.run.storyCaptionLeft=12;this.run.pushLog('分析台收到一条文字：往下沉，沟底能躲过去。','system');}
  if(zone==='P'&&this.fakeMessageShown&&this.position.y<-12)this.story.sync({'san.fakeObeyed':true});
  const press=V(spiralPoint(ABYSS_GATES.find(g=>g.id==='press')!.t));press.y=this.position.y;const cycle=Math.floor(this.time/10);if(zone==='P'&&this.pressClosed&&this.position.distanceTo(press)<3&&this.pressHitCycle!==cycle){this.pressHitCycle=cycle;this.run.hull=Math.max(.05,this.run.hull-.05);this.event('冲压机落下，艇壳受压。每10秒有3秒完全抬升窗口；等它抬起再通过。');}
  if(zone==='C'){this.story.sync({'pit.depth':this.position.y<-45?'floor':this.position.y<-10?'cages':'rim'});if(this.story.state['alarm.state']==='on')this.run.vitals.restore({san:-dt*.06});}
  if(this.pendingMedia.length&&this.time-this.lastMediaHint>45){this.lastMediaHint=this.time;const request=this.pendingMedia[0],status=this.media.status(request.shotId);this.event(`${request.shotId} · ${status.message}${status.phase==='failed'?'。到分析台【通讯】点击“重新接收”可再试。':'。未收到录像前不授予剧情证据。'}`);}
  this.world.setFocus(this.vec());this.world.update({time:this.time,collected:this.collected,sluiceOpen:!!this.story.state['sluice.open'],drainOpen:!!this.story.state['drain.open']&&this.story.recomputeQuota(),pressOpen:!this.pressClosed,alarmOn:this.story.state['alarm.state']==='on'},dt);
  if(zone==='D'&&this.position.y<ABYSS_EXIT_Y&&this.story.canClearChapter()&&this.story.state['drain.open']&&this.analyzed.includes('L3-E11'))this.ended=true;
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,_time:number,recording=false){const {renderer}=sharedExpeditionRenderer();if(this.width!==w||this.height!==h){renderer.setSize(w,h,false);this.view.setSize(w,h);this.width=w;this.height=h;}renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=recording?1.1:.8;this.pose();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.lamp.position.copy(this.position);this.lamp.target.position.copy(this.position).addScaledVector(this.camera.getWorldDirection(new T.Vector3()),20);this.lamp.intensity=this.run.lit?190:0;this.fill.position.copy(this.position);this.fill.intensity=this.run.lit?1.2:.02;this.arm.update(this.run.arm,this.time);this.view.frame({mode:recording?'recording':'live',time:this.time,lampOn:this.run.lit});this.view.render(1/60);ctx.drawImage(renderer.domElement,0,0,w,h);}
 sonarPulse(){if(!this.run.activeSonarEnabled||this.run.power<=0)return;this.lastSonar=this.time;this.sonarOrigin.copy(this.position);this.sonarSamples=[];for(let x=-24;x<=24;x+=.7)for(let z=-24;z<=24;z+=.7){const p:Vec3=[this.position.x+x,this.position.y,this.position.z+z];if(!abyssWater(p)||this.world.colliders.some(b=>b.containsPoint(V(p))))this.sonarSamples.push({x:p[0],z:p[2]});}}
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number){ctx.fillStyle='#061619';ctx.fillRect(0,0,w,h);if(!this.run.activeSonarEnabled||this.run.power<=0){ctx.fillStyle='#92a9a5';ctx.fillText('主动声纳未通电',15,25);return;}const k=Math.min(w,h)/52,cx=w/2,cy=h/2,a=this.run.heading*Math.PI/180;ctx.fillStyle='#527a73';for(const p of this.sonarSamples){const x=p.x-this.position.x,z=p.z-this.position.z;ctx.fillRect(cx+(x*Math.cos(a)+z*Math.sin(a))*k,cy+(-x*Math.sin(a)+z*Math.cos(a))*k,2,2);}ctx.fillStyle='#d5e4a5';ctx.beginPath();ctx.moveTo(cx,cy-8);ctx.lineTo(cx-5,cy+6);ctx.lineTo(cx+5,cy+6);ctx.fill();ctx.font='16px sans-serif';ctx.fillText(this.lastSonar<0?'尚无回波 · 开启脉冲扫描':'历史回波 · ±24m',12,h-15);}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.drawDrivingSonar(ctx,w,h);}
 resetWindowFocus(){this.locks.reset();}
 drawWindowLocks(ctx:CanvasRenderingContext2D,w:number,h:number){const target=this.aim(8);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.locks.draw(ctx,w,h,this.camera,()=>this.world.colliders,()=>target?[{id:target.id,bounds:target.bounds,reach:3.4,enabled:true,verifiedDistance:target.distance,label:ABYSS_ITEMS.find(i=>i.id===target.id)?.name}]:[]);}
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){const aim=this.aim();if(this.time<this.aimHelpUntil){ctx.save();ctx.strokeStyle='rgba(225,235,207,.8)';ctx.lineWidth=Math.max(1,h/650);ctx.beginPath();ctx.moveTo(w/2-7,h/2);ctx.lineTo(w/2+7,h/2);ctx.moveTo(w/2,h/2-7);ctx.lineTo(w/2,h/2+7);ctx.stroke();ctx.restore();}if(!aim&&this.time>=this.feedbackUntil)return;ctx.fillStyle='rgba(0,9,12,.8)';ctx.fillRect(0,h-45,w,45);ctx.fillStyle='#c9e0b5';ctx.font=`${Math.max(12,h*.035)}px sans-serif`;ctx.fillText((aim?.hint??this.feedback).slice(0,70),12,h-18,w-24);}
 snapshot(){return {adapter:'abyssal-lab',debugNoVideo:this.debugEvidence,adapterVersion:1,index:2,position:this.vec(),heading:this.run.heading,elapsed:this.time,acousticPressure:this.acousticPressure,eelHitAt:this.eelHitAt,fakeMessageShown:this.fakeMessageShown,navigation:this.navigationConsole.snapshot(),collected:[...this.collected],analyzed:[...this.analyzed],story:this.story.snapshot(),delivered:[...this.deliveredMedia],pending:structuredClone(this.pendingMedia),ended:this.ended};}
 restore(value:unknown){
  const s=value as ReturnType<AbyssalLabSite['snapshot']>;
  if(!s||(s.debugNoVideo&&!isNoVideoMode())||s.adapter!=='abyssal-lab'||s.adapterVersion!==1||!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||!Number.isFinite(s.heading)||!Number.isFinite(s.elapsed)||s.elapsed<0||!Array.isArray(s.collected)||!s.collected.every(id=>ABYSS_ITEMS.some(i=>i.id===id))||new Set(s.collected).size!==s.collected.length||!Array.isArray(s.analyzed)||!s.analyzed.every(id=>level03.shots.some(shot=>shot.id===id))||!LivingNavigation.validateSnapshot(s.navigation)||!Array.isArray(s.pending)||!Array.isArray(s.delivered))return false;
  const known=(id:string)=>level03.shots.some(shot=>shot.id===id);
  if(s.pending.some(r=>!r||!known(r.shotId)||!['elias','player'].includes(r.kind)||!Number.isFinite(r.at)||(r.snapshot!==undefined&&!new StoryRuntime(level03).restore(r.snapshot)))||s.delivered.some(p=>!Array.isArray(p)||p.length!==2||!known(p[0])||typeof p[1]!=='string'))return false;
  const story=new StoryRuntime(level03);if(!story.restore(s.story)||!abyssHullClear(s.position,s.heading,!!story.state['sluice.open'],!!story.state['drain.open']&&story.recomputeQuota())||!harborHullClear(V(s.position),s.heading,BOUNDS,[...this.world.itemBounds].filter(([id])=>!s.collected.includes(id)).map(([,b])=>b)))return false;
  const quota=['L3-P01','L3-P02','L3-P04'].filter(id=>s.analyzed.includes(id)).length;
  if(quota!==Number(story.state['containment.captured']))return false;
  this.debugEvidence=!!s.debugNoVideo;if(this.debugEvidence)this.run.gmLevelSession=true;this.story.restore(s.story);this.navigationConsole.restore(s.navigation);this.position.set(s.position[0],s.position[1],s.position[2]);this.run.heading=s.heading;this.time=s.elapsed;this.acousticPressure=Number.isFinite(s.acousticPressure)?T.MathUtils.clamp(s.acousticPressure,0,1):0;this.eelHitAt=Number.isFinite(s.eelHitAt)?s.eelHitAt:-99;this.fakeMessageShown=!!s.fakeMessageShown;this.collected=[...s.collected];this.analyzed=[...s.analyzed];this.ended=!!s.ended;
  this.deliveredMedia.clear();for(const [id,url] of s.delivered)this.deliveredMedia.set(id,url);this.pendingMedia.splice(0,this.pendingMedia.length,...structuredClone(s.pending));this.selected=null;this.cargo=null;return true;
 } dispose(){this.disposed=true;this.media.dispose();this.view.dispose();this.world.dispose();}
}































