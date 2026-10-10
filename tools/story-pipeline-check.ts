import assert from 'node:assert/strict';
import {level01} from '../src/story-pipeline/level-01';
import {validate,simulate} from '../src/story-pipeline/model';
import {StoryRuntime,classify} from '../src/story-pipeline/runtime';
import {HarborRescueDialogue} from '../src/pod/sim/harbor-rescue-dialogue';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';

// 数据本身：无错误、无缺关键词。
const issues=validate(level01);
assert.deepEqual(issues.filter(i=>i.level==='error'),[],'pipeline errors');
assert.deepEqual(issues.filter(i=>i.text.includes('关键词')),[],'every tag has keywords');

// 回应必须是能上屏的对白，不能是设计注释。
for(const w of level01.windows)for(const t of w.tags)for(const text of [t.reply,t.again,t.fallback,...(t.branches??[]).map(b=>b.reply)]){
 if(!text)continue;
 for(const line of text.split('\n'))assert.match(line,/^(艾里亚斯|万斯)：|^（[^（）]+）$|^@echo:|^@plan$/,`${w.id}/${t.id} reply is not a spoken line: ${line}`);
 assert.doesNotMatch(text,/随后|见呼应|同上|（物理|重复当前/,`${w.id}/${t.id} reply leaks design notes`);
}

// 自由文本：玩家可能的真实说法 → tag。
const corpus:[string,string,string|null][]=[
 ['elias-contact','我是事故调查员，叫罗温','id-investigator'],
 ['elias-contact','别动！贴墙待着别出声','hold'],
 ['elias-contact','坚持住，我马上就到','promise'],
 ['elias-contact','你在哪个位置？','ask-location'],
 ['elias-contact','你受伤没有','ask-injury'],
 ['elias-contact','你到底是谁','doubt'],
 ['elias-contact','我来救你了','id-rescuer'],
 ['elias-report','它就在你身后的门里，离你很近','truthful'],
 ['elias-report','别怕，什么都没有','downplay'],
 ['elias-report','我害怕，我想离开这里','fear'],
 ['elias-report','那到底是什么东西？','ask-what'],
 ['elias-report','这里到底发生了什么事故','ask-accident'],
 ['elias-action','下一步去哪？','ask-next'],
 ['elias-action','你可以出来了','call-out'],
 ['elias-action','说说你自己吧','ask-self'],
 ['elias-confirm','门关上了，你出来吧','release'],
 ['elias-confirm','出来，扶着栏杆走，别回头','release-route'],
 ['elias-confirm','等一下，我再确认','unsure'],
 ['elias-farewell','看到值班记录帮我留着','records'],
 ['elias-farewell','我们下面见','meet-gate'],
 ['elias-farewell','保重','thanks'],
 ['vance-entry','事故报告怎么说的','ask-accident'],
 ['vance-entry','为什么只派我一个人来','question-mission'],
 ['vance-fade','我有点怕','afraid'],
 ['vance-fade','你是不是早就知道会这样','doubt'],
 ['elias-report','嗯嗯啊啊',null],
];
for(const [id,text,want] of corpus){const w=level01.windows.find(x=>x.id===id)!;assert.equal(classify(w,text).tag?.id??null,want,`${id}: ${text}`);}

// 一句两意：都写入；更具体的放行吞掉普通放行。
let rt=new StoryRuntime(level01);let r=rt.say('elias-contact','别动，贴着墙待着，我是事故调查员')!;
assert.equal(rt.state['elias.instruction.hold'],'freeze');assert.equal(rt.state['elias.knows.rowanRole'],'investigator');assert.equal(r.reply.length,5);assert.equal(r.advance,true);
rt=new StoryRuntime(level01);r=rt.say('elias-confirm','门关上了，扶着栏杆出来，别回头')!;assert.equal(rt.state['elias.instruction.route'],'rail');assert.equal(r.reply.length,1);assert.equal(r.advance,true);
rt=new StoryRuntime(level01);rt.sync({'rowan.knows.monster':true});rt.say('elias-report','没什么，它就在你身后');assert.notEqual(rt.state['elias.believes.monster'],'unknown');

// 推进型窗口不卡玩家；非推进型窗口第一次听不清。
rt=new StoryRuntime(level01);
r=rt.say('elias-report','嗯嗯啊啊')!;assert.equal(r.garbled,false);assert.equal(r.advance,true);assert.equal(r.tag?.id,'other');
r=rt.say('elias-confirm','嗯嗯啊啊')!;assert.equal(r.garbled,true);assert.equal(r.advance,false);
r=rt.say('elias-confirm','我不确定')!;assert.equal(r.advance,false);r=rt.say('elias-confirm','搞定了')!;assert.equal(r.advance,true);

// 关系每窗口同类一次。
rt=new StoryRuntime(level01);rt.say('elias-action','会没事的');rt.say('elias-action','别怕，相信我');assert.equal(rt.state['relation.elias.trust'],1);
assert.deepEqual(rt.say('elias-action','会没事的')!.reply,['艾里亚斯：我知道。谢谢。']);

// 证词跨窗口只讲一次：看片报告里讲过，行动期再问就用短句。
rt=new StoryRuntime(level01);rt.say('elias-action','之前这里发生了什么');r=rt.say('elias-farewell','到底发生了什么')!;assert.deepEqual(r.reply,[level01.windows.find(w=>w.id==='elias-farewell')!.tags.find(t=>t.id==='ask-accident')!.again]);
// 怪物贴身时问事故，不开讲背景。
rt=new StoryRuntime(level01);r=rt.say('elias-report','这里到底发生了什么')!;assert.equal(rt.state['testimony.elias.accident'],false);assert.match(r.reply.join(''),/出去再说/);
// 入仓片回应读取之前的谎话。
rt=new StoryRuntime(level01);rt.say('elias-report','别怕，什么都没有');assert.match(rt.echo('lure-line')!,/别骗我/);

