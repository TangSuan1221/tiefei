import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:760}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('qa/whitebox/normal',{recursive:true});
try{
 await page.goto('http://127.0.0.1:4173/whitebox.html');await page.locator('#whitebox-start').click();
 await page.waitForFunction(()=>!!window.__whitebox);
 const state=()=>page.evaluate(()=>{const {site,run}=window.__whitebox;return {position:site.position.toArray(),engaged:run.navDriveEngaged,log:site.navigationConsole.logOpen,coordinates:site.navigationConsole.receivedCoordinates,signal:site.navigationConsole.inSignal,captured:site.navigationConsole.captured,heard:site.navigationConsole.heard,active:run.activeSonarEnabled,events:site.events.map(e=>e.event)};});
 assert.equal((await state()).signal,false);
 await page.keyboard.press('1');await page.keyboard.press('c');await page.keyboard.press('p');
 assert.equal((await state()).captured,false);assert.equal((await state()).heard,false);
 await page.keyboard.press('1');await page.keyboard.press('r');await page.keyboard.press('0');await page.keyboard.press('Tab');await page.keyboard.press('4');await page.keyboard.press('Enter');
 const before=await state();await page.waitForTimeout(1500);assert.deepEqual((await state()).position,before.position);assert.equal((await state()).engaged,false);
 await page.keyboard.press('v');await page.waitForTimeout(1500);assert.equal((await state()).log,true);assert.match((await state()).coordinates,/X 0 \/ Z 4/);
 await page.screenshot({path:'qa/whitebox/normal/saved-coordinate-log.png'});
 await page.keyboard.press('v');await page.keyboard.press('2');assert.equal((await state()).active,true);await page.keyboard.press('2');assert.equal((await state()).active,false);
 assert.ok(!(await state()).events.some(e=>e.startsWith('艾里亚斯：')));assert.deepEqual(errors,[]);
 await writeFile('qa/whitebox/normal/receiver-check.json',JSON.stringify({passed:true,checks:['out-of-zone capture/play rejected','coordinate entry does not engage propulsion','saved coordinate record accessible','active sonar on/off'],errors},null,2));
 console.log('PASS receiver controls, saved coordinates, no automatic propulsion');
}finally{await browser.close();}
