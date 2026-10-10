import type { PodRun } from '../sim/run';
import type { HitMap } from './chrome';
import { drawDrivingSonarInstrument } from './stations';
import { layoutCJK } from '@/ui/typography';
import { COORD_AXES, formatCoords, worldFromFields } from '../sim/site-coords';
import type { PassiveKind, SoundRecord } from '../sim/authored-site';

/** Surface depth of the current site's world y=0, so DEPTH = datum − y. */
export function coordinateDatum(run:PodRun):number {
 const site=run.authoredSite;return site?.coordinateDatum??run.depth+(site?.elevation??0);
}

type RecordEntry={text:string;kind:string;frequency:number;recording?:string};
type Desk={frequency:number;axis:number;fields:string[];target:number[]|null;page:'home'|'result'|'history';records:RecordEntry[];selected?:number;message:string};
const desks=new WeakMap<PodRun,Desk>();
const compactPages=new WeakMap<PodRun,'nav'|'radio'>();
const radioPages=new WeakMap<PodRun,{list:number;text:number}>();
/** Transient passive-CRT UI state; deliberately outside the saved desk snapshot. */
type PassiveUi={tab:'main'|'log'|'help';choice:number|null;micSince:number|null;logPage:number;logSelected:number|null;textPage:number};
const passiveUis=new WeakMap<PodRun,PassiveUi>();
export function passiveUi(run:PodRun):PassiveUi{
 let u=passiveUis.get(run);if(!u){u={tab:'main',choice:null,micSince:null,logPage:0,logSelected:null,textPage:0};passiveUis.set(run,u);}return u;
}
/** Push-to-talk must be held this long; a tap is treated as a mis-click. */
export const MIC_HOLD_MS=450;
const now=()=>globalThis.performance?.now()??Date.now();
export function sonarDeskState(run:PodRun):Desk {
 let s=desks.get(run);if(!s){s={frequency:37.8,axis:0,fields:['','',''],target:null,page:'home',records:[],message:''};desks.set(run,s);}return s;
}
export function sonarAction(run:PodRun,id:string):boolean {
 const s=sonarDeskState(run), receiver=run.authoredSite?.navigationConsole;
 if(id.startsWith('sonar.rescueReply.')){
  const site=run.authoredSite,index=Number(id.slice('sonar.rescueReply.'.length));
  if(!site?.managesNarrative||!Number.isInteger(index)||index<0||!site.dialogueChoices?.[index])return false;
  const ok=site.chooseDialogue?.(index)??false;s.message=ok?'回复已发送':'此时无法发送这条回复';return ok;
 }
 const ui=passiveUi(run);
 if(id==='sonar.tab.main'||id==='sonar.tab.log'||id==='sonar.tab.help'){ui.tab=id.slice(10) as PassiveUi['tab'];if(ui.tab==='log'){ui.logSelected=null;ui.textPage=0;}return true;}
 if(id.startsWith('sonar.choose.')){
  const index=Number(id.slice(13)),choices=run.authoredSite?.dialogueChoices??[];
  if(!Number.isInteger(index)||!choices[index])return false;ui.choice=index;s.message='已选择 · 按住麦克风说话，松开发送';return true;
 }
 if(id==='sonar.mic.down'){ui.micSince=now();return true;}
 if(id==='sonar.mic.cancel'){ui.micSince=null;return true;}
 if(id==='sonar.mic.up'){
  if(ui.micSince===null)return false;
  const held=now()-ui.micSince;ui.micSince=null;
  if(held<MIC_HOLD_MS){s.message='按住麦克风说话，松开发送';return false;}
  const choices=run.authoredSite?.managesNarrative?run.authoredSite.dialogueChoices??[]:[];
  if(choices.length){
   if(ui.choice===null||!choices[ui.choice]){s.message='先在屏幕上选择要说的话';return false;}
   const ok=sonarAction(run,'sonar.rescueReply.'+ui.choice);if(ok)ui.choice=null;return ok;
  }
  return sonarAction(run,'sonar.reply');
 }
 if(id==='sonar.log.prev'){ui.logPage=Math.max(0,ui.logPage-1);return true;}
 if(id==='sonar.log.next'){ui.logPage++;return true;}
 if(id==='sonar.log.textPrev'){ui.textPage=Math.max(0,ui.textPage-1);return true;}
 if(id==='sonar.log.textNext'){ui.textPage++;return true;}
 if(id.startsWith('sonar.log.open.')){const index=Number(id.slice(15));if(!Number.isInteger(index)||index<0)return false;ui.logSelected=index;ui.textPage=0;return true;}
 if(id==='sonar.compact.nav'||id==='sonar.compact.radio'){compactPages.set(run,id.endsWith('radio')?'radio':'nav');return true;}
 if(receiver?.autoReceive&&id.startsWith('sonar.radio.')){const pages=radioPages.get(run)??{list:0,text:0};radioPages.set(run,pages);if(id==='sonar.radio.prev')pages.list=Math.max(0,pages.list-1);if(id==='sonar.radio.next')pages.list++;if(id==='sonar.radio.textPrev')pages.text=Math.max(0,pages.text-1);if(id==='sonar.radio.textNext')pages.text++;if(id.startsWith('sonar.radio.open.')){s.selected=Number(id.slice(17));s.page='result';pages.text=0;}return true;}
 if(id.startsWith('sonar.tune.')){s.frequency=35+Math.max(0,Math.min(100,Number(id.slice(11))))/10;receiver?.setFrequency?.(s.frequency);return true;}
 if(id.startsWith('sonar.axis.')){s.axis=Number(id.at(-1));return true;}
 if(id.startsWith('sonar.waypoint.')){
  const ok=receiver?.selectWaypoint?.(Number(id.slice('sonar.waypoint.'.length)))??false;
  if(ok&&receiver?.target){s.target=[...receiver.target];s.message='已切换惯导航点';}return ok;
 }
 if(id.startsWith('sonar.key.')){
  const key=id.slice(10);if(key==='clear')s.fields[s.axis]='';else if(key==='del')s.fields[s.axis]=s.fields[s.axis].slice(0,-1);else if(s.fields[s.axis].length<8)s.fields[s.axis]+=key;return true;
 }
 if(id==='sonar.save'){
  const typed=s.fields.map(Number);if(s.fields.some(f=>!f.trim())||!typed.every(Number.isFinite)){s.message='坐标格式不正确';return false;}
  const v=worldFromFields(typed,coordinateDatum(run));
  if(receiver?.setWaypoint&&!receiver.setWaypoint(v)){s.message='坐标超出本地航区';return false;}
  s.target=v;s.message=run.activeSonarEnabled?'航点已写入 · 按声纳图上的转向角用 J / L 转船头':'航点已写入 · 主动声纳电源未开，航向指引不显示';return true;
 }
 if(id==='sonar.analyze'){
  receiver?.setFrequency?.(s.frequency);
  const heard=run.heard.at(-1);
  const result=receiver?receiver.analyzeSignal?.():Math.abs(s.frequency-38.4)<.65&&heard?{kind:'通信录存 / 人声',text:'已接收通信。仅记录证词，现场事实仍需摄影核对。',recording:heard.speaker+'：'+heard.text}:null;
  if(!result){s.message='该频带无可分析的录存信号';return false;}
  if(!s.records.some(r=>r.text===result.text&&r.recording===('recording' in result?result.recording:undefined)))s.records.push({...result,frequency:s.frequency});
  s.selected=s.records.length-1;s.page='result';s.message='';return true;
 }
 if(id==='sonar.history'){s.page='history';ui.tab='log';return true;}
 if(id==='sonar.home'){s.page='home';return true;}
 if(id.startsWith('sonar.result.')){const index=Number(id.slice(13));if(s.records[index]){s.selected=index;s.page='result';}return true;}
 if(id==='sonar.play'){
  if(receiver)return receiver.action('port.play');
  const recording=s.records[s.selected??s.records.length-1]?.recording;if(!recording)return false;
  run.storyCaption=recording;run.storyCaptionLeft=12;
  if('speechSynthesis' in window){const voice=new SpeechSynthesisUtterance(recording);voice.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(voice);}return true;
 }
 if(id==='sonar.reply'){
  if(receiver){const ok=receiver.reply?.()??false;s.message=ok?'已发送固定回复':'请先播放录存，等待可应答的呼叫';return ok;}
  if(!s.records.length){s.message='当前没有可回复的通信';return false;}
  run.pushLog('罗温：收到。我会先核对现场影像，再回复调查结果。','system');s.message='已发送固定回复';return true;
 }
 return false;
}
export function drawSonarDesk(ctx:CanvasRenderingContext2D,run:PodRun,x:number,y:number,w:number,h:number,hits:HitMap,time:number){
 const s=sonarDeskState(run),r=run.authoredSite?.navigationConsole;
 const choices=run.authoredSite?.managesNarrative?run.authoredSite.dialogueChoices??[]:[];
 ctx.save();ctx.translate(x,y);ctx.scale(w/1024,h/720);ctx.textBaseline='middle';ctx.textAlign='left';
 ctx.fillStyle='#28312e';ctx.fillRect(0,0,1024,720);
 const text=(t:string,x:number,y:number,size=18,color='#adc7b5')=>{ctx.fillStyle=color;ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.fillText(t,x,y);};
 const button=(id:string,t:string,bx:number,by:number,bw:number,bh=34)=>{ctx.fillStyle='#34473e';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle='#6f8775';ctx.strokeRect(bx,by,bw,bh);text(t,bx+9,by+bh/2,17);hits.add({id,x:x+bx*w/1024,y:y+by*h/720,w:bw*w/1024,h:bh*h/720});};
 const screen=(bx:number,by:number,bw:number,bh:number)=>{ctx.fillStyle='#050f10';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle='#647567';ctx.lineWidth=4;ctx.strokeRect(bx,by,bw,bh);};
 text('ACOUSTICS / 水声导航台',24,25,21);button('back','返回总控',867,10,135);
 screen(20,55,530,300);screen(568,55,436,300);
 text('01 主动声纳 / 地形 · 距离',36,76);
 ctx.save();ctx.beginPath();ctx.rect(28,94,514,249);ctx.clip();ctx.translate(28,94);
 if(run.activeSonarEnabled&&run.powered){if(r?.drawActive){r.drawActive(ctx,514,249);for(const m of r.markerHits??[])hits.add({id:'sonar.waypoint.'+m.index,x:x+(28+m.x-m.r)*w/1024,y:y+(94+m.y-m.r)*h/720,w:m.r*2*w/1024,h:m.r*2*h/720});}else drawDrivingSonarInstrument(ctx,run,514,249,time);}
 else{text('换能器断电',175,116,24);text('开启电源后显示地形和距离',122,153,17);}
 if(s.target&&!r?.drawActive){
  const pose=run.authoredSite?.snapshot() as {position?:number[]}|undefined;
  const p=pose?.position;if(p?.length===3){const dx=s.target[0]-p[0],dz=s.target[2]-p[2],a=Math.atan2(dx,-dz)-run.heading*Math.PI/180,d=Math.min(1,Math.hypot(dx,dz)/24);ctx.strokeStyle='#efc576';ctx.strokeRect(257+Math.sin(a)*90*d-4,124-Math.cos(a)*90*d-4,8,8);text('惯导航点 / '+formatCoords(s.target,coordinateDatum(run)),20,230,15,'#efc576');}
 }
 ctx.restore();
 text('02 惯导 / X·Y·DEPTH 航点',585,77);COORD_AXES.forEach((a,i)=>button('sonar.axis.'+i,`${s.axis===i?'▸ ':''}${a} ${s.fields[i]||'_'}`,582+i*138,98,128));
 const keys=['1','2','3','4','5','6','7','8','9','-','0','.'];keys.forEach((k,i)=>button('sonar.key.'+k,k,582+i%3*64,144+Math.floor(i/3)*40,56));
 button('sonar.key.del','退格',786,144,94);button('sonar.key.clear','清空',890,144,98);
 button('sonar.save','写入航点',786,184,202);
 button('nav.active',run.activeSonarEnabled?'关闭主动声纳':'开启主动声纳',786,224,202);
 button('nav.ping1',run.sonarPulseEnabled?'停止脉冲':'开启脉冲',786,264,202);
 text(run.activeSonarEnabled?(run.sonarEmitting?'脉冲中 · 吸引生物':'静默 · 保留回波'):'电源 OFF',586,328,16,'#e3ba76');
 screen(20,374,530,256);screen(568,374,436,256);
 text('03 被动监听 / 频率—时间瀑布图',36,395);
 if(r?.drawWaterfall){ctx.save();ctx.translate(36,420);r.drawWaterfall(ctx,496,176);ctx.restore();}
 else {for(let row=0;row<30;row++)for(let col=0;col<72;col++){const peak=run.heard.length?.7*Math.exp(-Math.pow((35+col*10/72-38.4)/.24,2)):0;ctx.fillStyle='rgba(122,225,153,'+(.03+peak*(.7+.3*Math.sin(row+time)**2))+')';ctx.fillRect(36+col*496/72,420+row*176/30,7,6);}if(!run.heard.length)text('接收常开 · 暂无通信载波',60,490);}
 const cursor=36+(s.frequency-35)/10*496;ctx.strokeStyle='#efc576';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cursor,420);ctx.lineTo(cursor,596);ctx.stroke();
 text('35 kHz',36,613,16);text(`${s.frequency.toFixed(1)} kHz`,220,613,16,'#efc576');text('45 kHz',456,613,16);
 text((r?.autoReceive?'04 调频通信 / ':'04 声音分析 / ')+(s.page==='home'?'主界面':s.page==='history'?'分析记录':'分析结果'),584,396);
 if(choices.length){
  text('麦克风 / 选择回复',585,426,18,'#efc576');
  let cy=447;choices.forEach((choice,i)=>{
   ctx.font='17px "Microsoft YaHei"';const lines=layoutCJK(ctx,choice,378),bh=Math.max(43,lines.length*21+14);
   button('sonar.rescueReply.'+i,'',585,cy,400,bh);lines.forEach((line,j)=>text(line,596,cy+17+j*21,17));cy+=bh+6;
  });
 }
 else if(r?.autoReceive){
  const records=r.radioRecords??[],pages=radioPages.get(run)??{list:0,text:0};radioPages.set(run,pages);
  if(s.page==='home'){button('sonar.history','声音记录 ('+records.length+')',585,424,400);text(r.pendingRadioCount?'新录音等待接收':'接收常开 · 暂无新录音',585,484,19,'#efc576');text('滑块对准躁动声带，自动播放。',585,522,17);text('听过的对白保存在声音记录中。',585,556,17);}
  else if(s.page==='history'){button('sonar.home','返回',585,421,110);button('sonar.radio.prev','上一页',704,421,130);button('sonar.radio.next','下一页',844,421,140);pages.list=Math.min(pages.list,Math.max(0,Math.ceil(records.length/3)-1));records.slice(pages.list*3,pages.list*3+3).forEach((v,i)=>button('sonar.radio.open.'+(pages.list*3+i),String(pages.list*3+i+1)+'. '+v.text.slice(0,17)+'…',585,467+i*48,400,42));}
  else{button('sonar.history','声音记录',585,421,128);button('sonar.radio.textPrev','上段',722,421,120);button('sonar.radio.textNext','下段',852,421,132);ctx.font='18px "Microsoft YaHei"';const lines=layoutCJK(ctx,records[s.selected??records.length-1]?.text??'暂无文字记录',394);pages.text=Math.min(pages.text,Math.max(0,Math.ceil(lines.length/5)-1));lines.slice(pages.text*5,pages.text*5+5).forEach((v,i)=>text(v,585,480+i*28,18));}
 }
 else if(s.page==='home'){button('sonar.analyze','分析所选频带',585,424,192);button('sonar.history',`分析记录 (${s.records.length})`,790,424,195);text('拖动下方滑块，对准异常声带。',587,493,17);text('被动监听不测距，不显示障碍。',587,528,17);}
 else if(s.page==='history'){button('sonar.home','返回',585,421,100);if(!s.records.length)text('暂无分析记录',587,494);else s.records.slice(-3).forEach((record,i)=>button('sonar.result.'+(Math.max(0,s.records.length-3)+i),record.kind+' · '+record.frequency.toFixed(1)+' kHz',585,465+i*48,400,42));}
 else {const entry=s.records[s.selected??s.records.length-1];button('sonar.play','▶ 播放录存',585,421,185);button('sonar.home','返回主界面',784,421,202);text('类型：'+(entry?.kind??'未知'),585,482,18,'#efc576');ctx.font='18px "Microsoft YaHei"';layoutCJK(ctx,entry?.text??'',394).slice(0,4).forEach((line,i)=>text(line,585,514+i*25,18));}
 ctx.fillStyle='#0c1512';ctx.fillRect(36,656,496,10);ctx.fillStyle='#c5b68c';ctx.fillRect(cursor-10,644,20,34);
 for(let i=0;i<=100;i++)hits.add({id:'sonar.tune.'+i,x:x+(31+i*4.96)*w/1024,y:y+638*h/720,w:5.5*w/1024,h:44*h/720});
 if(!choices.length)button('sonar.reply','◉ 麦克风 / 回复',585,646,220,40);else text('点击上方语句发送回复',585,666,17,'#efc576');text(s.message||r?.receivedCoordinates||'被动阵列持续监听',30,702,16,'#e3ba76');
 ctx.restore();
}

