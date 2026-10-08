import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.authoredSite.position.set(60,0,32);r.heading=90;r.walkTo('lab');});
 await page.waitForTimeout(1000);const before=await page.evaluate(()=>window.__pod.heading);
 await page.keyboard.down('j');await page.waitForTimeout(1000);await page.keyboard.up('j');
 const after=await page.evaluate(()=>({heading:window.__pod.heading,at:window.__pod.at,journal:!!document.getElementById('campaign-journal')}));
 assert.equal(after.at,'lab');assert(!after.journal);assert(after.heading<before-2);
 await page.keyboard.down('l');await page.waitForTimeout(1500);await page.keyboard.up('l');
 const right=await page.evaluate(()=>window.__pod.heading);assert(right>after.heading+2);
 console.log('PASS real J/L steering from lab without journal',{before,after,right});
}finally{await browser.close();}
