import {Prologue} from '../../sim/prologue';
import {useHarborLocalVideo} from '../../content/harbor-local-videos';
import {showHarborDoorPanel} from './harbor-door-panel';
import {HARBOR_DOOR_CODE} from '../../content/harbor-door-code';
import {isHarborOpening,harborOpeningFinished,isHarborTaskMedia} from '../../sim/harbor-opening';
import {labPlaybackRunning} from '../footage';
import {isNoVideoMode} from '../gm';
import {HarborSimpleFlow} from '../../sim/harbor-simple-flow';
import {HarborTaskPlayer} from './harbor-task-player';
import {HARBOR_TASKS,type HarborTaskId} from '../../content/harbor-task-videos';
import * as T from 'three';
import {beginExtend,beginGrip,ARM_PHASE_CN} from '../../sim/manipulator';
import {WindowLocks,type WindowTarget} from '../window-locks';
import {accelerateHarborMesh} from './harbor-raycast';
import {isAudioMuted} from '../../../audio/mute';
import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import {HarborRescue,type RescueZone,type RescueResult,type RescueEvidence,type RescueEvidenceKind} from '../../sim/harbor-rescue';
import {harborHullClear} from '../../sim/harbor-navigation';
import {harborRouteLookAhead} from '../../sim/harbor-route-guidance';
import {PodExpedition} from './pod-expedition';
import {createReferenceMaterials} from './reference-materials';
import {createHarborMaterials} from './harbor-materials';
import {createHarborRescueWorld,HARBOR_RESCUE_LAYOUT as L} from './harbor-rescue-world';
import {HarborRescueNavigation} from './harbor-rescue-navigation';
import {sonarDeskState} from '../sonar-desk';
import {HarborPursuit} from '../../sim/harbor-pursuit';
import {HARBOR_DATUM_DEPTH,coordFields,formatCoords} from '../../sim/site-coords';
import {HarborRescueDialogue} from '../../sim/harbor-rescue-dialogue';
import {StoryRuntime} from '../../../story-pipeline/runtime';
import {level01} from '../../../story-pipeline/level-01-legacy';
import {parseNarrative,plantSeeds,hearSafety,noteInjury,freshNarrative,validNarrative,receiveSafetyEvidence} from '../../sim/narrative-memory';
import {videoCreatureSubject} from '../../content/video-creatures';

const CONTACT_NUDGE=25,CONTACT_SILENT=50,PERFORMANCE='\n人物：';
const windowOf:Record<string,string>={contact:'elias-contact',intro:'elias-warning',stop:'elias-warning',warning:'elias-warning',photo:'elias-wait',report:'elias-report',
 plan:'elias-action',power:'elias-action',powerBrief:'elias-action',open:'elias-action',lureBrief:'elias-action',lure:'elias-action',closeBrief:'elias-action',close:'elias-action',
 confirmBrief:'elias-confirm',confirm:'elias-confirm',escapeBrief:'elias-escape',escape:'elias-escape',departure:'elias-escape',done:'elias-farewell'};

const PHOTO_STATION_RADIUS=6;
/** Porthole focus plate names for the facilities the window can lock onto. */
const HARBOR_TARGET_NAMES:Record<string,string>={'harbor.rescue.observe':'接驳闸机面板','harbor.rescue.power':'配电箱','harbor.edge.A-C':'第一道压力门','harbor.edge.C-B':'第二道压力门'};

