import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/video/**',r=>r.abort());
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.arrive();r.walkTo('camera');r.lamp=true;});
 await page.waitForTimeout(1800);
 assert.match(await page.evaluate(()=>window.__pod.authoredSite.hint),/接驳口应急检修箱/);
 await page.keyboard.press('f');
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'extending');
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.snapshot().state.opened.includes('expedition.1.arrival-cache')),false);
 await page.waitForFunction(()=>window.__pod.arm.phase==='aiming');
 await page.screenshot({path:'qa/cabin/arrival-arm-extended.png'});
 await page.keyboard.press('f');
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'gripping');
 await page.waitForFunction(()=>window.__pod.arm.phase==='aiming');
 assert.ok(await page.evaluate(()=>window.__pod.authoredSite.snapshot().state.opened.includes('expedition.1.arrival-cache')));
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.snapshot().state.collected.includes('expedition.1.arrival-cache')),false);
 await page.keyboard.press('f');
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'hauling');
 await page.waitForFunction(()=>window.__pod.arm.phase==='stowed');
 assert.ok(await page.evaluate(()=>window.__pod.authoredSite.snapshot().state.collected.includes('expedition.1.arrival-cache')));
 assert.ok(await page.evaluate(()=>window.__pod.authoredSite.world.interactables.get('expedition.1.arrival-cache').visible));
 await page.screenshot({path:'qa/cabin/arrival-cache-empty.png'});
 console.log('PASS F extends, F rummages, F hauls; no instant collection, reward only after stowing');
}finally{await browser.close();}
