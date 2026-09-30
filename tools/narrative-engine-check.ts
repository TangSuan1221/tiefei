import assert from 'node:assert/strict';
import { StoryEngine } from '../src/narrative-lab/engine';
import type { Campaign, StoryScene } from '../src/narrative-lab/types';

const scene=(id:string):StoryScene=>({id,chapter:1,title:id,location:'维护区',entryText:'抵达独立分镜。',observation:'camera',
  scoutFootage:'稳定笼体中有一位被困者。',scoutFacts:[`${id}.seen`],resolveText:'根据结果继续。',
  plannedSeconds:{travel:5,reading:15,action:5},
  choices:[
    {id:'isolate',label:'关闭隔离',instructions:[{path:'world.gateClosed',op:'set',value:true},{path:'world.eliasDisposition',op:'set',value:'isolated'}],evidence:[`${id}.closed`],resultText:'隔离门已经关闭。',consequence:'真实关门',npcLines:[{speaker:'elias',text:'不应出现'},{speaker:'vance',text:'本台词故意没有 requires；仍必须等到报告才能说。'}]},
    {id:'repair',label:'维护旁路',instructions:[{path:'world.repaired',op:'set',value:true}],evidence:[`${id}.repaired`],resultText:'旁路已有新的维修标记。',consequence:'修复旁路',npcLines:[]},
  ],resolutions:[{id:'continue',label:'按已核验结果继续',instructions:[],text:'已确认后续行动。'}]});
const campaign:Campaign={id:'engine-fixture',version:1,title:'引擎边界测试',premise:'测试',prologue:{title:'测试',location:'测试',text:'测试',stateChanges:[]},chapters:[{id:1,title:'测试',depth:1000,dramaticQuestion:'事实是否守恒？'}],
  scenes:[scene('a'),scene('b')],initialWorld:{eliasNature:'transformed',eliasDisposition:'companion',gateClosed:false,repaired:false},
  endings:[{id:'end',title:'完成',priority:0,condition:{all:[]},summary:'隔离状态守恒。'}]};
const engine=new StoryEngine(campaign);
const pass=(result:{ok:boolean;message:string})=>assert.ok(result.ok,result.message);
const roundtrip=()=>{const saved=engine.serialize();pass(engine.restore(saved));assert.equal(engine.serialize(),saved);};
const photograph=()=>{pass(engine.shoot());engine.tick(17);pass(engine.analyze());};

assert.equal(engine.act('isolate').ok,false,'no action before scouting');
assert.equal(engine.advance().ok,false,'no jump to later scene');
assert.equal(engine.chooseCandidate('untrusted-model-instruction'),null);
pass(engine.shoot());engine.tick(4.99);assert.equal(engine.state.tapes[0].ready,false);roundtrip();
engine.tick(.01);assert.equal(engine.state.captureRemaining,0);assert.equal(engine.state.developRemaining,12);roundtrip();
engine.tick(11.99);assert.equal(engine.analyze().ok,false);engine.tick(.01);
assert.equal(engine.state.tapes[0].ready,true);assert.deepEqual(engine.state.knowledge.player,[]);
pass(engine.analyze());assert.deepEqual(engine.state.knowledge.player,['a.seen']);assert.deepEqual(engine.state.knowledge.vance,[]);roundtrip();
const analyzed=engine.serialize();pass(engine.analyze());assert.equal(engine.serialize(),analyzed,'analysis idempotence');
const copied=engine.state;copied.world.gateClosed=true;copied.knowledge.player.push('forged');assert.equal(engine.state.world.gateClosed,false);
assert.equal(engine.chooseCandidate('unknown')?.id,'isolate','invalid model candidate falls back deterministically');

const before=engine.serialize();const forged=JSON.parse(before);forged.knowledge.vance=[...forged.knowledge.player];
assert.equal(engine.restore(JSON.stringify(forged)).ok,false,'unreported knowledge must not load');assert.equal(engine.serialize(),before);
forged.knowledge.vance=[];forged.sceneIndex=1;assert.equal(engine.restore(JSON.stringify(forged)).ok,false,'scene jump must not load');
const identity=JSON.parse(before);identity.world.eliasNature='human';assert.equal(engine.restore(JSON.stringify(identity)).ok,false);
pass(engine.report());roundtrip();
pass(engine.act('isolate'));assert.equal(engine.state.world.gateClosed,true);assert.equal(new Set<string>(engine.state.knowledge.player).has('a.closed'),false);
pass(engine.shoot());assert.equal(engine.act('repair').ok,false);assert.equal(engine.advance().ok,false);roundtrip();
engine.tick(100);assert.equal(engine.state.tapes.at(-1)?.ready,true,'slow frame cannot lose evidence');
pass(engine.analyze());assert.deepEqual(engine.getNpcLines(),[],'isolated NPC and uninformed operator cannot speak');
pass(engine.report());assert.equal(engine.getNpcLines().length,1);assert.equal(engine.getNpcLines()[0].speaker,'vance');
assert.equal(engine.advance().ok,false,'result requires second decision');
pass(engine.act('repair'));assert.equal(engine.state.phase,'result');
pass(engine.analyze('tape.2'));assert.equal(engine.state.phase,'result','replaying old analysis does not authorize new world');
photograph();assert.equal(engine.state.world.gateClosed,true,'repair does not silently reverse isolation');
assert.equal(engine.act('repair').ok,false,'same action cannot grant effects twice');
pass(engine.resolve('continue'));roundtrip();pass(engine.advance());roundtrip();

const low=JSON.parse(engine.serialize());low.pod.power=0;low.pod.oxygen=0;pass(engine.restore(JSON.stringify(low)));
assert.equal(engine.shoot().ok,false);pass(engine.resupply());photograph();pass(engine.act('repair'));photograph();
pass(engine.resolve('continue'));
const committed=engine.serialize();
assert.equal(engine.report().ok,false,'final departure cannot receive a late report');
assert.equal(engine.resupply().ok,false,'final departure cannot return to supplies');
assert.equal(engine.act('isolate').ok,false,'final departure cannot modify the world');
assert.equal(engine.serialize(),committed,'refused post-departure operations preserve state');
const lateReport=JSON.parse(committed);lateReport.events.push({id:lateReport.events.length+1,at:lateReport.clock,sceneId:'b',type:'report',detail:'late report'});
assert.equal(engine.restore(JSON.stringify(lateReport)).ok,false,'save cannot append a report after final commitment');
pass(engine.advance());assert.equal(engine.state.phase,'ended');roundtrip();
assert.equal(engine.report().ok,false);assert.equal(engine.resupply().ok,false);
assert.equal(engine.state.world.eliasDisposition,'isolated');assert.equal(engine.state.endingId,'end');
assert.throws(()=>engine.tick(NaN));assert.throws(()=>engine.tick(-1));
const illegal=structuredClone(campaign);illegal.scenes[0].choices[0].instructions=[{path:'knowledge.player',op:'set',value:'forged'}];
assert.throws(()=>new StoryEngine(illegal),'content cannot assign knowledge');
console.log('PASS narrative engine: timing, immutable evidence, knowledge/report separation, NPC conservation, guarded model fallback, recovery, second decisions, causally validated saves.');
