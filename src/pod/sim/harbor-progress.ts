import { HARBOR, HARBOR_EXIT_REQUIREMENTS, harborRequirementName } from '../content/harbor-level';

/** Persist together with ExpeditionState. Runtime must merge grants into its inventory uniquely. */
export interface HarborProgress {
  version: 1;
  levelId: 'harbor.1';
  grants: string[];
  exposures: HarborExposure[];
}
export interface HarborCaptureInput {
  id: string;
  roomId: string;
  position: [number, number, number];
  direction: [number, number, number];
  capturedAt: number;
  targetId: string;
  targetVisible: boolean;
  unobstructed: boolean;
  distance: number;
  stableSeconds: number;
  lightOn: boolean;
  threat: string;
}
export interface HarborExposure extends HarborCaptureInput {
  valid: boolean;
  status: 'pending' | 'ready' | 'failed';
  source?: 'generated-video' | 'controlled-video';
  mediaId?: string;
  analyzed: boolean;
}
export interface HarborResult { state: HarborProgress; grants: string[]; ok: boolean; message: string }
export const HARBOR_PHOTO_TARGET = 'harbor.asset.rescue-pod';
export const HARBOR_CAPTURE_LIMITS = {minDistance: 3, maxDistance: 65, stableSeconds: 0.75} as const;
export const newHarborProgress = (): HarborProgress => ({version:1,levelId:'harbor.1',grants:[],exposures:[]});
/** Use after every result, not just grants.push: also removes revoked depth readiness.
 * Physical inventory tokens are preserved; only this module's owned facts are reconciled. */
export function syncHarborInventory(s:HarborProgress,inventory:readonly string[]):string[] {
  const owned:string[]=[HARBOR.permit,HARBOR.photo,HARBOR.discrepancy,HARBOR.cardAnalyzed,HARBOR.searchComplete,HARBOR.route,HARBOR.depthReady];
  return [...new Set([...inventory.filter(t=>!owned.includes(t)),...s.grants])];
}
const clone = (s:HarborProgress):HarborProgress => ({...s,grants:[...s.grants],exposures:s.exposures.map(e=>({...e,position:[...e.position],direction:[...e.direction]}))});
function result(s:HarborProgress, tokens:string[], message:string, ok=true):HarborResult {
  const state=clone(s), grants=tokens.filter(t=>!state.grants.includes(t));
  state.grants.push(...grants);
  return {state,grants,ok,message};
}
function validState(s:HarborProgress) { return s.version===1 && s.levelId==='harbor.1'; }

/** Invoke at shutter press, using actual target visibility/raycast results, never when video returns. */
export function captureHarborEvidence(s:HarborProgress,input:HarborCaptureInput):HarborResult {
  if(!validState(s)) return result(s,[],'接驳港存档不匹配。',false);
  if(!input.id.startsWith('harbor.') || !Number.isFinite(input.capturedAt) ||
    !input.position.every(Number.isFinite) || !input.direction.every(Number.isFinite))
    return result(s,[],'曝光快照无效。',false);
  if(s.exposures.some(e=>e.id===input.id)) return result(s,[],'曝光已登记，不覆盖原快照。');
  const valid = ['harbor.room.B','harbor.room.D'].includes(input.roomId) &&
    input.targetId===HARBOR_PHOTO_TARGET && input.targetVisible && input.unobstructed &&
    input.distance>=HARBOR_CAPTURE_LIMITS.minDistance && input.distance<=HARBOR_CAPTURE_LIMITS.maxDistance &&
    Number.isFinite(input.stableSeconds) && input.stableSeconds>=HARBOR_CAPTURE_LIMITS.stableSeconds &&
    Math.hypot(...input.direction)>0.01;
  const state=clone(s);
  state.exposures.push({...input,position:[...input.position],direction:[...input.direction],valid,status:'pending',analyzed:false});
  return {state,grants:[],ok:true,message:valid?'现场曝光已锁定；处理后到分析台核验。':'已曝光；本镜头不满足救生舱取证条件。'};
}

/** Runtime verifies video can play. A still image, failure or empty media ID can never become evidence. */
export function resolveHarborEvidence(s:HarborProgress,id:string,media:{
  playable:boolean; mediaId?:string; source:'generated-video'|'controlled-video'|'still'|'failed';
}):HarborResult {
  const state=clone(s), e=state.exposures.find(e=>e.id===id);
  if(!validState(s)||!e) return result(s,[],'未找到原始曝光。',false);
  if(e.status==='ready') return result(s,[],'录像已归档，不覆盖。');
  if(media.playable && media.mediaId?.trim() && (media.source==='generated-video'||media.source==='controlled-video')) {
    e.status='ready';e.source=media.source;e.mediaId=media.mediaId;
    return {state,grants:[],ok:true,message:media.source==='controlled-video'?'受控现场录像备份就绪（非AI生成）。':'录像就绪，请到分析台查看。'};
  }
  e.status='failed';
  return {state,grants:[],ok:false,message:'录像未就绪；静态图片不作为录像证据，可重试。'};
}

