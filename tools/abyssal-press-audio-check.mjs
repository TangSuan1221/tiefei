import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo} from './living-browser-lib.mjs';
const {page,browser,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts');
  const gate=l.ABYSS_GATES.find(g=>g.id==='press'),source=l.spiralPoint(gate.t,0,gate.floor+3),events=[];
  const original=r.onCue;r.onCue=(cue,gain,space)=>events.push({cue,gain,space});
  r.heading=0;s.position.set(source[0]-10,source[1],source[2]);
  const noise=r.noise;
  try{
   s.time=2.99;s.tick(.02);const closed=s.world.gates.get('press').visible;
   for(let i=0;i<20;i++)s.tick(.02);const afterHold=events.length;
   s.time=9.99;s.tick(.02);const open=!s.world.gates.get('press').visible;
   s.position.x=source[0]+10;s.time=12.99;s.tick(.02);
   s.position.x=source[0]+100;s.time=19.99;s.tick(.02);const afterFar=events.length;
   return {events,closed,open,afterHold,afterFar,noiseUnchanged:noise===r.noise};
  }finally{r.onCue=original;}
 });
 assert(result.closed&&result.open);assert.equal(result.afterHold,1);assert.equal(result.afterFar,3);
 assert.deepEqual(result.events.map(e=>e.cue),['door.close','door.open','door.close']);
 assert(result.events[0].space.pan>.9&&result.events[2].space.pan<-.9);
 assert(result.events.every(e=>e.space.flooded&&Math.abs(e.space.dist-10)<.001));assert(result.noiseUnchanged);
 assert(!errors.some(e=>e.startsWith('pageerror')));
 await writeFile('qa/level-03/runtime/press-audio.json',JSON.stringify({diagnostic:true,...result,errors},null,2));console.log({result,errors});
}finally{await browser.close();}
