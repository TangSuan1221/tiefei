import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5176/narrative.html');
 await page.locator('[data-tab="branches"]').click();assert.equal(await page.locator('.causal-branches .causal-branch').count(),6);
 await page.locator('summary').filter({hasText:'摄影测试工具'}).click();
 const capture=async()=>{await page.locator('[data-action="shoot"]').click();await page.locator('[data-action="fast"]').click();await page.locator('[data-action="analyze"]').click();};
 await capture();assert.equal(await page.locator('[data-choice]:enabled').count(),4);
 await page.locator('[data-choice="false-clear"]').click();await capture();
 await page.locator('summary').filter({hasText:'采取明确补救'}).click();assert.equal(await page.locator('[data-choice="isolate-cargo"]').count(),0);
 await page.locator('[data-choice="secure-injured"]').click();await capture();
 await page.locator('[data-resolution="leave-safe"]').click();await page.locator('[data-action="advance"]').click();
 await page.locator('[data-tab="variables"]').click();const state=JSON.parse(await page.locator('.panel pre').textContent());assert.equal(state.world.eliasStatus,'injured');assert.equal(state.world.partner,'keeper');assert.equal(state.world.dockCreature,'sealed');assert.deepEqual(errors,[]);
 console.log('PASS causal browser: six outcome cards, four primary actions, explicit injury recovery, no reselection, persistent injury after transition, zero page errors.');
}finally{await browser.close();}
