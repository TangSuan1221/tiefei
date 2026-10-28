import type { PodRun } from './run';

/** Level two (deck −1) checkpoint. Separate key from the harbor save so either run survives the other. */
export const LIVING_SAVE_KEY = 'ironlung.living.v1';
// Deck −1 film is 1280×720 (≈4.5× the 512×360 sensor frames): three frames of a reel cost ~0.2–0.35 M chars.
const LIMIT = 2_600_000;
const SENSOR_BUDGET = 2_000_000;
const numbers = ['breaths','clock','power','hull','flood','leak','scrubber','cabinTemp','noise','traveled','siteBreaths','heading','pitch','collisions','camPan','camTilt','camZoom','flareLeft','corruption','suspicion','huntRecoveryUntil'] as const;
const booleans = ['blackout','lamp','openingReceived','openingScanned','earsPlugged','activeSonarEnabled','sonarPulseEnabled'] as const;
const maps = ['stock','salvaged','containers','containerItems'] as const;
const sets = ['filed','askedOnce'] as const;
const arrays = ['bench','pending','heard','chart'] as const;
const timing = ['breathAcc','siteIdleSec','hallucTimer','ghostTimer','huntActIndex','encounterSerial'] as const;
type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
export interface LivingSave { version:1; adapter:'living-deck'; seed:number; savedAt:number; phase:'site'; legIndex:1; site:Obj; run:Obj; campaign:Obj; vitals:unknown; flags:Obj }
export interface SaveStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }

/** Remote probe reels and local exposures keep a playable minimum while unanalysed. */
function tapesForSave(run:PodRun):Obj[] {
  const tapes:Obj[]=run.tapes.map(({keyframe,prompt,fallbackPrompt,sensorFrames,...t})=>({...t}));
  let used=0;
  const candidates=run.tapes.map((t,index)=>({t,index})).filter(({t})=>!t.analyzed&&(t.sensorFrames?.length??0)>=3).reverse();
  for(const {t,index} of candidates){
    const f=t.sensorFrames!,minimum=[f[0],f[Math.floor((f.length-1)/2)],f[f.length-1]];
    used+=minimum.reduce((sum,x)=>sum+x.length,0);
    if(used>SENSOR_BUDGET)throw new Error('未分析录像超出存档容量；请先分析已有录像。旧存档保留。');
    tapes[index].sensorFrames=minimum;
  }
  for(const {t,index} of candidates){
    const f=t.sensorFrames!,extra=f.reduce((sum,x)=>sum+x.length,0)-tapes[index].sensorFrames.reduce((sum:number,x:string)=>sum+x.length,0);
    if(used+extra<=SENSOR_BUDGET){tapes[index].sensorFrames=[...f];used+=extra;}
  }
  // Preserve a playable three-frame copy of analyzed harbor evidence for later NPC delivery.
  for(let index=run.tapes.length-1;index>=0;index--){const t=run.tapes[index],e=t.siteEvidence as {kind?:string}|undefined;
    if(!t.analyzed||!e?.kind||!['threat','lure','gate','departure'].includes(e.kind)||(t.sensorFrames?.length??0)<3)continue;
    const f=t.sensorFrames!,frames=[f[0],f[Math.floor((f.length-1)/2)],f[f.length-1]],cost=frames.reduce((n,x)=>n+x.length,0);
    if(used+cost<=SENSOR_BUDGET){used+=cost;tapes[index].sensorFrames=frames;}
  }
  return tapes;
}

