import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto('http://127.0.0.1:5193/');
 const result=await page.evaluate(async()=>{
  const f=await import('/src/pod/view/footage.ts');
  const videos=[],create=document.createElement.bind(document);document.createElement=function(tag,...args){const el=create(tag,...args);if(tag==='video')videos.push(el);return el;};
  const decoded=[];
  const {HARBOR_LOCAL_VIDEO_IDS}=await import('/src/pod/content/harbor-local-videos.ts');
  for(const id of HARBOR_LOCAL_VIDEO_IDS){const response=await fetch('/assets/harbor/task-videos/'+id+'.mp4');if(!response.ok)throw Error('Missing '+id);const frames=await f.installRemotePlaylist(id,'harbor',[await response.blob()]);decoded.push({id,frames:frames.length,duration:videos.at(-1).duration});}
  const video=videos.at(-1);video.muted=true;video.currentTime=video.duration-.1;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));await video.play();await new Promise(r=>video.addEventListener('ended',r,{once:true}));
  const lastId=HARBOR_LOCAL_VIDEO_IDS.at(-1);
  const tape={id:'harbor.task.'+lastId,cacheKey:lastId,legId:'harbor',ready:true,analyzed:true};
  const run={selectedTape:tape,tapes:[tape],at:'lab',powered:true,shot:{phase:'idle'},labVideoExpanded:false};
  const {labDeskState}=await import('/src/pod/view/lab-desk.ts');
  const {commUi}=await import('/src/pod/view/comm-desk.ts');
  labDeskState(run).tab='comm';commUi(run).active=tape.id;
  const canvas=create('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');
  f.drawLabRecording(ctx,run,640,360);const first=canvas.toDataURL();await new Promise(r=>setTimeout(r,100));f.drawLabRecording(ctx,run,640,360);
  const stopped=video.ended&&video.paused,noiseMoves=first!==canvas.toDataURL();
  f.replayLabRecording(run);await new Promise(r=>setTimeout(r,80));const replay=!video.ended&&video.currentTime<1;video.pause();
  const button=create('button');button.id='test-fullscreen';button.style.cssText='position:fixed;top:0;left:0;z-index:999999';button.textContent='fullscreen';button.onclick=()=>f.expandLabRecording(run);document.body.append(button);
  return {decoded,stopped,noiseMoves,replay};
 });
 console.log(JSON.stringify({mediaVerification:result}));
 assert.equal(result.noiseMoves,true);assert.equal(result.stopped,true);assert.equal(result.replay,true);assert.ok(result.decoded.every(v=>v.frames===3&&v.duration>0));
 await page.locator('#test-fullscreen').click({force:true});
 const full=await page.evaluate(()=>({native:!!document.fullscreenElement,overlay:!!document.getElementById('lab-fullscreen-player')}));
 assert.equal(full.native,false);assert.equal(full.overlay,false);
 console.log(JSON.stringify({result,full}));
}finally{await browser.close();}



