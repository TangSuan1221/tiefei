/** Formal harbor rescue facts. Spatial tests and actual film creation belong to the adapter. */
export type RescueZone='none'|'observe'|'power'|'lure'|'rescue'|'exit';
export type RescueEvidenceKind='threat'|'lure'|'gate'|'departure';
export interface RescueEvidence {diagnostic?:string;version:1;id:string;kind:RescueEvidenceKind;epoch:number;visible:boolean;monsterInside:boolean;gateClosed:boolean;departed:boolean}
export interface HarborRescueState {version:1;epoch:number;signal:boolean;heard:boolean;replied:boolean;identified:boolean;warned:boolean;powered:boolean;gateOpen:boolean;gateClosed:boolean;monsterInside:boolean;lureConfirmed:boolean;isolated:boolean;verified:boolean;departing:boolean;departed:boolean;departureConfirmed:boolean;complete:boolean;failed:boolean;lureSeconds:number;holdSeconds:number;noiseSeconds:number;noiseStrikes:number;damageTotal:number;departureSeconds:number;captures:RescueEvidence[];analyzed:string[]}
export interface RescueResult {events:string[];damage:number}
export const RESCUE_TIMING=Object.freeze({lure:9,hold:180,noiseGrace:10,noiseStrike:6,damage:.10,departure:10,lureSafe:25,strikeRange:6});
const fresh=():HarborRescueState=>({version:1,epoch:0,signal:false,heard:false,replied:false,identified:false,warned:false,powered:false,gateOpen:false,gateClosed:false,monsterInside:false,lureConfirmed:false,isolated:false,verified:false,departing:false,departed:false,departureConfirmed:false,complete:false,failed:false,lureSeconds:0,holdSeconds:0,noiseSeconds:0,noiseStrikes:0,damageTotal:0,departureSeconds:0,captures:[],analyzed:[]});
const result=(...events:string[]):RescueResult=>({events,damage:0});
export class HarborRescue {
 private value=fresh();
 private pending=new Map<string,RescueEvidence>();
 get state():Readonly<HarborRescueState>{return this.snapshot();}
 snapshot():HarborRescueState{return structuredClone(this.value);}
 private resetCycle(){const s=this.value;s.epoch++;s.lureSeconds=0;s.holdSeconds=0;s.monsterInside=false;s.lureConfirmed=false;}
 listen():RescueResult{const s=this.value;if(!s.signal||s.heard||s.failed)return result();s.heard=true;return result('艾里亚斯：（录音。每隔九十秒，残余蓄电池让一台泵空转三秒，录音就卡在这三秒里）……泵站七，艾里亚斯，修泵的。一个人，断桥对面。……听见请回。小声。');}
 reply():RescueResult{const s=this.value;if(!s.heard||s.replied||s.failed)return result();s.replied=true;return result('罗温：听见了。我是事故调查员罗温，正在驾驶潜艇。你受伤了吗？','艾里亚斯：暂时没有。桥断了，你过不来。我把观察位坐标发给你，朝维修隔间拍一张，读片后告诉我外面有什么。');}
 step(dt:number,input:{nearB:boolean;zone:RescueZone;activeSonar:boolean;monsterInside?:boolean;monsterDistance?:number}):RescueResult{
  const s=this.value,out=result();if(!Number.isFinite(dt)||dt<=0||s.failed||s.complete)return out;
  if(input.nearB&&!s.signal){s.signal=true;out.events.push('被动接收机捕捉到断续的人声载波。');}
  // Integrate in bounded slices so large elapsed times cannot bypass the danger window.
  let remaining=dt;while(remaining>0&&!s.failed){const d=Math.min(.25,remaining);remaining-=d;
   const lureAllowed=s.powered&&s.gateOpen&&!s.isolated&&input.zone==='lure'&&input.activeSonar;
   if(input.monsterInside!==undefined){
    if(!s.isolated&&s.monsterInside&&!input.monsterInside){this.resetCycle();out.events.push('怪物追出货舱，之前的入仓照片已失效。重新诱导并拍摄。');}
    if(s.gateOpen&&!s.isolated&&input.monsterInside&&!s.monsterInside){s.monsterInside=true;s.holdSeconds=RESCUE_TIMING.hold;out.events.push('声源已越过货舱闸门，拍摄确认后停发主动脉冲。');}
   }
   else if(lureAllowed&&!s.monsterInside){s.lureSeconds+=d;if(s.lureSeconds>=RESCUE_TIMING.lure){s.monsterInside=true;s.holdSeconds=RESCUE_TIMING.hold;out.events.push('拖行声移入03货仓。艇首朝仓内曝光，确认它整个进去了。');}}
   else if(!s.monsterInside&&s.lureSeconds>0){s.lureSeconds=0;out.events.push('声源中断，怪物退回隔间附近。重新保持诱导。');}
   if(input.monsterInside===undefined&&s.monsterInside&&!s.isolated){s.holdSeconds=Math.max(0,s.holdSeconds-d);if(s.holdSeconds===0){this.resetCycle();out.events.push('艾里亚斯：它又从货仓出来了。得重新把它引进去。');}}
   const safeLure=input.monsterDistance!==undefined?input.monsterDistance>RESCUE_TIMING.strikeRange:lureAllowed&&s.lureSeconds<RESCUE_TIMING.lureSafe;
   if(lureAllowed&&s.monsterInside)s.lureSeconds+=d;
   // While the lured creature waits inside for its entry photograph the pulse is the intended action;
   // the strike clock only starts once that photograph is confirmed.
   const awaitingEntryPhoto=s.monsterInside&&!s.lureConfirmed;
   // Strikes damage the hull only; the rescue fails solely by not isolating the creature.
   if(s.warned&&!s.isolated&&input.activeSonar&&!safeLure&&!awaitingEntryPhoto){s.noiseSeconds+=d;const strikes=Math.max(0,Math.floor((s.noiseSeconds-RESCUE_TIMING.noiseGrace)/RESCUE_TIMING.noiseStrike)+1);if(strikes>s.noiseStrikes){const damage=(strikes-s.noiseStrikes)*RESCUE_TIMING.damage;s.noiseStrikes=strikes;s.damageTotal+=damage;out.damage+=damage;out.events.push('怪物追着主动声纳撞击艇壳！立即停止脉冲，屏幕可保持通电。');}}
   else {s.noiseSeconds=0;s.noiseStrikes=0;}
   if(s.departing&&!s.departed){s.departureSeconds+=d;if(s.departureSeconds>=RESCUE_TIMING.departure){s.departed=true;out.events.push('艾里亚斯：我已经到内侧门后了。拍下门后的情况，我们分别往下走。');}}
  }return out;
 }
 interact(zone:RescueZone,activeSonar=false):RescueResult{
  const s=this.value;if(s.failed||s.complete)return result();
  if(zone==='power'){if(!s.identified)return result('先核验断桥另一侧的摄影记录。');if(!s.powered){s.powered=true;return result('02配电箱恢复供电。艾里亚斯：回01打开货仓闸机，再去03开启脉冲把它引过去。');}return result('配电箱已供电。');}
  if(zone==='observe'&&s.powered&&!s.isolated){
   if(!s.gateOpen){this.resetCycle();s.gateOpen=true;s.gateClosed=false;return result('01闸机已开启。去03开启脉冲，拍下怪物完全入仓，再停止脉冲返回这里。');}
   if(activeSonar)return result('先停止脉冲，再落闸。');
   if(!s.monsterInside)return result('闸机开着。驶入03货舱最里面，开启脉冲把它引进去。');
   if(!s.lureConfirmed){this.resetCycle();s.gateOpen=false;s.gateClosed=true;return result('艾里亚斯：它还在外面！你没有拍照确认就关门了。重新开闸，再引一次。');}
   s.epoch++;s.gateOpen=false;s.gateClosed=true;s.isolated=true;return result('闸机落下，怪物留在货仓。拍摄关闭的闸门与仓内目标，回分析台核验。');
  }
  if(zone==='observe')return result(s.powered?'货仓闸机已落下锁定。':'01闸机面板没有电，需先恢复02配电箱供电。');
  if(zone==='rescue'){if(!s.verified)return result('尚未核验怪物隔离结果，不能让艾里亚斯离开。');if(!s.departing){s.departing=true;return result('内侧逃生门接通。艾里亚斯：我沿里面的路走，你留在艇里。');}return result();}
  if(zone==='exit'){if(!s.departureConfirmed)return result('需要核验艾里亚斯撤离的结果片。');s.complete=true;return result('艾里亚斯已真实脱困，双方沿各自通道继续前进。');}
  return result();
 }
 capture(id:string,kind:RescueEvidenceKind,visible:boolean,diagnostic?:string):RescueEvidence{
  const s=this.value,old=s.captures.find(e=>e.id===id)??this.pending.get(id);if(old)return structuredClone(old);
  const allowed=kind==='threat'?s.replied:kind==='lure'?s.monsterInside&&s.gateOpen:kind==='gate'?s.isolated: s.departed;
  const e:RescueEvidence={diagnostic,version:1,id,kind,epoch:s.epoch,visible:visible&&allowed&&!s.failed,monsterInside:s.monsterInside,gateClosed:s.gateClosed,departed:s.departed};
  this.pending.set(id,e);return structuredClone(e);
 }
 /** Commit only after the uninterrupted exposure finishes; facts remain those at shutter-open. */
 commitCapture(e:RescueEvidence):RescueResult{
  const s=this.value,pending=this.pending.get(e.id);
  if(!pending||JSON.stringify(pending)!==JSON.stringify(e)||s.failed)return result();
  this.pending.delete(e.id);s.captures.push(structuredClone(e));
  if(e.visible&&e.kind==='lure'&&e.epoch===s.epoch&&s.monsterInside&&s.gateOpen)s.lureConfirmed=true;
  return result();
 }
 cancelCapture(id:string){this.pending.delete(id);

 }
 /** Explicit radio confirmation authorizes departure after the actual closed
  * gate and this cycle's entry photograph. It does not invent an analyzed film. */
 confirmIsolation(){const s=this.value;if(s.failed||!s.isolated||!s.gateClosed||!s.monsterInside||!s.lureConfirmed||!s.captures.some(e=>e.kind==='lure'&&e.visible&&e.monsterInside&&e.epoch===s.epoch-1))return false;s.verified=true;return true;}
 analyze(e:RescueEvidence):RescueResult{
  const s=this.value,stored=s.captures.find(x=>x.id===e.id);if(s.failed||!stored||JSON.stringify(stored)!==JSON.stringify(e)||!e.visible||e.epoch!==s.epoch)return result('该片未覆盖当前目标，或现场已经改变；需要重新曝光。');
  if(s.analyzed.includes(e.id))return result('这份录像已经核验。');s.analyzed.push(e.id);
  if(e.kind==='threat'&&s.replied&&!s.identified){s.identified=true;s.warned=true;return result('现场录像已核验：艾里亚斯附近存在只能在摄影记录中看见的生物。');}
  if(e.kind==='gate'&&e.gateClosed&&e.monsterInside&&s.isolated){s.verified=true;return result('录像确认闸机闭合，怪物隔离在仓内，外侧通路清空。可以接通内侧逃生门。');}
  if(e.kind==='departure'&&e.departed&&s.departed){s.departureConfirmed=true;return result('结果片确认艾里亚斯已经走到内侧门后；断桥依然分隔两条路线。');}
  return result(e.kind==='lure'?'曝光确认怪物完全进入03货仓。':'录像已归档。');
 }
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s=value as HarborRescueState,base=fresh();
  for(const k of Object.keys(base) as (keyof HarborRescueState)[]){const v=s[k];if(typeof base[k]==='boolean'&&typeof v!=='boolean')return false;if(typeof base[k]==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<0))return false;}
  if(s.version!==1||!Number.isInteger(s.epoch)||!Number.isInteger(s.noiseStrikes)||!Array.isArray(s.captures)||!Array.isArray(s.analyzed))return false;
  if((s.heard&&!s.signal)||(s.replied&&!s.heard)||(s.identified&&!s.replied)||s.warned!==s.identified||(s.powered&&!s.identified)||(s.gateOpen&&s.gateClosed)||((s.gateOpen||s.gateClosed)&&!s.powered)||(s.monsterInside&&!s.powered)||(s.isolated&&(!s.gateClosed||!s.monsterInside))||(s.verified&&!s.isolated)||(s.departing&&!s.verified)||(s.departed&&!s.departing)||(s.departureConfirmed&&!s.departed)||(s.complete&&!s.departureConfirmed))return false;
  const ids=new Set<string>();for(const e of s.captures){if(!e||e.version!==1||typeof e.id!=='string'||!e.id||ids.has(e.id)||!['threat','lure','gate','departure'].includes(e.kind)||!Number.isInteger(e.epoch)||e.epoch<0||e.epoch>s.epoch||['visible','monsterInside','gateClosed','departed'].some(k=>typeof e[k as keyof RescueEvidence]!=='boolean'))return false;ids.add(e.id);}
  if(s.analyzed.some(id=>typeof id!=='string'||!ids.has(id))||new Set(s.analyzed).size!==s.analyzed.length)return false;
  if(s.lureConfirmed&&!s.captures.some(e=>e.kind==='lure'&&e.visible&&(e.epoch===s.epoch||s.isolated&&e.epoch===s.epoch-1)))return false;
  this.value=structuredClone(s);this.pending.clear();return true;
 }
}

