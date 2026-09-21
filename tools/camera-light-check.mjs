import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/video/**',r=>r.abort());
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.walkTo('camera');r.arrive();r.lamp=false;r.flareLeft=0;r.fx.flash=0;});
 await page.waitForTimeout(1800);
 const samples=[];
 for(const on of [false,true]){
  const value=await page.evaluate(on=>{
   const r=window.__pod;r.lamp=on;r.flareLeft=0;r.fx.flash=0;
   const c=document.createElement('canvas');c.width=640;c.height=450;const ctx=c.getContext('2d');
   r.authoredSite.draw(ctx,640,450,0);
   const data=ctx.getImageData(0,0,640,450).data;let sum=0;
   for(let i=0;i<data.length;i+=4)sum+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
   return sum/(640*450);
  },on);
  samples.push(value);await page.waitForTimeout(700);await page.screenshot({path:join(tmpdir(),`camera-light-${on?'on':'off'}.png`)});
 }
 assert.ok(samples[1]>samples[0]*1.8,JSON.stringify(samples));
 console.log('PASS off/on average luminance',samples,'screenshots',tmpdir());
}finally{await browser.close();}
