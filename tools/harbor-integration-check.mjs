import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/video/**',route=>route.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  const r=window.__pod;r.receive();r.arrive();r.at='camera';r.lamp=true;r.footageSink=null;
  if(r.leg.depth!==1012)throw Error('Wrong harbor depth '+r.leg.depth);
  const s=r.authoredSite,events=[];
  const step=n=>{for(let i=0;i<n*20;i++)r.frame(.05);};
  step(.5);
  const aim=id=>{
   const o=s.world.interactables.get(id);if(!o)throw Error('Missing '+id);
   const p=o.userData.approach;if(!p)throw Error('Missing approach '+id);
   s.position.set(...p);const t=o.userData.lookAt??o.position.toArray();const dx=t[0]-p[0],dy=t[1]-p[1],dz=t[2]-p[2];
   r.heading=Math.atan2(dx,-dz)*180/Math.PI;r.pitch=-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI;r.camPan=r.camTilt=0;r.at='camera';
   s.pose();s.aim();if(s.target?.id!==id)throw Error(`Aim ${id} failed (${s.target?.id})`);
   if(!s.canMove(s.position))throw Error('Approach blocked '+id);
  };
  const use=id=>{aim(id);s.interact();events.push({id,arm:r.arm.phase,inventory:[...s.state.inventory]});};
  const grab=id=>{use(id);step(3.6);if(r.arm.phase!=='aiming')throw Error('Extend '+id+' '+r.arm.phase);s.interact();step(2);if(!s.pendingCargo)throw Error('Grip '+id);s.interact();step(3);if(!s.state.collected.includes(id))throw Error('Cargo '+id);};
  grab('harbor.item.tools');use('harbor.item.power');grab('harbor.item.load-module');
  // QA positioning isolates the systems chain; does not claim player navigation.
  const hero=s.world.root.getObjectByName('harbor.asset.rescue-pod');s.position.set(60,0,34);
  const p=hero.position,dx=p.x-s.position.x,dy=p.y-s.position.y,dz=p.z-s.position.z;
  r.heading=Math.atan2(dx,-dz)*180/Math.PI;r.pitch=-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI;r.camPan=r.camTilt=0;step(1);
  r.beginShoot();const exposure=structuredClone(r.shot.siteEvidence);step(18);
  r.at='lab';r.analyzeTape();if(!s.state.inventory.includes('harbor.fact.evacuation-discrepancy'))throw Error('No photo/module comparison '+JSON.stringify({exposure,harbor:s.harbor,report:r.selectedTape?.report}));
  use('harbor.item.broadcast');step(3);use('harbor.item.broadcast');step(2);
  if(s.state.inventory.includes('harbor.fact.retrieval-complete'))throw Error('Early cutoff incorrectly completed retrieval');
  use('harbor.item.broadcast');step(8);if(!r.threat)throw Error('No broadcast threat');
  use('harbor.item.broadcast');r.pilot.stop();step(8);if(r.threat&&r.threat.phase!=='repelled')throw Error('Quiet retreat failed: '+r.threat.phase);
  grab('harbor.item.employee-card');use('harbor.item.diversion');r.at='lab';
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'7',code:'Digit7',bubbles:true}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'7',code:'Digit7',bubbles:true}));
  if(!s.state.inventory.includes('harbor.fact.downward-route'))throw Error('Lab key7 failed to verify route');
  use('harbor.item.exit-mechanism');use('harbor.item.exit');
  if(!s.complete)throw Error('Exit incomplete '+JSON.stringify(s.state));
  const report={events,exposure,frames:r.selectedTape?.sensorFrames?.length,videoResult:r.selectedTape?.videoResult,report:r.selectedTape?.report,complete:s.complete,depart:r.canDepart,snapshot:s.snapshot()};
  r.depart();
  if(r.legIndex!==1||r.phase!=='transit'||r.authoredSite!==null)throw Error('Formal departure did not enter next transit');
  return {...report,nextLeg:r.legIndex,nextPhase:r.phase,checkpoint:!!localStorage.getItem('ironlung.harbor.v1')};
 });
 await mkdir('qa/harbor',{recursive:true});await writeFile('qa/harbor/integration.json',JSON.stringify({result,errors,method:'QA positioning; real interactions and simulation, API blocked'},null,2));
 assert.deepEqual(errors,[]);assert.ok(result.complete&&result.depart);console.log(JSON.stringify(result));
}finally{await browser.close();}
