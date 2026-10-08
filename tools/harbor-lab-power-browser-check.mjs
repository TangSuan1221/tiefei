import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/harbor/lab-power-2026-10-05';await mkdir(dir,{recursive:true});
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
  r.walkTo('lab');r.blackout=true;
  const c=document.createElement('canvas');c.width=1024;c.height=720;const ctx=c.getContext('2d'),texts=[];
  const fill=ctx.fillText.bind(ctx);ctx.fillText=(t,...a)=>{texts.push(t);fill(t,...a);};
  drawStationView(ctx,r,'lab',0,0,1024,720,new HitMap(),{time:0,dt:0});
  const blackoutImage=c.toDataURL();if(!texts.some(t=>t.includes('供电中断')))throw Error('No offline message');
  if(stationControls(r,'lab').some(x=>x.id==='lab.analyze'||x.id==='lab.localPlayback'))throw Error('Offline playback remains enabled');
  performControl(r,'lab.restoreBus');if(!r.powered||r.sonarEmitting)throw Error('Restore bus failed or emitted sonar');
  r.power=0;
  performControl(r,'station:life');if(r.at!=='life')throw Error('Recovery route missing');
  const cells=r.count('sup.cell');if(!performControl(r,'use:sup.cell')||!r.powered||r.count('sup.cell')!==cells-1)throw Error('Existing battery recovery failed');
  r.walkTo('lab');performControl(r,'lab.analyze');step();
  if(!tape.analyzed||!s.rescue.state.identified||s.dialogue.stage!=='report')throw Error('Real film analysis did not release report');
  if(stationControls(r,'lab').some(x=>x.id==='lab.evidence'))throw Error('Misleading physical evidence button');
  drawStationView(ctx,r,'lab',0,0,1024,720,new HitMap(),{time:1,dt:0});
  return{frames:tape.sensorFrames.length,ready:tape.ready,analyzed:tape.analyzed,stage:s.dialogue.stage,remainingCells:r.count('sup.cell'),blackoutImage,analyzedImage:c.toDataURL()};
 });
 for(const [key,name] of [['blackoutImage','offline'],['analyzedImage','verified']]){await writeFile(`${dir}/${name}.png`,Buffer.from(result[key].split(',')[1],'base64'));delete result[key];}
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify({method:'Diagnostic position/time; actual capture/development, station dispatcher, existing battery inventory and tape analysis. Not a manual playthrough.',...result,errors},null,2));console.log('PASS',result);
}finally{await browser.close();}
