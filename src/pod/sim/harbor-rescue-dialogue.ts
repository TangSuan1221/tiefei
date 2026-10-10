import type {HarborRescueState} from './harbor-rescue';

/** Cost of keeping the film's contents from him: something reaches his boot on the way out. */
export const LIMP_LINES=['（水听器：一声很轻的金属碰——像有什么敲了敲他的靴跟。之后他的脚步，一轻，一重。）','艾里亚斯：左靴后跟的护板上多了三道印子。……在壳子外面。……你说门里什么都没有。'];

/** Lines after the farewell; Vance reacts to what the player actually did on this route. */
export function harborTail(o:{meet:unknown;hullHit:boolean;lied:boolean;named:boolean}):string[]{
 const keep=o.meet==='keepChannel';
 return [...(keep?['（频道开着。他不说话。接收机上一声高音咔。……三十秒。……咔。）']:[o.meet==='gate'?'艾里亚斯：我关频道了，省电。':'艾里亚斯：我关频道了，省电。下面见。','（咔哒。）']),
  '（被动声纳：货仓方位一个声源，不动。泄水井方位，又一个。水听器里，两下，一停。）',
  ...(keep?['（……三十秒。……四十秒。……五十秒。没有咔声。）','（……咔。）']:[]),
  '（地面频道：载波回来了。偶尔一声按键的咔哒。）',
  '万斯：语音全断了，我只收得到遥测。有一阵，你的点一动没动。……我没往上报。',
  ...(o.hullHit?['万斯：你艇壳读数掉了一格。我看见了，没写。']:[]),
  ...(o.lied?['万斯：你的接收机日志一起传上来了。你最后那次只按了一秒。对面的载波，又亮了十一秒。……你没再按。']:[]),
  ...(o.named?['万斯：你的发射机有一次开了很久。内容我收不到，我也不问。……签字栏还空着。']:[]),
  '万斯：往下走吧。我还盯着。'];
}

