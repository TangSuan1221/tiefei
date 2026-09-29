import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5174/narrative.html');
 await page.waitForFunction(()=>!!window.__narrativeLab);
 assert.match(await page.locator('.copy').innerText(),/我是维修员埃利亚斯/);
 assert.doesNotMatch(await page.locator('.copy').innerText(),/维修服停在笼内|救援登记/);
 await page.screenshot({path:'qa/narrative/prose-opening.png'});
 async function photo(){
  await page.locator('[data-action="shoot"]').click();
  const fast=page.locator('[data-action="fast"]');
  if(!await fast.isVisible())await page.getByText('摄影测试工具（非正常游玩）',{exact:true}).click();
  await fast.click();await page.locator('[data-action="analyze"]').click();
 }
 await photo();await page.locator('[data-choice="low-pulse"]').click();
 assert.match(await page.locator('.copy').innerText(),/你已执行/);
 await photo();await page.locator('[data-resolution="keep-low-load"]').click();
 const expected=await page.evaluate(()=>window.__narrativeLab.campaign.scenes[0].resolutions[0].text);
 assert.equal(await page.locator('.copy').innerText(),expected,'second decision must display its outcome, not the opening again');
 await page.screenshot({path:'qa/narrative/prose-followup.png'});
 const blueprint=await page.evaluate(()=>({format:'ironlung.articy-style-blueprint',nativeArticyProject:false,campaign:window.__narrativeLab.campaign}));
 await writeFile('qa/narrative/narrative-flow-blueprint.json',JSON.stringify(blueprint,null,2));
 assert.deepEqual(errors,[]);
 await writeFile('qa/narrative/prose-check.json',JSON.stringify({passed:true,checks:['new opening','action context','second decision outcome','fresh blueprint'],errors,method:'Browser UI with explicit test fast-forward; not a duration measurement.'},null,2));
 console.log('PASS: revised opening, action context, second decision outcome, export; no browser errors.');
} finally {await browser.close();}
