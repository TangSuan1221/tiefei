import {labDeskState} from './lab-desk';
import type {PodRun} from '../sim/run';

const TYPE_RATE=26;// characters per second for the instruction typewriter
let typed={key:'',at:0};

/** Quiet white floating instruction; not burned into photography or the CRT.
 *  Vance speaks first; the one-line instruction types in only after his caption has finished. */
export function drawPrologue(ctx:CanvasRenderingContext2D,run:PodRun,w:number,h:number){
 const p=run.prologue;
 const repair=run.authoredSite?.cargoManifest?.some(item=>item.name==='维修工具');
 if(!p?.active){if(!repair)return;const hint=run.at!=='lab'?'按 3 打开分析台，使用刚收妥的维修工具':labDeskState(run).tab!=='cargo'?'点击分析台上方【03 仓库】，查看维修工具':'点击【使用维修工具 · 修复铁鲸】，修复受损艇体';const now=performance.now();if(typed.key!==hint)typed={key:hint,at:now};ctx.save();ctx.textAlign='center';ctx.font=`400 ${Math.max(14,Math.min(25,w/55))}px Microsoft YaHei`;ctx.fillStyle='#f1f0e9';ctx.shadowColor='#000';ctx.shadowBlur=7;ctx.fillText([...hint].slice(0,Math.floor((now-typed.at)/1000*TYPE_RATE)).join(''),w/2,h*.09,w*.9);ctx.restore();return;}
 ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.shadowColor='#000';ctx.shadowBlur=7;
 const size=Math.max(17,Math.min(27,w/52));
 function lines(text:string,y:number,fontSize:number,width:number){
  ctx.font=`400 ${fontSize}px "Microsoft YaHei", sans-serif`;
  const rows:string[]=[];let row='';
  for(const c of text){if(ctx.measureText(row+c).width>width){rows.push(row);row='';}row+=c;}if(row)rows.push(row);
  for(const [i,t] of rows.entries()){ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=3;ctx.strokeText(t,w/2,y+i*fontSize*1.5);ctx.fillText(t,w/2,y+i*fontSize*1.5);}
  return rows.length*fontSize*1.5;
 }
 /** Shrinks the font instead of wrapping, so the instruction is always a single row. */
 function oneLine(text:string,full:string,y:number,fontSize:number,width:number){
  ctx.font=`400 ${fontSize}px "Microsoft YaHei", sans-serif`;
  const fit=Math.max(12,Math.min(fontSize,fontSize*width/Math.max(1,ctx.measureText(full).width)));
  ctx.font=`400 ${fit}px "Microsoft YaHei", sans-serif`;
  const x=w/2-ctx.measureText(full).width/2;ctx.textAlign='left';
  ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=3;ctx.strokeText(text,x,y);ctx.fillText(text,x,y);ctx.textAlign='center';
  return ctx.measureText(text).width+x;
 }
 const speaking=run.storyCaptionLeft>0&&!!run.storyCaption;
 if(speaking){
  const narration='陆地频道 · 万斯：'+p.beat[2];
  const captionSize=Math.max(24,Math.min(44,w/40));
  ctx.fillStyle='#f5f3ec';
  ctx.lineJoin='round';
  // Measure first so the complete voiced line stays on screen at narrow aspect ratios.
  ctx.font=`400 ${captionSize}px "Microsoft YaHei", sans-serif`;
  let rows=1,row='';for(const c of narration){if(ctx.measureText(row+c).width>w*.84){rows++;row='';}row+=c;}
  lines(narration,h*.94-rows*captionSize*1.5,captionSize,w*.84);
  typed={key:'',at:0};ctx.restore();return;
 }
 const hint=run.at?(p.step===1&&p.lampObservation>0?'探照灯已开启，观察舷窗外被照亮的长廊':p.beat[3]):'按 2 返回驾驶台，继续航前检查';
 const key=p.step+'|'+hint,now=performance.now();
 if(typed.key!==key)typed={key,at:now};
 const chars=[...hint],count=Math.min(chars.length,Math.floor((now-typed.at)/1000*TYPE_RATE)),done=count>=chars.length;
 ctx.fillStyle='#bdc5c6';lines(`序章 · 入港前  /  ${p.beat[0]}`,h*.04,size*.65,w*.88);
 ctx.fillStyle='#f1f0e9';
 const end=oneLine(chars.slice(0,count).join(''),hint,h*.09,size,w*.86);
 if(!done||Math.floor(now/450)%2===0)ctx.fillRect(end+3,h*.09+size*.1,Math.max(2,size*.08),size*.95);
 if(!done){ctx.restore();return;}
 // Live readouts stay below the instruction once it has finished typing.
 if(p.step>=9)lines(`俯仰 ${(-run.pitch).toFixed(1)}° · DEPTH ${(1012-(run.authoredSite?.elevation??0)).toFixed(1)} m · 航速 ${run.pilot.speed.toFixed(1)} m/s`,h*.15,size*.7,w*.85);
 if(p.step===2)lines(`当前档位 ${['停机','I','II','III'][run.throttle]} · 已试 ${[1,2,3].filter(g=>p.gears&(1<<g)).map(g=>['','I','II','III'][g]).join(' / ')||'—'}`,h*.15,size*.7,w*.85);
 ctx.restore();
}
