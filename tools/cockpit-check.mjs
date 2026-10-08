import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('qa/cockpit',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1495,height:871}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:5174/whitebox.html');await page.locator('#whitebox-start').click();await page.waitForFunction(()=>!!window.__whitebox);await page.waitForTimeout(1200);
 await page.evaluate(()=>{window.__whitebox.run.walkTo('camera');window.__whitebox.run.storyCaptionLeft=0;});await page.waitForTimeout(1600);await page.screenshot({path:'qa/cockpit/helm.png'});
 await page.evaluate(()=>window.__whitebox.run.walkTo('nav'));await page.waitForTimeout(1600);await page.screenshot({path:'qa/cockpit/sonar.png'});
 // Actual projected slider and analysis button, using the rendered desk at this viewport.
 await page.mouse.move(593,663);await page.mouse.down();await page.mouse.move(610,663,{steps:8});await page.mouse.up();await page.mouse.click(830,501);await page.waitForTimeout(250);
 const mouse=await page.evaluate(async()=>{const {sonarDeskState}=await import(performance.getEntriesByType('resource').findLast(e=>/\/sonar-desk\.ts(?:\?|$)/.test(e.name)).name);return sonarDeskState(window.__whitebox.run);});
 assert.equal(mouse.page,'result','mouse slider + analysis button');
 const result=await page.evaluate(async()=>{
  const {sonarAction,sonarDeskState}=await import('/src/pod/view/sonar-desk.ts');const {performControl}=await import(performance.getEntriesByType('resource').findLast(e=>/\/stations\.ts(?:\?|$)/.test(e.name)).name);const {run:r,site}=window.__whitebox;
  sonarAction(r,'sonar.home');sonarAction(r,'sonar.tune.0');const miss=sonarAction(r,'sonar.analyze');sonarAction(r,'sonar.tune.34');const analyzed=sonarAction(r,'sonar.analyze');
  const d=sonarDeskState(r);d.fields=['0','2','4'];const position=site.position.toArray();const saved=sonarAction(r,'sonar.save');d.fields=['NaN','2','4'];const invalid=sonarAction(r,'sonar.save');d.fields=['0','2','4'];
  const replyBefore=sonarAction(r,'sonar.reply');const played=sonarAction(r,'sonar.play');performControl(r,'nav.active');performControl(r,'nav.ping1');
  return {miss,analyzed,saved,invalid,position,after:site.position.toArray(),replyBefore,played,powered:r.activeSonarEnabled};
 });
 assert.equal(result.miss,false);assert.equal(result.analyzed,true);assert.equal(result.saved,true);assert.equal(result.invalid,false);assert.deepEqual(result.after,result.position);assert.equal(result.replyBefore,false);assert.equal(result.played,true);assert.equal(result.powered,true);
 await page.waitForTimeout(1000);
 const replied=await page.evaluate(async()=>{const {sonarAction}=await import('/src/pod/view/sonar-desk.ts');return sonarAction(window.__whitebox.run,'sonar.reply');});assert.equal(replied,true);
 await page.screenshot({path:'qa/cockpit/analysis.png'});
 const restore=await page.evaluate(async()=>{const {sonarDeskState}=await import('/src/pod/view/sonar-desk.ts');const {site,run}=window.__whitebox;const snap=site.snapshot();sonarDeskState(run).records=[];const restored=site.restore(snap);return {restored,count:sonarDeskState(run).records.length};});assert.equal(restore.restored,true);assert.equal(restore.count,1);
 await page.keyboard.press('Escape');await page.waitForTimeout(1000);await page.keyboard.down('w');await page.waitForTimeout(3400);assert.equal(await page.evaluate(()=>window.__whitebox.run.at),null,'held walking is never locked to a station');await page.keyboard.up('w');
 await page.keyboard.press('Escape');await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__whitebox.run.at),null,'exit stays released');
 assert.deepEqual(errors,[]);await writeFile('qa/cockpit/report.json',JSON.stringify({passed:true,method:'Edge headless, real mouse slider and analyze hit, normal action APIs, screenshot inspection; not blind play',result,restore,errors},null,2));console.log('PASS cockpit interaction regression');
} finally {await browser.close();}


