import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const level of [1,2]){
  const page=await browser.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{requests.push(r.request().url());return r.abort();});
  await page.addInitScript(()=>sessionStorage.setItem('ironlung.gm.novideo','1'));
  await page.goto((process.env.TEST_URL??'http://127.0.0.1:5198')+'/?level='+level);
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(()=>!!window.__pod?.authoredSite);
  const result=await page.evaluate(async level=>{
   const r=window.__pod,s=r.authoredSite;
   const {stationControls,performControl}=await import('/src/pod/view/stations.ts');
   r.at='lab';r.power=1;r.blackout=false;
   const before=r.tapes.length;
   if(stationControls(r,'lab').some(c=>c.id==='lab.diagnosticTask'))throw Error('Story videos must not need a verification control');
   s.tick(.1);
   const accepted=level===1?s.snapshot().simpleFlow.accepted:s.diag.state().survey.accepted;
   const snapshot=JSON.stringify(s.snapshot());
   performControl(r,'lab.diagnosticPhoto');
   if(JSON.stringify(s.snapshot())!==snapshot)throw Error('Empty photo granted progress');
   sessionStorage.removeItem('ironlung.gm.novideo');
   const off=stationControls(r,'lab').some(c=>c.id.startsWith('lab.diagnostic'));
   performControl(r,'lab.diagnosticPhoto');s.tick(.1);
   if(JSON.stringify(s.snapshot())!==snapshot)throw Error('Disabled mode granted progress');
   return {before,accepted,gm:r.gmLevelSession,off};
  },level);
  assert.equal(result.before,0);assert(result.accepted.includes(level===1?'L1-E01':'L2-S01'));assert(result.gm);assert(!result.off);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({level,...result,errors,requests}));await page.close();
 }
}finally{await browser.close();}
