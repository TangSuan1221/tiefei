import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {openLevelTwo,startNew} from './living-browser-lib.mjs';
const {browser,page,errors}=await openLevelTwo('qa/living-2026-10-27');
const report={method:'Cargo callback fixture; real save/reload/Continue and normal supply use. No physical pickup or full-route claim.'};
try{
 await startNew(page);
 report.before=await page.evaluate(async()=>{
  const r=window.__pod,l=window.__living;r.power=.18;r.stock.clear();
  const collect=()=>{l.armObject='living.box.battery';l.pendingCargo='living.box.battery';l.armEvent('stowed');};
  collect();const once={cells:r.count('sup.cell'),power:r.power};collect();
  const twice={cells:r.count('sup.cell'),power:r.power};
  const resource=performance.getEntriesByType('resource').map(e=>e.name).find(u=>u.includes('/src/pod/sim/living-save.ts'));
  const m=await import(resource??'/src/pod/sim/living-save.ts');const save=m.captureLivingSave(r);
  if(!save)throw Error('save refused');m.writeLivingSave(localStorage,save);return {once,twice};
 });
 assert.deepEqual(report.before.once,{cells:3,power:.18});assert.deepEqual(report.before.twice,report.before.once);
 await page.reload();await page.locator('[data-id="continue"]').click();await page.waitForFunction(()=>!!window.__living,null,{timeout:60000});
 report.after=await page.evaluate(()=>{
  const r=window.__pod,l=window.__living;const restored={cells:r.count('sup.cell'),power:r.power};
  l.armObject='living.box.battery';l.pendingCargo='living.box.battery';l.armEvent('stowed');const repeated=r.count('sup.cell');
  r.at='life';const used=r.useSupply('sup.cell');return {restored,repeated,used,cells:r.count('sup.cell'),power:r.power};
 });
 assert.equal(report.after.restored.cells,3);assert.equal(report.after.repeated,3);assert.equal(report.after.used,true);assert.equal(report.after.cells,2);assert.ok(report.after.power>.59&&report.after.power<=.6);
 report.pass=true;
}catch(e){report.pass=false;report.error=String(e);process.exitCode=1;}finally{report.errors=errors;writeFileSync('qa/living-2026-10-27/battery-reward-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
