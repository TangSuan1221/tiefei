import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let submitted;
 await page.route('**/api/video/**',async route=>{
   submitted={headers:route.request().headers(),body:route.request().postDataBuffer()?.toString('latin1')};
   await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'TEST: no paid generation'}})});
 });
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
   const r=window.__pod;r.walkTo('camera');r.heading=r.leg.safeHeading;r.traveled=r.leg.length-.001;
   r.arrive();r.lamp=true;
   r.captureKeyframe();
   let request;r.footageSink=req=>{request=req;};
   r.beginShoot();const frozen=r.shot.keyframe,token=r.shot.token;
   if(!frozen?.startsWith('data:image/png;base64,')) throw Error('No PNG captured '+r.phase+' '+JSON.stringify(r.log?.slice(-3)));
   r.beginShoot();if(r.shot.token!==token||r.shot.keyframe!==frozen)throw Error('Duplicate shutter replaced frame');
   r.heading+=60;r.camPan=.4;
   const changed=r.captureKeyframe();
   r.shot.exposeLeft=.01;r.frame(.02);
   if(!request||request.keyframe!==frozen)throw Error('Request not frozen at exposure start');
   const {requestVideo,VIDEO_ENABLED}=await import('/src/pod/net/video.ts');
   const response=await requestVideo(request.prompt,undefined,request.keyframe);
   return {different:changed!==frozen,enabled:VIDEO_ENABLED,failed:!response.ok,bytes:frozen.length};
 });
 assert.ok(result.different);assert.ok(result.bytes>10000);assert.deepEqual(errors,[]);
 if(result.enabled){
   assert.match(submitted.headers['content-type'],/application\/json/);
   assert.match(JSON.parse(submitted.body).first_frame,/^data:image\/png;base64,/);
   assert.match(submitted.body,/exact opening frame/);assert.ok(result.failed);
 } else console.log('Video disabled: network payload check skipped');
 console.log('PASS live shutter snapshot, frozen during steering, duplicate capture rejected; first_frame JSON verified when video enabled; no paid request',result);
} finally {await browser.close();}
