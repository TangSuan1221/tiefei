import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('qa/narrative',{recursive:true});
const report={passed:false,errors:[],steps:[],realWaits:[],method:'Browser UI full route. First two exposures real-time; remainder explicit labelled test fast-forward. Not 60-minute playtest.'};
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000},serviceWorkers:'block'});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
page.on('dialog',d=>d.accept());
await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||!/^https?:$/.test(u.protocol)?r.continue():r.abort();});
try{
 await page.goto(process.env.NARRATIVE_URL??'http://127.0.0.1:5174/narrative.html?view=legacy');
 await page.waitForFunction(()=>!!window.__narrativeLab);
 const initial=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 await page.screenshot({path:'qa/narrative/workspace-desktop.png'});
 let films=0;
 const state=()=>page.evaluate(()=>window.__narrativeLab.engine.snapshot());
 async function click(action){await page.locator(`[data-action="${action}"]`).click();}
 async function photo(){
  await click('resupply');await click('shoot');const start=Date.now();
  if(films<2){await page.locator('[data-action="analyze"]').waitFor({timeout:24000});report.realWaits.push(Date.now()-start);}
  else{const summary=page.getByText('摄影测试工具（非正常游玩）',{exact:true});if(!await page.locator('[data-action="fast"]').isVisible())await summary.click();await click('fast');}
  await click('analyze');await click('report');films++;
 }
 for(let i=0;i<15;i++){
  assert.equal((await state()).sceneIndex,i);await photo();
  await page.locator('[data-choice]:not([disabled])').first().click();await photo();
  await page.locator('[data-resolution]:not([disabled])').first().click();
  report.steps.push(await state());await click('advance');
 }
 assert.equal((await state()).phase,'ended');report.ending=(await state()).endingId;report.films=films;
 await page.screenshot({path:'qa/narrative/ending-desktop.png'});
 await page.locator('[data-tab="variables"]').click();assert.match(await page.locator('.panel').innerText(),/knowledge/);
 await page.locator('[data-tab="events"]').click();assert.ok(await page.locator('.event').count()>20);
 await page.locator('[data-tab="definition"]').click();assert.ok((await page.locator('.panel').innerText()).includes('Condition'));
 await page.locator('[data-tab="budget"]').click();await page.screenshot({path:'qa/narrative/budget-desktop.png'});
 const downloadPromise=page.waitForEvent('download');await click('export');const download=await downloadPromise;
 await download.saveAs('qa/narrative/narrative-flow-blueprint.json');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="flow"]').click();
 await page.screenshot({path:'qa/narrative/workspace-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'no horizontal page overflow');
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),initial,'formal storage unchanged');
 assert.deepEqual(report.errors,[]);assert.ok(report.realWaits.every(ms=>ms>=16500));report.passed=true;
}catch(e){report.failure=String(e.stack??e);await page.screenshot({path:'qa/narrative/browser-failure.png'}).catch(()=>{});}
finally{await writeFile('qa/narrative/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,failure:report.failure,realWaits:report.realWaits,ending:report.ending,films:report.films},null,2));
if(!report.passed)process.exitCode=1;
