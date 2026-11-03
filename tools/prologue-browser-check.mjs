import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir='qa/prologue';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
const state=()=>page.evaluate(()=>{const r=window.__pod;return {step:r.prologue?.step,position:r.authoredSite.position.toArray(),pitch:r.pitch,gear:r.throttle,arm:r.arm.phase,pending:r.authoredSite.simpleFlow.pending,opened:r.authoredSite.base.state.opened};});
const until=async(key,step)=>{await page.keyboard.down(key);try{await page.waitForFunction(step=>window.__pod.prologue.step>=step,step,{timeout:25000});}finally{await page.keyboard.up(key);}await page.keyboard.down('Shift');await page.waitForTimeout(1000);await page.keyboard.up('Shift');};
try{
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>window.__pod?.prologue?.active,null,{timeout:60000});
 await page.waitForTimeout(1800);await page.screenshot({path:dir+'/01-coordinates.png'});
 assert.equal((await state()).step,0);
 await page.keyboard.type('11');await page.keyboard.press('Tab');await page.keyboard.type('16');await page.keyboard.press('Tab');await page.keyboard.type('1012');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.__pod.prologue.step===1);
 await page.waitForTimeout(1200);await page.screenshot({path:dir+'/02-lamp.png'});
 // Locate the rendered physical cap and route a real mouse click through the scene pick.
 const lamp=await page.evaluate(()=>{const c=window.__podView.cabin,o=c.helmKeys.find(o=>o.userData.control==='camera.lamp'),p=o.getWorldPosition(c.camera.position.clone()).project(c.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await page.mouse.click(lamp.x,lamp.y);await page.waitForFunction(()=>window.__pod.prologue.step===2);
 await page.waitForTimeout(1000);await page.screenshot({path:dir+'/03-gears.png'});
 for(const k of ['x','x','x','z','z']){await page.keyboard.press(k);await page.waitForTimeout(120);}
 await page.waitForFunction(()=>window.__pod.prologue.step===3);
 await until(' ',4);await until('n',5);await until('PageUp',6);await until('PageDown',7);await until('i',8);await until('k',9);
 // Level using the same keys; wait out angular inertia, then trim depth.
 for(let i=0;i<14;i++){
  const q=await page.evaluate(()=>({p:window.__pod.pitch,y:window.__pod.authoredSite.position.y,step:window.__pod.prologue.step}));
  if(q.step>=10)break;
  if(Math.abs(q.p)>.3){await page.keyboard.down(q.p>0?'i':'k');await page.waitForTimeout(Math.min(550,Math.abs(q.p)*150));await page.keyboard.up(q.p>0?'i':'k');}
  if(Math.abs(q.y)>.15){await page.keyboard.down(q.y<0?'PageUp':'PageDown');await page.waitForTimeout(Math.min(900,Math.abs(q.y)*1000));await page.keyboard.up(q.y<0?'PageUp':'PageDown');}
  await page.waitForTimeout(1800);
 }
 await page.waitForFunction(()=>window.__pod.prologue.step===10);
 await page.waitForTimeout(3300);await page.screenshot({path:dir+'/04-corridor.png'});
 const before=await state();assert(!before.opened.includes('harbor.edge.A-C'));
 await page.keyboard.down(' ');
 try{await page.waitForFunction(()=>window.__pod.authoredSite.aimedInterface().door==='harbor.edge.A-C'&&window.__pod.authoredSite.aimedInterface().distance<=3.2,null,{timeout:180000});}finally{await page.keyboard.up(' ');}
 await until('Shift',11);
 await page.waitForTimeout(1200);await page.screenshot({path:dir+'/05-arm.png'});
 await page.keyboard.press('f');
 await page.waitForFunction(()=>!window.__pod.prologue.active,null,{timeout:30000});
 const final=await state();assert(final.opened.includes('harbor.edge.A-C'));assert.equal(final.arm,'stowed');
 await page.screenshot({path:dir+'/06-handoff.png'});
 await writeFile(dir+'/result.json',JSON.stringify({before,final,errors},null,2));
 console.log(JSON.stringify({before,final,errors}));
}catch(e){await page.screenshot({path:dir+'/failure.png'});console.log(JSON.stringify({state:await state(),errors}));throw e;}
finally{await browser.close();}
