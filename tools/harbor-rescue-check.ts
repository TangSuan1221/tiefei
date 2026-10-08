import assert from 'node:assert/strict';
import {HarborRescue,RESCUE_TIMING,type RescueZone} from '../src/pod/sim/harbor-rescue';
const shoot=(r:HarborRescue,id:string,kind:Parameters<HarborRescue['capture']>[1],visible=true)=>{const e=r.capture(id,kind,visible);r.commitCapture(e);return e;};
const tick=(r:HarborRescue,dt:number,zone:RescueZone='none',activeSonar=false)=>r.step(dt,{nearB:true,zone,activeSonar});
function warned(){const r=new HarborRescue();assert.equal(r.listen().events.length,0);r.step(3,{nearB:false,zone:'none',activeSonar:true});assert.equal(r.state.signal,false);tick(r,1);r.listen();r.reply();r.analyze(shoot(r,'threat','threat',true));assert.equal(r.state.warned,true);return r;}
function lure(r:HarborRescue){r.interact('power');r.interact('observe');tick(r,RESCUE_TIMING.lure+1,'lure',true);assert.equal(r.state.monsterInside,true);}
{
 const r=warned();lure(r);const photo=shoot(r,'inside','lure',true);assert.equal(r.state.lureConfirmed,true);
 tick(r,50,'none',false);assert.equal(r.state.monsterInside,true,'time for film processing and return');
 r.interact('observe',false);assert.equal(r.state.isolated,true);assert.equal(r.state.verified,false);
 const gate=shoot(r,'gate','gate',true);r.analyze(gate);assert.equal(r.state.verified,true);
 r.interact('rescue');tick(r,11);r.analyze(shoot(r,'departure','departure',true));r.interact('exit');assert.equal(r.state.complete,true);
 const saved=r.snapshot(),loaded=new HarborRescue();assert.equal(loaded.restore(saved),true);assert.deepEqual(loaded.snapshot(),saved);
 assert.equal(loaded.analyze(photo).events[0].includes('已经改变'),true,'old lure cannot authorize later cycle');
}
{
 const r=warned();lure(r);shoot(r,'miss','lure',false);r.interact('observe');assert.equal(r.state.isolated,false);assert.equal(r.state.gateClosed,true);assert.equal(r.state.monsterInside,false);
 r.interact('observe');tick(r,10,'lure',true);const old=shoot(r,'old','lure',true);tick(r,RESCUE_TIMING.hold+1);assert.equal(r.state.lureConfirmed,false);tick(r,10,'lure',true);r.analyze(old);assert.equal(r.state.lureConfirmed,false,'stale evidence must not revive confirmation');r.interact('observe');assert.equal(r.state.isolated,false);
}
{
 const r=warned();assert.equal(tick(r,7,'none',true).damage,0);assert.ok(tick(r,2,'none',true).damage>0);tick(r,30,'none',true);assert.equal(r.state.failed,true,'persistent sonar causes terminal damage');
 const safe=warned();lure(safe);assert.equal(safe.state.damageTotal,0);tick(safe,30,'lure',true);assert.ok(safe.state.damageTotal>0,'lure position does not give permanent sonar immunity');
}
{
 const r=warned();lure(r);const e=shoot(r,'proof','lure',true);const saved=r.snapshot();saved.lureConfirmed=false;saved.monsterInside=false;saved.powered=false;const before=r.snapshot();assert.equal(r.restore(saved),false);assert.deepEqual(r.snapshot(),before,'invalid restore is atomic');
 const clone=new HarborRescue();assert.equal(clone.restore(r.snapshot()),true);tick(clone,40);assert.equal(clone.state.monsterInside,true);clone.interact('observe');assert.equal(clone.state.isolated,true,'valid saved capture remains valid on restore');
 const forged={...e,kind:'gate' as const,gateClosed:true};assert.ok(r.analyze(forged).events[0].includes('重新曝光'));assert.equal(r.state.verified,false);
}
{
 const r=warned();lure(r);const cancelled=r.capture('cancelled','lure',true);assert.equal(r.state.lureConfirmed,false);r.cancelCapture(cancelled.id);r.commitCapture(cancelled);assert.equal(r.state.lureConfirmed,false,'cancelled exposure cannot authorize closure');assert.equal(r.state.captures.some(e=>e.id===cancelled.id),false);
 const stale=r.capture('started-before-expiry','lure',true);tick(r,RESCUE_TIMING.hold+1);r.commitCapture(stale);assert.equal(r.state.lureConfirmed,false,'completed old shutter snapshot cannot authorize changed scene');
 tick(r,10,'lure',true);const valid=r.capture('uninterrupted','lure',true);assert.equal(r.state.lureConfirmed,false);tick(r,5,'lure',false);r.commitCapture(valid);assert.equal(r.state.lureConfirmed,true);assert.equal(r.state.captures.find(e=>e.id===valid.id)?.epoch,valid.epoch);
}
console.log('PASS harbor rescue: signal gating, full rescue, failed closure/retry, stale/forged film, sonar grace/death, capture-preserving atomic restore');
