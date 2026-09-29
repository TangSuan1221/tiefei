import assert from 'node:assert/strict';
import { campaign } from '../src/narrative-lab/campaign';
import { StoryEngine } from '../src/narrative-lab/engine';
import type { StoryState } from '../src/narrative-lab/types';

// Model tests intentionally advance simulated time. They are NOT a sixty-minute
// real-time browser playthrough, nor a human blind playtest.
const failures:{test:string;error:string}[]=[];
const passed:string[]=[];
function check(test:string,run:()=>void){try{run();passed.push(test);}catch(e){failures.push({test,error:String(e instanceof Error?e.stack:e)});}}
function ok(result:{ok:boolean;message:string}){assert.equal(result.ok,true,result.message);}
function invariant(s:StoryState){
 assert.ok(s.sceneIndex>=0&&s.sceneIndex<campaign.scenes.length);
 for(const [key,v] of Object.entries(s.pod))if(typeof v==='number')assert.ok(Number.isFinite(v)&&v>=0,`negative/nonfinite pod.${key}`);
 for(const facts of Object.values(s.knowledge))assert.equal(new Set(facts).size,facts.length,'duplicate knowledge');
 assert.equal(new Set(s.tapes.map(t=>t.id)).size,s.tapes.length,'duplicate tape IDs');
 for(let i=1;i<s.events.length;i++)assert.ok(s.events[i].at>=s.events[i-1].at,'event chronology reversed');
 if(s.endingId)assert.ok(campaign.endings.some(e=>e.id===s.endingId),'unknown ending');
}
function capture(e:StoryEngine){
 let r=e.shoot();if(!r.ok){ok(e.resupply());r=e.shoot();}ok(r);
 const id=e.snapshot().activeTapeId;assert.ok(id);
 e.tick(4.9);assert.equal(e.snapshot().tapes.find(t=>t.id===id)?.ready,false,'premature exposure');
 e.tick(.1);e.tick(11.9);assert.equal(e.snapshot().tapes.find(t=>t.id===id)?.ready,false,'premature development');
 e.tick(.11);let analysis=e.analyze(id!);if(!analysis.ok){ok(e.resupply());analysis=e.analyze(id!);}ok(analysis);invariant(e.snapshot());return id!;
}
check('5 chapters / 15 unique scenes / 3 per chapter',()=>{
 assert.equal(campaign.chapters.length,5);assert.equal(campaign.scenes.length,15);
 assert.equal(new Set(campaign.scenes.map(s=>s.id)).size,15);
 for(const c of campaign.chapters)assert.equal(campaign.scenes.filter(s=>s.chapter===c.id).length,3);
 for(const s of campaign.scenes){assert.ok(s.scoutFootage&&s.scoutFacts.length&&s.resolveText);assert.ok(s.choices.length>=2);assert.ok(s.resolutions.length>=2);assert.equal(new Set(s.choices.map(c=>c.id)).size,s.choices.length);for(const c of s.choices)assert.ok(c.resultText&&c.consequence&&c.evidence.length,`${s.id}/${c.id}: incomplete loop`);}
});
check('detached state cannot mutate engine',()=>{const e=new StoryEngine(campaign),a=e.serialize();e.state.pod.power=-999;e.state.world.injected=true;e.state.knowledge.player.push('invented');assert.equal(e.serialize(),a);});
check('before evidence, action/advance/analyze cannot grant progression',()=>{const e=new StoryEngine(campaign),s=e.snapshot();assert.equal(e.act(campaign.scenes[0].choices[0].id).ok,false);assert.equal(e.advance().ok,false);assert.equal(e.analyze('nonexistent').ok,false);assert.deepEqual(e.snapshot().world,s.world);assert.deepEqual(e.snapshot().knowledge,s.knowledge);});
check('5 + 12 seconds, explicit knowledge and radio propagation',()=>{
 const e=new StoryEngine(campaign),world=e.snapshot().world,knowledge=e.snapshot().knowledge;
 ok(e.shoot());const id=e.snapshot().activeTapeId!;e.tick(4.9);assert.equal(e.analyze(id).ok,false);
 e.tick(.1);e.tick(11.9);assert.equal(e.analyze(id).ok,false);assert.deepEqual(e.snapshot().knowledge,knowledge);
 e.tick(.11);assert.deepEqual(e.snapshot().world,world);ok(e.analyze(id));
 assert.deepEqual(e.snapshot().knowledge.vance,knowledge.vance,'automatic omniscient Vance');
 const after=e.snapshot();assert.ok(after.knowledge.player.length>knowledge.player.length);
 e.analyze(id);assert.deepEqual(e.snapshot().pod,after.pod,'duplicate analysis charged resources');
 ok(e.report());for(const fact of after.knowledge.player)assert.ok(e.snapshot().knowledge.vance.includes(fact));
});
check('save round trip at capture/develop/decision/result/resolve',()=>{
 const e=new StoryEngine(campaign);const round=()=>{const a=e.snapshot(),other=new StoryEngine(campaign);ok(other.restore(e.serialize()));assert.deepEqual(other.snapshot(),a);};
 round();ok(e.shoot());e.tick(2);round();e.tick(3);e.tick(6);round();e.tick(6.1);ok(e.analyze());round();
 const c=e.getChoices().find(c=>c.allowed)!;ok(e.act(c.id));round();capture(e);round();assert.equal(e.advance().ok,false,'result needs a second choice');ok(e.resolve(e.scene.resolutions.find(r=>!r.condition||e.evaluate(r.condition))!.id));round();
});
check('100 second single update preserves complete local evidence',()=>{const e=new StoryEngine(campaign);ok(e.shoot());e.tick(100);assert.equal(e.snapshot().tapes.at(-1)?.ready,true);ok(e.analyze());assert.equal(e.snapshot().phase,'decision');});
check('old tape cannot satisfy a new result epoch',()=>{const e=new StoryEngine(campaign);const old=capture(e);ok(e.act(e.getChoices().find(c=>c.allowed)!.id));const before=e.snapshot();e.analyze(old);assert.equal(e.snapshot().phase,'result');assert.deepEqual(e.snapshot().world,before.world);assert.deepEqual(e.snapshot().knowledge,before.knowledge);capture(e);assert.equal(e.snapshot().phase,'resolve');});
check('invalid saves rejected without partial replacement',()=>{const e=new StoryEngine(campaign),before=e.serialize();for(const data of ['{','{}',JSON.stringify({...e.snapshot(),campaignId:'foreign'}),JSON.stringify({...e.snapshot(),sceneIndex:999})]){assert.equal(e.restore(data).ok,false,data);assert.equal(e.serialize(),before);}});
check('save cannot teleport chapters or fabricate radio knowledge',()=>{
 const e=new StoryEngine(campaign),s=e.snapshot();s.sceneIndex=3;assert.equal(e.restore(JSON.stringify(s)).ok,false,'unearned chapter accepted');
 capture(e);const forged=e.snapshot();forged.knowledge.vance=[...forged.knowledge.player];assert.equal(e.restore(JSON.stringify(forged)).ok,false,'unreported knowledge accepted');
});
check('resource starvation has a real non-destructive recovery',()=>{
 const fixture=structuredClone(campaign);fixture.scenes[0].choices[0].instructions=[{path:'pod.power',op:'set',value:0}];
 const e=new StoryEngine(fixture);capture(e);ok(e.act(fixture.scenes[0].choices[0].id));
 const before=e.snapshot();assert.equal(e.shoot().ok,false);ok(e.resupply());assert.deepEqual(e.snapshot().world,before.world);assert.deepEqual(e.snapshot().knowledge,before.knowledge);capture(e);assert.equal(e.snapshot().phase,'resolve');
});

