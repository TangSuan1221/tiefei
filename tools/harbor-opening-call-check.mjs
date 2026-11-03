import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5190/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;s.tick(.1);
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  assert(s.simpleFlow.pending===null,'No video before first door opens');
  s.base.state.opened.push('harbor.edge.A-C');s.tick(.1);
  assert(s.simpleFlow.pending==='L1-R28-V01','Opening door queues distress call');
  const {installRemotePlaylist,drawLabRecording,pauseHarborCallAway}=await import('/src/pod/view/footage.ts');
  const {labDeskAction,drawLabDesk}=await import('/src/pod/view/lab-desk.ts');
  const {HitMap}=await import('/src/pod/view/chrome.ts');
  const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');
  const stream=c.captureStream(20),rec=new MediaRecorder(stream),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(resolve=>rec.onstop=resolve);rec.start();
  for(let i=0;i<25;i++){ctx.fillStyle=i%2?'#315747':'#182a22';ctx.fillRect(0,0,320,180);await new Promise(r=>setTimeout(r,50));}
  rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
  const key='harbor-task:L1-R28-V01:opening-test',clip=new Blob(chunks,{type:rec.mimeType});const frames=await installRemotePlaylist(key,r.leg.id,[clip,clip]);
  r.receiveRemoteTape({id:'harbor.task.L1-R28-V01',siteName:'TEST',frames,siteEvidence:{harborTask:'L1-R28-V01',generated:true},videoResult:'video',cacheKey:key});
  r.at='lab';r.blackout=false;r.power=1;
  assert(drawLabRecording(ctx,r,320,180).includes('呼叫'),'Must not autoplay');
  r.analyzeTape();assert(!s.simpleFlow.accepted.length,'Analyze cannot bypass playback');
  const hits=new HitMap();drawLabDesk(ctx,r,0,0,320,180,hits,null,{playback:()=>'',controls:[]});
  assert(labDeskAction(r,'lab.answerCall'),'Answer call');drawLabRecording(ctx,r,320,180);
  assert(!s.simpleFlow.accepted.length,'Click does not complete');
  r.at='nav';pauseHarborCallAway(r);await new Promise(r=>setTimeout(r,1500));
  assert(!s.simpleFlow.accepted.length,'Away does not complete');r.at='lab';
  for(let i=0;i<30;i++){drawLabRecording(ctx,r,320,180);await new Promise(r=>setTimeout(r,50));}
  assert(!s.simpleFlow.accepted.length,'First segment alone cannot complete multipart call');
  for(let i=0;i<90&&!s.simpleFlow.accepted.length;i++){drawLabRecording(ctx,r,320,180);await new Promise(r=>setTimeout(r,50));}
  assert(s.simpleFlow.accepted.includes('L1-R28-V01'),'All segments naturally end before completion');assert(s.objective.includes('回应'),'Response follows distress call');
  const accepted=s.simpleFlow.accepted.length;r.analyzeTape();assert(s.simpleFlow.accepted.length===accepted,'Idempotent completion');
  return {objective:s.objective,accepted:s.simpleFlow.accepted};
 });console.log(result);assert.deepEqual(result.accepted,['L1-R28-V01']);console.log('PASS R28: first-door trigger, explicit call, early analysis blocked, away pause, multipart playback completion, idempotence. Isolated local synthetic video; no provider requests or blind-play claims.');
}finally{await browser.close();}

