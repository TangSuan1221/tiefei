import assert from 'node:assert/strict';
import {advanceEncounter,newEncounterPressure,type EncounterStimuli} from '../src/pod/sim/harbor-encounters';
const quiet:EncounterStimuli={light:false,speed:0,noise:0,collision:false,interaction:false,story:false,active:false};
function trial(input:Partial<EncounterStimuli>,seconds=90){const s=newEncounterPressure();let warnings=0,spawns=0;for(let t=0;t<seconds*10;t++){const event=advanceEncounter(s,{...quiet,...input},.1);warnings+=Number(event==='warning');spawns+=Number(event==='spawn');}return {s,warnings,spawns};}
assert.equal(trial({}).spawns,0);
assert.equal(trial({light:true}).spawns,1);
assert.equal(trial({speed:1,noise:.4}).spawns,1);
assert.equal(trial({active:true,light:true}).spawns,0);
for(const kind of ['collision','interaction'] as const){const s=newEncounterPressure();s.cooldown=0;let spawned=false;for(let j=0;j<5;j++)spawned ||= advanceEncounter(s,{...quiet,[kind]:true},.1)==='spawn';assert(spawned,kind);}
const s=newEncounterPressure();s.cooldown=0;assert.equal(advanceEncounter(s,{...quiet,story:true},.1),'warning');
for(let i=0;i<1000;i++)advanceEncounter(s,quiet,.1);assert.equal(s.pressure,0);
console.log('PASS light / movement-noise / collision / interaction / story / quiet decay / active encounter protection');
