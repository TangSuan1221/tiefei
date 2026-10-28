import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {abyssHullClear,abyssSegmentClear} from '../src/pod/sim/abyssal-navigation';
import {ABYSS_SPAWN,ABYSS_ITEMS,podRoute,spiralPoint,type Vec3} from '../src/pod/content/abyssal-lab-layout';
let at=ABYSS_SPAWN.position,h=ABYSS_SPAWN.heading,total=0;
for(const [i,leg] of podRoute().entries()){
 const dx=leg.to[0]-at[0],dz=leg.to[2]-at[2],d=new Vector3(...leg.to).distanceTo(new Vector3(...at));
 const target=leg.reverse?h:Math.hypot(dx,dz)>.3?(Math.atan2(dx,-dz)*180/Math.PI+360)%360:h;
 const delta=(target-h+540)%360-180,n=Math.ceil(Math.abs(delta)/.5);
 for(let k=1;k<=n;k++)assert(abyssHullClear(at,h+delta*k/n,true,true),`turn ${i}`);
 h=target;assert(abyssSegmentClear(at,leg.to,h,true,true),`segment ${i}: ${at} → ${leg.to}`);total+=d;at=leg.to;
}
assert(!abyssHullClear(spiralPoint(3.75),0,false,false),'closed sluice blocks hull');
assert(abyssHullClear(ABYSS_SPAWN.position,ABYSS_SPAWN.heading,false,false),'spawn clear');
console.log(`PASS actual gameplay hull route ${total.toFixed(1)}m; 0.08m moves, 0.5 degree turns, closed sluice blocks.`);
