import {livingObjective,type LivingStage,type LivingState} from './living-deck';

type Effect='radioCut'|'broadcast'|'radioRestore'|'reunion';
type Beat={text:string;effect?:Effect;seconds?:number;end?:LivingStage};
export type LivingDialogueOutput={line?:string;seconds?:number;effects:Effect[]};
type S=Readonly<LivingState>;
const has=(s:S,f:string)=>s.facts.includes(f);
const pause=(seconds:number):Beat=>({text:'',seconds});

/** Each group plays once, in list order, when its condition first holds while the channel is idle. */
const GROUPS:readonly {id:string;stage?:LivingStage;when:(s:S)=>boolean;beats:Beat[]}[]=[
 {id:'descend',when:s=>s.stage==='descend',beats:[
  {text:'罗温：万斯，我进竖井了，-1层入口。听到请回答。'},pause(3),
  {text:'罗温：万斯？'},
  {text:'艾里亚斯：……罗温？是你吗？我到楼梯间了。'},
  {text:'艾里亚斯：这一层的通话器全在掉电……我去生活区前厅。你绕过去，观察廊见。'},
  {text:'罗温：艾里亚斯，等一下，那边的门——',effect:'radioCut'},pause(2.5),
  {text:'广播：欢迎入住。您已不必继续忍受疼痛。',effect:'broadcast'},
  {text:'罗温：……这东西还在放。'},
 ]},
 {id:'explore',stage:'explore',when:s=>s.stage==='explore',beats:[
  {text:'罗温：外廊。地毯还铺着，全泡烂了。门牌上写着“疗养区住客请勿入内”。'},
  {text:'罗温：观察廊隔着防爆玻璃。就算见到他，我也递不过去任何东西。'},
  {text:'罗温：安保值班室该有探头。先去那儿。'},
 ]},
 {id:'probe',when:s=>s.probe!=='none',beats:[
  {text:'罗温：他腰上还扣着探头箱……对不起，我得借走。'},
  {text:'罗温：存储灯亮着。他留下了什么。'},
 ]},
 {id:'securityLog',when:s=>has(s,'fact.valve-refused'),beats:[
  {text:'罗温：他申请关阀，被驳回了。“VIP疗养区优先供给”。'},
  {text:'罗温：出事以后，这些管子一直在往疗养区送热、送营养。送给谁？'},
 ]},
 {id:'vipLabel',when:s=>has(s,'fact.vip-label'),beats:[{text:'罗温：“禁止关闭”……他们把这句话钉在了阀门上。'}]},
 {id:'ballast',when:s=>s.ballast,beats:[{text:'罗温：配重挂上了。下行井那一段，配平舱总算压得下去。'}]},
 {id:'glass',stage:'glass',when:s=>s.stage==='glass'&&s.space==='G',beats:[
  {text:'罗温：玻璃后面……艾里亚斯。'},
  {text:'罗温：他在拍玻璃。我听不见。他在指——管道口。'},
  {text:'罗温：好。探头从这里过去。你拿到了，就替我看看那边。'},
 ]},
 {id:'launch',when:s=>s.probe==='launched',beats:[
  {text:'罗温：线在走……他接住了。'},
  {text:'罗温：他往里游了。艾里亚斯，别走太远。'},pause(3),
  {text:'罗温：玻璃外面有光在晃。那不是我的灯。'},
 ]},
 {id:'alexTape',when:s=>s.probe==='withAlex'&&!has(s,'fact.feed-line'),beats:[{text:'罗温：线缆回传了。他拍到了什么？'}]},
 {id:'valve',stage:'valve',when:s=>has(s,'fact.feed-line')&&!s.slimeCleared&&s.valveOps===0,beats:[
  {text:'罗温：他说是热水管。可红环那根是干净的。'},
  {text:'罗温：黄环……营养液管。接缝全被包住了。'},
  {text:'罗温：茧里那个人……先别想。'},
  {text:'罗温：关错了会怎样？我不知道。阀轮一转，整层都听得见。'},
  {text:'罗温：关完就停下。要是有东西过来，我就退回连廊。'},
 ]},
 {id:'firstValve',when:s=>s.valveOps>0&&!s.slimeCleared,beats:[{text:'罗温：太响了……别动。别动。'}]},
 {id:'unchanged',when:s=>has(s,'fact.heat-not-source'),beats:[
  {text:'罗温：没退。还把一个人引了出来……是我关错了。'},
  {text:'罗温：他自己也拿不准了。把V-1重新打开，换一根。'},
 ]},
 {id:'worse',when:s=>has(s,'fact.cooling-not-source'),beats:[
  {text:'罗温：更浓了。冷却水一断，那边更暖了。'},
  {text:'罗温：回去。把它打开。'},
 ]},
 {id:'cleared',stage:'atrium',when:s=>has(s,'fact.slime-cleared'),beats:[
  {text:'罗温：沉下去了。水清了。'},
  {text:'罗温：他说闸门见。闸门在中庭东侧，我得从中庭绕过去。'},
  {text:'罗温：那么大的地方……它们会在上面，还是在下面？'},
 ]},
 {id:'atrium',when:s=>s.stage==='atrium'&&s.space==='A',beats:[
  {text:'罗温：上面有光点在漂。下面……有东西贴着地板游。'},
  {text:'罗温：关灯。不发脉冲。慢一点。'},
 ]},
 {id:'office',stage:'code',when:s=>s.stage==='code',beats:[
  {text:'罗温：管理处。桌边有人。'},
  {text:'罗温：她手里攥着纸。一串数字……还有一句“对不起”。'},
  {text:'罗温：闸门是从外面锁的。是她锁的？纸上写着“为了让里面的人安全”。'},
  {text:'罗温：这只是她自己写的。没有锁的记录，也没有监控。先拍下来。'},
 ]},
 {id:'delroy',when:s=>s.delroyVerified,beats:[
  {text:'罗温：德尔罗伊·坎贝尔。申请对象，孙子。等待治疗资格。'},
  {text:'罗温：最早那张比疗养区开业还早。他到底等了多久？'},
 ]},
 {id:'uplink',stage:'uplink',when:s=>s.stage==='uplink',beats:[{text:'罗温：密码，步骤，都清楚了。只要他在里面能看到这卷片。'}]},
 {id:'pushed',when:s=>s.uplinked&&!s.gateOpen,beats:[
  {text:'罗温：推过去了。泄压杆，密码，锁轮。艾里亚斯，按顺序来。'},pause(3),
  {text:'罗温：快一点……下面有东西在游。'},
 ]},
 {id:'gate',when:s=>s.gateOpen&&!s.met,beats:[{text:'罗温：在升……闸门在升。'}]},
 {id:'met',stage:'met',when:s=>s.met,beats:[
  {text:'艾里亚斯：罗温？……听得见吗？探头的线接到你的水声机上了。',effect:'radioRestore'},
  {text:'罗温：听得见。你还好吗？'},
  {text:'艾里亚斯：冷。手一直在抖。不过我出来了。'},
  {text:'罗温：那个茧——'},
  {text:'艾里亚斯：我知道。我不想再看第二遍。'},
  {text:'艾里亚斯：管理员的纸条我也看了。她说锁门是为了让里面的人安全。'},
  {text:'罗温：从外面锁，叫安全？'},
  {text:'艾里亚斯：我不知道。我只知道门打不开的时候，我在里面敲了很久。'},
  {text:'罗温：下行井在中庭西边。配重在我艇上，我先下去探一段。'},
  {text:'艾里亚斯：我在闸门口等着，线缆还接着。下面什么样，告诉我。',effect:'reunion'},
 ]},
 {id:'exit',when:s=>s.stage==='exit',beats:[
  {text:'罗温：井口到了。下面是-2层。艾里亚斯，听得到吗？'},
  {text:'艾里亚斯：听得到。你的灯从闸门这边已经看不见了。'},
  {text:'罗温：我下去了。到底就叫你。'},
 ]},
];
const IDS=GROUPS.map(g=>g.id);
const STAGES:readonly LivingStage[]=['descend','explore','glass','awaitAlexTape','valve','awaitResult','atrium','code','uplink','awaitGate','met','exit','complete'];
const EFFECTS:readonly Effect[]=['radioCut','broadcast','radioRestore','reunion'];

