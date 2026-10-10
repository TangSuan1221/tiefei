import {LIVING_EXIT_Y,LIVING_ITEMS,LIVING_LIGHTS,LIVING_SPACES,LIVING_SPAWN,LIVING_TRIM_FLOOR_Y,type CreatureType,type Vec3} from '../content/living-deck-layout';

/** Deck-two facts. Spatial tests, rendering and film creation belong to the adapter; facts only come from analyzed film. */
export type LivingStage='descend'|'explore'|'glass'|'awaitAlexTape'|'valve'|'awaitResult'|'atrium'|'code'|'uplink'|'awaitGate'|'met'|'exit'|'complete';
export type LivingEvidenceKind='creature'|'probeCorpse'|'code'|'guide'|'delroy'|'gateOpen'|'valveLabel'|'none';
export interface LivingEvidence {version:1;id:string;epoch:number;kinds:LivingEvidenceKind[];creatures:CreatureType[];lensBlocked:boolean;lamp:boolean;valid:boolean;diagnostic?:string}
export type RemoteTapeKind='alexIntro'|'slimeCleared'|'slimeUnchanged'|'slimeWorse'|'gateOpened'|'securityLog';
export interface RemoteTape {id:string;kind:RemoteTapeKind;lines:string[];shots:string[];facts:string[]}
export interface LivingInput {pod:Vec3;heading:number;lamp:boolean;pulse:boolean;speed:number}
export interface LivingResult {events:string[];damage:number;tapes:RemoteTape[];cues:string[];noise?:{position:Vec3;loudness:number}}
export type ValveKey='heat'|'feed'|'cool';
type ResultKind='slimeCleared'|'slimeUnchanged'|'slimeWorse';
/** `rejected`: targets in view whose framing would not be legible on film (too small, cropped, oblique), with the player-facing reason. */
export interface LivingCaptureSeen {targets:string[];creatures:CreatureType[];lensBlocked:boolean;lamp:boolean;gateOpen:boolean;alexVisible:boolean;rejected?:{id:string;reason:string}[]}
export interface LivingState {
 version:1;stage:LivingStage;epoch:number;pod:Vec3;space:string|null;leftShaft:boolean;visitedOffice:boolean;reachedExit:boolean;
 collected:string[];probe:'none'|'carried'|'launched'|'withAlex';valves:Record<ValveKey,boolean>;valveOps:number;slime:number;slimeCleared:boolean;pendingResult:ResultKind|null;
 timers:{alexTapeLeft:number;resultLeft:number;gateLeft:number};
 facts:string[];identified:CreatureType[];tapes:RemoteTape[];tapesAnalyzed:string[];captures:LivingEvidence[];analyzed:string[];
 codeVerified:boolean;guideVerified:boolean;delroyVerified:boolean;uplinked:boolean;gateOpen:boolean;met:boolean;ballast:boolean;extraLumens:number;damageTotal:number;complete:boolean;failed:boolean;
}

export const LIVING_TIMING=Object.freeze({alexTape:45,cleared:120,unchanged:60,worse:60,gate:25,uplinkRange:14,reach:5,slimeRate:.006,valveLoudness:1,armLoudness:.25,launchLoudness:.2});
const VALVE_ITEM:Record<ValveKey,string>={heat:'living.valve.heat',feed:'living.valve.feed',cool:'living.valve.cool'};
const ITEMS=new Map(LIVING_ITEMS.map(i=>[i.id,i]));
const BOXES=LIVING_ITEMS.filter(i=>i.kind==='box').map(i=>i.id);
const STAGES:readonly LivingStage[]=['descend','explore','glass','awaitAlexTape','valve','awaitResult','atrium','code','uplink','awaitGate','met','exit','complete'];
const CREATURES:readonly CreatureType[]=['lumen','shade','blind','swarm'];
const KINDS:readonly LivingEvidenceKind[]=['creature','probeCorpse','code','guide','delroy','gateOpen','valveLabel','none'];
const RESULT_KINDS:readonly ResultKind[]=['slimeCleared','slimeUnchanged','slimeWorse'];