// 谎称安全只在他还听得见刮擦时记录。
rt=new StoryRuntime(level01);rt.sync({'elias.hears.scrape':true});rt.say('elias-action','现在安全了，出来吧');assert.equal(rt.state['said.rowan.falseClear'],1);
rt.sync({'elias.hears.scrape':false});rt.say('elias-action','现在安全了，出来吧');assert.equal(rt.state['said.rowan.falseClear'],1);

// 尸体不在场时如实回答，不写事实，但看片报告仍推进。
rt=new StoryRuntime(level01);r=rt.say('elias-report','桥下有具尸体')!;assert.equal(r.advance,true);assert.equal(rt.state['rowan.notedBody'],false);assert.match(r.reply[0],/看不见/);

// 万斯衰减句与告别句由事实选择。
rt=new StoryRuntime(level01);rt.say('vance-entry','这里让我不舒服');r=rt.say('vance-fade','我有点怕')!;assert.match(r.reply[0],/慢慢来/);
rt=new StoryRuntime(level01);rt.say('elias-contact','坚持住，我马上过来');r=rt.say('elias-farewell','保重')!;assert.match(r.reply[0],/你说你会来/);

// 表演槽位：同一物理事实，不同说法 → 不同表演。
const beat=(picks:[string,string][],shot:string)=>{const x=new StoryRuntime(level01);for(const [w,t] of picks)x.say(w,t);return x.performance(shot).find(p=>p.slot==='elias_beat')!.hit!.key;};
assert.equal(beat([['elias-contact','别动']],'PT-003'),'frozen');
assert.equal(beat([['elias-contact','坚持住我马上过来']],'PT-003'),'signals_pod');
assert.equal(beat([['elias-contact','你是谁']],'PT-003'),'guarded');
assert.equal(beat([],'PT-003'),'listening');
assert.equal(beat([['elias-report','没什么，别怕']],'PT-004'),'peeking');
assert.equal(beat([['elias-confirm','出来吧，扶着栏杆走，别回头']],'VP-012'),'rail');

// 存档往返与非法存档。
rt=new StoryRuntime(level01);rt.say('elias-contact','我是调查员');const snap=JSON.parse(JSON.stringify(rt.snapshot()));
const back=new StoryRuntime(level01);assert.equal(back.restore(snap),true);assert.equal(back.state['elias.knows.rowanRole'],'investigator');
assert.equal(new StoryRuntime(level01).restore({...snap,state:{...snap.state,'elias.knows.rowanRole':'god'}}),false);
assert.equal(new StoryRuntime(level01).restore({version:2}),false);

// 对话状态机：自由文本只推进到原有阶段。
const facts=()=>new HarborRescue().state;
const drain=(d:HarborRescueDialogue,s=facts(),emit=false)=>{let g=60;const lines:string[]=[];while(d.busy&&g--){const o=d.tick(d.currentSeconds+.001,s,emit);if(o.line)lines.push(o.line);}return lines;};
let d=new HarborRescueDialogue();assert.equal(d.exchange('我是调查员',['艾里亚斯：调查员？'],true,true),true);assert.equal(d.exchange('再说',[],false,true),false,'busy');
let lines=drain(d,facts(),true);assert.equal(d.stage,'stop');assert.equal(lines[0],'罗温：我是调查员');assert.match(lines.at(-1)!,/你在打声纳/);
d=new HarborRescueDialogue();d.exchange('',['艾里亚斯：……'],true,false);lines=drain(d);assert.doesNotMatch(lines.join(),/你在打声纳/,'pulse already off');
assert.doesNotMatch(lines.join(),/X\d|按F|DEPTH/,'no coordinates or key names in spoken lines');assert.equal(d.stage,'photo','silent pod flows through stop and warning');
d=new HarborRescueDialogue();d.restore({version:1,stage:'report',pending:[],active:null,remaining:0,choosing:false});d.exchange('没什么',['艾里亚斯：没什么？'],true,false);drain(d);assert.equal(d.stage,'power');
d=new HarborRescueDialogue();d.restore({version:1,stage:'power',pending:[],active:null,remaining:0,choosing:false});d.exchange('快点',['艾里亚斯：我知道。'],true,false);drain(d);assert.equal(d.stage,'power','action window never advances');
assert.match(d.planLine,/02/);
d=new HarborRescueDialogue();d.restore({version:1,stage:'confirm',pending:[],active:null,remaining:0,choosing:false});d.exchange('等一下',['艾里亚斯：好……'],false,false);drain(d);assert.equal(d.stage,'confirm');
d.exchange('搞定了',['艾里亚斯：……关进去了。'],true,false);const eff:string[]=[];let g=20;while(d.busy&&g--)eff.push(...d.tick(d.currentSeconds+.001,facts(),false).effects);assert.deepEqual(eff,['escape']);assert.equal(d.stage,'escape');

// 预设推演：三条路线的录像表演互不相同。
const keys=level01.presets.map(p=>simulate(level01,p.picks,new Set(p.toggles)).events.flatMap(e=>e.shots.flatMap(s=>s.slots.map(x=>x.hit?.key))).join('|'));
assert.equal(new Set(keys).size,keys.length);

console.log(`PASS story pipeline: ${level01.windows.length} windows, ${corpus.length} free-text samples, beats, saves, dialogue stage guard`);
