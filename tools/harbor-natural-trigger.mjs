import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await browser.newPage();await p.route('**/api/**',r=>r.abort());await p.goto('http://127.0.0.1:5173/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 const result=await p.evaluate(()=>{
  const r=window.__pod;r.arrive();r.at='camera';r.lamp=true;const s=r.authoredSite;
  const opening=r.openingReceived,inventory=[...s.state.inventory];let elapsed=0;
  while(!r.threat&&elapsed<100){s.tick(.1);elapsed+=.1;}
  return {opening,inventory,elapsed,triggered:!!r.threat,creature:r.threat?.creature.id,reason:s.encounterPressure.reason};
 });console.log(result);assert(result.triggered);assert.equal(result.opening,false);assert.equal(result.inventory.length,0);
}finally{await browser.close();}
