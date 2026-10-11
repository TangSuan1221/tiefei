import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {sweepHarborRetreat} from '../src/pod/sim/harbor-navigation';

// The predicate models the already-inflated forbidden interval for a hull,
// rather than shrinking the real boat to a point. Both endpoints are clear.
const start=new Vector3(0,0,0),visited:Vector3[]=[];
const clear=(p:Vector3)=>{visited.push(p.clone());return p.z<.11||p.z>.19;};
assert.equal(clear(new Vector3(0,0,.3)),true,'old endpoint-only retreat accepts far side');
const safe=sweepHarborRetreat(start,0,.3,clear);
assert.ok(safe.z>0&&safe.z<.11,'retreat must stop before intermediate structure');
assert.deepEqual(start.toArray(),[0,0,0],'sweep must not mutate current position');
const invalid=sweepHarborRetreat(new Vector3(0,0,.15),0,.3,clear);
assert.equal(invalid.z,.15,'invalid start cannot teleport to free space');
const reverse=sweepHarborRetreat(start,90,.3,()=>true);
assert.ok(Math.abs(reverse.x+.3)<1e-10&&Math.abs(reverse.z)<1e-10);
let previous=0;
for(const p of visited.slice(1).filter(p=>p.z<=safe.z)){assert.ok(p.z-previous<=.040001);previous=p.z;}
console.log('PASS automatic retreat sweeps <=0.04m, stops before thin structures, preserves invalid start and heading');
