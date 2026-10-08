import {chromium} from '@playwright/test';
import fs from 'node:fs';
const label=process.argv[2]||'before';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
 await page.waitForTimeout(1000);
 await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');await page.keyboard.press('e');await page.waitForTimeout(4500);
 if(await page.evaluate(()=>window.__pod.at)!=='camera')throw new Error('Not in E camera interaction');
 await page.screenshot({path:`qa/harbor/porthole-art/${label}-front.png`});
 const drag=async(dx,dy)=>{await page.mouse.move(960,430);await page.mouse.down({button:'right'});await page.mouse.move(960+dx,430+dy,{steps:24});await page.mouse.up({button:'right'});await page.waitForTimeout(1500);};
 await drag(-340,40);await page.screenshot({path:`qa/harbor/porthole-art/${label}-left.png`});
 await drag(680,0);await page.screenshot({path:`qa/harbor/porthole-art/${label}-right.png`});
 await drag(-340,200);await page.screenshot({path:`qa/harbor/porthole-art/${label}-helm.png`});
 fs.writeFileSync(`qa/harbor/porthole-art/${label}.json`,JSON.stringify({errors,viewport:[1920,1080],url:page.url(),label},null,2));console.log(label,errors);
}finally{await browser.close();}