const AMBER='#f0c477',DIM='#98783c',BRIGHT='#ffe6ad',INK='#100e08';
const KIND_NAME:Record<PassiveKind,string>={voice:'人声',scatter:'散乱载波',unknown:'???',bio:'海洋生物',self:'本艇脉冲'};
const SPEAKERS:Record<string,string>={艾里亚斯:'人声 · 艾里亚斯 · 固定水声通信',万斯:'人声 · 万斯 · 基地中继',罗温:'本艇麦克风 · 罗温'};
const missionTime=(at?:number)=>at===undefined?'T+--:--':`T+${String(Math.floor(at/60)).padStart(2,'0')}:${String(Math.floor(at%60)).padStart(2,'0')}`;
function recordArchive(record:SoundRecord){
 if(record.kind==='unknown')return {title:'??? · 未登记声纹',form:'低频宽带 · 不规则横向刮擦',kind:'unknown' as PassiveKind};
 if(record.kind==='bio')return {title:`${record.label??'海洋生物'} · 已登记`,form:'斜向调频上扫 · 成串咔嗒',kind:'bio' as PassiveKind};
 const speaker=record.text.split('：')[0]??'';
 return {title:SPEAKERS[speaker]??'人声 · 未识别说话人',form:'窄带断续 · 语音调制',kind:'voice' as PassiveKind};
}
/** Small envelope plot; live mode samples the waterfall at the cursor, archive mode draws the stored shape for that kind. */
function drawVoiceprint(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,kind:PassiveKind|null,live?:{rows:readonly ArrayLike<number>[];bin:number},seed=1){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 ctx.strokeStyle='rgba(152,120,60,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);ctx.stroke();
 const bars=40,bw=w/bars;ctx.fillStyle=AMBER;
 for(let i=0;i<bars;i++){
  let v:number;
  if(live){const row=live.rows[bars-1-i];v=row?Math.max(0,(Number(row[live.bin])||0)-.06)*1.3:0;}
  else{const t=i+seed*7.3,rnd=Math.abs(Math.sin(t*12.9898)*43758.5453)%1;
   v=kind==='voice'?(Math.sin(t*.9)+Math.sin(t*.37)>-.3?.45+.45*rnd:.06):kind==='unknown'?(.25+.35*rnd+(rnd>.82?.35:0)):kind==='bio'?(i%5===0?.85:i%5===1?.35:.05):kind==='self'?(i%9===0?.95:.04):.1*rnd;}
  const bh=Math.min(1,v)*(h-8);ctx.fillRect(x+i*bw+1,y+h/2-bh/2,Math.max(1,bw-2),Math.max(1,bh));
 }
 ctx.restore();
}

