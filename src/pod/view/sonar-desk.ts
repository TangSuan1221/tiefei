import { crtFont, TERMINAL_INK } from './crt-hud';
import type { PodRun } from '../sim/run';
import {isAudioMuted} from '../../audio/mute';
import type { HitMap } from './chrome';
import { drawDrivingSonarInstrument } from './stations';
import { layoutCJK } from '@/ui/typography';
import { COORD_AXES, formatCoords, worldFromFields } from '../sim/site-coords';

/** Surface depth of the current site's world y=0, so DEPTH = datum − y. */
export function coordinateDatum(run:PodRun):number {
 const site=run.authoredSite;return site?.coordinateDatum??run.depth+(site?.elevation??0);
}

type RecordEntry={text:string;kind:string;frequency:number;recording?:string};
type Desk={frequency:number;axis:number;caretResetAt?:number;fields:string[];target:number[]|null;page:'home'|'result'|'history';records:RecordEntry[];selected?:number;message:string};
const desks=new WeakMap<PodRun,Desk>();
const compactPages=new WeakMap<PodRun,'nav'|'radio'>();
const radioPages=new WeakMap<PodRun,{list:number;text:number}>();
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
 if(id==='sonar.compact.nav'||id==='sonar.compact.radio'){compactPages.set(run,id.endsWith('radio')?'radio':'nav');return true;}
 if(receiver?.autoReceive&&id.startsWith('sonar.radio.')){const pages=radioPages.get(run)??{list:0,text:0};radioPages.set(run,pages);if(id==='sonar.radio.prev')pages.list=Math.max(0,pages.list-1);if(id==='sonar.radio.next')pages.list++;if(id==='sonar.radio.textPrev')pages.text=Math.max(0,pages.text-1);if(id==='sonar.radio.textNext')pages.text++;if(id.startsWith('sonar.radio.open.')){s.selected=Number(id.slice(17));s.page='result';pages.text=0;}return true;}
 if(id.startsWith('sonar.tune.')){s.frequency=35+Math.max(0,Math.min(100,Number(id.slice(11))))/10;receiver?.setFrequency?.(s.frequency);return true;}
 if(id.startsWith('sonar.axis.')){s.axis=Number(id.at(-1));s.caretResetAt=performance.now();return true;}
 if(id==='sonar.deleteWaypoint'){
  const ok=receiver?.deleteSelectedWaypoint?.()??false;
  if(ok){s.target=receiver?.target?[...receiver.target]:null;s.message=s.target?'坐标点已删除 · 已切换至剩余坐标点':'坐标点已删除 · 暂无坐标点';}
  return ok;
 }
 if(id.startsWith('sonar.waypoint.')){
  const ok=receiver?.selectWaypoint?.(Number(id.slice('sonar.waypoint.'.length)))??false;
  if(ok&&receiver?.target){s.target=[...receiver.target];s.message='已切换惯导航点';}return ok;
 }
 if(id.startsWith('sonar.key.')){
  s.caretResetAt=performance.now();
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
 if(id==='sonar.history'){s.page='history';return true;}
 if(id==='sonar.home'){s.page='home';return true;}
 if(id.startsWith('sonar.result.')){const index=Number(id.slice(13));if(s.records[index]){s.selected=index;s.page='result';}return true;}
 if(id==='sonar.play'){
  if(receiver)return receiver.action('port.play');
  const recording=s.records[s.selected??s.records.length-1]?.recording;if(!recording)return false;
  run.storyCaption=recording;run.storyCaptionLeft=12;
  if(!isAudioMuted()&&'speechSynthesis' in window){const voice=new SpeechSynthesisUtterance(recording);voice.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(voice);}return true;
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
 const text=(t:string,x:number,y:number,size=18,color:string=TERMINAL_INK.text)=>{ctx.fillStyle=color;ctx.font=crtFont(size);ctx.fillText(t,x,y);};
 const button=(id:string,t:string,bx:number,by:number,bw:number,bh=34)=>{ctx.fillStyle='#34473e';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle='#6f8775';ctx.strokeRect(bx,by,bw,bh);text(t,bx+9,by+bh/2,17);hits.add({id,x:x+bx*w/1024,y:y+by*h/720,w:bw*w/1024,h:bh*h/720});};
 const screen=(bx:number,by:number,bw:number,bh:number)=>{ctx.fillStyle='#050f10';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle='#647567';ctx.lineWidth=4;ctx.strokeRect(bx,by,bw,bh);};
 text('ACOUSTICS / 水声导航台',24,25,21);button('back','返回总控',867,10,135);
 screen(20,55,530,300);screen(568,55,436,300);
 text('01 主动声纳 / 地形 · 距离',36,76);
 ctx.save();ctx.beginPath();ctx.rect(28,94,514,249);ctx.clip();ctx.translate(28,94);
 if(run.powered&&(run.activeSonarEnabled||r?.drawActive)){if(r?.drawActive){r.drawActive(ctx,514,249);for(const m of r.markerHits??[])hits.add({id:'sonar.waypoint.'+m.index,x:x+(28+m.x-m.r)*w/1024,y:y+(94+m.y-m.r)*h/720,w:m.r*2*w/1024,h:m.r*2*h/720});}else drawDrivingSonarInstrument(ctx,run,514,249,time);}
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
 if(r?.target&&r.deleteSelectedWaypoint)button('sonar.deleteWaypoint','删除当前坐标点',786,306,202);
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
   ctx.font=crtFont(17);const lines=layoutCJK(ctx,choice,378),bh=Math.max(43,lines.length*21+14);
   button('sonar.rescueReply.'+i,'',585,cy,400,bh);lines.forEach((line,j)=>text(line,596,cy+17+j*21,17));cy+=bh+6;
  });
 }
 else if(r?.autoReceive){
  const records=r.radioRecords??[],pages=radioPages.get(run)??{list:0,text:0};radioPages.set(run,pages);
  if(s.page==='home'){button('sonar.history','声音记录 ('+records.length+')',585,424,400);text(r.pendingRadioCount?'新录音等待接收':'接收常开 · 暂无新录音',585,484,19,'#efc576');text('滑块对准躁动声带，自动播放。',585,522,17);text('听过的对白保存在声音记录中。',585,556,17);}
  else if(s.page==='history'){button('sonar.home','返回',585,421,110);button('sonar.radio.prev','上一页',704,421,130);button('sonar.radio.next','下一页',844,421,140);pages.list=Math.min(pages.list,Math.max(0,Math.ceil(records.length/3)-1));records.slice(pages.list*3,pages.list*3+3).forEach((v,i)=>button('sonar.radio.open.'+(pages.list*3+i),String(pages.list*3+i+1)+'. '+v.text.slice(0,17)+'…',585,467+i*48,400,42));}
  else{button('sonar.history','声音记录',585,421,128);button('sonar.radio.textPrev','上段',722,421,120);button('sonar.radio.textNext','下段',852,421,132);ctx.font=crtFont(18);const lines=layoutCJK(ctx,records[s.selected??records.length-1]?.text??'暂无文字记录',394);pages.text=Math.min(pages.text,Math.max(0,Math.ceil(lines.length/5)-1));lines.slice(pages.text*5,pages.text*5+5).forEach((v,i)=>text(v,585,480+i*28,18));}
 }
 else if(s.page==='home'){button('sonar.analyze','分析所选频带',585,424,192);button('sonar.history',`分析记录 (${s.records.length})`,790,424,195);text('拖动下方滑块，对准异常声带。',587,493,17);text('被动监听不测距，不显示障碍。',587,528,17);}
 else if(s.page==='history'){button('sonar.home','返回',585,421,100);if(!s.records.length)text('暂无分析记录',587,494);else s.records.slice(-3).forEach((record,i)=>button('sonar.result.'+(Math.max(0,s.records.length-3)+i),record.kind+' · '+record.frequency.toFixed(1)+' kHz',585,465+i*48,400,42));}
 else {const entry=s.records[s.selected??s.records.length-1];button('sonar.play','▶ 播放录存',585,421,185);button('sonar.home','返回主界面',784,421,202);text('类型：'+(entry?.kind??'未知'),585,482,18,'#efc576');ctx.font=crtFont(18);layoutCJK(ctx,entry?.text??'',394).slice(0,4).forEach((line,i)=>text(line,585,514+i*25,18));}
 ctx.fillStyle='#0c1512';ctx.fillRect(36,656,496,10);ctx.fillStyle='#c5b68c';ctx.fillRect(cursor-10,644,20,34);
 for(let i=0;i<=100;i++)hits.add({id:'sonar.tune.'+i,x:x+(31+i*4.96)*w/1024,y:y+638*h/720,w:5.5*w/1024,h:44*h/720});
 if(!choices.length)button('sonar.reply','◉ 麦克风 / 回复',585,646,220,40);else text('点击上方语句发送回复',585,666,17,'#efc576');text(s.message||r?.receivedCoordinates||'被动阵列持续监听',30,702,16,'#e3ba76');
 ctx.restore();
}
