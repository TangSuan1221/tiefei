import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage();await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView);
 const result=await p.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;
  s.navigationConsole.setWaypoint([11,0,16]);s.position.set(11,0,16);s.tick(.01);s.position.set(58.8,0,28.8);s.tick(.01);s.rescue.listen();s.rescue.reply();r.heading=91;r.walkTo('camera');
  const alignment=[];for(let angle=0;angle<360;angle+=45)for(let heading=0;heading<360;heading+=45){s.position.set(60+2.49*Math.sin(angle*Math.PI/180),0,27+2.49*Math.cos(angle*Math.PI/180));r.heading=heading;if(!s.base.canMove(s.position,heading))continue;const a=s.prepareCapture();alignment.push({angle,heading,ok:a.ok,message:a.message,visible:s.photoAssessment().ready});s.finishCapture();}s.position.set(58.8,0,28.8);r.heading=91;const captures=s.rescue.state.captures.length,tapes=r.tapes.length;
  const before={position:s.position.toArray(),heading:r.heading,pan:r.camPan};
  r.captureSensorFrame=()=>{throw Error('Injected sensor failure');};r.beginShoot();
  const aimed={pan:r.camPan,evidence:r.shot.siteEvidence};r.panCamera(1);r.tiltCamera(.2);r.zoomCamera(1);const opticsLocked=r.camPan===aimed.pan&&r.camTilt===0&&r.camZoom===1;
  for(let i=0;i<12;i++)r.tickShot(.5);
  const failed={phase:r.shot.phase,reason:r.shot.reason,tapes:r.tapes.length,captures:s.rescue.state.captures.length,pan:r.camPan,heading:r.heading,position:s.position.toArray()};
  s.position.set(11,0,10);r.shot.phase='idle';r.beginShoot();
  return {method:'Diagnostic setup and accelerated shot tick; injected sensor failure, not a player playthrough.',alignment,opticsLocked,before,aimed,failed,captures,tapes,outOfAreaPhase:r.shot.phase};
 });
 assert(result.opticsLocked);assert(result.alignment.length>0&&result.alignment.every(a=>a.ok?a.visible:a.message.includes('遮挡'))&&result.alignment.filter(a=>a.ok).length>40);assert.equal(result.failed.phase,'failed');assert.equal(result.failed.tapes,result.tapes);assert.equal(result.failed.captures,result.captures);assert.equal(result.failed.pan,result.before.pan);assert.equal(result.failed.heading,result.before.heading);assert.deepEqual(result.failed.position,result.before.position);assert(result.aimed.evidence.visible);assert(Math.abs(result.aimed.pan+91*Math.PI/180)<.001);assert.equal(result.outOfAreaPhase,'idle');
 await mkdir('qa/harbor/photo-preflight',{recursive:true});await writeFile('qa/harbor/photo-preflight/results.json',JSON.stringify({passed:true,...result},null,2));console.log('PASS real optics alignment without hull teleport; failed sensor creates no empty reel; out-of-area shutter blocked');
}finally{await b.close();}



