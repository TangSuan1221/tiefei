import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('qa/porthole-layout',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
const page=await browser.newPage({viewport:{width:1892,height:1324}});
await page.route('**/api/**',r=>r.abort());
await page.goto('http://127.0.0.1:5177/?level=1');
await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');await page.keyboard.press('e');await page.waitForTimeout(4000);
await page.evaluate(()=>{window.__pod.prologue=null;window.__pod.walkTo('camera');window.__pod.power=1;window.__pod.lamp=true;});await page.waitForTimeout(1500);
await page.screenshot({path:'qa/porthole-layout/cockpit.png'});
console.log(await page.evaluate(()=>({at:window.__pod.at,position:window.__pod.authoredSite?.position})));
}finally{await browser.close();}
