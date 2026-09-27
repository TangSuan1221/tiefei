import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const records=[];
 for(const level of [1,2,3,4,5,6,7,1]){
  await page.locator('#gm-launch').click();await page.locator(`button[data-gm="进入关卡 ${level}"]`).click();
  const s=await page.evaluate(()=>({index:window.__pod.legIndex,site:window.__pod.authoredSite?.index,phase:window.__pod.phase,error:window.__pod.authoredSiteError,gm:window.__pod.gmLevelSession,menu:!document.querySelector('.gm-console').classList.contains('hidden')}));
  assert.equal(s.index,level-1);assert.equal(s.site,level-1);assert.equal(s.phase,'site');assert.equal(s.error,'');assert.equal(s.menu,false);assert.equal(s.gm,true);records.push(s);
 }
 const invalid=await page.evaluate(()=>{const before=window.__pod.authoredSite;const message=window.GM('进入关卡 8');return{same:window.__pod.authoredSite===before,message};});assert.ok(invalid.same);
 await page.keyboard.press('F10');assert.ok(await page.locator('.gm-console:not(.hidden)').count());await page.keyboard.press('Escape');assert.equal(await page.locator('.gm-console:not(.hidden)').count(),0);
 const safe=await page.evaluate(async()=>{const {captureHarborSave}=await import('/src/pod/sim/harbor-save.ts');return captureHarborSave(window.__pod)===null;});assert.ok(safe);assert.deepEqual(errors,[]);
 console.log('PASS click menu, 7 levels and backtracking, invalid input, F10/Escape, isolated GM save',records);
}finally{await browser.close();}
