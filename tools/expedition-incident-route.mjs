import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Controlled visibility/reach demonstration, NOT a blind human navigation test.
// One QA start placement; subsequent translation is real W input. Aiming is scripted.
const pass=process.argv[2]??'environment-4';
if(!/^environment-[0-9]+$/.test(pass))throw new Error('Invalid evidence pass');
const evidence=`qa/deepsea/art/${pass}`;
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:5173/expedition.html?qa=1&clean&level=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.expeditionProbe);
  await page.evaluate(()=>window.expeditionProbe.resetLevel());
  await page.evaluate(()=>{
    const stream=document.querySelector('#view').captureStream(20),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.routeCapture={recorder,chunks,stream};recorder.start();
  });
  const route=await page.evaluate(()=>{
    const p=window.expeditionProbe,s=p.snapshot(),r=s.level.rooms.find(r=>r.id.endsWith('.s0.r3'));
    const x=r.x,z=r.z+r.depth/2-1;
    p.setPose(x,0,z,0,0);
    return {room:r.id,center:[r.x,r.z],start:[x,z],item:s.level.items.find(i=>i.id.endsWith('.s0.incident-record')).id};
  });
  await page.waitForTimeout(1000);
  await page.screenshot({path:`${evidence}/route-start.png`});
  await page.keyboard.down('w');
  try{
    await page.waitForFunction(({center})=>window.expeditionProbe.snapshot().position[2]<center[1]+.15,route,{timeout:22000,polling:100});
  }finally{await page.keyboard.up('w');}
  await page.waitForTimeout(600);
  await page.evaluate(({center})=>{
    const p=window.expeditionProbe,s=p.snapshot(),eye=s.position;
    const d=[center[0]+3.06-eye[0],-1.2-eye[1],center[1]-3.02-eye[2]];
    p.setPose(...eye,Math.atan2(-d[0],-d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2])));
  },route);
  await page.waitForTimeout(900);
  await page.screenshot({path:`${evidence}/route-discovery.png`});
  await page.keyboard.down('w');
  try{await page.waitForFunction(id=>window.expeditionProbe.snapshot().target?.id===id,route.item,{timeout:8000,polling:100});}
  finally{await page.keyboard.up('w');}
  await page.keyboard.press('f');await page.waitForTimeout(500);
  assert.equal(await page.evaluate(id=>window.expeditionProbe.snapshot().state.collected.includes(id),route.item),true);
  await page.screenshot({path:`${evidence}/route-inspect.png`});
  const recording=await page.evaluate(async()=>{
    const {recorder,chunks,stream}=window.routeCapture;
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});
    stream.getTracks().forEach(t=>t.stop());
    return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
  });
  await writeFile(`${evidence}/incident-approach.webm`,Buffer.from(recording));
  await context.close();
  console.log(JSON.stringify({route,translation:'actual W input',aim:'scripted',collected:true,humanDiscoverabilityVerified:false}));
}finally{await browser.close();}
