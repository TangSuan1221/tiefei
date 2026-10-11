import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {sonarMapContours} from '../src/pod/sim/sonar-map';
const box=(x:number,z:number,y=0)=>new Box3(new Vector3(x-.5,y-1,z-.5),new Vector3(x+.5,y+1,z+.5));
const origin=new Vector3();
// Both occluding wall and object behind it, plus screen corner beyond 24m radius.
assert.equal(sonarMapContours(origin,0,[box(0,-5),box(0,-12),box(23,23),box(30,0),box(0,0,8)],24).length,3);
const p=sonarMapContours(origin,90,[box(10,0)],24)[0];
assert.ok(p.every(q=>q.y<0),'east appears ahead at heading 90');
assert.equal(sonarMapContours(origin,0,[],24).length,0,'removed colliders leave no outline');
console.log('sonar-map: occluded structures, full-screen corners, height slice, rotation and removal passed');
