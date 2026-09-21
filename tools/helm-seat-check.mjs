import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Verified at 1440x1000, helmLook=.484 after the right-drag below.
// Never click camera.shoot: this check does not request exposure/video generation.
const controls={lamp:[775,500],stick:[130,420],stickForward:[130,302],release:[1320,667]};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.keyboard.press('4');await page.waitForFunction(()=>Math.abs(window.__cabinPose().seatEye[2]+.43)<.0001);
 const before=await page.evaluate(()=>window.__cabinPose());
 await page.screenshot({path:join(tmpdir(),'industrial-helm-forward.png')});
 await page.mouse.move(720,420);await page.mouse.down({button:'right'});await page.mouse.move(720,640,{steps:12});await page.mouse.up({button:'right'});
 await page.waitForTimeout(1600);const after=await page.evaluate(()=>window.__cabinPose());
 assert.ok(after.helmLook>.35);assert.ok(Math.abs(before.seatEye[2]-after.seatEye[2])<.04,'looking at panel never retreats');
 assert.ok(Math.abs(after.helmLook-.484)<.001,'repeatable panel look angle');
 await page.screenshot({path:join(tmpdir(),'industrial-helm-console.png')});
 const lamp=await page.evaluate(()=>window.__pod.lamp);
 if(process.argv.includes('--attack')){
  await page.keyboard.press('F10');
  await page.locator('.gm-console input').fill('怪物入侵 120');
  await page.locator('.gm-console input').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('.gm-console:not(.hidden)'));
  await page.waitForFunction(()=>!window.__pod.driveInputBlocked);
  if(process.argv.includes('--red')){
   await page.waitForFunction(()=>window.__pod.hull<=.5,null,{timeout:30000});
   console.log('Red alarm state',await page.evaluate(()=>({hull:window.__pod.hull,block:window.__pod.driveBlock,power:window.__pod.power,outcome:window.__pod.outcome,pose:window.__cabinPose()})));
  }
 }
 await page.mouse.click(...controls.lamp);assert.notEqual(await page.evaluate(()=>window.__pod.lamp),lamp,'horizontal instrument lamp key');
 const traveled=await page.evaluate(()=>window.__pod.traveled);
 await page.mouse.move(...controls.stick);await page.mouse.down();await page.mouse.move(...controls.stickForward,{steps:10});
 if(process.argv.includes('--attack'))await page.waitForFunction(()=>window.__pod.pilot.speed>.05,null,{timeout:12000});
 else await page.waitForFunction(d=>window.__pod.traveled>d+.3,traveled,{timeout:12000});
 await page.mouse.up();
 assert.ok(await page.evaluate(()=>window.__pod.pilot.speed>0),'release stick retains inertia');
 await page.mouse.click(...controls.release);await page.waitForFunction(()=>window.__pod.at===null);
 assert.deepEqual(errors,[],'no browser errors');
 console.log('PASS fixed seat, look-down, lamp (775,500), joystick (130,420) -> (130,302), retained inertia, seat release (1320,667), no browser errors; no exposure requested');
 console.log('Screenshots:',join(tmpdir(),'industrial-helm-forward.png'),join(tmpdir(),'industrial-helm-console.png'));
}finally{await browser.close();}
