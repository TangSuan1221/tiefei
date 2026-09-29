import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5174/narrative.html?view=legacy');await page.waitForFunction(()=>!!window.__narrativeLab);
 await page.locator('[data-tab="branches"]').click();await page.screenshot({path:'qa/narrative/branches-desktop.png'});
 const report=JSON.parse(await readFile('qa/narrative/browser-report.json','utf8'));
 const restored=await page.evaluate(save=>window.__narrativeLab.engine.restore(JSON.stringify(save)),report.steps.at(-1));
 assert.equal(restored.ok,true,restored.message);await page.locator('[data-tab="flow"]').click();await page.locator('[data-action="advance"]').click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/narrative/workspace-mobile-final.png',fullPage:true});
 await page.locator('.footer').scrollIntoViewIfNeeded();await page.screenshot({path:'qa/narrative/mobile-bottom.png'});
 const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollY,footer:document.querySelector('.footer').getBoundingClientRect().bottom,height:innerHeight}));
 assert.ok(dimensions.scrollWidth<=dimensions.width+2);assert.ok(dimensions.footer<=dimensions.height+2);assert.deepEqual(errors,[]);
 await writeFile('qa/narrative/visual-report.json',JSON.stringify({passed:true,method:'Visual layout regression with valid saved-state fixture, not a new playthrough.',dimensions,errors},null,2));
 console.log('PASS desktop branch graph, mobile toolbar, no overflow, scrollable ending/footer.');
}finally{await browser.close();}
