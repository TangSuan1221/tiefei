import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
// Diagnostic fixed poses for visual inspection, not a player playthrough.
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod?.authoredSite);
 await mkdir('qa/harbor/clearance-margin',{recursive:true});
 for(const [name,pos,heading] of [['inspection-wall',[5,0,10],270],['maintenance-lane',[11,0,29],180]]){
  const image=await page.evaluate(({pos,heading})=>{const r=window.__pod,s=r.authoredSite;r.lamp=true;s.position.set(...pos);r.heading=heading;r.pitch=-10;r.camPan=r.camTilt=0;s.tick(.01);const c=document.createElement('canvas');c.width=1280;c.height=800;s.draw(c.getContext('2d'),1280,800,r.clock,true);return c.toDataURL();},{pos,heading});
  await writeFile(`qa/harbor/clearance-margin/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
 }
}finally{await browser.close();}
