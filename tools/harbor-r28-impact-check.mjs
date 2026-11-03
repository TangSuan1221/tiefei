import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5190/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  // Dialogue acceptance is staged; hull integration and pursuit are actual adapter code.
  window.requestAnimationFrame=()=>0;
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;s.taskPlayer.dispose();
  s.base.state.opened.push('harbor.edge.A-C');s.tick(.01);const f=s.simpleFlow;
  f.accept('L1-R28-V01');f.identify();f.accept('L1-R28-V02');f.backgroundRequested=true;f.accept('L1-R28-V02A');
  r.hull=1;r.activeSonarEnabled=true;r.power=1;r.blackout=false;
  s.tick(.01);const first=r.hull;s.tick(.5);const between=r.hull;s.tick(1.6);const second=r.hull;
  for(let i=0;i<100;i++)s.tick(.1);const beforeWarning=r.hull;
  const saved=s.snapshot();const restored=s.restore(saved);s.tick(.1);const afterRestore=r.hull;
  f.accept(f.pending);
  // An already acknowledged archive must not grant immunity while it replays.
  const {installRemotePlaylist,drawLabRecording,labPlaybackRunning}=await import('/src/pod/view/footage.ts');
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(20),rec=new MediaRecorder(stream),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  const stopped=new Promise(resolve=>rec.onstop=resolve);rec.start();
  for(let i=0;i<30;i++){ctx.fillStyle=i%2?'#123':'#345';ctx.fillRect(0,0,320,180);await new Promise(resolve=>setTimeout(resolve,50));}
  rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const key='harbor-task:L1-R28-V03:replay-fixture',frames=await installRemotePlaylist(key,r.leg.id,[new Blob(chunks,{type:rec.mimeType})]);
  r.receiveRemoteTape({id:'harbor.task.L1-R28-V03',siteName:'LOCAL TEST',frames,siteEvidence:{harborTask:'L1-R28-V03',generated:true},videoResult:'video',cacheKey:key});r.selectedTape.analyzed=true;r.at='lab';
  for(let i=0;i<20&&!labPlaybackRunning(r);i++){drawLabRecording(ctx,r,320,180);await new Promise(resolve=>setTimeout(resolve,50));}const replaying=labPlaybackRunning(r);
  s.tick(30);const loud=r.hull;
  r.activeSonarEnabled=false;for(let i=0;i<100;i++)s.tick(.1);const quiet=r.hull;
  return {first,between,second,beforeWarning,restored,afterRestore,replaying,loud,quiet,impacts:f.impactCount};
 });
 assert.equal(result.first,.75);assert.equal(result.between,.75);assert.equal(result.second,.5);
 assert.equal(result.beforeWarning,.5);assert.equal(result.restored,true);assert.equal(result.afterRestore,.5);assert.equal(result.impacts,2);
 assert.equal(result.replaying,true);assert.ok(result.loud>0&&result.loud<.5);assert.equal(result.quiet,result.loud);
 console.log(JSON.stringify(result));console.log('PASS adapter fixture: two strikes to 50%, no repeat on wait/save, warning then active-sonar damage, quiet stops damage. Staged dialogue; no blind-play or real-media claim.');
}finally{await browser.close();}
