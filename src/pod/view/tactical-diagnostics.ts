import type { PodRun } from '../sim/run';
import { cjk, mono } from '@/ui/typography';

const feedback = new WeakMap<PodRun, { id: string; until: number }>();
const samples = new WeakMap<PodRun, { at: number; power: number; rate: number | null }>();
export function terminalFeedback(run: PodRun, id: string): void {
  feedback.set(run, { id, until: performance.now() + 1300 });
    run.onCue?.('ui.select', .4);
}
export function terminalPressed(run: PodRun, id: string): boolean {
  const f=feedback.get(run);return !!f&&f.id===id&&f.until-performance.now()>1100;
}
type Button=(id:string,label:string,x:number,y:number,w:number,h?:number,active?:boolean,disabled?:boolean)=>void;
export function drawTacticalStatus(ctx:CanvasRenderingContext2D,run:PodRun,hovered:string|null,button:Button):void {
  const green='#8cf5b8',dim='#689c85',amber='#f0bf78',red='#ff7970';
  const t=performance.now()/1000,damage=Math.max(0,Math.min(1,1-run.hull));
  const color=damage>=.5?red:damage>.001?amber:green;
  const text=(s:string,x:number,y:number,size=20,c=green,numeric=false)=>{ctx.font=numeric?mono(size,500):cjk(size,500);ctx.fillStyle=c;ctx.fillText(s,x,y);};
  const panel=(x:number,y:number,w:number,h:number)=>{ctx.fillStyle='#0a1c16';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#2b5140';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);};
  text('SYSTEM DIAGNOSTICS',40,185,22,dim,true);text('实时艇况',821,185,22);
  panel(28,210,968,224);text('船体损坏程度',48,237,25);text('HULL / 整艇传感',733,237,18,dim);
  ctx.save();ctx.translate(100,278);ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.shadowColor=color;ctx.shadowBlur=damage>0?4+3*Math.sin(t*4):4;
  ctx.beginPath();ctx.moveTo(80,16);ctx.lineTo(465,16);ctx.bezierCurveTo(580,16,620,42,620,62);ctx.bezierCurveTo(620,88,580,108,465,108);ctx.lineTo(80,108);ctx.quadraticCurveTo(25,105,25,62);ctx.quadraticCurveTo(25,20,80,16);ctx.stroke();
  ctx.beginPath();ctx.moveTo(25,62);ctx.lineTo(-16,62);ctx.moveTo(-16,33);ctx.lineTo(-16,91);ctx.moveTo(235,16);ctx.lineTo(235,-8);ctx.lineTo(313,-8);ctx.lineTo(330,16);ctx.moveTo(265,-8);ctx.lineTo(265,-26);ctx.lineTo(293,-26);ctx.stroke();
  for(let i=0;i<5;i++){const px=100+i*89;ctx.strokeRect(px,31,73,61);ctx.beginPath();ctx.moveTo(px+36,31);ctx.lineTo(px+36,92);ctx.stroke();}
  ctx.globalAlpha=.3;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(-35,62);ctx.lineTo(650,62);ctx.stroke();ctx.restore();
  for(let i=0;i<10;i++){ctx.fillStyle=i<run.hull*10?color:'#20382c';ctx.fillRect(850,383-i*12,94,7);}
  text('完整性',860,407,17,dim);
  text(damage>=.5?'警报：结构完整性下降':damage>0?'检测到艇壳损伤 · 建议维护':'结构稳定 · 耐压壳无损',48,410,20,damage>=.5&&Math.sin(t*4)<0?amber:color);
  panel(28,448,570,132);text('剩余电量',48,475,23);text(`${Math.round(run.power*100)}%`,457,480,32,run.power<=.1?red:run.power<=.2?amber:green,true);
  ctx.strokeStyle=dim;ctx.lineWidth=2;ctx.strokeRect(49,502,331,42);ctx.fillStyle=dim;ctx.fillRect(381,514,7,18);
  for(let i=0;i<10;i++){ctx.fillStyle='#20382c';ctx.fillRect(56+i*32,509,25,28);const fraction=Math.max(0,Math.min(1,run.power*10-i));ctx.fillStyle=run.power<=.1?red:run.power<=.2?amber:green;ctx.fillRect(56+i*32,509,25*fraction,28);}
  let sample=samples.get(run);
  if(!sample||run.clock<sample.at||run.clock-sample.at>10||run.power>sample.power){sample={at:run.clock,power:run.power,rate:null};samples.set(run,sample);}
  if(run.clock-sample.at>=2){sample.rate=(sample.power-run.power)/(run.clock-sample.at)*6000;sample.at=run.clock;sample.power=run.power;}
  text(sample.rate===null?'耗电采样中…':`实测消耗 ${sample.rate.toFixed(1)}% / min`,48,563,18,dim);
  panel(612,448,384,132);text('供电总闸',632,475,23);
  button('lab.breaker','',821,465,150,70,!run.blackout);
  ctx.fillStyle=run.blackout?'#14241d':'#4d8b67';ctx.fillRect(833,run.blackout?501:473,126,26);
  text(run.blackout?'OFF':'ON',871,run.blackout?514:486,23,hovered==='lab.breaker'?'#ffffff':green,true);
  text(run.blackout?'备用监测 / 总闸断开':'主母线 / 接通',632,519,18,run.blackout?amber:dim);
  text('安全阈值：损坏≥50% / 电量≤20%',631,560,17,dim);
  button('station:life','⚙  前往维护 / 使用补给',28,600,420,58);
  if(run.blackout)button('lab.restoreBus','恢复总闸',470,600,220,58);
  const f=feedback.get(run);text(f&&f.until>performance.now()?'指令已执行 / 系统已更新':'● 遥测同步    /    PELAGIC SYSTEMS',40,687,18,dim);
}
