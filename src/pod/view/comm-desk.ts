import type { PodRun, TapeRecord } from '../sim/run';
import { isHarborOpening, openHarborCall } from '../sim/harbor-opening';
import { hasRemotePlaylist, pauseLabPlayback } from './footage';
import { layoutCJK } from '@/ui/typography';
import { drawIncomingSignal } from './comm-incoming';

import { pendingCallName, callMediaReady, isVideoCall } from '../sim/tape-channel';
export { isVideoCall } from '../sim/tape-channel';

/** Transient comm-tab state; the call archive itself lives in run.tapes. */
interface CommUi { active:string|null; draft:string; spoken:string; editing:boolean; connecting?:boolean; waitingSince?:number; archivePage?:number; archiveOpen?:boolean; ignored?:string[]; pendingAfter?:string[]; viewActive?:boolean }
const uis=new WeakMap<PodRun,CommUi>();
export function commUi(run:PodRun):CommUi {
  let u=uis.get(run);if(!u){u={active:null,draft:'',spoken:'',editing:false};uis.set(run,u);}return u;
}

/** A live call invitation is transient; it is never a playable or evidentiary tape. */
const generatingCalls=new WeakMap<PodRun,TapeRecord>();
export function announceGeneratingCall(run:PodRun,id:string,caller:string){
 if(run.tapes.some(t=>t.id===id)||generatingCalls.get(run)?.id===id)return;
 const u=commUi(run);
 u.waitingSince=performance.now();
 generatingCalls.set(run,{id,siteName:pendingCallName(caller),legId:run.leg.id,purpose:'identify',atBreath:run.breaths,
  fauna:[],caughtThreat:null,creatureMissing:false,analyzed:false,report:[],ready:false,callSeen:false});
 // Replies within an answered call keep the existing connection.
 if(u.active&&u.connecting)generatingCalls.get(run)!.callSeen=true;
}
export function cancelGeneratingCall(run:PodRun){
 const pending=generatingCalls.get(run);
 if(pending&&commUi(run).active===pending.id)hangUp(run);
 generatingCalls.delete(run);
}

/** Leaving the physical analysis view revokes seamless continuation. */
export function syncCommView(run:PodRun,visible:boolean){
 const u=commUi(run);if(u.viewActive&&!visible)hangUp(run);u.viewActive=visible;
}

/** Resume only the reply to an open transmission, before the desk chooses its layout. */
export function syncCommContinuation(run:PodRun){
 const u=commUi(run);
 const pending=generatingCalls.get(run);
 if(pending){
  const index=run.tapes.findIndex(t=>t.id===pending.id&&callMediaReady(t,hasRemotePlaylist));
  if(index>=0){
   if(u.active===pending.id&&u.connecting&&run.at==='lab'&&run.powered)answerCall(run,index);
   if(u.active!==pending.id||!u.connecting)generatingCalls.delete(run);
  }
 }
 if(!u.active||!u.connecting||run.at!=='lab'||!run.powered)return;
 const old=run.tapes.find(t=>t.id===u.active);if(!old)return;
 const channel=(t:TapeRecord)=>t.id.startsWith('harbor.task.')?'harbor':t.id.startsWith('living.task.')?'living':callParts(t).caller;
 const next=run.tapes.findIndex(t=>isVideoCall(t)&&!t.callSeen&&!t.analyzed&&!u.pendingAfter?.includes(t.id)&&channel(t)===channel(old)&&callMediaReady(t,hasRemotePlaylist));
 if(next>=0)answerCall(run,next);
 else run.tapeCursor=run.tapes.indexOf(old);
}

