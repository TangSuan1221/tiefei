import type { PodRun, TapeRecord } from '../sim/run';
import { isHarborOpening, openHarborCall } from '../sim/harbor-opening';
import { pauseLabPlayback } from './footage';
import { layoutCJK } from '@/ui/typography';
import { crtFont as cjk, TERMINAL_INK } from './crt-hud';

import { isVideoCall } from '../sim/tape-channel';
export { isVideoCall } from '../sim/tape-channel';

/** Transient comm-tab state; the call archive itself lives in run.tapes. */
interface CommUi { active:string|null; draft:string; spoken:string; editing:boolean }
const uis=new WeakMap<PodRun,CommUi>();
export function commUi(run:PodRun):CommUi {
  let u=uis.get(run);if(!u){u={active:null,draft:'',spoken:'',editing:false};uis.set(run,u);}return u;
}

/** Oldest call still waiting to be answered. The opening call stays pending until fully watched, also after a reload. */
export function incomingCall(run:PodRun):TapeRecord|null {
  const active=run.at==='lab'?commUi(run).active:null;
  return run.tapes.find(t=>{
    if(!isVideoCall(t)||t.ready===false||t.id===active)return false;
    const status=run.authoredSite?.evidenceStatus?.(t.siteEvidence);
    return t.callSeen!==true&&!t.analyzed&&!status?.stale||isHarborOpening(t)&&!status?.stale&&(!t.analyzed||status?.accepted===false);
  })??null;
}
export function callParts(t:TapeRecord){
  const [caller,...rest]=t.siteName.split(' · ');
  return rest.length?{caller:caller!,title:rest.join(' · ')}:{caller:'未知来源',title:t.siteName};
}
export function answerCall(run:PodRun,index:number):boolean {
  const t=run.tapes[index];
  if(!t||!isVideoCall(t)||t.ready===false||run.at!=='lab'||!run.powered)return false;
  run.tapeCursor=index;t.callSeen=true;if(isHarborOpening(t))openHarborCall(t);
  commUi(run).active=t.id;run.labVideoExpanded=false;return true;
}
export function hangUp(run:PodRun):boolean {
  const u=commUi(run);if(!u.active)return false;
  if(run.selectedTape?.id===u.active)pauseLabPlayback(run);
  u.active=null;run.labVideoExpanded=false;return true;
}

type Text=(value:string,px:number,py:number,size?:number,colour?:string,max?:number)=>void;
type Button=(id:string,label:string,px:number,py:number,width:number,height?:number,active?:boolean,disabled?:boolean)=>void;
const GREEN=TERMINAL_INK.text,DIM=TERMINAL_INK.dim,AMBER='#f0bf78',BRIGHT=TERMINAL_INK.bright;

/** Lab tab 04: answer NPC video calls, watch them on the central CRT, and talk over the microphone. */
export function drawCommTab(ctx:CanvasRenderingContext2D,run:PodRun,time:number,ui:{text:Text;button:Button;playback:(ctx:CanvasRenderingContext2D,w:number,h:number)=>string;videoHit:(x:number,y:number,w:number,h:number)=>void}){
  const {text,button}=ui,u=commUi(run);
  const active=u.active?run.tapes.find(t=>t.id===u.active)??null:null;
  // Selecting another reel elsewhere ends the call rather than playing the wrong tape here.
  if(u.active&&(!active||run.selectedTape!==active)){u.active=null;run.labVideoExpanded=false;}
  const inCall=!!u.active&&!!active,incoming=incomingCall(run);
  const SX=152,SY=165,SW=720,SH=405;
  ctx.fillStyle='#020805';ctx.fillRect(SX,SY,SW,SH);
  if(!run.powered)text('通讯终端断电 · 恢复供电后接听',SX+28,SY+SH/2,24,AMBER,SW-56);
  else if(inCall){ctx.save();ctx.translate(SX,SY);ctx.beginPath();ctx.rect(0,0,SW,SH);ctx.clip();ui.playback(ctx,SW,SH);ctx.restore();}
  else if(incoming){
    const {caller,title}=callParts(incoming),cx=SX+SW/2,cy=SY+128;
    ctx.save();
    for(let k=0;k<3;k++){const r=((time*.8+k/3)%1);ctx.globalAlpha=1-r;ctx.strokeStyle=AMBER;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,24+r*86,0,Math.PI*2);ctx.stroke();}
    ctx.globalAlpha=1;ctx.fillStyle=AMBER;ctx.beginPath();ctx.arc(cx,cy,20,0,Math.PI*2);ctx.fill();
    ctx.restore();
    ctx.textAlign='center';
    text('来电 · '+caller,cx,SY+252,30,AMBER,SW-40);text(title+' · 视频通讯等待接听',cx,SY+295,22,GREEN,SW-40);
    ctx.textAlign='left';
  }
  else{
    const retry=!!run.authoredSite?.mediaRetryable;
    ctx.textAlign='center';text('频道守听 · 等待视频通讯',SX+SW/2,SY+96,26,DIM,SW-40);ctx.textAlign='left';
    ctx.font=cjk(20,500);
    layoutCJK(ctx,run.videoStatus||'尚未收到视频通讯',SW-56).slice(0,retry?5:6).forEach((line,i)=>text(line,SX+28,SY+145+i*26,20,AMBER,SW-56));
    if(retry)button('lab.comm.retry','↻ 重新接收视频通讯',SX+(SW-320)/2,SY+SH-72,320,48,false,!run.powered);
  }
  ctx.strokeStyle=inCall?GREEN:'#3d602b';ctx.lineWidth=1;ctx.strokeRect(SX+.5,SY+.5,SW-1,SH-1);
  if(inCall&&run.powered)ui.videoHit(SX,SY,SW,SH);
  if(inCall)button('lab.comm.hangup','挂断',152,584,224,44);
  else button('lab.comm.answer',incoming?'接收视频通讯':'暂无来电',152,584,224,44,!!incoming,!incoming||!run.powered);
  button('lab.comm.talk','◉ 通话 · 麦克风（M）',392,584,480,44,u.editing);

  ctx.fillStyle='#0d160b';ctx.fillRect(28,641,968,60);
  ctx.strokeStyle='#3d602b';ctx.strokeRect(28.5,641.5,967,60);
  const target=run.authoredSite?.micTarget;
  text(u.editing?'罗温 · 输入中（Enter 发送 / Esc 取消）':`罗温 · 麦克风${target?' · 可通话：'+target:''}`,44,655,15,DIM);
  ctx.font=cjk(21,500);
  const speech=u.editing?(u.draft||'请输入你想说的话…'):(u.spoken||'点击“通话”或按 M，随时讲话');
  layoutCJK(ctx,speech,930).slice(-1).forEach(line=>text(line,44,682,21,u.editing||u.spoken?BRIGHT:DIM,930));
}
