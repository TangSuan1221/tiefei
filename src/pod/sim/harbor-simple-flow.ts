import {HarborLegacyFlow} from './harbor-legacy-flow';
import {HARBOR_TASKS,type HarborTaskId} from '../content/harbor-task-videos';
import type {NarrativeMemory} from './narrative-memory';
export interface HarborFlowWorld {firstDoor:boolean;secondDoor:boolean;active:boolean;atExit:boolean;inCargo:boolean;hull:number;kit:boolean}
/** R28 owns sequencing; physical and photographic facts remain in HarborRescue. */
export class HarborSimpleFlow extends HarborLegacyFlow {
 legacy=false;
 world:HarborFlowWorld={firstDoor:false,secondDoor:false,active:true,atExit:false,inCargo:false,hull:1,kit:false};
 impactCount=0;impactDelay=0;kitStored=false;repairCompleted=false;repairWait=0;backgroundRequested=false;explanationRequested=false;
 injuryHandled=false;private earlyWarning=false;
 /** The player has tried the second door; its controller forwards the request to Elias. */
 codeRequested=false;
 private warningVariant:HarborTaskId|null=null;
 private reminderVariant:HarborTaskId|null=null;
 private has(id:string){return this.accepted.includes(id as HarborTaskId);}
 get credential(){return this.legacy||this.has('L1-R28-V02-AUTH');}
 get warningSeen(){return this.legacy||this.has('L1-R28-V03')||this.has('L1-R28-V03-QUIET');}
 get repairBriefSeen(){return this.has('L1-R28-V04');}
 get threatEnabled(){return this.legacy||this.impactCount===2&&this.warningSeen;}
 get entryCaptured(){const s=this.rescue.state;return s.lureConfirmed&&s.captures.some(e=>e.kind==='lure'&&e.visible&&e.creatureVisible!==false&&(e.epoch===s.epoch||s.isolated&&e.epoch===s.epoch-1));}
 override get entryAnalyzed(){if(this.legacy)return super.entryAnalyzed;const s=this.rescue.state;return this.entryCaptured&&s.captures.some(e=>e.kind==='lure'&&e.visible&&s.analyzed.includes(e.id)&&(e.epoch===s.epoch||s.isolated&&e.epoch===s.epoch-1));}
 sync(world:HarborFlowWorld){this.world={...world};}
 override get pending():HarborTaskId|null {
  if(this.legacy)return super.pending;
  const s=this.rescue.state;if(s.failed||s.complete||!this.world.firstDoor)return null;
  if(!this.has('L1-R28-V01'))return 'L1-R28-V01';
  if(!this.greeted)return null;
  if(!this.has('L1-R28-V02'))return 'L1-R28-V02';
  if(!this.has('L1-R28-V02-AUTH'))return this.codeRequested?'L1-R28-V02-AUTH':null;
  if(!this.has('L1-R28-V02A'))return this.backgroundRequested||this.world.secondDoor?'L1-R28-V02A':null;
  if(!this.warningSeen)return this.impactCount===2||this.earlyWarning?(this.warningVariant??=this.world.active?'L1-R28-V03':'L1-R28-V03-QUIET'):null;
  if(this.explanationRequested&&!this.has('L1-R28-V03A'))return 'L1-R28-V03A';
  if(this.impactCount<2||this.world.active&&!this.repairBriefSeen)return null;
  if(!this.repairBriefSeen)return 'L1-R28-V04';
  if(!this.repairCompleted)return this.repairWait>=90&&!this.has('L1-R28-V04R')&&!this.has('L1-R28-V04R-STORED')?(this.reminderVariant??=this.world.kit?'L1-R28-V04R-STORED':'L1-R28-V04R'):null;
  if(!this.has('L1-R28-V05'))return 'L1-R28-V05';
  if(s.injured&&!this.injuryHandled&&!this.has('L1-R28-V07R'))return 'L1-R28-V07R';
  if(s.monsterInside&&!this.world.active&&!this.has('L1-R28-V06'))return 'L1-R28-V06';
  if(this.entryCaptured&&this.world.atExit&&!this.world.inCargo&&!this.has('L1-R28-V07'))return 'L1-R28-V07';
  if(s.departed&&s.isolated&&s.verified&&this.entryAnalyzed&&this.reportAnswered&&!this.has('L1-R28-V08')&&!this.has('L1-R28-V08-INJURED'))return s.injured?'L1-R28-V08-INJURED':'L1-R28-V08';
  return null;
 }
 override accept(id:HarborTaskId){
  if(this.legacy)return super.accept(id);
  const pending=this.pending;
  // A device may change while the selected clip is generating or playing.
  // Both variants deliver the same stage; never strand a received clip.
  const family=(value:HarborTaskId|null)=>value?.replace(/-(QUIET|STORED)$/,'');
  if(pending!==id&&(!pending||family(pending)!==family(id)))return false;
  if(id.startsWith('L1-R28-V08')&&!this.rescue.confirmRemoteDeparture(true))return false;
  this.accepted.push(id);if(id==='L1-R28-V01')this.rescue.reply();
  if(id==='L1-R28-V07R'){this.injuryHandled=true;this.reportAnswered=false;this.rescue.stopDeparture();}return true;
 }
 tick(dt:number,mediaBusy=false){
  if(this.legacy)return 0;let strikes=0;
  if(this.has('L1-R28-V02A')&&this.impactCount<2){this.impactDelay-=dt;if(this.impactDelay<=0){this.impactCount++;this.impactPlayed=true;this.impactDelay=2;strikes=1;}}
  if(this.repairBriefSeen&&!this.repairCompleted&&!mediaBusy)this.repairWait+=dt;return strikes;
 }
 override takeImpact(){return this.legacy?super.takeImpact():false;}
 requestCode(){this.codeRequested=true;}
 finishRepair(){if(!this.repairBriefSeen||!this.world.kit)return false;this.repairCompleted=true;return true;}
 identify(){if(this.has('L1-R28-V01')){this.greeted=true;return true;}return false;}
 reportEvidence(){const s=this.rescue.state;if(!this.awaitingReport||!s.verified||!this.entryAnalyzed)return false;this.reportAnswered=this.rescue.requestDeparture();return this.reportAnswered;}
 override get canPhotograph(){return this.legacy?super.canPhotograph:this.has('L1-R28-V06');}
 override get canHelp(){return this.legacy?super.canHelp:this.has('L1-R28-V05');}
 override get awaitingReport(){return this.legacy?super.awaitingReport:this.has('L1-R28-V07')&&!this.reportAnswered;}
 override say(raw:string,m:NarrativeMemory,active:boolean,at:number){
  if(this.legacy)return super.say(raw,m,active,at);
  const text=raw.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,240);if(!text)return [];
  // Elias names himself in V02; before that the caller is unnamed.
  const reply=(line:string)=>['罗温：'+text,(this.has('L1-R28-V02')?'艾里亚斯：':'呼叫者：')+line];
  if(!this.has('L1-R28-V01'))return reply('我还在呼叫，先接通这段视频。');this.greeted=true;
  if(/先别|别出|不要出|等等|等我|先等|停下|退回|不确定|不安全|没(?:有)?(?:关|锁|封|成功|完成)|没好|还没|尚未|未关|不能走|别走|不要走|又开|开着|再开|hold|wait|unsafe|not\s+(?:safe|closed|ready|done)|don't\s+(?:go|leave)|stop/i.test(text)){
   this.rescue.stopDeparture();this.reportAnswered=false;m.lastOrder='hold';return reply('好，我先留在门后。你确认好了再叫我。');
  }
  if(this.has('L1-R28-V02')&&!this.credential&&/门|door/i.test(text))return reply(this.codeRequested?'我在终端上看到你的开门请求了，这就发给你。':'第二道门的门控在你那边。你先到门边看看面板怎么说。');
  if(!this.has('L1-R28-V02A')&&this.credential){this.backgroundRequested=true;return reply('我给你说说刚到这里时发生的事。');}
  if(this.impactCount>0&&!this.warningSeen)this.earlyWarning=true;
  if(this.warningSeen&&/声[纳呐]|声音|追声|sonar|why|什么.*(?:怪物|东西)|(?:怪物|东西).*什么/i.test(text)){this.explanationRequested=true;return reply('我把知道的情况发给你，先留意主动声纳电源。');}
  if(/对不起|抱歉/.test(text))return reply('我听到了。先确认闸门，后面的事我们慢慢说。');
  if(/[?？]|吗|如果|等会|将要|准备|打算|应该|可能|似乎/.test(text))return reply('我看不到货舱那边。你是已经确认它在里面，还是还需要我等？');
  if(this.awaitingReport&&/关|锁|封|妥|完成|成功|搞定|安全|走吧|可以走|出来|closed|safe|done/i.test(text)){
   this.reportAnswered=this.rescue.requestDeparture();m.lastOrder='go';m.beliefSource='罗温的口头报告';
   return reply(this.reportAnswered?'收到。我开始推人员闸门，门轴会有声音。有变化马上叫我停下。':'我先留在门后等你完成准备。');
  }
  if(/怕|吓|撤退|回去|救命/.test(text))return reply('我也怕。你先停稳，别硬闯。我留在门后等你。');
  return reply(this.awaitingReport?'我没听清你那边的情况。你确认好了再告诉我，也可以把核验的结果片发给我。':'听见了，频道留着。');
 }
 override get objective(){
  if(this.legacy)return super.objective;const s=this.rescue.state;
  if(s.complete)return '首关完成 · 操作台按 B 下潜至生活区深度1040米';
  if(!this.world.firstDoor)return '打开第一道压力门 · 入口X11 Y16 深度1012米 · 对准门靠近至3.4米内，按F一次开门';
  // Objectives only restate videos already watched; an unwatched call shows who is calling, never what it says. Elias names himself in V02.
  if(this.pending)return (this.has('L1-R28-V02')?'艾里亚斯来电':'收到视频呼叫')+' · 分析台【通讯】接听并完整播放；失败可点“重新接收”';
  if(!this.greeted)return '回应求救呼叫 · 自由通话或在分析台【通讯】发送任务身份资料';
  if(!this.credential)return '前往第二道压力门 · 沿维修弯道到门边，对准门锁靠近至3.4米内按F查看门控';
  if(!this.has('L1-R28-V02A'))return '第二道门密码已接收 · 回到门边按F，在门控面板拨好密码并解锁';
  if(!this.warningSeen)return '艇壳受到撞击';
  if(this.impactCount<2)return '艇壳受到撞击 · 关闭主动声纳电源';
  if(!this.repairBriefSeen)return '立即关闭主动声纳电源'+(this.has('L1-R28-V03A')?' · 通电会持续发声':'');
  if(!this.repairCompleted)return this.world.kit?'维修工具已收妥 · 在分析台【通讯】执行修复铁鲸':'前往X42 Y28 深度1012米岸电恢复台 · 对准恢复台按F，机械臂取出维修工具并自动收回';
  if(s.departed)return this.has('L1-R28-V08')||this.has('L1-R28-V08-INJURED')?'前往下潜控制点X60 Y27 深度1012米 · 操作01确认，按B下潜至生活区1040米':'艾里亚斯已离开总调度室 · 等待他的回传';
  if(s.departing)return '艾里亚斯正在经过人员通道 · 危险变化时随时叫停';
  if(s.isolated&&!s.verified)return '拍摄关闭的闸门与仓内目标，在分析台核验隔离结果 · 控制点X60 Y27 深度1012米';
  if(s.isolated&&!this.entryAnalyzed)return '在分析台核验入仓录像 · 上传资料将封存等待上行';
  if(this.awaitingReport&&s.isolated)return '确认隔离结果后自由报告，或在通讯页推送核验结果片';
  if(!s.gateOpen&&!s.isolated)return '总任务：封闭货舱 · 控制点X60 Y27 深度1012米\n当前步骤：先打开货舱闸门，再潜入X77 Y7 深度1011米';
  if(!this.entryCaptured)return '总任务：封闭货舱 · 关闸点X60 Y27 深度1012米\n当前步骤：潜入X77 Y7 深度1011米，开主动声纳诱导；它靠近后立即关电'+(this.canPhotograph?'、停稳摄影':'');
  return '第三任务：悄悄退出货舱，回X60 Y27 深度1012米，在01控制台关闸 · 显影期间可以撤离';
 }
 override snapshot():any{return this.legacy?super.snapshot():{version:3,accepted:[...this.accepted],greeted:this.greeted,impactCount:this.impactCount,impactDelay:this.impactDelay,kitStored:this.kitStored,repairCompleted:this.repairCompleted,repairWait:this.repairWait,backgroundRequested:this.backgroundRequested,explanationRequested:this.explanationRequested,injuryHandled:this.injuryHandled,codeRequested:this.codeRequested,reportAnswered:this.reportAnswered,earlyWarning:this.earlyWarning,warningVariant:this.warningVariant,reminderVariant:this.reminderVariant};}
 override restore(value:unknown){
  const v=value as ReturnType<HarborSimpleFlow['snapshot']>;
  if(v?.version!==3){const ok=super.restore(value);if(ok)this.legacy=true;return ok;}
  if(!Array.isArray(v.accepted)||new Set(v.accepted).size!==v.accepted.length||v.accepted.some((id:string)=>!id.startsWith('L1-R28-')||!(id in HARBOR_TASKS)))return false;
  for(const k of ['greeted','kitStored','repairCompleted','backgroundRequested','explanationRequested','injuryHandled','reportAnswered','earlyWarning'])if(typeof v[k]!=='boolean')return false;
  // Saves from before 2026-11-03 lack codeRequested: the player tries the door again.
  if(v.codeRequested!==undefined&&typeof v.codeRequested!=='boolean')return false;
  if(!Number.isInteger(v.impactCount)||v.impactCount<0||v.impactCount>2||!Number.isFinite(v.impactDelay)||!Number.isFinite(v.repairWait)||v.repairWait<0)return false;
  if(v.warningVariant!=null&&!['L1-R28-V03','L1-R28-V03-QUIET'].includes(v.warningVariant)||v.reminderVariant!=null&&!['L1-R28-V04R','L1-R28-V04R-STORED'].includes(v.reminderVariant))return false;
  const has=(id:string)=>v.accepted.includes(id);
  if(v.accepted.length&&!has('L1-R28-V01')||v.impactCount&&!has('L1-R28-V02A')||v.repairCompleted&&!has('L1-R28-V04')||has('L1-R28-V05')&&!v.repairCompleted||v.reportAnswered&&!has('L1-R28-V07')||v.injuryHandled&&!this.rescue.state.injured)return false;
  this.warningVariant=v.warningVariant??null;this.reminderVariant=v.reminderVariant??null;this.codeRequested=v.codeRequested??false;
  this.legacy=false;this.accepted.splice(0,this.accepted.length,...v.accepted);for(const k of ['greeted','impactCount','impactDelay','kitStored','repairCompleted','repairWait','backgroundRequested','explanationRequested','injuryHandled','reportAnswered','earlyWarning'] as const)(this as any)[k]=v[k];this.impactPlayed=v.impactCount>0;return true;
 }
}
