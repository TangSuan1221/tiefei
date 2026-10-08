import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
 const result=await page.evaluate(()=>{
 const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;r.power=1;r.activeSonarEnabled=true;
 s.rescue.step(1,{nearB:true,zone:'observe',activeSonar:false});s.rescue.listen();s.rescue.reply();
 const e=s.rescue.capture('pulse-regression','threat',true);s.rescue.commitCapture(e);
 r.toggleSonarPulses();const emittingBefore=r.sonarEmitting;
 const report=s.analyzeEvidence({capture:e,media:{playable:true}});const stoppedAfterAnalysis=!r.sonarEmitting&&r.activeSonarEnabled;
 s.tick(120);const silentDamage=s.rescue.state.damageTotal;
 s.rescue.interact('power');s.rescue.interact('observe');s.position.set(78,0,26);
 r.toggleSonarPulses();s.tick(10);const lured=s.rescue.state.monsterInside;
 const proof=s.rescue.capture('lure-regression','lure',true);s.rescue.commitCapture(proof);r.toggleSonarPulses();
 s.rescue.interact('observe',r.sonarEmitting);const isolated=s.rescue.state.isolated;
 r.toggleActiveSonar();const powerOffStops=!r.sonarEmitting&&!r.sonarPulseEnabled;
 return {emittingBefore,stoppedAfterAnalysis,silentDamage,lured,isolated,powerOffStops,report,next:s.objective};
 });
 assert(result.emittingBefore);assert(result.stoppedAfterAnalysis);assert.equal(result.silentDamage,0);assert(result.lured);assert(result.isolated);assert(result.powerOffStops);assert(result.report.some(x=>x.includes('X42')));assert(result.report.some(x=>x.includes('X78')));
 await mkdir('qa/harbor/pulse-guidance',{recursive:true});await writeFile('qa/harbor/pulse-guidance/results.json',JSON.stringify({passed:true,method:'Live main-game adapter integration; diagnostic evidence setup, actual pulse methods and rescue state transitions. Not a manual playthrough.',...result},null,2));console.log(result);
}finally{await browser.close();}
