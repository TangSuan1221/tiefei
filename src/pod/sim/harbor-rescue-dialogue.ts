import type {HarborRescueState} from './harbor-rescue';

const stages=['contact','intro','stop','warning','photo','report','plan','power','powerBrief','open','lureBrief','lure','closeBrief','close','confirmBrief','confirm','escapeBrief','escape','departure','done'] as const;
type Stage=typeof stages[number];
type Effect='rumble'|'escape';
type Beat={text:string;end?:Stage;effect?:Effect;seconds?:number};
export type DialogueOutput={line?:string;seconds?:number;effects:Effect[]};
const tasks:Partial<Record<Stage,string>>={
 stop:'关闭主动声纳脉冲',
 photo:'前往01：X60 Y27 DEPTH 1012m，拍摄艾里亚斯附近，等待显影并分析录像',
 report:'已看清现场 · 点击麦克风向艾里亚斯回复',
 power:'恢复应急电力：02，X42 Y28 DEPTH 1012m，靠近配电面板按F',
 open:'前往01：X60 Y27 DEPTH 1012m，靠近面板按F打开货仓闸门',
 lure:'将怪物引入货仓：穿过闸口驶入03货舱内部 X77 Y7 DEPTH 1011m，在仓内开启脉冲引入；红点进仓后曝光确认，随即停发，低速撤出',
 close:'停止主动脉冲，返回开门时的01面板（X60 Y27 DEPTH 1012m，回到深度1012米）按F关闭货仓闸门',
 confirm:'货仓闸门已关闭 · 点击麦克风，回复艾里亚斯',
 escape:'留在艇内，观察艾里亚斯沿内侧通道撤离',
 departure:'前往01：X60 Y27 DEPTH 1012m，拍摄并分析艾里亚斯撤离结果',
 done:'返回01接驳面板，按F确认离港',
};
const choices=['搞定了。','门关上了，它在里面。','你可以出来了。'] as const;

/** One ordered, serializable conversation. Tasks are published at line END,
 * while evidence, power and door facts remain owned by HarborRescue. */
