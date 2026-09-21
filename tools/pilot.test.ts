import test from 'node:test';
import assert from 'node:assert/strict';
import {PilotMotion} from '../src/pod/sim/pilot';
import {PodRun} from '../src/pod/sim/run';
test('acceleration, coasting, braking and reversal are gradual',()=>{
 const p=new PilotMotion();p.step(.05,1,0,0);assert.ok(p.speed>0&&p.speed<.03);
 for(let i=0;i<100;i++)p.step(.05,1,0,0);
 const fast=p.speed;p.step(.05,0,0,0);assert.ok(p.speed>0&&p.speed<fast);
 for(let i=0;i<100;i++)p.step(.05,0,0,0,true);
 assert.ok(p.speed<.01);
 for(let i=0;i<100;i++)p.step(.05,-1,0,0);
 assert.ok(p.speed<-.2&&p.speed>=-.65);
});
test('frame-rate stable displacement and turn inertia',()=>{
 const advance=(dt:number)=>{const p=new PilotMotion();let d=0;for(let t=0;t<5-dt/2;t+=dt)d+=p.step(dt,1,1,0).distance;return {p,d};};
 const a=advance(1/30),b=advance(1/60);assert.ok(Math.abs(a.d-b.d)<.06);
 const rate=a.p.yawRate;a.p.step(.03,0,0,0);assert.ok(a.p.yawRate>0&&a.p.yawRate<rate);
});
test('real run continuously advances, coasts and safely stops on blocked input',()=>{
 const r=new PodRun(42);r.walkTo('camera');
 const start=r.traveled;
 for(let i=0;i<120;i++){r.holdPilot(1,0,0);r.frame(1/60);}
 assert.ok(r.traveled>start+1&&r.traveled<start+30);
 const v=r.pilot.speed,d=r.traveled;r.holdPilot(0,0,0);r.frame(.05);
 assert.ok(r.traveled>d&&r.pilot.speed<v);
 r.driveInputBlocked=true;const blocked=r.traveled;r.frame(.05);assert.equal(r.pilot.speed,0);assert.equal(r.traveled,blocked);
});
test('arrival stops motion and emits arrival only once',()=>{
 const r=new PodRun(42);r.walkTo('camera');r.traveled=r.leg.length-.001;
 r.holdPilot(1,0,0);r.frame(.05);assert.equal(r.phase,'site');assert.equal(r.pilot.speed,0);
 assert.equal(r.campaign.journal.filter(e=>e.id==='0.arrival').length,1);
});
