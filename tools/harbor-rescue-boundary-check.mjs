import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const {Vector3}=await import('/node_modules/three/build/three.module.js');
  const {harborHullClear}=await import('/src/pod/sim/harbor-navigation.ts');
  const r=window.__pod;if(!r.authoredSite){r.receive();r.arrive();}const s=r.authoredSite;
  const all=s.base.navigationSolids(),staticSolids=s.world.colliders,walkable=s.world.walkable;
  const floor=staticSolids.filter(b=>Math.abs(b.min.y+3.012)<.002&&Math.abs(b.max.y+3)<.002&&b.max.z-b.min.z>21.9);
  const fence=staticSolids.filter(b=>Math.abs(b.min.z-17.991)<.002&&b.max.y-b.min.y>46.9);
  const failures=[],counts={floor:0,fence:0,motion:0};
  const verify=(ok,reason,data)=>{if(!ok&&failures.length<20)failures.push({reason,...data});};
  verify(floor.length===24,'floor cable collider count',{count:floor.length});
  verify(fence.length===24,'north barrier collider count',{count:fence.length});
  // Actual generated collision boxes, not copies of the intended coordinates.
  // At passage mouths the room union extends beyond a cable endpoint, so actual
  // pressure-shell/door collision is included for those boundary candidates.
  for(let h=0;h<180;h+=15)for(let x=32;x<=88;x+=.2){
   for(let z=18;z<=40;z+=1){
    const p=new Vector3(x,-1.52,z);counts.floor++;
    verify(!harborHullClear(p,h,walkable,floor)||!harborHullClear(p,h,walkable,all),'under-floor crossing gap',{x,z,h});
   }
   for(let y=-24.5;y<=19.5;y+=.5){
    const p=new Vector3(x,y,18);counts.fence++;
    verify(!harborHullClear(p,h,walkable,fence)||!harborHullClear(p,h,walkable,all),'north crossing gap',{x,y,h});
   }
  }
  for(let x=88;x<=94;x+=.2)for(const h of [0,15,30,45,60,75,90])for(const y of [-1,0,1]){
   verify(!harborHullClear(new Vector3(x,y,18),h,walkable,all),'east corridor fence-end bypass',{x,y,h});
  }
  // Controls and ordinary legal positions must remain navigable; then exercise
  // the real movement sweep down to the cable, including oblique headings.
  for(const [x,z]of [[42,28],[60,27],[78,26],[60,35]])for(const h of [0,45,90,135]){
   s.position.set(x,0,z);r.heading=h;if(!harborHullClear(s.position,h,walkable,all))continue;
   let steps=0;while(steps++<100&&s.base.moveVertical(-.04)){}counts.motion++;
   verify(s.position.y>=-1.501,'movement crossed south support cables',{x,z,h,y:s.position.y});
   verify(s.position.y<-.5,'movement check blocked before floor was tested',{x,z,h,y:s.position.y});
  }
  // A south corridor return at a depth below the support cable must not sneak
  // under its endpoint. Probe the B-D mouth with full world solids/walkable.
  for(let x=39.5;x<=48.5;x+=.25)for(const h of [0,45,90,135])for(let y=-4.6;y>=-9;y-=.2){
   verify(!harborHullClear(new Vector3(x,y,40.1),h,walkable,all),'deep south mouth bypass',{x,y,h});
  }
  verify(counts.motion===16,'all expected motion starts were exercised',{count:counts.motion});
  return{passed:failures.length===0,counts,cableCounts:{floor:floor.length,fence:fence.length},includesClosedDoors:true,failures};
 });
 await mkdir('qa/harbor/deep-boundary',{recursive:true});await writeFile('qa/harbor/deep-boundary/results.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));assert.equal(result.passed,true,'Deep harbor boundary regression failed');
}finally{await browser.close();}



