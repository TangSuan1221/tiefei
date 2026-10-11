import assert from 'node:assert/strict';
import {Ray,Vector3} from 'three';
import {HarborRescueSite} from '../src/pod/view/deepsea/harbor-rescue-site';
import {newArm,stepArm,beginHaul} from '../src/pod/sim/manipulator';
function fixture(){
 const s=Object.create(HarborRescueSite.prototype) as any;let commits=0,boxes=0;
 const r:any={arm:newArm(),shot:{viewing:false},outcome:{kind:'alive'},driveBlock:null,lit:true,powered:true,power:1,pilot:{stop(){}},addNoise(){},retractArm(){beginHaul(r.arm);}};
 s.run=r;s.ray={ray:new Ray(new Vector3(),new Vector3(0,0,-1))};s.feedback=()=>{};
 s.base={setExternalArmAnchor(){},level:{items:[{id:'box',kind:'cache'}]},interact(){boxes++;},armEvent(){return true;}};
 s.hit={id:'',door:'harbor.edge.A-C',distance:3.3};s.aimedInterface=()=>s.hit;s.commitFacility=()=>commits++;
 const advance=(seconds:number)=>{for(let t=0;t<seconds;t+=.05)for(const e of stepArm(r.arm,.05,{atCamera:true,atSalvage:false,powered:r.powered,lit:r.lit,onStation:true})){
  if(e.kind==='grip')s.armEvent('grip',e.obstacleId);if(e.kind==='phase'&&e.phase==='stowed')s.armEvent('stowed');
 }};
 return {s,r,advance,commits:()=>commits,boxes:()=>boxes};
}
for(const hit of [{id:'',door:'harbor.edge.A-C',distance:3.3},{id:'harbor.rescue.power',door:'',distance:3.3},{id:'harbor.rescue.observe',door:'',distance:3.3}]){
 const f=fixture();f.s.hit=hit;f.s.interact();assert.equal(f.r.arm.phase,'extending');assert.equal(f.commits(),0);
 f.s.interact();assert.equal(f.commits(),0);f.advance(3.5);assert.equal(f.r.arm.phase,'aiming');assert.equal(f.commits(),0);
 f.s.interact();assert.equal(f.r.arm.phase,'gripping');f.advance(1);assert.equal(f.commits(),0);f.advance(1);assert.equal(f.commits(),1);
 f.s.interact();assert.equal(f.r.arm.phase,'hauling');f.advance(3);assert.equal(f.r.arm.phase,'stowed');assert.equal(f.s.facilityArm,null);
}
{const f=fixture();f.s.hit.distance=3.5;f.s.interact();assert.equal(f.r.arm.phase,'stowed');}
{const f=fixture();f.r.lit=false;f.s.interact();assert.equal(f.r.arm.phase,'stowed');}
{const f=fixture();f.s.interact();f.advance(3.5);f.s.interact();f.s.hit={id:'',door:'other',distance:2};f.advance(2);assert.equal(f.commits(),0);}
{const f=fixture();f.s.interact();f.advance(1);f.r.retractArm();f.advance(3);assert.equal(f.commits(),0);assert.equal(f.s.facilityArm,null);}
{const f=fixture();f.s.hit={id:'box',door:'',distance:3};f.s.interact();assert.equal(f.boxes(),1);}
console.log('PASS harbor facility arm: doors/power/gate require extend-confirm-grip-haul; range, darkness, target change, cancellation and box delegation');
