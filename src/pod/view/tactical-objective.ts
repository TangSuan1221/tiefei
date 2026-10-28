import type { PodRun } from '../sim/run';
import { cjk, mono, layoutCJK } from '@/ui/typography';
const history=new WeakMap<PodRun,{value:string;since:number;logs:string[]}>();
export function drawTacticalObjective(ctx:CanvasRenderingContext2D,run:PodRun,w:number,h:number):void {
  const value=run.authoredSite?.objective?.trim()??'',now=performance.now();
  let state=history.get(run);
  if(!state){state={value:'',since:now,logs:[]};history.set(run,state);}
  if(state.value!==value){state.value=value;state.since=now;if(value)state.logs.unshift(`T+${Math.floor(run.clock/60).toString().padStart(2,'0')}:${Math.floor(run.clock%60).toString().padStart(2,'0')}  任务已更新`);state.logs.length=Math.min(3,state.logs.length);}
  if(!value)return;
  const living=run.authoredSite?.index===1;
  const fs=Math.max(14,Math.min(living?16:19,h*.021)),pad=14,cw=Math.min(living?360:420,w*.30),x=w-cw-20,y=26;
  ctx.save();ctx.font=cjk(fs,500);ctx.textAlign='left';ctx.textBaseline='top';
  const lines=value.split('\n').flatMap(line=>layoutCJK(ctx,line,cw-pad*2));
  const logs=living?[]:state.logs;
  const status=living?[`艇壳 ${Math.round(run.hull*100)}% · 电量 ${Math.round(run.power*100)}%`,...(run.powered&&run.activeSonarEnabled?['主动声纳通电 · 持续发声']:[]),...(run.hull<.85?['修补：停车，Esc 回舱内 → 1 生命维持']:[])]:[];
  const lh=fs*1.5,height=pad*2+fs*1.7+lines.length*lh+logs.length*fs*1.15+status.length*lh+10;
  ctx.shadowColor='#000';ctx.shadowBlur=18;ctx.fillStyle='#061412db';ctx.fillRect(x,y,cw,height);ctx.shadowBlur=0;
  ctx.strokeStyle='#649c8170';ctx.strokeRect(x+.5,y+.5,cw-1,height-1);
  ctx.strokeStyle='#a9dfb9';ctx.lineWidth=2;
  for(const [px,py,sx,sy] of [[x,y,1,1],[x+cw,y,-1,1],[x,y+height,1,-1],[x+cw,y+height,-1,-1]]){ctx.beginPath();ctx.moveTo(px,py+sy*12);ctx.lineTo(px,py);ctx.lineTo(px+sx*17,py);ctx.stroke();}
  ctx.fillStyle='#a9dfb9';ctx.font=cjk(fs*.85,600);ctx.fillText('当前任务 / LIVE ORDERS',x+pad,y+pad);
  let remaining=Math.floor((now-state.since)/12);
  ctx.font=cjk(fs,500);
  lines.forEach((line,i)=>{const shown=line.slice(0,Math.max(0,remaining));remaining-=line.length;ctx.fillStyle=/坐标|深度|DEPTH|X\s*-?\d|Y\s*-?\d|Z\s*-?\d/.test(line)?'#f2ce83':'#dcece0';ctx.fillText(shown,x+pad,y+pad+fs*1.7+i*lh);});
  ctx.font=mono(fs*.72);logs.forEach((log,i)=>{ctx.fillStyle=i?'#658876':'#99b9a5';ctx.fillText(log,x+pad,y+pad+fs*1.7+lines.length*lh+9+i*fs*1.15);});
  ctx.font=cjk(fs*.9,600);status.forEach((line,i)=>{ctx.fillStyle=run.hull<=.5?'#ffad82':'#b9d9c6';ctx.fillText(line,x+pad,y+pad+fs*1.7+lines.length*lh+9+i*lh);});
  ctx.restore();
}
