import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/harbor/shore-reach-2026-10-06';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
 const result=await page.evaluate(async()=>{
  window.requestAnimationFrame=()=>0;const r=window.__pod;r.receive();r.arrive();r.walkTo('nav');r.power=1;
  const {performControl,stationControls,drawStationView}=await import('/src/pod/view/stations.ts');
  const {HitMap}=await import('/src/pod/view/chrome.ts');
  const s=r.authoredSite,step=()=>s.tick(.25),until=stage=>{for(let i=0;i<1500;i++){if(s.dialogue.stage===stage&&!s.dialogue.busy)return;step();}throw Error('stage '+stage);};
  s.navigationConsole.setWaypoint([11,0,16]);s.position.set(11,0,16);step();s.position.set(35,0,30);step();s.navigationConsole.setFrequency(38.4);s.tick(.5);until('contact');s.navigationConsole.reply();until('photo');
  s.position.set(60,0,27);r.heading=r.camPan=r.camTilt=r.pitch=0;r.walkTo('camera');r.beginShoot();
  for(let i=0;i<40;i++)r.tickShot(.5);
  const tape=r.selectedTape;if(!tape?.ready||tape.sensorFrames.length<3)throw Error('No developed actual film');
  r.walkTo('lab');performControl(r,'lab.analyze');step();s.navigationConsole.reply();until('power');
  r.walkTo('camera');s.position.set(41,0,28);r.heading=r.camPan=r.camTilt=r.pitch=0;s.navigationConsole.setWaypoint([42,0,28]);
  return {stage:s.dialogue.stage};
 });
 await page.waitForFunction(()=>window.__pod.authoredSite.world.root.getObjectByName('rescue-blender-power-cabinet')?.userData.loaded);
 const reached=await page.evaluate(()=>{
  const r=window.__pod,s=r.authoredSite;
  for(let i=0;i<120;i++)s.move(.08);
  const hit=s.aimedInterface();r.activeSonarEnabled=true;
  const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d'),texts=[];const fill=ctx.fillText.bind(ctx);ctx.fillText=(t,...a)=>{texts.push(t);fill(t,...a);};
  s.navigationConsole.drawActive(ctx,1024,1024);
  window.__podView.frame(0,r);
  return {position:s.position.toArray(),hit,texts,hint:s.interactionHint()};
 });
 assert.equal(reached.hit.id,'harbor.rescue.power');assert(reached.hit.distance<=3.4);assert(reached.texts.some(t=>t.includes('位置到达')));
 await page.keyboard.press('f');
 const powered=await page.evaluate(()=>window.__pod.authoredSite.rescue.state.powered);assert(powered);
 await page.screenshot({path:dir+'/cabinet.png'});
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify({method:'Diagnostic start position and dialogue clock, actual hull movement to collision stop and keyboard F.',...result,...reached,powered,errors},null,2));console.log('PASS',reached,powered);
}finally{await browser.close();}

