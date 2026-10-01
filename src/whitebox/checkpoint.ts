import type { PodRun } from '../pod/sim/run';
import type { WhiteboxSite } from './site';

// Separate tab-local slot. Never reads or writes the campaign's localStorage.
const KEY='ironlung.whitebox.checkpoint.v2';
type Checkpoint={version:2;site:ReturnType<WhiteboxSite['snapshot']>;power:number;vitals:ReturnType<PodRun['vitals']['serialize']>;tapes:PodRun['tapes'];savedAt:number};
export function readCheckpoint():Checkpoint|null{
 try{const s=JSON.parse(sessionStorage.getItem(KEY)??'null') as Checkpoint|null;
  return s?.version===2&&s.site?.version===2&&Number.isFinite(s.power)&&s.power>0&&s.power<=1&&Array.isArray(s.tapes)&&s.vitals?s:null;
 }catch{return null;}
}
export function clearCheckpoint(){try{sessionStorage.removeItem(KEY);}catch{/* session storage unavailable */}}
export function restoreCheckpoint(run:PodRun,site:WhiteboxSite):boolean{
 const s=readCheckpoint();if(!s||!site.restore(s.site))return false;
 run.power=s.power;run.vitals.hydrate(s.vitals);run.tapes.splice(0,run.tapes.length,...s.tapes);run.tapeCursor=Math.max(0,run.tapes.length-1);
 // Reel IDs are derived from this token. Reusing tape.1 after a reload would
 // settle the historical reel and leave every newly captured reel unreadable.
 run.shot.token=Math.max(0,...run.tapes.map(t=>Number(t.id.split('.').at(-1))||0));
 run.pilot.stop();run.pitch=0;run.camPan=0;run.camTilt=0;run.camZoom=1;return true;
}
export function installCheckpoint(run:PodRun,site:WhiteboxSite){
 let signature='';let note='抵达安全节点后自动保存';
 const timer=window.setInterval(()=>{
  const next=[site.stage,site.powered,site.verified].join(':');
  if(next===signature||run.outcome.kind!=='alive'||run.power<.08||run.shot.viewing||['exposing','developing'].includes(run.shot.phase)||run.arm.phase!=='stowed')return;
  if(site.lureTime>0&&!site.monsterInside)return;
  try{
   const s:Checkpoint={version:2,site:site.snapshot(),power:run.power,vitals:run.vitals.serialize(),savedAt:Date.now(),tapes:run.tapes.map(t=>({...t,sensorFrames:t.sensorFrames?.filter((_,i,a)=>i===0||i===Math.floor(a.length/2)||i===a.length-1)}))};
   sessionStorage.setItem(KEY,JSON.stringify(s));signature=next;note='检查点已保存 · 仅本标签页';
  }catch{note='检查点未保存：浏览器存储空间不足';}
 },800);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return ()=>note;
}