export class HarborRescueDialogue {
 stage:Stage='contact';
 private pending:Beat[]=[];
 private active:Beat|null=null;
 private remaining=0;
 private choosing=false;
 get busy(){return !!this.active||this.pending.length>0;}
 get objective(){return tasks[this.stage]??'';}
 get photoUnlocked(){return stages.indexOf(this.stage)>=stages.indexOf('photo');}
 get ambience(){return ['warning','photo','report','plan'].includes(this.stage);}
 get replyAvailable(){return !this.busy&&['contact','report','confirm'].includes(this.stage);}
 get dialogueChoices(){return this.stage==='confirm'&&this.choosing?choices:[];}
 enqueue(text:string){this.pending.push({text});}
 private begin(stage:Stage,beats:Beat[]){this.stage=stage;this.pending.push(...beats);}
 reply(){
  if(!this.replyAvailable)return false;
  if(this.stage==='contact'){
   this.begin('intro',[
    {text:'罗温：我是调查救援队的罗温。你在哪里？请给我坐标，我去进行救援。'},
    {text:'艾里亚斯：这里的廊桥被水压断了，你过不来。你的主动声纳还开着吗？天哪，快关掉它！'},
    {text:'罗温：这里太黑了，我的照明电量不够。我需要扫描周围的障碍物，为什么要关掉主动声纳？'},
    {text:'艾里亚斯：来不及解释了，它来了！快，快关掉！',end:'stop'},
   ]);return true;
  }
  if(this.stage==='report'){
   this.begin('plan',[
    {text:'罗温：艾里亚斯，我看到了，我看到了……这到底是什么东西？'},
    {text:'艾里亚斯：我被它困在这里，不敢出来。你帮我引开它，我就能从操作室出来，走外面的应急走廊。'},
    {text:'罗温：好的，我该怎么做？'},
    {text:'艾里亚斯：这里有个货仓，可以把它诱到里面关起来。不过事故后货仓门断电了。先去02，X42、Y28、深度1012米，靠近配电面板按F，恢复应急电力。',end:'power'},
   ]);return true;
  }
  this.choosing=true;return true;
 }
 choose(index:number){
  if(!this.choosing||this.stage!=='confirm'||!Number.isInteger(index)||!choices[index])return false;
  this.choosing=false;
  this.begin('escapeBrief',[
   {text:'罗温：'+choices[index]},
   {text:'艾里亚斯：好的，我现在从控制室出去。你在01，X60、Y27、深度1012米，拍摄我撤离的情况。如果我出了情况，请来救我。',end:'escape',effect:'escape'},
  ]);return true;
 }
 tick(dt:number,s:Readonly<HarborRescueState>,emitting:boolean):DialogueOutput{
  const out:DialogueOutput={effects:[]};
  if(this.active){this.remaining=Math.max(0,this.remaining-Math.max(0,dt));if(this.remaining>0)return out;
   const ended=this.active;this.active=null;if(ended.end)this.stage=ended.end;if(ended.effect)out.effects.push(ended.effect);
  }
  if(!this.pending.length){
   if(this.stage==='stop'&&!emitting)this.begin('warning',[
    {text:'罗温：它？它是什么？'},
    {text:'艾里亚斯：听我说，不要开灯，也不要开启主动声纳。保持被动接收。',effect:'rumble'},
    {text:'',seconds:2.5},
    {text:'罗温：天哪，这是什么声音？'},
    {text:'艾里亚斯：你看不见它，需要用摄像机才能看到。去01，X60、Y27、深度1012米，拍摄我这里。等显影完成，到分析台看录像，再用麦克风叫我。',end:'photo'},
   ]);
   else if(this.stage==='photo'&&s.identified)this.stage='report';
   else if(this.stage==='power'&&s.powered)this.begin('powerBrief',[{text:'艾里亚斯：好了，听我说。现在回01，X60、Y27、深度1012米，靠近面板按F，把货仓闸门打开。',end:'open'}]);
   else if(this.stage==='open'&&s.gateOpen)this.begin('lureBrief',[
    {text:'艾里亚斯：接下来的操作很危险，你一定仔细听。闸门开后，从X77、Y22、深度1011米驶入03货舱，一直开到仓内X77、Y7、深度1011米，人在仓里了再开启主动脉冲，把它引进来。'},
    {text:'艾里亚斯：等它完全进仓，先拍一张确认它在里面，再快速停止主动脉冲，安静离开。停止脉冲后低速驶出货舱，返回开门时的01面板（X60 Y27 DEPTH 1012m，回到深度1012米）关闸。',end:'lure'},
   ]);
   else if(this.stage==='lure'&&s.lureConfirmed)this.begin('closeBrief',[{text:'艾里亚斯：你已经拍下它在货仓里了。现在停止主动脉冲，低速撤出货舱，返回开门时的01面板（X60 Y27 DEPTH 1012m，回到深度1012米）关闭货仓闸门！',end:'close'}]);
   else if(this.stage==='close'&&!s.lureConfirmed&&!s.isolated){this.stage='lure';this.enqueue('艾里亚斯：它又出来了。重新开闸诱导，必须拍下这一次的入仓情况。');}
   else if(this.stage==='close'&&s.isolated)this.begin('confirmBrief',[{text:'艾里亚斯：你搞定了吗？它关进去了吗？',end:'confirm'}]);
   else if(this.stage==='escape'&&s.departed)this.begin('escape',[{text:'艾里亚斯：我到内侧门后了。拍下这里的情况，再确认我们能继续往下走。',end:'departure'}]);
   else if(this.stage==='departure'&&s.departureConfirmed)this.stage='done';
  }
  if(this.pending.length){this.active=this.pending.shift()!;this.remaining=this.active.seconds??Math.max(4,Math.min(32,this.active.text.length*.18));out.line=this.active.text;out.seconds=this.remaining;}
  return out;
 }
 snapshot(){return {version:1 as const,stage:this.stage,pending:structuredClone(this.pending),active:this.active?structuredClone(this.active):null,remaining:this.remaining,choosing:this.choosing};}
 restore(value:unknown){
  if(!value||typeof value!=='object')return false;const s=value as ReturnType<HarborRescueDialogue['snapshot']>;
  const beat=(b:Beat)=>b&&typeof b.text==='string'&&(b.end===undefined||stages.includes(b.end))&&(b.effect===undefined||['rumble','escape'].includes(b.effect))&&(b.seconds===undefined||Number.isFinite(b.seconds)&&b.seconds>=0&&b.seconds<=32);
  if(s.version!==1||!stages.includes(s.stage)||!Array.isArray(s.pending)||!s.pending.every(beat)||(s.active!==null&&!beat(s.active))||!Number.isFinite(s.remaining)||s.remaining<0||s.remaining>32||typeof s.choosing!=='boolean'||s.choosing&&s.stage!=='confirm')return false;
  this.stage=s.stage;this.pending=structuredClone(s.pending);this.active=s.active?structuredClone(s.active):null;this.remaining=s.remaining;this.choosing=s.choosing;return true;
 }
 /** Legacy saves carry physical facts, never replay all old future radio lines. */
 migrate(s:Readonly<HarborRescueState>){this.stage=s.departureConfirmed?'done':s.departed?'departure':s.departing?'escape':s.isolated?'confirm':s.lureConfirmed?'close':s.gateOpen?'lure':s.powered?'open':s.identified?'report':s.replied?'stop':'contact';}
 get currentLine(){return this.active?.text??'';}
 get currentSeconds(){return this.remaining;}
}



