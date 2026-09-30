import type { PodRun } from './run';

/** UI must validate the pointer, not merely test whether the key exists. */
export const HARBOR_SAVE_KEY = 'ironlung.harbor.v1';
const LIMIT = 1_500_000;
// Frames are already JPEG-compressed by the capture view. No canvas/network work at save time.
const SENSOR_BUDGET = 950_000;
function tapesForSave(run:PodRun):Obj[] {
  const tapes:Obj[]=run.tapes.map(({keyframe,prompt,fallbackPrompt,sensorFrames,...t})=>({...t}));
  let used=0;
  // Keep a playable minimum for every unanalysed local reel, not just the most recent
  // (a newer invalid exposure must not erase the only valid evidence reel).
  const candidates=run.tapes.map((t,index)=>({t,index})).filter(({t})=>!t.analyzed&&(t.sensorFrames?.length??0)>=3).reverse();
  for(const {t,index} of candidates){
    const frames=t.sensorFrames!;
    const minimum=[frames[0],frames[Math.floor((frames.length-1)/2)],frames[frames.length-1]];
    used+=minimum.reduce((sum,f)=>sum+f.length,0);
    if(used>SENSOR_BUDGET)throw new Error('未分析录像超出存档容量；请先分析已有录像。旧存档保留。');
    tapes[index].sensorFrames=minimum;
  }
  // Spend remaining budget on the newest reels first; preserve original frame order.
  for(const {t,index} of candidates){
    const frames=t.sensorFrames!;
    const extra=frames.reduce((sum,f)=>sum+f.length,0)-tapes[index].sensorFrames.reduce((sum:number,f:string)=>sum+f.length,0);
    if(used+extra<=SENSOR_BUDGET){tapes[index].sensorFrames=[...frames];used+=extra;}
  }
  return tapes;
}
const numbers = ['breaths','clock','power','hull','flood','leak','scrubber','cabinTemp','noise','traveled','siteBreaths','heading','pitch','collisions','camPan','camTilt','camZoom','flareLeft','corruption','suspicion','huntRecoveryUntil'] as const;
const booleans = ['blackout','lamp','openingReceived','openingScanned','earsPlugged','activeSonarEnabled'] as const;
const maps = ['stock','salvaged','containers','containerItems'] as const;
const sets = ['filed','askedOnce'] as const;
const arrays = ['bench','pending','heard','chart'] as const;
type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
export interface HarborSave { version:1; seed:number; savedAt:number; phase:'site'; site:Obj; run:Obj; campaign:Obj; vitals:unknown; flags:Obj }
export interface SaveStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }

