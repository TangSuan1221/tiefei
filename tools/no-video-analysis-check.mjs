import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(()=>{
  const r=window.__pod;r.arrive();r.spawnThreat('cre.runner',55);const capture=r.captureFootage('survey');
  const inventory=JSON.stringify(r.authoredSite.state.inventory);
  r.tapes.push({id:'test.gm',legId:r.leg.id,siteName:'test',purpose:'survey',atBreath:0,fauna:[],caughtThreat:null,creatureMissing:false,analyzed:false,report:[],ready:true,videoResult:'prompt',siteEvidence:{},simulationReport:capture.simulationReport.slice()});
  r.tapeCursor=r.tapes.length-1;r.at='lab';r.threat=null;r.analyzeTape();
  const report=r.tapes.at(-1).report;
  return {report,noGrant:JSON.stringify(r.authoredSite.state.inventory)===inventory};
 });
 assert(result.report.some(x=>x.includes('习性')));assert(result.report.some(x=>x.includes('空间突进者')));assert(result.report[0].includes('非AI'));assert(result.noGrant);console.log(result);
}finally{await browser.close();}
