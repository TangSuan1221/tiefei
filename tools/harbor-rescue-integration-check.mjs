import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='qa/harbor/rescue-integration';await mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.walkTo('camera');r.lamp=true;});
 const report=await p.evaluate(()=>{
  const r=window.__pod,s=r.authoredSite,checks={};
  const place=(p,heading=0)=>{s.position.set(...p);r.heading=heading;r.pitch=0;r.camPan=r.camTilt=0;r.walkTo('camera');};
  const photo=()=>{r.shot.phase='idle';r.beginShoot();const e=structuredClone(r.shot.siteEvidence);for(let i=0;i<12&&r.shot.phase==='exposing';i++)r.tickShot(.5);return {e,frames:r.shot.sensorFrames?.length,phase:r.shot.phase};};
  s.navigationConsole.setWaypoint([11,0,16]);place([11,0,16]);s.tick(.01);place([60,0,27]);s.tick(.01);s.rescue.listen();s.rescue.reply();
  r.beginShoot();r.leaveStation();r.tickShot(.1);checks.cancelled={phase:r.shot.phase,registered:s.rescue.state.captures.length,identified:s.rescue.state.identified};
  checks.tolerance=[];
  for(let a=0;a<360;a+=45)for(const yaw of [-15,0,15])for(const pitch of [-10,0,10])for(const height of [-1,0,1]){
   place([60+2.5*Math.sin(a*Math.PI/180),height,27+2.5*Math.cos(a*Math.PI/180)],yaw);r.pitch=pitch;
   const clear=s.base.canMove(s.position,yaw),before=JSON.stringify(s.rescue.snapshot()),assessment=s.photoAssessment();if(JSON.stringify(s.rescue.snapshot())!==before)throw Error('Readiness mutated quest state');const e=s.captureEvidence();if(assessment.ready!==e.visible)throw Error('Readiness and exposure disagree');if(clear&&!e.visible)checks.tolerance.push({a,yaw,pitch,height});
  }
  place([60.8,0,27],88);const wrong={e:s.captureEvidence()};s.commitEvidence(wrong.e);checks.wrongHeading={visible:wrong.e.visible,report:s.analyzeEvidence({capture:wrong.e,media:{playable:true}}),identified:s.rescue.state.identified}; place([60.8,0,27],0);const threat=photo();s.analyzeEvidence({capture:threat.e,media:{playable:true}});checks.threat={...threat,identified:s.rescue.state.identified};
  checks.stationHull=[['observe',[60,0,27]],['power',[42,0,28]],['lure',[78,0,26]]].map(([name,pos])=>{place(pos,45);return {name,clear:s.base.canMove(s.position,45)};});
  const warned=s.rescue.snapshot();const hull=r.hull;r.activeSonarEnabled=true;place([60,0,32]);s.tick(40);checks.noiseDeath=s.rescue.state.failed;checks.noiseHull=r.hull;s.rescue.restore(warned);r.hull=hull;r.activeSonarEnabled=false;
  place([42,0,28],45);s.interact();checks.power=s.rescue.state.powered;place([60,0,27],45);s.interact();checks.open=s.rescue.state.gateOpen;
  place([78,0,26]);r.activeSonarEnabled=true;s.tick(10);checks.inside=s.rescue.state.monsterInside;
  // Closing without a completed image must fail; reopen and retry through actual panel rays.
  r.activeSonarEnabled=false;place([60,0,27],45);s.interact();checks.noPhoto={isolated:s.rescue.state.isolated,closed:s.rescue.state.gateClosed};s.interact();
  place([78,0,26]);r.activeSonarEnabled=true;s.tick(10);const lure=photo();checks.lure={...lure,confirmed:s.rescue.state.lureConfirmed};r.activeSonarEnabled=false;place([60,0,27],45);s.interact();checks.isolated=s.rescue.state.isolated;s.tick(1.3); // Wait for the actual gate to settle before opening the shutter.
  place([78,0,26]);const gate=photo();s.analyzeEvidence({capture:gate.e,media:{playable:true}});checks.gate={...gate,verified:s.rescue.state.verified};
  place([60,0,27],45);s.interact();s.tick(11);place([60,0,27]);const departure=photo();s.analyzeEvidence({capture:departure.e,media:{playable:true}});place([60,0,27],45);s.interact();checks.departure={...departure,complete:s.complete};
  return {diagnosticPlacement:true,analysisMediaBoundary:'playable flag supplied after actual sensor-frame exposure; no video playback UI test',checks};
 });
 await writeFile(dir+'/results.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report,null,2));
 assert.deepEqual(report.checks.tolerance,[]);assert.equal(report.checks.wrongHeading.visible,false);assert.equal(report.checks.wrongHeading.identified,false);assert.equal(report.checks.threat.identified,true);assert.equal(report.checks.cancelled.registered,0);assert.equal(report.checks.cancelled.identified,false);assert.equal(report.checks.noiseDeath,true);assert.equal(report.checks.noiseHull,0);assert.ok(report.checks.stationHull.every(x=>x.clear));assert.equal(report.checks.noPhoto.isolated,false);assert.equal(report.checks.noPhoto.closed,true);assert.equal(report.checks.departure.complete,true);assert.deepEqual(errors,[]);console.log('PASS formal rescue diagnostic integration');
}finally{await b.close();}





