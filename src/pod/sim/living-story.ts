import type {NarrativeMemory} from './narrative-memory';
export interface LivingStory {partner:'elias'|'keeper';promised:boolean;records:boolean;mistrust:boolean;injured:boolean}
export function livingStory(m:NarrativeMemory):LivingStory{return {partner:m.partner,promised:m.seeds.some(f=>f.id==='promise'),records:m.seeds.some(f=>f.id==='records'),mistrust:m.trust<=-2,injured:m.elias==='injured'};}
export const validLivingStory=(s:LivingStory)=>!!s&&['elias','keeper'].includes(s.partner)&&['promised','records','mistrust','injured'].every(k=>typeof s[k as keyof LivingStory]==='boolean');
export const partnerName=(s?:LivingStory)=>s?.partner==='keeper'?'周岑':'艾里亚斯';
export function livingLine(text:string,s?:LivingStory){return s?.partner==='keeper'?text.replaceAll('艾里亚斯','周岑'):text;}
export function livingOpening(s:LivingStory):string[]{return s.partner==='keeper'?[
 '罗温：这里是调查员罗温。生活区值班室，有人吗？',
 '周岑：周岑，生活区值班员。你听过门边那段留言？我在观察廊内侧。',
 s.injured?'罗温：艾里亚斯受了重伤，留在上层值班室，门已经锁住。':'罗温：艾里亚斯留在上层，我们分开行动。',
 '周岑：我记下位置了。这边营养管还在送东西，通道全堵住了。我得先停掉它，才能去接他。',
 '罗温：我从艇侧找阀门。你别越过隔离门。',
 '周岑：拿探头来，观察廊有传递管。这里的通话器快断电了——',
 ]:[
 '罗温：万斯，我到-1层了。收到请回答。',
 '艾里亚斯：罗温，我到了楼梯间。岸上的频道还是不通。',
 '艾里亚斯：我去生活区前厅。你绕过去，观察廊见。通话器在掉电——',
 ];}
/** Recorded probe speech. Sources remain local: this partner never inherits the other's private testimony. */
export function livingTapeLines(kind:string,base:string[],s?:LivingStory):string[]{
 if(!s)return base;
 const name=partnerName(s),lines=base.map(t=>livingLine(t,s));
 if(kind==='alexIntro'){
  if(s.partner==='keeper')lines[0]='周岑：我是周岑，生活区值班员。探头收到了。我守的是这道隔离门，后面的管道一直没有停。';
  else if(s.promised)lines.unshift('艾里亚斯：你说不会丢下我。看到探头过来，我才知道你真的绕到了这边。');
  if(s.mistrust&&s.partner==='elias')lines.push('艾里亚斯：我会把看到的拍给你。下一次让我走之前，也请把依据传过来。');
 }
 if(kind==='slimeCleared'&&s.records&&s.partner==='elias')lines.push('艾里亚斯：你让我留意记录。我经过管线口，看到了“VIP优先供给”的标牌。管理处在中庭另一边，申请原件还得你去找。');
 if(kind==='gateOpened'&&s.partner==='keeper')lines.push('周岑：门开了。我留下标记，再设法回上层接人。你先去查管理处的原始记录。');
 if(kind==='alexIntro'&&s.partner==='keeper')lines.push(`${name}：先处理营养管，再谈开闸。里面还有人，我不能让污染往他们那边流。`);
 return lines;
}
