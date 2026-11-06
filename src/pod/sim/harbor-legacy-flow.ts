import type {HarborRescue} from './harbor-rescue';
import {HARBOR_TASKS,type HarborTaskId} from '../content/harbor-task-videos';
import {parseNarrative,plantSeeds,type NarrativeMemory} from './narrative-memory';
const INTRO:HarborTaskId[]=['L1-E01','L1-E04','L1-E05','L1-E06','L1-E02'];
/** Physical facts remain in HarborRescue; words never manufacture photographic evidence. */
export class HarborLegacyFlow {
 readonly accepted:HarborTaskId[]=[];
 greeted=false;impactPlayed=false;reportRequested=false;reportAnswered=false;
 private rewarded:string[]=[];
 constructor(readonly rescue:HarborRescue){}
 get pending():HarborTaskId|null {
  for(const id of INTRO){if(!this.accepted.includes(id)){if(id==='L1-E04'&&!this.greeted||id==='L1-E02'&&!this.impactPlayed)return null;return id;}}
  const s=this.rescue.state;
  if((this.reportRequested||s.isolated)&&!this.accepted.includes('L1-E07'))return 'L1-E07';
  if(s.injured&&!this.accepted.includes('L1-E08'))return 'L1-E08';
  if(s.departed&&!this.accepted.includes('L1-E03'))return 'L1-E03';return null;
 }
 accept(id:HarborTaskId){if(this.pending!==id||this.rescue.state.failed||id==='L1-E01'&&!this.rescue.state.heard)return false;if(id==='L1-E03'&&!this.rescue.confirmRemoteDeparture(true))return false;this.accepted.push(id);if(id==='L1-E01')this.rescue.reply();return true;}
 takeImpact(){if(!this.accepted.includes('L1-E06')||this.impactPlayed)return false;this.impactPlayed=true;return true;}
 get canPhotograph(){return this.accepted.includes('L1-E01');}
 get canHelp(){return this.accepted.includes('L1-E02');}
 get entryAnalyzed(){const s=this.rescue.state;return s.captures.some(e=>e.kind==='lure'&&e.visible&&e.creatureVisible===true&&e.epoch===s.epoch&&s.analyzed.includes(e.id));}
 get awaitingReport(){return this.accepted.includes('L1-E07')&&!this.reportAnswered;}
 say(raw:string,m:NarrativeMemory,active:boolean,at:number){
  const text=raw.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,240);if(!text)return [];
  const out=['罗温：'+text],s=this.rescue.state;
  const respond=(v:string)=>[...out,'艾里亚斯：'+v];
  if(!this.accepted.includes('L1-E01'))return respond('先收一下我发的接驳岗录像，坐标在里面。我听着。');
  this.greeted=true;
  const intent=parseNarrative(text),question=/[?？]|吗|怎么|为什么|什么|谁|哪里/.test(text);
  out.push(...plantSeeds(m,intent,'elias',text));
  const reward=(id:string,amount:number)=>{if(!this.rewarded.includes(id)){this.rewarded.push(id);m.trust=Math.max(-3,Math.min(3,m.trust+amount));}};
  if(intent.order==='hold'||(!question&&!intent.ambiguous&&/没完成|没成功|不确定|没关|等我/.test(text))||/(?:^|[，,。；;！!])\s*(?:先别走|别出来|不要出来|停下|等一下|等等|先等|退回)[^？?]*(?:[，,。；;！!]|$)/.test(text)){
   this.rescue.stopDeparture();this.reportAnswered=false;m.lastOrder='hold';reward('honest',1);
   return respond('好，我停下，退回门后等你。'+(/声纳/.test(text)?'主动声纳要在导航台关电；被动接收留着。':/害怕|吓/.test(text)?'先停稳喘口气，不急着动。':'你说没把握，比让我出去试有用。')+'完成隔离后再叫我。');
  }
  if(/对不起|抱歉|我骗了|我说错/.test(text)){reward('apology',1);return respond(s.injured?'我听到了。伤口我自己压着。后面别替没看清的事打包票。':'先别急着道歉。重新确认，我们还有机会。');}
  if(/声纳/.test(text)||/^(关上|不关上|关了|不关)[。！!]*$/.test(text))return respond(active?'我还听得见它在响。要关就关导航台的主动声纳脉冲，打字不会替你按开关。':'响声停了。被动接收别动，我们靠它听外面的方位。');
  if(/害怕|好怕|吓|救命|撤退|回去|不干了/.test(text))return respond('我也怕。我盯了这扇门八个小时。你先停稳；要退就沿来路退，别闭着眼冲。准备好了再做，坐标还在。');
  if(/你是谁|调查员|八个小时|8个小时|事故|实验|乌贼/.test(text))return respond('我比你先到，调查还没开始就困住了。乌贼只是猜测；先留住现场录像，事故记录到下面再核对。');
  if(question||intent.ambiguous)return respond('我看不到你那边，不能替你确认。可以说“还没关住，先等”，或者核实后告诉我“关住了，可以走”。');
  if(this.awaitingReport){
   if(!s.powered)return respond('逃生门还没电。我先不动，你去02恢复供电。');
   this.reportAnswered=true;m.lastOrder='go';
   if(intent.claim){m.belief=intent.claim;m.beliefSource='罗温的口头报告';m.claims.push({id:m.claims.length+1,claim:intent.claim,at,playerHadThreatEvidence:s.identified,disproved:false});}
   this.rescue.requestDeparture();
   return respond(intent.order==='go'?'收到。我开始推内侧逃生门，门轴卡住了，会有响声；我要慢慢推。有变化马上叫停。':'我没听到明确的结果。这里的水在涨，我先试着进旁边值班室；门外有动静我就退。');
  }
  if(this.canHelp&&!s.departed&&(intent.order==='go'||/完成|成功|搞定|失败|没办法/.test(text))){this.reportRequested=true;return respond('我给你发一段回传，确认一下再走。');}
  if(/谢谢|相信|一起|别怕|坚持|救你/.test(text)){reward('support',1);return respond(m.trust<0?'我愿意继续配合。后面每一步，说准一点。':'行。你盯水道，我盯门。咱们一件一件来。');}
  return respond(s.departed?(m.trust<0?'我会继续走。下次报安全之前，先看片。':'频道留着。到了下一处，我给你回传。'):this.canHelp?'我听着。要我等就直说；操作的事按刚才坐标来。':'听见了，终于有人回话了。先收下一段录像，我把这边的情况告诉你。');
 }
 get objective():string{if(!this.canPhotograph)return '';const s=this.rescue.state;if(s.complete)return '首关完成 · 操作台按 B 下潜至生活区';if(this.pending==='L1-E07'&&!s.isolated)return '主动报告待确认 · 艾里亚斯回传中；货仓尚未隔离，可先回01 X60 Y27 深度1012m完成关闸';if(this.pending)return '艾里亚斯来电 · 回传中，收到即自动登记，可在分析台播放；失败可输入“重试录像”';if(!this.greeted)return '前往入口接驳点 X11 Y16 深度1012m · 回复艾里亚斯';if(!this.canHelp)return '沿水道前往01接驳岗 X60 Y27 深度1012m · 穿过压力门和维修湾，留意门外动静';if(s.departing&&!s.departed)return '艾里亚斯正在试行人员通道 · 可输入“先别走”叫停';if(this.awaitingReport)return s.isolated?'回答艾里亚斯：隔离完成，可自由报告结果':'货仓尚未隔离 · 先完成诱导，再回01 X60 Y27 深度1012m关闸；也可自由报告或叫停';if(s.departed)return '回01面板用机械臂确认下潜，操作台按 B';if(!s.powered)return '02 X42 Y28 深度1012m · 机械臂恢复供电';if(!s.gateOpen&&!s.isolated)return '01 X60 Y27 深度1012m · 机械臂打开货仓闸门';if(!s.isolated&&!this.entryAnalyzed)return '03 X77 Y7 深度1011m · 主动声纳引入，关声纳、停稳拍摄，分析录像；失败可如实回报';if(!s.isolated)return '关闭主动声纳 · 低速回01，机械臂关闭闸门，再报告结果';if(!s.verified)return '拍摄关闭的闸门与仓内生物，分析隔离结果；也可先口头回复';return '确认行动结果后回复艾里亚斯，开始撤离';}
 snapshot():any{return {version:2 as const,accepted:[...this.accepted],greeted:this.greeted,impactPlayed:this.impactPlayed,reportRequested:this.reportRequested,reportAnswered:this.reportAnswered,rewarded:[...this.rewarded]};}
 restore(value:unknown):boolean{
  const legacy=value as {version?:number;accepted?:HarborTaskId[]};
  if(legacy?.version===1){const a=legacy.accepted,s=this.rescue.state;if(!Array.isArray(a)||a.length>3||a.some((x,i)=>x!==(['L1-E01','L1-E02','L1-E03'] as const)[i])||a.length>0&&!s.replied||a.length>1&&!s.identified||a.length>2&&!s.departureConfirmed)return false;const accepted:HarborTaskId[]=a.length>1?[...INTRO]:a.length?['L1-E01']:[];if(a.length===3)accepted.push('L1-E07','L1-E03');return this.restore({version:2,accepted,greeted:a.length>0,impactPlayed:a.length>1,reportRequested:a.length===3,reportAnswered:a.length===3,rewarded:[]});}
  const v=value as {version:number;accepted:HarborTaskId[];greeted:boolean;impactPlayed:boolean;reportRequested:boolean;reportAnswered:boolean;rewarded:string[]};if(!v||v.version!==2||!Array.isArray(v.accepted)||new Set(v.accepted).size!==v.accepted.length||v.accepted.some(x=>!(x in HARBOR_TASKS))||!['greeted','impactPlayed','reportRequested','reportAnswered'].every(k=>typeof (v as any)[k]==='boolean')||!Array.isArray(v.rewarded)||v.rewarded.some(x=>!['apology','honest','support'].includes(x))||new Set(v.rewarded).size!==v.rewarded.length)return false;
  const s=this.rescue.state,head=v.accepted.filter(x=>INTRO.includes(x));if(head.some((x,i)=>x!==INTRO[i])||v.accepted.slice(0,head.length).some((x,i)=>x!==head[i])||v.accepted.length>head.length&&head.length!==INTRO.length)return false;
  if(head.length>0&&!s.replied||head.length>1&&!v.greeted||v.impactPlayed&&!head.includes('L1-E06')||head.includes('L1-E02')&&!v.impactPlayed||v.reportAnswered&&(!v.accepted.includes('L1-E07')||!s.departing)||v.accepted.includes('L1-E08')&&!s.injured||v.accepted.includes('L1-E03')&&(!s.departureConfirmed||!v.accepted.includes('L1-E07')||s.injured&&!v.accepted.includes('L1-E08')))return false;
  this.accepted.splice(0,this.accepted.length,...v.accepted);this.greeted=v.greeted;this.impactPlayed=v.impactPlayed;this.reportRequested=v.reportRequested;this.reportAnswered=v.reportAnswered;this.rewarded=[...v.rewarded];return true;
 }
}
