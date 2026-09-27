import assert from 'node:assert/strict';
import {encounterVideoPrompt,type CombatRecord} from '../src/pod/sim/weapon-feedback';
const r:CombatRecord={weapon:'pulse',encounter:1,at:0,creature:'cre.runner',appearance:'a fast crawling marine predator',hit:true,result:'legacy firing description'};
const cases={missed:'device missed',interrupted:'Temporarily interrupted',returned:'resuming directed approach',repelled:'Confirmed repelled'} as const;
for(const [outcome,expected] of Object.entries(cases)){
 const prompt=encounterVideoPrompt('combat',r.appearance,'inside the current flooded room',false,{...r,outcome:outcome as CombatRecord['outcome']});
 assert(prompt.includes(expected));assert(prompt.includes('NOT a replay of firing'));assert(!prompt.includes(r.result));
}
const analysis=encounterVideoPrompt('analysis',r.appearance,'room',true);assert(!analysis.includes('Post-action verification'));assert(analysis.includes('No weapon impact'));
console.log('PASS four distinct combat outcomes and separate observation template');