const TAPES:Record<RemoteTapeKind,Omit<RemoteTape,'id'|'kind'>>={
 alexIntro:{shots:['alex-glass','pipe-bands','slime-wall','cocoon'],facts:['fact.alex-alive','fact.pipe-bands','fact.feed-line','fact.heat-clean','fact.cocoon'],lines:[
  '艾里亚斯：罗温，能看到吗？……指示灯亮着，应该在录。',
  '艾里亚斯：这是前厅后面的走廊。三根管子——红环供热，黄环营养液，蓝环冷却回水。',
  '艾里亚斯：粘液把走廊堵死了，我过不去。这东西喜欢暖……我猜是热水管。关掉供热试试。',
  '艾里亚斯：还有，这里有个茧。里面有人。死了很久了……我不拍了。']},
 securityLog:{shots:['security-console','pipe-bands'],facts:['fact.vip-priority','fact.valve-refused','fact.slime-from-joint'],lines:[
  '安保员：值班室记录。我在疗养区营养管线检修口。',
  '安保员：接缝在往外长东西。软的，温的，像一层肉冻。',
  '安保员：我申请关阀。运营部回复：VIP疗养区优先供给，禁止关闭。',
  '安保员：……那我就在这儿守着。谁来接班，把这段交给事故组。']},
 slimeCleared:{shots:['slime-floor','pipe-bands'],facts:['fact.slime-cleared','fact.feed-confirmed'],lines:[
  '艾里亚斯：它在缩……整片往下掉。水清了。',
  '艾里亚斯：黄环那根不流了。是它在喂这东西。',
  '艾里亚斯：我过去了。我往闸门那边走，那边见。']},
 slimeUnchanged:{shots:['slime-wall','cocoon'],facts:['fact.heat-not-source','fact.resident-drawn'],lines:[
  '艾里亚斯：红环那根凉了。可它一点都没退。',
  '艾里亚斯：……有人从疗养区那边游过来了。她一直看着我的灯。我把灯捂住了。',
  '艾里亚斯：是我猜错了？']},
 slimeWorse:{shots:['slime-wall','pipe-bands'],facts:['fact.cooling-not-source'],lines:[
  '艾里亚斯：水变暖了……它在长，朝我这边长。',
  '艾里亚斯：不管你关的是哪个，打开它！']},
 gateOpened:{shots:['gate-inner'],facts:['fact.gate-inner'],lines:['艾里亚斯：锁轮转开了。我出来了。']},
};
const TAPE_SUMMARY:Record<RemoteTapeKind,string>={
 alexIntro:'探头录像已核验：黄环营养液管的温热接缝被粘液厚厚包裹，红环供热管表面干净；茧里是一具早已死去的人。',
 securityLog:'安保员录像已核验：他曾请求关闭疗养区营养管线，被运营部以“VIP疗养区优先供给”驳回。',
 slimeCleared:'结果录像已核验：粘液萎缩沉底，污染走廊水体变清，艾里亚斯已经通过。',
 slimeUnchanged:'结果录像已核验：关闭供热后粘液没有变化；一名住客被灯光引出了疗养区。',
 slimeWorse:'结果录像已核验：冷却回水中断后水温上升，粘液更浓，正在扩张。',
 gateOpened:'结果录像已核验：闸门内侧锁轮已转开。',
};
const CREATURE_LINES:Record<CreatureType,string>={
 lumen:'录像核验：人形，面部始终朝向光源，皮下有淡青光点，下肢已分化成柔软组织。声纳标签：趋光者。它会向灯靠拢；关灯后它会停在最后见到光的地方。',
 shade:'录像核验：管状眼，半透明长体，在强光里收成一团。声纳标签：避光者。持续照射它会退开；黑暗里它会回到原处。',
 blind:'录像核验：没有眼睛，体侧一排侧线孔。声纳标签：盲猎者。它追声音：主动脉冲、高速推进、金属撞击。静止或慢速（＜0.45 m/s）的艇它找不到；撞过一次会退开一阵。',
 swarm:'录像核验：成群的玻璃鱼与端足虫。无害，但会扑灯、糊住镜头、盖住它们啃食的东西。',
};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const vec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(finite);
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const spaceAt=(p:Vec3,prefer:string|null)=>{
 const inside=(s:typeof LIVING_SPACES[number])=>s.pod&&p[0]>=s.minX&&p[0]<=s.maxX&&p[1]>=s.floorY&&p[1]<=s.ceilY&&p[2]>=s.minZ&&p[2]<=s.maxZ;
 const own=LIVING_SPACES.find(s=>s.id===prefer);if(own&&inside(own))return own.id;
 return LIVING_SPACES.find(inside)?.id??null;
};
/** Practical emergency fixtures light a subject without the pod lamp. */
export const livingPracticalLight=(p:Vec3)=>LIVING_LIGHTS.some(l=>dist(l.position,p)<=l.range);
const canonicalTape=(kind:RemoteTapeKind,id:string):RemoteTape=>({id,kind,...structuredClone(TAPES[kind])});
const outcome=(v:Record<ValveKey,boolean>):ResultKind|null=>v.cool?'slimeWorse':v.feed?'slimeCleared':v.heat?'slimeUnchanged':null;
const DELAY:Record<ResultKind,number>={slimeCleared:LIVING_TIMING.cleared,slimeUnchanged:LIVING_TIMING.unchanged,slimeWorse:LIVING_TIMING.worse};