/** Oldest call still waiting to be answered. The opening call stays pending until fully watched, also after a reload. */
export function incomingCall(run:PodRun):TapeRecord|null {
  const active=run.at==='lab'?commUi(run).active:null;
  const pending=generatingCalls.get(run);
  if(pending&&!pending.callSeen&&pending.id!==active&&!commUi(run).ignored?.includes(pending.id)&&!run.tapes.some(t=>t.id===pending.id))return pending;
  return run.tapes.find(t=>{
    if(!isVideoCall(t)||!callMediaReady(t,hasRemotePlaylist)||t.id===active||commUi(run).ignored?.includes(t.id))return false;
    const status=run.authoredSite?.evidenceStatus?.(t.siteEvidence);
    return t.callSeen!==true&&!t.analyzed&&!status?.stale||isHarborOpening(t)&&!status?.stale&&(!t.analyzed||status?.accepted===false);
  })??null;
}
export function callParts(t:TapeRecord){
  const [caller,...rest]=t.siteName.split(' · ');
  return rest.length?{caller:caller!,title:rest.join(' · ')}:{caller:'未知来源',title:t.siteName};
}
/** Identity is learned by answering, never by merely receiving or ignoring a call. */
export function callSignalSource(run:PodRun,t:TapeRecord):string {
  const caller=callParts(t).caller;
  const elias=t.id.startsWith('harbor.task.')||t.id.startsWith('living.task.')||/艾[里利]亚斯/.test(caller);
  if(!elias)return caller==='未知来源'?'未知':caller;
  return run.tapes.some(other=>other!==t&&isVideoCall(other)&&other.callSeen&&(other.id.startsWith('harbor.task.')||other.id.startsWith('living.task.')||/艾[里利]亚斯/.test(callParts(other).caller)))?'艾利亚斯':'未知';
}
export function answerCall(run:PodRun,index:number):boolean {
  const pending=generatingCalls.get(run),t=index===-1?pending:run.tapes[index];
  if(!t||!isVideoCall(t)||(t!==pending&&!callMediaReady(t,hasRemotePlaylist))||run.at!=='lab'||!run.powered)return false;
  if(index>=0)run.tapeCursor=index;t.callSeen=true;if(isHarborOpening(t))openHarborCall(t);
  commUi(run).archiveOpen=false;commUi(run).ignored=commUi(run).ignored?.filter(id=>id!==t.id);
  run.labPlaybackPauseRequested=false;commUi(run).active=t.id;commUi(run).connecting=t===pending;run.labVideoExpanded=false;if(t===pending)run.videoStatus='信号连接中';return true;
}
/** A new transmission replaces the old playback; recordings remain in the archive. */
export function beginCommTransmission(run:PodRun){
  pauseLabPlayback(run);
  const u=commUi(run);if(run.at!=='lab')u.active=null;u.connecting=true;u.waitingSince=performance.now();u.pendingAfter=run.tapes.map(t=>t.id);
  run.labVideoExpanded=false;
  run.videoStatus='信号接收中';
}
export function hangUp(run:PodRun):boolean {
  const u=commUi(run);u.connecting=false;u.pendingAfter=undefined;if(!u.active)return false;
  if(run.selectedTape?.id===u.active)pauseLabPlayback(run);
  u.active=null;run.labVideoExpanded=false;return true;
}
/** Silence this ring without marking a story recording watched or accepted. */
export function dismissCall(run:PodRun):boolean {
 const call=incomingCall(run);if(!call)return hangUp(run);
 const u=commUi(run);u.ignored??=[];u.ignored.push(call.id);return true;
}
export const COMM_INK={text:'#b7e5a5',bright:'#d1ffc0',dim:'#73966e',line:'#496d48',black:'#071306'};
export const commFont=(size:number)=>`${size}px "Microsoft YaHei","Noto Sans CJK SC",sans-serif`;

type Text=(value:string,px:number,py:number,size?:number,colour?:string,max?:number)=>void;
type Button=(id:string,label:string,px:number,py:number,width:number,height?:number,active?:boolean,disabled?:boolean)=>void;