/** One ordered, serializable channel. Objectives publish when a stage's lines end; facts stay owned by LivingDeck. */
export class LivingDialogue {
 private published:LivingStage='descend';
 private objectiveText='';
 private pending:Beat[]=[];
 private active:Beat|null=null;
 private remaining=0;
 private played:string[]=[];
 get busy(){return !!this.active||this.pending.length>0;}
 get objective(){return this.objectiveText;}
 get stage(){return this.published;}
 get currentLine(){return this.active?.text??'';}
 get currentSeconds(){return this.remaining;}
 enqueue(text:string){if(typeof text==='string')this.pending.push({text});}
 tick(dt:number,s:S):LivingDialogueOutput{
  const out:LivingDialogueOutput={effects:[]};
  if(this.active){this.remaining=Math.max(0,this.remaining-(Number.isFinite(dt)?Math.max(0,dt):0));if(this.remaining>0)return out;
   const ended=this.active;this.active=null;if(ended.end)this.publish(ended.end,s);if(ended.effect)out.effects.push(ended.effect);
  }
  if(!this.pending.length){
   const g=GROUPS.find(g=>!this.played.includes(g.id)&&g.when(s));
   if(g){this.played.push(g.id);const beats=structuredClone(g.beats);if(g.stage)beats[beats.length-1]!.end=g.stage;this.pending.push(...beats);}
  }
  if(!this.pending.some(b=>b.end))this.publish(s.stage,s);
  if(this.pending.length){this.active=this.pending.shift()!;this.remaining=this.active.seconds??Math.max(4,Math.min(32,this.active.text.length*.18));out.line=this.active.text;out.seconds=this.remaining;}
  return out;
 }
 private publish(stage:LivingStage,s:S){this.published=stage;this.objectiveText=livingObjective({...s,stage});}
 snapshot(){return {version:1 as const,published:this.published,objective:this.objectiveText,pending:structuredClone(this.pending),active:this.active?structuredClone(this.active):null,remaining:this.remaining,played:[...this.played]};}
 restore(value:unknown){
  if(!value||typeof value!=='object')return false;const s=value as ReturnType<LivingDialogue['snapshot']>;
  const beat=(b:Beat)=>!!b&&typeof b.text==='string'&&(b.end===undefined||STAGES.includes(b.end))&&(b.effect===undefined||EFFECTS.includes(b.effect))&&(b.seconds===undefined||Number.isFinite(b.seconds)&&b.seconds>=0&&b.seconds<=32);
  if(s.version!==1||!STAGES.includes(s.published)||typeof s.objective!=='string'||!Array.isArray(s.pending)||!s.pending.every(beat)||(s.active!==null&&!beat(s.active))||!Number.isFinite(s.remaining)||s.remaining<0||s.remaining>32)return false;
  if(!Array.isArray(s.played)||!s.played.every(id=>IDS.includes(id))||new Set(s.played).size!==s.played.length)return false;
  this.published=s.published;this.objectiveText=s.objective;this.pending=structuredClone(s.pending);this.active=s.active?structuredClone(s.active):null;this.remaining=s.remaining;this.played=[...s.played];return true;
 }
 /** Saves without a dialogue snapshot resume at the current facts instead of replaying every earlier line. */
 migrate(s:S){this.played=GROUPS.filter(g=>g.when(s)||STAGES.indexOf(s.stage)>STAGES.indexOf(g.stage??'descend')&&!!g.stage).map(g=>g.id);this.pending=[];this.active=null;this.remaining=0;this.publish(s.stage,s);}
}
