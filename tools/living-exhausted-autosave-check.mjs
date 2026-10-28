import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {openLevelTwo,startNew} from './living-browser-lib.mjs';

const {browser,page,errors}=await openLevelTwo('qa/living-survey/exhausted-save');
const report={method:'Independent exhausted-power fixture. Real session autosave timer, reload/beforeunload and Continue menu; no direct capture/write calls. Not organic full-route exhaustion.'};
const stored=()=>{
 const pointer=localStorage.getItem('ironlung.living.v1');
 const slot=pointer?JSON.parse(pointer).slot:null;
 const payload=slot?localStorage.getItem(slot):null;
 return {pointer,payload};
};
try{
 await startNew(page);
 await page.waitForFunction(()=>!!localStorage.getItem('ironlung.living.v1'),null,{timeout:30000});
 report.good=await page.evaluate(stored);
 assert.ok(report.good.payload);
 const saved=JSON.parse(report.good.payload);
 assert.ok(saved.run.power>.02);
 report.fixture=await page.evaluate(()=>{
  const r=window.__pod,l=window.__living;
  r.power=.019;r.stock.clear();r.bench.length=0;l.reserveUsed=true;
  return {power:r.power,cells:r.count('sup.cell'),saveSafe:l.saveSafe,gm:r.gmLevelSession};
 });
 assert.equal(report.fixture.saveSafe,true);
 assert.equal(report.fixture.cells,0);
 await page.waitForTimeout(16500);
 report.afterTimer=await page.evaluate(stored);
 assert.deepEqual(report.afterTimer,report.good);
 await page.reload();
 report.afterReload=await page.evaluate(stored);
 assert.deepEqual(report.afterReload,report.good);
 await page.locator('[data-id="continue"]').click();
 await page.waitForFunction(()=>!!window.__living,null,{timeout:60000});
 report.restored=await page.evaluate(()=>({power:window.__pod.power,reserveUsed:window.__living.reserveUsed,phase:window.__pod.phase}));
 assert.ok(report.restored.power>.02);
 assert.equal(report.restored.phase,'site');
 report.pass=true;
}catch(e){report.pass=false;report.error=String(e);process.exitCode=1;}
finally{
 report.errors=errors;
 writeFileSync('qa/living-survey/exhausted-save/autosave-menu.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,good:!!report.good,afterTimer:!!report.afterTimer,afterReload:!!report.afterReload}));
 await browser.close();
}