/** Lab tab 04: answer NPC video calls, watch them on the central CRT, and talk over the microphone. */
export function drawCommTab(ctx:CanvasRenderingContext2D,run:PodRun,time:number,ui:{text:Text;button:Button;playback:(ctx:CanvasRenderingContext2D,w:number,h:number)=>string;videoHit:(x:number,y:number,w:number,h:number)=>void;hit?:(id:string,x:number,y:number,w:number,h:number)=>void}){
  syncCommContinuation(run);
  const {text,button}=ui,u=commUi(run);
  const active=u.active?run.tapes.find(t=>t.id===u.active)??(generatingCalls.get(run)?.id===u.active?generatingCalls.get(run)!:null):null;
  // Selecting another reel elsewhere ends the call rather than playing the wrong tape here.
  if(u.active&&(!active||active!==generatingCalls.get(run)&&run.selectedTape!==active)){u.active=null;run.labVideoExpanded=false;}
  const inCall=!!u.active&&!!active,incoming=incomingCall(run);
  const SX=28,SY=174,SW=968,SH=416;
  const ink=COMM_INK;
  const archive=run.tapes.map((t,index)=>({t,index})).filter(({t})=>isVideoCall(t)&&callMediaReady(t,hasRemotePlaylist)&&(t.callSeen||u.ignored?.includes(t.id)));
  const pages=Math.max(1,Math.ceil(archive.length/6));u.archivePage=Math.min(u.archivePage??0,pages-1);
  // A single status rail, with the archive at its right edge, as on the reference terminal.
  const caller=incoming?callSignalSource(run,incoming):active?callSignalSource(run,active):run.authoredSite?.micTarget;
  const ring=!!incoming&&run.powered;
  ctx.fillStyle=ring?ink.text:'#10230f';ctx.fillRect(28,132,788,42);
  const status=!run.powered?'通讯终端断电':ring?`((( ◉ 收到呼叫请求：${caller} — 正在振铃... )))`:u.connecting?'信号连接中':inCall?`◉ 通讯已接通：${caller}`:'频道守听 — 等待呼叫';
  text(status,38,153,25,ring?ink.black:ink.text,766);
  button('lab.comm.archiveToggle',`历史通讯记录 (${archive.length}) ${u.archiveOpen?'▴':'▾'}`,816,132,180,42,u.archiveOpen);
  ctx.fillStyle='#020a04';ctx.fillRect(SX,SY,SW,SH);
  if(!run.powered){text('恢复供电后接听',SX+340,SY+SH/2,27,ink.dim,400);}
  else if(inCall&&!u.connecting&&!incoming&&active!==generatingCalls.get(run)){ctx.save();ctx.translate(SX,SY);ctx.beginPath();ctx.rect(0,0,SW,SH);ctx.clip();ui.playback(ctx,SW,SH);ctx.restore();}
  else if(incoming){
    drawIncomingSignal(ctx,SX,SY,SW,SH-48,time);
    ctx.textAlign='center';text(`来电信号源：${caller}`,SX+SW/2,SY+SH-23,23,ink.text,SW-60);ctx.textAlign='left';
  }
  else if(!u.connecting){
    ctx.textAlign='center';text(u.connecting?'正在等待对方回传':'频道守听',512,SY+SH*.43,28,ink.dim,SW-60);
    ctx.font=commFont(20);layoutCJK(ctx,run.videoStatus||'尚未收到新的呼叫',SW-100).slice(0,3).forEach((line,i)=>text(line,512,SY+SH*.55+i*29,20,ink.dim,SW-100));ctx.textAlign='left';
  }
  ctx.strokeStyle=ink.text;ctx.lineWidth=1.5;ctx.strokeRect(SX,SY,SW,SH);
  if(u.connecting&&run.powered&&!incoming){
    // Keep the original signal portrait; add only a compact receiving bar below it.
    ctx.save();ctx.beginPath();ctx.rect(SX,SY,SW,SH);ctx.clip();
    drawIncomingSignal(ctx,SX,SY,SW,SH-48,time);
    const failed=!!run.authoredSite?.mediaRetryable;
    const match=/生成进度 (\d+)%/.exec(run.videoStatus||'');
    const progress=match&&Number(match[1])<=100?Number(match[1]):null;
    const left=352,width=320,barY=SY+SH-43;
    ctx.fillStyle='#020b04';ctx.fillRect(left-12,barY-6,width+24,46);
    ctx.strokeStyle=ink.dim;ctx.lineWidth=1;ctx.strokeRect(left,barY,width,8);
    ctx.fillStyle=ink.bright;
    if(!failed){
      if(progress!==null)ctx.fillRect(left+2,barY+2,(width-4)*progress/100,4);
      else {const sweep=(Math.sin(time*2)+1)/2;ctx.fillRect(left+2+sweep*(width-68),barY+2,64,4);}
    }
    ctx.textAlign='center';
    text(failed?'信号中断 · 请重新接收':'信号接收中'+'.'.repeat(1+Math.floor(time*2)%3)+(progress!==null?` ${progress}%`:''),512,barY+29,18,ink.text,width+40);
    ctx.restore();
  }
  if(inCall&&run.powered&&!u.connecting)ui.videoHit(SX,SY,SW,SH);
  if(inCall&&!u.connecting)button('lab.replay','↻ 重播',884,SH+SY-38,104,30);
  if(run.authoredSite?.mediaRetryable)button('lab.comm.retry','↻ 重新接收',798,SY+12,184,40,false,!run.powered);
  // One footer: native free input mirrored on the left; the two call controls on the right.
  button('lab.comm.edit','',28,608,476,88,u.editing,!run.powered||!!u.connecting);
  const speech=u.editing?(u.draft||'自由输入…'):(u.spoken||'点击此处或按 M 回复');
  ctx.font=commFont(23);
  const rows=layoutCJK(ctx,`罗温（麦克风 M）： “${speech}”`,442);
  rows.slice(-2).forEach((line,i)=>text(line+(u.editing&&i===Math.min(rows.length,2)-1&&Math.floor(time*2)%2===0?'▏':''),40,635+i*32,23,u.spoken||u.editing?ink.bright:ink.dim,442));
  const primary=ring?'lab.comm.answer':'lab.comm.talk';
  button(primary,'',526,620,240,72,true,!run.powered||!!u.connecting&&!ring);
  ctx.fillStyle=run.powered&&(!u.connecting||ring)?ink.text:'#264127';ctx.fillRect(528,622,236,68);
  text(ring?'[ ◀ 接听 / 回复 (M) ]':u.editing?'[ ◀ 发送 (Enter) ]':'[ ◀ 回复 (M) ]',538,656,25,ink.black,216);
  button(incoming?'lab.comm.dismiss':'lab.comm.hangup','[ × 忽略 / 挂断 ]',778,620,218,72,false,!run.powered||(!incoming&&!inCall&&!u.connecting));
  // The menu is drawn last: its hit regions cover the video instead of triggering fullscreen.
  if(u.archiveOpen){
    ui.hit?.('lab.comm.archiveClose',SX,SY,SW,SH);
    const rows=archive.slice().reverse().slice(u.archivePage*6,u.archivePage*6+6);
    ctx.fillStyle='#071307';ctx.fillRect(644,176,352,Math.max(60,rows.length*48+48));
    ctx.strokeStyle=ink.line;ctx.strokeRect(644,176,352,Math.max(60,rows.length*48+48));
    if(!rows.length)text('暂无历史通讯',662,204,22,ink.dim,310);
    rows.forEach(({t,index},i)=>button('lab.comm.open:'+index,`${u.ignored?.includes(t.id)?'未接 · ':''}${callParts(t).title}`,650,182+i*48,340,44,u.active===t.id));
    if(rows.length)button('lab.comm.archiveNext',`${u.archivePage+1} / ${pages}  下一页`,650,182+rows.length*48,340,38,false,pages===1);
  }
}
