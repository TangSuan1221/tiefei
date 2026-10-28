import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss&&window.__pod?.authoredSite,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const s=window.__abyss,r=window.__pod; r.pilot.stop();r.lamp=true;
  const layout=await import('/src/pod/content/abyssal-lab-layout.ts');const THREE=await import('/node_modules/.vite/deps/three.js');s.time=0;
  const result={index:r.legIndex,adapter:s.snapshot().adapter,spawn:s.position.toArray(),blocked:[],routeMetres:0};
  // Geometry diagnostic only: door prerequisites are injected; no media or chapter completion is granted.
  s.story.sync({'sluice.open':true,'drain.open':true,'containment.captured':3});
  let h=r.heading;
  for(const [index,leg] of layout.podRoute().entries()){
   const dx=leg.to[0]-s.position.x,dy=leg.to[1]-s.position.y,dz=leg.to[2]-s.position.z;
   const dist=Math.hypot(dx,dz);const desired=leg.reverse?h:dist>.3?(Math.atan2(dx,-dz)*180/Math.PI+360)%360:h;
   const delta=((desired-h+540)%360)-180;r.heading=s.turn(delta);h=r.heading;
   if(Math.abs(((desired-h+540)%360)-180)>.01){result.blocked.push({index,type:'turn',pos:s.position.toArray(),desired,h});break;}
   const n=Math.ceil(Math.hypot(dist,dy)/.08);
   for(let i=0;i<n;i++){
    // Use the actual production translation sweep along the authored ramp vector.
    const ok=s.translate(new THREE.Vector3(dx/n,dy/n,dz/n));
    if(!ok){result.blocked.push({index,type:'move',pos:s.position.toArray(),target:leg.to});break;}
   }
   result.routeMetres+=Math.hypot(dist,dy);if(result.blocked.length)break;
  }
  result.exit=s.position.toArray();result.falseMedia=s.analyzeEvidence({shotId:'L3-P01'});result.photoGranted=!!s.story.state['photo.pit'];
  s.position.set(...layout.ABYSS_SPAWN.position);r.heading=layout.ABYSS_SPAWN.heading;s.story.sync({'sluice.open':false,'drain.open':false,'containment.captured':0});
  return result;
 });
 await page.screenshot({path:'qa/level-03/runtime/entry.png'});
 await writeFile('qa/level-03/runtime/result.json',JSON.stringify({result,errors},null,2));
 assert.equal(result.index,2);assert.equal(result.adapter,'abyssal-lab');assert.deepEqual(result.blocked,[]);assert.equal(result.photoGranted,false);console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}

