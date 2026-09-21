import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);await page.keyboard.press('6');await page.waitForTimeout(2000);
 const start=await page.evaluate(()=>window.__pod.traveled);
 await page.mouse.click(980,655);
 assert.equal(await page.evaluate(()=>window.__pod.navDriveEngaged),true,'single click engages engine');
 await page.waitForFunction(d=>window.__pod.traveled>d+1,start,{timeout:10000});
 await page.mouse.click(980,655);
 assert.equal(await page.evaluate(()=>window.__pod.navDriveEngaged),false,'second click stops engine');
 assert.ok(await page.evaluate(()=>window.__pod.pilot.speed>0),'engine off preserves coast');
 await page.keyboard.press('4');assert.equal(await page.evaluate(()=>window.__pod.navDriveEngaged),true);
 await page.keyboard.down('Shift');await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.__pod.navDriveEngaged),false,'braking disengages engine');
 await page.keyboard.up('Shift');await page.keyboard.press('4');await page.keyboard.press('Escape');
 await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__pod.navDriveEngaged),false,'leaving helm disengages engine');
 console.log('PASS single-click propulsion, visible travel, toggle off/coasting, key 4, brake and leave safety');
}finally{await browser.close();}
