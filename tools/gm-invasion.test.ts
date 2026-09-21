import test from 'node:test';
import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
test('GM invasion enters real attack warning and exposure captures attack state without auto generation',()=>{
 const r=new PodRun(42);let requests=0;r.footageSink=()=>{requests++;};
 const message=r.gmInvasion();
 assert.match(message,/120 秒/);assert.equal(r.phase,'site');assert.equal(r.mode,'alert');
 assert.equal(r.threat?.behavior,'warning');assert.equal(requests,0);
 r.walkTo('camera');r.beginShoot();
 assert.equal(r.shot.capture?.direction?.state,'attack');
 assert.equal(r.shot.capture?.direction?.evidence,true);
 const encounter=r.threat?.encounter;
 assert.match(r.gmInvasion(),/尚未结束/);assert.equal(r.threat?.encounter,encounter);
});
test('GM warning duration bounded',()=>{
 const r=new PodRun(42);r.gmInvasion(1);assert.equal(r.threat?.warningLeft,15);
 r.gmInvasion(900);assert.equal(r.threat?.warningLeft,300);
});
