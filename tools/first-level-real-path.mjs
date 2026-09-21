import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],assets=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/ambientcg/'))assets.push({url:r.url().split('/').at(-1),status:r.status()});});
 await page.route('**/api/video/**',r=>r.abort());await mkdir('qa/cabin/real-first-level',{recursive:true});
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.keyboard.press('3');await page.keyboard.press('1');await page.keyboard.press('Escape');await page.keyboard.press('6');await page.keyboard.press('2');await page.keyboard.press('4');
 await page.waitForFunction(()=>window.__pod.phase==='site',null,{timeout:90000});
 const world=await page.evaluate(()=>window.__pod.authoredSite?.snapshot());assert.equal(world?.index,0);
 await page.keyboard.press('Escape');await page.keyboard.press('4');
 if(!await page.evaluate(()=>window.__pod.lamp))await page.keyboard.press('3');
 await page.waitForFunction(()=>window.__cabinPose().seatEye[2]<-.40);await page.waitForTimeout(1500);
 await page.screenshot({path:'qa/cabin/real-first-level/live.png'});
 await page.keyboard.press('1');await page.waitForFunction(()=>['ready','failed'].includes(window.__pod.shot.phase),null,{timeout:120000});
 await page.waitForTimeout(600);
 const shot=await page.evaluate(async()=>{
  const r=window.__pod,t=r.tapes.at(-1);if(t.keyframe!==r.shot.keyframe)throw Error('Archive lost shutter frame');
  const {drawCameraFeed}=await import('/src/pod/view/creature.ts');
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;const ctx=canvas.getContext('2d');
  let used=false;const original=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{if(args[0] instanceof HTMLImageElement&&args[0].src===t.keyframe)used=true;return original(...args);};
  drawCameraFeed(ctx,1024,720,{run:r,time:1,aim:0,reveal:0});
  return{phase:r.shot.phase,viewing:r.shot.viewing,bytes:t.keyframe?.length,usedActualShutterImage:used};
 });
 assert.ok(shot.usedActualShutterImage,'offline playback draws real captured scene, not placeholder geometry');
 await page.screenshot({path:'qa/cabin/real-first-level/after-exposure.png'});
 console.log({world,shot,assets,errors});assert.deepEqual(errors,[]);assert.ok(assets.length===4&&assets.every(a=>a.status===200));
}finally{await browser.close();}
