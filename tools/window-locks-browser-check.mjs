import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
const dir='qa/living/window-locks';
const {browser,page,errors}=await openLevelTwo(dir);
try{
 await startNew(page);await sit(page);
 const result=await page.evaluate(()=>{
  const r=window.__pod,s=window.__living;
  r.lamp=false;r.activeSonarEnabled=false;r.stopSonarPulses();
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;
  const ctx=canvas.getContext('2d'),colors=[];const stroke=ctx.stroke.bind(ctx);
  ctx.stroke=()=>{colors.push(ctx.strokeStyle);stroke();};
  s.drawWindowLocks(ctx,1024,720);
  return {colors,light:r.lit,sonar:r.activeSonarEnabled};
 });
 assert(result.colors.includes('#ff5266'),'dark window must show obstacles without sonar');
 await page.screenshot({path:dir+'/dark-window.png'});
 await writeFile(dir+'/results.json',JSON.stringify({result,errors},null,2));
 console.log('PASS dark-window obstacle overlay',JSON.stringify(result));
}finally{await browser.close();}
