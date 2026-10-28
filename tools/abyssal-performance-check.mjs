import {openLevelTwo,sit} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try {
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 await page.evaluate(()=>window.__abyss.world.ready);
 await sit(page);
 const samples=[];
 for(const zone of ['gallery','pit','plant']){
  await page.evaluate(async zone=>{
   const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts');
   const t=zone==='gallery'?1.4:6.31;
   const p=zone==='pit'?l.pitAt(l.PIT_ENTRY_ANGLE,27,1):l.spiralPoint(t,0,zone==='plant'?-9:0);
   s.position.set(...p);r.heading=zone==='pit'?l.headingTo(p,l.pitAt(l.PIT_ENTRY_ANGLE+Math.PI,20,-20)):l.spiralHeading(t);
   r.pitch=0;r.lamp=true;r.pilot.stop();r.power=1;
  },zone);
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(async zone=>{
   const site=window.__abyss,original=site.draw,drawTimes=[];
   site.draw=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{drawTimes.push(performance.now()-start);}};
   const deltas=[];let last=await new Promise(requestAnimationFrame);
   try{for(let n=0;n<90;n++){const now=await new Promise(requestAnimationFrame);deltas.push(now-last);last=now;}}finally{site.draw=original;}
   const sorted=[...deltas].sort((a,b)=>a-b),mean=deltas.reduce((a,b)=>a+b,0)/deltas.length;
   return {zone,samples:deltas.length,meanMs:mean,p50Ms:sorted[45],p95Ms:sorted[85],observedRafHz:1000/mean,sceneDraws:drawTimes.length,meanSceneSubmitMs:drawTimes.length?drawTimes.reduce((a,b)=>a+b,0)/drawTimes.length:null};
  },zone));
 }
 const result={diagnostic:true,viewport:'1600x900',environment:'headless Edge on this machine; other agent browsers may compete',method:'Actual application requestAnimationFrame intervals at diagnostic stationary positions; no video generation',samples,errors};
 await writeFile('qa/level-03/runtime/performance.json',JSON.stringify(result,null,2));console.log(result);
} finally {await browser.close();}
