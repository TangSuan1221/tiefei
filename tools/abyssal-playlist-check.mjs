// Explicit synthetic decoder fixture, never delivered as narrative evidence.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5180/');
 const result=await page.evaluate(async()=>{
  const {installRemotePlaylist}=await import('/src/pod/view/footage.ts');
  const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');const stream=c.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  for(let i=0;i<20;i++){ctx.fillStyle=`hsl(${i*15} 70% 40%)`;ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('TEST FIXTURE '+i,20,90);await new Promise(r=>setTimeout(r,100));}
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:'video/webm'});
  const frames=await installRemotePlaylist('local-decoder-fixture','test',[blob,blob]);
  return {fixture:true,frames:frames.length,distinctFrames:new Set(frames).size,bytes:blob.size};
 });
 await mkdir('qa/level-03/media',{recursive:true});await writeFile('qa/level-03/media/decoder-fixture.json',JSON.stringify(result,null,2));console.log(result);assert.equal(result.frames,6);assert(result.distinctFrames>=3);
}finally{await browser.close();}
