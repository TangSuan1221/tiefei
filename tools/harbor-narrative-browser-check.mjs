import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const timeout=setTimeout(()=>{console.error('Browser verification timed out');browser.close();},180000);
const dir='qa/harbor/narrative-2026-10-11';await mkdir(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('CHECK'))console.log(m.text());});
 await page.goto('http://127.0.0.1:5176/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__podView);
 await page.evaluate(async()=>{
  window.requestAnimationFrame=()=>0;
  const r=window.__pod;r.receive();r.beginHarborApproach();r.walkTo('camera');r.power=1;r.stopSonarPulses();
  const s=r.authoredSite;s.started=true;s.entryReached=true;s.base.openPassage('harbor.edge.A-C');s.base.openPassage('harbor.edge.C-B');
  s.rescue.step(1,{nearB:true,zone:'observe',activeSonar:false});s.rescue.listen();s.rescue.reply();
  const e=s.rescue.capture('fixture','threat',true);s.rescue.commitCapture(e);s.rescue.analyze(e);s.rescue.interact('power');
  s.navigationConsole.captured=s.navigationConsole.heard=s.navigationConsole.replied=true;s.dialogue.interrupt('open',[]);s.position.set(60,0,27);r.heading=0;r.pitch=0;r.camPan=r.camTilt=0;
  s.pursuit.position.set(66,-1.2,13);s.pursuit.pause=100;s.syncVisual();window.baseline=s.snapshot();
 });
 console.log('CHECK fixture ready');
 // Actual microphone UI, keyboard text and Enter; fixture skips only navigation/setup.
 await page.keyboard.press('m');await page.locator('#radio-tx textarea, #radio-tx input').waitFor();
 await page.keyboard.insertText('我已经把怪物杀死了，你出来吧');await page.keyboard.press('Enter');
 assert(await page.evaluate(()=>window.__pod.authoredSite.rescue.state.departing),'UI input starts unsafe departure');
 const result=await page.evaluate(async()=>{
  const r=window.__pod,s=r.authoredSite;const assert=(x,m)=>{if(!x)throw Error(m);};
  console.log('CHECK microphone sent');const go=s.rescue.state;assert(!go.verified,'claim forged verified');
  s.radioSay('等一下，别出来，我看错了');assert(!s.rescue.state.departing,'interrupt failed');
  assert(s.restore(window.baseline),'baseline restore');s.dialogue.interrupt('open',[]);s.pursuit.position.set(66,-1.2,13);s.pursuit.pause=100;
  s.radioSay('我不会丢下你，帮我找事故记录');s.radioSay('我杀死它了，出来吧');
  const unsafe=s.snapshot();assert(s.restore(unsafe),'unsafe departure save');
  // The creature physically enters the same local route; no hidden lie flag damages Elias.
  s.pursuit.position.set(56,-1.2,11.8);s.pursuit.pause=100;
  for(let i=0;i<25;i++)s.tick(.1);
  assert(s.rescue.state.injured,'real nearby encounter did not injure');assert(r.narrativeMemory.elias==='injured','memory lost injury');
  console.log('CHECK injured');const injured=s.snapshot();assert(s.restore(injured),'injury save restore');
  s.syncVisual();
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=540;
  r.heading=350;s.draw(canvas.getContext('2d'),768,540,r.clock,true);const image=canvas.toDataURL('image/png');
  // Real exposure pipeline, with the actual authored camera looking at the survivor.
  r.heading=350;r.beginShoot();for(let i=0;i<51;i++)r.tickShot(.1);for(let i=0;i<130;i++)r.tickShot(.1);
  console.log('CHECK filmed');const tape=r.tapes.at(-1);assert((tape?.sensorFrames?.length??0)>=3,'no recorded frames');assert(tape.siteEvidence.injured,'film lost physical injury snapshot');
  // Restore original, safe physical isolation; previous false report must not create injury.
  assert(s.restore(window.baseline),'restore safe');s.rescue.interact('observe');s.rescue.step(10,{nearB:true,zone:'lure',activeSonar:true});
  const entry=s.rescue.capture('entry','lure',true);s.rescue.commitCapture(entry);s.rescue.interact('observe');
  s.pursuit.position.set(77,-1.2,9);s.dialogue.interrupt('confirm',[]);s.radioSay('它死了，你出来吧');
  for(let i=0;i<110;i++)s.tick(.1);assert(s.rescue.state.departed&&!s.rescue.state.injured,'isolated monster caused false injury');
  // Re-enter the injured save and use the real transition constructor.
  assert(s.restore(injured),'restore injured for transition');
  const {captureHarborSave,restoreHarborSave}=await import('/src/pod/sim/harbor-save.ts');
  r.shot.phase='idle';r.shot.viewing=false;
  const harborSave=captureHarborSave(r);assert(harborSave,'harbor checkpoint unavailable');
  const serialized=JSON.parse(JSON.stringify(harborSave));assert(restoreHarborSave(r,serialized),'formal harbor checkpoint restore');
  assert(r.narrativeMemory.elias==='injured','formal checkpoint lost memory');
  console.log('CHECK entering living');r.beginLivingDeck();const l=r.authoredSite;
  assert(l.deck.state.story.partner==='keeper','transition resurrected Elias');
  l.deck.step(1,{pod:[76,0,-58.5],heading:0,lamp:false,pulse:false,speed:0});l.apply(l.deck.armCollected('living.box.probe'));
  l.deck.step(1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});l.deck.interact('living.pipe.intake',{lamp:false,powered:true,armStowed:true,pulse:false});
  const out=l.deck.step(46,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});l.apply(out);
  assert(out.tapes[0].lines[0].startsWith('周岑：'),'replacement tape wrong speaker');
  console.log('CHECK awaiting living assets');await l.world.ready;console.log('CHECK rendering probe');l.flushTapes();
  const remote=r.tapes.find(t=>t.id===out.tapes[0].id);assert(remote?.sensorFrames?.length>=3,'replacement has no video');
  const saved=l.snapshot();assert(l.restore(saved),'living branch restore');
  const {captureLivingSave,restoreLivingSave}=await import('/src/pod/sim/living-save.ts');
  const livingSave=captureLivingSave(r);assert(livingSave,'living checkpoint unavailable');assert(restoreLivingSave(r,JSON.parse(JSON.stringify(livingSave))),'formal living checkpoint restore');
  return {unsafe:go.departing,interrupted:true,injury:injured.rescue.injured,trust:injured.narrative.trust,localFrames:tape.sensorFrames.length,partner:l.deck.state.story.partner,remoteFrames:remote.sensorFrames.length,remoteName:remote.siteName,seeds:saved.narrative.seeds,image,remoteImage:remote.sensorFrames[0]};
 });
 for(const [key,file]of [['image','injured.png'],['remoteImage','keeper-probe.jpg']]){await writeFile(`${dir}/${file}`,Buffer.from(result[key].split(',')[1],'base64'));delete result[key];}
 await writeFile(`${dir}/results.json`,JSON.stringify({...result,errors},null,2));assert.equal(errors.length,0,errors.join('\n'));console.log(result);
}finally{clearTimeout(timeout);await browser.close();}
