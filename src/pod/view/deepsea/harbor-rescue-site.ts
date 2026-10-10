import * as T from 'three';
import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import {HarborRescue,type RescueZone,type RescueResult,type RescueEvidence,type RescueEvidenceKind} from '../../sim/harbor-rescue';
import {harborHullClear} from '../../sim/harbor-navigation';
import {PodExpedition} from './pod-expedition';
import {createReferenceMaterials} from './reference-materials';
import {createHarborMaterials} from './harbor-materials';
import {createHarborRescueWorld,HARBOR_RESCUE_LAYOUT as L} from './harbor-rescue-world';
import {HarborRescueNavigation} from './harbor-rescue-navigation';
import {sonarDeskState} from '../sonar-desk';
import {layoutCJK} from '@/ui/typography';
import {HarborPursuit} from '../../sim/harbor-pursuit';
import {HARBOR_DATUM_DEPTH,coordFields,formatCoords} from '../../sim/site-coords';
import {HarborRescueDialogue,harborTail,LIMP_LINES} from '../../sim/harbor-rescue-dialogue';
import {StoryRuntime} from '../../../story-pipeline/runtime';
import {level01} from '../../../story-pipeline/level-01';

const CONTACT_NUDGE=25,CONTACT_SILENT=50,PERFORMANCE='\n人物：';
const windowOf:Record<string,string>={contact:'elias-contact',intro:'elias-warning',stop:'elias-warning',warning:'elias-warning',photo:'elias-wait',report:'elias-report',
 plan:'elias-action',power:'elias-action',powerBrief:'elias-action',open:'elias-action',lureBrief:'elias-action',lure:'elias-action',closeBrief:'elias-action',close:'elias-action',
 confirmBrief:'elias-confirm',confirm:'elias-confirm',escapeBrief:'elias-escape',escape:'elias-escape',departure:'elias-escape',done:'elias-farewell'};

const PHOTO_STATION_RADIUS=6;

