import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='qa/cctv-tail-refined';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('CCTV'))errors.push(m.text());});
 await page.route('**/api/**',r=>r.abort());
 await page.route('**/cctv-qa',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#080b09;color:#b8c8b8;font:18px monospace"><h3 style="margin:16px">LOCAL PLAYBACK / LEFT: SOURCE · RIGHT: CCTV</h3><canvas id="pair" width="1440" height="810"></canvas></body>'}));
 const clip=await readFile(process.argv[2]??'qa/deepsea/art/environment-4/incident-approach.webm');await page.route('**/cctv-fixture.mp4',r=>r.fulfill({contentType:'video/mp4',body:clip}));
 await page.goto('http://127.0.0.1:5178/cctv-qa');
 const result=await page.evaluate(async()=>{
 const {drawCctvSignal}=await import('/src/pod/view/cctv-signal.ts');const {drawFootageFrame}=await import('/src/pod/view/footage.ts');
 const v=document.createElement('video');v.muted=true;v.src='/cctv-fixture.mp4';await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});v.currentTime=v.duration-.04;await new Promise(r=>v.onseeked=r);
 const canvas=document.getElementById('pair'),ctx=canvas.getContext('2d');const h=720*v.videoHeight/v.videoWidth,y=(810-h)/2;
 ctx.drawImage(v,0,y,720,h);ctx.save();ctx.translate(720,0);drawFootageFrame(ctx,720,810,v,{time:v.currentTime,corruption:0,light:1});ctx.restore();
 const test=document.createElement('canvas');test.width=720;test.height=405;const g=test.getContext('2d');
 const fixedTime=performance.now()/1000;drawCctvSignal(g,720,405,v,{time:fixedTime,corruption:1});const first=test.toDataURL();drawCctvSignal(g,720,405,v,{time:fixedTime,corruption:1});const pausedStable=first===test.toDataURL();
 const samples=[];for(let i=0;i<30;i++){const t=performance.now();drawCctvSignal(g,720,405,v,{time:2+i/30});samples.push(performance.now()-t);}
 const animated=first!==test.toDataURL();const picture=g.getImageData(0,0,720,405).data;let lit=0;for(let i=0;i<picture.length;i+=4)if(picture[i]+picture[i+1]+picture[i+2]>30)lit++;
 // A hard cut must discard the previous clip; readback is QA-only.
 const blank=document.createElement('canvas');blank.width=720;blank.height=405;blank.getContext('2d').fillRect(0,0,720,405);drawCctvSignal(g,720,405,blank,{time:0});const cut=g.getImageData(0,0,720,405).data;let cutMax=0;for(let i=0;i<cut.length;i+=4)cutMax=Math.max(cutMax,cut[i],cut[i+1],cut[i+2]);
 return {animated,video:[v.videoWidth,v.videoHeight,v.duration],pausedStable,litFraction:lit/(720*405),cutMax,meanMs:samples.reduce((a,b)=>a+b)/samples.length};
 });
 assert.equal(result.pausedStable,true);assert.equal(result.animated,true);assert.ok(result.litFraction>.1);assert.ok(result.cutMax<12,'previous clip leaked across a cut');assert.deepEqual(errors,[]);
 await page.evaluate(async()=>{const {drawCctvSignal}=await import('/src/pod/view/cctv-signal.ts');const v=document.createElement('video');v.muted=true;v.src='/cctv-fixture.mp4';await new Promise(r=>v.onloadeddata=r);v.currentTime=v.duration-.04;await new Promise(r=>v.onseeked=r);const g=document.getElementById('pair').getContext('2d');g.save();g.translate(720,0);drawCctvSignal(g,720,810,v,{time:3.2,corruption:1});g.restore();});
 await page.screenshot({path:dir+'/comparison.png'});
 const recording=await page.evaluate(async()=>{
  const {drawCctvSignal}=await import('/src/pod/view/cctv-signal.ts');const canvas=document.getElementById('pair'),g=canvas.getContext('2d');
  const v=document.createElement('video');v.muted=true;v.src='/cctv-fixture.mp4';await new Promise(r=>v.onloadeddata=r);
  const stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
  recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);v.currentTime=v.duration-.04;await new Promise(r=>v.onseeked=r);recorder.start();
  const start=performance.now();await new Promise(resolve=>{const frame=()=>{const h=720*v.videoHeight/v.videoWidth;g.fillStyle='#020403';g.fillRect(0,0,1440,810);g.drawImage(v,0,(810-h)/2,720,h);g.save();g.translate(720,0);drawCctvSignal(g,720,810,v,{time:performance.now()/1000,corruption:1});g.restore();if(performance.now()-start<4000)requestAnimationFrame(frame);else resolve();};frame();});
  recorder.stop();await done;v.pause();stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:'video/webm'});return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
 });await writeFile(dir+'/comparison.webm',Buffer.from(recording.split(',')[1],'base64'));await writeFile(dir+'/result.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
