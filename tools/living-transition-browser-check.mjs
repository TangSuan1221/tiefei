// Level 1 → level 2 hand-off in the main game. DIAGNOSTIC: harbor completion is forced (the harbor's own checks cover
// how it is earned); the departure itself is a real B key press, and level two must load at the drop shaft.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,sit,state} from './living-browser-lib.mjs';

const dir=process.env.LIVING_QA_DIR?process.env.LIVING_QA_DIR+'/transition':'qa/living/transition';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
const out={method:'DIAGNOSTIC forced harbor completion + film flag; real B key departure.'};
try{
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>window.__pod?.authoredSite?.index===0&&!!window.__podView,null,{timeout:60000});
 await page.evaluate(()=>{const r=window.__pod;if(r.phase==='transit')r.beginHarborApproach?.();});
 await page.waitForFunction(()=>window.__pod.phase==='site',null,{timeout:20000});
 await page.evaluate(()=>window.__pod.walkTo('camera'));out.seat='DIAGNOSTIC walkTo(camera)';
 await page.waitForFunction(()=>window.__pod.at==='camera',null,{timeout:10000});
 out.before=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;
  Object.defineProperty(s,'complete',{get:()=>true,configurable:true});
  const has=r.campaign.has.bind(r.campaign);r.campaign.has=(leg,k)=>leg===0&&k==='film'?true:has(leg,k);
  return {legIndex:r.legIndex,phase:r.phase,site:s.constructor.name,canDepart:r.canDepart};});
 assert(out.before.canDepart,'diagnostic completion did not enable departure');
 await page.screenshot({path:dir+'/01-harbor-before-depart.png'});
 await page.keyboard.press('b');
 await page.waitForFunction(()=>window.__pod.legIndex===1&&window.__pod.authoredSite?.index===1&&!!window.__living,null,{timeout:60000});
 await page.waitForTimeout(2500);
 const s=await state(page);
 out.after={legIndex:s.legIndex,phase:s.phase,stage:s.stage,pos:s.pos,site:await page.evaluate(()=>window.__pod.authoredSite.constructor.name),caption:s.caption,objective:await page.evaluate(()=>window.__living.objective)};
 assert.equal(s.legIndex,1);assert.equal(s.phase,'site');assert.equal(s.stage,'descend');assert(s.pos[1]>20,'not at the top of the drop shaft');
 await page.screenshot({path:dir+'/02-level-two-loaded.png'});
 const filtered=errors.filter(e=>!/net::ERR_FAILED|favicon/.test(e));assert.deepEqual(filtered,[],'console errors');
 out.passed=true;console.log('PASS living transition',JSON.stringify(out));
}catch(e){out.passed=false;out.failure=String(e?.stack??e);console.error('FAIL living transition',e);await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{out.errors=errors;await writeFile(dir+'/results.json',JSON.stringify(out,null,2));await browser.close();}
