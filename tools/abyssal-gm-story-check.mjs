import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}}),api=[],errors=[];
await context.addInitScript(()=>{sessionStorage.setItem('ironlung.gm.novideo','1');const Original=window.WebSocket;window.WebSocket=function(url,protocols){if(protocols==='vite-hmr')return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Original(url,protocols);};});
await context.route('**/api/**',route=>{api.push(route.request().url());return route.abort();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LIVING_URL??'http://127.0.0.1:5180/?level=3');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 const result=await page.evaluate(async(alternate)=>{
  const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts'),v=await import('/src/pod/net/video.ts');
  const check=(yes,msg)=>{if(!yes)throw Error(msg)},records=[];r.pilot.stop();r.lamp=true;r.at='lab';
  const analyze=id=>{r.power=1;r.at='lab';r.tapeCursor=r.tapes.findIndex(t=>t.siteEvidence?.shotId===id);check(r.tapeCursor>=0,'missing '+id);r.analyzeTape();check(s.analyzed.includes(id),'analysis '+id);records.push({id,result:r.selectedTape.videoResult,debug:r.selectedTape.siteEvidence.debugNoVideo,report:r.selectedTape.report});};
  const park=i=>{const w=l.ABYSS_WINDOWS[i];s.position.set(...w.pod);r.heading=w.podHeading;r.pitch=0;r.camPan=0;r.camTilt=0;s.tick(.01);s.tick(.01);};
  const reply=(text,id)=>{check(s.radioSay(text),'reply '+text);s.tick(.01);analyze(id);};
  sessionStorage.setItem('ironlung.gm.novideo','0');s.analyzeEvidence({shotId:'L3-P01'});s.analyzeEvidence({shotId:'L3-P01',debugNoVideo:true});check(!s.story.state['photo.pit']&&!s.deliveredMedia.has('L3-P01'),'normal mode rejects missing video and debug evidence');sessionStorage.setItem('ironlung.gm.novideo','1');
  park(0);analyze('L3-E01');reply('你还好吗？','L3-E02');park(2);reply('我来拿钥匙。','L3-E03');
  // Run the real arm state machine and site reach checks; repositioning is diagnostic, not a driving playthrough.
  const aimItem=id=>{const item=l.ABYSS_ITEMS.find(x=>x.id===id),a=item.face*Math.PI/180;let ok=false;for(const d of [3.2,3.4,3.6,3.8,4]){s.position.set(item.position[0]+Math.sin(a)*d,item.position[1]+1.2,item.position[2]-Math.cos(a)*d);r.heading=(item.face+180)%360;r.pitch=-Math.atan2(-1.2,d)*180/Math.PI;r.camTilt=0;r.camPan=0;s.world.root.updateMatrixWorld(true);if(s.clear(s.position.toArray())&&s.aim()?.id===id){ok=true;break;}}check(ok,'reach '+id);};
  aimItem('abyss.box.key');r.at='camera';s.interact();for(let i=0;i<100;i++)r.frame(.05);s.interact();for(let i=0;i<100;i++)r.frame(.05);s.interact();for(let i=0;i<100;i++)r.frame(.05);check(s.collected.includes('abyss.box.key'),'physical key grip/retract');
  aimItem('abyss.hatch.pass');s.interact();check(s.story.state['sluice.open'],'physical key handoff');
  const photo=async id=>{const p=l.ABYSS_PHOTO_STATIONS.find(x=>x.id===id);s.position.set(...p.position);r.heading=p.heading;r.pitch=-p.pitch;r.camPan=0;r.camTilt=0;s.tick(.01);const c=s.captureEvidence();check(c.shotId===p.shot,'photo framing '+id);if(id==='P01'){r.at='camera';r.power=1;r.beginShoot();check(r.shot.phase==='exposing','real shutter');for(let i=0;i<130;i++)r.frame(.05);await new Promise(resolve=>setTimeout(resolve,350));for(let i=0;i<300;i++)r.frame(.05);check(r.tapes.at(-1).videoResult==='prompt','handlePrompt settle');check(r.tapes.at(-1).sensorFrames.length>=3,'real sensor samples');analyze(p.shot);return;}const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;s.draw(canvas.getContext('2d'),640,360,0,true);const frame=canvas.toDataURL();r.receiveRemoteTape({id:'diagnostic.photo.'+id,siteName:'GM 本地摄影调试',frames:[frame,frame,frame],siteEvidence:c});analyze(p.shot);};
  park(3);reply('我到了。','L3-E04');await photo('P01');park(3);reply(alternate?'警报留着':'关掉警报。','L3-E05');
  park(4);reply('控制室怎么样？','L3-E06');await photo('P02');park(4);reply(alternate?'随便开三个':'开2号、3号、6号。','L3-E07');
  park(5);analyze('L3-E08');park(6);analyze('L3-E09');await photo('P03');park(6);reply(alternate?'关灯，躲起来':'别动，等一下。','L3-E10');
  await photo('P04');park(7);reply('你还好吗？','L3-E11');
  s.position.set(l.DRAIN.centre[0],l.ABYSS_EXIT_Y-1,l.DRAIN.centre[2]);s.tick(.01);check(s.complete,'debug chapter exit');
  const save=s.snapshot();check(save.debugNoVideo,'save marker');const saveModule=await import('/src/pod/sim/abyssal-save.ts');check(saveModule.captureAbyssalSave(r)===null,'must not overwrite official save');
  const originalFetch=window.fetch;let mockRequests=0,mockAborted=false;
  sessionStorage.setItem('ironlung.gm.novideo','0');
  window.fetch=async(_url,options)=>{mockRequests++;return await new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{mockAborted=true;reject(new DOMException('aborted','AbortError'));}));};
  const flight=v.requestVideo('mock-only cancellation probe').catch(e=>e.name);
  sessionStorage.setItem('ironlung.gm.novideo','1');window.dispatchEvent(new Event('ironlung-no-video-change'));
  const canceled=await flight;window.fetch=originalFetch;check(mockRequests===1&&mockAborted&&canceled==='AbortError','in-flight client cancellation');
  const net=[await v.requestVideo('GM must not submit'),await v.fetchVideoContent('cached-gm-must-not-download')];check(net.every(x=>!x.ok&&x.fail.kind==='disabled'),'network entry guards');
  sessionStorage.setItem('ironlung.gm.novideo','0');check(!s.complete,'GM off blocks completion');check(!s.restore(save),'GM off rejects debug snapshot');check(!s.deliverDebugMedia('L3-E01'),'GM off rejects debug delivery');sessionStorage.setItem('ironlung.gm.novideo','1');
  return {alternate,kind:'diagnostic repositioning + real interaction state machine; not a full driving playthrough',records,complete:s.complete,quota:s.story.state['containment.captured'],mockCancellation:{mockRequests,mockAborted,canceled},tankState:s.story.state['tanks.state'],physicalKey:s.collected.includes('abyss.box.key'),officialSaveProtected:r.gmLevelSession,net};
 },process.argv.includes('--alternate'));
 await mkdir('qa/level-03/runtime',{recursive:true});await writeFile('qa/level-03/runtime/gm-no-video'+(process.argv.includes('--alternate')?'-alternate':'')+'.json',JSON.stringify({result,api,errors},null,2));assert.deepEqual(api,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({complete:result.complete,quota:result.quota,tapes:result.records.length,api,errors}));
}finally{await browser.close();}
