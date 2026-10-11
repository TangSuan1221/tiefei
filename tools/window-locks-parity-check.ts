import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Box3,PerspectiveCamera,Vector3} from 'three';
import {collectWindowLocks as original} from './window-locks-reference';
import {collectWindowLocks as improved} from '../src/pod/view/window-locks';
const data=JSON.parse(readFileSync('qa/window-locks-browser-optimized.json','utf8'));
const solids=data.solids.map(([a,b]:number[][])=>new Box3(new Vector3(...a),new Vector3(...b)));
const c=new PerspectiveCamera(data.camera.fov,data.camera.aspect,.08,data.camera.far),rows=[];
for(const sample of data.results){c.position.set(sample.position[0],sample.position[1],sample.position[2]);c.rotation.y=-sample.heading*Math.PI/180;c.updateMatrixWorld(true);const targets=solids.filter((_:Box3,i:number)=>i%300===0).map((bounds:Box3,i:number)=>({id:String(i),bounds,reach:3.4,enabled:i%2===0}));const a=performance.now(),expected=original(c,solids,targets),b=performance.now(),actual=improved(c,solids,targets),d=performance.now();assert.deepEqual(actual,expected,JSON.stringify(sample));rows.push({position:sample.position,heading:sample.heading,locks:actual.length,original:b-a,improved:d-b});}
// Camera inside and on a bound are important BVH slab edge cases.
for(const b of solids.filter((_:Box3,i:number)=>i%200===0)){c.position.copy(b.getCenter(new Vector3()));c.updateMatrixWorld(true);assert.deepEqual(improved(c,solids,[]),original(c,solids,[]));}
writeFileSync('qa/window-locks-bvh-parity.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({cases:rows.length+Math.ceil(solids.length/200),worst:rows.sort((a,b)=>b.original-a.original).slice(0,6)}));


