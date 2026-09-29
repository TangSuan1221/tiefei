import {writeFileSync,mkdirSync} from 'node:fs';
import {campaign} from '../src/narrative-lab/campaign';
import {StoryEngine} from '../src/narrative-lab/engine';
import {rankCandidates} from '../src/narrative-lab/director';
const requireOk=(r:{ok:boolean;message:string})=>{if(!r.ok)throw Error(r.message);};
function photo(e:StoryEngine){requireOk(e.resupply());requireOk(e.shoot());e.tick(17);requireOk(e.analyze());requireOk(e.report());}
function at(index:number){const e=new StoryEngine(campaign);for(let i=0;i<index;i++){photo(e);requireOk(e.act(e.getChoices().find(c=>c.allowed)!.id));photo(e);requireOk(e.resolve(e.getResolutions().find(r=>r.allowed)!.resolution.id));requireOk(e.advance());}photo(e);return e;}
const cases:unknown[]=[];const keys:unknown[]=[];
for(const [i,index] of [0,3,4,6,8,11].entries()){
 const e=at(index);const fixture=e.snapshot();fixture.pod.power=i%2?.24:.85;fixture.pod.hull=i===4?.6:1;requireOk(e.restore(JSON.stringify(fixture)));
 const legal=e.getChoices().filter(c=>c.allowed);const authored=legal[0];const context=rankCandidates(e.snapshot(),legal)[0];
 const choices=i%2?[context,authored]:[authored,context];
 const variants=choices.map((c,j)=>{const copy=new StoryEngine(campaign);requireOk(copy.restore(e.serialize()));requireOk(copy.act(c.id));requireOk(copy.shoot());copy.tick(17);requireOk(copy.analyze());const result=copy.snapshot();return {label:j?'方案 琥珀':'方案 铂',proposal:c.choice.label,recordedResult:result.tapes.at(-1)?.text,postActionResources:result.pod,availableResultDecisions:copy.getResolutions().filter(r=>r.allowed).map(r=>r.resolution.label),valid:true};});
 cases.push({id:`CASE-${i+1}`,scene:e.scene.title,publicContext:{power:fixture.pod.power,hull:fixture.pod.hull,scout:e.scene.scoutFootage,known:fixture.knowledge.player},variants});
 keys.push({case:i+1,platinum:i%2?'context-telemetry':'authored-order',amber:i%2?'authored-order':'context-telemetry',sameChoice:authored.id===context.id});
}
mkdirSync('qa/narrative',{recursive:true});writeFileSync('qa/narrative/anonymous-comparison.json',JSON.stringify({method:'Label-blinded agent review of executable model transcripts. Not human blind play. Both policies use identical legal choices, scene data and guard checks; only suggestion order differs.',cases},null,2));
writeFileSync('qa/narrative/comparison-key.json',JSON.stringify(keys,null,2));console.log('Wrote six paired model scenarios. Reviewer must not read comparison-key before recording verdicts.');
