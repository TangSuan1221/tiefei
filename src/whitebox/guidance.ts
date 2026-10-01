import type { PodRun } from '../pod/sim/run';
import type { WhiteboxSite } from './site';
import { performControl } from '../pod/view/stations';
import { installCheckpoint, readCheckpoint } from './checkpoint';
import './guidance.css';

/** Visible, accessible duplicates of existing controls; no autopilot or fact grants. */
export function installGuidance(run:PodRun,site:WhiteboxSite){
 const checkpoint=installCheckpoint(run,site);
 const panel=document.createElement('aside');panel.id='port-guide';panel.setAttribute('aria-label','接驳港航行助手');
 panel.innerHTML=`<header><b>0 层 · 接驳港</b><button id="port-collapse" aria-expanded="true">收起指引</button></header>
 <div id="port-guide-body"><p id="port-objective" aria-live="polite"></p><p id="port-next"></p>
 <details open><summary>港口平面图 · 北朝上</summary><canvas id="port-plan" width="280" height="210" aria-label="港口平面图；金色箭头为本艇，亮圈为当前目的地"></canvas><p id="port-position"></p></details>
 <details><summary>驾驶与摄影操作</summary><p>按住空格前进，N 倒车，J / L 转船头，Shift 刹车。也可点击下面的步进按钮。碰到设施时先倒退再转向。</p><p>摄影台按 1 拍摄；曝光 5 秒期间留在原台。显影 12 秒后去分析台，按 3 核验。录像只代表拍摄时的现场。</p><p>设施须靠近并正对面板，按 F。东仓面板朝东，摄影朝北。镜头偏离时可点“镜头归中”。</p></details>
 <p id="port-radio" aria-live="polite"></p><p id="port-report"></p><small id="port-checkpoint"></small></div>`;
 const controls=document.createElement('nav');controls.id='port-controls';controls.setAttribute('aria-label','驾驶与摄影快捷操作');
 const button=(label:string,id:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.id=id;b.onclick=action;controls.append(b);return b;};
 const station=(id:'camera'|'lab')=>{if(run.shot.phase==='exposing')return;run.shot.viewing=false;run.labVideoExpanded=false;run.walkTo(id);};
 button('摄影台','port-camera',()=>station('camera'));
 button('分析台','port-lab',()=>station('lab'));
 const shoot=button('拍摄 · 5 秒','port-shoot',()=>performControl(run,'camera.shoot'));
 const analyze=button('核验当前录像','port-analyze',()=>performControl(run,'lab.analyze'));
 const interact=button('操作设施 · F','port-interact',()=>site.interact());
 for(const [action,label] of [['left','左转 5°'],['forward','前进一段'],['back','倒退一段'],['right','右转 5°'],['center','镜头归中']] as const){
  button(label,`port-${action}`,()=>{if(run.at==='camera')run.cameraDrive(action);});
 }
 button('恢复检查点','port-restore',()=>{if(readCheckpoint()){sessionStorage.setItem('ironlung.whitebox.resume','1');location.reload();}});
 document.body.append(panel,controls);
 const get=(id:string)=>panel.querySelector<HTMLElement>('#'+id)!;
 panel.querySelector<HTMLButtonElement>('#port-collapse')!.onclick=()=>{const body=get('port-guide-body');body.hidden=!body.hidden;const b=panel.querySelector<HTMLButtonElement>('#port-collapse')!;b.textContent=body.hidden?'展开指引':'收起指引';b.setAttribute('aria-expanded',String(!body.hidden));};
 const map=panel.querySelector<HTMLCanvasElement>('#port-plan')!;
 let lastRadio='';
 const timer=window.setInterval(()=>{
  get('port-objective').textContent=site.objective;
  const rolling=['exposing','developing'].includes(run.shot.phase);
  const tape=run.selectedTape;
  get('port-next').textContent=site.complete?'本关已完成。艾里亚斯走内侧通道，你从外侧下潜。':run.shot.phase==='exposing'?`正在曝光，还需 ${Math.ceil(run.shot.exposeLeft)} 秒。保持摄影台。`:
   run.shot.phase==='developing'?`正在显影，还需约 ${Math.max(0,Math.ceil(12-run.shot.developed))} 秒。可在此等待。`:
   tape?.ready&&!tape.analyzed?'录像已返回 → 点击分析台，再点击「核验当前录像」。':
   site.rescued&&!site.departureConfirmed&&site.departureTime<4?'等待艾里亚斯抵达内侧门后再拍摄。':
   run.at!=='camera'?'点击「摄影台」返回驾驶与拍摄。':'驾驶可按住按键，也可点击步进按钮；取景后点击「拍摄」。';
  const last=site.events.at(-1)?.event??'艾里亚斯〔港口应急频道〕：我在断桥北面的维修隔间。水里有东西，你能看见吗？';
  if(last!==lastRadio){get('port-radio').textContent=last;lastRadio=last;}
  get('port-report').textContent=tape?.analyzed?'最近一次录像核验（历史记录）：'+tape.report.filter(t=>!t.includes('非AI')&&!/下一步|返回|前往|回控制台/.test(t)).join('　'):'';
  get('port-checkpoint').textContent=checkpoint();
  get('port-position').textContent=`本艇 X ${site.position.x.toFixed(1)} / Z ${site.position.z.toFixed(1)} · 船头 ${Math.round(run.heading)}°（北 0° / 东 90°）`;
  site.drawMap(map.getContext('2d')!,map.width,map.height);
  shoot.disabled=run.at!=='camera'||rolling||!run.powered||run.arm.phase!=='stowed'||run.outcome.kind!=='alive';
  analyze.disabled=run.at!=='lab'||!tape?.ready||!!tape.analyzed||!run.powered;
  interact.disabled=run.at!=='camera'||rolling||run.outcome.kind!=='alive';
  for(const id of ['left','right','forward','back','center'])controls.querySelector<HTMLButtonElement>('#port-'+id)!.disabled=run.at!=='camera'||!!run.driveBlock||site.complete;
  controls.querySelector<HTMLButtonElement>('#port-camera')!.disabled=run.shot.phase==='exposing';
  controls.querySelector<HTMLButtonElement>('#port-lab')!.disabled=run.shot.phase==='exposing';
  controls.querySelector<HTMLButtonElement>('#port-restore')!.disabled=!readCheckpoint();
 },250);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
