import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage({viewport:{width:1495,height:871}}),errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5174/whitebox.html');await p.locator('#whitebox-start').click();await p.waitForFunction(()=>!!window.__whitebox);
 const state=()=>p.evaluate(()=>{const {run,view,site}=window.__whitebox;return {at:run.at,pose:view.cabin.pose(),sub:site.position.toArray(),phase:run.shot.phase};});
 for(const station of ['camera','nav','lab'])for(const key of ['w','s','a','d']){
  await p.evaluate(id=>window.__whitebox.run.walkTo(id),station);await p.waitForTimeout(1300);const before=await state();
  await p.keyboard.down(key);await p.waitForTimeout(480);const during=await state();await p.keyboard.up(key);
  assert.equal(during.at,null,station+' '+key+' releases immediately');
  assert(Math.hypot(during.pose.x-before.pose.seatEye[0],during.pose.z-before.pose.seatEye[2])>.12,station+' '+key+' moves');
  assert.deepEqual(during.sub,before.sub,'walking must not pilot submarine');checks.push({station,key,before:before.pose.seatEye,after:[during.pose.x,during.pose.z]});
 }
 await p.evaluate(()=>window.__whitebox.run.walkTo('camera'));await p.waitForTimeout(1300);await p.keyboard.down('w');await p.waitForTimeout(2500);assert.equal((await state()).at,null,'holding forward cannot auto-lock a station');await p.keyboard.up('w');
 await p.evaluate(()=>window.__whitebox.run.walkTo('camera'));await p.waitForTimeout(1300);const beforeEscape=await state();await p.keyboard.press('Escape');await p.waitForTimeout(200);const afterEscape=await state();assert(Math.hypot(afterEscape.pose.x-beforeEscape.pose.seatEye[0],afterEscape.pose.z-beforeEscape.pose.seatEye[2])<.03,'Escape preserves current location');
 await p.evaluate(()=>window.__whitebox.run.walkTo('camera'));await p.waitForTimeout(1300);const subBefore=(await state()).sub;await p.keyboard.down('PageUp');await p.waitForTimeout(600);await p.keyboard.up('PageUp');assert((await state()).sub[1]>subBefore[1],'PageUp still controls submarine heave');
 assert.deepEqual(errors,[]);await writeFile('qa/cockpit/movement-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS all WASD directions from camera/nav/lab; no auto-lock, no teleport, separate submarine heave');
}finally{await b.close();}
