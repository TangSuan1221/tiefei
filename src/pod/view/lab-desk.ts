import { replayLabRecording, expandLabRecording } from './footage';
import type { PodRun } from '../sim/run';
import {isLocalNoVideoMode} from '../net/no-video-mode';
import { SUPPLIES, type SupplyId } from '../content/supplies';
import { creature, ATTRACTOR_CN, DANGER_CN } from '../content/creatures';
import { layoutCJK } from '@/ui/typography';
import { crtFont as cjk, crtFont as mono, TERMINAL_INK } from './crt-hud';
import { drawTacticalStatus, terminalFeedback, terminalPressed } from './tactical-diagnostics';
import { answerCall, isVideoCall, commUi, drawCommTab, hangUp, incomingCall } from './comm-desk';
import type { HitMap, Control } from './chrome';

type Tab = 'status' | 'tapes' | 'cargo' | 'comm';
const TABS: readonly Tab[] = ['status', 'tapes', 'cargo', 'comm'];
interface DeskState { tab: Tab; cargoPage: number; reportPage: number; acknowledged: string }
const states = new WeakMap<PodRun, DeskState>();
export function labDeskState(run: PodRun): DeskState {
  let state = states.get(run);
  if (!state) { state = { tab: 'tapes', cargoPage: 0, reportPage: 0, acknowledged: '' }; states.set(run, state); }
  return state;
}
function cargo(run:PodRun){return [...(Object.keys(SUPPLIES) as SupplyId[]).filter(id=>run.count(id)>0).map(id=>({name:SUPPLIES[id].name,quantity:run.count(id)})),...(run.authoredSite?.cargoManifest??[])];}
export function labAlarm(run: PodRun): string {
  return [run.hull <= .3 ? '船体重损' : run.hull <= .5 ? '船体受损' : '',
    run.power <= .1 ? '电量危急' : run.power <= .2 ? '低电量' : '', run.blackout ? '总闸断开' : ''].filter(Boolean).join(' / ');
}
export function labDeskAction(run: PodRun, id: string): boolean {
  if(id.startsWith('lab.harbor.'))return run.authoredSite?.harborAction?.(id.slice(11))??false;
  if(id==='lab.restore'){run.labVideoExpanded=false;return true;}
  if(id==='lab.replay'){replayLabRecording(run);return true;}
  if(id==='lab.fullscreen'){expandLabRecording(run);return true;}
  const s = labDeskState(run);
  if(id==='lab.useBattery'){
    if(run.at!=='lab'||s.tab!=='cargo'||run.outcome.kind!=='alive'||run.power>=.99)return false;
    return run.useSupply('sup.cell');
  }
  if(id==='lab.answerCall'||id==='lab.comm.answer'){
    const call=incomingCall(run);
    if(!call||!answerCall(run,run.tapes.indexOf(call)))return false;
    s.tab='comm';return true;
  }
  if(id.startsWith('lab.comm.open:')){
    hangUp(run);
    if(!answerCall(run,Number(id.slice(14))))return false;
    s.tab='comm';return true;
  }
  if(id==='lab.comm.hangup')return hangUp(run);
  if(id==='lab.diagnosticPhoto'){
    if(run.at!=='lab'||!run.powered||!isLocalNoVideoMode()||![0,1].includes(run.authoredSite?.index??-1))return false;
    run.authoredSite?.radioSay?.('诊断分析底片');return true;
  }
  if(id==='lab.comm.retry'||id==='lab.retryTask'){
    if(!run.powered||!run.authoredSite?.mediaRetryable||!run.authoredSite.retryMedia)return false;
    run.videoStatus=run.authoredSite.retryMedia();s.tab='comm';return true;
  }
  if (id === 'lab.breaker') {
    run.stopSonarPulses(); run.toggleBlackout(); return true;
  }
  if (id.startsWith('lab.tab:')) {
    const tab = id.slice(8) as Tab;
    if (!TABS.includes(tab)) return false;
    if (tab !== 'comm') hangUp(run);
    if(tab==='tapes'&&isVideoCall(run.selectedTape))run.cycleTape(1);
    s.tab = tab; run.labVideoExpanded = false; return true;
  }
  if (id === 'lab.ack') { s.acknowledged = labAlarm(run); return true; }
  if (id === 'lab.cargoPrev' || id === 'lab.cargoNext') {
    const pages = Math.max(1, Math.ceil(cargo(run).length / 8));
    s.cargoPage = (s.cargoPage + (id.endsWith('Next') ? 1 : pages - 1)) % pages; return true;
  }
  if (id === 'lab.reportPrev' || id === 'lab.reportNext') { s.reportPage = Math.max(0, s.reportPage + (id.endsWith('Next') ? 1 : -1)); return true; }
  if (id.startsWith('lab.select:')) {
    const index = Number(id.slice(11));
    if (!Number.isInteger(index) || !run.tapes[index] || isVideoCall(run.tapes[index])) return false;
    run.tapeCursor = index; s.reportPage = 0;
    if (run.tapes[index]!.callSeen === false) run.tapes[index]!.callSeen = true;
    return true;
  }
  if (id.startsWith('lab.send:')) {
    const recipient = id.slice(9), tape = run.selectedTape;
    if (!run.powered || !tape || tape.ready === false || !((tape.sensorFrames?.length ?? 0) >= 3 || tape.videoResult === 'video')) return false;
    if (recipient !== 'vance' && recipient !== 'elias') return false;
    tape.sentTo ??= [];
    if (!tape.sentTo.includes(recipient)) {
      tape.sentTo.push(recipient);
      run.pushLog(`录像 ${tape.siteName} 已发送给${recipient === 'vance' ? '万斯' : '艾里亚斯'}。等待对方回执。`, 'system');
    }
    if(run.authoredSite?.receiveTape?.(recipient,tape.id))run.pushLog('对方已收到并查看本卷录像。','system');
    return true;
  }
  return false;
}

