import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await browser.newPage();await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5173/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 const result=await p.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;r.lamp=true;
  s.position.set(60,0,20);for(let i=0;i<19;i++)s.tick(1);
  const first=r.threat?.encounter,creature=r.threat?.creature.id;
  for(let i=0;i<60;i++)s.tick(1);
  const noOverwrite=r.threat?.encounter===first;
  r.threat=null;r.lamp=false;r.pilot.speed=0;
  for(let i=0;i<150;i++)s.tick(1);
  const quietSafe=!r.threat;
  r.lamp=true;r.pilot.speed=.5;
  for(let i=0;i<50;i++)s.tick(1);
  const repeat=!!r.threat&&r.threat.encounter>first;
  const saved=s.snapshot();s.restore(saved);const persisted=s.snapshot().events.hunt.first;
  return {first,creature,noOverwrite,quietSafe,repeat,persisted};
 });
 assert.equal(result.creature,'cre.runner');assert(result.noOverwrite&&result.quietSafe&&result.repeat&&result.persisted);
 console.log(JSON.stringify(result));
}finally{await browser.close();}
