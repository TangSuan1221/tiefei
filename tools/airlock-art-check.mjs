import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.lamp=true;r.heading=90;r.walkTo('camera');});
 await page.waitForFunction(()=>window.__cabinPose?.().seatEye[2]<-.40,{},{timeout:60000});
 await mkdir('qa/harbor/airlock-reference',{recursive:true});
 await page.screenshot({path:'qa/harbor/airlock-reference/gate.png'});
 assert.deepEqual(errors,[]);console.log('PASS airlock driver rendering');
}finally{await browser.close();}
