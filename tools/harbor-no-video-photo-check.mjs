import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try{
 for(const [name,heading,legacy] of [['assisted-91-degrees',91,false],['switch-screen-during-shot',96,false],['repair-old-report',-12,true]]){
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  await page.addInitScript(()=>sessionStorage.setItem('ironlung.gm.novideo','1'));
  await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
  // Diagnostic arrival setup only. Exposure, development and analysis use the live app.
  await page.evaluate(heading=>{const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;s.navigationConsole.setWaypoint([11,0,16]);s.position.set(11,0,16);s.tick(.01);s.position.set(58.8,0,28.8);s.tick(.01);s.rescue.listen();s.rescue.reply();r.heading=heading;r.pitch=0;r.camPan=r.camTilt=0;r.walkTo('camera');},heading);
  await page.waitForTimeout(2000);
  await page.keyboard.press('1');console.log(name,'exposure key');if(name==='switch-screen-during-shot'){await page.waitForTimeout(700);await page.evaluate(()=>window.__pod.walkTo('nav'));}
  await page.waitForFunction(()=>window.__pod.selectedTape?.ready&&window.__pod.selectedTape.videoResult==='prompt',null,{timeout:60000}).catch(async error=>{console.log(await page.evaluate(()=>({at:window.__pod.at,phase:window.__pod.shot.phase,developed:window.__pod.shot.developed,tape:window.__pod.selectedTape&&{ready:window.__pod.selectedTape.ready,result:window.__pod.selectedTape.videoResult},logs:window.__pod.log?.slice(-4)})));throw error;});
  await page.evaluate(legacy=>{const r=window.__pod;if(legacy){r.selectedTape.analyzed=true;r.selectedTape.report=['GM 模拟分析 · 非AI视频识别 · 仅读取曝光时的系统快照','该报告不授予正式剧情证据，也不能验证生成视频质量。'];}r.walkTo('lab');},legacy);
  await page.keyboard.press('3');await page.waitForTimeout(300);
  const result=await page.evaluate(()=>{const r=window.__pod;return{verdict:r.authoredSite.evidenceStatus(r.selectedTape.siteEvidence),report:r.selectedTape.report,frames:r.selectedTape.sensorFrames.length,videoResult:r.selectedTape.videoResult,identified:r.authoredSite.rescue.state.identified,analyzed:r.selectedTape.analyzed};});
  results.push({name,...result});
  assert(result.frames>=3);assert(result.analyzed);assert(!result.report[0].startsWith('GM'));assert.equal(result.identified,true);assert.equal(result.verdict.accepted,result.identified);if(result.identified)assert(result.verdict.next.includes('02')); 
  await page.close();
 }
 await mkdir('qa/harbor/no-video-photo',{recursive:true});await writeFile('qa/harbor/no-video-photo/results.json',JSON.stringify({method:'Diagnostic arrival setup; real exposure key, wall-clock development, analysis key; old report seeded only in recovery case.',passed:true,results},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}




