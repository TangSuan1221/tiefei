import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();const diagnostics=[];page.on('console',m=>{if(m.text().startsWith('[harbor-photo-diag] '))diagnostics.push(JSON.parse(m.text().slice(20)));});await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5190/?harborPhotoDiag=1');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;
  s.base.state.opened.push('harbor.edge.A-C','harbor.edge.C-B');
  s.simpleFlow.accepted=['L1-R28-V01','L1-R28-V02','L1-R28-V02A','L1-R28-V03','L1-R28-V04','L1-R28-V05','L1-R28-V06'];
  if(!s.rescue.restore({...s.rescue.snapshot(),signal:true,heard:true,replied:true,powered:true,gateOpen:true,monsterInside:true}))throw new Error('fixture restore rejected');
  s.position.set(75.9,1.3,6.1);r.heading=188;r.pitch=10;r.camPan=r.camTilt=0;r.camZoom=1;r.lamp=true;r.power=1;r.blackout=false;r.activeSonarEnabled=false;r.pilot.stop();s.elapsed=100;s.syncVisual();
  const samples=[];
  for(const distance of [2,3,4,6])for(const elevation of [-.8,-.5,0,1]){
   const angle=r.heading*Math.PI/180;
   s.pursuit.position.set(s.position.x+Math.sin(angle)*distance,elevation,s.position.z-Math.cos(angle)*distance);s.syncVisual();
   const target=s.pursuit.position.clone().add(new T.Vector3(0,.8,0));
   const assessment=s.photoAssessment();const projected=target.clone().project(s.camera);
   const ray=new T.Ray(s.position,target.clone().sub(s.position).normalize()),d=target.distanceTo(s.position);
   const blockers=s.solids().filter(b=>b!==s.visual.gate.bounds&&!b.containsPoint(target)).map(b=>({b,q:ray.intersectBox(b,new T.Vector3())})).filter(v=>v.q&&v.q.distanceTo(s.position)<d-.3).map(({b,q})=>({min:b.min.toArray(),max:b.max.toArray(),distance:q.distanceTo(s.position)})).sort((a,b)=>a.distance-b.distance);
   samples.push({distance,elevation,lit:r.lit,ready:assessment.ready,reason:assessment.text,projected:projected.toArray(),blockers:blockers.slice(0,2)});
  }
  s.captureEvidence();r.lamp=false;s.captureEvidence();
  const dark=s.photoAssessment().text;r.lamp=true;r.heading+=180;
  const outside=s.photoAssessment().text;
  s.pursuit.awake=true;s.navigationConsole.tick(.01);
  const passive=s.navigationConsole.passiveContacts.find(c=>c.kind==='unknown');
  return {fixture:'staged pose and targets, not the blind-play save',samples,dark,outside,passive};
 });
 assert.ok(result.samples.every(s=>s.ready));
 assert.match(result.dark,/照明不足/);assert.match(result.outside,/目标已出画/);
 assert.equal(result.passive?.bearing,'后方');assert.equal('distance' in result.passive,false);
 const exposures=diagnostics.filter(d=>d.event==='exposure');assert.equal(exposures.length,2);assert.equal(exposures[0].assessment.ready,true);assert.equal(exposures[1].assessment.ready,false);assert.equal(exposures[1].light.lit,false);
 console.log(JSON.stringify({fixture:result.fixture,validSamples:result.samples.length,exposures}));
}finally{await browser.close();}