/** Formal first chapter: retains the existing A/C approach and B pressure hull. */
export class HarborRescueSite implements AuthoredSite {
 readonly index=0;readonly managesThreats=true;readonly spatialThreat=false;readonly diegeticGuidance=true;readonly managesNarrative=true;
 readonly base:PodExpedition;readonly rescue=new HarborRescue();readonly navigationConsole:HarborRescueNavigation;
 readonly dialogue=new HarborRescueDialogue();readonly pursuit=new HarborPursuit();
 readonly world;readonly position;readonly visual;private referenceMaterials=createReferenceMaterials();private materials=createHarborMaterials(this.referenceMaterials);
 private camera=new T.PerspectiveCamera(64,1024/720,.08,120);private ray=new T.Raycaster();
 private elapsed=0;private sequence=0;private entryReached=false;private openedTimes=new Map<string,number>();
 private started=false;
 private simplified=true;
 readonly simpleFlow=new HarborSimpleFlow(this.rescue);
 private taskPlayer:HarborTaskPlayer;
 private simpleWaypoint='';
 private kitPending=false;
 // Opt-in QA telemetry only: no persistence, network, evidence grants or gameplay changes.
 private readonly photoDiag=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('harborPhotoDiag')==='1';
 private photoDiagAt=0;
 private debugNoVideo=false;
 private personnelNear=false;
 private previousOptics:number[]|null=null;
 private liveFrameKey='';
 private liveFrameRevision=-1;
 private sonarEcho:HTMLCanvasElement|null=null;
 private echoSweep=-1;
 private threatBeepLeft=0;
 private ambienceLeft=4;private ambienceBeat=0;
 private audibleBurstLeft=0;private outsideLureWarned=false;private reserveAt=-99;
 readonly story=new StoryRuntime(level01);
 private vanceFading=false;private vanceLost=false;private contactIdle=0;private contactNudged=false;private lureBeat=0;private farewellIdle=0;private farewellSpoken=false;private farewellTail=false;private tailIdle=0;private closeWarned=false;private scrapeAt=0;private scrapeAnswered=false;
 noiseBurst(amount:number){if(amount>=.1)this.audibleBurstLeft=Math.max(this.audibleBurstLeft,.6);}
 constructor(readonly run:PodRun){
  this.taskPlayer=new HarborTaskPlayer(run);
  this.base=new PodExpedition(run,0);this.world=this.base.world;this.position=this.base.position;
  this.position.set(11,0,10);run.heading=180;run.pitch=0;run.camPan=run.camTilt=0;this.pursuit.awake=!this.simplified;
  this.visual=createHarborRescueWorld(this.world,this.materials);this.world.colliders.push(...this.visual.solids,this.visual.gate.bounds);this.world.decorColliders.push(...this.visual.decor);
  this.world.walkable.push(new T.Box3(new T.Vector3(72,-1,1.6),new T.Vector3(82.2,5.5,26)));
  const self=this;
  this.navigationConsole=new HarborRescueNavigation({run,position:this.position,entrySource:'艾里亚斯',entryCoordinates:[11,0,16],photoCoordinates:L.observe,signalPosition:L.elias,
   get signalAvailable(){return !self.simplified&&self.rescue.state.signal&&!self.rescue.state.departed;},get phase(){return self.objective;},
   get canReply(){return self.simplified?false:self.dialogue.replyAvailable;},get photoCoordinatesReleased(){return self.simplified?self.simpleFlow.canPhotograph:self.dialogue.photoUnlocked;},serialDialogue:true,
   onHeard:()=>{const r=this.rescue.listen();this.queue(...r.events);},onReply:()=>{const pick=this.suggestions[0];return !!pick&&this.radioSay(pick.text,pick.tag);},
   targetReached:target=>{if(!L.power.every((v,i)=>Math.abs(v-target[i])<.1))return false;const hit=this.aimedInterface();return hit.id==='harbor.rescue.power'&&hit.distance<=3.4;},
   monster:this.pursuit,photoGuidance:()=>this.photoAssessment(),drawActive:(ctx,w,h)=>this.drawDrivingSonar(ctx,w,h,this.elapsed,true),speak:t=>this.queue(t),
   waypointCatalog:[
    {position:[11,0,16],name:'接驳港入口 · A压力闸',detail:'调查航线入口。艇首朝门，缓慢驶到3.4米内，Shift制动后按F开启压力门。'},
    {position:L.observe,name:'01 闸机 · 接驳面板',detail:'货仓闸门的开关面板，也是观察井口水道的拍摄位。靠近面板按F开启或关闭闸门。'},
    {position:L.power,name:'02 配电箱 开关',detail:'岸电应急配电箱。靠近面板按F，为货仓闸门恢复供电。'},
    {position:[77,1,22],name:'03 货仓闸口',detail:'隔离货仓的闸门外侧。闸门开启后由此驶入货仓。'},
    {position:L.lure,name:'03 隔离货仓 · 仓内',detail:'货仓内部。在仓内开启主动脉冲，才能把它引进来。'},
   ]});
  this.world.root.updateMatrixWorld(true);this.syncVisual();
 }
 beginPrologue(){
  this.run.prologue=new Prologue();this.position.set(11,0,-36);
  this.run.heading=180;this.run.pitch=0;this.run.lamp=false;this.run.throttle=0;
  this.run.activeSonarEnabled=false;this.run.sonarPulseEnabled=false;
  this.run.walkTo('nav');this.prologueAnnounced=-1;
 }
 private prologueAnnounced=-1;
 /** Vance's line stays on screen while it is voiced; the instruction overlay waits for storyCaptionLeft to run out. */
 private prologueVoice:SpeechSynthesisUtterance|null=null;private prologueHold=0;
 private tickPrologue(dt:number){
  const p=this.run.prologue;if(!p?.active)return false;
  this.prologueHold=Math.max(0,this.prologueHold-dt);
  if(this.prologueVoice&&this.prologueHold>0)this.run.storyCaptionLeft=Math.max(this.run.storyCaptionLeft,.6);
  const hit=this.aimedInterface();
  p.tick(dt,{target:sonarDeskState(this.run).target,lamp:this.run.lit,gear:this.run.throttle,gearSettled:!this.run.throttleDragging,speed:this.run.pilot.speed,
   x:this.position.x,y:this.position.y,z:this.position.z,pitch:this.run.pitch,pitchRate:this.run.pilot.pitchRate,verticalSpeed:this.run.pilot.verticalSpeed,
   doorReach:hit.door==='harbor.edge.A-C'&&hit.distance<=3.4,
   doorOpen:this.base.state.opened.includes('harbor.edge.A-C'),armStowed:this.run.arm.phase==='stowed'});
  if(p.step!==this.prologueAnnounced){
   this.prologueAnnounced=p.step;
   const line=p.active?'万斯：'+p.beat[2]:'万斯：门开了，机械臂已收妥。罗温，继续进港。我留在陆地频道，有情况随时联系。';
   // Reading time when silent; speech can extend it until the utterance ends, capped in case the browser never reports the end.
   const read=Math.max(3,line.length*.14+1.2);
   this.run.storyCaption=line;this.run.storyCaptionLeft=p.active?read:20;this.prologueHold=read+8;this.prologueVoice=null;this.run.pushLog(line,'system');
   if(!isAudioMuted()&&typeof window!=='undefined'&&'speechSynthesis' in window){window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(line);voice.lang='zh-CN';
    voice.onend=voice.onerror=()=>{if(this.prologueVoice===voice)this.prologueVoice=null;};this.prologueVoice=voice;window.speechSynthesis.speak(voice);}
  }
  this.navigationConsole.tick(dt);this.syncVisual();
  return true;
 }
 get complete(){return (!this.debugNoVideo||isNoVideoMode())&&this.rescue.state.complete;}
 get evidenceReady(){return (!this.debugNoVideo||isNoVideoMode())&&this.rescue.state.departureConfirmed;}
 get elevation(){return this.position.y;}
 get description(){if(this.simplified)return this.base.description+' Flooded harbor waterway and cargo isolation gate. Elias is elsewhere in a dry personnel passage and must never appear in player footage.';const beat=this.performance();return this.base.description+' Formal rescue scene: fractured bridge, survivor across the gap, acoustic creature and isolation cargo bay. Preserve actual captured geometry and people; never invent future events.'+(beat.en?' Survivor performance: '+beat.en:'');}
 /** The shot the next exposure belongs to; only shots with the survivor in frame carry a performance slot. */
 private shotNow(){const s=this.rescue.state;if(s.departed)return 'VP-011';if(s.departing)return 'VP-012';if(s.isolated||s.monsterInside)return null;if(s.identified)return 'PT-004';if(s.replied)return 'PT-003';return null;}
 /** Performance chosen by story facts at shutter time; geometry and the creature stay physical. */
 performance(){if(this.simplified)return {shot:null,key:'',en:'',zh:''};if(this.rescue.state.injured)return {shot:'VP-INJURED',key:'injured',en:'The survivor braces against the railing, unable to stand on his injured leg.',zh:'艾里亚斯倚靠栏杆，伤腿不能承重。'};const shot=this.shotNow();if(!shot)return {shot:null,key:'',en:'',zh:''};this.syncStory();
  const hits=this.story.performance(shot).map(x=>x.hit).filter(h=>!!h&&(h.en||h.zh));
  return {shot,key:hits[0]?.key??'',en:hits.map(h=>h!.en).filter(Boolean).join(' '),zh:hits.map(h=>h!.zh).filter(Boolean).join('')};}
 get eliasBeat(){return this.performance().key;}
 private syncStory(){const s=this.rescue.state,emitting=this.activeNoise;
  const captured=(s.identified?1:0)+(s.lureConfirmed?1:0)+(s.verified?1:0);
  this.story.sync({'rescue.heard':s.heard,'rescue.replied':s.replied,'rescue.identified':s.identified,'rescue.warned':s.warned,'rescue.gateOpen':s.gateOpen,'rescue.isolated':s.isolated,'rescue.verified':s.verified,'rescue.departing':s.departing,'rescue.departed':s.departed,
   'pod.pulse':emitting?'on':'off','pod.lamp':this.run.lit?'on':'off','pod.hull':s.damageTotal>0?'damaged':'intact',
   'creature.zone':s.isolated?'behind_gate':s.monsterInside?'inside_cargo':s.identified?'roaming':'near_elias','elias.location':s.departed?'beyond_door':s.departing?'corridor':'wall',
   'evidence.threat':s.identified,'evidence.lure':s.lureConfirmed,'evidence.gate':s.verified,'evidence.departure':s.departureConfirmed,'rowan.knows.monster':s.identified,
   'containment.captured':captured,
   'elias.hears.pulse':s.heard&&emitting,'elias.hears.scrape':s.heard&&this.npcHearsDanger()});}
 /** Who the passive-sonar microphone currently reaches; null means only static. */
 get micWindow():string|null{if(this.simplified)return 'elias-action';if(this.rescue.state.failed)return null;if(!this.rescue.state.heard)return this.vanceLost?null:this.vanceFading?'vance-fade':'vance-entry';if(this.farewellTail)return null;return windowOf[this.dialogue.stage]??null;}
 get micTarget(){const id=this.micWindow;return !id?null:id.startsWith('vance')?'万斯':'艾里亚斯';}
 get micReady(){return !!this.micWindow;}
 private npcThreat(){const a=this.pursuit.position,b=this.simplified?new T.Vector3(...L.elias):this.visual.elias.position;if(!this.pursuit.awake||this.rescue.state.isolated||this.pursuit.inside||a.distanceTo(b)>=3.2)return false;const ray=new T.Ray(a,b.clone().sub(a).normalize());return !this.solids().some(box=>{if(box.containsPoint(a)||box.containsPoint(b))return false;const hit=ray.intersectBox(box,new T.Vector3());return !!hit&&hit.distanceTo(a)<a.distanceTo(b)-.2;});}
 private npcHearsDanger(){return this.pursuit.awake&&!this.rescue.state.isolated&&!this.pursuit.inside&&this.pursuit.position.distanceTo(new T.Vector3(...L.elias))<5;}
 gmKillCreatures(radius:number){if(this.pursuit.killed||this.position.distanceTo(this.pursuit.position)>radius)return [];this.pursuit.kill();this.syncVisual();return ['港区爬行生物'];}
 private narrativeSay(text:string,id:string):boolean{
  const intent=parseNarrative(text),m=this.run.narrativeMemory,s=this.rescue.state;
  const seedLines=plantSeeds(m,intent,id.startsWith('vance')?'vance':'elias',text);
  if(intent.ambiguous){this.queue('罗温：'+text,(id.startsWith('vance')?'万斯':'艾里亚斯')+'：你是在问，还是已经确认了？');return true;}
  if(!id.startsWith('vance')&&s.replied&&(intent.claim||intent.order||intent.refuse||intent.apology)){
   const r=hearSafety(m,intent,{at:this.elapsed,hearsDanger:this.npcHearsDanger(),playerHadThreatEvidence:s.identified,injured:s.injured,secured:m.belief==='sealed'&&m.beliefSource.startsWith('收到的录像')});
   let stage=this.dialogue.stage;const lines=['罗温：'+text,...seedLines,...r.lines];
   if(r.action==='hold'){this.rescue.stopDeparture();stage=s.departed?'departure':s.isolated?'confirm':s.powered?s.gateOpen?'lure':'open':s.identified?'power':'photo';}
   if(r.action==='go'){
    if(this.rescue.requestDeparture())stage='escape';
    else if(!s.departed){lines.push('艾里亚斯：这边逃生门还没有电。先去02恢复供电，我在门边等。');stage='power';}
   }
   if(r.action==='none'&&['report','plan'].includes(stage))stage=s.powered?'open':'power';
   if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();this.dialogue.interrupt(stage,lines);this.syncVisual();return true;
  }
  if(seedLines.length){if(id==='elias-contact'&&!s.replied){this.rescue.reply();this.navigationConsole.replied=true;this.dialogue.interrupt('stop',['罗温：'+text,...seedLines,'艾里亚斯：我在断桥对面，背靠检修门。先停掉主动脉冲。']);}else for(const line of ['罗温：'+text,...seedLines])this.queue(line);return true;}
  return false;
 }
 /** Delivery acknowledgement is separate from pressing Send, and from the player's own analysis. */
 receiveTape(recipient:'vance'|'elias',tapeId:string):boolean{
  if(recipient!=='elias'||this.micTarget!=='艾里亚斯')return false;
  const tape=this.run.tapes.find(t=>t.id===tapeId),e=tape?.siteEvidence as RescueEvidence|undefined;
  if(this.run.narrativeMemory.received.includes(tapeId))return false;
  if(!tape?.analyzed||!e?.visible||!this.rescue.state.analyzed.includes(e.id))return false;
  const claim=e.kind==='gate'&&e.epoch===this.rescue.state.epoch&&this.rescue.state.isolated?'sealed':(e.kind==='threat'||e.kind==='lure')&&e.creatureVisible!==false?'danger':null;
  if(!claim)return false;
  const lines=receiveSafetyEvidence(this.run.narrativeMemory,tapeId,claim,e.capturedAt??0);
  this.queue(...lines,'艾里亚斯：录像收到了。'+(claim==='sealed'?'门和里面的东西都拍到了。':'这是拍摄当时的情况，之后有没有变化？'));return true;
 }
 private get suggestions(){this.syncStory();return this.micReady?this.story.suggestions(this.micWindow):[];}
 /** Explicit local QA, not a generated movie or production evidence. Taints this entire run. */
 private diagnosticSay(text:string){
  if(!isNoVideoMode()){this.feedback('诊断核验仅在GM无视频模式可用；正式流程仍须真实录像。');return true;}
  if(text==='诊断核验任务'){this.feedback('剧情任务视频无需核验：无视频模式下到达阶段即自动推进。');return true;}
  if(this.run.at!=='lab'){this.feedback('GM诊断：怪物底片请到分析台按 3“诊断底片”。');return true;}
  const tape=this.run.selectedTape,e=tape?.siteEvidence as RescueEvidence|undefined;
  if(!e||tape?.legId!==this.run.leg.id||!this.rescue.state.captures.some(x=>x.id===e.id)||['exposing','developing'].includes(this.run.shot.phase)){
   this.feedback('GM诊断：选择当前关已完成曝光的现场底片；仍检查真实取景、光照、入仓和当前轮次。');return true;
  }
  const result=this.rescue.analyze(e);
  if(this.rescue.state.analyzed.includes(e.id)){this.debugNoVideo=true;this.run.gmLevelSession=true;tape.analyzed=true;tape.report=['GM诊断文字 · 非真实录像 · 本局禁写正式存档',...result.events];}
  this.feedback('【GM诊断】'+result.events.join(' '));return true;
 }
 /** Story videos carry no evidence: receipt (the opening call: finished playback) advances the task without lab analysis. */
 private advanceStoryTask(){
  const id=this.simpleFlow.pending;if(!id||this.rescue.state.failed)return;
  if(isNoVideoMode()&&!useHarborLocalVideo(id,true)){
   if(!this.simpleFlow.accept(id))return;
   this.debugNoVideo=true;this.run.gmLevelSession=true;this.navigationConsole.replied=this.rescue.state.replied;
   const line='艾里亚斯：'+HARBOR_TASKS[id].line;this.navigationConsole.recordDialogue(line);this.feedback('【GM无视频 · 非真实录像 · 本局禁写正式存档】'+line);
   if(this.evidenceReady)this.run.campaign.record(0,'film');return;
  }
  const tape=this.run.tapes.find(t=>t.id==='harbor.task.'+id);
  if(!tape||!isHarborTaskMedia(tape,id)||isHarborOpening(tape)&&!harborOpeningFinished(tape)||!this.simpleFlow.accept(id))return;
  const line='艾里亚斯：'+HARBOR_TASKS[id].line;tape.analyzed=true;tape.report=['剧情任务录像 · 无需核验',line];
  this.navigationConsole.replied=this.rescue.state.replied;this.navigationConsole.recordDialogue(line);this.feedback(line);
  if(this.evidenceReady)this.run.campaign.record(0,'film');
 }
 /** Free text from the microphone. Raw text is shown as Rowan's line but never written to facts or prompts. */
 radioSay(text:string,tag?:string){
  if(this.simplified&&/^诊断(?:核验任务|分析底片)$/.test(text.trim()))return this.diagnosticSay(text.trim());
  if(this.debugNoVideo&&!isNoVideoMode()){this.feedback('此局含GM诊断进度：请恢复无视频模式，或新开正式游戏。');return false;}
  if(this.simplified){if(/^\s*(重试录像|retry)\s*$/i.test(text))this.feedback(this.taskPlayer.retry());else {const lines=this.simpleFlow.say(text,this.run.narrativeMemory,this.activeNoise,this.elapsed);if(!lines.length)return false;for(const line of lines)this.navigationConsole.recordDialogue(line);this.feedback(lines.join('\n'));}return true;}
  text=text.replace(/\s+/g,' ').trim().slice(0,80);if(text&&!/[。！？…，,.!?—~）)]$/.test(text))text+=/(吗|呢|什么|哪|怎么|多久|谁|为什么|几)$/.test(text)?'？':'。';const id=this.micWindow;
  if(!id){this.feedback('频道里只有底噪，没有人回答。');return false;}
  if(this.narrativeSay(text,id))return true;
  if(this.dialogue.busy){this.feedback('对方还在说话，等这句说完再开口。');return false;}
  if(!text)return false;
  if(id==='elias-confirm'&&this.activeNoise){this.feedback('先停掉主动脉冲。它还听得见。');return false;}
  this.syncStory();const r=this.story.say(id,text,tag);if(!r)return false;
  for(const w of r.changed)if(w.fact==='relation.elias.trust'&&w.op==='add'&&typeof w.value==='number')this.run.narrativeMemory.trust=Math.max(-3,Math.min(3,this.run.narrativeMemory.trust+w.value));
  const replies=r.reply.map(l=>l==='@plan'?this.dialogue.planLine||'艾里亚斯：照刚才说的做。我在这儿等。':l);
  if(id==='elias-farewell'){this.farewellSpoken=true;this.tailIdle=0;}
  if(id.startsWith('vance')){this.dialogue.enqueue('罗温：'+text);for(const l of replies)this.dialogue.enqueue(l);
   if(id==='vance-fade'&&!r.garbled){this.vanceLost=true;this.run.pushLog('万斯的载波断开，频道里只剩底噪。','system');}return true;}
  const s=this.rescue.state,advance=r.advance&&['contact','report','confirm'].includes(this.dialogue.stage);
  const hushed=s.warned&&!s.isolated;
  if(!this.dialogue.exchange(text,replies,advance,this.activeNoise,hushed?'罗温（压低声音）：':'罗温：'))return false;
  if(this.dialogue.stage==='intro'&&!s.replied){this.rescue.reply();this.navigationConsole.replied=true;}
  return true;
 }
 get objective(){if(this.debugNoVideo&&!isNoVideoMode())return 'GM诊断进度已暂停 · 恢复无视频模式或新开正式游戏';if(this.simplified)return (isNoVideoMode()?'【GM无视频 · 非正式存档】有预制片需观看，无成片任务文字推进；怪物底片在分析台按 3 诊断 · ':'')+this.simpleFlow.objective;const s=this.rescue.state;if(s.failed)return '救援失败 · 读取检查点';if(s.complete)return '救援完成 · 坐在操作台按 B 下潜到-1层';
  if(this.run.power<.25&&this.zone()!=='power')return `电量低（${Math.round(this.run.power*100)}%）· 先回02配电箱，驶入3米内自动充电`+this.powerGuide();
  if(s.powered&&!s.gateOpen&&!s.isolated&&['lureBrief','lure','closeBrief','close'].includes(this.dialogue.stage))return '货仓闸门已落下 · 回桥头01面板按F重新开闸，再驶入03货舱'+this.guide(new T.Vector3(...L.observe),'01面板');
  if(this.dialogue.stage!=='contact')return this.dialogue.objective;if(this.dialogue.busy)return '';if(s.heard)return '按住 M 键说话（或在输入框打字），回应艾里亚斯';if(s.signal)return '驶近求救载波，接收机自动收听';return this.entryReached?'穿过维修湾，沿通道驶向主港'+this.doorGuide():`输入万斯坐标 ${formatCoords([11,0,16])}，手动抵达A压力闸前`;}
 readonly coordinateDatum=HARBOR_DATUM_DEPTH;
 get pulseCostScale(){return this.rescue.state.powered?1:1/3;}
 get dialogueChoices(){if(this.simplified&&!this.simpleFlow.legacy)return this.simpleFlow.awaitingReport?['我已经确认关好了，可以走','请先等我核对']:['你失联很久了，总部不知道你的情况，就派了我下来。','为什么要关闭主动声纳？'];if(this.simplified)return this.simpleFlow.awaitingReport?(this.rescue.state.isolated?['关住了，可以走','先别走，我再核对一下']:['还没关住，先等','我不确定，等我再拍一次']):['你好，收到','主动声纳怎么关？','我会救你','重试录像'];return this.suggestions.map(x=>x.text);}
 chooseDialogue(index:number){if(this.simplified){const text=this.dialogueChoices[index];return !!text&&this.radioSay(text);}const pick=this.suggestions[index];return !!pick&&this.radioSay(pick.text,pick.tag);}
 get harborActions(){return this.simplified&&!this.simpleFlow.legacy;}
 get mediaRetryable(){return this.simplified&&this.taskPlayer.retryable;}
 retryMedia(){const line=this.taskPlayer.retry();this.feedback(line);return line;}
 harborAction(action:string){
  if(!this.harborActions)return false;
  if(action==='retry'){this.feedback(this.taskPlayer.retry());return true;}
  if(action==='identity'){const ok=this.simpleFlow.identify();this.feedback(ok?'任务身份资料已发送':'先接听求救呼叫');return true;}
  if(action==='background'){this.radioSay('你失联很久了，总部不知道你的情况，就派了我下来。');return true;}
  if(action==='hold'){this.rescue.stopDeparture();this.simpleFlow.reportAnswered=false;this.feedback('已通知艾里亚斯留在门后等待');return true;}
  if(action==='report'){this.feedback(this.simpleFlow.reportEvidence()?'核验结果片已推送 · 艾里亚斯开始通过人员通道':'请先完成当前隔离结果与入仓录像核验，再推送');return true;}
  if(action==='repair'){
   if(this.run.arm.phase!=='stowed'||Math.abs(this.run.pilot.speed)>.05){this.feedback('先停稳并收回机械臂');return true;}
   this.simpleFlow.world.kit=this.simpleFlow.kitStored;
   if(!this.simpleFlow.finishRepair()){this.feedback('先到02岸电恢复台取出维修工具并收妥');return true;}
   this.run.hull=1;this.run.leak=0;this.run.flood=0;this.rescue.interact('power',false,true);this.run.power=1;
   this.feedback('铁鲸维修完成 · 艇况100% · 货舱控制回路恢复');return true;
  }return false;
 }
 get hint(){return this.objective;}
 private doorGuide(){
  const next=['harbor.edge.A-C','harbor.edge.C-B'].find(id=>!this.base.state.opened.includes(id)),door=next&&this.world.doors.get(next);if(!door)return '';
  if(next==='harbor.edge.C-B'&&this.position.z<32){
   const path=this.base.level.edges.find(e=>e.id==='harbor.edge.A-C')!.path!;
   const route=[...path,[18,0,35] as [number,number,number],door.bounds.getCenter(new T.Vector3()).toArray() as [number,number,number]].map(p=>new T.Vector3(...p));
   return this.guide(harborRouteLookAhead(this.position,route),'维修弯道下一段');
  }
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
 private feedback(text:string){if(this.simplified)text=text.replace(/先停止脉冲|立即停止脉冲|停止脉冲|停发主动脉冲/g,'关闭主动声纳电源').replace('屏幕可保持通电','被动声纳仍常开');this.run.pushLog(text,'system');if(this.dialogue.busy)return;this.run.storyCaption=text;this.run.storyCaptionLeft=Math.max(4,Math.min(12,text.length*.13));}
 private windowLocks=new WindowLocks();
 resetWindowFocus(){this.windowLocks.reset();}
 drawWindowLocks(ctx:CanvasRenderingContext2D,w:number,h:number){
  this.pose();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  this.windowLocks.draw(ctx,w,h,this.camera,()=>this.solids(),()=>{
   // Use the same actual mesh hit as F interaction, not overlapping proxy boxes.
   const hit=this.aimedInterface();
   const id=hit.id?.startsWith('harbor.rescue.')?hit.id:['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door)?hit.door:'';
   if(!id||hit.distance>8)return [];
   const point=this.camera.getWorldDirection(new T.Vector3()).multiplyScalar(hit.distance).add(this.position);
   return [{id,bounds:new T.Box3().setFromCenterAndSize(point,new T.Vector3(.08,.08,.08)),reach:3.4,enabled:true,verifiedDistance:hit.distance,label:HARBOR_TARGET_NAMES[id]}];
  });
 }
 private aimVisualRevision=0;
 private aimMeshes:T.Mesh[]=[];
 private aimBroadBox=new T.Box3();private aimBroadHit=new T.Vector3();
 private aimedCache:{key:number[];value:{id:string;door:string;distance:number}}|null=null;
 private aimedInterface(){
  const key=[this.run.clock,this.elapsed,this.aimVisualRevision,this.position.x,this.position.y,this.position.z,this.run.heading,this.run.pitch,this.run.camPan,this.run.camTilt,this.run.camZoom];
  if(this.aimedCache&&key.every((v,i)=>v===this.aimedCache!.key[i]))return this.aimedCache.value;
  this.pose();this.world.root.updateMatrixWorld(true);this.ray.setFromCamera(new T.Vector2(),this.camera);this.ray.far=8;
  this.aimMeshes.length=0;
  this.world.root.traverseVisible(o=>{
   if(!(o instanceof T.Mesh))return;
   accelerateHarborMesh(o);
   // Merged floor/wall meshes have huge bounding spheres. Their local AABB
   // lets Three reject rays before testing every triangle. Animated skins
   // retain their own deformation-aware bounds/raycast implementation.
   if(!(o instanceof T.SkinnedMesh)&&o.geometry.boundingBox===null)o.geometry.computeBoundingBox();
   if(o instanceof T.InstancedMesh&&o.boundingBox===null)o.computeBoundingBox();
   const bounds=o instanceof T.SkinnedMesh||o instanceof T.InstancedMesh?o.boundingBox:o.geometry.boundingBox;
   if(bounds){
    this.aimBroadBox.copy(bounds).applyMatrix4(o.matrixWorld);
    if(!this.aimBroadBox.containsPoint(this.ray.ray.origin)&&
     (!this.ray.ray.intersectBox(this.aimBroadBox,this.aimBroadHit)||this.aimBroadHit.distanceTo(this.ray.ray.origin)>this.ray.far+1e-6))return;
   }
   this.aimMeshes.push(o);
  });
  const hit=this.ray.intersectObjects(this.aimMeshes,false)[0];
  let o:T.Object3D|null=hit?.object??null,id='',door='';while(o){id=id||o.userData.interactionId;door=door||o.userData.doorId;o=o.parent;}
  const value={id,door,distance:hit?.distance??Infinity};this.aimedCache={key,value};return value;
 }
 private interactionHint(){
  if(this.facilityArm)return this.facilityArm.done?'作业完成 · 自动收回机械臂':this.run.arm.phase==='aiming'?'机械臂自动操作中 · C 取消收回':ARM_PHASE_CN[this.run.arm.phase];
  const hit=this.aimedInterface();const door=['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door);if(!door&&!hit.id?.startsWith('harbor.rescue.'))return this.objective;
  const name=door?'压力门':'设施面板';if(hit.distance>3.4)return `${name}距艇 ${hit.distance.toFixed(1)}米 · 缓慢前进至3.4米内，Shift制动后按F`;
  if(this.simplified&&!this.simpleFlow.legacy&&(door||hit.id==='harbor.rescue.observe'))return `F · ${hit.door==='harbor.edge.C-B'&&!this.base.state.opened.includes(hit.door)?'查看门控面板':'操作门控'}（${hit.distance.toFixed(1)}米）`;
  return `F · 伸出机械臂操作${name}（${hit.distance.toFixed(1)}米） · 需照明与供电`;}
 private apply(result:RescueResult){for(const line of result.events)if(!line.startsWith('艾里亚斯：'))this.feedback(line);if(result.damage){this.run.hull=Math.max(0,this.run.hull-result.damage);this.run.onShake?.(.8);this.run.onCue?.('hull.crack',.8);}}
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-this.run.pitch*Math.PI/180-this.run.camTilt,-this.run.heading*Math.PI/180-this.run.camPan,0,'YXZ');this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
 private podInCargo(){return this.position.x>72.5&&this.position.x<81.7&&this.position.z<15.3;}
 private zone():RescueZone{for(const k of ['observe','power','lure'] as const)if(this.position.distanceTo(new T.Vector3(...L[k]))<3.6)return k;return 'none';}
 private solids(){return [...this.world.colliders,...[...this.world.doors].filter(([id])=>!this.base.state.opened.includes(id)||this.elapsed-(this.openedTimes.get(id)??-99)<1.2).map(([,d])=>d.bounds),...(!this.rescue.state.gateOpen?this.visual.gate.occluders:[])];}
 private visible(target:T.Vector3,max=30){this.pose();const d=target.distanceTo(this.position),p=target.clone().project(this.camera);if(d>max||d<.1||Math.abs(p.x)>.99||Math.abs(p.y)>.99||p.z>1||p.z< -1)return false;const ray=new T.Ray(this.position,target.clone().sub(this.position).normalize());return !this.solids().filter(b=>b!==this.visual.gate.bounds).some(b=>{if(b.containsPoint(target))return false;const q=ray.intersectBox(b,new T.Vector3());return q&&q.distanceTo(this.position)<d-.3;});}
 private syncVisual(recording=false){this.aimVisualRevision++;const s=this.rescue.state;const monster=this.pursuit.position;const e=new T.Vector3(...L.elias);if(s.departing){const progress=s.departureSeconds*(s.injured?.5:1);e.x-=Math.min(1,progress/6)*4;e.z-=Math.max(0,Math.min(1,(progress-6)/4))*2.5;}
  this.visual.update({powered:s.powered,gateOpen:s.gateOpen,bridgeExtended:s.departing||s.departed,monsterPosition:monster.toArray() as [number,number,number],eliasPosition:e.toArray() as [number,number,number],monsterVisible:false,rescued:this.simplified,walking:!this.simplified&&s.departing&&!s.departed,eliasBeat:this.eliasBeat},this.elapsed);this.visual.gate.bounds.min.y=-1.25+this.visual.gate.mesh.position.y;this.visual.gate.bounds.max.y=4.25+this.visual.gate.mesh.position.y;this.world.root.updateMatrixWorld(true);}
 tick(dt:number){if(this.debugNoVideo&&!isNoVideoMode())return;dt=Number.isFinite(dt)?Math.max(0,dt):0;this.elapsed+=dt;
  if(this.facilityArm&&!this.facilityArm.done&&this.run.arm.phase==='aiming'){
   this.aimedCache=null;const hit=this.aimedInterface();
   if(!this.run.lit||!this.run.powered||this.run.shot.viewing||this.run.outcome.kind!=='alive'||hit.distance>3.4||hit.id!==this.facilityArm.id||hit.door!==this.facilityArm.door){
    this.facilityArm.done=true;this.feedback('操作条件已改变 · 取消作业并自动收臂');this.run.retractArm();
   }else this.interact();
  }
  if(this.tickPrologue(dt))return;
  if(!this.simplified&&!this.started){this.started=true;this.queue('（导航资料附带一段旧留言。）','生活区值班员周岑：这里是生活区值班室。隔离门保持关闭，后来的人请先核对管线记录。','万斯：坐标发你了，在导航台上。过气闸走维修湾那条缝——全队只有你的艇挤得进去。','万斯：缝里开声纳，不然你会亲那面墙。过了门就关——你那块电池的检修单是我签的。……签的时候我没见过电池。岸电在里面。慢点开，罗温。我盯着你的点。');}
  if(!this.simplified&&!this.entryReached&&this.navigationConsole.target&&this.navigationConsole.target.every((v,i)=>Math.abs(v-[11,0,16][i])<.1)&&this.position.distanceTo(new T.Vector3(11,0,16))<=3){this.entryReached=true;this.feedback('万斯：门就在你正前方。门框应力计三天前报过一次撞击。……不是水压。别停，慢慢靠。');}
  if(this.run.power<.1&&this.run.activeSonarEnabled&&!this.rescue.state.powered){this.run.toggleActiveSonar();this.feedback('低压保护：主动声纳自动断电，余电留给推进。被动声纳照常。'+this.powerGuide().slice(3));}
  if(this.zone()==='power'&&this.run.power<.95&&!this.run.blackout){this.run.power=1;this.feedback('岸电接上：艇载电池充满。');}
  if(this.run.power<.03&&!this.run.blackout&&this.elapsed-this.reserveAt>30){this.reserveAt=this.elapsed;this.run.power=.15;this.run.onCue?.('ui.error',.6);
   this.feedback('应急储备接入：仪表和推进保住了，余电只够开回02配电箱。'+this.powerGuide().slice(3));}
  const warned=this.rescue.state.warned,pulse=this.activeNoise,noise=Math.abs(this.run.pilot.speed)>.45||this.audibleBurstLeft>0;this.audibleBurstLeft=Math.max(0,this.audibleBurstLeft-dt);
  // Chapter one opens without a creature in the water; it arrives with the scripted hull strike.
  this.pursuit.awake=!this.simplified||this.simpleFlow.impactPlayed;
  const monsterDistance=this.position.distanceTo(this.pursuit.position),audible=this.pursuit.hears(this.position,pulse,noise);
  const personnelApproaching=this.simplified&&this.rescue.state.departing&&!this.rescue.state.departed&&!this.rescue.state.injured&&!this.rescue.state.isolated;
  const wasInside=this.pursuit.inside;
  if(personnelApproaching)this.pursuit.tickPersonnel(dt,new T.Vector3(...L.elias),this.rescue.state.gateOpen,false);
  else this.pursuit.tick(dt,this.position,pulse&&(this.simplified||warned),noise&&(this.simplified||warned),this.rescue.state.gateOpen,this.rescue.state.isolated,this.run.heading);
  if(personnelApproaching&&wasInside&&!this.pursuit.inside)this.feedback('（水听器：拖行声越过敞开的货仓闸口，转向人员门的门轴声。）可以随时叫他退回门后。');
  const nearPersonnel=personnelApproaching&&!this.pursuit.inside&&this.pursuit.position.distanceTo(new T.Vector3(...L.elias))<7;
  if(nearPersonnel&&!this.personnelNear)this.feedback('艾里亚斯：门外的刮擦声靠过来了！门还卡着——要退回去就现在叫我。');
  this.personnelNear=nearPersonnel;
  const podInCargo=this.podInCargo(),s0=this.rescue.state;
  if(s0.gateOpen&&!s0.isolated&&!s0.monsterInside&&pulse&&!podInCargo){if(!this.outsideLureWarned){this.outsideLureWarned=true;this.feedback('潜艇还在货舱外。先穿过闸口驶入03货舱内部，再开启主动脉冲诱导；在外面发声只会把它引到你身边。');}}
  else if(!pulse)this.outsideLureWarned=false;
  // Entry only counts when the pod itself drew the creature in; once inside, it stays counted while the pod withdraws.
  const monsterInside=this.pursuit.inside&&(podInCargo||s0.monsterInside);
  this.apply(this.rescue.step(dt,{chapterOne:this.simplified,revised:this.simplified&&!this.simpleFlow.legacy,personnelApproaching,npcThreat:this.npcThreat(),monsterInside,monsterDistance,nearB:this.entryReached&&this.position.x>27&&this.position.z>24,zone:this.zone(),activeSonar:audible&&(this.simplified||warned)&&(!this.simplified||this.simpleFlow.threatEnabled&&!this.taskPlayer.waiting&&!(this.simpleFlow.pending&&labPlaybackRunning(this.run)))}));if(!s0.injured&&this.rescue.state.injured){if(this.simplified){const m=this.run.narrativeMemory;m.elias='injured';m.partner='elias';m.trust=Math.max(-3,m.trust-2);const claim=m.claims.at(-1);if(claim&&claim.claim!=='danger')claim.disproved=true;this.simpleFlow.reportAnswered=false;this.feedback('艾里亚斯遇袭退回总调度室 · 伤情回传待接收，需重新隔离');}else{noteInjury(this.run.narrativeMemory);this.dialogue.interrupt(s0.gateOpen?'lure':'open',['艾里亚斯：我退回门边了。腿动不了，先把它隔开！']);}}this.navigationConsole.tick(dt);this.syncVisual();this.tickThreatBeep(dt);
  if(this.simplified){this.tickSimple(dt);if(this.photoDiag&&this.elapsed>=this.photoDiagAt){this.photoDiagAt=this.elapsed+2;this.logPhotoDiagnostic('observe');}return;}
  this.tickRadio(dt);
  const beat=this.dialogue.tick(dt,this.rescue.state,this.activeNoise);
  if(beat.line!==undefined){this.run.storyCaption=beat.line;this.run.storyCaptionLeft=beat.seconds??0;
   if(beat.line){this.run.pushLog(beat.line,'system');this.navigationConsole.recordDialogue(beat.line);this.run.onCue?.('radio.squelch',.18);
    if(!isAudioMuted()&&!beat.line.startsWith('罗温')&&!beat.line.startsWith('（')&&typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(beat.line);voice.lang='zh-CN';window.speechSynthesis.speak(voice);}
   }
  }
  for(const effect of beat.effects){if(effect==='rumble'){this.run.onCue?.('creature.skitter',.7);this.run.onShake?.(.20);this.ambienceLeft=5;}
   if(effect==='escape'&&this.rescue.confirmIsolation()){this.rescue.interact('rescue');this.syncVisual();
    }}

  if(this.dialogue.ambience&&this.dialogue.stage!=='warning'){this.ambienceLeft-=dt;if(this.ambienceLeft<=0){this.ambienceBeat++;this.ambienceLeft=5+(this.ambienceBeat%3)*2;this.run.onCue?.(this.ambienceBeat%2?'creature.skitter':'creature.breath-sync',.30);if(this.ambienceBeat%3===0){this.run.onShake?.(.16);this.run.onCue?.('hull.ping-return',.35);}}}
 }

 private tickSimple(dt=0){
  const s=this.rescue.state;
  if(!s.heard&&(this.simpleFlow.legacy||this.base.state.opened.includes('harbor.edge.A-C'))){this.rescue.step(.001,{nearB:true,zone:'none',activeSonar:false});this.rescue.listen();this.navigationConsole.heard=true;this.navigationConsole.captured=true;this.navigationConsole.clearPending();}
  this.navigationConsole.replied=this.rescue.state.replied;
  this.simpleFlow.sync({firstDoor:this.base.state.opened.includes('harbor.edge.A-C'),secondDoor:this.base.state.opened.includes('harbor.edge.C-B'),active:this.activeNoise,atExit:this.position.distanceTo(new T.Vector3(...L.observe))<=4,inCargo:this.podInCargo(),hull:this.run.hull,kit:this.simpleFlow.kitStored});
  if(this.simpleFlow.tick(dt,this.taskPlayer.waiting||!!this.simpleFlow.pending&&labPlaybackRunning(this.run))){
   if(this.simpleFlow.impactCount===1)this.pursuit.wake(this.position,this.run.heading);
   this.run.hull=Math.min(this.run.hull,this.simpleFlow.impactCount===1?.75:.5);this.run.onShake?.(.85);this.run.onCue?.('hull.crack',.9);
   this.feedback(this.simpleFlow.impactCount===1?'艇壳受到猛烈撞击！':'第二次撞击！艇体受损，完整度50% · 关闭主动声纳电源');
  }
  const firstTick=!this.started;if(firstTick)this.started=true;
  if(this.position.x>34&&this.position.z>20&&this.simpleFlow.takeImpact()){this.pursuit.wake(this.position,this.run.heading);this.run.onShake?.(.85);this.run.onCue?.('hull.crack',.9);this.feedback('（艇壳猛地一震，扶手撞上罗温的手腕。）罗温：什么东西撞上来了！');}
  this.taskPlayer.tick(this.simpleFlow.pending,this.rescue.state.injured);
  this.advanceStoryTask();
  this.dialogue.stage=s.departureConfirmed?'done':s.departed?'departure':s.departing?'escape':s.isolated?'confirm':s.lureConfirmed?'close':s.gateOpen?'lure':s.powered?'open':s.identified?'power':this.simpleFlow.canPhotograph?'photo':'contact';
  // Departure requires the player's report; waiting is a real choice.
  if(s.departed){const id='harbor.edge.C-B';const i=this.base.state.opened.indexOf(id);if(i>=0){this.base.state.opened.splice(i,1);this.run.onCue?.('hull.crack',.8);this.run.onShake?.(.4);this.feedback('退路坍塌：维修湾压力门受压闭锁。继续沿港区下潜出口离开。');}}
  const key=this.simpleFlow.objective;if(key!==this.simpleWaypoint){this.simpleWaypoint=key;
   // Coordinates are instructions only: the player writes each waypoint on the console.
   if(!firstTick&&key)this.feedback(key);
  }
 }
 /** Vance fades once the C-B door opens; Elias carries on alone if the player never answers. */
 private tickRadio(dt:number){const s=this.rescue.state;
  if(!this.vanceFading&&!s.heard&&this.base.state.opened.includes('harbor.edge.C-B')){this.vanceFading=true;this.queue('万斯：你深度读数在跳，载波也在掉——罗温？说句话，随便说句——');}
  this.tickLure();
  this.dialogue.closingLine=s.injured?'艾里亚斯：我留在值班室。生活区有个值班员叫周岑，门边有他的旧留言。去找他。':this.run.narrativeMemory.elias==='refused'?'艾里亚斯：我在这里等救援。生活区的事，你找值班员周岑。':this.story.echo('farewell-open')??this.dialogue.closingLine;
  this.dialogue.lureLine=this.story.echo('lure-line')??this.dialogue.lureLine;
  if(this.dialogue.stage==='done'&&(s.injured||this.run.narrativeMemory.elias==='refused'))this.farewellSpoken=true;
  if(this.dialogue.stage==='done'&&!this.dialogue.busy&&!this.farewellSpoken){this.farewellIdle+=dt;if(this.farewellIdle>=30){this.farewellSpoken=true;this.queue('艾里亚斯：……我就当你听见了。谢谢你。','艾里亚斯：我从里面找路下去。频道我开着……下面见。');}}
  if(this.dialogue.stage==='done'&&this.farewellSpoken&&!this.dialogue.busy&&!this.farewellTail&&(this.tailIdle+=dt)>=15){this.farewellTail=true;this.run.onCue?.('hull.ping-return',.3);
   const st=this.story.state;
   this.queue('（呼叫岸上频道，没有回音。尚未发送的记录保留在艇内。）');}
  if(!this.vanceLost&&s.signal){this.vanceLost=true;if(this.vanceFading&&this.story.state['vance.lastHeard']==='none'){const line=this.story.echo('vance-fade-line');if(line)this.queue(line);}this.run.pushLog('万斯的载波断开，频道里只剩底噪。','system');}
  if(this.dialogue.stage==='contact'&&s.heard&&!this.dialogue.busy){this.contactIdle+=dt;
   if(!this.contactNudged&&this.contactIdle>=CONTACT_NUDGE){this.contactNudged=true;this.queue('艾里亚斯：……有人吗？听得见就按住麦克风，回答我。');}
   else if(this.contactIdle>=CONTACT_SILENT&&this.dialogue.exchange('',['艾里亚斯：……我就当你听得见。'],true,this.activeNoise)){this.rescue.reply();this.navigationConsole.replied=true;}
  }
 }
 /** Whispered running commentary during the lure; Elias hears the creature move, never sees the pod's film. */
 private tickLure(){const s=this.rescue.state;
  if(this.dialogue.stage==='close'&&!s.isolated&&!this.closeWarned&&!this.dialogue.busy&&Math.abs(this.run.pilot.speed)>.45){this.closeWarned=true;this.run.onCue?.('creature.skitter',.6);this.queue('艾里亚斯：你推进器在叫。……停一下。','','（四秒。水听器里，刮擦挪开了。）');}
  if(this.dialogue.stage==='close')this.lureBeat=0;
  if(this.dialogue.stage!=='lure'||s.lureConfirmed||this.dialogue.busy)return;
  const d=this.position.distanceTo(this.pursuit.position),inside=this.pursuit.inside;
  if(this.lureBeat===0&&this.podInCargo()&&this.activeNoise){this.lureBeat++;this.queue('艾里亚斯：刮声没了。……它不在我这儿了。那它在哪儿？');}
  else if(this.lureBeat===2&&!this.scrapeAnswered&&this.elapsed-this.scrapeAt>8){this.scrapeAnswered=true;this.queue('（接收机：一声短促的高音咔。……很久。）','（……咔。咔。）');}
  else if(this.lureBeat===1&&(d<6||inside)){this.lureBeat++;this.scrapeAt=this.elapsed;this.run.onCue?.('creature.skitter',.9);this.run.onShake?.(.35);this.queue('（艇壳外侧一道长长的刮擦，从艇尾拖到艇首。频道里没有呼吸声。）');}
 }
 move(d:number){return this.base.move(d);}turn(d:number){return this.base.turn(d);}moveVertical(d:number){return this.base.moveVertical(d);}
 sonarPulse(_power:0|1|2){} // Emissions, not screen power, attract the creature.
 private closeDoorPanel:(()=>void)|null=null;
 private doorCodeApproved=false;
 private facilityArm:{id:string;door:string;done:boolean;approved:boolean}|null=null;
 interact(){
  if(this.run.prologue?.active&&this.run.prologue.step<11){this.feedback('万斯：先完成航前检查，再操作压力门。');return;}
  if(document.getElementById('harbor-door-panel'))return;
  const arm=this.run.arm;
  if(this.facilityArm?.done&&arm.phase==='aiming'){this.run.retractArm();return;}
  if(['extending','gripping','hauling','jammed','gone'].includes(arm.phase)){this.feedback(ARM_PHASE_CN[arm.phase]);return;}
  if(this.run.shot.viewing||this.run.outcome.kind!=='alive'){this.feedback('请切回实时镜头，确认潜艇可操作。');return;}
  if(this.run.driveBlock&&arm.phase!=='aiming'){this.feedback(this.run.driveBlock);return;}
  if(!this.run.lit||!this.run.powered){this.feedback('请开启照明并恢复液压供电，再操作机械臂。');return;}
  this.aimedCache=null;const hit=this.aimedInterface();
  if(hit.distance>3.4){this.feedback('机械臂未够到目标 · 对准表面并靠近至3.4米内');return;}
  const facility=hit.id?.startsWith('harbor.rescue.')||['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door);
  if(!facility){
   if(this.facilityArm){this.feedback('目标已改变，请按 C 收臂后重新锁定。');return;}
   const item=this.base.level.items.find(i=>i.id===hit.id);
   if(item&&(item.kind==='cache'||item.kind==='pickup')){this.base.interact();return;}
   this.feedback('未对准可操作的门、箱子或设施。');return;
  }
  if(this.simplified&&!this.simpleFlow.legacy&&arm.phase==='stowed'&&(hit.door==='harbor.edge.A-C'||hit.door==='harbor.edge.C-B'||hit.id==='harbor.rescue.observe')){
   this.run.pilot.stop();this.run.navDriveEngaged=false;
   if(hit.door==='harbor.edge.C-B'&&!this.base.state.opened.includes(hit.door)){
    // The player tries the lock first; only then does Elias send the code.
    if(!this.simpleFlow.credential){const first=!this.simpleFlow.codeRequested;this.simpleFlow.requestCode();this.closeDoorPanel=showHarborDoorPanel({locked:true,onClose:()=>{this.closeDoorPanel=null;if(first)this.feedback('门控请求已转发总调度室 · 等待艾里亚斯回应');}});return;}
    this.closeDoorPanel=showHarborDoorPanel({onClose:()=>{this.closeDoorPanel=null;},submit:code=>{
     this.aimedCache=null;const now=this.aimedInterface();
     if(this.run.outcome.kind!=='alive'||!this.run.lit||!this.run.powered||this.run.blackout||this.run.shot.viewing||this.run.arm.phase!=='stowed'||now.door!==hit.door||now.distance>3.4)return '连接中断：请关闭面板，恢复供电并重新靠近门锁。';
     if(!this.simpleFlow.credential||this.rescue.state.departed)return '门禁授权已不可用。';
     if(code!==HARBOR_DOOR_CODE)return '密码不匹配 · 核对艾里亚斯的视频后重新拨号';
     this.startFacilityArm(hit,true);
     return null;
    }});return;
   }
  }
  if(arm.phase==='stowed'){
   this.startFacilityArm(hit);return;
  }
  if(!this.facilityArm||hit.id!==this.facilityArm.id||hit.door!==this.facilityArm.door){this.feedback('目标已改变，操作取消。');this.run.retractArm();return;}
  beginGrip(arm,'harbor.facility.operation');this.run.addNoise(.1);this.run.onCue?.('arm.claw-wet',.8);
  this.feedback('机械爪正在操作，请等待动作完成。');
 }
 private startFacilityArm(hit:{id:string;door:string;distance:number},approved=false){
  this.facilityArm={id:hit.id,door:hit.door,done:false,approved};
  this.base.setExternalArmAnchor(this.ray.ray.at(hit.distance,new T.Vector3()));
  this.run.pilot.stop();this.run.navDriveEngaged=false;beginExtend(this.run.arm);
  this.run.power=Math.max(0,this.run.power-.01);this.run.addNoise(.2);this.run.onCue?.('arm.pump-start',.85);
  this.feedback('机械臂自动作业：伸出 → 操作 → 收回 · C 可取消');
 }
 armEvent(kind:'grip'|'stowed',id?:string){
  if(!this.facilityArm)return this.base.armEvent(kind,id);
  if(kind==='stowed'){if(this.kitPending){this.kitPending=false;this.simpleFlow.kitStored=true;this.feedback('维修工具已收妥 · 到分析台通讯页执行修复铁鲸');}this.facilityArm=null;this.base.setExternalArmAnchor(null);return true;}
  if(id!=='harbor.facility.operation')return false;
  if(this.facilityArm.done)return true;
  this.aimedCache=null;const hit=this.aimedInterface();
  this.facilityArm.done=true;
  if(!this.run.lit||!this.run.powered||hit.distance>3.4||hit.id!==this.facilityArm.id||hit.door!==this.facilityArm.door){this.feedback('操作中断，未改变设施状态 · 自动收臂');this.run.retractArm();return true;}
  this.doorCodeApproved=this.facilityArm.approved;
  try{this.commitFacility();}finally{this.doorCodeApproved=false;this.run.retractArm();}
  return true;
 }
 private commitFacility(){
  if(this.debugNoVideo&&!isNoVideoMode()){this.feedback('诊断进度暂停，恢复GM无视频模式后继续。');return;}
  this.aimedCache=null; // An actual F action always confirms current triangle occlusion.
  let {id,door,distance}=this.aimedInterface();
  if(distance>3.4){this.feedback((door||id?.startsWith('harbor.rescue.'))?this.interactionHint():'这里没有可操作的设施。'+this.objective);return;}
  if(id?.startsWith('harbor.rescue.')){
   // Repair tools come out of the existing 02 shore-power station; no separate crate in the scene.
   if(id==='harbor.rescue.power'&&this.simplified&&!this.simpleFlow.legacy&&this.simpleFlow.repairBriefSeen&&!this.simpleFlow.repairCompleted&&!this.simpleFlow.kitStored){
    this.kitPending=true;this.run.power=1;this.run.blackout=false;this.feedback('已从岸电恢复台取出维修工具 · 自动收回，收妥后入库');return;
   }
   let zone=id.slice('harbor.rescue.'.length) as RescueZone;const s=this.rescue.state,stage=this.dialogue.stage;
   if(this.simplified&&zone==='observe'&&!s.departureConfirmed){
    if(!this.simpleFlow.canHelp){this.feedback('先听完艾里亚斯的背景与货仓诱导录像。');return;}
    if(s.gateOpen&&!(this.simpleFlow.legacy?this.simpleFlow.entryAnalyzed:this.simpleFlow.entryCaptured)){this.feedback('先在03停稳拍清怪物完整入仓，再退出货舱落闸；显影期间可以撤离。');return;}
   }
   if(this.simplified&&!this.simpleFlow.legacy&&zone==='observe'&&s.isolated&&!s.departureConfirmed){this.rescue.reopenCargo();this.feedback('货舱闸门重新打开 · 隔离失效，艾里亚斯尚不知情');this.syncVisual();return;}
   if(zone==='lure'){this.feedback('货舱开关统一在01面板。');return;}
   if(zone==='observe'&&s.departureConfirmed)zone='exit';
   // Facilities answer to their physical preconditions only; the quest stage merely decides whether the dialogue already explains the result.
   const expected=zone==='power'?stage==='power':zone==='observe'?s.gateOpen?stage==='close':stage==='open'||stage==='lure':zone==='exit'?stage==='done':false;
   const before=JSON.stringify(s),operation=this.rescue.interact(zone,this.activeNoise,this.simplified),after=this.rescue.state,changed=before!==JSON.stringify(after);
   const charged=zone==='power'&&!after.powered&&this.run.power<.95;
   if(zone==='power'){this.run.power=1;this.run.blackout=false;}
   if(charged)this.feedback('岸电接上：艇载电池充满。货仓那一路还锁着——'+operation.events.join(' '));
   else if(operation.events.length&&(!changed||!expected||this.dialogue.busy))this.feedback(operation.events.join(' '));
   else if(!changed&&!operation.events.length)this.feedback('该设施当前没有可执行的操作。');
   if(zone==='power'&&after.powered)this.run.vitals.restore({oxygen:this.run.vitals.vitals.oxygenMax-this.run.vitals.vitals.oxygen});
   this.syncVisual();return;
  }
  if(this.run.blackout){this.feedback('艇内总闸断开。到分析台点「恢复总闸」，再回来开门。');return;}
  if(this.simplified&&this.rescue.state.departed&&door==='harbor.edge.C-B'){this.feedback('坍塌压住了回港压力门，不能重开。回01确认下潜。');return;}
  if(this.simplified&&door==='harbor.edge.C-B'&&!this.simpleFlow.credential){this.feedback('第二道门尚未授权 · 接听艾里亚斯并回应求救，接收门禁资料');return;}
  if(this.simplified&&!this.simpleFlow.legacy&&door==='harbor.edge.C-B'&&!this.base.state.opened.includes(door)&&!this.doorCodeApproved){this.feedback('请通过门控面板核对密码并开门。');return;}
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
  else if(!s.replied||!(this.simplified?this.simpleFlow.canPhotograph:this.dialogue.photoUnlocked))reason='先听完艾里亚斯的拍摄指引，等待右上角生成拍摄任务。';
  else if(this.simplified&&s.departed)reason='撤离由艾里亚斯的安全区任务视频确认，无需拍摄人员通道。';
  else if(kind==='lure'){if(!this.podInCargo())reason='潜艇不在03货舱内部，驶入仓内再诱导拍摄。';else if(!this.pursuit.inside)reason='声纳红点尚未进入货仓。';}
  else if(kind==='gate'){if(Math.abs(this.visual.gate.mesh.position.y)>=.08)reason='闸门仍在移动，等待完全关闭。';}
  else if(!atObserve)reason=`请驶回01拍摄位 ${formatCoords(L.observe)} 附近（${PHOTO_STATION_RADIUS}米内）再曝光。`;
  if(this.simplified&&!reason&&kind==='gate'&&!this.visible(new T.Vector3(...L.gate),40))reason='关闭的闸门必须与仓内生物同时进入镜头。';
  if(this.simplified&&!reason){
   if(!this.run.lit)reason='照明不足：开启探照灯后再取景。';
   else {const target=this.pursuit.position.clone().add(new T.Vector3(0,.8,0));
    if(!this.visible(target,40)){
     const d=target.distanceTo(this.position),p=target.clone().project(this.camera);
     reason=d>40||d<.1?'目标超出摄影有效范围。':Math.abs(p.x)>.99||Math.abs(p.y)>.99||p.z>1||p.z< -1
      ?'目标已出画：参考被动方位转向，调整俯仰再拍摄。':'视线被结构遮挡：移动取景位置后再拍摄。';
    }
   }
  }
  this.syncVisual();
  return {kind,ready:!reason,text:reason||'取景可拍摄 · 曝光后分析新片',detail:`曝光镜头 ${yaw.toFixed(0)}° / 俯仰 ${pitch.toFixed(0)}°`,position:this.position.toArray()};
 }
 prepareCapture(){if(this.debugNoVideo&&!isNoVideoMode())return {ok:false,message:'此局含诊断进度：恢复GM无视频模式，或新开正式游戏。'};if(this.run.power<.1)return {ok:false,message:'电量不足以曝光（快门和探照灯要吃一格电）。先回02配电箱补电'+this.powerGuide()};
  return {ok:true,message:'开始曝光；当前镜头记录实际视野，证据有效性在分析台核验。'};}
 finishCapture(){if(this.previousOptics){[this.run.camPan,this.run.camTilt,this.run.camZoom]=this.previousOptics;this.previousOptics=null;}}
 videoContext(){
  const s=this.rescue.state,a=this.photoAssessment();
  const monsterVisible=this.visible(this.pursuit.position.clone().add(new T.Vector3(0,.8,0)),40);
  const humanVisible=!this.simplified&&this.visible(this.visual.elias.position.clone().add(new T.Vector3(0,1,0)),40);
  const story=a.ready&&((this.simplified&&monsterVisible)||humanVisible||a.kind==='gate'&&this.visible(new T.Vector3(...L.gate),40)||a.kind==='lure'&&monsterVisible);
  return {generatedMonsters:true,story,settled:story&&(s.departed?!s.departureConfirmed:s.isolated&&!s.verified&&!s.departing),prefetchKey:JSON.stringify([s.epoch,s.isolated,s.departed,s.injured,this.run.narrativeMemory]),stateKey:JSON.stringify([s.epoch,s.isolated,s.departed,s.injured,this.run.narrativeMemory,s.powered,s.gateOpen,this.visual.gate.mesh.position.y,this.base.state.opened,monsterVisible?this.pursuit.position.toArray():null,this.visual.elias.position.toArray()]),nearestMonster:this.position.distanceTo(this.pursuit.position),
   scene:'Fully submerged deep-sea industrial harbor in dark water, no air or water surface; broken partition bridge and cargo isolation grille. Preserve the current camera image.',
   actors:humanVisible?['Elias: adult human survivor in the exact work diving gear shown in the first frame; '+(s.injured?'injured, supporting his leg, alive':'alive, uninjured')]:[],
   monsters:monsterVisible?[videoCreatureSubject('harbor','Harbor creature, exactly one individual')]:[],
   outcome:s.monsterInside&&!s.isolated?'The creature is already inside the cargo enclosure. Show only slow movement within it; do not exit, cross the gate, attack or invent a new event.':s.departed?'Elias has reached the inner safe room.':s.isolated?'Cargo gate already closed; creature remains confined.':s.injured?'Elias is already injured and has retreated; do not replay the attack.':'Record only the present positions; no predicted escape or attack.'};
 }
 private logPhotoDiagnostic(event:'observe'|'exposure'){
  if(!this.photoDiag)return;
  try{
   const assessment=this.photoAssessment(),target=this.pursuit.position.clone().add(new T.Vector3(0,.8,0));this.pose();
   const delta=target.clone().sub(this.position),distance=delta.length(),projected=target.clone().project(this.camera);
   const ray=new T.Ray(this.position,delta.clone().normalize());
   const blockers=this.solids().filter(b=>b!==this.visual.gate.bounds&&!b.containsPoint(target)).flatMap(b=>{
    const hit=ray.intersectBox(b,new T.Vector3());return hit&&hit.distanceTo(this.position)<distance-.3?[{min:b.min.toArray(),max:b.max.toArray(),distance:hit.distanceTo(this.position)}]:[];
   }).sort((a,b)=>a.distance-b.distance);
   const yaw=this.run.heading+this.run.camPan*180/Math.PI,azimuth=Math.atan2(delta.x,-delta.z)*180/Math.PI;
   console.info('[harbor-photo-diag] '+JSON.stringify({event,elapsed:this.elapsed,sequence:this.sequence,assessment,
    light:{lamp:this.run.lamp,lit:this.run.lit,powered:this.run.powered},activeSonar:this.run.activeSonarEnabled,
    camera:{position:this.position.toArray(),heading:this.run.heading,yaw,pitch:this.run.pitch+this.run.camTilt*180/Math.PI,zoom:this.run.camZoom,fov:this.camera.fov,aspect:this.camera.aspect},
    creature:{position:this.pursuit.position.toArray(),visualPosition:this.visual.monster.position.toArray(),target:target.toArray(),inside:this.pursuit.inside,relativeBearing:((azimuth-yaw+540)%360)-180},
    visibility:{distance,projected:projected.toArray(),outsideX:Math.abs(projected.x)>.99,outsideY:Math.abs(projected.y)>.99,outsideDepth:projected.z>1||projected.z< -1,outsideRange:distance>40||distance<.1,blockers:blockers.slice(0,3)},
    facts:{monsterInside:this.rescue.state.monsterInside,gateOpen:this.rescue.state.gateOpen,canPhotograph:this.simpleFlow.canPhotograph}}));
  }catch{ /* Diagnostics must never prevent simulation or exposure. */ }
 }
 captureEvidence(){const a=this.photoAssessment(),beat=this.performance();this.logPhotoDiagnostic('exposure');return this.rescue.capture('rescue-'+(++this.sequence),a.kind,a.ready,`${a.detail}；艇位 ${a.position.map(v=>v.toFixed(1)).join(' / ')}。${a.text}`+(beat.zh?`${PERFORMANCE}${beat.zh}`:''),this.elapsed,this.visible(this.pursuit.position.clone().add(new T.Vector3(0,.8,0)),40));}
 commitEvidence(value:unknown){this.rescue.commitCapture(value as RescueEvidence);}
 evidenceStatus(value:unknown){const task=(value as {harborTask?:HarborTaskId}|undefined)?.harborTask;if(task)return {accepted:this.simpleFlow.accepted.includes(task),next:this.objective};const e=value as RescueEvidence|undefined;return {accepted:!!e&&this.rescue.state.analyzed.includes(e.id)&&(e.kind!=='lure'||this.rescue.state.isolated||e.epoch===this.rescue.state.epoch&&this.rescue.state.lureConfirmed),next:this.objective};}
 analyzeEvidence(value:unknown){
  if(this.debugNoVideo&&!isNoVideoMode())return ['诊断进度不能转为正式证据；请新开正式游戏。'];
  if(this.simplified){const v=value as {capture:{harborTask?:HarborTaskId;generated?:boolean};media:{playable:boolean;source?:string;mediaId?:string}};
   if(v?.capture?.harborTask){const id=v.capture.harborTask,tape=this.run.tapes.find(t=>t.id===v.media?.mediaId);
    if(this.simpleFlow.accepted.includes(id))return ['剧情任务录像无需核验；收到后已自动登记。','艾里亚斯：'+HARBOR_TASKS[id].line];
    if(!v.media?.playable||!tape||!isHarborTaskMedia(tape,id)||isHarborOpening(tape)&&!harborOpeningFinished(tape)||!this.simpleFlow.accept(id))return ['任务视频无效、尚未到该阶段或已经核验；未改变进度。'];
    this.navigationConsole.replied=this.rescue.state.replied;const t=HARBOR_TASKS[id];this.navigationConsole.recordDialogue('艾里亚斯：'+t.line);this.feedback('艾里亚斯：'+t.line);return ['艾里亚斯：'+t.line,this.simpleFlow.objective];
   }
   if(v?.media?.source!=='generated-video')return ['首关正式摄影需要已生成的可播放录像；本地帧或GM描述不授予通关证据。'];
  }
  const v=value as {capture:RescueEvidence;media:{playable:boolean}};if(!v?.capture||!v.media?.playable)return ['没有可播放的摄影证据，请重新曝光。'];
  const analysis=this.rescue.analyze(v.capture);const accepted=this.rescue.state.analyzed.includes(v.capture.id);
  const [diagnostic,figure]=(v.capture.diagnostic??'').split(PERFORMANCE);
  if(!accepted)this.feedback(diagnostic||'本卷未覆盖当前目标，或现场已经改变。请重新取景曝光。');
  if(this.simplified&&accepted&&v.capture.kind==='lure')this.feedback('公司调查附件已留存在艇内录像档案；上行通信未恢复，尚无公司物种鉴定回执。');
  return [accepted?'核验结果：本卷证据有效。':'核验结果：本卷未取得有效目标证据。',...analysis.events,...(figure?['画面人物：'+figure]:[])];
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,recording=false){
  // Multiple cockpit monitors share one live optical circuit within a single
  // synchronous frame. Never reuse photographic frames or across event turns.
  const key=JSON.stringify([time,w,h,this.position.toArray(),this.run.heading,this.run.pitch,this.run.camPan,this.run.camTilt,this.run.camZoom,this.run.lit,this.rescue.state,this.run.arm]);
  if(!recording&&key===this.liveFrameKey&&this.liveFrameRevision===this.aimVisualRevision){this.base.copyRenderedFrame(ctx,w,h);return;}
  this.liveFrameKey='';
  this.syncVisual(recording);
  try {this.base.draw(ctx,w,h,time,recording);} finally {this.syncVisual(false); }
  if(!recording){this.liveFrameKey=key;this.liveFrameRevision=this.aimVisualRevision;queueMicrotask(()=>{this.liveFrameKey='';});}
 }
 private trackedThreat=false;
 private get activeNoise(){return this.simplified?this.run.powered&&this.run.activeSonarEnabled:this.run.sonarEmitting;}
 private detectedThreatDistance(){
  if(this.simplified){const target=this.pursuit.position,d=target.distanceTo(this.position);if(!this.pursuit.awake||!this.activeNoise||d>24||d<.1)return null;const ray=new T.Ray(this.position,target.clone().sub(this.position).normalize());return this.solids().some(b=>{if(b.containsPoint(target))return false;const hit=ray.intersectBox(b,new T.Vector3());return hit&&hit.distanceTo(this.position)<d-.2;})?null:d;}
  if(!this.rescue.state.warned||this.rescue.state.failed){this.trackedThreat=false;return null;}
  const d=Math.hypot(this.visual.monster.position.x-this.position.x,this.visual.monster.position.z-this.position.z);
  if(d>24){this.trackedThreat=false;return null;}
  if(this.activeNoise)this.trackedThreat=true;
  return this.trackedThreat?d:null;
 }
 private tickThreatBeep(dt:number){
  const d=this.detectedThreatDistance();if(d===null||!this.activeNoise){this.threatBeepLeft=0;return;}
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
  ctx.drawImage(this.sonarEcho,0,0);this.drawThreat(ctx,w,h,time,dedicated);ctx.save();ctx.fillStyle='#dfc98d';ctx.font='12px sans-serif';ctx.fillText(this.echoSweep<0?'开启脉冲获取回波':this.activeNoise?'主动声纳通电 · 持续发声':'历史回波 · 主动声纳断电',8,h-8);ctx.restore();
 }
 get sonarReadout(){return this.echoSweep<0?undefined:this.base.sonarReadout;}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.navigationConsole.draw(ctx,w,h);}
 snapshot(){return {...this.base.snapshot(),prologue:this.run.prologue?.snapshot(),debugNoVideo:this.debugNoVideo,simpleFlow:this.simplified?this.simpleFlow.snapshot():undefined,adapter:'harbor-rescue',adapterVersion:1,narrative:structuredClone(this.run.narrativeMemory),heading:this.run.heading,rescue:this.rescue.snapshot(),navigation:this.navigationConsole.snapshot(),sonarDesk:structuredClone(sonarDeskState(this.run)),entryReached:this.entryReached,elapsed:this.elapsed,sequence:this.sequence,dialogue:this.dialogue.snapshot(),story:this.story.snapshot(),radio:{vanceFading:this.vanceFading,vanceLost:this.vanceLost},ambienceLeft:this.ambienceLeft,ambienceBeat:this.ambienceBeat,pursuit:this.pursuit.snapshot()};}
 restore(value:unknown){if(value&&typeof value==='object'&&'survey' in value&&(value as {survey?:unknown}).survey!==undefined)return false;const s=value as ReturnType<HarborRescueSite['snapshot']>;if(!s||(s.debugNoVideo!==undefined&&typeof s.debugNoVideo!=='boolean')||(s.debugNoVideo&&!isNoVideoMode())||s.adapter!=='harbor-rescue'||s.adapterVersion!==1||!s.navigation||!s.sonarDesk||!Number.isFinite(s.elapsed)||!Number.isInteger(s.sequence)||s.sequence<0||s.elapsed<0||!Number.isFinite(s.heading)||typeof s.entryReached!=='boolean')return false;if(s.narrative!==undefined&&!validNarrative(s.narrative))return false;const check=new HarborRescue();if(!check.restore(s.rescue))return false;if(!HarborRescueNavigation.validateSnapshot(s.navigation)||s.navigation.heard!==s.rescue.heard||s.navigation.replied!==s.rescue.replied)return false;const d=s.sonarDesk;if(!Array.isArray(d.fields)||d.fields.length!==3||!d.fields.every(x=>typeof x==='string')||!Array.isArray(d.records)||!Number.isFinite(d.frequency)||d.frequency<35||d.frequency>45||!Number.isInteger(d.axis)||d.axis<0||d.axis>2||!['home','result','history'].includes(d.page)||typeof d.message!=='string'||(d.target!==null&&(!Array.isArray(d.target)||d.target.length!==3||!d.target.every(Number.isFinite)))||d.records.some(r=>!r||typeof r.text!=='string'||typeof r.kind!=='string'||!Number.isFinite(r.frequency)||(r.recording!==undefined&&typeof r.recording!=='string'))||(d.selected!==undefined&&(!Number.isInteger(d.selected)||d.selected<0||d.selected>=Math.max(d.records.length,s.navigation.radioRecords?.length??0))))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||!harborHullClear(new T.Vector3(...s.position),s.heading,this.world.walkable,[...this.world.colliders.filter(b=>b!==this.visual.gate.bounds),...(s.rescue.gateOpen?[]:[this.visual.gate.bounds.clone().set(new T.Vector3(72.3,-1.25,15.7),new T.Vector3(81.7,4.25,16.3))]),...[...this.world.doors].filter(([id])=>!s.state?.opened?.includes(id)).map(([,door])=>door.bounds)]))return false;
  if(s.pursuit!==undefined&&!new HarborPursuit().restore(s.pursuit))return false;
  const conversation=new HarborRescueDialogue();if(s.dialogue!==undefined&&!conversation.restore(s.dialogue))return false;
  const story=new StoryRuntime(level01);if(s.story!==undefined&&!story.restore(s.story))return false;
  if(s.radio!==undefined&&(typeof s.radio?.vanceFading!=='boolean'||typeof s.radio?.vanceLost!=='boolean'))return false;
  const simple=new HarborSimpleFlow(check);if(s.simpleFlow!==undefined&&!simple.restore(s.simpleFlow))return false;
  if(s.prologue!==undefined&&!Prologue.valid(s.prologue))return false;
  if(!this.base.restore(s))return false;
  this.run.prologue=s.prologue?new Prologue():null;if(s.prologue)this.run.prologue!.restore(s.prologue);this.prologueAnnounced=-1;this.debugNoVideo=!!s.debugNoVideo;if(this.debugNoVideo)this.run.gmLevelSession=true;this.rescue.restore(s.rescue);this.simplified=s.simpleFlow!==undefined;if(s.simpleFlow)this.simpleFlow.restore(s.simpleFlow);if(s.pursuit)this.pursuit.restore(s.pursuit);else if(s.rescue.monsterInside)this.pursuit.position.set(...L.cargo);this.navigationConsole.restore(s.navigation);Object.assign(sonarDeskState(this.run),structuredClone(d));this.entryReached=s.entryReached;this.elapsed=s.elapsed;this.sequence=s.sequence;
  if(s.dialogue)this.dialogue.restore(s.dialogue);else {this.dialogue.migrate(s.rescue);this.navigationConsole.clearPending();}
  if(s.story)this.story.restore(s.story);this.run.narrativeMemory=s.narrative?structuredClone(s.narrative):freshNarrative();
  this.vanceLost=s.radio?.vanceLost??s.rescue.heard;this.vanceFading=s.radio?.vanceFading??this.vanceLost;this.contactIdle=0;this.contactNudged=false;
  if(this.navigationConsole.target?.every((v,i)=>v===[78,0,26][i])){
   this.navigationConsole.setWaypoint(L.lure);const desk=sonarDeskState(this.run);desk.target=[...L.lure];desk.fields=coordFields(L.lure);
  }
  this.ambienceLeft=Number.isFinite(s.ambienceLeft)?Math.max(0,s.ambienceLeft):4;this.ambienceBeat=Number.isInteger(s.ambienceBeat)?Math.max(0,s.ambienceBeat):0;
  this.run.storyCaption=this.dialogue.currentLine;this.run.storyCaptionLeft=this.dialogue.currentSeconds;this.started=true;this.pursuit.awake=!this.simplified||this.simpleFlow.impactPlayed;this.syncVisual();return true;}
 dispose(){this.run.prologue=null;this.closeDoorPanel?.();this.taskPlayer.dispose();if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();this.visual.dispose();this.base.dispose();this.materials.dispose();this.referenceMaterials.dispose();}
}
