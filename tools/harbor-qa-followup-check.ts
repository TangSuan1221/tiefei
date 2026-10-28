import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {HarborPursuit} from '../src/pod/sim/harbor-pursuit';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
const p=new HarborPursuit(()=>.5),r=new HarborRescue(),door=new Vector3(57,-1.2,11);
r.step(.1,{nearB:true,zone:'none',activeSonar:false});r.listen();r.reply();r.interact('power');r.interact('observe');p.position.set(77,-1.2,7);r.step(.1,{nearB:true,zone:'lure',activeSonar:false,monsterInside:true});r.requestDeparture();
r.step(2,{nearB:true,zone:'none',activeSonar:false,monsterInside:true,chapterOne:true,personnelApproaching:true,npcThreat:true});assert.equal(r.state.injured,false,'even an erroneous threat flag cannot hurt from inside cargo');
let left=false,injuredAt=0;
for(let t=.1;t<=60;t+=.1){const before=p.position.clone();p.tickPersonnel(.1,door,true,false);assert.ok(p.position.distanceTo(before)<=.221,'no teleport');if(!p.inside)left=true;const threat=!p.inside&&p.position.distanceTo(door)<3.2;r.step(.1,{nearB:true,zone:'none',activeSonar:false,monsterInside:p.inside,chapterOne:true,personnelApproaching:true,npcThreat:threat});if(p.inside)assert.equal(r.state.injured,false,'cannot attack from cargo');if(r.state.injured){injuredAt=t;break;}}
assert.ok(left);assert.ok(injuredAt>1.5&&injuredAt<60);assert.equal(r.state.monsterInside,false);assert.equal(r.state.epoch,2,'leaving cargo invalidates entry evidence');
const blocked=new HarborPursuit(()=>.5);blocked.position.set(77,-1.2,7);for(let n=0;n<400;n++)blocked.tickPersonnel(.1,door,false,false);assert.equal(blocked.inside,true,'closed gate blocks route');const fixed=blocked.position.clone();blocked.tickPersonnel(1,door,true,true);assert.deepEqual(blocked.position,fixed,'isolation overrides door sound');
console.log('PASS: gate-routed approach, bounded movement, no inside-cargo injury, actual exit invalidation, isolated/closed-gate containment; injury at '+injuredAt.toFixed(1)+'s.');
