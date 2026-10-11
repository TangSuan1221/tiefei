import type { PodRun } from '../sim/run';
import { SUPPLIES, type SupplyId } from '../content/supplies';
import { creature, ATTRACTOR_CN, DANGER_CN } from '../content/creatures';
import { cjk, mono, layoutCJK } from '@/ui/typography';
import { drawTacticalStatus, terminalFeedback, terminalPressed } from './tactical-diagnostics';
import type { HitMap, Control } from './chrome';

type Tab = 'status' | 'tapes' | 'cargo';
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
  const s = labDeskState(run);
  if (id === 'lab.breaker') {
    run.stopSonarPulses(); run.toggleBlackout(); return true;
  }
  if (id.startsWith('lab.tab:')) {
    const tab = id.slice(8);
    if (tab !== 'status' && tab !== 'tapes' && tab !== 'cargo') return false;
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
    if (!Number.isInteger(index) || !run.tapes[index]) return false;
    run.tapeCursor = index; s.reportPage = 0; return true;
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
  const s = labDeskState(run), tape = run.selectedTape, green = '#b7e5c4', dim = '#6f9d86', amber = '#f0bf78';
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 1024, h / 720);
  ctx.fillStyle = '#07130f'; ctx.fillRect(0, 0, 1024, 720);
  const time = performance.now() / 1000;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const text = (value: string, px: number, py: number, size = 23, colour = green, max = 940) => {
    ctx.font = cjk(size, 500); ctx.fillStyle = colour; ctx.fillText(value, px, py, max);
  };
  const line = (px: number, py: number, width: number) => {ctx.fillStyle = '#29483a';ctx.fillRect(px, py, width, 1);};
  const button = (id: string, label: string, px: number, py: number, width: number, height = 44, active = false, disabled = false) => {
    ctx.fillStyle = disabled ? '#0c1813' : active || hovered === id ? '#274f3c' : '#11271d'; ctx.fillRect(px, py, width, height);
    ctx.strokeStyle = hovered === id ? '#effff4' : active ? green : '#355c47'; ctx.strokeRect(px+.5, py+.5, width-1, height-1);
    if (active) { ctx.fillStyle='#80ffc0'; ctx.fillRect(px+12,py+height-4,width-24,3); }
    if (terminalPressed(run,id)) { ctx.fillStyle='#060d0bcc'; ctx.fillRect(px+2,py+2,width-4,height-4); }
    text(label, px+12, py+height/2, 22, disabled ? '#486352' : green, width-24);
    if (!disabled) hits?.add({id,x:x+px*w/1024,y:y+py*h/720,w:width*w/1024,h:height*h/720});
  };
  ctx.save(); ctx.globalAlpha=.96+.04*Math.sin(time*3); ctx.font=mono(26,600);ctx.fillStyle=green;ctx.fillText('PELAGIC / 舰载分析终端',28,30);ctx.restore();
  ctx.save();ctx.shadowColor=run.powered?'#80ffc0':amber;ctx.shadowBlur=run.powered?8+5*Math.sin(time*2):0;
  ctx.fillStyle=run.powered?'#80ffc0':amber;ctx.beginPath();ctx.arc(694,30,5,0,Math.PI*2);ctx.fill();ctx.restore();
  text(run.powered ? 'ONLINE' : 'OFFLINE',712,30,21,run.powered?green:amber);text('03 / SYS',889,30,16,dim);
  (['status','tapes','cargo'] as Tab[]).forEach((tab,i)=>button(`lab.tab:${tab}`,['01  艇况','02  录像','03  仓库'][i]!,28+i*267,61,253,48,s.tab===tab));
  // Developing reels are already archived, but should only notify once readable.
  if (run.tapes.some(item => item.ready !== false && !item.analyzed)) {
    ctx.save();
    ctx.fillStyle = '#ff4b4b'; ctx.shadowColor = '#ff4b4b'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(530, 75, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  button('back','返回总控',837,61,159,48);
  const alarm = labAlarm(run);
  if (!alarm) s.acknowledged = '';
  text(alarm ? `! ${alarm}` : '系统监测正常', 28, 133, 21, alarm ? amber : dim);
  text(`HULL ${Math.round(run.hull*100)}%    BAT ${Math.round(run.power*100)}%`, 640, 133, 21, dim);
  line(28,153,968);
  if (s.tab === 'status') {
    drawTacticalStatus(ctx,run,hovered,button);
  } else if (s.tab === 'cargo') {
    const items=cargo(run);
    const pages=Math.max(1,Math.ceil(items.length/8));s.cargoPage=Math.min(s.cargoPage,pages-1);
    text(`艇内库存 / ${items.length} 种物资`,40,188,26);
    text('物资名称',48,235,21,dim);text('数量',845,235,21,dim);line(40,256,940);
    items.slice(s.cargoPage*8,s.cargoPage*8+8).forEach((item,i)=>{const py=282+i*37;text(item.name,48,py,24);text(`× ${item.quantity}`,845,py,26);line(40,py+20,940);});
    if(!items.length)text('仓库为空 · 收妥物资后自动登记',48,319,26,dim);
    button('lab.cargoPrev','上一页',40,611,174);button('lab.cargoNext','下一页',231,611,174);
    text(`${s.cargoPage+1} / ${pages}`,444,633,23,dim);
    if(run.authoredSite?.recoveredDocument)button('lab.document','读取密码卡',690,611,288,44,false,!run.powered);
  } else {
    const expanded=run.labVideoExpanded&&!!tape;
    if(!expanded){
      text(`录像档案 / ${run.tapes.length} 卷`,28,181,24);
      const start=Math.floor(run.tapeCursor/6)*6;
      run.tapes.slice(start,start+6).forEach((item,i)=>{
        button(`lab.select:${start+i}`,`${String(start+i+1).padStart(2,'0')}  ${item.siteName}`,28,209+i*51,295,46,run.tapeCursor===start+i);
      });
      button('lab.prev','← 上一卷',28,523,140,44,false,run.tapes.length<2);button('lab.next','下一卷 →',181,523,142,44,false,run.tapes.length<2);
      if(!tape)text('暂无录像 · 曝光并显影后入档',351,320,25,dim,620);
    }
    if(tape){
      const px=expanded?28:350,pw=expanded?968:646,ph=expanded?369:207;
      let playbackStatus=tape.ready===false?run.videoStatus:'';
      ctx.save();ctx.translate(px,171);ctx.beginPath();ctx.rect(0,0,pw,ph);ctx.clip();
      if(run.powered&&tape.ready!==false)playbackStatus=render.playback(ctx,pw,ph);
      else {ctx.fillStyle='#020805';ctx.fillRect(0,0,pw,ph);text(run.powered?'显影中 · 请稍候':'供电中断 · 恢复后播放',20,ph/2,24,amber,pw-40);}
      ctx.restore();
      if(expanded&&playbackStatus)text(playbackStatus,28,560,19,amber,968);
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
    const controls=render.controls.filter(c=>!['lab.prev','lab.next','station:camera'].includes(c.id));
    const width=(968-(controls.length-1)*8)/Math.max(1,controls.length);
    controls.forEach((c,i)=>button(c.id,c.label,28+i*(width+8),591,width,49,c.state==='active',c.state==='disabled'));
  }
  if(s.tab!=='tapes'&&render.document){
    ctx.fillStyle='#11271d';ctx.fillRect(28,170,968,410);ctx.font=cjk(25,500);
    render.document.flatMap(v=>layoutCJK(ctx,v,900)).slice(0,11).forEach((v,i)=>text(v,48,205+i*32,25));
  }
  if(alarm&&s.acknowledged!==alarm){
    hits?.clear();
    ctx.fillStyle='#241c10';ctx.fillRect(214,244,596,220);ctx.strokeStyle=amber;ctx.lineWidth=2;ctx.strokeRect(214,244,596,220);
    text('! 应急告警 / ATTENTION',240,278,28,amber,542);text(alarm,240,324,27,amber,542);
    text('检查供电与艇壳，前往维护工位处理。',240,365,22,green,542);
    button('lab.ack','确认告警',240,400,542,44);
  }
  ctx.fillStyle='rgba(0,0,0,.09)';for(let py=0;py<720;py+=4)ctx.fillRect(0,py,1024,1);
  const sweep=(time%6)/6*850-100, beam=ctx.createLinearGradient(0,sweep-55,0,sweep);
  beam.addColorStop(0,'#80ffc000');beam.addColorStop(1,'#80ffc00b');ctx.fillStyle=beam;ctx.fillRect(0,sweep-55,1024,55);
  const edge=ctx.createRadialGradient(512,360,280,512,360,625);edge.addColorStop(0,'#00000000');edge.addColorStop(1,'#00000085');ctx.fillStyle=edge;ctx.fillRect(0,0,1024,720);
  for(const offset of [-2,2]){ctx.strokeStyle=offset<0?'#ff777712':'#65ffff18';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(8+offset,8,1008,704,25);ctx.stroke();}
  ctx.restore();
}
