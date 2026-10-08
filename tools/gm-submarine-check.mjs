import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.keyboard.press('F10');await page.locator('[data-gm="不断电"]').click();await page.locator('[data-gm="不断电"]').filter({hasText:'开'}).waitFor();
 const locked=await page.evaluate(()=>{const r=window.__pod;r.power=0;r.blackout=true;return {power:r.power,powered:r.powered,blackout:r.blackout};});assert.deepEqual(locked,{power:1,powered:true,blackout:false});
 await page.locator('[data-gm="不断电"]').click();assert.equal(await page.locator('[data-gm="不断电"]').textContent(),'不断电：关');
 const input=page.locator('.gm-console input');await input.fill('电量 37');await input.press('Enter');
 const values=await page.evaluate(()=>{const r=window.__pod;const power=r.power;window.GM('艇壳 65');window.GM('氧气 50');window.GM('进水 20');window.GM('滤芯 70');const v={power,hull:r.hull,oxygen:r.vitals.vitals.oxygen/r.vitals.vitals.oxygenMax,flood:r.flood,scrubber:r.scrubber};const invalid=window.GM('电量 NaN');window.GM('全面整备');return {v,invalid,restored:r.power===1&&r.hull===1&&r.flood===0&&r.scrubber===1,fresh:new r.constructor().gmInfinitePower};});
 assert(Math.abs(values.v.power-.37)<.01);assert.equal(values.v.hull,.65);assert.equal(values.v.oxygen,.5);assert.equal(values.v.flood,.2);assert.equal(values.v.scrubber,.7);assert(values.invalid.includes('0—100'));assert(values.restored);assert.equal(values.fresh,false);console.log('PASS GM UI, continuous power, disable, resource percentages, invalid input, repair, new-run default',values);
}finally{await browser.close();}