/** Passive CRT, kept sparse: label–value rows, thin rules, one status line. Slider and microphone are physical models on the bezel. */
export function drawCompactSonarDesk(ctx:CanvasRenderingContext2D,run:PodRun,hits:HitMap,_time:number,H=720){
 const s=sonarDeskState(run),r=run.authoredSite?.navigationConsole,ui=passiveUi(run);
 const choices=run.authoredSite?.managesNarrative?run.authoredSite.dialogueChoices??[]:[];
 const records=r?.radioRecords??[];
 const micTarget=run.authoredSite?.radioSay?run.authoredSite.micTarget??null:null;
 if(ui.choice!==null&&!choices[ui.choice])ui.choice=null;
 ctx.fillStyle=INK;ctx.fillRect(0,0,1024,H);ctx.textAlign='left';ctx.textBaseline='middle';
 const text=(v:string,x:number,y:number,size=26,color=AMBER,maxWidth?:number)=>{ctx.fillStyle=color;ctx.font=size+'px "Microsoft YaHei",sans-serif';ctx.fillText(v,x,y,maxWidth);};
 const rule=(x0:number,y:number,x1:number)=>{ctx.strokeStyle=DIM;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();};
 const row=(label:string,value:string,y:number,color=AMBER)=>{text(label,28,y,24,DIM);text(value,128,y,26,color,160);};
 const pill=(id:string,label:string,x:number,y:number,w:number,h:number,active:boolean)=>{
  if(active){ctx.fillStyle=AMBER;ctx.fillRect(x,y,w,h);}else{ctx.strokeStyle=DIM;ctx.lineWidth=1.5;ctx.strokeRect(x,y,w,h);}
  ctx.textAlign='center';text(label,x+w/2,y+h/2,26,active?INK:AMBER,w-12);ctx.textAlign='left';hits.add({id,x,y,w,h});
 };
 // Tabs: a narrow column on the right.
 ([['main','声纳'],['log','记录'],['help','说明']] as const).forEach(([tab,label],i)=>pill('sonar.tab.'+tab,label,900,20+i*84,104,70,ui.tab===tab));
 if(ui.micSince!==null){const held=Math.min(1,(now()-ui.micSince)/MIC_HOLD_MS);ctx.textAlign='center';text(held>=1?'● 发送':'● 按住',952,H-60,24,BRIGHT);ctx.textAlign='left';ctx.fillStyle=BRIGHT;ctx.fillRect(904,H-36,96*held,6);}
 ctx.strokeStyle=DIM;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(884,20);ctx.lineTo(884,H-20);ctx.stroke();

 if(ui.tab==='main'){
  const focus=r?.passiveFocus,c=focus?.contact??null;
  text('声纹分析',28,40,22,DIM);
  text(c?(c.kind==='bio'?c.label:KIND_NAME[c.kind]):'—',28,100,c?.kind==='unknown'?60:48,c?BRIGHT:DIM,250);
  text(c?.form??'滑块对准声带',28,148,20,DIM,256);
  rule(28,176,290);
  row('频段',c?`${c.frequency.toFixed(1)} kHz`:'—',212);
  row('方位',c?.bearing??'—',256);
  row('状态',!c?'—':c.kind==='scatter'?'无法锁定':focus!.locked?'已锁定':`${Math.round(Math.min(1,focus!.held/.45)*100)}%`,300,c&&focus!.locked?BRIGHT:AMBER);
  // Waterfall with frequency axis and a thin envelope strip beneath, like a second sensor trace.
  const X=316,W=552,Y=24,WH=320;
  ctx.save();ctx.beginPath();ctx.rect(X,Y,W,WH);ctx.clip();ctx.translate(X,Y);
  if(r?.drawWaterfall)r.drawWaterfall(ctx,W,WH,false,true);else{ctx.fillStyle='#120c04';ctx.fillRect(0,0,W,WH);}
  ctx.restore();
  for(const contact of r?.passiveContacts??[]){if(contact.kind==='self')continue;const cx=X+(contact.frequency-35)/10*W;ctx.fillStyle=AMBER;ctx.beginPath();ctx.moveTo(cx-7,Y);ctx.lineTo(cx+7,Y);ctx.lineTo(cx,Y+11);ctx.fill();}
  const cursor=X+(s.frequency-35)/10*W;ctx.strokeStyle=BRIGHT;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cursor,Y);ctx.lineTo(cursor,Y+WH);ctx.stroke();
  for(let k=0;k<=10;k++){const tx=X+k*W/10;ctx.fillStyle=DIM;ctx.fillRect(tx-.75,Y+WH,1.5,k%5?6:12);}
  text('35',X,Y+WH+30,22,DIM);text('45',X+W-24,Y+WH+30,22,DIM);ctx.textAlign='center';text(s.frequency.toFixed(1)+' kHz',Math.max(X+80,Math.min(X+W-80,cursor)),Y+WH+30,24,BRIGHT);ctx.textAlign='left';
  // With reply choices on screen the envelope strip yields its space to them.
  const rows=r?.passiveRows??[],bins=rows[0]?.length??120,ruleY=choices.length?Y+WH+50:Y+WH+112;
  if(!choices.length)drawVoiceprint(ctx,X,Y+WH+52,W,46,c?.kind??null,{rows,bin:Math.max(0,Math.min(bins-1,Math.floor((s.frequency-35)/10*bins)))});
  rule(28,ruleY,868);
  if(choices.length){
   text(micTarget?`麦克风 · 可通话：${micTarget} · 按住说话或按 M，可自由输入`:ui.choice===null?'选择一句，再按住麦克风':'按住麦克风说话 · 松开发送',28,ruleY+26,22,micTarget?AMBER:DIM,840);let cy=ruleY+46;
   choices.forEach((choice,i)=>{
    ctx.font='24px "Microsoft YaHei"';const lines=layoutCJK(ctx,choice,780).slice(0,2),bh=lines.length*30+10,active=ui.choice===i;
    if(active){ctx.fillStyle='rgba(240,196,119,.16)';ctx.fillRect(24,cy,844,bh);}
    text(active?'▶':String(i+1),32,cy+bh/2-(lines.length-1)*15,24,active?BRIGHT:DIM);
    lines.forEach((line,j)=>text(line,64,cy+20+j*30,24,active?BRIGHT:AMBER));hits.add({id:'sonar.choose.'+i,x:24,y:cy,w:844,h:bh});cy+=bh+4;
   });
  }else{
   const scatter=r?.passiveContacts?.find(x=>x.kind==='scatter');
   text(scatter?`载波散乱 · 向${scatter.bearing}接近`:r?.pendingRadioCount?'新载波 · 对准声带自动播放':'持续监听',28,ruleY+44,28,BRIGHT,840);
   if(s.message)text(s.message,28,ruleY+88,22,DIM,840);
   if(micTarget)text(`麦克风 · 可通话：${micTarget}`,28,ruleY+(s.message?124:88),22,AMBER,840);
  }
  return;
 }
 if(ui.tab==='log'){
  if(!records.length){text('暂无声音记录',28,60,26,DIM);return;}
  const perPage=Math.floor((H-150)/60),pages=Math.max(1,Math.ceil(records.length/perPage));ui.logPage=Math.min(ui.logPage,pages-1);
  const selected=Math.min(ui.logSelected??records.length-1,records.length-1);
  text('时间',28,40,22,DIM);
  records.slice(ui.logPage*perPage,ui.logPage*perPage+perPage).forEach((record,k)=>{
   const i=ui.logPage*perPage+k,y=64+k*60,active=i===selected,arch=recordArchive(record);
   if(active){ctx.fillStyle=AMBER;ctx.fillRect(24,y,266,52);}
   text(missionTime(record.at),34,y+26,22,active?INK:AMBER);
   text(arch.kind==='unknown'?'???':arch.title.split(' · ')[arch.kind==='voice'?1:0]??'',150,y+26,22,active?INK:DIM,132);
   hits.add({id:'sonar.log.open.'+i,x:24,y,w:266,h:52});
  });
  const pagerY=H-44;
  if(pages>1){text('◀',40,pagerY,28,ui.logPage>0?AMBER:DIM);text(`${ui.logPage+1}/${pages}`,128,pagerY,22,DIM);text('▶',250,pagerY,28,ui.logPage<pages-1?AMBER:DIM);hits.add({id:'sonar.log.prev',x:24,y:pagerY-28,w:90,h:56});hits.add({id:'sonar.log.next',x:206,y:pagerY-28,w:90,h:56});}
  ctx.strokeStyle=DIM;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(304,24);ctx.lineTo(304,H-20);ctx.stroke();
  const record=records[selected]!,arch=recordArchive(record);
  text('声纹档案',324,40,22,DIM);
  text(arch.title,324,84,28,BRIGHT,540);
  text(`${record.frequency.toFixed(1)} kHz · ${arch.form}`,324,122,22,DIM,540);
  drawVoiceprint(ctx,324,142,544,52,arch.kind,undefined,record.text.length);
  rule(324,214,868);
  ctx.font='26px "Microsoft YaHei"';const lines=layoutCJK(ctx,record.text,540),perText=Math.floor((pagerY-40-250)/36)+1,textPages=Math.max(1,Math.ceil(lines.length/perText));
  ui.textPage=Math.min(ui.textPage,textPages-1);
  lines.slice(ui.textPage*perText,ui.textPage*perText+perText).forEach((line,i)=>text(line,324,250+i*36,26));
  if(textPages>1){text('◀',700,pagerY,28,AMBER);text(`${ui.textPage+1}/${textPages}`,756,pagerY,22,DIM);text('▶',836,pagerY,28,AMBER);hits.add({id:'sonar.log.textPrev',x:684,y:pagerY-28,w:64,h:56});hits.add({id:'sonar.log.textNext',x:816,y:pagerY-28,w:64,h:56});}
  return;
 }
 const help:[string,string][]=[
  ['常开','被动阵列不耗电、不发声，不会暴露潜艇。'],
  ['方位','只给大致方位，不给距离和障碍；测距用主动声纳。'],
  ['调频','拖动屏幕下方实体滑块，竖线对准声带约半秒即锁定。'],
  ['声带','人声：断续竖线　???：低频宽带加横向刮擦\n喙鲸：斜向扫线　本艇脉冲：44 kHz 横条'],
  ['散乱','求救载波太远时呈散乱噪点，朝方位接近后才能锁定。'],
  run.authoredSite?.radioSay?['回复','按住右下实体麦克风说话（或按 M），松开后可口述或输入原话，Enter 发送、Esc 取消；也可点快捷语。']:['回复','有选项先点选一句；按住右下实体麦克风说话，松开发送。'],
 ];
 let cy=48;
 help.forEach(([label,body])=>{text(label,28,cy,24,BRIGHT);ctx.font='24px "Microsoft YaHei"';for(const part of body.split('\n'))for(const line of layoutCJK(ctx,part,730)){text(line,124,cy,24);cy+=34;}cy+=20;rule(28,cy-18,868);});
}

