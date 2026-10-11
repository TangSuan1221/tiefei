/** Persistent testimony, beliefs and promises. Never writes physical world facts. */
export type SafetyClaim='dead'|'sealed'|'away'|'danger';
export type NarrativeIntent={claim?:SafetyClaim;order?:'go'|'hold';apology?:boolean;refuse?:boolean;seeds:string[];ambiguous?:boolean};
export type SeedId='promise'|'records'|'body'|'report'|'hypothesis'|'false-clear';
export interface NarrativeSeed {id:SeedId;chapter:number;holder:'elias'|'vance'|'rowan';status:'pending'|'paid';source:string}
export interface NarrativeMemory {
 version:1;trust:number;belief:SafetyClaim|'unknown';beliefSource:string;
 claims:{id:number;claim:SafetyClaim;at:number;playerHadThreatEvidence:boolean;disproved:boolean}[];
 seeds:NarrativeSeed[];elias:'healthy'|'injured'|'refused';partner:'elias'|'keeper';
 received:string[];paid:string[];lastOrder:'go'|'hold'|null;apologized:boolean;
}
export const freshNarrative=():NarrativeMemory=>({version:1,trust:0,belief:'unknown',beliefSource:'',claims:[],seeds:[],elias:'healthy',partner:'elias',received:[],paid:[],lastOrder:null,apologized:false});
const claims=['dead','sealed','away','danger'];
const seedIds=['promise','records','body','report','hypothesis','false-clear'];
export function validNarrative(v:unknown):v is NarrativeMemory {
 const s=v as NarrativeMemory;if(!s||s.version!==1||!Number.isFinite(s.trust)||s.trust< -3||s.trust>3||!['unknown',...claims].includes(s.belief)||typeof s.beliefSource!=='string')return false;
 if(!['healthy','injured','refused'].includes(s.elias)||!['elias','keeper'].includes(s.partner)||![null,'go','hold'].includes(s.lastOrder)||typeof s.apologized!=='boolean')return false;
 if(!Array.isArray(s.claims)||!s.claims.every((c,i)=>c&&c.id===i+1&&claims.includes(c.claim)&&Number.isFinite(c.at)&&c.at>=0&&typeof c.playerHadThreatEvidence==='boolean'&&typeof c.disproved==='boolean'))return false;
 if(!Array.isArray(s.seeds)||!s.seeds.every(f=>f&&seedIds.includes(f.id)&&Number.isInteger(f.chapter)&&f.chapter>=2&&f.chapter<=5&&['elias','vance','rowan'].includes(f.holder)&&['pending','paid'].includes(f.status)&&typeof f.source==='string'))return false;
 return [s.received,s.paid].every(a=>Array.isArray(a)&&a.every(x=>typeof x==='string')&&new Set(a).size===a.length)&&new Set(s.seeds.map(f=>f.id)).size===s.seeds.length;
}
/** Conservative local grammar: negation, questions, quotations and hypotheticals do not authorize departure. */
export function parseNarrative(text:string):NarrativeIntent {
 const t=text.replace(/\s+/g,'').toLowerCase(),out:NarrativeIntent={seeds:[]};
 const question=/[?？]|(?:吗|么)[。！!]*$|是不是|有没有/.test(t);
 const hypothetical=/如果|假如|假设|要是|等.{0,10}(?:杀|死|关|安全)|他说|她说|你说|万斯说|[“「]/.test(t);
 if(question||hypothetical){if(question&&!hypothetical&&/尸体|遗体|水里那个人/.test(t))out.seeds.push('body');out.ambiguous=/杀|死|安全|出来|关住|隔离/.test(t);return out;}
 if(/(?:不会|不再|绝不|不)(?:把你)?(?:丢下|抛下|放弃你)|一定救你|会带你出去|我会救你/.test(t))out.seeds.push('promise');
 if(/(?:找|留意|收集|保存).{0,8}(?:记录|档案|日志)/.test(t))out.seeds.push('records');
 if(/尸体|遗体|水里那个人/.test(t))out.seeds.push('body');
 if(/如实报告|如实汇报|不会隐瞒|完整报告/.test(t))out.seeds.push('report');
 if(/设备故障|机械故障|暂不下结论|保留判断/.test(t))out.seeds.push('hypothesis');
 if(/对不起|抱歉|我看错|我说错|我骗了|刚才骗/.test(t))out.apology=true;
 if(!out.seeds.includes('promise')&&/不救你|不管你了|你自己走|我自己走|不再合作/.test(t))out.refuse=true;
 const hold=/别(?:再)?(?:动|出来|走)|不要(?:出来|动|走)|先别|待在|等一下|等等|先等|撤回|退回|不安全|还活着|没(?:有)?(?:杀死|死|关住|隔离)|尚未/.test(t);
 if(hold){out.order='hold';if(/还活着|不安全|没(?:有)?(?:杀死|死|关住|隔离)|看错|骗/.test(t))out.claim='danger';return out;}
 if(/杀死|杀掉|干掉|已经死|它死了|怪物死了|消灭了/.test(t))out.claim='dead';
 else if(/关住了|关好了|关上了|关进去了|关起来了|隔离了|已经隔离|关在货仓|它在里面/.test(t))out.claim='sealed';
 else if(/引开了|引走了|它走了|暂时安全/.test(t))out.claim='away';
 if(out.claim||/出来吧|出来了|可以出来|可以走|走吧|现在走|出发|安全了|搞定了/.test(t))out.order='go';
 return out;
}
export function plantSeeds(s:NarrativeMemory,intent:NarrativeIntent,speaker:'elias'|'vance',source:string):string[] {
 const lines:string[]=[];
 for(const raw of intent.seeds){const id=raw as SeedId;
  if(s.seeds.some(f=>f.id===id)||id==='report'&&speaker!=='vance'||['promise','records'].includes(id)&&speaker!=='elias')continue;
  s.seeds.push({id,chapter:id==='promise'||id==='records'?2:id==='report'?5:4,holder:id==='body'||id==='hypothesis'?'rowan':speaker,status:'pending',source:source.slice(0,160)});
  lines.push(id==='promise'?'艾里亚斯：好，我记住了。':id==='records'?'艾里亚斯：如果能到生活区，我会留意值班记录。':id==='report'?'万斯：好。结论和你亲眼看到的东西分开写，等恢复上行再传。':id==='body'?'罗温：把关于尸体的问题记下来，身份和位置还需要录像核对。':'罗温：先把它记作假设。还需要核对事故记录。');
 }
 return lines;
}
export function hearSafety(s:NarrativeMemory,i:NarrativeIntent,ctx:{at:number;hearsDanger:boolean;playerHadThreatEvidence:boolean;injured:boolean;secured:boolean}):{action:'go'|'hold'|'none';lines:string[]} {
 const lines:string[]=[];
 if(i.apology&&!s.apologized){s.apologized=true;lines.push('艾里亚斯：先把眼前的事说清楚。你现在能确认什么？');}
 if(i.claim){const last=s.claims.at(-1);if(!last||last.claim!==i.claim){s.claims.push({id:s.claims.length+1,claim:i.claim,at:ctx.at,playerHadThreatEvidence:ctx.playerHadThreatEvidence,disproved:false});}
  s.belief=i.claim;s.beliefSource='罗温的口头报告';
  if(i.claim==='dead'&&!s.seeds.some(f=>f.id==='false-clear'))s.seeds.push({id:'false-clear',chapter:2,holder:'elias',status:'pending',source:'玩家曾报告怪物死亡；等待接收者得到可核对的材料。'});
 }
 if(i.order==='hold'){s.lastOrder='hold';return {action:'hold',lines:[...lines,'艾里亚斯：收到。我先停下，能退回去就退回去。']};}
 if(i.refuse){s.elias=ctx.injured?'injured':'refused';s.partner='keeper';s.lastOrder='hold';return {action:'hold',lines:[...lines,'艾里亚斯：那就先把外面的危险隔开。我留在值班室，不跟你往下走了。']};}
 if(i.order!=='go')return {action:'none',lines:[...lines,...(i.claim?['艾里亚斯：收到。你是要我现在走，还是继续等？']:[])]};
 if(ctx.injured&&!ctx.secured)return {action:'hold',lines:['艾里亚斯：腿动不了。我只能沿栏杆挪回去，先把它隔开。']};
 if(ctx.hearsDanger){s.belief='danger';s.beliefSource='当地刮擦声';return {action:'hold',lines:['艾里亚斯：门边还在响。你确认的是哪里？我先不动。']};}
 if(s.trust<=-2&&!ctx.secured)return {action:'hold',lines:['艾里亚斯：刚才已经出过事了。把隔离结果传给我，我看过再走。']};
 if(!i.claim&&s.belief==='unknown')s.belief='away';
 s.lastOrder='go';return {action:'go',lines:[...lines,ctx.injured?'艾里亚斯：我扶着栏杆退进值班室，走不了多远了。':s.belief==='away'?'艾里亚斯：趁它离开，我沿栏杆过去。有动静就叫停。':'艾里亚斯：好，我沿栏杆过去。到了门边再联系你。']};
}
export function noteInjury(s:NarrativeMemory){
 if(s.elias==='injured')return;
 s.elias='injured';s.partner='keeper';s.trust=Math.max(-3,s.trust-2);s.lastOrder='hold';
 const c=s.claims.at(-1);if(c&&c.claim!=='danger')c.disproved=true;
 s.belief='danger';s.beliefSource='本人遇袭';
}
/** Only explicitly received evidence can contradict testimony; not the world's hidden truth. */
export function receiveSafetyEvidence(s:NarrativeMemory,id:string,claim:SafetyClaim,at:number):string[] {
 if(s.received.includes(id))return [];s.received.push(id);
 const c=[...s.claims].reverse().find(c=>c.claim==='dead'&&!c.disproved&&at>=c.at);
 const lines:string[]=[];
 if(c&&claim!=='dead'){c.disproved=true;s.trust=Math.max(-3,s.trust-1);lines.push('艾里亚斯：片子里它还在动。你之前说它死了，是怎么判断的？');}
 if(at>=(s.claims.at(-1)?.at??0)){s.belief=claim;s.beliefSource='收到的录像 '+id;}return lines;
}
export function paySeed(s:NarrativeMemory,id:SeedId,chapter:number):boolean {
 const seed=s.seeds.find(f=>f.id===id&&f.status==='pending');if(!seed||chapter<seed.chapter)return false;
 seed.status='paid';if(id==='promise')s.trust=Math.min(3,s.trust+1);return true;
}
