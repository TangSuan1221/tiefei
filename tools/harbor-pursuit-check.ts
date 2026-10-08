import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {HarborPursuit} from '../src/pod/sim/harbor-pursuit';

function rng(seed:number){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};}
const inWallSlab=(p:Vector3)=>{
 const inBox=p.x>69.45&&p.x<85.25&&p.z>1.05&&p.z<16.25,interior=p.x>69.95&&p.x<84.75&&p.z>1.55&&p.z<15.75;
 const gateway=p.x>72.7&&p.x<82&&p.z>15.5;
 return inBox&&!interior&&!gateway;
};
const run=(m:HarborPursuit,seconds:number,player:Vector3,pulse:boolean,noise=false,gate=true,heading=180,check?:(p:Vector3)=>void)=>{
 for(let t=0;t<seconds;t+=.1){m.tick(.1,player,pulse,noise,gate,false,heading);assert.ok(!inWallSlab(m.position),'walked through a cargo wall at '+m.position.toArray());check?.(m.position);}
};
const cargoPod=new Vector3(77,1,7),outsidePod=new Vector3(77,1,26);

for(let seed=1;seed<=24;seed++){
 const m=new HarborPursuit(rng(seed)),start=m.position.clone();
 assert.ok(!m.inside,'spawns outside the cargo');
 let travelled=0,last=start.clone();
 run(m,60,new Vector3(20,0,30),false,false,true,0,p=>{travelled+=p.distanceTo(last);last.copy(p);});
 assert.ok(travelled>5,`roams when nothing calls it (seed ${seed}, ${travelled.toFixed(1)} m)`);
 assert.ok(!m.inside&&!m.hunting,'roaming stays outside and calm');

 run(m,5,new Vector3(m.position.x+14,0,m.position.z),false,true);
 assert.ok(!m.hunting,'distant engine wash is inaudible');

 let entered=-1,t=0;
 run(m,30,cargoPod,true,false,true,180,()=>{t+=.1;if(entered<0&&m.inside)entered=t;});
 assert.ok(entered>0&&entered<25,`pulse in cargo draws it through the gate (seed ${seed}, ${entered.toFixed(1)} s)`);
 const before=m.position.clone();let moved=0,prev=before.clone();
 run(m,6,cargoPod,true,false,true,180,p=>{moved+=p.distanceTo(prev);prev.copy(p);assert.ok(m.inside,'prowls inside the cargo');assert.ok(Math.hypot(p.x-77,p.z-7)>1.6,'never merges with the hull');});
 assert.ok(moved>2,`keeps prowling around the hull instead of freezing (seed ${seed}, ${moved.toFixed(1)} m)`);

 const retreat=cargoPod.clone();
 for(let t=0;t<90;t+=.1){retreat.z=Math.min(30,7+t*.4);assert.ok(!m.hears(retreat,false,true),'engine wash during the retreat is ignored');m.tick(.1,retreat,false,true,true,false,0);assert.ok(m.inside,'driving out at speed after the pulse leaves it searching inside');}
 run(m,120,outsidePod,false,false,true,180,()=>assert.ok(m.inside,'silent pod: it keeps searching inside the cargo'));

 run(m,25,outsidePod,true,false,true,0);
 assert.ok(!m.inside,'a continued pulse outside draws it back out');
 const outside=new HarborPursuit(rng(seed+100));
 run(outside,30,new Vector3(77,1,22),true,false,true,0);
 assert.ok(!outside.inside,'a pulse from outside the cargo never lures it inside');
 run(outside,15,new Vector3(77,1,22),false);
 const near=Math.hypot(outside.position.x-77,outside.position.z-22);assert.ok(near<9,'it searches where the sound died');
 run(outside,90,new Vector3(77,1,22),false);
 assert.ok(!outside.hunting,'after searching it returns to patrol');

 const shut=new HarborPursuit(rng(seed+200));
 run(shut,40,cargoPod,true,false,false);
 assert.ok(!shut.inside&&Math.abs(shut.position.x-77)<.5&&shut.position.z>16.3,'closed gate stops it at the doorway');
}
console.log('PASS harbor pursuit: roaming, short engine range, walled route through the gate, hull prowl, cargo search, outside-pulse rejection, return to patrol');