export function isLivingSave(v:unknown):v is LivingSave {
  if(!object(v)||v.version!==1||v.adapter!=='living-deck'||v.legIndex!==1||v.phase!=='site')return false;
  if(!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!Number.isFinite(v.savedAt))return false;
  const s=v.site,r=v.run,c=v.campaign;
  if(!object(s)||s.adapter!=='living-deck'||s.adapterVersion!==1||s.index!==1||s.levelId!=='living.2')return false;
  if(s.routeVersion!==2||s.debugNoVideo!==false||!object(s.survey)||s.survey.version!==1||!Array.isArray(s.cargo))return false;
  if(!object(s.deck)||!object(s.creatures)||!object(s.dialogue)||!object(s.navigation)||!object(s.sonarDesk))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite))return false;
  if(!object(r)||!object(c)||!Array.isArray(c.journal)||!Array.isArray(c.seen)||!Array.isArray(c.queue))return false;
  if(!numbers.every(k=>Number.isFinite(r[k]))||!booleans.every(k=>typeof r[k]==='boolean'))return false;
  if(![...maps,...sets,...arrays,'tapes'].every(k=>Array.isArray(r[k])))return false;
  if(!maps.every(k=>r[k].every((p:unknown)=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string')))return false;
  if(!r.tapes.every((t:unknown)=>object(t)&&typeof t.id==='string'&&typeof t.legId==='string'&&Array.isArray(t.fauna)&&Array.isArray(t.report)&&typeof t.analyzed==='boolean'))return false;
  if(!object(v.vitals)||!object(v.vitals.v)||v.vitals.death!==null||!Array.isArray(v.vitals.fx)||!object(v.flags))return false;
  return r.hull>0&&r.hull<=1&&r.power>=0&&r.power<=1&&v.vitals.v.oxygen>0;
}

export function readLivingSave(storage:SaveStorage):LivingSave|null {
  const raw=storage.getItem(LIVING_SAVE_KEY);if(!raw)return null;
  const pointer=JSON.parse(raw);
  if(!object(pointer)||pointer.version!==1||typeof pointer.slot!=='string'||!/^ironlung\.living\.v1\.\d+$/.test(pointer.slot))throw new Error('第二关存档指针损坏；原存档未修改。');
  const payload=JSON.parse(storage.getItem(pointer.slot)??'null');
  if(object(payload)&&object(payload.site)&&payload.site.routeVersion!==2)throw new Error('这是旧版第二关路线存档，不能载入新版调查流程。原存档保留，请开始新的事故调查。');
  if(object(payload)&&object(payload.site)&&payload.site.debugNoVideo===true)throw new Error('GM诊断进度不能作为正式存档继续。原记录保留，请开始新的事故调查。');
  if(!isLivingSave(payload))throw new Error('第二关存档损坏或版本不兼容；原存档未修改。');
  if(pointer.slot!==`${LIVING_SAVE_KEY}.${payload.seed}`)throw new Error('存档槽与种子不匹配。');
  return payload;
}
export function hasLivingSave(storage?:SaveStorage):boolean {
  try{return !!readLivingSave(storage??localStorage);}catch{return false;}
}
export function livingSlotTaken(storage:SaveStorage,seed:number){return storage.getItem(`${LIVING_SAVE_KEY}.${seed}`)!==null;}

/** Null whenever the moment is unsafe: film in progress, arm out, something clinging or hunting, a tape still rendering. */
export function captureLivingSave(run:PodRun):LivingSave|null {
  if(run.gmLevelSession)return null;
  if(run.legIndex!==1||run.phase!=='site'||run.outcome.kind!=='alive'||run.arm.phase!=='stowed'||['exposing','developing'].includes(run.shot.phase))return null;
  if(run.mode!=='calm'||run.threat||run.charging||run.fx.spill>0||run.fx.lure>0)return null;
  const live=run.authoredSite as (NonNullable<PodRun['authoredSite']>&{saveSafe?:boolean})|null;
  if(!live||live.index!==1||live.saveSafe!==true)return null;
  const site=live.snapshot();
  if(!object(site)||site.adapter!=='living-deck')return null;
  // Preserve the previous checkpoint once all known power recovery sources are exhausted.
  // This guards confirmed blackout dead ends, not the budget for every remaining task.
  if(run.power<=.02&&run.count('sup.cell')===0&&site.reserveUsed===true)return null;
  const r:Obj={};const runtime=run as unknown as Obj;
  for(const k of [...numbers,...booleans])r[k]=runtime[k];
  for(const k of maps)r[k]=Array.from(run[k] as Map<string,unknown>);
  for(const k of sets)r[k]=Array.from(run[k]);
  for(const k of arrays)r[k]=run[k];
  r.tapes=tapesForSave(run);
  r.volumeAt=run.volumeAt;r.cabinPos=run.cabinPos;r.tapeCursor=run.tapeCursor;
  r.timing={};for(const k of timing)r.timing[k]=runtime[k];
  r.hookNudged=Array.from(runtime.hookNudged);r.firedBeats=Array.from(runtime.firedBeats);r.footageRepeats=Array.from(runtime.footageRepeats);
  const campaign=run.campaign as unknown as Obj;
  const save=clone({version:1,adapter:'living-deck',seed:run.seed,savedAt:Date.now(),phase:'site',legIndex:1,site,run:r,
    campaign:{chapter:campaign.chapter,choice:campaign.choice,journal:campaign.journal,seen:Array.from(campaign.seen),queue:campaign.queue,cooldown:campaign.cooldown},
    vitals:run.vitals.serialize(),flags:run.flags.serialize()});
  if(!isLivingSave(save))throw new Error('当前状态不符合第二关存档契约。');
  return save;
}

export function writeLivingSave(storage:SaveStorage,save:LivingSave):void {
  if(!isLivingSave(save))throw new Error('拒绝写入无效存档。');
  const text=JSON.stringify(save);if(text.length>LIMIT)throw new Error('存档体积超限，已有进度保留。');
  const slot=`${LIVING_SAVE_KEY}.${save.seed}`,previous=storage.getItem(slot);
  storage.setItem(slot,text);
  try{storage.setItem(LIVING_SAVE_KEY,JSON.stringify({version:1,slot}));}
  catch(error){if(previous!==null)storage.setItem(slot,previous);throw error;}
}

/** Call after PodView installs createAuthoredSite. The adapter validates deck facts, creatures and hull clearance. */
export function restoreLivingSave(run:PodRun,save:LivingSave):boolean {
  if(!isLivingSave(save)||run.seed!==save.seed)return false;
  run.beginLivingDeck();
  const site=run.authoredSite as (NonNullable<PodRun['authoredSite']>&{restore?:(snapshot:unknown)=>boolean})|null;
  if(!site||site.index!==1||!site.restore||!site.restore(clone(save.site)))return false;
  const r=clone(save.run),runtime=run as unknown as Obj;
  for(const k of [...numbers,...booleans])runtime[k]=r[k];
  for(const k of maps){const map=run[k] as Map<string,unknown>;map.clear();for(const [id,value]of r[k])map.set(id,value);}
  for(const k of sets){const set=run[k] as Set<string>;set.clear();for(const id of r[k])set.add(id);}
  for(const k of arrays){const list=run[k] as unknown[];list.splice(0,list.length,...r[k]);}
  run.tapes.splice(0,run.tapes.length,...r.tapes);run.tapeCursor=Math.max(0,Math.min(r.tapeCursor??0,run.tapes.length-1));
  run.volumeAt=r.volumeAt;Object.assign(run.cabinPos,r.cabinPos);
  for(const k of timing)if(Number.isFinite(r.timing?.[k]))runtime[k]=r.timing[k];
  runtime.hookNudged=new Set(r.hookNudged??[]);runtime.firedBeats=new Set(r.firedBeats??[]);runtime.footageRepeats=new Map(r.footageRepeats??[]);
  run.vitals.hydrate(clone(save.vitals));run.flags.hydrate(clone(save.flags));
  const campaign=run.campaign as unknown as Obj,c=clone(save.campaign);
  campaign.journal.splice(0,campaign.journal.length,...c.journal);campaign.seen=new Set(c.seen);
  campaign.queue=c.queue;campaign.cooldown=c.cooldown;campaign.chapter=c.chapter;campaign.choice=c.choice;
  // Site restore set heading/pitch; the run copy above is the same value.
  run.pilot.stop();run.navDriveEngaged=false;run.shot.phase='idle';run.shot.viewing=false;
  return true;
}