const fresh=():LivingState=>({version:1,stage:'descend',epoch:0,pod:[...LIVING_SPAWN.position],space:'S',leftShaft:false,visitedOffice:false,reachedExit:false,
 collected:[],probe:'none',valves:{heat:false,feed:false,cool:false},valveOps:0,slime:.75,slimeCleared:false,pendingResult:null,timers:{alexTapeLeft:0,resultLeft:0,gateLeft:0},
 facts:[],identified:[],tapes:[],tapesAnalyzed:[],captures:[],analyzed:[],codeVerified:false,guideVerified:false,delroyVerified:false,uplinked:false,gateOpen:false,met:false,ballast:false,extraLumens:0,damageTotal:0,complete:false,failed:false});
const result=(...events:string[]):LivingResult=>({events,damage:0,tapes:[],cues:[]});

export function livingObjective(s:Readonly<LivingState>):string{
 switch(s.stage){
  case 'descend':return '沿竖井下降至宿舍外廊';
  case 'explore':return '在R3安保值班室取回摄像探头箱';
  case 'glass':return s.ballast?'前往G观察廊，在传递管道入口发射探头':'前往G观察廊，在传递管道入口发射探头（R4配重下潜前再取）';
  case 'awaitAlexTape':return s.probe==='launched'?'等待艾里亚斯的探头录像':'在分析台播放艾里亚斯的探头录像';
  case 'valve':return '在V阀门间关闭污染源阀门，关阀后保持静默';
  case 'awaitResult':return s.pendingResult?'保持静默，等待艾里亚斯拍回结果录像':'在分析台核验结果录像';
  case 'atrium':return '经C5穿过中庭，前往R5住宿管理处';
  case 'code':return '拍摄管理员手中的密码与墙上开闸步骤图，回分析台核验';
  case 'uplink':return '前往闸门F外侧观察窗，推送已核验的密码与步骤录像';
  case 'awaitGate':return s.gateOpen?'拍摄闸门开启与艾里亚斯游出，回分析台核验':'保持静默，等待艾里亚斯在内侧开闸';
  case 'met':return '会合后经中庭西侧C7前往下行井D，下潜至-2层';
  case 'exit':return s.ballast?'在下行井D下潜至−34米':'回R4压载库取得配重，再从下行井下潜';
  default:return '';
 }
}