const stages=['contact','intro','stop','warning','photo','report','plan','power','powerBrief','open','lureBrief','lure','closeBrief','close','confirmBrief','confirm','escapeBrief','escape','departure','done'] as const;
type Stage=typeof stages[number];
type Effect='rumble'|'escape';
type Beat={text:string;end?:Stage;effect?:Effect;seconds?:number};
export type DialogueOutput={line?:string;seconds?:number;effects:Effect[]};
const tasks:Partial<Record<Stage,string>>={
 stop:'关闭主动声纳脉冲',
 photo:'前往01：X60 Y27 DEPTH 1012m，拍摄艾里亚斯附近，等待显影并分析录像',
 report:'已看清现场 · 按住麦克风，把你看到的告诉艾里亚斯',
 power:'恢复应急电力：02，X42 Y28 DEPTH 1012m，靠近配电面板按F',
 open:'前往01：X60 Y27 DEPTH 1012m，靠近面板按F打开货仓闸门',
 lure:'将怪物引入货仓：穿过闸口驶入03货舱内部 X77 Y7 DEPTH 1011m，在仓内开启脉冲引入；红点进仓后曝光确认，随即停发，低速撤出',
 close:'停止主动脉冲，返回开门时的01面板（X60 Y27 DEPTH 1012m，回到深度1012米）按F关闭货仓闸门',
 confirm:'货仓闸门已关闭 · 按住麦克风，告诉艾里亚斯可以出来',
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
 /** Free-text radio turn. Only contact, report and confirm advance, and only into the same stages the fixed replies used. */
 exchange(rowan:string,replies:readonly string[],advance:boolean,emitting:boolean,speaker='罗温：'){
  if(this.busy)return false;
  const lines:Beat[]=[...(rowan?[{text:speaker+rowan}]:[]),...replies.map(text=>({text}))];
  const live:Beat[]=rowan?[lines[0],{text:'（循环录音在第三遍中途断掉。一声吞咽。）',seconds:2.5},{text:'艾里亚斯：有人。……真的有人。'},...lines.slice(1)]:lines;
  if(advance&&this.stage==='contact'){this.begin('intro',[...live,emitting
   ?{text:'艾里亚斯：那是什么声音——是你在打声纳？关掉。现在就关。它听得见。',end:'stop'}
   :{text:'艾里亚斯：……别打声纳。千万别。它听得见。',end:'stop'}]);return true;}
  if(advance&&this.stage==='report'){this.begin('plan',[...lines,
   {text:'',seconds:1.6},
   {text:'艾里亚斯：门后是井。通港池。'},
   {text:'（水听器：井里，一串气泡上浮。）',seconds:2.5},
   {text:'艾里亚斯：走廊口在井盖正上面。它不挪，我过不去。'},
   {text:'',seconds:2},
   {text:'艾里亚斯：东边货仓，门厚。把它引进去，关门。……没电。配电箱在泵站外壁，黄漆的。',end:'power'}]);return true;}
  if(advance&&this.stage==='confirm'){this.choosing=false;this.begin('escapeBrief',[...lines,
   {text:'艾里亚斯：走廊。尽头值班室，有观察窗，门能锁。我拔了脐带走——服里的背包够一个钟头。脐带一拔，我也是水声了。少说话，你也是。'},
   {text:'艾里亚斯：镜头往左打到底，拍走廊口。洗出来的时候我该到了。',end:'escape',effect:'escape'}]);return true;}
  this.pending.push(...lines);return true;
 }
 /** First line once the departure film is verified; the site sets it from story facts. */
 closingLine='艾里亚斯：……门后面很安静。你还在线吗？';
 /** Elias's answer to the lure film; the site sets it from what Rowan said earlier. */
 lureLine='艾里亚斯：……拍到了？关声纳。慢慢出来，比你想的还要慢。回去关门。';
 /** Current task restated by Elias when asked what to do next; numbers stay on the HUD. */
 get planLine(){
  const plan:Partial<Record<Stage,string>>={
   power:'泵站外壁，黄漆那个配电箱——图上标的02。电不来，货仓门就是一堵墙。',
   open:'桥头那块面板，开货仓门。慢点。',
   lureBrief:'你那台是水声电话，问一句，水里就多一句。货仓，最里面。',
   lure:'你那台是水声电话，问一句，水里就多一句。货仓，最里面。',
   closeBrief:'关声纳。慢慢出来，回去关门。',
   close:'关声纳。慢慢出来，回去关门。',
  };
  return plan[this.stage]?'艾里亚斯：'+plan[this.stage]:'';
 }
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
    {text:'艾里亚斯：就这样。我这头走脐带硬线，接港里的固定换能器——窄波束，贴着地板只朝你打——你刚才那声声纳，我记下了方位。你那台是全向的水声电话，你每说一句，整片水都有。',effect:'rumble'},
    {text:'（水听器：门后，金属刮擦。两下，一停。）',seconds:2.5},
    {text:'艾里亚斯：两下一停。……它在找。'},
    {text:'艾里亚斯：你们局的艇我修过两条。灯是老镇流器吧？别开——会嗡。'},
    {text:'艾里亚斯：把你的艇停到桥头灯杆底下——旧外景机的机位，正对我这扇门。用你的相机。我头盔转不了，看不见身后——你帮我看。头灯快没电了，我挡着，漏一线。拍下来，告诉我上面有什么。',end:'photo'},
   ]);
   else if(this.stage==='photo'&&s.identified)this.begin('report',[{text:'艾里亚斯：……洗出来了？上面有什么？告诉我。'}]);
   else if(this.stage==='power'&&s.powered)this.begin('powerBrief',[
    {text:'（水听器：继电器一排咔哒响过去。刮擦停了。）',seconds:3},
    {text:'艾里亚斯：别出声。'},
    {text:'',seconds:6},
    {text:'（水听器：泵转起来。刮擦重新开始，低了。）',seconds:3,effect:'rumble'},
    {text:'艾里亚斯：低了。……它下去了，在听泵。那口井也就十来米深——井盖我掀不动，它一顶就开。得把它关起来。'},
    {text:'艾里亚斯：回桥头那块面板，开货仓门。慢点，门轴会叫。',end:'open'}]);
   else if(this.stage==='open'&&s.gateOpen)this.begin('lureBrief',[
    {text:'艾里亚斯：它听见门轴了。往下走了，井底。……它听门轴。',effect:'rumble'},
    {text:'艾里亚斯：货仓最里面。到了再开声纳。你进仓，我就闭嘴——我的波束会打到它身上。我按载波键：一下是等，两下是拍，打闪光。你那台是老式的，八千赫，正好在它耳朵里。我按的是测深仪的键，三十八千赫——三天里我按了几百下，它一次都没回头。'},
    {text:'艾里亚斯：你要是现在掉头，我不怪你。',end:'lure'},
   ]);
   else if(this.stage==='lure'&&s.lureConfirmed)this.begin('closeBrief',this.lureLine.split('\n').map((text,i,a):Beat=>i===a.length-1?{text,end:'close'}:{text}));
   else if(this.stage==='close'&&!s.lureConfirmed&&!s.isolated){this.stage='lure';this.enqueue('艾里亚斯：……刮声又回来了。它出来了。再引一次——这次也得拍下来。');}
   else if(this.stage==='close'&&s.isolated)this.begin('confirmBrief',[
    {text:'（水听器：门轴长叫。货仓里的刮擦猛地转向门口。闸落。一声闷撞。）',seconds:4},
    {text:'艾里亚斯：那一下……是门，还是它？它关进去了吗？',end:'confirm'}]);
   else if(this.stage==='escape'&&s.departed)this.begin('escape',[{text:'艾里亚斯：墙上有插口——插回去了，又是线了。……我在观察窗后面，门锁上了。这边是黑的。我回身朝你举灯——你拍。我背后，你帮我看着。',end:'departure'}]);
   else if(this.stage==='departure'&&s.departureConfirmed)this.begin('done',this.closingLine.split('\n').map(text=>({text})));
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



