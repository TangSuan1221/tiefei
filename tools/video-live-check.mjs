import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:5173/');
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const r=window.__pod;r.walkTo('camera');r.heading=r.leg.safeHeading;r.arrive();r.lamp=true;
  const frame=r.captureKeyframe();
  const {requestVideo,VIDEO_ENABLED}=await import('/src/pod/net/video.ts');
  if(!VIDEO_ENABLED)return {enabled:false};
  const result=await requestVideo('Underwater inspection camera. Preserve the attached industrial corridor exactly. Only drifting marine particles and subtle water motion. No cuts.',undefined,frame);
  if(!result.ok)return {enabled:true,ok:false,failure:result.fail};
  const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(result.blob);
  const decoded=await new Promise(resolve=>{video.onloadeddata=()=>resolve(true);video.onerror=()=>resolve(false);setTimeout(()=>resolve(false),12000);});
  URL.revokeObjectURL(video.src);
  return {enabled:true,ok:true,jobId:result.videoId,bytes:result.blob.size,decoded,width:video.videoWidth,height:video.videoHeight};
 });
 console.log(JSON.stringify(result));
}finally{await browser.close();}
