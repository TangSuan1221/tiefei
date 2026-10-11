import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createHarborLevel} from '../src/pod/content/harbor-level';
import {harborRouteLookAhead} from '../src/pod/sim/harbor-route-guidance';
const path=createHarborLevel().edges.find(e=>e.id==='harbor.edge.A-C')!.path!.map(p=>new Vector3(...p));
const route=[...path,new Vector3(18,0,35),new Vector3(27,0,35)];
const first=harborRouteLookAhead(new Vector3(11,0,20),route);
assert(first.x<12&&first.z<24,'must guide into bend, not directly through wall to east door');
for(let i=0;i<path.length-1;i++)for(let j=0;j<10;j++){
 const p=path[i].clone().lerp(path[i+1],j/10),q=harborRouteLookAhead(p,route);
 assert(q.distanceTo(p)<=2.401,'look ahead must remain local');
 assert(q.z>=p.z-.001,'must not reverse a pilot following the passage');
}
assert.deepEqual(harborRouteLookAhead(new Vector3(27,0,35),route).toArray(),[27,0,35]);
assert.deepEqual(harborRouteLookAhead(new Vector3(6,0,22),route).toArray(),[11,0,22],'off-route pilot returns to passage before looking ahead');
console.log('PASS harbor bend guidance: local ahead bearings, off-route recovery, endpoint stability');
