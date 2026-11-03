import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(30000);await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5195/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;r.at='camera';r.lamp=true;r.power=1;r.blackout=false;r.pilot.stop();r.activeSonarEnabled=false;r.prologue=null; // Fixture skips the pre-dive checklist prologue.
 // Explicit fixture: isolate interaction behavior from navigation and media delivery.
 s.aimedInterface=()=>({id:'',door:window.testDoor??'harbor.edge.A-C',distance:window.testDistance??2});
 s.interact();});
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.A-C')),false);
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'extending');
 await page.evaluate(async()=>{const r=window.__pod;const {stepArm}=await import('/src/pod/sim/manipulator.ts');stepArm(r.arm,4,r.armConditions());r.authoredSite.tick(0);});
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'gripping');
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.A-C')),false);
 await page.evaluate(()=>window.__pod.tickArm(2));
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'hauling');
 assert.ok(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.A-C')));
 await page.evaluate(()=>window.__pod.tickArm(3));
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'stowed');
 // Dial a code on the rollers with pointer clicks, wheel and arrow keys; no text field exists.
 const dial=async code=>{
  assert.equal(await page.locator('#harbor-door-panel input').count(),0,'no keyboard text field');
  for(let i=0;i<code.length;i++){
   const drum=page.locator('.door-drum').nth(i),now=Number(await drum.getAttribute('aria-valuenow')),want=Number(code[i]);
   let up=(want-now+10)%10;
   if(i%3===0)for(;up>0;up--)await page.locator('.door-wheel').nth(i).locator('.door-step[data-d="1"]').click();
   else if(i%3===1)for(;up>0;up--){await drum.hover();await page.mouse.wheel(0,-100);}
   else{await drum.focus();for(;up>0;up--)await page.keyboard.press('ArrowUp');}
   assert.equal(await drum.getAttribute('aria-valuenow'),code[i]);
  }
 };
 await page.evaluate(()=>{window.testDoor='harbor.edge.C-B';const f=window.__pod.authoredSite.simpleFlow;f.accepted.push('L1-R28-V01','L1-R28-V02');f.greeted=true;});
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.simpleFlow.pending),null,'no code video before trying the door');
 await page.evaluate(()=>window.__pod.authoredSite.interact());
 await page.locator('#harbor-door-panel.door-locked').waitFor();await page.getByText('需要通行密码').waitFor();
 assert.equal(await page.locator('#harbor-door-panel button[type=submit]').count(),0,'locked panel cannot submit');
 fs.mkdirSync('qa/harbor-door-panel',{recursive:true});await page.screenshot({path:'qa/harbor-door-panel/locked.png'});
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.simpleFlow.pending),'L1-R28-V02-AUTH','trying the door requests the code video');
 await page.getByRole('button',{name:'关闭'}).click();await page.locator('#harbor-door-panel').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')),false);
 await page.waitForFunction(()=>!window.__pod.driveInputBlocked);
 await page.evaluate(()=>{const s=window.__pod.authoredSite;s.simpleFlow.accepted.push('L1-R28-V02-AUTH');s.interact();});
 await dial('0000001');await page.getByRole('button',{name:'解锁并开门'}).click();await page.getByText('密码不匹配').waitFor();
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')),false);
 await dial('2903419');await page.evaluate(()=>{window.testDistance=8;});await page.getByRole('button',{name:'解锁并开门'}).click();assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')),false);
 await page.keyboard.press('Escape');await page.locator('#harbor-door-panel').waitFor({state:'detached'});
 // The session clears its input block on the next frame after the panel closes.
 await page.waitForFunction(()=>!window.__pod.driveInputBlocked);
 await page.evaluate(()=>{window.testDistance=2;window.__pod.authoredSite.interact();});await dial('2903419');
 await page.waitForFunction(()=>!document.getElementById('lab-fullscreen-player'));
 const rect=await page.locator('#harbor-door-panel').boundingBox();assert.ok(Math.abs(rect.x+rect.width/2-640)<2);
 await page.screenshot({path:'qa/harbor-door-panel/panel.png'});
 await page.getByRole('button',{name:'解锁并开门'}).click();assert.equal(await page.locator('#harbor-door-panel').count(),0);
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')),false);
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'extending');
 await page.evaluate(async()=>{const r=window.__pod;const {stepArm}=await import('/src/pod/sim/manipulator.ts');stepArm(r.arm,4,r.armConditions());r.authoredSite.tick(0);});
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'gripping');
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')),false);
 await page.evaluate(()=>window.__pod.tickArm(2));
 assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'hauling');
 assert.ok(await page.evaluate(()=>window.__pod.authoredSite.base.state.opened.includes('harbor.edge.C-B')));
 await page.evaluate(()=>window.__pod.tickArm(3));assert.equal(await page.evaluate(()=>window.__pod.arm.phase),'stowed');
 console.log('PASS: single-action first door, door tried before code video (locked panel), roller dialling by click/wheel/arrow keys with no text field, incorrect code, distance recheck, Escape, automatic extend/grip/retract; doors open only after grip. Mocked aim and staged video acceptance; no provider requests.');
}finally{await browser.close();}

