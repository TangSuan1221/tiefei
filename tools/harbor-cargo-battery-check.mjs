import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5190/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const {performControl}=await import('/src/pod/view/stations.ts');
  const r=window.__pod;r.receive();r.arrive();r.at='lab';r.power=.19;r.blackout=false;r.stock.set('sup.cell',1);
  performControl(r,'lab.tab:cargo');const used=performControl(r,'lab.useBattery');
  const after={power:r.power,count:r.count('sup.cell')};const again=performControl(r,'lab.useBattery');
  r.stock.set('sup.cell',1);r.power=1;const full=performControl(r,'lab.useBattery');
  return {used,after,again,full,remaining:r.count('sup.cell')};
 });
 assert.equal(result.used,true);assert.equal(result.after.count,0);assert.ok(result.after.power>.60&&result.after.power<=.61);
 assert.equal(result.again,false);assert.equal(result.full,false);assert.equal(result.remaining,1);
 console.log('PASS cargo battery: consumes one, restores existing amount, rejects empty/full',result);
}finally{await browser.close();}
