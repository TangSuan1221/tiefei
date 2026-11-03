import {livingStory,livingLine,partnerName} from '../../sim/living-story';
import {validNarrative,freshNarrative,paySeed,receiveSafetyEvidence,type NarrativeMemory} from '../../sim/narrative-memory';
import type {RescueEvidence} from '../../sim/harbor-rescue';
import * as T from 'three';
import {isAudioMuted} from '../../../audio/mute';
import type {PodRun} from '../../sim/run';
import type {AuthoredSite} from '../../sim/authored-site';
import {LivingDeck,type LivingEvidence,type LivingResult,type LivingState,type RemoteTape,type ValveKey} from '../../sim/living-deck';
import {LivingCreatures,livingDoorRoute,livingSpaceAt,type CreatureResult} from '../../sim/living-creatures';
import {LivingDialogue} from '../../sim/living-dialogue';
import {ALEX_MARKS,LIVING_SURVEY_EXIT_Y,LIVING_ITEMS,LIVING_LIGHTS,LIVING_SPACES,LIVING_SPAWN,type CreatureType,type LivingItem,type Vec3} from '../../content/living-deck-layout';
import {createLivingWorld,type LivingWorld,type LivingWorldState} from './living-world';
import {LivingNavigation} from './living-navigation';
import {sharedExpeditionRenderer} from './pod-expedition';
import {createLivingRender,type LivingRender} from './living-render';
import {createSalvageArm} from './salvage-arm';
import {harborHullClear,sweepHarborHeading} from '../../sim/harbor-navigation';
import {beginExtend,beginGrip,ARM_PHASE_CN,armOut} from '../../sim/manipulator';
import {scanNavigationSonar,sonarRay,sonarEchoAlpha,SONAR_RANGE,SONAR_STATIC,SONAR_THREAT} from '../../sim/navigation-sonar';
import {drawSonarSweep} from '../sonar-sweep';
import {WindowLocks} from '../window-locks';
import {sonarMapContours} from '../../sim/sonar-map';
import {drawSonarOwnship,sonarHeading} from '../sonar-ownship';
import {sonarDeskState} from '../sonar-desk';
import {layoutCJK} from '@/ui/typography';
import {formatCoords} from '../../sim/site-coords';
import {LivingSurvey,type SurveyCapture} from '../../sim/living-survey';
import {LivingTaskPlayer} from './living-task-player';
import {LIVING_TASKS,livingTaskLine,type LivingTaskId} from '../../content/living-task-videos';
import {isNoVideoMode} from '../gm';
import {hasRemotePlaylist} from '../footage';

/** Surface depth of deck −1 world y=0. GAP: provisional, not yet fixed in level-metrics. */
export const LIVING_DATUM_DEPTH=1040;
const LOCAL_TAPE_NAME='-1层生活区 · 本机摄像';
const LAMP_RANGE=26,LAMP_HALF_ANGLE=.72,REACH=3.4,UPLINK_REACH=14;
const END_TEXT='第二章完成 · 操作台按 B 进入-2层研究所';
const ITEMS=new Map(LIVING_ITEMS.map(i=>[i.id,i]));
const WAYPOINT={security:[72,0,-52],glass:[137.5,0,17],valve:[130,0,-29],office:[162,0,96],gate:[188,-1.2,52],shaft:[98,0,68],ballast:[112,0,32.5]} satisfies Record<string,Vec3>;
const STAGE_WAYPOINT:Partial<Record<LivingState['stage'],Vec3>>={explore:WAYPOINT.security,glass:WAYPOINT.glass,valve:WAYPOINT.valve,atrium:WAYPOINT.office,code:WAYPOINT.office,uplink:WAYPOINT.gate,met:WAYPOINT.shaft,exit:WAYPOINT.shaft};
/** Alex's post after gate F opens: inside the leaf line (z 42) on the human-scale N side, lit by the gate lamp. */
const GATE_POST:Vec3=[187.2,-1.9,40.8];
const VALVE_ITEM:Record<ValveKey,string>={heat:'living.valve.heat',feed:'living.valve.feed',cool:'living.valve.cool'};
const VALVE_COLOR:Record<ValveKey,string>={heat:'#b8322a',feed:'#d4a21c',cool:'#2f6fb4'};
const CUE:Record<string,[string,number]>={'valve.clank':['valve.turn',1],'probe.launch':['arm.pump-start',.7],'tape.arrive':['radio.squelch',.6],'tape.push':['terminal.beep',.6],'gate.open':['valve.turn',.8],'arm.stow':['arm.stow',.7]};
/** Fallback probe framings, used only when the world does not author `probeShots`. */
const FALLBACK_SHOTS:Record<string,{position:Vec3;target:Vec3;fov:number}>={
 'alex-glass':{position:[147.3,-1.5,6.4],target:[145.5,-1.7,6],fov:62},
 'pipe-bands':{position:[163.2,-1.3,-11],target:[170,-1.6,-9],fov:60},
 'slime-wall':{position:[163.4,-1.4,-8],target:[171,-1.8,-8],fov:62},
 'cocoon':{position:[167,-1.5,-12.4],target:[170,-2.4,-14],fov:58},
 'slime-floor':{position:[164.5,-1,-8],target:[170,-2.9,-8],fov:64},
 'gate-inner':{position:[188,-1.5,36.8],target:[188,-1.6,42],fov:62},
 'security-console':{position:[74.5,-.4,-58],target:[76,-1.2,-61.5],fov:60},
};
/**
 * Probe framings that take precedence over the world's: the valve choice rests on reading the red / yellow / blue
 * bands (M east wall, x 175.45, y +.25 / −.15 / −.55) and the gel sleeve on the yellow line, which the slime haze
 * swallows beyond ~5 m.
 */
const SITE_SHOTS:Record<string,{position:Vec3;target:Vec3;fov:number}>={
 'pipe-bands':{position:[173.5,-.15,-9],target:[175.45,-.25,-15],fov:50},
 'slime-wall':{position:[174.1,-.75,-10.2],target:[175.4,-.2,-15.2],fov:48},
};
/** Deck −1 film frames: 16:9 so the expanded lab panel fills the CRT body. */
const SENSOR={width:1280,height:720};
/** Lab large-frame playback (stations.ts): a 720-high frame is shown ≈496 CRT px high. */
const LAB_DISPLAY_SCALE=496/720;
const MIN_FILL=.08,MIN_TEXT_PX=12,MIN_FIGURE=.2;
/**
 * What a valid frame of each evidence target must show. `nodes` are world/GLB object names unioned with the item
 * bounds; `text` is the key line's glyph height (m) and facing normal; `figure` is a person who must stand tall in frame.
 */
type Subject={name:string;nodes?:string[];boxes?:{min:Vec3;max:Vec3}[];text?:{at:Vec3;height:number;normal:Vec3};figure?:boolean};
// Text lines are the rendered GLB plates (valve-manifold / manager-office build scripts): glyph heights of the key line.
// Valve: the 1.0×0.5 m operations notice zip-tied above V-2, "疗养区VIP优先供给" ≈0.09 m.
const VALVE_SUBJECT:Subject={name:'阀门与运营部标签',boxes:[{min:[141.2,-.7,-29.7],max:[141.7,1.25,-27.45]}],text:{at:[141.66,.98,-28],height:.09,normal:[-1,0,0]}};
const SUBJECTS:Record<string,Subject>={
 'living.box.probe':{name:'安保员遗体与探头箱',nodes:['security-diver','living-security-guard']},
 'living.valve.heat':VALVE_SUBJECT,'living.valve.feed':VALVE_SUBJECT,'living.valve.cool':VALVE_SUBJECT,
 // Clipboard leans back on the desk facing −Z, toward the north stop (167, 100.8); "0917" glyphs ≈0.105 m.
 'living.photo.code':{name:'管理员遗体与密码纸条',nodes:['manager-corpse','living-manager-corpse'],text:{at:[167,-2.07,103.98],height:.105,normal:[0,.29,-.96]}},
 // Placard 2.0×1.5 m on the east wall, step lines ≈0.14 m.
 'living.photo.guide':{name:'开闸步骤图',text:{at:[173.4,-.15,95.6],height:.14,normal:[-1,0,0]}},
 // A4-ish form 0.7×1.0 m on the west notice board, the applicant's name ≈0.055 m.
 'living.photo.delroy':{name:'治疗申请单',text:{at:[150.6,-.06,92],height:.055,normal:[1,0,0]}},
 'living.uplink.gate':{name:'开启的闸门与艾里亚斯',boxes:[{min:[184.4,-3,41.6],max:[191.6,.6,42.4]}],figure:true},
};
export type Framing={id:string;name:string;fill:number;textPx:number|null;figure:number|null;facing:number;centred:boolean;ok:boolean;reason:string;rect:[number,number,number,number];distance:number};
type Seen={targets:string[];creatures:CreatureType[];creatureIds:string[];alexVisible:boolean;gateOpen:boolean;rejected:{id:string;reason:string}[];framing:Framing[]};
type AlexPose=LivingWorldState['alex'];
const RESULT_SHOTS:Partial<Record<RemoteTape['kind'],string[]>>={slimeCleared:['slime-wall','slime-floor','pipe-bands'],slimeUnchanged:['slime-wall','cocoon'],slimeWorse:['slime-wall','pipe-bands']};
/**
 * Slime level handed to the world (living-slime / atmosphere) while a probe reel renders: the colony as Alex filmed it.
 * Cleared reads as collapsed dregs, unchanged as the intro's level, worse as the full bloom.
 */
const TAPE_SLIME:Record<RemoteTape['kind'],number>={alexIntro:.75,securityLog:.5,slimeCleared:0,slimeUnchanged:.75,slimeWorse:1,gateOpened:0};
type Snapshot={narrative?:NarrativeMemory;adapter:'living-deck';adapterVersion:1;index:1;levelId:'living.2';position:[number,number,number];heading:number;pitch:number;elapsed:number;sequence:number;ended:boolean;
 routeVersion:2;survey:ReturnType<LivingSurvey['snapshot']>;cargo:string[];debugNoVideo:boolean;surveyGateLift:number;reserveUsed:boolean;
 deck:LivingState;creatures:unknown;dialogue:unknown;navigation:unknown;sonarDesk:unknown;alexFollow:[number,number,number]|null;gateLift:number};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const v3=(p:Vec3)=>new T.Vector3(p[0],p[1],p[2]);
const box3=(b:{min:Vec3;max:Vec3})=>new T.Box3(v3(b.min),v3(b.max));

/** Deck −1 living quarters inside the main game: same hull, lamp, film and sonar rules as level one. */
export class LivingDeckSite implements AuthoredSite {
 readonly index=1;
 readonly diegeticGuidance=true;
 readonly managesNarrative=true;
 readonly managesThreats=true;
 readonly coordinateDatum=LIVING_DATUM_DEPTH;
 readonly descriptionOnly=false;
 readonly navigationConsole:LivingNavigation;
 readonly position=v3(LIVING_SPAWN.position);
 readonly deck=new LivingDeck();
 readonly creatures=new LivingCreatures(Math.random,'survey');
 readonly survey=new LivingSurvey();
 private taskPlayer:LivingTaskPlayer;
 private cargo=new Set<string>();
 private debugNoVideo=false;
 private surveyGateLift=0;
 readonly dialogue=new LivingDialogue();
 private world:LivingWorld;
 private scene=new T.Scene();
 private camera=new T.PerspectiveCamera(64,1024/720,.05,180);
 private view:LivingRender;
 private renderClock=-1;
 private salvageArm=createSalvageArm();
 private fallback=new T.Group();
 private fallbackItems=new Map<string,T.Object3D>();
 private fallbackCreatures=new Map<string,T.Object3D>();
 private fallbackGate:T.Mesh|null=null;
 private width=0;private height=0;
 private s:LivingState;
 private elapsed=0;
 private sequence=0;
 private ended=false;
 private pendingCaptureId:string|null=null;
 private bursts:{position:Vec3;loudness:number}[]=[];
 private lastCreature:CreatureResult|null=null;
 private eventSeen=new Map<string,number>();
 private bumpAt=-9;
 private trimWarnedAt=-99;
 private armObject:string|null=null;
 private armAnchor:T.Vector3|null=null;
 private armNormal=new T.Vector3(0,0,1);
 private pendingCargo:string|null=null;
 private feedbackText='';private feedbackUntil=0;
 private pendingTapes:RemoteTape[]=[];
 private tapeRetryAt=0;
 private tapeOverride:{kind:RemoteTape['kind']}|null=null;
 private probeView:{position:T.Vector3;target:T.Vector3;fov:number;alexInFrame:boolean}|null=null;
 private gateLift=0;
 private valveTurn={heat:0,feed:0,cool:0};
 private sonarReturns:{bearing:number;distance:number}[]=[];private sonarAt=-1;
 private sonarEcho:HTMLCanvasElement|null=null;private echoSweep=-1;
 private threatBeepLeft=0;
 private lensWasBlocked=false;
 private hullAlarm=0;
 private powerWarned=0;
 private turnBlockedAt=-99;
 private reserveUsed=false;
 private disposed=false;
 /** Film metering carried across one exposure's frames; `at` < 0 forces a fresh measurement. */
 private meter={gain:1,at:-99};
 private lastFraming:Framing[]=[];
 readonly presentation={sensorFrame:SENSOR,labLargeFrame:true} as const;
 constructor(private run:PodRun){
  this.taskPlayer=new LivingTaskPlayer(run);
  this.deck.configureStory(livingStory(run.narrativeMemory));this.s=this.deck.snapshot();this.dialogue.story=this.s.story;
  const {renderer}=sharedExpeditionRenderer();
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  this.world=createLivingWorld();
  this.s=this.deck.snapshot();
  this.run.heading=LIVING_SPAWN.heading;this.run.pitch=0;
  // Film is this deck's main view of the level: the lab opens on full-CRT playback (4 returns to the list and report).
  this.run.labVideoExpanded=true;
  this.scene.add(this.world.root,this.fallback);
  this.camera.add(this.salvageArm.root);this.scene.add(this.camera);
  // The pipeline owns headlamp, probe lamp, practical keys, fog, background and environment.
  this.view=createLivingRender({renderer,scene:this.scene,camera:this.camera,world:this.world,width:1024,height:720,profiles:{live:{lampNearFull:9,lampGain:1.8,lampDecay:.9,practicalGain:2.2,envIntensity:.065,scatter:.4,fogTint:1.2,bloom:.22}}});
  this.buildFallbackItems();
  this.navigationConsole=new LivingNavigation({
   run,position:this.position,datum:LIVING_DATUM_DEPTH,
   contacts:()=>this.creatures.passiveContacts(this.vec(),this.run.heading),
   drawActive:(ctx,w,h)=>this.drawDrivingSonar(ctx,w,h,this.elapsed,true),
   waypointCatalog:[
    {position:[7,0,8],name:'S 入口停靠区',detail:'摄像仪匣与传递口'},
    {position:[53,0,24],name:'01 机修间',detail:'第一处生物 · 修补材料 · 东门通往02'},
    {position:[108,0,26],name:'02 压载库',detail:'第二处生物 · 下潜配重'},
    {position:[137.8,0,13.5],name:'G 供水检修站',detail:'开灯拍说明牌 · 现场操作阀门'},
    {position:[128.5,0,36],name:'03 南廊隔离门',detail:'人员侧下发一次性授权，门旁确认'},
    {position:[166,0,60],name:'03 中庭调查区',detail:'第三处生物'},
    {position:[188,0,52],name:'F 会合闸门',detail:'调查收件与会合确认'},
    {position:[208,0,68],name:'E 东侧下潜井',detail:'-2层入口 · 需要配重与会合确认'},
   ],
  });
  if(run.sonarPulseEnabled){run.stopSonarPulses();run.pushLog('进入-1层：周期脉冲已停发——这一层有循声而来的东西。主动声纳通电就会持续发声；需要地形和距离才开启，平时可关闭，被动监听始终工作。','system');}
  this.world.setFocus(this.vec());
  void this.world.ready.catch(()=>{});
  if(import.meta.env?.DEV&&typeof window!=='undefined')(window as unknown as {__living?:unknown}).__living=this;
 }