/** id is exposure ID, 'harbor.analysis.compare', 'harbor.analysis.card', or 'harbor.analysis.route'.
 * Caller only invokes after explicit lab action, never on generation completion or F-record. */
export function analyzeHarborEvidence(s:HarborProgress,inventory:readonly string[],id:string):HarborResult {
  if(!validState(s)) return result(s,[],'接驳港存档不匹配。',false);
  const held=new Set([...inventory,...s.grants]);
  let required:string[]=[],tokens:string[]=[];
  if(id==='harbor.analysis.compare') {required=[HARBOR.photo,HARBOR.module];tokens=[HARBOR.discrepancy];}
  else if(id==='harbor.analysis.card') {required=[HARBOR.card];tokens=[HARBOR.cardAnalyzed];}
  else if(id==='harbor.analysis.route') {required=[HARBOR.discrepancy,HARBOR.cardAnalyzed,HARBOR.routeRecord,HARBOR.searchComplete];tokens=[HARBOR.route];}
  else {
    const e=s.exposures.find(e=>e.id===id);
    if(!e?.valid || e.status!=='ready') return result(s,[],'需要有效救生舱曝光及可播放录像，不能用现场记录代替。',false);
    const r=result(s,[HARBOR.photo],'现场录像核验：救生舱仍在泊位。');
    r.state.exposures.find(e=>e.id===id)!.analyzed=true;
    return r;
  }
  const missing=required.filter(t=>!held.has(t));
  return missing.length?result(s,[],`尚缺：${missing.map(harborRequirementName).join('、')}`,false):result(s,tokens,'分析结论已归档。');
}

/** Typed attestation from owning systems. No generic arbitrary token grant API. */
export type HarborEvent = {type:'arrival-report';authorized:boolean} |
  /** Runtime attests accumulated powered retrieval reached 10s and emitted the acoustic threat.
   * Pausing/restarting and elapsed time persistence belong to the runtime, not this reducer. */
  {type:'retrieval-complete'} | {
  type:'depth-check';pressureReady:boolean;oxygenReady:boolean;energyReady:boolean;propulsionReady:boolean;
};
export function grantHarborEvent(s:HarborProgress,event:HarborEvent):HarborResult {
  if(!validState(s)) return result(s,[],'接驳港存档不匹配。',false);
  if(event.type==='arrival-report') return event.authorized?result(s,[HARBOR.permit],'调查授权已确认。'):result(s,[],'请先报告抵达并取得授权。',false);
  if(event.type==='retrieval-complete') return result(s,[HARBOR.searchComplete],'疏散记录检索完成；可在分析台核验下行路线。');
  const checks:[[boolean,string],[boolean,string],[boolean,string],[boolean,string]]=[
    [event.pressureReady,'耐压维护'],[event.oxygenReady,'氧储备'],[event.energyReady,'电力储备'],[event.propulsionReady,'推进储备']];
  const missing=checks.filter(([ready])=>!ready).map(([,name])=>name);
  if(missing.length) {
    const state=clone(s);state.grants=state.grants.filter(t=>t!==HARBOR.depthReady);
    return {state,grants:[],ok:false,message:`尚缺：${missing.join('、')}。请返回补给。`};
  }
  return result(s,[HARBOR.depthReady],'下潜准备检查通过；确认离关前须再次检查。');
}

export function harborMissingRequirements(s:HarborProgress,inventory:readonly string[]):string[] {
  const held=new Set([...inventory,...s.grants]);
  return HARBOR_EXIT_REQUIREMENTS.filter(t=>!held.has(t));
}
export function harborObjective(s:HarborProgress,inventory:readonly string[]):string {
  const held=new Set([...inventory,...s.grants]);
  const steps:[string,string][]=[
    [HARBOR.permit,'在无线电台报告抵达，取得调查授权'],[HARBOR.tool,'到岸电维修湾用机械臂回收维修工具'],
    [HARBOR.power,'操作岸电控制箱，恢复港门供电'],[HARBOR.photo,'在主港拍摄救生舱，录像就绪后到分析台核验'],
    [HARBOR.module,'到登船计量坞回收载荷模块'],[HARBOR.discrepancy,'在分析台比对救生舱录像与载荷曲线'],
    [HARBOR.searchComplete,'到E区行李检修廊完成疏散记录检索；断电后可恢复继续'],
    [HARBOR.card,'到行李检修廊回收疏散员工卡'],[HARBOR.cardAnalyzed,'在分析台读取员工卡事故档案'],
    [HARBOR.routeRecord,'到撤离分流井读取机械改道记录'],[HARBOR.route,'在分析台核验下行路线'],
    [HARBOR.exitReady,'到下潜准备坞准备出口机构'],[HARBOR.depthReady,'检查耐压、氧、电及推进储备'],
  ];
  return steps.find(([token])=>!held.has(token))?.[1]??'在下潜准备坞确认下潜至生活区';
}
