import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();let posts=[];
 await page.route('**/api/video/**',async route=>{
  const req=route.request();if(req.method()==='POST'){const body=req.postDataJSON();posts.push(body);await route.fulfill({json:{id:'mock-'+posts.length,status:'completed'}});}
  else await route.fulfill({contentType:'video/mp4',body:'MOCK-MEDIA-NOT-A-REAL-VIDEO'.repeat(128)});
 });
 await page.route('**/src/pod/net/video.ts',async route=>{
  const response=await route.fetch();let body=await response.text();
  body=body.replace(/export const VIDEO_ENABLED = [\s\S]*?;/,'export const VIDEO_ENABLED = true;').replace('const FIRST_POLL_DELAY = 6000','const FIRST_POLL_DELAY = 0');
  await route.fulfill({response,body});
 });
 await page.goto('http://127.0.0.1:5173/');
 const results=await page.evaluate(async()=>{
  sessionStorage.clear();
  const realCreate=document.createElement.bind(document);let duration=10;
  document.createElement=(tag,...args)=>{
   if(tag!=='video')return realCreate(tag,...args);
   const v={duration,videoWidth:640,videoHeight:360,readyState:4,paused:true,onloadeddata:null,onerror:null,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){}};
   Object.defineProperty(v,'src',{set(){setTimeout(()=>v.onloadeddata?.(),0);}});return v;
  };
  const {installFootageSink}=await import('/src/pod/view/footage.ts');
  const r={shot:{token:1},videoStatus:''};installFootageSink(r);
  const base={legId:'test',keyframe:'data:image/png;base64,AA==',prompt:'MONSTER_SUBJECTS: pale limbed creature',fallbackPrompt:'MONSTER_SUBJECTS: pale limbed creature',duration:10,allowed:true,token:1};
  const send=(x)=>new Promise(resolve=>r.footageSink({...base,...x,settle:(...a)=>resolve(a)}));
  const denied=await send({cacheKey:'denied',allowed:false});
  const [warm,joined]=await Promise.all([send({cacheKey:'story',prefetch:true,token:-1}),send({cacheKey:'story'})]);
  const cached=await send({cacheKey:'story'});
  duration=5;const ordinary=await send({cacheKey:'ordinary',duration:5});
  const mismatch=await send({cacheKey:'different-duration',duration:10});
  duration=5.14;const padded=await send({cacheKey:'padded',duration:5});
  duration=5.184;const reported=await send({cacheKey:'reported',duration:5});
  duration=NaN;const invalid=await send({cacheKey:'invalid',duration:5});
  return {denied,warm,joined,cached,ordinary,mismatch,padded,reported,invalid};
 });
 console.log(JSON.stringify({durations:posts.map(p=>p.duration),results}));
 assert.equal(posts.length,6);assert.deepEqual(posts.map(p=>p.duration),[10,5,10,5,5,5]);
 assert.equal(results.denied[1],false);for(const k of ['warm','joined','cached','ordinary','mismatch','padded','reported'])assert.equal(results[k][1],true,k);
 assert.equal(results.invalid[1],false);console.log('PASS mocked video transport: no empty-scene charge, 10s/5s POST, prefetch join/cache one POST, accepts encoded duration variation including 5.14s/5.184s; rejects invalid media duration');
}finally{await browser.close();}
