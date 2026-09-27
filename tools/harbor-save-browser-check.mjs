import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const dir='qa/harbor/save-browser';
await mkdir(dir,{recursive:true});
const result={method:'Formal index new/continue UI; DIAGNOSTIC arrival and hero positioning. Real browser animation loop runs exposure and 12s development. Real renderer sensor frames, localStorage, page reload and LAB analysis. Not an unassisted navigation test.',observations:['Runtime requires 12s development AFTER 5s exposure, not 12s total.'],errors:[],blocked:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 // Fresh isolated profile; deny external requests and every local API endpoint.
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if((url.protocol==='http:'||url.protocol==='https:')&&(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname.startsWith('/api/'))){result.blocked.push({url:url.origin+url.pathname,method:route.request().method()});return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 result.before=await page.evaluate(async()=>{
  const r=window.__pod;r.receive();r.arrive();r.at='camera';r.lamp=true;r.footageSink=null;
  const s=r.authoredSite;if(s.snapshot().levelId!=='harbor.1')throw Error('Wrong scene');
  // DIAGNOSTIC placement copied from integration-check; no grants/doors/evidence injected.
  const hero=s.world.root.getObjectByName('harbor.asset.rescue-pod');if(!hero)throw Error('Hero missing');
  s.position.set(60,0,34);const p=hero.position,dx=p.x-s.position.x,dy=p.y-s.position.y,dz=p.z-s.position.z;
  r.heading=Math.atan2(dx,-dz)*180/Math.PI;r.pitch=-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI;r.camPan=r.camTilt=0;
  for(let i=0;i<20;i++)r.frame(.05);
  r.beginShoot();const capture=structuredClone(r.shot.siteEvidence);
  const started=performance.now();
  while(['exposing','developing'].includes(r.shot.phase)){
   if(performance.now()-started>90000)throw Error('Real-time exposure/development timeout');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  const tape=r.selectedTape,exposure=s.snapshot().harbor.exposures.find(e=>e.id===capture.id);
  if(!exposure?.valid)throw Error('Hero exposure invalid '+JSON.stringify(capture));
  if(!tape||tape.analyzed||(tape.sensorFrames?.length??0)<3)throw Error('No playable unanalysed sensor sequence');
  const decoded=await Promise.all(tape.sensorFrames.map(async src=>{const img=new Image();img.src=src;await img.decode();return [img.naturalWidth,img.naturalHeight];}));
  const save=await import('/src/pod/sim/harbor-save.ts');const payload=save.captureHarborSave(r);
  if(!payload)throw Error('Safe checkpoint refused '+JSON.stringify({shot:r.shot.phase,mode:r.mode,threat:r.threat}));
  save.writeHarborSave(localStorage,payload);
  return {seed:r.seed,capture,exposure,shot:r.shot.phase,tapeId:tape.id,frames:tape.sensorFrames.length,distinctFrames:new Set(tape.sensorFrames).size,decoded,position:s.snapshot().position,opened:s.snapshot().state.opened,pointer:JSON.parse(localStorage.getItem(save.HARBOR_SAVE_KEY)),storedFrames:payload.run.tapes[0].sensorFrames.length,storedCharacters:JSON.stringify(payload).length};
 });
 assert.equal(result.before.exposure.status,'pending');assert.ok(result.before.distinctFrames>1);
 await page.screenshot({path:`${dir}/before-reload.png`});
 await page.reload();await page.locator('[data-id="continue"]').click();await page.waitForFunction(()=>!!window.__pod);
 result.after=await page.evaluate(()=>{
  const r=window.__pod,s=r.authoredSite,t=r.selectedTape;
  return {seed:r.seed,position:s.snapshot().position,opened:s.snapshot().state.opened,exposure:s.snapshot().harbor.exposures[0],frames:t?.sensorFrames?.length,tapeId:t?.id,analyzed:t?.analyzed,shot:r.shot.phase};
 });
 assert.equal(result.after.seed,result.before.seed);assert.deepEqual(result.after.position,result.before.position);assert.deepEqual(result.after.opened,result.before.opened);
 assert.equal(result.after.tapeId,result.before.tapeId);assert.equal(result.after.frames,result.before.frames);assert.equal(result.after.analyzed,false);assert.equal(result.after.exposure.status,'pending');assert.equal(result.after.shot,'idle');
 result.analysis=await page.evaluate(()=>{const r=window.__pod;r.at='lab';r.analyzeTape();return{analyzed:r.selectedTape.analyzed,report:r.selectedTape.report,harbor:r.authoredSite.snapshot().harbor,inventory:r.authoredSite.snapshot().state.inventory};});
 assert.ok(result.analysis.analyzed);assert.ok(result.analysis.harbor.exposures[0].analyzed);
 assert.equal(result.analysis.harbor.exposures[0].source,'controlled-video');
 assert.ok(result.analysis.harbor.grants.includes('harbor.fact.pod-present'),'Photo grant missing');
 await page.screenshot({path:`${dir}/after-lab.png`});assert.deepEqual(result.errors,[]);
 result.persistencePassed=true;
 result.departCheckpoint=await page.evaluate(()=>{
  const r=window.__pod,site=r.authoredSite,hook=r.onBeforeDepart;
  if(typeof hook!=='function')throw Error('Departure checkpoint unbound');
  const position=site.snapshot().position;
  r.shot.phase='developing';const unsafe=hook();r.shot.phase='idle';
  const unsafeMessage=r.storyCaption;
  const before=localStorage.getItem('ironlung.harbor.v1');
  const native=Storage.prototype.setItem;
  let quota;
  try{Storage.prototype.setItem=function(){throw new DOMException('QA quota failure','QuotaExceededError');};quota=hook();}
  finally{Storage.prototype.setItem=native;}
  const quotaMessage=r.storyCaption,unchanged=before===localStorage.getItem('ironlung.harbor.v1');
  const success=hook();
  const pointer=JSON.parse(localStorage.getItem('ironlung.harbor.v1'));
  const payload=JSON.parse(localStorage.getItem(pointer.slot));
  r.legIndex=1;let writes=0,other;
  try{Storage.prototype.setItem=function(){writes++;throw Error('Unexpected later-chapter write');};other=hook();}
  finally{Storage.prototype.setItem=native;r.legIndex=0;}
  return{unsafe,unsafeMessage,quota,quotaMessage,unchanged,success,other,writes,sceneRetained:r.authoredSite===site,positionUnchanged:JSON.stringify(position)===JSON.stringify(site.snapshot().position),savedPosition:payload.site.position,scope:'Direct callback contract test; not a complete I-region departure playthrough.'};
 });
 assert.equal(result.departCheckpoint.unsafe,false);assert.equal(result.departCheckpoint.quota,false);
 assert.ok(result.departCheckpoint.unchanged&&result.departCheckpoint.sceneRetained&&result.departCheckpoint.positionUnchanged);
 assert.ok(result.departCheckpoint.success&&result.departCheckpoint.other);assert.equal(result.departCheckpoint.writes,0);
 assert.equal(result.before.frames,10,'Actual browser capture must produce ten frames');
 result.passed=true;console.log('PASS browser save -> reload -> Continue -> LAB; 10 real frames, no network generation.');
}catch(error){result.failure=String(error?.stack??error);process.exitCode=1;console.error(result.failure);}
finally{await writeFile(`${dir}/result.json`,JSON.stringify(result,null,2));await browser.close();}
