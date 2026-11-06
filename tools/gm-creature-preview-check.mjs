import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{port:0},define:{'import.meta.env.VITE_VIDEO_ENABLED':'"1"'}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage(),bodies=[];
 await page.route('**/api/video/**',async route=>{bodies.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:'{"error":{"message":"preview test rejection"}}'});});
 await page.goto(server.resolvedUrls.local[0]);
 const result=await page.evaluate(async()=>{
  const {bindGm,executeGm}=await import('/src/pod/view/gm.ts');
  const run={authoredSite:{index:0,videoContext:()=>({story:false,settled:false,stateKey:'test',nearestMonster:50,scene:'submerged harbor',actors:[],monsters:[],outcome:'none'})},captureKeyframe:()=> 'data:image/png;base64,AA==',tapes:[]};
  bindGm({run:()=>run,reinstallSink:()=>{}});
  sessionStorage.setItem('ironlung.gm.novideo','1');const disabled=executeGm('怪物试拍');
  sessionStorage.setItem('ironlung.gm.novideo','0');run.authoredSite.index=1;const wrong=executeGm('怪物试拍');run.authoredSite.index=0;
  const started=executeGm('怪物试拍'),duplicate=executeGm('怪物试拍');
  return {disabled,wrong,started,duplicate,tapes:run.tapes.length};
 });
 assert.match(result.disabled,/关闭无视频/);assert.match(result.wrong,/先进入第一关/);
 assert.match(result.started,/已开始/);assert.match(result.duplicate,/正在生成/);assert.equal(result.tapes,0);
 await page.locator('.gm-creature-preview').getByText(/试拍失败：submit/).waitFor();
 assert.equal(bodies.length,1);assert.equal(bodies[0].content.length,2);
 assert.match(bodies[0].prompt,/fused mass of multiple human-like heads/);
 assert.match(bodies[0].prompt,/Diagnostic appearance preview/);
 assert(bodies[0].content[1].image_url.url.length>1000000);
 await page.locator('.gm-creature-preview button').click();assert.equal(await page.locator('.gm-creature-preview').count(),0);
 console.log('PASS: GM command, no-video/level guards, duplicate guard, actual anatomy attachment, isolated preview, failure and close. All video API calls intercepted.');
}finally{await browser.close();await server.close();}
