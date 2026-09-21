import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const pass=process.argv[2]??'pass-0';
if(!/^[a-z0-9-]+$/.test(pass))throw new Error('Invalid capture identifier');
await mkdir(`qa/deepsea/art/${pass}`,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/expedition.html?qa=1&clean',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.expeditionProbe);
  const results=[];
  for(let i=0;i<7;i++){
    await page.evaluate(i=>{window.expeditionProbe.loadLevel(i);window.expeditionProbe.resetLevel();},i);
    await page.waitForTimeout(900);
    await page.screenshot({path:`qa/deepsea/art/${pass}/entry-${i+1}.png`});
    const pose=await page.evaluate(()=>{const p=window.expeditionProbe,s=p.snapshot();const a=s.anchors?.[0];
      if(a){p.setPose(...a.view,a.yaw,a.pitch);return {anchor:a.name,view:a.view};}
      const r=s.level.rooms.find(r=>r.role==='hall');p.setPose(r.x,0,r.z+r.depth*.28,0,0);return {anchor:'baseline',view:[r.x,0,r.z+r.depth*.28]};
    });
    await page.waitForTimeout(1500);await page.screenshot({path:`qa/deepsea/art/${pass}/hall-${i+1}.png`});
    results.push({level:i+1,...pose,...await page.evaluate(()=>window.expeditionProbe.draw())});
    await page.evaluate(()=>{const p=window.expeditionProbe,a=p.snapshot().storyViews?.[0];if(a)p.setPose(...a.view,a.yaw,a.pitch);});
    await page.waitForTimeout(1000);await page.screenshot({path:`qa/deepsea/art/${pass}/story-${i+1}.png`});
    await page.evaluate(()=>{const p=window.expeditionProbe,a=p.snapshot().passageViews?.[0];if(a)p.setPose(...a.view,a.yaw,a.pitch);});
    await page.waitForTimeout(800);await page.screenshot({path:`qa/deepsea/art/${pass}/passage-${i+1}.png`});
    await page.keyboard.press('m');await page.locator('#map-blueprint').check();
    await page.waitForTimeout(150);await page.screenshot({path:`qa/deepsea/art/${pass}/map-${i+1}.png`});
    await page.keyboard.press('m');
  }
  await page.goto(`http://127.0.0.1:5173/tools/expedition-art-compare.html?pass=${pass}`,{waitUntil:'networkidle'});
  await page.screenshot({path:`qa/deepsea/art/${pass}/contact-sheet.png`,fullPage:true});
  await page.goto('http://127.0.0.1:5173/tools/expedition-spatial-pair.html',{waitUntil:'networkidle'});
  await page.screenshot({path:'qa/deepsea/art/spatial-review-pair.png',fullPage:true});
  console.log(JSON.stringify({pass,results,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