 // ------------------------------------------------------------------ status
 get complete(){return (!this.debugNoVideo||isNoVideoMode())&&this.survey.complete;}
 get micTarget(){return '艾里亚斯';}
 get micReady(){return true;}
 get mediaRetryable(){return this.taskPlayer.retryable;}
 retryMedia(){const line=this.taskPlayer.retry();this.feedback(line);return line;}
 private get activeNoise(){return this.run.powered&&this.run.activeSonarEnabled;}
 private nearItem(id:string,range=REACH){const item=ITEMS.get(id);return !!item&&this.boxBounds(id).distanceToPoint(this.position)<=range&&this.segmentClear(this.position,v3(item.position),this.boxBounds(id));}
 private diagnosticSay(text:string){
  // M opens the radio from any of the three shared cockpit screens and switches to nav.
  if(!isNoVideoMode()||!['lab','nav','camera'].includes(this.run.at??'')){this.feedback('诊断需要显式开启GM无视频模式，并在驾驶台操作；不授予正式录像证据。');return true;}
  if(text==='诊断核验任务'){this.feedback('剧情任务视频无需核验：无视频模式下到达阶段即自动推进。');return true;}
  const tape=this.run.selectedTape,e=tape?.siteEvidence as SurveyCapture|undefined;
  if(tape?.legId!==this.run.leg.id||tape?.ready===false||['exposing','developing'].includes(this.run.shot.phase)||!e?.survey){this.feedback('需选择本关实际完成曝光的底片；未就绪的录像请先等待。');return true;}
  if(this.survey.analyzed.includes(e.id)){this.feedback('这卷底片已经核验：'+this.describeEvidence(e)+'。需要查看另一卷时，在分析台按 2 切换下一卷。');return true;}
  if(!this.survey.analyze(e)){this.feedback('【GM诊断 · 未确认】'+this.evidenceFailure(e));return true;}
  this.debugNoVideo=true;this.run.gmLevelSession=true;tape!.analyzed=true;tape!.report=['GM诊断 · 非真实录像 · 禁写正式存档',this.survey.objective];this.refresh();this.feedback('【GM诊断】底片核验完成。'+this.survey.objective);return true;
 }
 radioSay(text:string){
  const t=text.trim();if(/^诊断(?:核验任务|分析底片)$/.test(t))return this.diagnosticSay(t);
  if(this.debugNoVideo&&!isNoVideoMode()){this.feedback('含诊断进度：恢复GM无视频模式或新开正式游戏。');return false;}
  if(/重试.*录像|重试.*视频/.test(t)){this.feedback(this.taskPlayer.retry());return true;}
  for(const line of this.survey.say(t,{nearTransfer:this.nearItem('living.pipe.intake')})){
   const hint=line.includes('传递口在竖井出口旁')?this.stageTargetHint():null;
   const spoken=hint?line+'\n罗温：'+hint:line;
   this.navigationConsole.recordDialogue(spoken);this.feedback(spoken);
  }
  this.refresh();return true;
 }
 receiveTape(recipient:'vance'|'elias',id:string){
  if(recipient!=='elias'||!this.s.met||this.s.story?.partner==='keeper')return false;
  const t=this.run.tapes.find(t=>t.id===id),e=t?.siteEvidence as RescueEvidence|undefined,m=this.run.narrativeMemory;
  if(!t?.analyzed||!e?.visible||e.creatureVisible===false||!['threat','lure','gate'].includes(e.kind)||m.received.includes(id))return false;
  const lines=receiveSafetyEvidence(m,id,e.kind==='gate'?'sealed':'danger',e.capturedAt??0);
  if(lines.length)paySeed(m,'false-clear',2);
  this.dialogue.enqueue('艾里亚斯：上层那卷录像收到了。');for(const line of lines)this.dialogue.enqueue(line);return true;
 }
 get evidenceReady(){return (!this.debugNoVideo||isNoVideoMode())&&this.survey.reunion&&this.survey.photos.length===3;}
 get elevation(){return this.position.y;}
 get description(){return '-1层生活区：机修水道、压载库、供水检修廊与中庭。艾里亚斯从独立人员通路回传视频。';}
 get hint(){return this.objective;}
 get objective(){
  if(this.debugNoVideo&&!isNoVideoMode())return '诊断进度暂停：恢复GM无视频模式或新开正式游戏';
  if(this.ended)return END_TEXT;
  if(this.position.y>2&&livingSpaceAt(this.vec())==='S')return '抵达生活区入口井 · 先坐到驾驶台（W靠近，E就坐）\n按住 PageDown 下降至深度1040m；PageUp上升，Shift制动\n井底右前方黄色仪器匣：开探照灯，对准后靠近按 F 伸臂、再次 F 夹取，再 F 收回';
  const at=this.destination(),leg=at?this.nextDoor(at):null;
  const task=this.localBallastStop()?'离开压载库前 · 机械臂收妥下潜配重，免得下潜前再折返':this.survey.objective;
  return (isNoVideoMode()?'【GM无视频】剧情自动推进；怪物底片在分析台按 3 诊断\n':'')+task+(at?'\n导航坐标 '+formatCoords(at,LIVING_DATUM_DEPTH):'')+(leg?'\n下一段：'+leg.name:'');
 }
 private localBallastStop(){return !this.survey.pending&&(!this.survey.helpSeen||this.survey.helpReplied)&&!this.survey.ballast&&this.survey.photos.includes(1)&&livingSpaceAt(this.vec())==='R4';}
 private get needsGuidePhoto(){return this.s.stage==='code'&&this.s.codeVerified&&!this.s.guideVerified;}
 private destination():Vec3|undefined{
  const f=this.survey;
  if(!f.shared&&!f.called)return [16,0,7.5];
  if(!f.shared&&f.pending)return undefined;
  if(!f.camera)return [7,0,8];
  if(!f.shared)return [12,0,9];
  if(f.pending)return undefined;
  if(this.localBallastStop())return ITEMS.get('living.box.ballast')!.position;
  if(!f.photos.includes(0))return [53,0,24];
  if(!f.photos.includes(1))return [108,0,26];
  if(!f.clearSeen)return [137.8,0,13.5];
  if(!f.unlocked)return [128.5,0,36];
  if(!f.photos.includes(2))return [166,0,60];
  if(!f.reunion)return [188,0,52];
  if(!f.ballast)return ITEMS.get('living.box.ballast')!.position;
  return [208,LIVING_SURVEY_EXIT_Y-2,68];
 }
 /** First doorway on the open-door route from the pod's space toward `goal`; null once in the goal's space. */
 private nextDoor(goal:Vec3):{position:Vec3;name:string}|null{
  const from=livingSpaceAt(this.vec()),to=livingSpaceAt(goal);
  if(!from||!to||from===to)return null;
  const door=livingDoorRoute(from,to)?.[0];if(!door)return null;
  const next=door.a===from?door.b:door.a,mid=(door.from+door.to)/2,y=Math.max(door.bottom+1.5,Math.min(0,door.top-1.5));
  const space=LIVING_SPACES.find(s=>s.id===next);
  return {position:door.axis==='x'?[door.at,y,mid]:[mid,y,door.at],name:`${space?.name??next}（${next}）`};
 }
 private routeHint(){
  const at=this.destination();if(!at)return null;
  const leg=this.nextDoor(at);if(!leg)return null;
  const dx=leg.position[0]-this.position.x,dz=leg.position[2]-this.position.z,d=Math.hypot(dx,dz);
  const rel=((Math.atan2(dx,-dz)*180/Math.PI-this.run.heading)%360+540)%360-180;
  const turn=Math.abs(rel)<10?'在船头正前方 · 空格推进':`在${rel<0?'左':'右'}侧 ${Math.abs(rel).toFixed(0)}° · 按住 ${rel<0?'J':'L'} 转船头`;
  return `下一段：去${leg.name}的门口 · 约 ${d.toFixed(0)} 米 · ${turn}`;
 }
 get noiseFloor(){return 0;}
 private vec():Vec3{return [this.position.x,this.position.y,this.position.z];}
 private refresh(){
  this.s=this.deck.snapshot();const f=this.survey;
  Object.assign(this.s,{collected:[...this.cargo],pod:this.vec(),probe:f.shared?'withAlex':f.camera?'carried':'none',ballast:f.ballast,complete:f.complete,met:f.reunion,gateOpen:f.reunion,slimeCleared:f.clearSeen,slime:f.clearSeen?0:.75,valves:{heat:false,feed:f.valve,cool:false},stage:f.complete?'complete':f.reunion?'exit':!f.camera?'explore':!f.shared?'glass':!f.clearSeen?'valve':!f.unlocked?'code':'atrium'});
 }
 private lit(){return this.run.lit&&this.run.powered;}