const coverage=new Set<string>(),endings=new Set<string>(),witnesses:Record<string,string[]>={};
check('bounded branch walks: concrete terminal witnesses + recovery',()=>{
 for(let seed=0;seed<192;seed++){
  const e=new StoryEngine(campaign),trace:string[]=[];let rng=seed+1;
  for(let step=0;step<campaign.scenes.length;step++){
   const scene=e.scene;capture(e);if(seed%3!==0)ok(e.report());
   let choices=e.getChoices().filter(c=>c.allowed);if(!choices.length){ok(e.resupply());choices=e.getChoices().filter(c=>c.allowed);}assert.ok(choices.length,`softlock ${trace.join(' > ')}`);
   rng=(Math.imul(rng,1664525)+1013904223)>>>0;
   const missing=choices.find(c=>!coverage.has(scene.id+'/'+c.id));const c=missing??choices[rng%choices.length];
   ok(e.act(c.id));trace.push(scene.id+'/'+c.id);coverage.add(scene.id+'/'+c.id);invariant(e.snapshot());
   capture(e);if(seed%3===2)ok(e.report());let resolutions=e.getResolutions().filter(r=>r.allowed);if(!resolutions.length){ok(e.resupply());resolutions=e.getResolutions().filter(r=>r.allowed);}for(let repair=0;!resolutions.length&&repair<scene.choices.length;repair++){let repairs=e.getChoices().filter(c=>c.allowed);if(!repairs.length){ok(e.resupply());repairs=e.getChoices().filter(c=>c.allowed);}assert.ok(repairs.length,'no resolution or repair: '+trace.join(' > '));const fix=repairs[0];ok(e.act(fix.id));trace.push(scene.id+'/'+fix.id);coverage.add(scene.id+'/'+fix.id);capture(e);resolutions=e.getResolutions().filter(r=>r.allowed);}assert.ok(resolutions.length,'repair exhausted: '+trace.join(' > '));const res=resolutions[rng%resolutions.length].resolution;ok(e.resolve(res.id));trace.push(scene.id+'/resolve/'+res.id);ok(e.advance());invariant(e.snapshot());
   if(e.snapshot().phase==='ended')break;
  }
  const s=e.snapshot();assert.equal(s.phase,'ended',`nonterminal ${trace.join(' > ')}`);assert.ok(s.endingId);endings.add(s.endingId!);witnesses[s.endingId!]??=trace;
 }
});
check('targeted repair pairs and stay ending have terminal witnesses',()=>{
 const pairs:Record<string,string[]>={'l1-01':['high-pulse','reset-test'],'l1-02':['close-early','recover-gate'],'l2-01':['seal-sources','recover-tool'],'l2-02':['public-backwash','stop-and-reroute'],'l3-01':['open-lab','repair-claw'],'l3-02':['private-test','vance-check'],'l3-03':['restore-main','cut-after-flow'],'l4-01':['controlled-inspection','share-boundary'],'l5-02':['emergency-drain','stop-contamination']};
 // Choose each targeted edge only after its actual prerequisite action, never by editing state.
 for(const target of [...Object.keys(pairs),'stay']){
  const e=new StoryEngine(campaign),trace:string[]=[];
  for(let i=0;i<15;i++){
   capture(e);ok(e.resupply());const id=e.scene.id;
   let desired=target===id?pairs[id]:[];
   if(target==='stay')desired=id==='l4-02'?['damage-suit']:id==='l5-01'?['force-transfer']:id==='l5-03'?['stay-at-control']:[];
   if(!desired.length)desired=[e.getChoices().find(c=>c.allowed)!.id];
   for(let j=0;j<desired.length;j++){
    let choice=e.getChoices().find(c=>c.id===desired[j]&&c.allowed);
    assert.ok(choice,`target ${target}: unavailable ${id}/${desired[j]}`);ok(e.act(choice.id));coverage.add(id+'/'+choice.id);trace.push(id+'/'+choice.id);capture(e);if(target==='l3-02'||target==='l4-01')ok(e.report());
   }
   if(id==='l5-03'){assert.equal(e.snapshot().world.departureMode,'pending','irreversible ending before result decision');assert.equal(e.snapshot().world.playerExposed,false,'player exposed before explicit final execution');}
   const resolution=e.getResolutions().find(r=>r.allowed);assert.ok(resolution,`target ${target} no resolution`);ok(e.resolve(resolution.resolution.id));if(id==='l5-03')assert.equal(e.report().ok,false,'post-departure report accepted');ok(e.advance());
  }
  const ending=e.snapshot().endingId!;assert.ok(ending);if(target==='stay')assert.equal(ending,'stay');endings.add(ending);witnesses[ending]??=trace;
 }
});
const authoredEdges=campaign.scenes.flatMap(s=>s.choices.map(c=>s.id+'/'+c.id));
const planned=campaign.scenes.reduce((n,s)=>n+s.plannedSeconds.travel+s.plannedSeconds.reading+s.plannedSeconds.action,0);
console.log(JSON.stringify({kind:'deterministic-model-audit',notHumanBlindTest:true,notRealtimePlaytime:true,passed,failures,coverage:{edges:[...coverage],unwitnessedEdges:authoredEdges.filter(id=>!coverage.has(id)),endings:[...endings],unwitnessedEndings:campaign.endings.filter(e=>!endings.has(e.id)).map(e=>e.id),witnesses},timeBudget:{authoredSeconds:planned,twoFilmsPerSceneLocalSeconds:campaign.scenes.length*2*17,classification:'budget only; exclude overlap before interpreting any total'},scope:'192 deterministic bounded walks; not exhaustive proof; no 3D or network service test'},null,2));
if(failures.length)process.exitCode=1;


