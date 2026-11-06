import type { PodRun } from '../sim/run';
import { layoutCJK } from '@/ui/typography';
import { crtFont as cjk, TERMINAL_INK } from './crt-hud';
const history=new WeakMap<PodRun,{value:string;since:number}>();
export function drawTacticalObjective(ctx:CanvasRenderingContext2D,run:PodRun,w:number,h:number):void {
  const value=run.authoredSite?.objective?.trim()??'',now=performance.now();
  let state=history.get(run);
  if(!state){state={value:'',since:now};history.set(run,state);}
  if(state.value!==value){state.value=value;state.since=now;}
  if(!value)return;
  const living=run.authoredSite?.index===1;
  const fs=Math.max(17,Math.min(living?21:25,h*.028)),pad=16,cw=Math.min(living?440:500,w*.36),x=w-cw-20,y=26;
  ctx.save();ctx.font=cjk(fs,500);ctx.textAlign='left';ctx.textBaseline='top';
  const lines=value.split('\n').flatMap(line=>layoutCJK(ctx,line,cw-pad*2));
  const status=living?[`艇壳 ${Math.round(run.hull*100)}% · 电量 ${Math.round(run.power*100)}%`,...(run.sonarEmitting?['主动脉冲 · 持续发声']:[]),...(run.hull<.85?['修补：停车，Esc 回舱内 → 1 生命维持']:[])]:[];
  const lh=fs*1.5,height=pad*2+fs*1.7+lines.length*lh+status.length*lh+(status.length?10:0);
  ctx.shadowColor='#000';ctx.shadowBlur=18;ctx.fillStyle='#061412db';ctx.fillRect(x,y,cw,height);ctx.shadowBlur=0;
  ctx.strokeStyle='#649c8170';ctx.strokeRect(x+.5,y+.5,cw-1,height-1);
  ctx.strokeStyle=TERMINAL_INK.text;ctx.lineWidth=2;
  for(const [px,py,sx,sy] of [[x,y,1,1],[x+cw,y,-1,1],[x,y+height,1,-1],[x+cw,y+height,-1,-1]]){ctx.beginPath();ctx.moveTo(px,py+sy*12);ctx.lineTo(px,py);ctx.lineTo(px+sx*17,py);ctx.stroke();}
  ctx.fillStyle=TERMINAL_INK.text;ctx.font=cjk(fs*.9,600);ctx.fillText('当前任务 / LIVE ORDERS',x+pad,y+pad);
  let remaining=Math.floor((now-state.since)/12);
  ctx.font=cjk(fs,500);
  lines.forEach((line,i)=>{const shown=line.slice(0,Math.max(0,remaining));remaining-=line.length;ctx.fillStyle=/坐标|深度|DEPTH|X\s*-?\d|Y\s*-?\d|Z\s*-?\d/.test(line)?TERMINAL_INK.bright:TERMINAL_INK.text;ctx.fillText(shown,x+pad,y+pad+fs*1.7+i*lh);});
  ctx.font=cjk(fs*.9,600);status.forEach((line,i)=>{ctx.fillStyle=run.hull<=.5?'#ffad82':TERMINAL_INK.text;ctx.fillText(line,x+pad,y+pad+fs*1.7+lines.length*lh+9+i*lh);});
  ctx.restore();
}
