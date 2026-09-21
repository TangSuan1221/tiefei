import test from 'node:test';
import assert from 'node:assert/strict';
import {damageAlarm} from '../src/pod/view/damage-alarm';
import {PodRun} from '../src/pod/sim/run';
test('repeated invasion impacts actually cross the red-light threshold',()=>{
 const r=new PodRun(42);r.gmInvasion(120);
 for(let i=0;i<360;i++)r.frame(.05);
 assert.ok(r.hull<=.5,`hull=${r.hull}`);
 assert.equal(damageAlarm(r.hull,18).level,1);
 assert.equal(r.outcome.kind,'alive');
});
test('actual hull damage controls alarm and repair clears it',()=>{
 assert.equal(damageAlarm(.71,1).level,0);
 assert.equal(damageAlarm(.5,1).level,1);
 assert.equal(damageAlarm(.25,1).level,2);
 assert.equal(damageAlarm(.51,1).intensity,0);
 assert.ok(damageAlarm(.2,1).intensity>damageAlarm(.2,0).intensity);
});
