import assert from 'node:assert/strict';
import {LIVING_EXIT_Y,type Vec3} from '../src/pod/content/living-deck-layout';
import {LivingDeck,LIVING_TIMING,type LivingCaptureSeen} from '../src/pod/sim/living-deck';
import {LivingDialogue} from '../src/pod/sim/living-dialogue';

const deck=new LivingDeck(),talk=new LivingDialogue();
const lines:string[]=[],effects:string[]=[],objectives:{stage:string;objective:string}[]=[];
const pump=(seconds:number,pod?:Vec3)=>{for(let t=0;t<seconds-1e-9;t+=.5){deck.step(.5,{pod:pod??deck.state.pod,heading:0,lamp:false,pulse:false,speed:0});const o=talk.tick(.5,deck.state);if(o.line!==undefined)lines.push(o.line);effects.push(...o.effects);
 const last=objectives[objectives.length-1];if(!last||last.objective!==talk.objective)objectives.push({stage:talk.stage,objective:talk.objective});}};
const settle=(pod?:Vec3)=>{let guard=0;do{pump(1,pod);}while(talk.busy&&++guard<400);assert.ok(!talk.busy,'dialogue drains');};
let n=0;const shoot=(seen:Partial<LivingCaptureSeen>)=>{const e=deck.capture(`s${++n}`,{targets:[],creatures:[],lensBlocked:false,lamp:true,gateOpen:false,alexVisible:false,...seen});deck.commitCapture(e);return deck.analyze(e);};
const ctx={lamp:false,powered:true,armStowed:true,pulse:false};

pump(.5,[7,30,7]);assert.ok(talk.objective.length>0,'descend objective is shown at once');
settle([7,30,7]);
assert.ok(lines[0]!.startsWith('罗温：万斯'),'first call goes to Vance');
assert.ok(lines.some(l=>l.includes('观察廊见')),'Alex\'s last radio line before the deck goes dark');
assert.ok(effects.includes('radioCut')&&effects.includes('broadcast'));
assert.ok(lines.includes('广播：欢迎入住。您已不必继续忍受疼痛。'));
const cutIndex=lines.length;
settle([7,0,7]);assert.equal(talk.objective,'在R3安保值班室取回摄像探头箱');
settle([76,0,-58.5]);const probe=deck.armCollected('living.box.probe');settle();deck.analyzeTape(probe.tapes[0]!.id);settle();
settle([112.5,0,32.5]);deck.armCollected('living.box.ballast');settle();
settle([137.5,0,17]);assert.equal(talk.objective,'前往G观察廊，在传递管道入口发射探头');
deck.interact('living.pipe.intake',ctx);settle();assert.equal(talk.objective,'等待艾里亚斯的探头录像');
pump(LIVING_TIMING.alexTape+1);settle();deck.analyzeTape(deck.state.tapes.find(t=>t.kind==='alexIntro')!.id);settle();
assert.equal(talk.objective,'在V阀门间关闭污染源阀门，关阀后保持静默');
settle([138,0,-36]);deck.interact('living.valve.heat',ctx);settle();assert.equal(talk.objective,'保持静默，等待艾里亚斯拍回结果录像');
pump(LIVING_TIMING.unchanged+1);deck.analyzeTape(deck.state.tapes.find(t=>t.kind==='slimeUnchanged')!.id);settle();
assert.ok(lines.some(l=>l.includes('是我关错了')),'the investigator owns the wrong call');
deck.interact('living.valve.heat',ctx);settle([138,0,-29]);deck.interact('living.valve.feed',ctx);pump(LIVING_TIMING.cleared+1);deck.analyzeTape(deck.state.tapes.find(t=>t.kind==='slimeCleared')!.id);settle();
assert.equal(talk.objective,'经C5穿过中庭，前往R5住宿管理处');
settle([150,-1,62]);settle([162,0,96]);assert.equal(talk.objective,'拍摄管理员手中的密码与墙上开闸步骤图，回分析台核验');
shoot({targets:['living.photo.code','living.photo.guide','living.photo.delroy']});settle();
assert.ok(lines.some(l=>l.includes('德尔罗伊')),'optional application form gets a reaction');
settle([188,-1.2,52]);deck.uplink();settle();pump(LIVING_TIMING.gate+1);settle();
assert.equal(talk.objective,'拍摄闸门开启与艾里亚斯游出，回分析台核验');
const meetIndex=lines.length;
shoot({gateOpen:true,alexVisible:true});settle();
assert.ok(effects.includes('radioRestore')&&effects.includes('reunion'));
assert.equal(talk.objective,'会合后经中庭西侧C7前往下行井D，下潜至-2层');
assert.ok(!/与艾里亚斯(一起|前往)/.test(talk.objective),'met objective must not promise how Alex follows (GAP)');
settle([108,0,68]);settle([98,LIVING_EXIT_Y-1,68]);assert.equal(deck.complete,true);assert.equal(talk.objective,'');

