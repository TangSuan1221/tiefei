import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/harbor/interaction-flow-2026-10-06';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView);
 await page.evaluate(async()=>{
  window.requestAnimationFrame=()=>0;const r=window.__pod;r.receive();r.arrive();r.walkTo('nav');r.power=1;
  const {sonarAction}=await import('/src/pod/view/sonar-desk.ts');window.__radioAction=id=>sonarAction(r,id);
  window.__dialogueCues=[];window.__dialogueShakes=[];r.onCue=(id)=>window.__dialogueCues.push(id);r.onShake=n=>window.__dialogueShakes.push(n);
  window.__step=(dt=.25)=>{r.storyCaptionLeft=Math.max(0,r.storyCaptionLeft-dt);r.authoredSite.tick(dt);};
  window.__until=(stage)=>{for(let i=0;i<1500;i++){if(r.authoredSite.dialogue.stage===stage&&!r.authoredSite.dialogue.busy)return;window.__step();}throw Error('Timed out '+stage+' at '+r.authoredSite.dialogue.stage);};
  const s=r.authoredSite;s.navigationConsole.setWaypoint([11,0,16]);s.position.set(11,0,16);window.__step();s.position.set(35,0,30);r.heading=0;window.__step();s.navigationConsole.setFrequency(38.4);window.__step(.5);window.__until('contact');
  r.activeSonarEnabled=true;r.toggleSonarPulses();
 });
 const intro=await page.evaluate(()=>{
  const r=window.__pod,s=r.authoredSite;if(!window.__radioAction('sonar.reply'))throw Error('Initial microphone failed');window.__step();
  const before=s.dialogue.snapshot();s.interact();if(JSON.stringify(before)!==JSON.stringify(s.dialogue.snapshot()))throw Error('Feedback erased dialogue');
  const saved=s.snapshot();if(!s.restore(saved))throw Error('Mid-line save restore failed');if(s.dialogue.currentLine!==before.active.text)throw Error('Caption not resumed');
  for(let i=0;i<5;i++)if(window.__radioAction('sonar.reply'))throw Error('Double mic skipped line');
  if(s.objective!=='')throw Error('Task released during intro');window.__until('stop');window.__podView.frame(0,r);
  return {stage:s.dialogue.stage,objective:s.objective,saveRestored:true,feedbackPreserved:true};
 });assert.match(intro.objective,/关闭主动/);await page.screenshot({path:dir+'/01-stop-task.png'});
 const photo=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;r.stopSonarPulses();window.__until('photo');s.position.set(60,0,27);r.heading=0;r.camPan=r.camTilt=r.pitch=0;window.__podView.frame(0,r);return {stage:s.dialogue.stage,objective:s.objective,cues:window.__dialogueCues,shakes:window.__dialogueShakes};});
 assert(photo.cues.includes('creature.skitter'));assert.match(photo.objective,/拍摄/);await page.screenshot({path:dir+'/02-photo-task.png'});
 const ambience=await page.evaluate(()=>{const r=window.__pod,hull=r.hull,cues=window.__dialogueCues.length,shakes=window.__dialogueShakes.length;for(let i=0;i<120;i++)window.__step();return{unchangedHull:r.hull===hull,cues:window.__dialogueCues.slice(cues),shakes:window.__dialogueShakes.slice(shakes)};});
 assert(ambience.unchangedHull);assert(ambience.cues.includes('creature.breath-sync'));assert(ambience.shakes.length>0);
 const first=await page.evaluate(()=>{
  const r=window.__pod,s=r.authoredSite;r.walkTo('camera');r.beginShoot();const e=structuredClone(r.shot.siteEvidence);for(let i=0;i<12&&r.shot.phase==='exposing';i++)r.tickShot(.5);
  if(r.shot.sensorFrames.length<3)throw Error('No actual sensor film');s.analyzeEvidence({capture:e,media:{playable:true}});window.__step();
  if(s.dialogue.stage!=='report'||s.rescue.state.powered)throw Error('First photo advanced past microphone');const result={frames:r.shot.sensorFrames.length,objective:s.objective};
  if(!window.__radioAction('sonar.reply'))throw Error('Report microphone failed');window.__step();window.__podView.frame(0,r);return result;
 });await page.screenshot({path:dir+'/03-report-dialogue.png'});
 await page.evaluate(()=>{window.__until('power');const r=window.__pod,s=r.authoredSite;r.shot.phase='idle';r.shot.viewing=false;r.walkTo('camera');s.position.set(42,0,28);r.heading=45;r.camPan=r.camTilt=0;});
 await page.keyboard.press('f');assert(await page.evaluate(()=>window.__pod.authoredSite.rescue.state.powered));
 await page.evaluate(()=>{window.__until('open');const r=window.__pod,s=r.authoredSite;s.position.set(60,0,27);r.heading=45;r.camPan=r.camTilt=0;});
 await page.keyboard.press('f');assert(await page.evaluate(()=>window.__pod.authoredSite.rescue.state.gateOpen));
 await page.evaluate(()=>{window.__until('lure');const r=window.__pod,s=r.authoredSite;s.position.set(78,0,26);r.heading=0;r.camPan=r.camTilt=0;r.activeSonarEnabled=true;r.toggleSonarPulses();for(let i=0;i<40;i++)window.__step();r.beginShoot();for(let i=0;i<12&&r.shot.phase==='exposing';i++)r.tickShot(.5);if(!s.rescue.state.lureConfirmed)throw Error('Entry capture failed');r.stopSonarPulses();window.__until('close');r.heading=45;r.camPan=r.camTilt=0;r.shot.phase='idle';});
  const preClose=await page.evaluate(()=>window.__pod.authoredSite.rescue.snapshot());
 await page.keyboard.press('f');assert(await page.evaluate(()=>window.__pod.authoredSite.rescue.state.isolated));
 await page.evaluate(saved=>{const r=window.__pod,s=r.authoredSite;s.rescue.restore(saved);s.position.set(60,0,27);r.heading=45;},preClose);
 await page.keyboard.press('f');assert(await page.evaluate(()=>window.__pod.authoredSite.rescue.state.isolated));
 const buttons=await page.evaluate(async()=>{
  const r=window.__pod,s=r.authoredSite;window.__until('confirm');if(s.rescue.state.departing)throw Error('NPC left before reply');if(!window.__radioAction('sonar.reply'))throw Error('Confirmation microphone failed');
  const {HitMap}=await import('/src/pod/view/chrome.ts'),{drawCompactSonarDesk,drawSonarDesk}=await import('/src/pod/view/sonar-desk.ts');
  const c=document.createElement('canvas');c.width=1024;c.height=720;const h=new HitMap();drawCompactSonarDesk(c.getContext('2d'),r,h,0);
  const compact=s.dialogueChoices.map((_,i)=>h.rectOf('sonar.rescueReply.'+i));
  const fullHits=new HitMap();drawSonarDesk(c.getContext('2d'),r,0,0,1024,720,fullHits,0);const full=s.dialogueChoices.map((_,i)=>fullHits.rectOf('sonar.rescueReply.'+i));
  drawCompactSonarDesk(c.getContext('2d'),r,h,0);window.__choicesSave=s.dialogue.snapshot();return{compact,full,image:c.toDataURL(),choices:s.dialogueChoices};
 });assert.equal(buttons.choices.length,3);assert(buttons.compact.every(Boolean)&&buttons.full.every(Boolean));
 for(const group of [buttons.compact,buttons.full])for(const b of group)assert(b.y>=0&&b.y+b.h<=720,'reply button clipped');
 await writeFile(dir+'/04-reply-buttons.png',Buffer.from(buttons.image.split(',')[1],'base64'));delete buttons.image;
 // Use the actual E-console raycast and two-step zoom interaction for one reply.
 async function buttonPoint(){return page.evaluate(async()=>{const {Vector3}=await import('/node_modules/three/build/three.module.js');const r=window.__pod,v=window.__podView;r.walkTo('nav');for(let i=0;i<4;i++)v.frame(.3,r);const screen=v.cabin.screens.find(s=>s.id==='nav'&&!s.repeater),b=screen.hits.rectOf('sonar.rescueReply.0');if(!b)throw Error('Reply missing from live CRT');const g=screen.mesh.geometry.parameters,p=screen.mesh.localToWorld(new Vector3(((b.x+b.w/2)/1024-.5)*g.width,(.5-(b.y+b.h/2)/720)*g.height,0)).project(v.cabin.pickingCamera);const rect=document.getElementById('post-canvas').getBoundingClientRect(),x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;for(let dy=-28;dy<=28;dy+=4)for(let dx=-28;dx<=28;dx+=4)if(v.pick(x+dx,y+dy)==='desk:nav:sonar.rescueReply.0')return{x:x+dx,y:y+dy};throw Error('Cannot hit actual reply button '+JSON.stringify({x,y}));});}
 let click=await buttonPoint();await page.mouse.click(click.x,click.y);click=await buttonPoint();await page.screenshot({path:dir+'/05-reply-ingame.png'});await page.mouse.click(click.x,click.y);
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite.dialogue.stage),'escapeBrief','actual mouse reply dispatch');
 const choices=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite,physical=s.rescue.snapshot();const out=[];
  for(let i=0;i<3;i++){s.rescue.restore(physical);s.dialogue.restore(window.__choicesSave);if(!window.__radioAction('sonar.rescueReply.'+i))throw Error('Reply failed '+i);if(window.__radioAction('sonar.rescueReply.'+i))throw Error('Reply repeated');window.__until('escape');out.push({index:i,departing:s.rescue.state.departing,verified:s.rescue.state.verified});}
  window.__until('departure');return out;
 });assert(choices.every(x=>x.departing&&x.verified));
  const departure=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;r.walkTo('camera');r.shot.phase='idle';r.shot.viewing=false;s.position.set(60,0,27);r.heading=r.camPan=r.camTilt=r.pitch=0;r.beginShoot();for(let i=0;i<40;i++)r.tickShot(.5);r.walkTo('lab');r.analyzeTape();window.__step();return{confirmed:s.rescue.state.departureConfirmed,stage:s.dialogue.stage,frames:r.selectedTape?.sensorFrames?.length};});
 assert(departure.confirmed);assert.equal(departure.stage,'done');
 await page.evaluate(()=>{const r=window.__pod;r.heading=45;r.camPan=r.camTilt=0;});await page.keyboard.press('f');assert(await page.evaluate(()=>window.__pod.authoredSite.complete));
 const report={departure,allGatePanels:true,exitConfirmed:true,method:'Diagnostic positions and accelerated subtitle clock; real receiver callbacks, actual camera frames, actual F raycast controls, actual E-console zoom/mouse reply and all reply dispatches. Not a human end-to-end playthrough.',intro,photo,ambience,first,buttons,choices,errors};
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,buttons:buttons.choices},null,2));
}finally{await browser.close();}

