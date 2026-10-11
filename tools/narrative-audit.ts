import assert from 'node:assert/strict';
import {campaign} from '../src/narrative-lab/campaign';
import {StoryEngine} from '../src/narrative-lab/engine';
import {auditBranches} from '../src/narrative-lab/branch-audit';
const ok=(r:{ok:boolean;message:string})=>assert.ok(r.ok,r.message);
function capture(e:StoryEngine){ok(e.shoot());e.tick(17);ok(e.analyze());}
function roundtrip(e:StoryEngine){const s=e.serialize();ok(e.restore(s));assert.equal(e.serialize(),s);}
assert.deepEqual(auditBranches(campaign),[]);
const same=structuredClone(campaign);same.scenes[0].choices[1].instructions=structuredClone(same.scenes[0].choices[0].instructions);assert.throws(()=>new StoryEngine(same));
const reset=structuredClone(campaign);reset.scenes[0].resolutions.push({id:'reset',label:'reset',text:'reset',instructions:[{path:'world.eliasStatus',op:'set',value:'separated'}]});assert.throws(()=>new StoryEngine(reset));
const seen=new Set<string>(),ends=new Set<string>();let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let run=0;run<160;run++){
 const e=new StoryEngine(campaign);
 for(let step=0;step<15;step++){
  ok(e.resupply());capture(e);
  const choices=e.getChoices().filter(c=>c.allowed);assert.ok(choices.length,e.scene.id+' no primary');assert.ok(choices.every(c=>!c.choice.recovery));
  const c=choices[Math.floor(random()*choices.length)];ok(e.act(c.id));seen.add(e.scene.id+'/'+c.id);capture(e);
  assert.ok(e.getChoices().filter(c=>c.allowed).every(c=>c.choice.recovery),'primary reselection would erase history');
  const recovery=e.getChoices().filter(c=>c.allowed);
  if(recovery.length&&(!e.getResolutions().some(r=>r.allowed)||random()<.5)){const r=recovery[0];ok(e.act(r.id));seen.add(e.scene.id+'/'+r.id);capture(e);}
  const w=e.state.world;if(w.falseSafetyReport)assert.equal(w.eliasStatus,'injured');
  if(step===3&&w.falseSafetyReport){assert.match(e.scene.entryText,/周岑/);assert.doesNotMatch(e.scene.entryText,/接通的是艾里亚斯/);}
  if(step===14&&w.breakerFault)assert.equal(e.getChoices().find(x=>x.id==='continue-ascent')?.allowed,false);
  const routes=e.getResolutions().filter(r=>r.allowed);assert.ok(routes.length,e.scene.id+' dead end');ok(e.resolve(routes[0].resolution.id));roundtrip(e);ok(e.advance());
 }
 assert.equal(e.state.phase,'ended');roundtrip(e);ends.add(e.state.endingId!);
}
for(const s of campaign.scenes)for(const c of s.choices)assert.ok(seen.has(s.id+'/'+c.id),'unreachable / uncovered '+s.id+'/'+c.id);
for(const ending of campaign.endings)assert.ok(ends.has(ending.id),'uncovered ending '+ending.id);
const outcomes=new Set<string>();
for(const id of ['lure-dark','lure-noise','false-clear','isolate-cargo']){
 const e=new StoryEngine(campaign);capture(e);assert.equal(e.act('recover-isolation').ok,false);ok(e.act(id));outcomes.add(JSON.stringify([e.state.world.dockCreature,e.state.world.eliasStatus]));capture(e);
 assert.equal(e.act(id==='isolate-cargo'?'false-clear':'isolate-cargo').ok,false);
 if(id==='false-clear'){ok(e.act('secure-injured'));capture(e);assert.equal(e.state.world.eliasStatus,'injured');assert.equal(e.state.world.partner,'keeper');}
 const route=e.getResolutions().find(r=>r.allowed)!;ok(e.resolve(route.resolution.id));const status=e.state.world.eliasStatus;ok(e.advance());assert.equal(e.state.world.eliasStatus,status);roundtrip(e);
}
assert.equal(outcomes.size,4);
console.log(`PASS causal narrative: ${seen.size} actions/recoveries, ${ends.size} endings, 160 complete bounded routes; injury continuity, distinct monster positions, guarded recovery, save replay and structural regression gates.`);
