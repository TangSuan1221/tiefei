import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/api/video/**',r=>r.abort());
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.walkTo('camera');r.arrive();r.pitch=0;});
 const y=()=>page.evaluate(()=>window.__pod.authoredSite.snapshot().position[1]);
 const start=await y();
 await page.keyboard.down('w');await page.waitForTimeout(1100);await page.keyboard.up('w');
 const up=await y();assert.ok(up>start+.04,`W ascends: ${start} -> ${up}`);
 await page.keyboard.down('s');await page.waitForTimeout(1800);await page.keyboard.up('s');
 const down=await y();assert.ok(down<up-.04,`S descends: ${up} -> ${down}`);
 assert.equal(await page.evaluate(()=>window.__pod.pitch),0,'heave does not change pitch');
 await page.keyboard.press('Escape');await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.__pod.pilot.verticalSpeed),0,'leaving seat stops heave');
 console.log('PASS keyboard W/S moves actual authored camera vertically at zero thrust, pitch unchanged, seat release stops', {start,up,down});
}finally{await browser.close();}