export function isHarborSave(v:unknown):v is HarborSave {
  if(!object(v)||v.version!==1||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||v.phase!=='site')return false;
  const s=v.site,r=v.run,c=v.campaign;
  if(!object(s)||s.index!==0||typeof s.levelId!=='string'||!s.levelId.startsWith('harbor')||!object(s.state)||!object(s.harbor))return false;
  if(s.state.version!==1||s.state.levelId!==s.levelId||s.harbor.version!==1||s.harbor.levelId!==s.levelId)return false;
  if(!['inventory','collected','opened','visited','recorded'].every(k=>Array.isArray(s.state[k])&&s.state[k].every((x:unknown)=>typeof x==='string')))return false;
  if(!Array.isArray(s.harbor.grants)||!s.harbor.grants.every((x:unknown)=>typeof x==='string')||!Array.isArray(s.harbor.exposures))return false;
  // pending is a captured, not-yet-analysed fact, NOT an in-flight API task.
  if(s.harbor.exposures.some((e:unknown)=>!object(e)||!['pending','ready','failed'].includes(e.status)))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite))return false;
  if(!object(r)||!object(c)||c.chapter!==0||c.choice!==null||!Array.isArray(c.journal)||!Array.isArray(c.seen)||!Array.isArray(c.queue))return false;
  if(!numbers.every(k=>Number.isFinite(r[k]))||!booleans.every(k=>typeof r[k]==='boolean'))return false;
  if(![...maps,...sets,...arrays,'tapes'].every(k=>Array.isArray(r[k])))return false;
  if(!maps.every(k=>r[k].every((p:unknown)=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string')))return false;
  if(!r.tapes.every((t:unknown)=>object(t)&&typeof t.id==='string'&&typeof t.legId==='string'&&Array.isArray(t.fauna)&&Array.isArray(t.report)&&typeof t.analyzed==='boolean'))return false;
  if(!object(v.vitals)||!object(v.vitals.v)||v.vitals.death!==null||!Array.isArray(v.vitals.fx)||!object(v.flags))return false;
  return r.hull>0&&r.hull<=1&&r.power>=0&&r.power<=1&&v.vitals.v.oxygen>0&&Number.isFinite(v.savedAt);
}

export function readHarborSave(storage:SaveStorage):HarborSave|null {
  const raw=storage.getItem(HARBOR_SAVE_KEY);if(!raw)return null;
  const pointer=JSON.parse(raw);
  const payload=object(pointer)&&typeof pointer.slot==='string'&&/^ironlung\.harbor\.v1\.\d+$/.test(pointer.slot)
    ?JSON.parse(storage.getItem(pointer.slot)??'null'):pointer;
  if(!isHarborSave(payload))throw new Error('港口存档损坏或版本不兼容；原存档未修改。');
  if(pointer.slot&&pointer.slot!==`${HARBOR_SAVE_KEY}.${payload.seed}`)throw new Error('存档槽与种子不匹配。');
  return payload;
}
export function hasHarborSave(storage?:SaveStorage):boolean {
  try{return !!readHarborSave(storage??localStorage);}catch{return false;}
}
export function captureHarborSave(run:PodRun):HarborSave|null {
  if(run.gmLevelSession)return null;
  if(run.legIndex!==0||run.phase!=='site'||run.outcome.kind!=='alive'||run.arm.phase!=='stowed'||['exposing','developing'].includes(run.shot.phase))return null;
  // Never checkpoint in a live attack: transient attacker/timers are not persisted.
  if(run.mode!=='calm'||run.threat||run.charging||run.fx.spill>0||run.fx.lure>0)return null;
  const site=run.authoredSite?.snapshot();
  if(!object(site)||site.index!==0||typeof site.levelId!=='string'||!site.levelId.startsWith('harbor')||!object(site.harbor))return null;
  const r:Obj={};for(const k of [...numbers,...booleans])r[k]=run[k];
  for(const k of maps)r[k]=Array.from(run[k] as Map<string,unknown>);
  for(const k of sets)r[k]=Array.from(run[k]);
  for(const k of arrays)r[k]=run[k];
  r.tapes=tapesForSave(run);
  r.volumeAt=run.volumeAt;r.cabinPos=run.cabinPos;r.tapeCursor=run.tapeCursor;
  // Explicit allowlist of deferred narrative data; never serialize callbacks or network jobs.
  const runtime=run as unknown as Obj;
  r.timing={};for(const k of ['breathAcc','siteIdleSec','hallucTimer','ghostTimer','huntActIndex','encounterSerial'])r.timing[k]=runtime[k];
  r.hookNudged=Array.from(runtime.hookNudged);r.firedBeats=Array.from(runtime.firedBeats);
  r.footageRepeats=Array.from(runtime.footageRepeats);
  // Campaign has no persistence API. Copy its data, not replay record() (which queues false announcements).
  const campaign=run.campaign as unknown as Obj;
  const save=clone({version:1,seed:run.seed,savedAt:Date.now(),phase:'site',site,run:r,
    campaign:{chapter:campaign.chapter,choice:campaign.choice,journal:campaign.journal,seen:Array.from(campaign.seen),queue:campaign.queue,cooldown:campaign.cooldown},
    vitals:run.vitals.serialize(),flags:run.flags.serialize()});
  if(!isHarborSave(save))throw new Error('当前状态不符合港口存档契约。');
  return save;
}

export function writeHarborSave(storage:SaveStorage,save:HarborSave):void {
  if(!isHarborSave(save))throw new Error('拒绝写入无效存档。');
  const text=JSON.stringify(save);if(text.length>LIMIT)throw new Error('存档体积超限，已有进度保留。');
  const slot=`${HARBOR_SAVE_KEY}.${save.seed}`;
  const oldPointer=storage.getItem(HARBOR_SAVE_KEY);
  // Support a previous payload-in-main-key format without destroying that run.
  if(oldPointer){const old=JSON.parse(oldPointer);if(isHarborSave(old)&&old.seed!==save.seed){
    const backup=`${HARBOR_SAVE_KEY}.${old.seed}`;if(!storage.getItem(backup))storage.setItem(backup,oldPointer);
  }}
  const previous=storage.getItem(slot);
  storage.setItem(slot,text); // Web Storage setItem is atomic on quota failure.
  try{storage.setItem(HARBOR_SAVE_KEY,JSON.stringify({version:1,slot}));}
  catch(error){if(previous!==null)storage.setItem(slot,previous);throw error;}
}

/** Call after PodView installs createAuthoredSite, before starting the frame loop. */
export function restoreHarborSave(run:PodRun,save:HarborSave):boolean {
  if(!isHarborSave(save)||run.seed!==save.seed)return false;
  run.phase='site';run.legIndex=0;run.ensureAuthoredSite();
  const site=run.authoredSite as (NonNullable<PodRun['authoredSite']>&{restore?:(snapshot:unknown)=>boolean})|null;
  const actual=site?.snapshot();
  if(!site||!object(actual)||actual.levelId!==save.site.levelId||!site.restore)return false;
  // The adapter owns validation and materialization of doors/evidence/position.
  if(!site.restore(clone(save.site)))return false;
  const r=clone(save.run);
  for(const k of numbers)run[k]=r[k];for(const k of booleans)run[k]=r[k];
  for(const k of maps){const map=run[k] as Map<string,unknown>;map.clear();for(const [id,value]of r[k])map.set(id,value);}
  for(const k of sets){const set=run[k] as Set<string>;set.clear();for(const id of r[k])set.add(id);}
  for(const k of arrays){const list=run[k] as unknown[];list.splice(0,list.length,...r[k]);}
  run.tapes.splice(0,run.tapes.length,...r.tapes);run.tapeCursor=Math.max(0,Math.min(r.tapeCursor??0,run.tapes.length-1));
  run.volumeAt=r.volumeAt;Object.assign(run.cabinPos,r.cabinPos);
  const runtime=run as unknown as Obj;
  for(const k of ['breathAcc','siteIdleSec','hallucTimer','ghostTimer','huntActIndex','encounterSerial'])if(Number.isFinite(r.timing?.[k]))runtime[k]=r.timing[k];
  runtime.hookNudged=new Set(r.hookNudged??[]);runtime.firedBeats=new Set(r.firedBeats??[]);
  runtime.footageRepeats=new Map(r.footageRepeats??[]);
  run.vitals.hydrate(clone(save.vitals));run.flags.hydrate(clone(save.flags));
  const campaign=run.campaign as unknown as Obj,c=clone(save.campaign);
  campaign.journal.splice(0,campaign.journal.length,...c.journal);campaign.seen=new Set(c.seen);
  campaign.queue=c.queue;campaign.cooldown=c.cooldown;campaign.chapter=c.chapter;campaign.choice=c.choice;
  run.pilot.stop();run.navDriveEngaged=false;run.shot.phase='idle';run.shot.viewing=false;
  return true;
}
