import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();let posts=0,polls=0;
 await page.route('**/api/video/**',async route=>{
  const req=route.request();
  if(req.method()==='POST'){posts++;return route.fulfill({json:{id:'fixture-persisted-job',status:'queued'}});}
  if(req.url().endsWith('/content'))return route.fulfill({contentType:'video/mp4',body:Buffer.alloc(2048,1)});
  polls++;return polls===1?route.fulfill({status:503,json:{error:{message:'temporary fixture outage'}}}):route.fulfill({json:{id:'fixture-persisted-job',status:'completed'}});
 });
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5190/');
 const result=await page.evaluate(async()=>{
  const {requestVideo}=await import('/src/pod/net/video.ts');let saved=null;
  const first=await requestVideo('fixture',undefined,undefined,undefined,10,'fixed',{onSubmitted:id=>{saved=id;}});
  if(!saved)throw Error('Accepted job was not persisted before poll failure');
  const second=await requestVideo('fixture',undefined,undefined,undefined,10,'fixed',{resumeId:saved});
  return {firstOk:first.ok,secondOk:second.ok,saved};
 });
 assert.equal(result.firstOk,false);assert.equal(result.secondOk,true);assert.equal(posts,1);assert.equal(polls,2);
 console.log('PASS mocked transport: accepted job survives failed polling; retry resumes same ID with one POST. No provider calls or playable-media claim.');
}finally{await browser.close();}
