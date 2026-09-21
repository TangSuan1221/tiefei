import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.waitForTimeout(1500);await page.screenshot({path:'qa/cabin/opening-call.png'});
 assert.match(await page.evaluate(()=>window.__pod.openingGuide),/按 3/);
 await page.keyboard.press('3');await page.waitForTimeout(1200);await page.keyboard.press('1');
 assert.equal(await page.evaluate(()=>window.__pod.openingReceived),true);
 await page.keyboard.press('Escape');await page.keyboard.press('6');await page.waitForTimeout(1400);
 assert.match(await page.evaluate(()=>window.__pod.openingGuide),/按 2/);
 await page.keyboard.press('2');assert.equal(await page.evaluate(()=>window.__pod.openingScanned),true);
 await page.screenshot({path:'qa/cabin/opening-navigation.png'});
 console.log('PASS opening call -> actual radio reception -> nav -> sonar -> propulsion guidance');
}finally{await browser.close();}