const spoken=lines.filter(Boolean);
assert.ok(!spoken.some(l=>l.startsWith('万斯：')),'Vance is out of contact on this deck');
assert.ok(!lines.slice(cutIndex,meetIndex).some(l=>l.startsWith('艾里亚斯：')),'no radio from Alex between the shaft and the gate');
assert.ok(!spoken.some(l=>/兄弟|哥哥|弟弟|亲人|家人/.test(l)),'the brother identity stays hidden');
assert.ok(!spoken.some(l=>/按F|PageDown|分析台|核验|声纳标签|伤害|耐久/.test(l)),'no mechanic disclaimers inside spoken lines');
assert.ok(spoken.every(l=>/^(罗温|艾里亚斯|广播)：/.test(l)),'every line is attributed');
assert.ok(spoken.some(l=>l.includes('我不知道'))&&spoken.some(l=>l.includes('退回')),'fear, doubt and a retreat plan (MET-033)');
assert.ok(spoken.some(l=>l.includes('这只是她自己写的')),'testimony kept apart from fact (MET-034)');
assert.equal(new Set(spoken).size,spoken.length,'no line plays twice');
for(const o of objectives)assert.ok(o.objective.length<=40,`objective stays short: ${o.objective}`);

// Snapshot mid-line, malformed rejection and migration.
{
 const d=new LivingDeck(),a=new LivingDialogue();const first=a.tick(.1,d.state);assert.ok(first.line);a.tick(1,d.state);
 const saved=a.snapshot(),b=new LivingDialogue();assert.equal(b.restore(saved),true);assert.deepEqual(b.snapshot(),saved);
 assert.equal(b.currentLine,a.currentLine);assert.equal(b.currentSeconds,a.currentSeconds);
 for(let i=0;i<40;i++)assert.deepEqual(b.tick(.7,d.state),a.tick(.7,d.state),'restored channel continues identically');
 const bad=(mutate:(s:any)=>void,why:string)=>{const s=structuredClone(saved) as any;mutate(s);const before=b.snapshot();assert.equal(b.restore(s),false,why);assert.deepEqual(b.snapshot(),before);};
 bad(s=>{s.version=0;},'version');bad(s=>{s.published='nowhere';},'stage');bad(s=>{s.played=['ghost'];},'unknown group');bad(s=>{s.played=['descend','descend'];},'duplicate group');
 bad(s=>{s.pending=[{text:1}];},'beat text');bad(s=>{s.remaining=-1;},'remaining');bad(s=>{s.active={text:'x',effect:'boom'};},'effect');
 assert.equal(b.restore(undefined),false);
 const late=new LivingDialogue();late.migrate(deck.state);assert.equal(late.busy,false);const o=late.tick(.1,deck.state);assert.equal(o.line,undefined,'migrated save does not replay the deck');
}
{const c=new LivingDialogue();c.enqueue('罗温：测试。');assert.equal(c.busy,true);assert.equal(c.tick(.1,new LivingDeck().state).line,'罗温：测试。');}
console.log(`PASS living dialogue: ${spoken.length} attributed lines across the full route, objectives publish after each stage's lines, Vance silent, Alex silent between shaft and gate, no brother reveal, no mechanic text, MET-033 doubt/retreat, snapshot/migrate`);
