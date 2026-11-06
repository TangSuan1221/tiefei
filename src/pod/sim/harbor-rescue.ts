/** Formal harbor rescue facts. Spatial tests and actual film creation belong to the adapter. */
export type RescueZone='none'|'observe'|'power'|'lure'|'rescue'|'exit';
export type RescueEvidenceKind='threat'|'lure'|'gate'|'departure';
export interface RescueEvidence {diagnostic?:string;version:1;id:string;kind:RescueEvidenceKind;epoch:number;visible:boolean;monsterInside:boolean;gateClosed:boolean;departed:boolean;injured?:boolean;capturedAt?:number;creatureVisible?:boolean}
export interface HarborRescueState {injured:boolean;voluntary:boolean;version:1;epoch:number;signal:boolean;heard:boolean;replied:boolean;identified:boolean;warned:boolean;powered:boolean;gateOpen:boolean;gateClosed:boolean;monsterInside:boolean;lureConfirmed:boolean;isolated:boolean;verified:boolean;departing:boolean;departed:boolean;departureConfirmed:boolean;complete:boolean;failed:boolean;lureSeconds:number;holdSeconds:number;noiseSeconds:number;noiseStrikes:number;damageTotal:number;departureSeconds:number;captures:RescueEvidence[];analyzed:string[]}
export interface RescueResult {events:string[];damage:number}
export const RESCUE_TIMING=Object.freeze({lure:9,hold:180,noiseGrace:10,noiseStrike:6,damage:.10,departure:10,lureSafe:25,strikeRange:6});
const fresh=():HarborRescueState=>({injured:false,voluntary:false,version:1,epoch:0,signal:false,heard:false,replied:false,identified:false,warned:false,powered:false,gateOpen:false,gateClosed:false,monsterInside:false,lureConfirmed:false,isolated:false,verified:false,departing:false,departed:false,departureConfirmed:false,complete:false,failed:false,lureSeconds:0,holdSeconds:0,noiseSeconds:0,noiseStrikes:0,damageTotal:0,departureSeconds:0,captures:[],analyzed:[]});
const result=(...events:string[]):RescueResult=>({events,damage:0});
export class HarborRescue {
 private value=fresh();
 private pending=new Map<string,RescueEvidence>();
 get state():Readonly<HarborRescueState>{return this.snapshot();}
 snapshot():HarborRescueState{return structuredClone(this.value);}
 private resetCycle(){const s=this.value;s.epoch++;s.lureSeconds=0;s.holdSeconds=0;s.monsterInside=false;s.lureConfirmed=false;}
 listen():RescueResult{const s=this.value;if(!s.signal||s.heard||s.failed)return result();s.heard=true;return result('艾里亚斯：（录音。每隔九十秒，残余蓄电池让一台泵空转三秒，录音就卡在这三秒里）……泵站七，艾里亚斯，修泵的。一个人，断桥对面。……听见请回。小声。');}
 reply():RescueResult{const s=this.value;if(!s.heard||s.replied||s.failed)return result();s.replied=true;return result('罗温：听见了。我是事故调查员罗温，正在驾驶潜艇。你受伤了吗？','艾里亚斯：暂时没有。桥断了，你过不来。我把观察位坐标发给你，朝维修隔间拍一张，读片后告诉我外面有什么。');}
 /** Knowledge can authorize an unsafe action; it cannot make that action safe. */
 requestDeparture(){const s=this.value;if(!s.replied||!s.powered||s.failed||s.departed)return false;s.departing=true;s.voluntary=true;return true;}
 stopDeparture(){const s=this.value;if(!s.departed){s.departing=false;s.departureSeconds=0;s.voluntary=false;}}
 step(dt:number,input:{nearB:boolean;zone:RescueZone;activeSonar:boolean;monsterInside?:boolean;monsterDistance?:number;npcThreat?:boolean;chapterOne?:boolean;personnelApproaching?:boolean;revised?:boolean}):RescueResult{
  const s=this.value,out=result();if(!Number.isFinite(dt)||dt<=0||s.failed||s.complete)return out;
  if(input.nearB&&!s.signal){s.signal=true;out.events.push('被动接收机捕捉到断续的人声载波。');}
  // Integrate in bounded slices so large elapsed times cannot bypass the danger window.
  let remaining=dt;while(remaining>0&&!s.failed){const d=Math.min(.25,remaining);remaining-=d;
   const lureAllowed=s.powered&&s.gateOpen&&!s.isolated&&input.zone==='lure'&&input.activeSonar;
   if(input.monsterInside!==undefined){
    if(!s.isolated&&s.monsterInside&&!input.monsterInside){this.resetCycle();out.events.push('怪物追出货舱，之前的入仓照片已失效。重新诱导并拍摄。');}
    if(s.gateOpen&&!s.isolated&&input.monsterInside&&!s.monsterInside){s.monsterInside=true;s.holdSeconds=RESCUE_TIMING.hold;out.events.push('声源已越过货舱闸门，立即关闭主动声纳，停稳收臂后摄影。');}
   }
   else if(lureAllowed&&!s.monsterInside){s.lureSeconds+=d;if(s.lureSeconds>=RESCUE_TIMING.lure){s.monsterInside=true;s.holdSeconds=RESCUE_TIMING.hold;out.events.push('拖行声移入03货仓。先关闭主动声纳，再朝仓内曝光，确认它整个进去了。');}}
   else if(!s.monsterInside&&s.lureSeconds>0){s.lureSeconds=0;out.events.push('声源中断，怪物退回隔间附近。重新保持诱导。');}
   if(input.monsterInside===undefined&&s.monsterInside&&!s.isolated){s.holdSeconds=Math.max(0,s.holdSeconds-d);if(s.holdSeconds===0){this.resetCycle();out.events.push('艾里亚斯：它又从货仓出来了。得重新把它引进去。');}}
   const safeLure=input.monsterDistance!==undefined?input.monsterDistance>RESCUE_TIMING.strikeRange:lureAllowed&&s.lureSeconds<RESCUE_TIMING.lureSafe;
   if(lureAllowed&&s.monsterInside)s.lureSeconds+=d;
   // While the lured creature waits inside for its entry photograph the pulse is the intended action;
   // the strike clock only starts once that photograph is confirmed.
   const awaitingEntryPhoto=s.monsterInside&&!s.lureConfirmed;
   // Hull strikes and NPC encounters are separate physical outcomes.
   if((s.warned||input.chapterOne&&s.replied)&&!s.isolated&&input.activeSonar&&!safeLure&&!awaitingEntryPhoto){s.noiseSeconds+=d;const strikes=Math.max(0,Math.floor((s.noiseSeconds-RESCUE_TIMING.noiseGrace)/RESCUE_TIMING.noiseStrike)+1);if(strikes>s.noiseStrikes){const damage=(strikes-s.noiseStrikes)*RESCUE_TIMING.damage;s.noiseStrikes=strikes;s.damageTotal+=damage;out.damage+=damage;out.events.push('怪物追着主动声纳撞击艇壳！立即关闭主动声纳脉冲。');}}
   else {s.noiseSeconds=0;s.noiseStrikes=0;}
   if(s.departing&&!s.departed){
    // The jammed powered door remains in motion while the audible creature approaches.
    if(!(input.chapterOne&&input.personnelApproaching&&!s.isolated&&!s.injured&&s.departureSeconds>=1.5))s.departureSeconds+=d;
    if(!s.isolated&&!s.monsterInside&&!s.injured&&s.departureSeconds>=1.5&&input.npcThreat){
     s.injured=true;if(input.chapterOne){s.departureSeconds=0;if(input.revised){s.departing=false;s.voluntary=false;}out.events.push('（人员通道回传：门框撞响，艾里亚斯闷喊一声，退回总调度室。）');}else{s.departing=false;s.departureSeconds=0;s.voluntary=false;}
     if(!input.chapterOne)out.events.push('（水听器：栏杆猛响，呼吸声被一声闷喊打断。）','艾里亚斯：它还活着！我退回门边了……腿动不了。先把它隔开！');
    }else if(s.departureSeconds>=(s.injured?20:RESCUE_TIMING.departure)&&(!input.revised||s.isolated&&s.verified)){s.departed=true;out.events.push(input.chapterOne?'艾里亚斯：我到安全通道了，给你回传。':s.injured?'艾里亚斯：我挪进值班室了，门已经锁住。我留在这里，去不了生活区。':'艾里亚斯：我已经到内侧门后了。拍下门后的情况，我们分别往下走。');}
   }
  }return out;
 }
 interact(zone:RescueZone,activeSonar=false,chapterOne=false):RescueResult{
  const s=this.value;if(s.failed||s.complete)return result();
  if(zone==='power'){if(!s.powered){s.powered=true;return result('02配电箱恢复供电。艾里亚斯：回01打开货仓闸机，再去03开启脉冲把它引过去。');}return result('配电箱已供电。');}
  if(zone==='observe'&&s.powered&&!s.isolated){
   if(!s.gateOpen){this.resetCycle();s.gateOpen=true;s.gateClosed=false;return result('01闸机已开启。进入03货舱开启主动声纳诱导；它靠近后关闭声纳，拍下完整入仓，再退出返回这里。');}
   if(activeSonar)return result('先停止脉冲，再落闸。');
   if(!s.monsterInside)return result('闸机开着。驶入03货舱最里面，开启脉冲把它引进去。');
   if(!s.lureConfirmed){this.resetCycle();s.gateOpen=false;s.gateClosed=true;return result('艾里亚斯：它还在外面！你没有拍照确认就关门了。重新开闸，再引一次。');}
   s.epoch++;s.gateOpen=false;s.gateClosed=true;s.isolated=true;return result('闸机落下，怪物留在货仓。拍摄关闭的闸门与仓内目标，回分析台核验。');
  }
  if(zone==='observe')return result(s.powered?'货仓闸机已落下锁定。':'01闸机面板没有电，需先恢复02配电箱供电。');
  if(zone==='rescue'){if(!s.verified)return result('尚未核验怪物隔离结果，不能让艾里亚斯离开。');if(!s.departing){s.departing=true;return result('内侧逃生门接通。艾里亚斯：我沿里面的路走，你留在艇里。');}return result();}
  if(zone==='exit'){if(!s.departureConfirmed)return result('需要核验艾里亚斯撤离的结果片。');s.complete=true;return result(chapterOne&&s.injured?'艾里亚斯包扎肩伤后沿人员通道继续前进，生活区末端会合。':s.injured?'艾里亚斯留在锁好的值班室休息，罗温继续前往生活区。':'艾里亚斯已真实脱困，双方沿各自通道继续前进。');}
  return result();
 }
 /** Reopening removes current isolation, but does not tell the off-screen companion. */
 reopenCargo(){const s=this.value;if(!s.isolated||s.departureConfirmed||s.complete)return false;s.isolated=false;s.verified=false;s.gateClosed=false;s.gateOpen=true;this.resetCycle();return true;}
 capture(id:string,kind:RescueEvidenceKind,visible:boolean,diagnostic?:string,capturedAt?:number,creatureVisible?:boolean):RescueEvidence{
  const s=this.value,old=s.captures.find(e=>e.id===id)??this.pending.get(id);if(old)return structuredClone(old);
  const allowed=kind==='threat'?s.replied:kind==='lure'?s.monsterInside&&s.gateOpen:kind==='gate'?s.isolated: s.departed;
  const e:RescueEvidence={diagnostic,...(creatureVisible!==undefined?{creatureVisible}:{}),...(capturedAt!==undefined?{capturedAt}:{}),version:1,id,kind,epoch:s.epoch,visible:visible&&allowed&&!s.failed,monsterInside:s.monsterInside,gateClosed:s.gateClosed,departed:s.departed,injured:s.injured};
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
  const s=this.value,stored=s.captures.find(x=>x.id===e.id);const current=e.epoch===s.epoch||e.kind==='lure'&&!s.complete&&s.isolated&&e.epoch===s.epoch-1;if(s.failed||!stored||JSON.stringify(stored)!==JSON.stringify(e)||!e.visible||!current)return result('该片未覆盖当前目标，或现场已经改变；需要重新曝光。');
  if(s.analyzed.includes(e.id))return result('这份录像已经核验。');s.analyzed.push(e.id);
  if(e.kind==='threat'&&e.creatureVisible===false)return result('本卷记录了人物与场景，未拍到可确认的生物；不能据此判断怪物已经离开或死亡。');
  if(e.kind==='threat'&&s.replied&&!s.identified){s.identified=true;s.warned=true;return result('现场录像已核验：艾里亚斯附近存在只能在摄影记录中看见的生物。');}
  if(e.kind==='gate'&&e.gateClosed&&e.monsterInside&&s.isolated){s.verified=true;return result('录像确认闸机闭合，怪物隔离在仓内，外侧通路清空。可以接通内侧逃生门。');}
  if(e.kind==='departure'&&e.departed&&s.departed){s.departureConfirmed=true;return result('结果片确认艾里亚斯已经走到内侧门后；断桥依然分隔两条路线。');}
  return result(e.kind==='lure'?'曝光确认怪物完全进入03货仓。':'录像已归档。');
 }
 /** Only a validated remote safety-room video may call this in the simplified route. */
 confirmRemoteDeparture(chapterOne=false){const s=this.value;if((!chapterOne&&(!s.verified||s.injured))||!s.departed||s.failed)return false;s.departureConfirmed=true;return true;}
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s={injured:false,voluntary:false,...value} as HarborRescueState,base=fresh();
  for(const k of Object.keys(base) as (keyof HarborRescueState)[]){const v=s[k];if(typeof base[k]==='boolean'&&typeof v!=='boolean')return false;if(typeof base[k]==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<0))return false;}
  if(s.version!==1||!Number.isInteger(s.epoch)||!Number.isInteger(s.noiseStrikes)||!Array.isArray(s.captures)||!Array.isArray(s.analyzed))return false;
  if((s.injured&&!s.powered)||(s.voluntary&&(!s.powered||!s.departing)))return false;
  if(s.captures.some(e=>!e||(e.creatureVisible!==undefined&&typeof e.creatureVisible!=='boolean')||(e.injured!==undefined&&typeof e.injured!=='boolean')||(e.capturedAt!==undefined&&(!Number.isFinite(e.capturedAt)||e.capturedAt<0))))return false;
  if((s.heard&&!s.signal)||(s.replied&&!s.heard)||(s.identified&&!s.replied)||s.warned!==s.identified||(s.gateOpen&&s.gateClosed)||((s.gateOpen||s.gateClosed)&&!s.powered)||(s.monsterInside&&!s.powered)||(s.isolated&&(!s.gateClosed||!s.monsterInside))||(s.verified&&!s.isolated)||(s.departing&&!s.verified&&!s.voluntary)||(s.departed&&!s.departing)||(s.departureConfirmed&&!s.departed)||(s.complete&&!s.departureConfirmed))return false;
  const ids=new Set<string>();for(const e of s.captures){if(!e||e.version!==1||typeof e.id!=='string'||!e.id||ids.has(e.id)||!['threat','lure','gate','departure'].includes(e.kind)||!Number.isInteger(e.epoch)||e.epoch<0||e.epoch>s.epoch||['visible','monsterInside','gateClosed','departed'].some(k=>typeof e[k as keyof RescueEvidence]!=='boolean'))return false;ids.add(e.id);}
  if(s.analyzed.some(id=>typeof id!=='string'||!ids.has(id))||new Set(s.analyzed).size!==s.analyzed.length)return false;
  if(s.lureConfirmed&&!s.captures.some(e=>e.kind==='lure'&&e.visible&&(e.epoch===s.epoch||s.isolated&&e.epoch===s.epoch-1)))return false;
  this.value=structuredClone(s);this.pending.clear();return true;
 }
}