 // ------------------------------------------------------------------ feedback
 private feedback(text:string){
  if(!text)return;
  this.feedbackText=text;this.feedbackUntil=this.elapsed+Math.max(4,Math.min(10,text.length*.12));
  text=livingLine(text,this.s.story);this.run.pushLog(text,'system');
  this.run.storyCaption=text;this.run.storyCaptionLeft=Math.max(4,Math.min(12,text.length*.13));
 }
 private event(text:string,cooldown=8){
  const last=this.eventSeen.get(text);if(last!==undefined&&this.elapsed-last<cooldown)return;
  this.eventSeen.set(text,this.elapsed);this.feedback(text);
 }
 private cue(name:string){const c=CUE[name];this.run.onCue?.(c?.[0]??name,c?.[1]??.6);}
 private speak(line:string){
  if(isAudioMuted()||typeof window==='undefined'||!('speechSynthesis'in window))return;
  try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(line);u.lang='zh-CN';window.speechSynthesis.speak(u);}catch{/* speech is optional */}
 }
 private apply(r:LivingResult){
  for(const e of r.events)this.feedback(e);
  for(const c of r.cues)this.cue(c);
  if(r.noise)this.bursts.push({position:[...r.noise.position] as Vec3,loudness:r.noise.loudness});
  if(r.damage>0)this.hurt(r.damage,.6);
  for(const t of r.tapes)this.pendingTapes.push(structuredClone(t));
  this.refresh();
 }
 private hurt(amount:number,shake:number){
  this.run.hull=Math.max(0,this.run.hull-amount);this.deck.noteDamage(amount);
  if(this.run.shot.viewing||this.run.at==='lab'){
   this.run.labPlaybackPauseRequested=true;
   this.run.shot.viewing=false;this.run.labVideoExpanded=false;this.run.walkTo('camera');
   this.feedback('船体受击，读片已中断。先退到安全处；底片和报告仍保留在分析台。');
  }
  this.run.onShake?.(Math.max(.3,shake));this.run.onCue?.('hull.crack',.8);
 }

 // ------------------------------------------------------------------ space
 private boxBounds(id:string):T.Box3{
  const wb=this.world.itemBounds.get(id);if(wb)return wb.clone();
  const obj=this.world.interactables.get(id);
  if(obj){const b=new T.Box3().setFromObject(obj);if(!b.isEmpty())return b;}
  const item=ITEMS.get(id)!,c=v3(item.position);
  const half=item.kind==='box'?(item.face%180===0?new T.Vector3(.675,.45,.48):new T.Vector3(.48,.45,.675)):item.kind==='photo'?new T.Vector3(.5,.5,.5):new T.Vector3(.45,.75,.75);
  return new T.Box3(c.clone().sub(half),c.clone().add(half));
 }
 /** Collision set: shell, uncollected cargo, idle shades at doorways, closed gate. */
 private solids(near?:T.Vector3,radius=14,includeCreatures=true):T.Box3[]{
  const out:T.Box3[]=[];
  const keep=(b:T.Box3)=>{if(!near||b.distanceToPoint(near)<=radius)out.push(b);};
  for(const b of this.world.colliders)keep(b);
  for(const i of LIVING_ITEMS)if(i.kind==='box'&&!this.s.collected.includes(i.id))keep(this.boxBounds(i.id));
  if(includeCreatures)for(const b of this.creatures.blockers())keep(box3(b));
  if(this.gateLift<.95)keep(this.world.gate.bounds);
  if(this.surveyGateLift<.95)keep(this.world.surveyGate.bounds);
  return out;
 }
 private clear(p:T.Vector3,heading=this.run.heading,solids=this.solids(p)){return (p.y>=-8||livingSpaceAt([p.x,p.y,p.z])==='E'&&this.survey.ballast&&this.survey.reunion)&&harborHullClear(p,heading,this.world.walkable,solids);}
 private turnRecoveryHint(degrees:number,solids:T.Box3[]){
  const heading=this.run.heading,sign=Math.sign(degrees),h=T.MathUtils.degToRad(heading),pitch=T.MathUtils.degToRad(this.run.pitch);
  const forward=new T.Vector3(Math.sin(h)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(h)*Math.cos(pitch));
  const allowance=(p:T.Vector3)=>Math.abs(((sweepHarborHeading(heading,sign*20,a=>this.clear(p,a,solids))-heading)%360+540)%360-180);
  const baseline=allowance(this.position);
  let best:{direction:number;distance:number;gain:number}|undefined;
  if(this.clear(this.position,heading,solids))for(const direction of [1,-1]){
   const p=this.position.clone();
   for(let step=1;step<=25;step++){
    const next=p.clone().addScaledVector(forward,direction*.04);
    if(!this.clear(next,heading,solids))break;
    p.copy(next);if(step!==15&&step!==25)continue;
    const gain=allowance(p)-baseline;
    if(gain>=2&&(!best||gain>best.gain+.01))best={direction,distance:step*.04,gain};
   }
  }
  if(!best)return '艇身转向净空不足。先按 Shift 制动，检查门框和艇身位置，再调整航向。';
  return `艇身转向净空不足。先轻按 ${best.direction>0?'Space 前进':'N 倒车'}约 ${best.distance.toFixed(1)} 米，按 Shift 制动后再向${sign<0?'左':'右'}转。`;
 }
 turn(degrees:number){
  const solids=this.solids(this.position);
  const next=sweepHarborHeading(this.run.heading,degrees,h=>this.clear(this.position,h,solids));
  if(Math.abs(degrees)>1e-4&&Math.abs(((next-this.run.heading)%360+540)%360-180)<1e-4&&this.elapsed-this.turnBlockedAt>3){this.turnBlockedAt=this.elapsed;this.feedback(this.turnRecoveryHint(degrees,solids));}
  return next;
 }
 moveVertical(distance:number){
  const solids=this.solids(this.position,10),steps=Math.max(1,Math.ceil(Math.abs(distance)/.04));
  for(let i=0;i<steps;i++){
   const next=this.position.clone();next.y+=distance/steps;
   if(distance<0&&next.y<-8&&(!this.survey.ballast||!this.survey.reunion||this.position.x<200)){
    if(this.elapsed-this.trimWarnedAt>6){this.trimWarnedAt=this.elapsed;this.feedback(!this.survey.ballast?'没有配重无法下潜：取回压载库沿途的配重箱。':!this.survey.reunion?'先完成公司影像收件与艾里亚斯会合，再进入下一层。':'本局下潜通道在中庭东侧 E 井。');}
    return false;
   }
   if(!this.clear(next,this.run.heading,solids))return false;
   this.position.copy(next);
  }
  return true;
 }
 move(distance:number){
  if(!finite(distance))return false;
  const h=T.MathUtils.degToRad(this.run.heading),p=T.MathUtils.degToRad(this.run.pitch);
  const dir=new T.Vector3(Math.sin(h)*Math.cos(p),-Math.sin(p),-Math.cos(h)*Math.cos(p));
  const solids=this.solids(this.position,12+Math.abs(distance)),steps=Math.max(1,Math.ceil(Math.abs(distance)/.08));
  let moved=false;
  for(let i=0;i<steps;i++){
   const next=this.position.clone().addScaledVector(dir,distance/steps);
   if(this.clear(next,this.run.heading,solids)){this.position.copy(next);moved=true;continue;}
   // Graze along the wall instead of sticking dead on contact.
   const slide=[new T.Vector3(next.x,this.position.y,this.position.z),new T.Vector3(this.position.x,this.position.y,next.z)]
    .filter(q=>q.distanceTo(this.position)>distance/steps*.35).find(q=>this.clear(q,this.run.heading,solids));
   if(slide){this.position.copy(slide);moved=true;continue;}
   this.bump();return moved;
  }
  return true;
 }
 private bump(){
  if(Math.abs(this.run.pilot.speed)<.3||this.elapsed-this.bumpAt<1.5)return;
  this.bumpAt=this.elapsed;this.bursts.push({position:this.vec(),loudness:.35});
  this.run.onCue?.('hull.crack',.35);this.run.onShake?.(.25);
 }
 noiseBurst(amount:number){if(finite(amount)&&amount>=.5)this.bursts.push({position:this.vec(),loudness:Math.min(1,amount)});}
 private pendingPulse=false;
 sonarPulse(power:number){if(power>0)this.pendingPulse=true;}

 // ------------------------------------------------------------------ camera & visibility
 private pose(){
  this.camera.position.copy(this.position);
  this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');
  // Evidence tests use the film's aspect; renderView re-applies the target canvas aspect before drawing.
  this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.aspect=SENSOR.width/SENSOR.height;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
 }
 private viewDir(){return this.camera.getWorldDirection(new T.Vector3());}
 /** A window rectangle that a line of sight may pass: G-L glass, and gate F once it is up. */
 private transparentAt(p:T.Vector3){
  if(Math.abs(p.x-142)<.45&&p.z>=0&&p.z<=12&&p.y>=-3&&p.y<=2)return true;
  if(this.gateLift>.5&&Math.abs(p.z-42)<.45&&p.x>=184&&p.x<=192&&p.y>=-3&&p.y<=.6)return true;
  return false;
 }
 private segmentClear(from:T.Vector3,to:T.Vector3,ignore?:T.Box3){
  const d=to.clone().sub(from),len=d.length();if(len<.01)return true;
  const ray=new T.Ray(from,d.clone().divideScalar(len)),hit=new T.Vector3();
  for(const b of this.solids()){
   if(ignore&&b.intersectsBox(ignore))continue;
   if(b.containsPoint(to))continue;
   if(!ray.intersectBox(b,hit))continue;
   if(hit.distanceTo(from)>=len-.3)continue;
   if(this.transparentAt(hit))continue;
   return false;
  }
  return true;
 }
 private inFrame(p:T.Vector3,margin=.96){
  const q=p.clone().project(this.camera);
  const local=p.clone().applyMatrix4(this.camera.matrixWorldInverse);
  return local.z<0&&Math.abs(q.x)<=margin&&Math.abs(q.y)<=margin;
 }
 private illuminated(p:T.Vector3){
  if(this.lit()){
   const d=p.clone().sub(this.position),dist=d.length();
   if(dist<=LAMP_RANGE&&(dist<1||d.normalize().angleTo(this.viewDir())<=LAMP_HALF_ANGLE+.06))return true;
  }
  // Gameplay light is the authored fixture table the deck validates against; world fixtures only shade the render.
  return LIVING_LIGHTS.some(l=>v3(l.position).distanceTo(p)<=l.range);
 }
 /** World box of an evidence subject: item bounds ∪ named body nodes ∪ authored boxes (Alex joins the gate subject). */
 private subjectBox(id:string):T.Box3{
  const spec=SUBJECTS[id],b=this.boxBounds(id);
  for(const n of spec?.nodes??[]){
   const o=this.world.root.getObjectByName(n);if(!o)continue;
   let shown=true;for(let q:T.Object3D|null=o;q;q=q.parent)if(!q.visible){shown=false;break;}
   if(shown){const nb=new T.Box3().setFromObject(o);if(!nb.isEmpty()){b.union(nb);break;}}
  }
  for(const x of spec?.boxes??[])b.union(box3(x));
  return b;
 }
 /** Projected rectangle of a box on the current camera, clipped to the frame, in NDC [x0,y0,x1,y1]. */
 private projectBox(b:T.Box3):[number,number,number,number]|null{
  const inv=this.camera.matrixWorldInverse,near=-.05;let x0=1,y0=1,x1=-1,y1=-1,front=0;
  const corner=(i:number)=>new T.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z);
  const pts:T.Vector3[]=[];
  for(let i=0;i<8;i++){
   const c=corner(i);if(c.clone().applyMatrix4(inv).z<=near){pts.push(c);front++;}
   // Edges that cross the camera plane contribute their near-plane crossing, so a box the lens sits inside still covers the frame.
   for(const bit of [1,2,4])if(!(i&bit)){
    const d=corner(i|bit),za=c.clone().applyMatrix4(inv).z,zb=d.clone().applyMatrix4(inv).z;
    if((za-near)*(zb-near)<0)pts.push(c.clone().lerp(d,(near-za)/(zb-za)));
   }
  }
  if(!front)return null;
  for(const p of pts){const q=p.project(this.camera);x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);}
  const r:[number,number,number,number]=[Math.max(-1,x0),Math.max(-1,y0),Math.min(1,x1),Math.min(1,y1)];
  return r[2]>r[0]&&r[3]>r[1]?r:null;
 }
 /**
  * Whether this exposure would show the subject well enough to count: ≥8% of the frame, the key line ≥12 px at the lab's
  * playback size, text faced within ~70°, a person ≥20% of frame height. Pure read of the current pose.
  */
 framing(id:string):Framing{
  const spec:Subject=id==='living.photo.sulfur'?{name:'含硫供水操作说明',text:{at:ITEMS.get(id)!.position,height:.18,normal:[-1,0,0]}}:SUBJECTS[id]??{name:ITEMS.get(id)?.name??id},b=this.subjectBox(id),centre=b.getCenter(new T.Vector3());
  const distance=b.distanceToPoint(this.position),rect=this.projectBox(b)??[0,0,0,0];
  const fill=(rect[2]-rect[0])*(rect[3]-rect[1])/4,H=SENSOR.height;
  let textPx:number|null=null,facing=1,figure:number|null=null;
  if(spec.text){
   const at=v3(spec.text.at),top=at.clone().add(new T.Vector3(0,spec.text.height,0));
   const local=at.clone().applyMatrix4(this.camera.matrixWorldInverse);
   const a=at.clone().project(this.camera),t=top.project(this.camera);
   textPx=local.z<0?Math.abs(t.y-a.y)/2*H*LAB_DISPLAY_SCALE:0;
   facing=v3(spec.text.normal).normalize().dot(this.position.clone().sub(at).normalize());
  }
  if(spec.figure){const alex=this.alexPose(),p=v3(alex.position);const r=this.projectBox(new T.Box3(p.clone().add(new T.Vector3(-.35,-1,-.35)),p.clone().add(new T.Vector3(.35,.85,.35))));figure=r?(r[3]-r[1])/2:0;}
  const centred=this.inFrame(spec.text?v3(spec.text.at):centre,.92);
  const zoomFor=(have:number,want:number)=>Math.min(3.2,this.run.camZoom*want/Math.max(have,1e-3));
  const zoomHint=(have:number,want:number)=>{const z=zoomFor(have,want);return z<3.2?`靠近，或按 + / 滚轮变焦到约 ${Math.max(this.run.camZoom+.25,z).toFixed(1)}×`:'变焦也不够，必须开得更近';};
  let reason='';
  if(!centred)reason=`${spec.name}不在取景中央，会被画框裁掉——把它对到画面中间再拍。`;
  else if(fill<MIN_FILL)reason=`${spec.name}只占画面 ${(fill*100).toFixed(1)}%（需≥8%）——${zoomHint(Math.sqrt(fill),Math.sqrt(MIN_FILL))}。`;
  else if(textPx!==null&&facing<.34)reason=`角度太斜，${spec.name}上的字被压扁了——正对着它再拍。`;
  else if(textPx!==null&&textPx<MIN_TEXT_PX)reason=`${spec.name}上的字只有 ${textPx.toFixed(0)} px，分析台上读不出来——${zoomHint(textPx,MIN_TEXT_PX)}。`;
  else if(figure!==null&&figure<MIN_FIGURE)reason=`艾里亚斯在画面里只有 ${(figure*100).toFixed(0)}% 高，认不出人——${zoomHint(figure,MIN_FIGURE)}。`;
  return {id,name:spec.name,fill,textPx,figure,facing,centred,ok:!reason,reason,rect,distance};
 }
 private computeSeen():Seen{
  this.pose();
  const eye=this.position,out:Seen={targets:[],creatures:[],creatureIds:[],alexVisible:false,gateOpen:false,rejected:[],framing:[]};
  for(const item of LIVING_ITEMS){
   if(item.kind==='box'&&this.s.collected.includes(item.id)&&item.id!=='living.box.probe')continue;
   const p=v3(item.position),limit=item.kind==='photo'?14:item.kind==='box'?18:16;
   if(p.distanceTo(eye)>limit||!this.inFrame(p))continue;
   if(!this.segmentClear(eye,p,this.boxBounds(item.id)))continue;
   if(!this.illuminated(p))continue;
   if((SUBJECTS[item.id]||item.id==='living.photo.sulfur')&&item.id!=='living.uplink.gate'){
    const f=this.framing(item.id);out.framing.push(f);
    if(!f.ok){out.rejected.push({id:item.id,reason:f.reason});continue;}
   }
   out.targets.push(item.id);
  }
  for(const c of this.creatures.views){
   const p=v3(c.position);
   let reason='';
   if(p.distanceTo(eye)>LAMP_RANGE)reason='声源尚不在摄影有效范围内；按被动声纳的大致方位谨慎接近，再取景。';
   else if(!this.inFrame(p,1))reason='声源方向没有收入镜头；被动方位以艇首为准，先回正云台，再按最新方位选择摄影方向。';
   else if(!this.segmentClear(eye,p))reason='当前摄影方向有结构遮挡；调整真实机位后再拍，镜头不能透过墙体。';
   else if(!this.illuminated(p))reason='当前方向的照明不足；将探照灯与摄影方向对齐后再拍。';
   if(reason){out.rejected.push({id:c.id,reason});continue;}
   const silhouette=this.projectBox(new T.Box3(p.clone().add(new T.Vector3(-1.2,-.75,-1.5)),p.clone().add(new T.Vector3(1.2,.75,1.5))));
   if(!silhouette||(silhouette[2]-silhouette[0])*(silhouette[3]-silhouette[1])/4<.025||(silhouette[3]-silhouette[1])*SENSOR.height/2*LAB_DISPLAY_SCALE<24){out.rejected.push({id:c.id,reason:'当前取景中的调查对象太小，无法辨认；沿被动声源方位取景后适当变焦，或谨慎接近再拍。'});continue;}
   out.creatureIds.push(c.id);if(!out.creatures.includes(c.type))out.creatures.push(c.type);
  }
  const gate=v3(ITEMS.get('living.uplink.gate')!.position);
  out.gateOpen=this.gateLift>.5&&gate.distanceTo(eye)<=18&&this.inFrame(gate,1)&&this.segmentClear(eye,gate);
  const alex=this.alexPose();
  if(alex.visible){const p=v3(alex.position);out.alexVisible=p.distanceTo(eye)<=20&&this.inFrame(p,1)&&this.segmentClear(eye,p)&&this.illuminated(p);}
  if(out.gateOpen&&out.alexVisible){
   const f=this.framing('living.uplink.gate');out.framing.push(f);
   if(!f.ok){out.rejected.push({id:'living.uplink.gate',reason:f.reason});out.gateOpen=false;}
  }
  return out;
 }
 private alexPose():AlexPose{return {position:ALEX_MARKS.gateInner,heading:180,visible:false,pose:'idle'};}

 // ------------------------------------------------------------------ interaction
 private aimed():{item:LivingItem;distance:number}|null{
  this.pose();
  const dir=this.viewDir(),ray=new T.Ray(this.position.clone(),dir),hit=new T.Vector3();
  let best:{item:LivingItem;distance:number;score:number}|null=null;
  for(const item of LIVING_ITEMS){
   if(item.kind==='box'&&this.s.collected.includes(item.id))continue;
   if(['living.photo.code','living.photo.guide','living.photo.delroy'].includes(item.id))continue;
   if(item.kind==='pipe'&&this.s.probe!=='carried')continue;
   const bounds=this.boxBounds(item.id),pick=bounds.clone().expandByScalar(.25),c=v3(item.position);
   const limit=item.kind==='uplink'?UPLINK_REACH+1:item.kind==='box'?16:REACH+4;
   let distance:number|null=null,score=0;
   if(ray.intersectBox(pick,hit))distance=bounds.distanceToPoint(this.position);
   else{const to=c.clone().sub(this.position),a=to.clone().normalize().angleTo(dir);if(a<=(item.kind==='box'?.32:.2)){distance=Math.max(0,bounds.distanceToPoint(this.position));score=a;}}
   if(distance===null||distance>limit)continue;
   if(!this.segmentClear(this.position,c,bounds))continue;
   if(!best||score<best.score-.01||(Math.abs(score-best.score)<.01&&distance<best.distance))best={item,distance,score};
  }
  return best?{item:best.item,distance:best.distance}:null;
 }
 interact(){
  if(this.debugNoVideo&&!isNoVideoMode()){this.feedback('恢复GM无视频模式或新开正式游戏。');return;}
  if(this.ended){this.feedback(END_TEXT);return;}
  const arm=this.run.arm;
  if(arm.phase==='aiming'&&this.pendingCargo){this.run.retractArm();this.feedback('箱体已夹紧 · 正在回收，收臂完成后才入库');return;}
  if(arm.phase==='gone'){this.feedback('机械臂已损毁，无法取物。');return;}
  if(['extending','gripping','hauling','jammed'].includes(arm.phase)){this.feedback(ARM_PHASE_CN[arm.phase]);return;}
  if(this.run.shot.viewing){this.feedback('先切回实时镜头，再操作外部设施。');return;}
  if((this.run.driveBlock&&arm.phase!=='aiming')||this.run.outcome.kind!=='alive'){this.feedback(this.run.driveBlock??'航行已结束');return;}
  const aim=this.aimed();
  if(!aim){this.feedback(arm.phase==='aiming'?'机械臂已伸出，但没有对准箱体。用方向键对准，或按 C 收臂。':this.stageTargetHint()??'未锁定物体 · 对准目标（方向键俯仰镜头），靠近至 3.4 米内');return;}
  const {item,distance}=aim;
  if(item.kind==='photo'){this.feedback(`${item.name}：这需要拍下来，回分析台核验。`);return;}
  if(item.kind==='uplink'){
   if(distance>UPLINK_REACH){this.feedback('离观察窗太远，水声链路接不上。');return;}
   this.feedback(this.survey.operate('reunion',true));this.refresh();return;
  }
  if(distance>REACH){this.feedback(`${item.name} · ${distance.toFixed(1)} 米 · 再靠近到 3.4 米内`);return;}
  if(item.kind==='box'){
   const cr=this.lastCreature;
   if(!this.lit()){this.feedback('打开照明并恢复液压供电后才能操作机械臂');return;}
   if(cr?.armBlocked){this.feedback('有东西贴在舷窗上，机械臂伸不出去。关灯，等它松开。');return;}
   if(cr?.itemsBlocked.includes(item.id)){this.feedback('虫群盖住了箱体，爪子会抓空。先关灯后退，等它们散开再来。');return;}
   if(arm.phase==='stowed'){
    const b=this.boxBounds(item.id),c=b.getCenter(new T.Vector3()),to=this.position.clone().sub(c);
    const normal=Math.abs(to.x)>Math.abs(to.z)?new T.Vector3(Math.sign(to.x),0,0):new T.Vector3(0,0,Math.sign(to.z));
    const size=b.getSize(new T.Vector3());
    this.armAnchor=c.clone().add(new T.Vector3(normal.x*size.x/2,.05,normal.z*size.z/2));this.armNormal.copy(normal);
    this.armObject=item.id;this.pendingCargo=null;this.run.pilot.stop();this.run.navDriveEngaged=false;
    beginExtend(arm);this.run.power=Math.max(0,this.run.power-.01);this.run.addNoise(.2);
    this.bursts.push({position:[...item.position] as Vec3,loudness:.25});this.run.onCue?.('arm.pump-start',.85);
    this.feedback(`机械臂伸出中 · ${item.name} · 伸出后再按 F 夹取`);return;
   }
   if(arm.phase==='aiming'){
    if(item.id!==this.armObject){this.feedback('目标已改变，请先按 C 收臂再重新锁定');return;}
    beginGrip(arm,item.id,0);this.run.addNoise(.1);this.run.onCue?.('arm.claw-wet',.8);
    this.feedback('爪头扣住箱体 · 正在解锁');return;
   }
   return;
  }
  if(arm.phase!=='stowed'||!this.run.powered){this.feedback('收回机械臂并恢复设备供电后再操作终端。');return;}
  const action=item.id==='living.pipe.intake'?'transfer':item.id==='living.survey.lock'?'door':item.id==='living.valve.feed'?'valve-s':'valve-c';
  this.feedback(this.survey.operate(action,true));this.refresh();
  if(item.kind==='terminal')this.run.onShake?.(.35);
 }
 armEvent(kind:'grip'|'stowed',id?:string){
  if(kind==='grip'&&id&&id===this.armObject){this.pendingCargo=id;this.feedback('已夹持 · 按 F 收回机械臂，收妥后入库');return true;}
  if(kind==='stowed'){
   const id=this.pendingCargo;
   if(id&&!this.cargo.has(id)){
    this.cargo.add(id);if(id==='living.box.probe')this.feedback(this.survey.operate('body',true));if(id==='living.box.ballast')this.survey.operate('ballast',true);this.refresh();
    if(this.s.collected.includes(id)){
     if(id==='living.box.tools'){this.run.receiveAuthoredSupplies([['sup.plate',2],['sup.o2candle',1]]);this.feedback('取回两份修舱钢板和一支氧烛。到生命维持台按需使用；满血时不必浪费。');}
     if(id==='living.box.battery'){this.run.receiveAuthoredSupplies([['sup.cell',3]]);this.feedback('取回三组备用电池。到生命维持台按需接入，别在满电时浪费。');}
    }
   }
   this.pendingCargo=null;this.armObject=null;this.armAnchor=null;return true;
  }
  return false;
 }

 // ------------------------------------------------------------------ film
 private captureDiagnostic(seen:Seen){
  if(this.lastCreature?.lensBlocked)return '镜头被遮住；先解除遮挡再曝光。';
  if(!this.lit())return '探照灯未开启或未通电；正式调查底片需要开灯。';
  if(Math.abs(this.run.pilot.speed)>=.18||Math.abs(this.run.pilot.yawRate)>=2)return '艇仍在移动或转向；先制动并等艇稳定，再曝光。';
  if(seen.targets.includes('living.photo.sulfur'))return '';
  const ids=['blind.r2','shade.r4','blind.a2'];
  if(ids.some(id=>seen.creatureIds.includes(id)))return '';
  const local=this.creatures.views.filter(c=>ids.includes(c.id)&&livingSpaceAt(c.position)===livingSpaceAt(this.vec()));
  const candidate=local.sort((a,b)=>v3(a.position).distanceToSquared(this.position)-v3(b.position).distanceToSquared(this.position))[0];
  return (candidate&&seen.rejected.find(r=>r.id===candidate.id)?.reason)||seen.rejected.find(r=>r.id==='living.photo.sulfur')?.reason||'本次未取得可核验的调查对象；设施编号不是生物目标。依据最新被动声源方位选择摄影方向，生物形态只能在延迟录像中辨认。';
 }
 private evidenceFailure(capture:unknown){
  const c=capture as SurveyCapture&{diagnostic?:string};
  return typeof c?.diagnostic==='string'&&c.diagnostic?c.diagnostic:'目标未能核验；依据最新被动声源方位重新选择摄影方向，并检查照明、停船和遮挡。';
 }
 prepareCapture(){
  if(this.debugNoVideo&&!isNoVideoMode())return {ok:false,message:'恢复GM无视频模式或新开正式游戏。'};
  this.meter.at=-99;
  const diagnostic=this.captureDiagnostic(this.computeSeen());
  if(diagnostic)return {ok:true,message:`曝光中 · ${diagnostic}`};
  if(this.lastCreature?.lensBlocked)return {ok:true,message:'镜头被贴住了——这一卷大概只会拍到贴在镜头上的东西。'};
  const f=this.viewfinder();
  if(f&&!f.ok)return {ok:true,message:`曝光中 · 取景不足：${f.reason}`};
  if(f)return {ok:true,message:`曝光中 · 保持停船。取景：${f.name}占画面 ${(f.fill*100).toFixed(0)}%${f.textPx!==null?` · 字高 ${f.textPx.toFixed(0)} px`:''}，测光对准目标。`};
  return {ok:true,message:'曝光中 · 保持停船。画面是否有效要到分析台核验。'};
 }
 videoContext(){
  const seen=this.computeSeen();
  const anatomy:Record<string,string>={blind:'Native eyeless deep-sea hunter with a broad armored head and lateral sensory pits, 3 metres long',shade:'Pale translucent native deep-sea eel with a narrow jaw, 3.5 metres long',lumen:'Nonaggressive Panacea-adapted human silhouette, drifts without attacking',swarm:'Small ordinary glass fish'};
  return {story:seen.targets.includes('living.photo.sulfur'),settled:false,generatedMonsters:true,
   prefetchKey:JSON.stringify([this.survey.unlocked,this.survey.valve]),stateKey:JSON.stringify([seen.creatureIds,this.vec(),this.run.heading,this.run.camPan,this.survey.valve]),
   nearestMonster:this.creatures.views.reduce((d,c)=>Math.min(d,this.position.distanceTo(v3(c.position))),Infinity),
   scene:'Flooded living deck. Preserve the supplied image architecture, camera and lights. Only the described evidence animal may be added in its stated position.',actors:[],
   monsters:seen.creatureIds.map(id=>{const c=this.creatures.views.find(c=>c.id===id)!;const q=v3(c.position).project(this.camera);return anatomy[c.type]+'. Target '+id+' at image '+Math.round((q.x+1)*50)+'% from left, '+Math.round((1-q.y)*50)+'% from top, '+this.position.distanceTo(v3(c.position)).toFixed(1)+' metres from camera. Preserve actual current behavior '+c.mode+'.';}),
   outcome:'Record the present state only. Do not open doors, reveal Elias, fabricate documents, or predict attacks.'};
 }
 captureEvidence(){
  const id=`living.shot.${++this.sequence}`,seen=this.computeSeen();this.pendingCaptureId=id;this.lastFraming=seen.framing;
  const ids=['blind.r2','shade.r4','blind.a2'];
  const target=ids.findIndex(x=>seen.creatureIds.includes(x));
  const manual=seen.targets.includes('living.photo.sulfur');
  const e:SurveyCapture&{diagnostic:string}={survey:true,id,target:manual?'manual':target>=0?target:0,valid:(manual||target>=0)&&!this.lastCreature?.lensBlocked&&Math.abs(this.run.pilot.speed)<.18&&Math.abs(this.run.pilot.yawRate)<2,lit:this.lit(),diagnostic:this.captureDiagnostic(seen)};
  return this.survey.issue(e)??{...e,valid:false};
 }
 /** The evidence subject the lens is pointed at (nearest to frame centre within film range), with its framing. */
 private viewfinder():Framing|null{
  this.pose();
  let best:{f:Framing;score:number}|null=null;
  for(const id of ['living.photo.sulfur']){
   if(id===VALVE_ITEM.heat||id===VALVE_ITEM.cool)continue;
   if(id==='living.box.probe'&&this.s.collected.includes(id))continue;
   if(id==='living.uplink.gate'&&!(this.gateLift>.5))continue;
   const c=this.subjectBox(id).getCenter(new T.Vector3());
   if(c.distanceTo(this.position)>18)continue;
   const q=c.clone().project(this.camera),local=c.clone().applyMatrix4(this.camera.matrixWorldInverse);
   if(local.z>=0||Math.abs(q.x)>1.2||Math.abs(q.y)>1.2)continue;
   if(!this.segmentClear(this.position,c,this.boxBounds(id)))continue;
   const score=Math.hypot(q.x,q.y);if(!best||score<best.score)best={f:this.framing(id),score};
  }
  return best?.f??null;
 }
 commitEvidence(capture:unknown){const e=capture as SurveyCapture;if(!e?.survey)return;this.survey.commit(e);if(this.pendingCaptureId===e.id)this.pendingCaptureId=null;}
 finishCapture(){}
 evidenceStatus(capture:unknown){const e=capture as SurveyCapture&{livingTask?:LivingTaskId;generated?:boolean;code?:string};return {accepted:e?.livingTask?e.generated===true&&this.survey.accepted.includes(e.livingTask)&&(e.livingTask!=='L2-S06'||e.code===this.survey.code):!!e?.survey&&this.survey.analyzed.includes(e.id),next:this.objective};}
 isEvidenceMediaReady(mediaId:string){const tape=this.run.tapes.find(t=>t.id===mediaId);return !!tape&&tape.videoResult==='video'&&!!tape.cacheKey&&hasRemotePlaylist(tape.cacheKey);}
 describeEvidence(capture:unknown){const c=capture as SurveyCapture&{livingTask?:LivingTaskId};return c?.livingTask?'艾里亚斯 · '+LIVING_TASKS[c.livingTask].title:c?.survey?!c.valid||!c.lit?'未确认底片 · '+this.evidenceFailure(c):c.target==='manual'?'供水操作说明':`生物调查 ${Number(c.target)+1}`:'未核验的录像';}
 get cargoManifest(){return [
  ...(this.survey.camera&&!this.survey.shared?[{name:'移动摄像仪（待交接）',quantity:1}]:[]),
  ...(this.survey.ballast?[{name:'下潜配重（已安装）',quantity:1}]:[])
 ];}
 get recoveredDocument(){return false;}
 readRecoveredDocument(){return ['旧证件夹不用于本局通行。南廊门码由艾里亚斯的当前回片提供。'];}
 /** Story videos carry no evidence: receiving the current task video advances it without lab analysis. */
 private advanceStoryTask(){
  const id=this.survey.pending;if(!id)return;
  if(isNoVideoMode()){
   if(!this.survey.acceptVideo(id))return;
   this.debugNoVideo=true;this.run.gmLevelSession=true;
   const line='艾里亚斯：'+livingTaskLine(id,this.survey.code);this.navigationConsole.recordDialogue(line);this.feedback('【GM无视频 · 非真实录像 · 禁写正式存档】'+line);
   this.refresh();if(this.evidenceReady)this.run.campaign.record(this.index,'film');return;
  }
  const tape=this.run.tapes.find(t=>t.id==='living.task.'+id),e=tape?.siteEvidence as {livingTask?:LivingTaskId;generated?:boolean;code?:string}|undefined;
  if(!tape||tape.ready===false||tape.videoResult!=='video'||e?.livingTask!==id||!e?.generated||!tape.cacheKey?.startsWith('living-task:'+id+':')||!hasRemotePlaylist(tape.cacheKey)||id==='L2-S06'&&e?.code!==this.survey.code||!this.survey.acceptVideo(id))return;
  const line='艾里亚斯：'+livingTaskLine(id,this.survey.code);tape.analyzed=true;tape.report=['剧情任务录像 · 无需核验',line];
  this.navigationConsole.recordDialogue(line);this.feedback(line);this.refresh();
  if(this.evidenceReady)this.run.campaign.record(this.index,'film');
 }
 analyzeEvidence(snapshot:unknown):string[]{
  if(this.debugNoVideo&&!isNoVideoMode())return ['诊断进度暂停，不能变成正式录像证据。'];
  const v=snapshot as {capture:SurveyCapture&{livingTask?:LivingTaskId;generated?:boolean;code?:string};media:{playable:boolean;source?:string;mediaId?:string}};
  if(!v?.capture||!v.media?.playable||v.media.source!=='generated-video')return ['需要生成并可播放的真实录像；本地感光帧不会授予正式进度。'];
  const id=v.capture.livingTask;
  if(id){
   if(this.survey.accepted.includes(id))return ['剧情任务录像无需核验；收到后已自动登记。','艾里亚斯：'+livingTaskLine(id,this.survey.code)];
   if(!this.survey.accepted.includes(id)&&this.survey.pending!==id)return ['这卷是艾里亚斯较早的回传，现场进展已经越过它要求的事，不再作为任务核验。等待他按当前情况发来的新录像。',this.survey.objective];
   const tape=this.run.tapes.find(t=>t.id===v.media.mediaId);
   if(!v.capture.generated||!tape||tape.videoResult!=='video'||JSON.stringify(tape.siteEvidence)!==JSON.stringify(v.capture)||!tape.cacheKey?.startsWith('living-task:'+id+':')||!hasRemotePlaylist(tape.cacheKey)||tape.id!=='living.task.'+id||id==='L2-S06'&&v.capture.code!==this.survey.code||!this.survey.acceptVideo(id))return ['此卷任务录像已核验、不可播放或不属于本局当前任务。'];
   const line='艾里亚斯：'+livingTaskLine(id,this.survey.code);this.navigationConsole.recordDialogue(line);this.feedback(line);this.refresh();return [line,this.survey.objective];
  }
  const film=this.run.tapes.find(t=>t.id===v.media.mediaId);
  if(!film||film.legId!==this.run.leg.id||film.videoResult!=='video'||JSON.stringify(film.siteEvidence)!==JSON.stringify(v.capture)||!film.cacheKey||!hasRemotePlaylist(film.cacheKey))return ['本卷底片尚无对应的可播放生成录像，请等待下载或重试。'];
  const accepted=this.survey.analyze(v.capture);this.refresh();
  if(!accepted)return ['未确认底片：'+this.evidenceFailure(v.capture)];
  if(v.capture.target!=='manual')this.creatures.markIdentified(v.capture.target===1?'shade':'blind');
  return [v.capture.target==='manual'?'说明牌核验：S支路向实验回流管输送含硫温水。关闭S阀；C为冷却回流，不要动它。':'公司收件回执：生物调查'+(Number(v.capture.target)+1)+'已登记。保留艇内原片。',this.survey.objective];
 }

 // ------------------------------------------------------------------ tick
 tick(dt:number){
  if(this.disposed||!finite(dt)||dt<=0)return;
  dt=Math.min(dt,.25);this.elapsed+=dt;
  const pod=this.vec();
  if(!this.ended){
   if(this.debugNoVideo&&!isNoVideoMode())return;
   this.feedback(this.survey.tick(dt,pod[0]));this.refresh();
   this.taskPlayer.tick(this.survey.pending,this.survey.code,this.run.narrativeMemory.elias==='injured',this.survey.upcoming);
   this.advanceStoryTask();
   if(livingSpaceAt(pod)==='E'&&pod[1]<LIVING_SURVEY_EXIT_Y){this.feedback(this.survey.operate('exit',true));this.refresh();}
   const cr=this.creatures.tick(dt,{pod,heading:this.run.heading,lampOn:this.lit(),lampRange:LAMP_RANGE,lampHalfAngle:LAMP_HALF_ANGLE,pulse:this.pendingPulse,activePowered:this.activeNoise,
    speed:Math.abs(this.run.pilot.speed),noiseBursts:this.bursts.splice(0),armOut:armOut(this.run.arm),gateOpen:this.s.gateOpen,extraLumens:this.s.extraLumens});
   this.pendingPulse=false;this.lastCreature=cr;
   for(const e of cr.events)this.event(e);
   for(const c of cr.cues)this.run.onCue?.(c,.6);
   if(cr.damage>0)this.hurt(cr.damage,cr.shake||.6);else if(cr.shake>0)this.run.onShake?.(cr.shake);
   if(cr.push.some(v=>Math.abs(v)>1e-4)){const next=this.position.clone().add(v3(cr.push));if(this.clear(next))this.position.copy(next);}
   if(cr.lensBlocked&&!this.lensWasBlocked)this.event(cr.clinging.length?'镜头被遮住了。现在曝光只会拍到贴在镜头上的东西。':'鱼群扑满了镜头。现在曝光只会拍到一片乱晃的鳞光。',4);
   this.lensWasBlocked=cr.lensBlocked;
   const alarm=this.run.hull<=.25?2:this.run.hull<=.5?1:0;
   if(alarm>this.hullAlarm)this.event(alarm===2?`船体完整度 ${Math.round(this.run.hull*100)}%：红灯加急闪烁。再挨几下艇壳就会破。`:`船体完整度跌破 50%（现 ${Math.round(this.run.hull*100)}%）：舱内转入红色应急照明。别再被撞，也别让东西贴住舷窗。`,6);
   this.hullAlarm=alarm;
   this.watchPower();
   if(this.armObject&&cr.armBlocked&&this.run.arm.phase==='aiming'&&!this.pendingCargo){this.run.retractArm();this.event('舷窗外有东西压住了机械臂舱口，机械臂被迫收回。',6);}
   if(this.s.complete){this.ended=true;this.run.pilot.stop();this.run.storyCaption=END_TEXT;this.run.storyCaptionLeft=30;this.run.pushLog(END_TEXT,'good');}
  }
  const target={heat:+this.s.valves.heat,feed:+this.s.valves.feed,cool:+this.s.valves.cool};
  for(const k of ['heat','feed','cool'] as ValveKey[])this.valveTurn[k]+=Math.sign(target[k]-this.valveTurn[k])*Math.min(Math.abs(target[k]-this.valveTurn[k]),dt*.8);
  this.gateLift=this.s.gateOpen?Math.min(1,this.gateLift+dt/6):0;
  this.surveyGateLift=this.survey.unlocked?Math.min(1,this.surveyGateLift+dt/3):0;
  const beat:{line:string|null;seconds:number;effects:string[]}={line:null,seconds:0,effects:[]};
  if(beat.line){this.run.storyCaption=beat.line;this.run.storyCaptionLeft=beat.seconds??6;this.run.pushLog(beat.line,'neutral');this.navigationConsole.recordDialogue(beat.line);this.speak(beat.line);}
  for(const e of beat.effects){if(e==='radioCut'){this.run.onCue?.('radio.squelch',.8);this.run.onShake?.(.15);}else if(e==='reunion')this.run.onCue?.('knowledge.gain',.7);else this.run.onCue?.('radio.squelch',.4);}
  this.navigationConsole.tick(dt);
  this.nameLocalTapes();
  if(this.pendingTapes.length&&this.elapsed>=this.tapeRetryAt)this.flushTapes();
  this.threatBeep(dt);
 }
 private threatBeep(dt:number){
  this.retainedThreatContacts();
  if(!this.activeNoise)return;
  const near=this.threatContacts().reduce((m,c)=>Math.min(m,c.distance),Infinity);
  if(!Number.isFinite(near))return;
  this.threatBeepLeft-=dt;
  if(this.threatBeepLeft<=0){this.run.onCue?.('sonar.threat',.4);this.threatBeepLeft=.18+1.42*Math.min(1,near/SONAR_RANGE);}
 }
 gmKillCreatures(radius:number){return this.creatures.gmKill(this.vec(),radius);}
 private threatContacts(){
  const solids=this.solids(this.position,SONAR_RANGE+4,false);
  return this.creatures.views.filter(c=>c.type!=='swarm').map(c=>({c,distance:v3(c.position).distanceTo(this.position)})).filter(({c,distance})=>{
   if(distance>SONAR_RANGE)return false;
   if(distance<.01)return true;
   const ray=new T.Ray(this.position,v3(c.position).sub(this.position).normalize()),hit=new T.Vector3();
   return !solids.some(b=>ray.intersectBox(b,hit)&&hit.distanceTo(this.position)<distance-.5);
  });
 }
 private trackedThreats=new Set<string>();
 private retainedThreatContacts(){
  const nearby=this.creatures.views.filter(c=>c.type!=='swarm').map(c=>({c,distance:v3(c.position).distanceTo(this.position)})).filter(x=>x.distance<=SONAR_RANGE);
  const ids=new Set(nearby.map(x=>x.c.id));
  for(const id of this.trackedThreats)if(!ids.has(id))this.trackedThreats.delete(id);
  if(this.activeNoise)for(const {c} of this.threatContacts())this.trackedThreats.add(c.id);
  return nearby.filter(x=>this.trackedThreats.has(x.c.id));
 }

 // ------------------------------------------------------------------ remote tapes
 private nameLocalTapes(){
  // The run labels local film with the legacy leg table's site name; this level has its own.
  for(const tape of this.run.tapes){
   const e=tape.siteEvidence as SurveyCapture|undefined;
   if(!String(e?.id??'').startsWith('living.shot.'))continue;
   tape.siteName=LOCAL_TAPE_NAME+' · '+(e?.valid&&e.lit?this.describeEvidence(e):'未确认目标');
  }
 }
 private flushTapes(){
  while(this.pendingTapes.length){
   const t=this.pendingTapes[0]!;
   let frames:string[]=[];
   try{frames=this.renderTape(t);}catch(err){console.warn('[living] remote tape render failed',err);this.tapeRetryAt=this.elapsed+2;return;}
   const siteName=t.kind==='securityLog'?'安保员遗留的探头录像':partnerName(this.s.story)+'的探头录像';
   const ok=this.run.receiveRemoteTape({id:t.id,siteName,frames,siteEvidence:{remote:true,tapeId:t.id},note:`收到${siteName}（${frames.length}帧）。到分析台播放核验。`});
   if(!ok&&!this.run.tapes.some(x=>x.id===t.id)){this.tapeRetryAt=this.elapsed+2;return;}
   this.pendingTapes.shift();
  }
 }
 private probePose(shot:string){
  const authored=(this.world.probeShots as Partial<Record<string,{position:Vec3;target:Vec3;fov:number}>>)[shot];
  return SITE_SHOTS[shot]??authored??FALLBACK_SHOTS[shot]??FALLBACK_SHOTS['gate-inner']!;
 }
 private renderTape(t:RemoteTape):string[]{
  if(typeof document==='undefined')throw new Error('no document');
  const W=SENSOR.width,H=SENSOR.height,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  // The guard filmed his archive alive at the nutrient-line joint; the console framing would show his own body.
  // Result reels open on the intro's slime-wall framing so the valve choice reads as a before/after of the same wall.
  const own=t.kind==='securityLog'?['pipe-bands','slime-wall']:t.kind==='slimeCleared'&&this.s.story?.records&&this.s.story.partner==='elias'?t.shots:RESULT_SHOTS[t.kind]??t.shots;
  const ctx=canvas.getContext('2d')!,shots=own.length?own:['gate-inner'],count=Math.max(8,shots.length*3),frames:string[]=[];
  const label=t.kind==='securityLog'?'SEC-PROBE 02 · ARCHIVE':this.s.story?.partner==='keeper'?'PROBE-07 / ZHOU CEN':'PROBE-07 / ELIAS';
  this.tapeOverride={kind:t.kind};
  try{
   for(let i=0;i<count;i++){
    const shot=shots[Math.min(shots.length-1,Math.floor(i*shots.length/count))]!,pose=this.probePose(shot),k=i*.9;
    const position=v3(pose.position).add(new T.Vector3(Math.sin(k*1.7)*.05,Math.sin(k*2.3)*.035,Math.cos(k*1.3)*.05));
    const target=v3(pose.target).add(new T.Vector3(Math.sin(k*1.1)*.12,Math.cos(k*1.9)*.08,Math.sin(k*.7)*.12));
    this.probeView={position,target,fov:pose.fov,alexInFrame:shot==='alex-glass'};
    this.renderView(ctx,W,H,true);
    ctx.save();ctx.fillStyle='rgba(230,236,220,.82)';ctx.font='26px monospace';ctx.fillText(`${label}  REC ${String(Math.floor(i*.5/60)).padStart(2,'0')}:${String(Math.floor(i*.5)%60).padStart(2,'0')}`,22,40);ctx.restore();
    frames.push(canvas.toDataURL('image/jpeg',.78));
   }
  }finally{this.probeView=null;this.tapeOverride=null;this.world.setFocus(this.vec());}
  return frames;
 }

 // ------------------------------------------------------------------ visuals
 private material(color:string,extra:Partial<T.MeshStandardMaterialParameters>={}){return new T.MeshStandardMaterial({color,roughness:.7,metalness:.1,...extra});}
 private buildFallbackItems(){
  const has=(id:string)=>this.world.interactables.has(id)||this.world.photoTargets.has(id)||!!this.world.root.getObjectByName(id);
  for(const item of LIVING_ITEMS){
   if(has(item.id))continue;
   const g=new T.Group();g.position.copy(v3(item.position));g.rotation.y=-T.MathUtils.degToRad(item.face);g.name=`${item.id}.fallback`;
   if(item.kind==='box'){
    const colors:Record<string,string>={'living.box.battery':'#c9a227','living.box.tools':'#b2412c','living.box.probe':'#d0cfc4','living.box.ballast':'#3d4446'};
    const b=new T.Mesh(new T.BoxGeometry(1.35,.9,.96),this.material(colors[item.id]??'#999',{metalness:.35,roughness:.5}));b.castShadow=true;g.add(b);
    const strap=new T.Mesh(new T.BoxGeometry(1.38,.12,.98),this.material('#1d1f20'));g.add(strap);
    if(item.id==='living.box.probe'){const body=new T.Mesh(new T.CapsuleGeometry(.3,1.2,6,10),this.material('#2a3134'));body.rotation.z=Math.PI/2.4;body.position.set(-.9,.1,.5);g.add(body);}
   }else if(item.kind==='terminal'){
    const key=(Object.keys(VALVE_ITEM) as ValveKey[]).find(k=>VALVE_ITEM[k]===item.id)!;
    const wheel=new T.Mesh(new T.TorusGeometry(.42,.05,8,24),this.material('#6d6a62',{metalness:.8,roughness:.4}));wheel.name='wheel';
    const ring=new T.Mesh(new T.TorusGeometry(.2,.06,8,20),this.material(VALVE_COLOR[key],{emissive:VALVE_COLOR[key],emissiveIntensity:.15}));
    const pipe=new T.Mesh(new T.CylinderGeometry(.16,.16,2.4,12),this.material('#4c4f4c',{metalness:.7,roughness:.5}));pipe.position.y=-.2;
    wheel.position.z=.25;ring.position.z=.25;g.add(pipe,wheel,ring);g.userData.valve=key;
   }else if(item.kind==='pipe'){
    const ring=new T.Mesh(new T.TorusGeometry(.42,.09,10,24),this.material('#8a7f68',{metalness:.7,roughness:.45}));ring.position.z=.2;g.add(ring);
   }else if(item.kind==='photo'){
    const paper=new T.Mesh(new T.PlaneGeometry(item.id==='living.photo.code'?.35:1.1,item.id==='living.photo.code'?.25:.8),this.material('#d9d3bf',{roughness:.95,side:T.DoubleSide}));
    if(item.id==='living.photo.code'){paper.rotation.x=-Math.PI/2;const body=new T.Mesh(new T.CapsuleGeometry(.3,1.2,6,10),this.material('#3b3a36'));body.rotation.z=Math.PI/2;body.position.set(.6,-.25,0);g.add(body);}
    else paper.position.z=.25;
    g.add(paper);
   }else if(item.kind==='uplink'){
    const frame=new T.Mesh(new T.TorusGeometry(.4,.06,8,24),this.material('#7a6b52',{metalness:.7}));g.add(frame);
   }
   this.fallback.add(g);this.fallbackItems.set(item.id,g);
  }
  if(!this.world.gate.mesh.parent){
   const b=this.world.gate.bounds,size=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3());
   this.fallbackGate=new T.Mesh(new T.BoxGeometry(size.x,size.y,size.z),this.material('#3e4447',{metalness:.75,roughness:.45}));
   this.fallbackGate.position.copy(c);this.fallback.add(this.fallbackGate);
  }
 }
 private creatureMesh(type:CreatureType):T.Object3D{
  const g=new T.Group();
  if(type==='lumen'){
   const skin=this.material('#c9c4b4',{roughness:.5,transparent:true,opacity:.92});
   const torso=new T.Mesh(new T.CapsuleGeometry(.3,.9,6,10),skin);const head=new T.Mesh(new T.SphereGeometry(.22,14,10),skin);head.position.y=.8;
   const tail=new T.Mesh(new T.ConeGeometry(.28,1.4,10),skin);tail.position.y=-1.1;tail.rotation.x=Math.PI;
   g.add(torso,head,tail);
   for(let i=0;i<9;i++){const d=new T.Mesh(new T.SphereGeometry(.035,6,6),new T.MeshBasicMaterial({color:'#7fe6e0'}));d.position.set(Math.sin(i*2.1)*.3,.6-i*.17,Math.cos(i*2.1)*.3);g.add(d);}
  }else if(type==='shade'){
   const m=this.material('#b79a9a',{transparent:true,opacity:.6,roughness:.3});
   const body=new T.Mesh(new T.CapsuleGeometry(.28,3.4,6,12),m);body.rotation.x=Math.PI/2;g.add(body);
   for(const x of [-.12,.12]){const eye=new T.Mesh(new T.CylinderGeometry(.06,.06,.3,8),this.material('#e9e2c0',{emissive:'#554',emissiveIntensity:.3}));eye.rotation.x=Math.PI/2;eye.position.set(x,.15,-1.95);g.add(eye);}
  }else if(type==='blind'){
   const m=this.material('#2e3336',{roughness:.55});
   const body=new T.Mesh(new T.CapsuleGeometry(.45,2.2,6,12),m);body.rotation.x=Math.PI/2;g.add(body);
   const jaw=new T.Mesh(new T.ConeGeometry(.42,.9,10),m);jaw.rotation.x=-Math.PI/2;jaw.position.z=-1.9;g.add(jaw);
   for(let i=0;i<8;i++)for(const x of [-.44,.44]){const p=new T.Mesh(new T.SphereGeometry(.04,6,6),this.material('#0b0d0e'));p.position.set(x,.05,-1+i*.28);g.add(p);}
  }else{
   const n=140,pos=new Float32Array(n*3);let seed=7;const r=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
   for(let i=0;i<n;i++){const a=r()*Math.PI*2,rr=Math.sqrt(r())*1.6;pos[i*3]=Math.cos(a)*rr;pos[i*3+1]=(r()-.5)*1.4;pos[i*3+2]=Math.sin(a)*rr;}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));
   g.add(new T.Points(geo,new T.PointsMaterial({color:'#cfe8e4',size:.07,transparent:true,opacity:.85})));
  }
  return g;
 }
 private worldState(recording:boolean):LivingWorldState{
  const s=this.s,over=this.tapeOverride;
  const slime=over?TAPE_SLIME[over.kind]:s.slime;
  let alex=this.alexPose();
  if(this.probeView)alex=this.probeView.alexInFrame?{position:[this.probeView.target.x,this.probeView.target.y,this.probeView.target.z],heading:90,visible:true,pose:'film'}:{...alex,visible:false};
  return {time:this.elapsed,recording,lamp:this.lit()&&!this.probeView,collected:s.collected,probe:s.probe,valves:{...s.valves},valveTurn:{...this.valveTurn},slime,gateOpen:this.gateLift,alex:{...alex,identity:this.s.story?.partner},
   survey:{doorOpen:this.surveyGateLift},creatures:[]};
 }
 private syncVisuals(state:LivingWorldState,dt:number){
  try{this.world.update(state,dt);}catch(err){console.warn('[living] world.update failed',err);}
  for(const [id,obj] of this.fallbackItems){
   const authored=this.world.interactables.has(id)||this.world.photoTargets.has(id);
   obj.visible=!authored&&!(ITEMS.get(id)!.kind==='box'&&this.s.collected.includes(id));
   const valve=obj.userData.valve as ValveKey|undefined;
   if(valve){const w=obj.getObjectByName('wheel');if(w)w.rotation.z=this.valveTurn[valve]*Math.PI*1.5;}
  }
  if(this.fallbackGate){const b=this.world.gate.bounds,h=b.max.y-b.min.y;this.fallbackGate.position.y=(b.min.y+b.max.y)/2+this.gateLift*h*.95;}
 }
 private renderView(ctx:CanvasRenderingContext2D,w:number,h:number,recording:boolean){
  const {renderer}=sharedExpeditionRenderer();
  if(this.width!==w||this.height!==h){renderer.setSize(w,h,false);this.view.setSize(w,h);this.width=w;this.height=h;}
  const probe=this.probeView;
  if(probe){this.camera.position.copy(probe.position);this.camera.up.set(0,1,0);this.camera.lookAt(probe.target);this.camera.fov=probe.fov;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
  else this.pose();
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  const eye=this.camera.position.clone();
  this.world.setFocus([eye.x,eye.y,eye.z]);
  this.syncVisuals(this.worldState(recording),0);
  this.salvageArm.root.visible=!probe;
  if(!probe)this.salvageArm.update(this.run.arm,this.elapsed,this.armAnchor?this.camera.worldToLocal(this.armAnchor.clone()):undefined,this.armNormal.clone().transformDirection(this.camera.matrixWorldInverse));
  const now=typeof performance!=='undefined'?performance.now()/1000:this.elapsed;
  const dt=this.renderClock<0?1/60:Math.min(.1,Math.max(1/240,now-this.renderClock));this.renderClock=now;
  // Live porthole = crushed real-time optics; film exposures and probe footage use the recording profile.
  const frame={mode:recording||probe?'recording' as const:'live' as const,time:this.elapsed,lampOn:!probe&&this.lit(),probe:!!probe};
  const subject=recording&&!probe?this.viewfinder():null;
  if(!subject){this.view.frame(frame);this.view.render(dt);ctx.drawImage(renderer.domElement,0,0,w,h);return;}
  // Film of an evidence subject: spot-meter on its projected box, add the camera's coaxial fill with inverse-square
  // falloff, and thin the haze between lens and subject. Visual only: validity is still decided by computeSeen.
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  const P=this.view.profile('recording'),base=P.exposure,fresh=this.elapsed-this.meter.at>1.5||this.meter.at>this.elapsed;
  const r=this.projectBox(this.subjectBox(subject.id))??subject.rect,rx=Math.floor((r[0]+1)/2*w),ry=Math.floor((1-r[3])/2*h),rw=Math.max(2,Math.ceil((r[2]-r[0])/2*w)),rh=Math.max(2,Math.ceil((r[3]-r[1])/2*h));
  let gain=fresh?1:this.meter.gain;
  try{
   for(let pass=0;pass<(fresh?3:1);pass++){
    P.exposure=base*gain;this.view.frame(frame);this.flashAndClear(subject.distance+.6);this.view.render(dt);
    ctx.drawImage(renderer.domElement,0,0,w,h);
    const m=this.spotLuma(ctx,rx,ry,rw,rh);if(!m)break;
    // Mean of the subject toward .36 (≈.49 after the sensor curve), its brightest tenth under .85 and brightest 1% under
    // .93 — paper and labels are small, bright parts of the box and are what must not bloom.
    const next=T.MathUtils.clamp(gain*Math.min(Math.pow(.36/Math.max(.02,m.mean),2),Math.pow(.85/Math.max(.05,m.p90),2),Math.pow(.93/Math.max(.05,m.p99),2)),.35,4);
    const settled=Math.abs(next-gain)/gain<.1;gain=next;if(settled)break;
   }
  }finally{P.exposure=base;this.restoreFill();}
  this.meter={gain,at:this.elapsed};
 }
 private fillSaved:{color:T.Color;distance:number;decay:number}|null=null;
 private flashAndClear(distance:number){
  const fill=this.view.fill;
  if(this.lit()){
   if(!this.fillSaved)this.fillSaved={color:fill.color.clone(),distance:fill.distance,decay:fill.decay};
   fill.color.set('#f1e8d6');fill.decay=2;fill.distance=distance*2.4+2;fill.intensity=3.5*distance*distance;
  }
  // Keep ≥55% of the subject's light through the medium: clamp extinction to ln(1/.55)/d for this exposure.
  const sigmaMax=.6/Math.max(1,distance);
  if(this.scene.fog instanceof T.FogExp2&&this.scene.fog.density>sigmaMax){
   const k=sigmaMax/this.scene.fog.density;this.scene.fog.density=sigmaMax;
   const vol=this.view.composer.passes.find(p=>'scatterMat'in p) as unknown as {scatterMat?:{uniforms:Record<string,{value:number}>}}|undefined;
   const u=vol?.scatterMat?.uniforms;if(u?.density)u.density.value*=k;if(u?.sigma)u.sigma.value*=k;
   const o=this.view.optics as unknown as {uSigma?:{value:number}};if(o.uSigma)o.uSigma.value*=k;
  }
 }
 private restoreFill(){
  if(!this.fillSaved)return;const f=this.view.fill;f.color.copy(this.fillSaved.color);f.distance=this.fillSaved.distance;f.decay=this.fillSaved.decay;this.fillSaved=null;
 }
 private spotLuma(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  try{
   const d=ctx.getImageData(x,y,w,h).data,step=Math.max(1,Math.floor(Math.sqrt(w*h/4000))),hist=new Uint32Array(64);let sum=0,n=0;
   for(let j=0;j<h;j+=step)for(let i=0;i<w;i+=step){const k=(j*w+i)*4,l=(.2126*d[k]!+.7152*d[k+1]!+.0722*d[k+2]!)/255;sum+=l;n++;hist[Math.min(63,Math.floor(l*64))]!++;}
   if(!n)return null;let acc=0,p90=1,p99=1,got90=false;
   for(let b=0;b<64;b++){acc+=hist[b]!;if(!got90&&acc>=n*.9){p90=(b+1)/64;got90=true;}if(acc>=n*.99){p99=(b+1)/64;break;}}
   return {mean:sum/n,p90,p99};
  }catch{return null;}
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,_time:number,recording=true){
  if(this.disposed)return;
  this.renderView(ctx,w,h,recording);
  if(this.lastCreature?.lensBlocked){
   ctx.save();const g=ctx.createRadialGradient(w*.5,h*.48,h*.05,w*.5,h*.5,h*.7);
   g.addColorStop(0,'rgba(170,190,180,.55)');g.addColorStop(.55,'rgba(70,90,88,.72)');g.addColorStop(1,'rgba(8,12,12,.9)');
   ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
   ctx.restore();
  }
 }

 // ------------------------------------------------------------------ HUD
 private interactionHint(){
  // Match the first chapter: only the aimed physical interaction belongs on the glass.
  // Dialogue and event feedback already use the shared bottom subtitle channel.
  if(this.ended)return this.objective;
  const phase=this.run.arm.phase;
  if(phase!=='stowed'){
   const name=this.armObject?ITEMS.get(this.armObject)?.name??'':'';
   if(phase==='aiming')return this.pendingCargo?`${name} · 已夹持 · F 收回机械臂，收妥后入库`:`${name} · 机械臂已伸出 · 对准箱体按 F 夹取 · C 收臂`;
   return `${name} · ${ARM_PHASE_CN[phase]} · 请等待动作完成`;
  }
  const aim=this.aimed();
  if(aim){
   const {item,distance}=aim;
   if(item.kind==='photo')return this.objective;
   const action=item.kind==='uplink'?(distance<=UPLINK_REACH?'F 推送已核验的录像':'再靠近观察窗'):distance>REACH?'再靠近到 3.4 米内':item.kind==='box'?'F 伸出机械臂':'F 操作';
   return `${item.name} · ${distance.toFixed(1)} 米 · ${action}${item.kind==='box'?this.aimNudge(item):''}`;
  }
  return this.objective;
 }
 /** GAP (provisional): low-power warnings and a one-time emergency reserve so an empty battery cannot soft-lock the arm. */
 private watchPower(){
  const p=this.run.power,battery=!this.s.collected.includes('living.box.battery');
  const where=battery?`R2 机修间货架上有应急电池箱（领航台坐标 ${formatCoords(ITEMS.get('living.box.battery')!.position,LIVING_DATUM_DEPTH)}）。`:'';
  const cells=this.run.count('sup.cell');
  if(p>.4)this.powerWarned=0;
  if(p<=.35&&this.powerWarned<1){this.powerWarned=1;this.event(`电量 ${Math.round(p*100)}%。推进、声纳发射和摄影分析都要用电，先确认方向，少走回头路。${cells?`还有 ${cells} 组备用电池，可在生命维持台接入。`:''}${where}`,8);}
  if(p<=.15&&this.powerWarned<2){this.powerWarned=2;this.event(`电量只剩 ${Math.round(p*100)}%。${cells?'去生命维持台接入备用电池。':where||'停止不必要的声纳发射；停稳确认取景，再曝光。'}`,8);}
  if(p<=.03&&!cells&&!this.reserveUsed){
   this.reserveUsed=true;this.run.power=Math.max(this.run.power,.3);
   this.event(`主电池见底，应急储备电池自动并入（一次性）。${where||'省着用。'}`,10);
  }
  if(this.run.power<=.02&&!cells&&this.reserveUsed&&this.powerWarned<3){
   this.powerWarned=3;
   this.event(this.debugNoVideo?'电池和应急储备已耗尽。当前为GM诊断局，不写正式存档；需重新开始测试。':'电池和应急储备已耗尽，设备无法供电。当前耗尽状态不会覆盖检查点；若有可用航行记录，可刷新后选择“继续下潜”恢复。',14);
  }
 }
 /** Close to the current stage's physical target but not aimed at it: name its side relative to the bow and the turn key. */
 private stageTargetHint(){
  const s=this.s,f=this.survey,id=!f.camera?'living.box.probe':!f.shared?(f.called?'living.pipe.intake':null):f.helpReplied&&!f.valve?'living.valve.feed':f.clearSeen&&!f.unlocked?'living.survey.lock':f.photos.length===3&&!f.reunion?'living.uplink.gate':f.reunion&&!f.ballast?'living.box.ballast':null;
  const item=id?ITEMS.get(id):undefined;if(!item||(item.kind==='box'&&s.collected.includes(item.id)))return null;
  const c=item.kind==='box'?this.boxBounds(item.id).getCenter(new T.Vector3()):v3(item.position),dx=c.x-this.position.x,dz=c.z-this.position.z,d=Math.hypot(dx,dz);
  if(d>(livingSpaceAt(this.vec())===item.space?30:14))return null;
  const rel=((Math.atan2(dx,-dz)*180/Math.PI-this.run.heading)%360+540)%360-180,reach=item.kind==='uplink'?UPLINK_REACH:REACH;
  const turn=Math.abs(rel)<12?(d>reach?`在船头正前方 · 空格推进到 ${reach} 米内`:'在船头正前方 · 对准后按 F'):`在${rel<0?'左':'右'}侧 ${Math.abs(rel).toFixed(0)}° · 按住 ${rel<0?'J':'L'} 转船头`;
  return `${item.name} · 约 ${d.toFixed(1)} 米 · ${turn}${Math.abs(this.run.camPan)>.1?' · 镜头已偏转，按 H 回中':''}`;
 }
 private aimNudge(item:LivingItem){
  const c=this.boxBounds(item.id).getCenter(new T.Vector3()),to=c.sub(this.position),dir=this.viewDir();
  const yaw=Math.atan2(to.x,-to.z)-Math.atan2(dir.x,-dir.z),side=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  const pitch=Math.atan2(to.y,Math.hypot(to.x,to.z))-Math.asin(Math.max(-1,Math.min(1,dir.y)));
  const parts=[Math.abs(side)>.08?(side>0?'偏右 → 按→':'偏左 → 按←'):'',Math.abs(pitch)>.08?(pitch<0?(this.run.camTilt>=.45?'在下方 → 镜头已压到底，按 PageDown 下潜':'在下方 → 按↓'):(this.run.camTilt<=-.45?'在上方 → 按 PageUp 上浮':'在上方 → 按↑')):''].filter(Boolean);
  return parts.length?` · 箱体${parts.join('，')}`:'';
 }
 drawInteraction(ctx:CanvasRenderingContext2D,w:number,h:number){
  const text=this.interactionHint();if(text===this.objective)return;
  ctx.save();ctx.font=`${Math.max(13,h*.034)}px Microsoft YaHei`;ctx.textAlign='left';ctx.textBaseline='top';
  const lines=layoutCJK(ctx,text,w*.9),y=h*.83,lineHeight=h*.045;ctx.fillStyle='rgba(3,10,5,.66)';ctx.fillRect(0,y,w,Math.min(h-y,lines.length*lineHeight+8));
  ctx.shadowColor='#659d43';ctx.shadowBlur=2;ctx.fillStyle='#b6e889';lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,w*.035,y+4+i*lineHeight));ctx.restore();
 }
 private windowLocks=new WindowLocks();
 resetWindowFocus(){this.windowLocks.reset();}
 drawWindowLocks(ctx:CanvasRenderingContext2D,w:number,h:number){
  this.pose();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  this.windowLocks.draw(ctx,w,h,this.camera,()=>this.solids(undefined,14,false),()=>LIVING_ITEMS
   .filter(i=>i.kind!=='box'||!this.s.collected.includes(i.id))
   .map(i=>({id:i.id,bounds:this.boxBounds(i.id),reach:i.kind==='uplink'?UPLINK_REACH:REACH,enabled:i.kind!=='photo'&&(i.kind!=='pipe'||this.s.probe==='carried'),label:i.name})));
 }
 private drawSonarBase(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated:boolean){
  const size=dedicated?Math.min(w,h/.93):Math.min(w*(this.run.lit?.28:.40),h*.66),x=dedicated?0:w-size-w*.025,y=dedicated?0:h*.22;
  const cx=x+size/2,cy=y+size*.48,radius=size*.30,scale=radius/SONAR_RANGE;
  const solids=this.solids(this.position,SONAR_RANGE*Math.SQRT2+4,false);
  if(time-this.sonarAt>.1||time<this.sonarAt||!this.sonarReturns.length){this.sonarReturns=scanNavigationSonar(this.position,this.run.heading,solids);this.sonarAt=time;}
  ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(3,10,14,.91)';ctx.fillRect(x,y,size,size*.93);ctx.strokeStyle='#50666e';ctx.lineWidth=1;ctx.strokeRect(x,y,size,size*.93);
  const font=Math.max(11,size*.035);ctx.font=`${font}px "Microsoft YaHei",monospace`;
  ctx.fillStyle='#cadcda';ctx.fillText('艇首 ↑ / 航向 '+sonarHeading(this.run.heading),x+size*.04,y+size*.055);
  ctx.fillStyle='#71878b';ctx.fillText('24m · 主动脉冲 · 2.4秒/圈',x+size*.04,y+size*.105);
  let above=24,below=24;
  for(const b of solids){
   if(b.max.x<this.position.x-1.4||b.min.x>this.position.x+1.4||b.max.z<this.position.z-1.4||b.min.z>this.position.z+1.4)continue;
   if(b.min.y>=this.position.y)above=Math.min(above,Math.max(0,b.min.y-this.position.y-1.5));
   if(b.max.y<=this.position.y)below=Math.min(below,Math.max(0,this.position.y-b.max.y-1.5));
  }
  ctx.fillStyle=SONAR_STATIC;ctx.fillText(`顶 ${above.toFixed(1)}m / 底 ${below.toFixed(1)}m`,x+size*.04,y+size*.15);
  for(const n of [8,16,24]){ctx.strokeStyle='#294047';ctx.beginPath();ctx.arc(cx,cy,n*scale,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(cx-radius,cy);ctx.lineTo(cx+radius,cy);ctx.moveTo(cx,cy-radius);ctx.lineTo(cx,cy+radius);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.rect(cx-radius,cy-radius,radius*2,radius*2);ctx.clip();
  ctx.strokeStyle=SONAR_STATIC;ctx.fillStyle=SONAR_STATIC;ctx.lineWidth=2;
  for(const contour of sonarMapContours(this.position,this.run.heading,solids,SONAR_RANGE)){
   ctx.beginPath();contour.forEach((p,i)=>{if(i)ctx.lineTo(cx+p.x*scale,cy+p.y*scale);else ctx.moveTo(cx+p.x*scale,cy+p.y*scale);});ctx.closePath();ctx.stroke();
  }
  ctx.globalAlpha=1;drawSonarSweep(ctx,cx,cy,radius,time);
  const heading=this.run.heading*Math.PI/180;
  for(const item of LIVING_ITEMS){
   if(item.kind==='box'&&this.s.collected.includes(item.id))continue;
   if(['living.photo.code','living.photo.guide','living.photo.delroy'].includes(item.id))continue;
   const dx=item.position[0]-this.position.x,dz=item.position[2]-this.position.z,dist=Math.hypot(dx,dz);
   if(dist>SONAR_RANGE*Math.SQRT2||dist<.01||Math.abs(item.position[1]-this.position.y)>3)continue;
   const side=dx*Math.cos(heading)+dz*Math.sin(heading),front=dx*Math.sin(heading)-dz*Math.cos(heading);
   const px=cx+side*scale,py=cy-front*scale;ctx.strokeStyle='#65ddd5';ctx.globalAlpha=1;ctx.strokeRect(px-3,py-3,6,6);
  }
  ctx.restore();
  drawSonarOwnship(ctx,cx,cy,12);ctx.restore();
  const [front,back,left,right]=[0,Math.PI,-Math.PI/2,Math.PI/2].map((a,i)=>Math.max(0,sonarRay(this.position,Math.sin(heading+a),-Math.cos(heading+a),solids)-(i<2?2.5:1.4)));
  this.sonarReadout={above,below,front:front!,back:back!,left:left!,right:right!};
 }
 sonarReadout?:{above:number;below:number;front:number;back:number;left:number;right:number};
 private drawThreats(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated:boolean){
  const size=dedicated?Math.min(w,h/.93):Math.min(w*(this.run.lit?.28:.40),h*.66),x=dedicated?0:w-size-w*.025,y=dedicated?0:h*.22,scale=size*.30/SONAR_RANGE;
  for(const {c,distance} of this.retainedThreatContacts()){
   const d=v3(c.position).sub(this.position),a=Math.atan2(d.x,-d.z)-this.run.heading*Math.PI/180;
   const r=Math.max(distance*scale,Math.max(12,2.5*scale)+12),px=x+size/2+Math.sin(a)*r,py=y+size*.48-Math.cos(a)*r;
   ctx.save();ctx.fillStyle=SONAR_THREAT;ctx.strokeStyle=SONAR_THREAT;ctx.lineWidth=2;ctx.globalAlpha=.8+.2*Math.sin(time*6);
   ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
 }
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated=false){
  if(typeof document==='undefined')return;
  if(!this.sonarEcho||this.sonarEcho.width!==w||this.sonarEcho.height!==h){this.sonarEcho=document.createElement('canvas');this.sonarEcho.width=w;this.sonarEcho.height=h;this.echoSweep=-1;}
  if(this.run.sweepPower>0&&this.run.sweepId!==this.echoSweep){this.echoSweep=this.run.sweepId;const c=this.sonarEcho.getContext('2d')!;c.clearRect(0,0,w,h);this.drawSonarBase(c,w,h,time,dedicated);}
  ctx.drawImage(this.sonarEcho,0,0);this.drawThreats(ctx,w,h,time,dedicated);
  ctx.save();ctx.fillStyle='#dfc98d';ctx.font='12px sans-serif';ctx.fillText(this.echoSweep<0?'开启脉冲获取回波':this.activeNoise?'主动声纳通电 · 持续发声':'历史回波 · 主动声纳断电',8,h-8);ctx.restore();
 }
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.navigationConsole.draw(ctx,w,h);}

 // ------------------------------------------------------------------ save
 /** Safe checkpoint: no film in progress, arm stowed, nothing clinging or hunting, no tape waiting to render. */
 get saveSafe(){
  if(this.pendingTapes.length||this.pendingCaptureId&&this.run.shot.phase!=='idle')return false;
  if(this.run.arm.phase!=='stowed'||this.pendingCargo)return false;
  return !this.creatures.views.some(c=>c.mode==='cling'||c.mode==='hunt');
 }
 snapshot():Snapshot{
  return {routeVersion:2,survey:this.survey.snapshot(),cargo:[...this.cargo],debugNoVideo:this.debugNoVideo,surveyGateLift:this.surveyGateLift,reserveUsed:this.reserveUsed,adapter:'living-deck',adapterVersion:1,index:1,levelId:'living.2',position:[this.position.x,this.position.y,this.position.z],heading:this.run.heading,pitch:this.run.pitch,
   elapsed:this.elapsed,sequence:this.sequence,ended:this.ended,deck:this.deck.snapshot(),creatures:this.creatures.snapshot(),dialogue:this.dialogue.snapshot(),
   navigation:this.navigationConsole.snapshot(),sonarDesk:structuredClone(sonarDeskState(this.run)),
   narrative:structuredClone(this.run.narrativeMemory),alexFollow:null,gateLift:this.gateLift};
 }
 static validate(value:unknown):value is Snapshot{
  const s=value as Snapshot;
  if(s?.narrative!==undefined&&!validNarrative(s.narrative))return false;
  if(!s||typeof s!=='object'||s.adapter!=='living-deck'||s.adapterVersion!==1||s.index!==1||s.levelId!=='living.2')return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(finite)||!finite(s.heading)||!finite(s.pitch)||!finite(s.elapsed)||s.elapsed<0)return false;
  if(!Number.isInteger(s.sequence)||s.sequence<0||typeof s.ended!=='boolean'||!finite(s.gateLift)||s.gateLift<0||s.gateLift>1)return false;
  if(s.alexFollow!==null&&(!Array.isArray(s.alexFollow)||s.alexFollow.length!==3||!s.alexFollow.every(finite)))return false;
  if(s.routeVersion!==2||typeof s.debugNoVideo!=='boolean'||typeof s.reserveUsed!=='boolean'||!finite(s.surveyGateLift)||s.surveyGateLift<0||s.surveyGateLift>1||!new LivingSurvey().restore(s.survey))return false;
  if(!Array.isArray(s.cargo)||new Set(s.cargo).size!==s.cargo.length||s.cargo.some(id=>!LIVING_ITEMS.some(i=>i.id===id&&i.kind==='box')))return false;
  if(s.survey.camera!==s.cargo.includes('living.box.probe')||s.survey.ballast!==s.cargo.includes('living.box.ballast')||s.ended!==s.survey.complete||!s.survey.unlocked&&s.surveyGateLift!==0)return false;
  if(!new LivingDeck().restore(structuredClone(s.deck)))return false;
  if(s.narrative&&s.deck.story&&s.narrative.partner!==s.deck.story.partner)return false;
  if(!new LivingCreatures(Math.random,'survey').restore(structuredClone(s.creatures)))return false;
  if(!new LivingDialogue().restore(structuredClone(s.dialogue)))return false;
  return LivingNavigation.validateSnapshot(s.navigation);
 }
 restore(value:unknown):boolean{
  if(!LivingDeckSite.validate(value)||value.debugNoVideo&&!isNoVideoMode())return false;
  const s=structuredClone(value);
  const deck=new LivingDeck(),creatures=new LivingCreatures(Math.random,'survey');deck.restore(s.deck);creatures.restore(s.creatures);
  const position=new T.Vector3(...s.position);
  const prevS=this.s;this.s=deck.snapshot();
  const solids=[...this.world.colliders,...LIVING_ITEMS.filter(i=>i.kind==='box'&&!s.cargo.includes(i.id)).map(i=>this.boxBounds(i.id)),...creatures.blockers().map(box3),...(!s.survey.reunion?[this.world.gate.bounds]:[]),...(s.surveyGateLift<.95?[this.world.surveyGate.bounds]:[])];
  const ok=harborHullClear(position,s.heading,this.world.walkable,solids);
  this.s=prevS;
  if(!ok||position.y<-8&&(!s.survey.ballast||!s.survey.reunion||livingSpaceAt(s.position)!=='E'))return false;
  const desk=s.sonarDesk as Record<string,unknown>|null;
  if(!desk||typeof desk!=='object'||!Array.isArray(desk.fields)||desk.fields.length!==3||!Array.isArray(desk.records)||!finite(desk.frequency))return false;
  this.survey.restore(s.survey);this.cargo=new Set(s.cargo);this.debugNoVideo=s.debugNoVideo;this.surveyGateLift=s.surveyGateLift;this.reserveUsed=s.reserveUsed;if(s.debugNoVideo)this.run.gmLevelSession=true;
  this.deck.restore(s.deck);this.creatures.restore(s.creatures);this.dialogue.restore(s.dialogue);this.navigationConsole.restore(s.navigation);
  Object.assign(sonarDeskState(this.run),structuredClone(desk));
  this.run.narrativeMemory=s.narrative?structuredClone(s.narrative):freshNarrative();this.refresh();this.dialogue.story=this.s.story;for(const t of this.s.identified)this.creatures.markIdentified(t);
  this.position.copy(position);this.run.heading=s.heading;this.run.pitch=s.pitch;
  this.elapsed=s.elapsed;this.sequence=Math.max(s.sequence,this.s.captures.length);this.ended=s.ended||this.s.complete;
  this.gateLift=s.survey.reunion?1:s.gateLift;
  this.valveTurn={heat:+this.s.valves.heat,feed:+this.s.valves.feed,cool:+this.s.valves.cool};
  this.pendingTapes=[];this.pendingCaptureId=null;this.pendingCargo=null;this.armObject=null;this.armAnchor=null;this.lastCreature=null;this.bursts=[];
  this.echoSweep=-1;this.sonarReturns=[];this.pendingPulse=false;
  this.world.setFocus(this.vec());
  return true;
 }
 private solidsFor(state:LivingState,creatures:LivingCreatures){
  const out=[...this.world.colliders];
  for(const i of LIVING_ITEMS)if(i.kind==='box'&&!state.collected.includes(i.id))out.push(this.boxBounds(i.id));
  for(const b of creatures.blockers())out.push(box3(b));
  if(!state.gateOpen)out.push(this.world.gate.bounds);
  return out;
 }

 // ------------------------------------------------------------------ diagnostics (DEV checks only)
 /** DIAGNOSTIC ONLY: browser checks use these to skip long transits; never called by gameplay. */
 readonly diag={
  teleport:(x:number,y:number,z:number,heading=this.run.heading)=>{
   const p=new T.Vector3(x,y,z);if(!this.clear(p,heading))return false;
   this.position.copy(p);this.run.heading=heading;this.run.pilot.stop();this.world.setFocus(this.vec());return true;
  },
  state:()=>({survey:this.survey.snapshot(),routeVersion:2,stage:this.s.stage,objective:this.objective,pos:this.vec(),heading:this.run.heading,collected:[...this.s.collected],probe:this.s.probe,valves:{...this.s.valves},
   slime:this.s.slime,tapes:this.s.tapes.map(t=>t.id),tapesAnalyzed:[...this.s.tapesAnalyzed],identified:[...this.s.identified],codeVerified:this.s.codeVerified,guideVerified:this.s.guideVerified,
   uplinked:this.s.uplinked,gateOpen:this.s.gateOpen,met:this.s.met,ballast:this.s.ballast,complete:this.s.complete,ended:this.ended,lens:!!this.lastCreature?.lensBlocked,
   creatures:this.creatures.views.map(c=>({id:c.id,mode:c.mode,pos:c.position})),pendingTapes:this.pendingTapes.length,saveSafe:this.saveSafe,
   timers:{...this.s.timers},extraLumens:this.s.extraLumens}),
  aimed:()=>{const a=this.aimed();return a?{id:a.item.id,distance:a.distance}:null;},
  seen:()=>this.computeSeen(),
  framing:(id:string)=>{this.pose();return this.framing(id);},
  viewfinder:()=>this.viewfinder(),
  /** Framing judged at the last shutter-open, i.e. what the current reel's validity rests on. */
  lastFraming:()=>structuredClone(this.lastFraming),
  /** Projected subject rectangle in pixels of a w×h frame, for checks that measure the saved film. */
  subjectRect:(id:string,w:number,h:number)=>{this.pose();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const r=this.projectBox(this.subjectBox(id));return r?[(r[0]+1)/2*w,(1-r[3])/2*h,(r[2]+1)/2*w,(1-r[1])/2*h]:null;},
  luma:(recording:boolean)=>{
   const c=document.createElement('canvas');c.width=256;c.height=180;const ctx=c.getContext('2d')!;
   this.renderView(ctx,256,180,recording);this.width=0;
   const d=ctx.getImageData(0,0,256,180).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=.2126*d[i]!+.7152*d[i+1]!+.0722*d[i+2]!;
   return sum/(d.length/4);
  },
  skipTimers:()=>{/* DIAGNOSTIC ONLY: fast-forward the deck's off-screen waits. */
   const t=this.s.timers,left=Math.max(t.alexTapeLeft,t.resultLeft,t.gateLeft);if(left<=0)return 0;
   this.apply(this.deck.step(left+.01,{pod:this.vec(),heading:this.run.heading,lamp:this.lit(),pulse:false,speed:0}));return left;
  },
 };
 dispose(){
  this.disposed=true;this.taskPlayer.dispose();
  if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();
  if(import.meta.env?.DEV&&typeof window!=='undefined'&&(window as unknown as {__living?:unknown}).__living===this)delete (window as unknown as {__living?:unknown}).__living;
  this.salvageArm.dispose();this.view.dispose();this.world.dispose();
  this.fallback.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});
 }
}