/** Formal first chapter: retains the existing A/C approach and B pressure hull. */
export class HarborRescueSite implements AuthoredSite {
 readonly index=0;readonly managesThreats=true;readonly spatialThreat=false;readonly diegeticGuidance=true;readonly managesNarrative=true;
 readonly base:PodExpedition;readonly rescue=new HarborRescue();readonly navigationConsole:HarborRescueNavigation;
 readonly dialogue=new HarborRescueDialogue();readonly pursuit=new HarborPursuit();
 readonly world;readonly position;readonly visual;private referenceMaterials=createReferenceMaterials();private materials=createHarborMaterials(this.referenceMaterials);
 private camera=new T.PerspectiveCamera(64,1024/720,.08,120);private ray=new T.Raycaster();
 private elapsed=0;private sequence=0;private entryReached=false;private openedTimes=new Map<string,number>();
 private started=false;
 private previousOptics:number[]|null=null;
 private sonarEcho:HTMLCanvasElement|null=null;
 private echoSweep=-1;
 private threatBeepLeft=0;
 private ambienceLeft=4;private ambienceBeat=0;
 private audibleBurstLeft=0;private outsideLureWarned=false;private reserveAt=-99;private hullHitByVoice=false;private limp=false;private limpSaid=false;
 private liedAboutFilm(){const st=this.story.state;return Number(st['said.rowan.falseClear'])>0||!!st['said.rowan.downplayed'];}
 readonly story=new StoryRuntime(level01);
 private vanceFading=false;private vanceLost=false;private contactIdle=0;private contactNudged=false;private lureBeat=0;private farewellIdle=0;private farewellSpoken=false;private farewellTail=false;private tailIdle=0;private closeWarned=false;private scrapeAt=0;private scrapeAnswered=false;
 noiseBurst(amount:number){if(amount>=.1)this.audibleBurstLeft=Math.max(this.audibleBurstLeft,.6);}
 constructor(readonly run:PodRun){
  this.base=new PodExpedition(run,0);this.world=this.base.world;this.position=this.base.position;
  this.position.set(11,0,10);run.heading=180;run.pitch=0;run.camPan=run.camTilt=0;
  this.visual=createHarborRescueWorld(this.world,this.materials);this.world.colliders.push(...this.visual.solids,this.visual.gate.bounds);this.world.decorColliders.push(...this.visual.decor);
  this.world.walkable.push(new T.Box3(new T.Vector3(72,-1,1.6),new T.Vector3(82.2,5.5,26)));
  const self=this;
  this.navigationConsole=new HarborRescueNavigation({run,position:this.position,entryCoordinates:[11,0,16],photoCoordinates:L.observe,signalPosition:L.elias,
   get signalAvailable(){return self.rescue.state.signal&&!self.rescue.state.departed;},get phase(){return self.objective;},
   get canReply(){return self.dialogue.replyAvailable;},get photoCoordinatesReleased(){return self.dialogue.photoUnlocked;},serialDialogue:true,
   onHeard:()=>{const r=this.rescue.listen();this.queue(...r.events);},onReply:()=>{const pick=this.suggestions[0];return !!pick&&this.radioSay(pick.text,pick.tag);},
   targetReached:target=>{if(!L.power.every((v,i)=>Math.abs(v-target[i])<.1))return false;const hit=this.aimedInterface();return hit.id==='harbor.rescue.power'&&hit.distance<=3.4;},
   photoGuidance:()=>this.photoAssessment(),drawActive:(ctx,w,h)=>this.drawDrivingSonar(ctx,w,h,this.elapsed,true),speak:t=>this.queue(t),
   waypointCatalog:[
    {position:[11,0,16],name:'接驳港入口 · A压力闸',detail:'万斯给出的入口。艇首朝门，缓慢驶到3.4米内，Shift制动后按F开启压力门。'},
    {position:L.observe,name:'01 闸机 · 接驳面板',detail:'货仓闸门的开关面板，也是观察断桥对岸的拍摄位。靠近面板按F开启或关闭闸门。'},
    {position:L.power,name:'02 配电箱 开关',detail:'岸电应急配电箱。靠近面板按F，为货仓闸门恢复供电。'},
    {position:[77,1,22],name:'03 货仓闸口',detail:'隔离货仓的闸门外侧。闸门开启后由此驶入货仓。'},
    {position:L.lure,name:'03 隔离货仓 · 仓内',detail:'货仓内部。在仓内开启主动脉冲，才能把它引进来。'},
   ]});
  this.world.root.updateMatrixWorld(true);
 }
 get complete(){return this.rescue.state.complete;}
 get evidenceReady(){return this.rescue.state.departureConfirmed;}
 get elevation(){return this.position.y;}
 get description(){const beat=this.performance();return this.base.description+' Formal rescue scene: fractured bridge, survivor across the gap, acoustic creature and isolation cargo bay. Preserve actual captured geometry and people; never invent future events.'+(beat.en?' Survivor performance: '+beat.en:'');}
 /** The shot the next exposure belongs to; only shots with the survivor in frame carry a performance slot. */
 private shotNow(){const s=this.rescue.state;if(s.departed)return 'VP-011';if(s.departing)return 'VP-012';if(s.isolated||s.monsterInside)return null;if(s.identified)return 'PT-004';if(s.replied)return 'PT-003';return null;}
 /** Performance chosen by story facts at shutter time; geometry and the creature stay physical. */
 performance(){const shot=this.shotNow();if(!shot)return {shot:null,key:'',en:'',zh:''};this.syncStory();
  const hits=this.story.performance(shot).map(x=>x.hit).filter(h=>!!h&&(h.en||h.zh));
  return {shot,key:hits[0]?.key??'',en:hits.map(h=>h!.en).filter(Boolean).join(' '),zh:hits.map(h=>h!.zh).filter(Boolean).join('')};}
 get eliasBeat(){return this.performance().key;}
 private syncStory(){const s=this.rescue.state,emitting=this.run.sonarEmitting;
  this.story.sync({'rescue.heard':s.heard,'rescue.replied':s.replied,'rescue.identified':s.identified,'rescue.warned':s.warned,'rescue.gateOpen':s.gateOpen,'rescue.isolated':s.isolated,'rescue.verified':s.verified,'rescue.departing':s.departing,'rescue.departed':s.departed,
   'pod.pulse':emitting?'on':'off','pod.lamp':this.run.lit?'on':'off','pod.hull':s.damageTotal>0?'damaged':'intact',
   'creature.zone':s.isolated?'behind_gate':s.monsterInside?'inside_cargo':s.identified?'roaming':'near_elias','elias.location':s.departed?'beyond_door':s.departing?'corridor':'wall',
   'evidence.threat':s.identified,'evidence.lure':s.lureConfirmed,'evidence.gate':s.verified,'evidence.departure':s.departureConfirmed,'rowan.knows.monster':s.identified,
   'elias.hears.pulse':s.heard&&emitting,'elias.hears.scrape':s.heard&&!s.isolated});}
 /** Who the passive-sonar microphone currently reaches; null means only static. */
 get micWindow():string|null{if(this.rescue.state.failed)return null;if(!this.rescue.state.heard)return this.vanceLost?null:this.vanceFading?'vance-fade':'vance-entry';if(this.farewellTail)return null;return windowOf[this.dialogue.stage]??null;}
 get micTarget(){const id=this.micWindow;return !id?null:id.startsWith('vance')?'万斯':'艾里亚斯';}
 get micReady(){return !!this.micWindow&&!this.dialogue.busy;}
 private get suggestions(){this.syncStory();return this.micReady?this.story.suggestions(this.micWindow):[];}
 /** Free text from the microphone. Raw text is shown as Rowan's line but never written to facts or prompts. */
 radioSay(text:string,tag?:string){
  text=text.replace(/\s+/g,' ').trim().slice(0,80);if(text&&!/[。！？…，,.!?—~）)]$/.test(text))text+=/(吗|呢|什么|哪|怎么|多久|谁|为什么|几)$/.test(text)?'？':'。';const id=this.micWindow;
  if(!id){this.feedback('频道里只有底噪，没有人回答。');return false;}
  if(this.dialogue.busy){this.feedback('对方还在说话，等这句说完再开口。');return false;}
  if(!text)return false;
  if(id==='elias-confirm'&&this.run.sonarEmitting){this.feedback('先停掉主动脉冲。它还听得见。');return false;}
  if(id==='elias-action'&&this.dialogue.stage==='lure'&&this.lureBeat===2&&!this.scrapeAnswered){this.scrapeAnswered=true;this.hullHitByVoice=true;this.run.hull=Math.max(.05,this.run.hull-.06);this.run.onShake?.(.7);this.run.onCue?.('hull.crack',.8);this.audibleBurstLeft=2;return this.dialogue.exchange(text,['（艇壳正对麦克风的位置，一声闷撞。仪表盘上 HULL 跳了一格。）','（接收机：急促的三声咔。然后什么都没有。）','','（很久。……咔。咔。）'],false,this.run.sonarEmitting,'罗温（压低声音）：');}
  this.syncStory();const r=this.story.say(id,text,tag);if(!r)return false;
  const replies=r.reply.map(l=>l==='@plan'?this.dialogue.planLine||'艾里亚斯：照刚才说的做。我在这儿等。':l);
  if(id==='elias-farewell'){this.farewellSpoken=true;this.tailIdle=0;}
  if(id.startsWith('vance')){this.dialogue.enqueue('罗温：'+text);for(const l of replies)this.dialogue.enqueue(l);
   if(id==='vance-fade'&&!r.garbled){this.vanceLost=true;this.run.pushLog('万斯的载波断开，频道里只剩底噪。','system');}return true;}
  const s=this.rescue.state,advance=r.advance&&['contact','report','confirm'].includes(this.dialogue.stage);
  const hushed=s.warned&&!s.isolated;
  if(!this.dialogue.exchange(text,replies,advance,this.run.sonarEmitting,hushed?'罗温（压低声音）：':'罗温：'))return false;
  if(this.dialogue.stage==='intro'&&!s.replied){this.rescue.reply();this.navigationConsole.replied=true;}
  return true;
 }
 get objective(){const s=this.rescue.state;if(s.failed)return '救援失败 · 读取检查点';if(s.complete)return '救援完成 · 坐在操作台按 B 下潜到-1层';
  if(this.run.power<.25&&this.zone()!=='power')return `电量低（${Math.round(this.run.power*100)}%）· 先回02配电箱，驶入3米内自动充电`+this.powerGuide();
  if(s.powered&&!s.gateOpen&&!s.isolated&&['lureBrief','lure','closeBrief','close'].includes(this.dialogue.stage))return '货仓闸门已落下 · 回桥头01面板按F重新开闸，再驶入03货舱'+this.guide(new T.Vector3(...L.observe),'01面板');
  if(this.dialogue.stage!=='contact')return this.dialogue.objective;if(this.dialogue.busy)return '';if(s.heard)return '按住 M 键说话（或在输入框打字），回应艾里亚斯';if(s.signal)return '调谐被动接收机，收听求救载波';return this.entryReached?'穿过维修湾，沿通道驶向主港'+this.doorGuide():`输入万斯坐标 ${formatCoords([11,0,16])}，手动抵达A压力闸前`;}
 readonly coordinateDatum=HARBOR_DATUM_DEPTH;
 get pulseCostScale(){return this.rescue.state.powered?1:1/3;}
 get dialogueChoices(){return this.suggestions.map(x=>x.text);}
 chooseDialogue(index:number){const pick=this.suggestions[index];return !!pick&&this.radioSay(pick.text,pick.tag);}
 get hint(){return this.objective;}
 private doorGuide(){
  const next=['harbor.edge.A-C','harbor.edge.C-B'].find(id=>!this.base.state.opened.includes(id)),door=next&&this.world.doors.get(next);if(!door)return '';
  return this.guide(door.bounds.getCenter(new T.Vector3()),'压力门');
 }
 private powerGuide(){
  if(this.podInCargo())return this.guide(new T.Vector3(77,0,19),'货仓闸口（先出仓，再去02配电箱）');
  if(this.position.x<34){
   // Bearings through walls strand a low battery; follow the A-C → C-B channel instead.
   const route=[[11,16],[11,22],[12,24],[14.5,25.5],[17,27],[18,30],[22,35],[32,35],[42,28]].map(([x,z])=>new T.Vector3(x,0,z));
   const flat=new T.Vector3(this.position.x,0,this.position.z);let i=0;route.forEach((p,k)=>{if(p.distanceTo(flat)<route[i].distanceTo(flat))i=k;});
   const next=route[route[i].distanceTo(flat)<4?Math.min(i+1,route.length-1):i];
   const total=route.slice(route.indexOf(next)).reduce((s,p,k,a)=>s+(k?p.distanceTo(a[k-1]):p.distanceTo(flat)),0);
   const shut=['harbor.edge.A-C','harbor.edge.C-B'].some(id=>!this.base.state.opened.includes(id));
   return this.guide(next,`去02配电箱的通道（全程约${total.toFixed(0)}米）下一段`)+(shut?' · 途中压力门没电也能开，到门前按F':'');
  }
  return this.guide(new T.Vector3(...L.power),'02配电箱');
 }
 private guide(c:T.Vector3,label:string){
  const dx=c.x-this.position.x,dz=c.z-this.position.z,bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360,rel=((bearing-this.run.heading)%360+540)%360-180,a=Math.abs(rel);
  const side=a<15?'正前方':a>150?'正后方':rel>0?(a<60?'右前方':'右侧'):(a<60?'左前方':'左侧');
  return ` · ${label}在${side}${Math.hypot(dx,dz).toFixed(0)}米（航向${bearing.toFixed(0)}°）`;
 }
 private queue(...text:string[]){for(const line of text)this.dialogue.enqueue(line);}
 private feedback(text:string){this.run.pushLog(text,'system');if(this.dialogue.busy)return;this.run.storyCaption=text;this.run.storyCaptionLeft=Math.max(4,Math.min(12,text.length*.13));}
 private aimedInterface(){
  this.pose();this.world.root.updateMatrixWorld(true);this.ray.setFromCamera(new T.Vector2(),this.camera);this.ray.far=8;
  const hit=this.ray.intersectObject(this.world.root,true).find(h=>{let o:T.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object instanceof T.Mesh;});
  let o:T.Object3D|null=hit?.object??null,id='',door='';while(o){id=id||o.userData.interactionId;door=door||o.userData.doorId;o=o.parent;}
  return {id,door,distance:hit?.distance??Infinity};
 }
 private interactionHint(){const hit=this.aimedInterface();const door=['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door);if(!door&&!hit.id?.startsWith('harbor.rescue.'))return this.objective;
  const name=door?'压力门':'设施面板';if(hit.distance>3.4)return `${name}距艇 ${hit.distance.toFixed(1)}米 · 缓慢前进至3.4米内，Shift制动后按F`;
  return `F · 操作${name}（${hit.distance.toFixed(1)}米） · 左中右操作台均可使用`;}
 private apply(result:RescueResult){for(const line of result.events)if(!line.startsWith('艾里亚斯：'))this.feedback(line);if(result.damage){this.run.hull=Math.max(0,this.run.hull-result.damage);this.run.onShake?.(.8);this.run.onCue?.('hull.crack',.8);}}
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-this.run.pitch*Math.PI/180-this.run.camTilt,-this.run.heading*Math.PI/180-this.run.camPan,0,'YXZ');this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
 private podInCargo(){return this.position.x>72.5&&this.position.x<81.7&&this.position.z<15.3;}
 private zone():RescueZone{for(const k of ['observe','power','lure'] as const)if(this.position.distanceTo(new T.Vector3(...L[k]))<3.6)return k;return 'none';}
 private solids(){return [...this.world.colliders,...[...this.world.doors].filter(([id])=>!this.base.state.opened.includes(id)||this.elapsed-(this.openedTimes.get(id)??-99)<1.2).map(([,d])=>d.bounds),...(!this.rescue.state.gateOpen?this.visual.gate.occluders:[])];}
 private visible(target:T.Vector3,max=30){this.pose();const d=target.distanceTo(this.position),p=target.clone().project(this.camera);if(d>max||d<.1||Math.abs(p.x)>.99||Math.abs(p.y)>.99||p.z>1||p.z< -1)return false;const ray=new T.Ray(this.position,target.clone().sub(this.position).normalize());return !this.solids().some(b=>{if(b.containsPoint(target))return false;const q=ray.intersectBox(b,new T.Vector3());return q&&q.distanceTo(this.position)<d-.3;});}
 private syncVisual(recording=false){const s=this.rescue.state;const monster=this.pursuit.position;const e=new T.Vector3(...L.elias);if(s.departing){e.x-=Math.min(1,s.departureSeconds/6)*4;e.z-=Math.max(0,Math.min(1,(s.departureSeconds-6)/4))*2.5;}
  this.visual.update({powered:s.powered,gateOpen:s.gateOpen,bridgeExtended:s.verified,monsterPosition:monster.toArray() as [number,number,number],eliasPosition:e.toArray() as [number,number,number],monsterVisible:recording,walking:s.departing&&!s.departed,eliasBeat:this.eliasBeat},this.elapsed);this.visual.gate.bounds.min.y=-1.25+this.visual.gate.mesh.position.y;this.visual.gate.bounds.max.y=4.25+this.visual.gate.mesh.position.y;this.world.root.updateMatrixWorld(true);}
 tick(dt:number){dt=Number.isFinite(dt)?Math.max(0,dt):0;this.elapsed+=dt;
  if(!this.started){this.started=true;this.queue('万斯：坐标发你了，在导航台上。过气闸走维修湾那条缝——全队只有你的艇挤得进去。','万斯：缝里开声纳，不然你会亲那面墙。过了门就关——你那块电池的检修单是我签的。……签的时候我没见过电池。岸电在里面。慢点开，罗温。我盯着你的点。');}
  if(!this.entryReached&&this.navigationConsole.target&&this.navigationConsole.target.every((v,i)=>Math.abs(v-[11,0,16][i])<.1)&&this.position.distanceTo(new T.Vector3(11,0,16))<=3){this.entryReached=true;this.feedback('万斯：门就在你正前方。门框应力计三天前报过一次撞击。……不是水压。别停，慢慢靠。');}
  if(this.run.power<.1&&this.run.activeSonarEnabled&&!this.rescue.state.powered){this.run.toggleActiveSonar();this.feedback('低压保护：主动声纳自动断电，余电留给推进。被动声纳照常。'+this.powerGuide().slice(3));}
  if(this.zone()==='power'&&this.run.power<.95&&!this.run.blackout){this.run.power=1;this.feedback('岸电接上：艇载电池充满。');}
  if(this.run.power<.03&&!this.run.blackout&&this.elapsed-this.reserveAt>30){this.reserveAt=this.elapsed;this.run.power=.15;this.run.onCue?.('ui.error',.6);
   this.feedback('应急储备接入：仪表和推进保住了，余电只够开回02配电箱。'+this.powerGuide().slice(3));}
  const warned=this.rescue.state.warned,pulse=this.run.sonarEmitting,noise=Math.abs(this.run.pilot.speed)>.45||this.audibleBurstLeft>0;this.audibleBurstLeft=Math.max(0,this.audibleBurstLeft-dt);
  const monsterDistance=this.position.distanceTo(this.pursuit.position),audible=this.pursuit.hears(this.position,pulse,noise);
  this.pursuit.tick(dt,this.position,pulse&&warned,noise&&warned,this.rescue.state.gateOpen,this.rescue.state.isolated,this.run.heading);
  const podInCargo=this.podInCargo(),s0=this.rescue.state;
  if(s0.gateOpen&&!s0.isolated&&!s0.monsterInside&&pulse&&!podInCargo){if(!this.outsideLureWarned){this.outsideLureWarned=true;this.feedback('潜艇还在货舱外。先穿过闸口驶入03货舱内部，再开启主动脉冲诱导；在外面发声只会把它引到你身边。');}}
  else if(!pulse)this.outsideLureWarned=false;
  // Entry only counts when the pod itself drew the creature in; once inside, it stays counted while the pod withdraws.
  const monsterInside=this.pursuit.inside&&(podInCargo||s0.monsterInside);
  this.apply(this.rescue.step(this.limp&&this.rescue.state.departing&&!this.rescue.state.departed?dt*.6:dt,{monsterInside,monsterDistance,nearB:this.entryReached&&this.position.x>27&&this.position.z>24,zone:this.zone(),activeSonar:audible&&warned}));this.navigationConsole.tick(dt);this.syncVisual();this.tickThreatBeep(dt);
  this.tickRadio(dt);
  const beat=this.dialogue.tick(dt,this.rescue.state,this.run.sonarEmitting);
  if(beat.line!==undefined){this.run.storyCaption=beat.line;this.run.storyCaptionLeft=beat.seconds??0;
   if(beat.line){this.run.pushLog(beat.line,'system');this.navigationConsole.recordDialogue(beat.line);this.run.onCue?.('radio.squelch',.18);
    if(!beat.line.startsWith('罗温')&&!beat.line.startsWith('（')&&typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(beat.line);voice.lang='zh-CN';window.speechSynthesis.speak(voice);}
   }
  }
  for(const effect of beat.effects){if(effect==='rumble'){this.run.onCue?.('creature.skitter',.7);this.run.onShake?.(.20);this.ambienceLeft=5;}
   if(effect==='escape'&&this.rescue.confirmIsolation()){this.rescue.interact('rescue');this.syncVisual();
    if(this.liedAboutFilm()){this.limp=true;this.queue(LIMP_LINES[0]);}}}
  if(this.limp&&this.rescue.state.departed&&!this.limpSaid){this.limpSaid=true;this.queue(LIMP_LINES[1]);}
  if(this.dialogue.ambience&&this.dialogue.stage!=='warning'){this.ambienceLeft-=dt;if(this.ambienceLeft<=0){this.ambienceBeat++;this.ambienceLeft=5+(this.ambienceBeat%3)*2;this.run.onCue?.(this.ambienceBeat%2?'creature.skitter':'creature.breath-sync',.30);if(this.ambienceBeat%3===0){this.run.onShake?.(.16);this.run.onCue?.('hull.ping-return',.35);}}}
 }
 /** Vance fades once the C-B door opens; Elias carries on alone if the player never answers. */
 private tickRadio(dt:number){const s=this.rescue.state;
  if(!this.vanceFading&&!s.heard&&this.base.state.opened.includes('harbor.edge.C-B')){this.vanceFading=true;this.queue('万斯：你深度读数在跳，载波也在掉——罗温？说句话，随便说句——');}
  this.tickLure();
  this.dialogue.closingLine=this.story.echo('farewell-open')??this.dialogue.closingLine;
  this.dialogue.lureLine=this.story.echo('lure-line')??this.dialogue.lureLine;
  if(this.dialogue.stage==='done'&&!this.dialogue.busy&&!this.farewellSpoken){this.farewellIdle+=dt;if(this.farewellIdle>=30){this.farewellSpoken=true;this.queue('艾里亚斯：……我就当你听见了。谢谢你。','艾里亚斯：我从里面找路下去。频道我开着……下面见。');}}
  if(this.dialogue.stage==='done'&&this.farewellSpoken&&!this.dialogue.busy&&!this.farewellTail&&(this.tailIdle+=dt)>=15){this.farewellTail=true;this.run.onCue?.('hull.ping-return',.3);
   const st=this.story.state;
   this.queue(...harborTail({meet:st['commitment.elias.meet'],hullHit:this.hullHitByVoice,lied:this.liedAboutFilm(),named:!!st['elias.knows.rowanName']}));}
  if(!this.vanceLost&&s.signal){this.vanceLost=true;if(this.vanceFading&&this.story.state['vance.lastHeard']==='none'){const line=this.story.echo('vance-fade-line');if(line)this.queue(line);}this.run.pushLog('万斯的载波断开，频道里只剩底噪。','system');}
  if(this.dialogue.stage==='contact'&&s.heard&&!this.dialogue.busy){this.contactIdle+=dt;
   if(!this.contactNudged&&this.contactIdle>=CONTACT_NUDGE){this.contactNudged=true;this.queue('艾里亚斯：……有人吗？听得见就按住麦克风，回答我。');}
   else if(this.contactIdle>=CONTACT_SILENT&&this.dialogue.exchange('',['艾里亚斯：……我就当你听得见。'],true,this.run.sonarEmitting)){this.rescue.reply();this.navigationConsole.replied=true;}
  }
 }
 /** Whispered running commentary during the lure; Elias hears the creature move, never sees the pod's film. */
 private tickLure(){const s=this.rescue.state;
  if(this.dialogue.stage==='close'&&!s.isolated&&!this.closeWarned&&!this.dialogue.busy&&Math.abs(this.run.pilot.speed)>.45){this.closeWarned=true;this.run.onCue?.('creature.skitter',.6);this.queue('艾里亚斯：你推进器在叫。……停一下。','','（四秒。水听器里，刮擦挪开了。）');}
  if(this.dialogue.stage==='close')this.lureBeat=0;
  if(this.dialogue.stage!=='lure'||s.lureConfirmed||this.dialogue.busy)return;
  const d=this.position.distanceTo(this.pursuit.position),inside=this.pursuit.inside;
  if(this.lureBeat===0&&this.podInCargo()&&this.run.sonarEmitting){this.lureBeat++;this.queue('艾里亚斯：刮声没了。……它不在我这儿了。那它在哪儿？');}
  else if(this.lureBeat===2&&!this.scrapeAnswered&&this.elapsed-this.scrapeAt>8){this.scrapeAnswered=true;this.queue('（接收机：一声短促的高音咔。……很久。）','（……咔。咔。）');}
  else if(this.lureBeat===1&&(d<6||inside)){this.lureBeat++;this.scrapeAt=this.elapsed;this.run.onCue?.('creature.skitter',.9);this.run.onShake?.(.35);this.queue('（艇壳外侧一道长长的刮擦，从艇尾拖到艇首。频道里没有呼吸声。）');}
 }
 move(d:number){return this.base.move(d);}turn(d:number){return this.base.turn(d);}moveVertical(d:number){return this.base.moveVertical(d);}
 sonarPulse(_power:0|1|2){} // Emissions, not screen power, attract the creature.
 interact(){if(this.run.driveBlock&&this.run.driveBlock!=='推进器没有电'&&this.run.driveBlock!=='切回实时镜头'){this.feedback(this.run.driveBlock);return;}
  let {id,door,distance}=this.aimedInterface();
  // Hull collision keeps the camera ~4 m off some panels; being inside the facility zone is enough.
  const near=this.zone();if(near!=='none'&&!(door&&distance<=3.4)&&!(id?.startsWith('harbor.rescue.')&&distance<=3.4)){id='harbor.rescue.'+near;door='';distance=0;}
  if(distance>3.4){this.feedback((door||id?.startsWith('harbor.rescue.'))?this.interactionHint():'这里没有可操作的设施。'+this.objective);return;}
  if(id?.startsWith('harbor.rescue.')){
   let zone=id.slice('harbor.rescue.'.length) as RescueZone;const s=this.rescue.state,stage=this.dialogue.stage;
   if(zone==='lure'){this.feedback('货舱开关统一在01面板。');return;}
   if(zone==='observe'&&s.departureConfirmed)zone='exit';
   // Facilities answer to their physical preconditions only; the quest stage merely decides whether the dialogue already explains the result.
   const expected=zone==='power'?stage==='power':zone==='observe'?s.gateOpen?stage==='close':stage==='open'||stage==='lure':zone==='exit'?stage==='done':false;
   const before=JSON.stringify(s),operation=this.rescue.interact(zone,this.run.sonarEmitting),after=this.rescue.state,changed=before!==JSON.stringify(after);
   const charged=zone==='power'&&!after.powered&&this.run.power<.95;
   if(zone==='power'){this.run.power=1;this.run.blackout=false;}
   if(charged)this.feedback('岸电接上：艇载电池充满。货仓那一路还锁着——'+operation.events.join(' '));
   else if(operation.events.length&&(!changed||!expected||this.dialogue.busy))this.feedback(operation.events.join(' '));
   else if(!changed&&!operation.events.length)this.feedback('该设施当前没有可执行的操作。');
   if(zone==='power'&&after.powered)this.run.vitals.restore({oxygen:this.run.vitals.vitals.oxygenMax-this.run.vitals.vitals.oxygen});
   this.syncVisual();return;
  }
  if(this.run.blackout){this.feedback('艇内总闸断开。到分析台点「恢复总闸」，再回来开门。');return;}
  if(door&&['harbor.edge.A-C','harbor.edge.C-B'].includes(door)){this.entryReached=true;if(!this.base.state.opened.includes(door)){this.base.openPassage(door);this.openedTimes.set(door,this.elapsed);this.feedback((this.run.powered?'压力门正在开启，等待门叶完全让开再通过。':'压力门走港区液压，不吃艇上的电。门叶在让开——里面02配电箱能补电。')+(door==='harbor.edge.A-C'?' 门后通道向右弯，C-B压力门在弯道尽头。':''));}return;}
  this.feedback(door?'该通道保持隔离。沿维修湾前往主港。':'这里没有可操作的设施。'+this.objective);
 }
 photoAssessment(){
  this.syncVisual(true);const s=this.rescue.state;
  const kind:RescueEvidenceKind=s.departed?'departure':s.isolated?'gate':s.monsterInside?'lure':'threat';
  const yaw=((this.run.heading+this.run.camPan*180/Math.PI)%360+360)%360;
  const pitch=this.run.pitch+this.run.camTilt*180/Math.PI;
  // Photo tasks are judged by where the pod is and what has happened, never by lens heading.
  const observe=new T.Vector3(...L.observe),atObserve=Math.hypot(this.position.x-observe.x,this.position.z-observe.z)<=PHOTO_STATION_RADIUS;
  let reason='';
  if(s.failed)reason='救援已失败，需读取检查点。';
  else if(!s.replied||!this.dialogue.photoUnlocked)reason='先听完艾里亚斯的拍摄指引，等待右上角生成拍摄任务。';
  else if(kind==='lure'){if(!this.podInCargo())reason='潜艇不在03货舱内部，驶入仓内再诱导拍摄。';else if(!this.pursuit.inside)reason='声纳红点尚未进入货仓。';}
  else if(kind==='gate'){if(Math.abs(this.visual.gate.mesh.position.y)>=.08)reason='闸门仍在移动，等待完全关闭。';}
  else if(!atObserve)reason=`请驶回01拍摄位 ${formatCoords(L.observe)} 附近（${PHOTO_STATION_RADIUS}米内）再曝光。`;
  this.syncVisual();
  return {kind,ready:!reason,text:reason||'取景可拍摄 · 曝光后分析新片',detail:`曝光镜头 ${yaw.toFixed(0)}° / 俯仰 ${pitch.toFixed(0)}°`,position:this.position.toArray()};
 }
 prepareCapture(){if(this.run.power<.1)return {ok:false,message:'电量不足以曝光（快门和探照灯要吃一格电）。先回02配电箱补电'+this.powerGuide()};
  return {ok:true,message:'开始曝光；当前镜头记录实际视野，证据有效性在分析台核验。'};}
 finishCapture(){if(this.previousOptics){[this.run.camPan,this.run.camTilt,this.run.camZoom]=this.previousOptics;this.previousOptics=null;}}
 captureEvidence(){const a=this.photoAssessment(),beat=this.performance();return this.rescue.capture('rescue-'+(++this.sequence),a.kind,a.ready,`${a.detail}；艇位 ${a.position.map(v=>v.toFixed(1)).join(' / ')}。${a.text}`+(beat.zh?`${PERFORMANCE}${beat.zh}`:''));}
 commitEvidence(value:unknown){this.rescue.commitCapture(value as RescueEvidence);}
 evidenceStatus(value:unknown){const e=value as RescueEvidence|undefined;return {accepted:!!e&&this.rescue.state.analyzed.includes(e.id)&&(e.kind!=='lure'||this.rescue.state.isolated||e.epoch===this.rescue.state.epoch&&this.rescue.state.lureConfirmed),next:this.objective};}
 analyzeEvidence(value:unknown){const v=value as {capture:RescueEvidence;media:{playable:boolean}};if(!v?.capture||!v.media?.playable)return ['没有可播放的摄影证据，请重新曝光。'];
  this.rescue.analyze(v.capture);const accepted=this.rescue.state.analyzed.includes(v.capture.id);
  const [diagnostic,figure]=(v.capture.diagnostic??'').split(PERFORMANCE);
  if(!accepted)this.feedback(diagnostic||'本卷未覆盖当前目标，或现场已经改变。请重新取景曝光。');
  return [accepted?'核验结果：本卷证据有效。':'核验结果：本卷未取得有效目标证据。',...(figure?['画面人物：'+figure]:[])];
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,recording=false){this.syncVisual(recording);this.base.draw(ctx,w,h,time,recording);this.syncVisual();}
 private detectedThreatDistance(){
  if(!this.run.sonarEmitting||!this.rescue.state.warned||this.rescue.state.failed)return null;
  const d=Math.hypot(this.visual.monster.position.x-this.position.x,this.visual.monster.position.z-this.position.z);
  return d<=36?d:null;
 }
 private tickThreatBeep(dt:number){
  const d=this.detectedThreatDistance();if(d===null){this.threatBeepLeft=0;return;}
  this.threatBeepLeft-=dt;
  if(this.threatBeepLeft<=0){this.run.onCue?.('sonar.threat',.45);this.threatBeepLeft=.18+1.42*Math.min(1,d/24);}
 }
 private drawThreat(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated:boolean){
  const distance=this.detectedThreatDistance();if(distance===null)return;
  const size=dedicated?Math.min(w,h/.93):Math.min(w*(this.run.lit?.28:.40),h*.66),x=dedicated?0:w-size-w*.025,y=dedicated?0:h*.22;
  const delta=this.visual.monster.position.clone().sub(this.position),a=Math.atan2(delta.x,-delta.z)-this.run.heading*Math.PI/180;
  // Never bury the contact under the ownship glyph at close range.
  const scale=size*.30/24,r=Math.max(distance*scale,Math.max(12,2.5*scale)+12);
  const px=x+size/2+Math.sin(a)*r,py=y+size*.48-Math.cos(a)*r;
  ctx.save();ctx.fillStyle='#ff334b';ctx.strokeStyle='#ff334b';ctx.lineWidth=2;ctx.globalAlpha=.8+.2*Math.sin(time*6);ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated=false){
  if(!this.sonarEcho||this.sonarEcho.width!==w||this.sonarEcho.height!==h){this.sonarEcho=document.createElement('canvas');this.sonarEcho.width=w;this.sonarEcho.height=h;this.echoSweep=-1;}
  if(this.run.sweepPower>0&&this.run.sweepId!==this.echoSweep){this.echoSweep=this.run.sweepId;const c=this.sonarEcho.getContext('2d')!;c.clearRect(0,0,w,h);this.base.drawDrivingSonar(c,w,h,time,dedicated);}
  ctx.drawImage(this.sonarEcho,0,0);this.drawThreat(ctx,w,h,time,dedicated);ctx.save();ctx.fillStyle='#dfc98d';ctx.font='12px sans-serif';ctx.fillText(this.echoSweep<0?'开启脉冲获取回波':this.run.sonarEmitting?'脉冲测距中':'历史回波 · 停发静默',8,h-8);ctx.restore();
 }
 get sonarReadout(){return this.echoSweep<0?undefined:this.base.sonarReadout;}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.navigationConsole.draw(ctx,w,h);}
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){if(this.interactionHint()===this.objective)return;ctx.save();ctx.font=`${Math.max(13,h*.034)}px Microsoft YaHei`;ctx.textAlign='left';ctx.textBaseline='top';const text=this.interactionHint();const lines=layoutCJK(ctx,text,w*.9);ctx.fillStyle='rgba(3,12,15,.8)';ctx.fillRect(0,0,w,Math.min(h,lines.length*h*.16+8));ctx.fillStyle='#cfd8c5';lines.slice(0,5).forEach((line,i)=>ctx.fillText(line,w*.035,4+i*h*.16));ctx.restore();}
 snapshot(){return {...this.base.snapshot(),adapter:'harbor-rescue',adapterVersion:1,heading:this.run.heading,rescue:this.rescue.snapshot(),navigation:this.navigationConsole.snapshot(),sonarDesk:structuredClone(sonarDeskState(this.run)),entryReached:this.entryReached,elapsed:this.elapsed,sequence:this.sequence,dialogue:this.dialogue.snapshot(),story:this.story.snapshot(),radio:{vanceFading:this.vanceFading,vanceLost:this.vanceLost},ambienceLeft:this.ambienceLeft,ambienceBeat:this.ambienceBeat,pursuit:this.pursuit.snapshot()};}
 restore(value:unknown){const s=value as ReturnType<HarborRescueSite['snapshot']>;if(!s||s.adapter!=='harbor-rescue'||s.adapterVersion!==1||!s.navigation||!s.sonarDesk||!Number.isFinite(s.elapsed)||!Number.isInteger(s.sequence)||s.sequence<0||s.elapsed<0||!Number.isFinite(s.heading)||typeof s.entryReached!=='boolean')return false;const check=new HarborRescue();if(!check.restore(s.rescue))return false;if(!HarborRescueNavigation.validateSnapshot(s.navigation)||s.navigation.heard!==s.rescue.heard||s.navigation.replied!==s.rescue.replied)return false;const d=s.sonarDesk;if(!Array.isArray(d.fields)||d.fields.length!==3||!d.fields.every(x=>typeof x==='string')||!Array.isArray(d.records)||!Number.isFinite(d.frequency)||d.frequency<35||d.frequency>45||!Number.isInteger(d.axis)||d.axis<0||d.axis>2||!['home','result','history'].includes(d.page)||typeof d.message!=='string'||(d.target!==null&&(!Array.isArray(d.target)||d.target.length!==3||!d.target.every(Number.isFinite)))||d.records.some(r=>!r||typeof r.text!=='string'||typeof r.kind!=='string'||!Number.isFinite(r.frequency)||(r.recording!==undefined&&typeof r.recording!=='string'))||(d.selected!==undefined&&(!Number.isInteger(d.selected)||d.selected<0||d.selected>=Math.max(d.records.length,s.navigation.radioRecords?.length??0))))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||!harborHullClear(new T.Vector3(...s.position),s.heading,this.world.walkable,[...this.world.colliders.filter(b=>b!==this.visual.gate.bounds),...(s.rescue.gateOpen?[]:[this.visual.gate.bounds.clone().set(new T.Vector3(72.3,-1.25,15.7),new T.Vector3(81.7,4.25,16.3))]),...[...this.world.doors].filter(([id])=>!s.state?.opened?.includes(id)).map(([,door])=>door.bounds)]))return false;
  if(s.pursuit!==undefined&&!new HarborPursuit().restore(s.pursuit))return false;
  const conversation=new HarborRescueDialogue();if(s.dialogue!==undefined&&!conversation.restore(s.dialogue))return false;
  const story=new StoryRuntime(level01);if(s.story!==undefined&&!story.restore(s.story))return false;
  if(s.radio!==undefined&&(typeof s.radio?.vanceFading!=='boolean'||typeof s.radio?.vanceLost!=='boolean'))return false;
  if(!this.base.restore(s))return false;this.rescue.restore(s.rescue);if(s.pursuit)this.pursuit.restore(s.pursuit);else if(s.rescue.monsterInside)this.pursuit.position.set(...L.cargo);this.navigationConsole.restore(s.navigation);Object.assign(sonarDeskState(this.run),structuredClone(d));this.entryReached=s.entryReached;this.elapsed=s.elapsed;this.sequence=s.sequence;
  if(s.dialogue)this.dialogue.restore(s.dialogue);else {this.dialogue.migrate(s.rescue);this.navigationConsole.clearPending();}
  if(s.story)this.story.restore(s.story);
  this.vanceLost=s.radio?.vanceLost??s.rescue.heard;this.vanceFading=s.radio?.vanceFading??this.vanceLost;this.contactIdle=0;this.contactNudged=false;
  if(this.navigationConsole.target?.every((v,i)=>v===[78,0,26][i])){
   this.navigationConsole.setWaypoint(L.lure);const desk=sonarDeskState(this.run);desk.target=[...L.lure];desk.fields=coordFields(L.lure);
  }
  this.ambienceLeft=Number.isFinite(s.ambienceLeft)?Math.max(0,s.ambienceLeft):4;this.ambienceBeat=Number.isInteger(s.ambienceBeat)?Math.max(0,s.ambienceBeat):0;
  this.run.storyCaption=this.dialogue.currentLine;this.run.storyCaptionLeft=this.dialogue.currentSeconds;this.started=true;this.syncVisual();return true;}
 dispose(){if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();this.visual.dispose();this.base.dispose();this.materials.dispose();this.referenceMaterials.dispose();}
}