interface DeskRender {
  playback: (ctx: CanvasRenderingContext2D, w: number, h: number) => string;
  controls: Control[];
  document?: string[];
}
/** Shared physical CRT surface. Hit regions use the same normalized coordinates as drawing. */
export function drawLabDesk(ctx: CanvasRenderingContext2D, run: PodRun, x: number, y: number, w: number, h: number,
  hits: HitMap | undefined, hovered: string | null, render: DeskRender): void {
  const s = labDeskState(run), tape = s.tab==='tapes'&&isVideoCall(run.selectedTape)?null:run.selectedTape, green = TERMINAL_INK.text, dim = TERMINAL_INK.dim, amber = '#f0bf78';
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 1024, h / 720);
  ctx.fillStyle = '#030903'; ctx.fillRect(0, 0, 1024, 720);
  const time = performance.now() / 1000;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const text = (value: string, px: number, py: number, size = 23, colour: string = green, max = 940) => {
    ctx.font = cjk(size, 400); ctx.fillStyle = colour; ctx.save(); ctx.shadowColor='#79b950'; ctx.shadowBlur=2; ctx.fillText(value, px, py, max); ctx.restore();
  };
  const line = (px: number, py: number, width: number) => {ctx.fillStyle = '#2b4320';ctx.fillRect(px, py, width, 1);};
  const button = (id: string, label: string, px: number, py: number, width: number, height = 44, active = false, disabled = false) => {
    ctx.fillStyle = disabled ? '#0c1813' : active || hovered === id ? '#203916' : '#081305'; ctx.fillRect(px, py, width, height);
    ctx.strokeStyle = hovered === id ? TERMINAL_INK.bright : active ? green : '#3d602b'; ctx.strokeRect(px+.5, py+.5, width-1, height-1);
    if (active) { ctx.fillStyle='#abef76'; ctx.fillRect(px+3,py+8,3,height-16); }
    if (terminalPressed(run,id)) { ctx.fillStyle='#060d0bcc'; ctx.fillRect(px+2,py+2,width-4,height-4); }
    text(label, px+12, py+height/2, 22, disabled ? '#486352' : green, width-24);
    if (!disabled) hits?.add({id,x:x+px*w/1024,y:y+py*h/720,w:width*w/1024,h:height*h/720});
  };
  // The movie uses the same CRT texture and hit map as the terminal, including its perspective.
  const playable=tape?.ready&&(s.tab==='tapes'||s.tab==='comm'&&commUi(run).active===tape.id);
  if(playable&&run.labVideoExpanded&&run.powered){
    ctx.save();ctx.beginPath();ctx.rect(0,0,1024,720);ctx.clip();render.playback(ctx,1024,720);ctx.restore();
    button('lab.restore','X',24,24,52,48);
    drawLabGlass(ctx,time);
    ctx.restore();return;
  }
  if(playable)button('lab.replay','重新播放',846,112,150,36);
  const videoHit=(px:number,py:number,pw:number,ph:number)=>hits?.add({id:'lab.fullscreen',x:x+px*w/1024,y:y+py*h/720,w:pw*w/1024,h:ph*h/720});
  ctx.save(); ctx.globalAlpha=.96+.04*Math.sin(time*3); ctx.font=mono(26,600);ctx.fillStyle=green;ctx.fillText('PELAGIC / 舰载分析终端',28,30);ctx.restore();
  ctx.save();ctx.shadowColor=run.powered?'#abef76':amber;ctx.shadowBlur=run.powered?8+5*Math.sin(time*2):0;
  ctx.fillStyle=run.powered?'#abef76':amber;ctx.beginPath();ctx.arc(694,30,5,0,Math.PI*2);ctx.fill();ctx.restore();
  text(run.powered ? 'ONLINE' : 'OFFLINE',712,30,21,run.powered?green:amber);text('03 / SYS',889,30,16,dim);
  TABS.forEach((tab,i)=>button(`lab.tab:${tab}`,['01  艇况','02  录像','03  仓库','04  通讯'][i]!,28+i*201,61,193,48,s.tab===tab));
  // Developing reels are already archived, but should only notify once readable.
  if (run.tapes.some(item => !isVideoCall(item) && item.ready !== false && !item.analyzed)) {
    ctx.save();
    ctx.fillStyle = '#ff4b4b'; ctx.shadowColor = '#ff4b4b'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(406, 75, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (incomingCall(run)) {
    ctx.save();
    ctx.globalAlpha = .55 + .45 * Math.sin(time * 6); ctx.fillStyle = amber; ctx.shadowColor = amber; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(808, 75, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  button('back',run.authoredSite?.index===1?'Esc 返回驾驶台':'返回总控',837,61,159,48);
  const alarm = labAlarm(run);
  if (!alarm) s.acknowledged = '';
  text(alarm ? `! ${alarm}` : '系统监测正常', 28, 133, 21, alarm ? amber : dim);
  if(s.tab!=='comm'&&s.tab!=='tapes')text(`HULL ${Math.round(run.hull*100)}%    BAT ${Math.round(run.power*100)}%`, 640, 133, 21, dim);
  line(28,153,968);
  if (s.tab === 'status') {
    drawTacticalStatus(ctx,run,hovered,button);
  } else if (s.tab === 'comm') {
    drawCommTab(ctx,run,time,{text,button,playback:render.playback,videoHit});
  } else if (s.tab === 'cargo') {
    const items=cargo(run);
    const pages=Math.max(1,Math.ceil(items.length/8));s.cargoPage=Math.min(s.cargoPage,pages-1);
    text(`艇内库存 / ${items.length} 种物资`,40,188,26);
    text('物资名称',48,235,21,dim);text('数量',845,235,21,dim);line(40,256,940);
    items.slice(s.cargoPage*8,s.cargoPage*8+8).forEach((item,i)=>{const py=282+i*37;text(item.name,48,py,24);text(`× ${item.quantity}`,845,py,26);line(40,py+20,940);});
    if(!items.length)text('仓库为空 · 收妥物资后自动登记',48,319,26,dim);
    button('lab.cargoPrev','上一页',40,611,174);button('lab.cargoNext','下一页',231,611,174);
    text(`${s.cargoPage+1} / ${pages}`,444,633,23,dim);
    button('lab.useBattery',`使用备用电池 · +42%（余${run.count('sup.cell')}）`,530,657,448,44,false,run.count('sup.cell')<=0||run.power>=.99);
    if(run.authoredSite?.recoveredDocument)button('lab.document','读取密码卡',690,611,288,44,false,!run.powered);
  } else {
    const expanded=run.labVideoExpanded&&!!tape;
    if(!expanded){
      const reels=run.tapes.map((item,index)=>({item,index})).filter(({item})=>!isVideoCall(item));
      text(`录像档案 / ${reels.length} 卷`,28,181,24);
      const start=Math.floor(Math.max(0,reels.findIndex(({index})=>index===run.tapeCursor))/6)*6;
      reels.slice(start,start+6).forEach(({item,index},i)=>{
        button(`lab.select:${index}`,`${String(start+i+1).padStart(2,'0')}  ${item.siteName}`,28,209+i*51,295,46,run.tapeCursor===index);
      });
      button('lab.prev','← 上一卷',28,523,140,44,false,reels.length<2);button('lab.next','下一卷 →',181,523,142,44,false,reels.length<2);
      if(!tape){
        text('暂无录像 · 曝光并显影后入档',351,320,25,dim,620);
      }
    }
    if(tape){
      const px=expanded?28:350,pw=expanded?968:646,ph=expanded?369:207;
      let playbackStatus=tape.ready===false?run.videoStatus:'';
      ctx.save();ctx.translate(px,171);ctx.beginPath();ctx.rect(0,0,pw,ph);ctx.clip();
      if(run.powered&&tape.ready!==false)playbackStatus=render.playback(ctx,pw,ph);
      else {ctx.fillStyle='#020805';ctx.fillRect(0,0,pw,ph);text(run.powered?'显影中 · 请稍候':'供电中断 · 恢复后播放',20,ph/2,24,amber,pw-40);}
      ctx.restore();
      if(run.powered&&tape.ready!==false)videoHit(px,171,pw,ph);
      if(expanded&&run.authoredSite?.index===1){
        const accepted=run.authoredSite.evidenceStatus?.(tape.siteEvidence)?.accepted;
        text(`第 ${run.tapeCursor+1} 卷 · ${tape.siteName} · ${accepted?'证据已登记':tape.analyzed?'未通过 · 请查看报告':'待核验'} · Esc 返回驾驶台`,28,560,19,accepted?green:amber,968);
      }else if(expanded&&playbackStatus)text(playbackStatus,28,560,19,amber,968);
      if(!expanded){
        const verdict=tape.legId===run.leg.id?run.authoredSite?.evidenceStatus?.(tape.siteEvidence):undefined;
        const status=tape.ready===false?'显影中':!tape.analyzed?'○ 待分析':verdict?(verdict.accepted?'● 证据通过':'! 未通过 · 需重拍'):'● 已分析';
        text(`${status}  /  ${tape.siteName}`,350,399,23,tape.analyzed&&verdict&&!verdict.accepted?amber:green,640);
        const profile=tape.analyzed?[...new Set([...tape.fauna,...(tape.caughtThreat?[tape.caughtThreat]:[])])].map(id=>{const c=creature(id);return `${c.name} / ${DANGER_CN[c.danger]} / ${ATTRACTOR_CN[c.attractor]}`;}):[];
        ctx.font=cjk(22,500);
        const report=(render.document??[...(playbackStatus?[playbackStatus]:[]),...(tape.videoError?[tape.videoError]:[]),...(tape.analyzed?[...profile,...tape.report]:['分析录像以读取证据与生物特性。'])]).flatMap(v=>layoutCJK(ctx,v,630));
        const pages=Math.max(1,Math.ceil(report.length/4));s.reportPage=Math.min(s.reportPage,pages-1);
        report.slice(s.reportPage*4,s.reportPage*4+4).forEach((v,i)=>text(v,350,432+i*27,22,green,638));
        button('lab.reportPrev','←',350,544,60,32);button('lab.reportNext','→',421,544,60,32);text(`报告 ${s.reportPage+1}/${pages}`,502,560,20,dim);
      }
      const canSend=run.powered&&tape.ready!==false&&((tape.sensorFrames?.length??0)>=3||tape.videoResult==='video');
      button('lab.send:vance',tape.sentTo?.includes('vance')?'万斯 · 已发送':'发送给万斯',28,657,295,39,false,!canSend);
      button('lab.send:elias',tape.sentTo?.includes('elias')?'艾里亚斯 · 已发送':'发送给艾里亚斯',350,657,295,39,false,!canSend);
      text('发送后等待回执',669,677,20,dim,310);
    }
    const controls=render.controls.filter(c=>!!tape&&!['lab.prev','lab.next','station:camera'].includes(c.id));
    const width=(968-(controls.length-1)*8)/Math.max(1,controls.length);
    controls.forEach((c,i)=>button(c.id,c.label,28+i*(width+8),591,width,49,c.state==='active',c.state==='disabled'));
  }
  if(s.tab!=='tapes'&&s.tab!=='comm'&&render.document){
    ctx.fillStyle='#081305';ctx.fillRect(28,170,968,410);ctx.font=cjk(25,500);
    render.document.flatMap(v=>layoutCJK(ctx,v,900)).slice(0,11).forEach((v,i)=>text(v,48,205+i*32,25));
  }
  if(alarm&&s.acknowledged!==alarm){
    hits?.clear();
    ctx.fillStyle='#241c10';ctx.fillRect(214,244,596,220);ctx.strokeStyle=amber;ctx.lineWidth=2;ctx.strokeRect(214,244,596,220);
    text('! 应急告警 / ATTENTION',240,278,28,amber,542);text(alarm,240,324,27,amber,542);
    text(run.authoredSite?.index===1?'停车后 Esc 回舱内，按 1 到生命维持台修补。':'检查供电与艇壳，前往维护工位处理。',240,365,22,green,542);
    button('lab.ack','确认告警',240,400,542,44);
  }
  drawLabGlass(ctx,time);
  ctx.restore();
}

/** Phosphor raster and smoked, curved glass, shared by the terminal and full-screen video. */
function drawLabGlass(ctx:CanvasRenderingContext2D,time:number){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.22)';
  for(let py=0;py<720;py+=3)ctx.fillRect(0,py,1024,1);
  ctx.fillStyle='#e7bb6010';
  for(let px=0;px<1024;px+=3)ctx.fillRect(px,0,1,720);
  const sweep=(time%9)/9*880-80,beam=ctx.createLinearGradient(0,sweep-80,0,sweep);
  beam.addColorStop(0,'#c9df7900');beam.addColorStop(.8,'#c9df7909');beam.addColorStop(1,'#c9df7900');
  ctx.fillStyle=beam;ctx.fillRect(0,sweep-80,1024,80);
  const edge=ctx.createRadialGradient(512,360,230,512,360,650);
  edge.addColorStop(0,'#00000000');edge.addColorStop(.75,'#00000018');edge.addColorStop(1,'#000000b0');
  ctx.fillStyle=edge;ctx.fillRect(0,0,1024,720);
  ctx.strokeStyle='#b4bd4638';ctx.lineWidth=2;ctx.strokeRect(8,8,1008,704);
  ctx.strokeStyle='#f1ce7620';ctx.strokeRect(12,12,1000,696);
  ctx.restore();
}