export class LivingDeck {
 private value=fresh();
 private pending=new Map<string,LivingEvidence>();
 get state():Readonly<LivingState>{return this.snapshot();}
 get objective(){return livingObjective(this.value);}
 get complete(){return this.value.complete;}
 snapshot():LivingState{return structuredClone(this.value);}
 private has(fact:string){return this.value.facts.includes(fact);}
 private grant(facts:readonly string[]){for(const f of facts)if(!this.value.facts.includes(f))this.value.facts.push(f);}
 private derive():LivingStage{
  const s=this.value;
  if(s.complete)return 'complete';
  if(s.met)return s.reachedExit?'exit':'met';
  if(s.uplinked)return 'awaitGate';
  if(this.has('fact.slime-cleared'))return s.codeVerified&&s.guideVerified?'uplink':s.visitedOffice?'code':'atrium';
  if(s.probe==='none')return s.leftShaft?'explore':'descend';
  if(s.probe==='carried')return 'glass';
  if(s.probe==='launched'||!this.has('fact.feed-line'))return 'awaitAlexTape';
  if(s.pendingResult||s.tapes.some(t=>(RESULT_KINDS as readonly string[]).includes(t.kind)&&!s.tapesAnalyzed.includes(t.id)))return 'awaitResult';
  return 'valve';
 }
 private sync(){this.value.stage=this.derive();}
 private deliver(kind:RemoteTapeKind,out:LivingResult){
  const s=this.value,t=canonicalTape(kind,`tape.${kind}.${s.tapes.filter(x=>x.kind===kind).length+1}`);
  s.tapes.push(t);out.tapes.push(structuredClone(t));out.cues.push('tape.arrive');return t;
 }
 /** Alex films the slime only while he holds the probe at the corridor edge and the colony still lives. */
 private reschedule(){
  const s=this.value;
  if(s.probe!=='withAlex'||s.slimeCleared){s.pendingResult=null;s.timers.resultLeft=0;return;}
  const o=outcome(s.valves);s.pendingResult=o;s.timers.resultLeft=o?DELAY[o]:0;
 }
 private near(p:Vec3,range:number){return dist(this.value.pod,p)<=range;}
 step(dt:number,input:LivingInput):LivingResult{
  const s=this.value,out=result();
  if(!finite(dt)||dt<0||!vec(input?.pod)||s.failed)return out;
  s.pod=[...input.pod];s.space=spaceAt(input.pod,s.space);
  if(!s.leftShaft&&(s.space!=='S'||input.pod[1]<=1.5)){s.leftShaft=true;out.events.push('竖井底部。宿舍外廊的应急灯还亮着几盏。');}
  if(s.space==='R5')s.visitedOffice=true;
  if(s.met&&(s.space==='C7'||s.space==='D'))s.reachedExit=true;
  let left=dt;
  while(left>0&&!s.complete){const d=Math.min(.25,left);left-=d;
   if(s.probe==='launched'){s.timers.alexTapeLeft=Math.max(0,s.timers.alexTapeLeft-d);
    if(s.timers.alexTapeLeft===0){s.probe='withAlex';this.deliver('alexIntro',out);out.events.push('探头线缆传回一段录像。');this.reschedule();}}
   if(s.pendingResult){s.timers.resultLeft=Math.max(0,s.timers.resultLeft-d);
    if(s.timers.resultLeft===0){const kind=s.pendingResult;s.pendingResult=null;this.deliver(kind,out);out.events.push('探头线缆传回艾里亚斯拍的结果录像。');
     if(kind==='slimeCleared'){s.slimeCleared=true;s.epoch++;}
     if(kind==='slimeUnchanged'&&s.extraLumens===0){s.extraLumens=1;out.events.push('被动声纳：中庭方向多了一个缓慢移动的声源。');}}}
   if(s.uplinked&&!s.gateOpen){s.timers.gateLeft=Math.max(0,s.timers.gateLeft-d);
    if(s.timers.gateLeft===0){s.gateOpen=true;s.epoch++;out.events.push('闸门F的锁轮转开，闸门正在升起。');out.cues.push('gate.open');}}
   const target=s.slimeCleared?.05:s.valves.cool?1:s.valves.feed?.15:.75,step=LIVING_TIMING.slimeRate*d;
   s.slime=Math.abs(target-s.slime)<=step?target:s.slime+Math.sign(target-s.slime)*step;
  }
  if(s.met&&s.ballast&&s.space==='D'&&input.pod[1]<LIVING_EXIT_Y&&!s.complete){s.complete=true;out.events.push('配重拖着艇身沉入下行井。-1层的灯光留在头顶。');}
  this.sync();return out;
 }
 interact(itemId:string,ctx:{lamp:boolean;powered:boolean;armStowed:boolean;pulse:boolean}):LivingResult{
  const s=this.value,item=ITEMS.get(itemId);if(!item||s.complete||s.failed)return result();
  if(item.kind==='uplink')return this.uplink();
  if(item.kind==='box')return result('用机械臂夹取。');
  if(item.kind==='photo')return result('这需要拍下来，回分析台核验。');
  if(!this.near(item.position,LIVING_TIMING.reach))return result('距离太远，靠近后再操作。');
  if(item.kind==='pipe'){
   if(s.probe==='none')return result('传递管道是空的。先取回摄像探头箱。');
   if(s.probe!=='carried')return result('探头已经在艾里亚斯那一侧。');
   s.probe='launched';s.timers.alexTapeLeft=LIVING_TIMING.alexTape;s.epoch++;this.sync();
   return {...result('探头滑进传递管道，线缆一圈圈放出去。'),cues:['probe.launch'],noise:{position:item.position,loudness:LIVING_TIMING.launchLoudness}};
  }
  const key=(Object.keys(VALVE_ITEM) as ValveKey[]).find(k=>VALVE_ITEM[k]===itemId);
  if(!key)return result();
  s.valves[key]=!s.valves[key];s.valveOps++;this.reschedule();this.sync();
  return {...result(s.valves[key]?`${item.name}已关闭。阀轮的撞击声顺着管道传了出去。`:`${item.name}重新打开。阀轮又撞了一声。`),cues:['valve.clank'],noise:{position:item.position,loudness:LIVING_TIMING.valveLoudness}};
 }
 armCollected(itemId:string):LivingResult{
  const s=this.value,item=ITEMS.get(itemId);
  if(!item||item.kind!=='box'||s.collected.includes(itemId)||s.failed)return result();
  if(!this.near(item.position,LIVING_TIMING.reach))return result('机械臂够不到。');
  s.collected.push(itemId);const out=result();out.cues.push('arm.stow');out.noise={position:item.position,loudness:LIVING_TIMING.armLoudness};
  if(itemId==='living.box.probe'){s.probe='carried';out.events.push('探头箱从安保员腰间解下，收进货架。探头存储里还留着一段录像。');this.deliver('securityLog',out);}
  else if(itemId==='living.box.ballast'){s.ballast=true;out.events.push('配重块挂上艇腹。配平舱可以把艇压进下行井了。');}
  else out.events.push(`${item.name}已收入货架。`);
  this.sync();return out;
 }
 capture(id:string,seen:LivingCaptureSeen):LivingEvidence{
  const s=this.value,old=s.captures.find(e=>e.id===id)??this.pending.get(id);if(old)return structuredClone(old);
  const targets=Array.isArray(seen?.targets)?seen.targets.filter(t=>typeof t==='string'&&ITEMS.has(t)):[];
  const lit=(p:Vec3)=>!!seen?.lamp||livingPracticalLight(p);
  const shown=targets.filter(t=>lit(ITEMS.get(t)!.position));
  const creatures=[...new Set((Array.isArray(seen?.creatures)?seen.creatures:[]).filter(c=>CREATURES.includes(c)))].sort();
  const kinds:LivingEvidenceKind[]=[];
  if(shown.includes('living.box.probe'))kinds.push('probeCorpse');
  if(shown.some(t=>Object.values(VALVE_ITEM).includes(t)))kinds.push('valveLabel');
  if(shown.includes('living.photo.code'))kinds.push('code');
  if(shown.includes('living.photo.guide'))kinds.push('guide');
  if(shown.includes('living.photo.delroy'))kinds.push('delroy');
  if(s.gateOpen&&seen?.gateOpen===true&&seen.alexVisible===true&&lit(ITEMS.get('living.uplink.gate')!.position))kinds.push('gateOpen');
  const creaturesLit=creatures.length>0&&lit(s.pod);if(creaturesLit)kinds.push('creature');
  const lensBlocked=seen?.lensBlocked===true;
  const rejected=Array.isArray(seen?.rejected)?seen.rejected.filter(r=>r&&typeof r.reason==='string'&&r.reason):[];
  const diagnostic=lensBlocked?'镜头被遮挡，画面里只有贴在镜头上的东西。':!kinds.length?(rejected.length?`废片：${rejected[0]!.reason}`:targets.length||creatures.length||seen?.gateOpen?'画面太暗，看不清目标。':'画面里没有可核验的目标。'):undefined;
  const e:LivingEvidence={version:1,id,epoch:s.epoch,kinds:kinds.length?kinds:['none'],creatures:creaturesLit?creatures:[],lensBlocked,lamp:seen?.lamp===true,valid:kinds.length>0&&!lensBlocked&&!s.failed};
  if(diagnostic)e.diagnostic=diagnostic;
  this.pending.set(id,e);return structuredClone(e);
 }
 /** Commit only after the uninterrupted exposure finishes; facts remain those at shutter-open. */
 commitCapture(e:LivingEvidence){
  const s=this.value,pending=this.pending.get(e?.id);
  if(!pending||JSON.stringify(pending)!==JSON.stringify(e)||s.failed)return;
  this.pending.delete(e.id);s.captures.push(structuredClone(e));
 }
 cancelCapture(id:string){this.pending.delete(id);}
 analyze(e:LivingEvidence):string[]{
  const s=this.value,stored=s.captures.find(x=>x.id===e?.id);
  if(!stored||JSON.stringify(stored)!==JSON.stringify(e))return ['没有这份录像的存档。'];
  if(!e.valid)return [e.diagnostic??'画面无法核验，需要重新拍摄。'];
  if(e.kinds.includes('gateOpen')&&e.epoch!==s.epoch)return ['现场已经改变，这份录像不能说明现在的情况；需要重新曝光。'];
  if(s.analyzed.includes(e.id))return ['这份录像已经核验。'];
  s.analyzed.push(e.id);const lines:string[]=[];
  for(const kind of e.kinds){
   if(kind==='creature')for(const c of e.creatures){if(!s.identified.includes(c)){s.identified.push(c);lines.push(CREATURE_LINES[c]);}}
   else if(kind==='probeCorpse'){this.grant(['fact.guard-corpse']);lines.push('录像核验：安保员靠在监控台边死去，探头箱还扣在他腰间。');}
   else if(kind==='valveLabel'){this.grant(['fact.vip-label']);lines.push('录像核验：阀门标签写着“VIP疗养区优先供给 · 禁止关闭 · 运营部”。');}
   else if(kind==='code'){s.codeVerified=true;this.grant(['fact.gate-code','fact.keeper-note']);lines.push('录像核验：管理员手里的纸条上，闸门密码清晰可读。纸条末尾写着“对不起”。');}
   else if(kind==='guide'){s.guideVerified=true;this.grant(['fact.gate-procedure']);lines.push('录像核验：应急开闸步骤——先拉手动泄压杆，再输入密码，最后转动锁轮。');}
   else if(kind==='delroy'){s.delroyVerified=true;this.grant(['fact.delroy-application']);lines.push('录像核验：员工治疗申请单。申请人德尔罗伊·坎贝尔，对象是他的孙子，状态“等待治疗资格”。最早一张的日期早于疗养区开业。');}
   else if(kind==='gateOpen'&&s.gateOpen){s.met=true;this.grant(['fact.gate-open']);lines.push('录像核验：闸门F已经升起，艾里亚斯正从内侧游出来。');}
  }
  if(s.codeVerified&&s.guideVerified&&(e.kinds.includes('code')||e.kinds.includes('guide')))lines.push('密码与开闸步骤都已核验，可以推送给艾里亚斯的探头。');
  if(!lines.length)lines.push('录像已归档。');
  this.sync();return lines;
 }
 analyzeTape(tapeId:string):string[]{
  const s=this.value,t=s.tapes.find(x=>x.id===tapeId);
  if(!t)return ['没有这卷录像。'];
  if(s.tapesAnalyzed.includes(t.id))return ['这卷录像已经核验。'];
  s.tapesAnalyzed.push(t.id);this.grant(t.facts);this.sync();return [TAPE_SUMMARY[t.kind]];
 }
 canUplink(pod:Vec3){
  const s=this.value;
  return vec(pod)&&!s.uplinked&&!s.failed&&s.codeVerified&&s.guideVerified&&this.has('fact.slime-cleared')&&dist(pod,ITEMS.get('living.uplink.gate')!.position)<=LIVING_TIMING.uplinkRange;
 }
 uplink():LivingResult{
  const s=this.value;
  if(s.uplinked)return result('录像已经推送过去了。');
  if(!s.codeVerified||!s.guideVerified)return result('还没有核验过的密码与开闸步骤录像。');
  if(!this.has('fact.slime-cleared'))return result('艾里亚斯还没越过污染走廊，探头不在闸门内侧。');
  if(!this.canUplink(s.pod))return result('离闸门观察窗太远，水声链路接不上探头。');
  s.uplinked=true;s.timers.gateLeft=LIVING_TIMING.gate;this.sync();
  return {...result('密码与步骤录像已推送到探头屏幕。'),cues:['tape.push']};
 }
 exitAllowed(y:number){return this.value.ballast||!(y<LIVING_TRIM_FLOOR_Y);}
 noteDamage(amount:number){if(finite(amount)&&amount>0)this.value.damageTotal+=amount;}
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s=value as LivingState,base=fresh();
  for(const k of Object.keys(base) as (keyof LivingState)[]){const v=s[k],b=base[k];
   if(typeof b==='boolean'&&typeof v!=='boolean')return false;
   if(typeof b==='number'&&(!finite(v)||v<0))return false;
   if(Array.isArray(b)&&!Array.isArray(v))return false;}
  if(s.version!==1||!STAGES.includes(s.stage)||!Number.isInteger(s.epoch)||!Number.isInteger(s.valveOps)||!Number.isInteger(s.extraLumens)||s.extraLumens>1||s.slime>1)return false;
  if(!vec(s.pod)||(s.space!==null&&!LIVING_SPACES.some(x=>x.id===s.space&&x.pod)))return false;
  if(!['none','carried','launched','withAlex'].includes(s.probe)||!s.valves||typeof s.valves!=='object'||!(Object.keys(VALVE_ITEM) as ValveKey[]).every(k=>typeof s.valves[k]==='boolean'))return false;
  if(s.pendingResult!==null&&!RESULT_KINDS.includes(s.pendingResult))return false;
  if(!s.timers||![s.timers.alexTapeLeft,s.timers.resultLeft,s.timers.gateLeft].every(v=>finite(v)&&v>=0))return false;
  const strings=(a:unknown[])=>a.every(x=>typeof x==='string')&&new Set(a).size===a.length;
  if(!strings(s.collected)||!s.collected.every(id=>BOXES.includes(id))||!strings(s.facts)||!strings(s.tapesAnalyzed)||!strings(s.analyzed)||!strings(s.identified)||!s.identified.every(c=>CREATURES.includes(c)))return false;
  const tapeIds=new Set<string>();
  for(const t of s.tapes){if(!t||typeof t.id!=='string'||tapeIds.has(t.id)||!(t.kind in TAPES)||JSON.stringify(t)!==JSON.stringify(canonicalTape(t.kind,t.id)))return false;tapeIds.add(t.id);}
  if(s.tapesAnalyzed.some(id=>!tapeIds.has(id)))return false;
  const known=new Set([...Object.values(TAPES).flatMap(t=>t.facts),'fact.guard-corpse','fact.vip-label','fact.gate-code','fact.keeper-note','fact.gate-procedure','fact.delroy-application','fact.gate-open']);
  const granted=new Set(s.tapes.filter(t=>s.tapesAnalyzed.includes(t.id)).flatMap(t=>t.facts));
  if(s.facts.some(f=>!known.has(f)||(f.startsWith('fact.')&&Object.values(TAPES).some(t=>t.facts.includes(f))&&!granted.has(f))))return false;
  const ids=new Set<string>();
  for(const e of s.captures){
   if(!e||e.version!==1||typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isInteger(e.epoch)||e.epoch<0||e.epoch>s.epoch||!Array.isArray(e.kinds)||!e.kinds.length||!e.kinds.every(k=>KINDS.includes(k))||!Array.isArray(e.creatures)||!e.creatures.every(c=>CREATURES.includes(c)))return false;
   if(typeof e.lensBlocked!=='boolean'||typeof e.lamp!=='boolean'||typeof e.valid!=='boolean'||(e.diagnostic!==undefined&&typeof e.diagnostic!=='string'))return false;
   ids.add(e.id);
  }
  if(s.analyzed.some(id=>!ids.has(id)))return false;
  const proved=(k:LivingEvidenceKind)=>s.captures.some(e=>e.valid&&e.kinds.includes(k)&&s.analyzed.includes(e.id));
  const has=(f:string)=>s.facts.includes(f);
  if((s.probe!=='none')!==s.collected.includes('living.box.probe')||s.ballast!==s.collected.includes('living.box.ballast'))return false;
  if((s.probe!=='launched'&&s.timers.alexTapeLeft>0)||(!s.pendingResult&&s.timers.resultLeft>0)||(!s.uplinked&&s.timers.gateLeft>0))return false;
  if((s.probe==='withAlex')!==s.tapes.some(t=>t.kind==='alexIntro'))return false;
  if(s.pendingResult&&(s.probe!=='withAlex'||s.slimeCleared))return false;
  if(s.slimeCleared!==s.tapes.some(t=>t.kind==='slimeCleared')||(has('fact.slime-cleared')&&!s.slimeCleared))return false;
  if((s.extraLumens>0)!==s.tapes.some(t=>t.kind==='slimeUnchanged'))return false;
  if((s.codeVerified!==proved('code'))||(s.guideVerified!==proved('guide'))||(s.delroyVerified!==proved('delroy'))||(s.met!==(s.gateOpen&&proved('gateOpen'))))return false;
  if((s.uplinked&&(!s.codeVerified||!s.guideVerified||!has('fact.slime-cleared')))||(s.gateOpen&&!s.uplinked)||(s.reachedExit&&!s.met)||(s.complete&&(!s.met||!s.ballast))||(s.leftShaft===false&&s.probe!=='none'))return false;
  const before=this.value;this.value=structuredClone(s);
  if(this.derive()!==s.stage){this.value=before;return false;}
  this.pending.clear();return true;
 }
}
