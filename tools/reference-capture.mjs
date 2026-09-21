import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:860},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(process.argv.includes('--compare')) {
    await page.goto('http://127.0.0.1:5173/tools/reference-compare.html',{waitUntil:'networkidle'});
    await page.screenshot({path:process.argv[2]??'qa/deepsea/reference-comparison.png',fullPage:true});
    console.log(JSON.stringify({comparison:true,errors}));
    await browser.close();process.exit(errors.length ? 1 : 0);
  }
  await page.goto('http://127.0.0.1:5173/reference.html?still&clean',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.referenceProbe,{},{timeout:30000});
  const samples=await page.evaluate(async()=>{const a=[];for(let i=0;i<6;i++){await new Promise(r=>requestAnimationFrame(r));a.push(window.referenceProbe.draw());}return a;});
  await page.screenshot({path:process.argv[2]??'qa/deepsea/reference-pass-1.png'});
  if(process.argv.includes('--verify')) {
    await page.evaluate(()=>{window.referenceProbe.setLamp(false);window.referenceProbe.draw();});
    await page.screenshot({path:'qa/deepsea/reference-lamp-off.png'});
    await page.evaluate(()=>{window.referenceProbe.setLamp(true);window.referenceProbe.setPose(.3,.15,1.8,-.14,.03);});
    await page.screenshot({path:'qa/deepsea/reference-alternate.png'});
    await page.evaluate(()=>window.referenceProbe.reset());
    const before=await page.evaluate(()=>window.referenceProbe.getStats().position);
    await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
    const after=await page.evaluate(()=>window.referenceProbe.getStats().position);
    if(Math.abs(after[2]-before[2])<.04) errors.push('W movement did not change camera position');
    console.log(JSON.stringify({movement:{before,after}}));
  }
  console.log(JSON.stringify({samples,stats:await page.evaluate(()=>window.referenceProbe.getStats()),errors}));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
