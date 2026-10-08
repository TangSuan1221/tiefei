import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});
try {
 const p=await b.newPage({viewport:{width:1495,height:871}}),errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5174/whitebox.html');await p.locator('#whitebox-start').click();await p.waitForFunction(()=>!!window.__whitebox);
 const state=()=>p.evaluate(()=>{const {run,view}=window.__whitebox;const c=view.cabin;return {at:run.at,pose:c.pose(),direction:c.camera.getWorldDirection(c.camera.position.clone()).toArray()};});
 for(const station of ['nav','lab','camera']){
  await p.evaluate(()=>window.__whitebox.run.walkTo('camera'));await p.waitForTimeout(1300);
  if(station!=='camera'){await p.mouse.click(station==='nav'?410:1070,300);await p.waitForTimeout(1300);}
  assert.equal((await state()).at,station);
  const before=await state();await p.mouse.move(750,400);await p.mouse.down({button:'right'});await p.mouse.move(940,470,{steps:15});await p.mouse.up({button:'right'});await p.waitForTimeout(1000);const turned=await state();
  assert.equal(turned.at,station,'looking must not cancel equipment context');assert(Math.hypot(...turned.direction.map((v,i)=>v-before.direction[i]))>.2,'right drag changes view');
  await p.waitForTimeout(900);const held=await state();assert(Math.hypot(...held.direction.map((v,i)=>v-turned.direction[i]))<.02,'no snapping back after release');
  await p.keyboard.down('s');await p.waitForTimeout(400);await p.keyboard.up('s');assert.equal((await state()).at,null,'WASD still leaves station');checks.push({station,before:before.direction,after:held.direction});
 }
 assert.deepEqual(errors,[]);await p.screenshot({path:'qa/cockpit/free-look.png'});await writeFile('qa/cockpit/free-look-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS actual sonar/lab clicks, free look, no snap-back, movement');
}finally{await b.close();}
