import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='qa/level-03/media';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],blockedApi=[];
 // Local verification must never contact the video service, even if project settings change.
 if(!process.argv.includes('--generate'))await page.route('**/api/**',route=>{blockedApi.push({url:route.request().url(),method:route.request().method()});return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const Original=window.WebSocket;window.WebSocket=function(url,protocols){if(protocols==='vite-hmr')return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Original(url,protocols);};});
 await page.goto('http://127.0.0.1:5180/?level=3');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const {composeAbyssMedia}=await import('/src/pod/content/abyssal-media.ts');const s=window.__abyss;
  const parts=composeAbyssMedia(s.story,'L3-E01');const all=s.story.pipeline.shots.filter(x=>x.videoType==='elias-story').flatMap(x=>composeAbyssMedia(s.story,x.id));const urls=[...new Set(all.map(p=>p.plate))];const images=await Promise.all(urls.map(async url=>({url,status:(await fetch(url)).status})));
  const {VIDEO_ENABLED}=await import('/src/pod/net/video.ts');
  return {parts:parts.map(p=>({id:p.id,length:p.prompt.length,duration:p.duration})),allParts:all.map(p=>({id:p.id,length:p.prompt.length})),images,enabled:VIDEO_ENABLED};
 });
 assert.equal(result.parts.length,2);assert(result.images.every(x=>x.status===200));
 if(!process.argv.includes('--generate')){
  result.localOnly=await page.evaluate(async()=>{
   sessionStorage.removeItem('ironlung.abyssal.videoConsent');
   const s=window.__abyss,before=JSON.stringify(s.story.snapshot());
   s.requestMedia('L3-E01');s.media.retry();
   await new Promise(resolve=>setTimeout(resolve,500));
   return {consent:sessionStorage.getItem('ironlung.abyssal.videoConsent'),pending:s.pendingMedia.some(p=>p.shotId==='L3-E01'),delivered:s.deliveredMedia.has('L3-E01'),storyUnchanged:before===JSON.stringify(s.story.snapshot())};
  });
  assert.equal(result.localOnly.consent,null);assert.equal(result.localOnly.pending,true);
  assert.equal(result.localOnly.delivered,false);assert.equal(result.localOnly.storyUnchanged,true);
  result.blockedApi=blockedApi;assert.deepEqual(blockedApi,[],'No video API request should even be attempted without consent');
 }
 if(process.argv.includes('--generate')){
  await page.evaluate(()=>window.__abyss.requestMedia('L3-E01'));
  for(let i=0;i<240;i++){
   await page.waitForTimeout(1000);
   const state=await page.evaluate(()=>({status:window.__pod.videoStatus,delivered:window.__abyss.deliveredMedia.has('L3-E01'),tapes:window.__pod.tapes.map(t=>({id:t.id,videoResult:t.videoResult,frames:t.sensorFrames?.length}))}));
   if(i%15===0)console.log(state.status);
   if(state.delivered){result.generated=state;break;}
   if(/未完成|缺少|未启用|失败|拒绝|超时/.test(state.status)&&i>5){result.failure=state;break;}
  }
 }
 result.errors=errors;await writeFile(dir+'/result.json',JSON.stringify(result,null,2));console.log(result);assert.deepEqual(errors,[]);
}finally{await browser.close();}
