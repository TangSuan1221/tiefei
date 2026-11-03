import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/prologue-save',{query:''});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__pod?.prologue?.active,null,{timeout:60000});
 const result=await page.evaluate(async()=>{
  const {captureHarborSave,restoreHarborSave}=await import('/src/pod/sim/harbor-save.ts');
  const r=window.__pod,s=captureHarborSave(r);if(!s)throw Error('save unavailable');
  const before=structuredClone(s.site.prologue);
  r.prologue.step=3;r.authoredSite.position.z=-10;
  if(!restoreHarborSave(r,s))throw Error('restore rejected');
  const after=r.prologue.snapshot(),position=r.authoredSite.position.toArray();
  const legacy=structuredClone(s);delete legacy.site.prologue;legacy.site.position=[11,0,10];
  if(!restoreHarborSave(r,legacy))throw Error('legacy restore rejected');
  return {before,after,position,legacySkipped:r.prologue===null};
 });
 assert.deepEqual(result.before,result.after);assert.deepEqual(result.position,[11,0,-36]);assert(result.legacySkipped);
 await writeFile('qa/prologue-save/result.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
