import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/video/**',r=>r.abort());
 await page.goto('http://localhost:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await mkdir('qa/cabin/authored',{recursive:true});
 for(let index=0;index<7;index++){
  const state=await page.evaluate(i=>{const r=window.__pod;r.walkTo('camera');r.legIndex=i;r.arrive();r.lamp=true;r.storyCaptionLeft=0;return r.authoredSite.snapshot();},index);
  assert.equal(state.index,index);assert.ok(state.rooms>10&&state.doors>10);assert.ok(state.anchors>0);
  await page.waitForFunction(()=>window.__cabinPose().seatEye[2]<-.40,{},{timeout:60000});
  await page.screenshot({path:`qa/cabin/authored/level-${index+1}.png`});
  const first=await page.evaluate(()=>{const r=window.__pod;const f=r.captureKeyframe();r.camPan+=.3;return{different:f!==r.captureKeyframe(),size:f.length,depart:r.canDepart};});
  assert.ok(first.different&&first.size>20000);assert.equal(first.depart,false);
  const interaction=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite;
   r.camPan=0;r.camTilt=0;r.pitch=0;r.heading=0;
   const item=s.level.items.find(i=>i.id.endsWith('s0.objective0'));
   const object=s.world.interactables.get(item.id),p=object.position;
   s.position.set(p.x,p.y,p.z+2);s.interact();
   const collected=s.state.collected.includes(item.id);
   s.position.set(p.x,p.y,p.z+12);const count=s.state.collected.length;s.interact();
   const noRemote=s.state.collected.length===count;
   const edge=s.level.edges.find(e=>!e.requires?.length);
   const a=s.level.rooms.find(x=>x.id===edge.from),b=s.level.rooms.find(x=>x.id===edge.to);
   const length=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
   const center=s.world.doors.get(edge.id).bounds.getCenter(s.position.clone());
   s.position.set(center.x-ux*1.6,0,center.z-uz*1.6);r.heading=Math.atan2(ux,-uz)*180/Math.PI;
   const start=s.position.clone();const blocked=!s.move(3);
   s.position.copy(start);s.interact();
   return {collected,noRemote,blocked,opened:s.state.opened.includes(edge.id)};
  });
  assert.ok(interaction.collected,'near visible record can be collected');assert.ok(interaction.noRemote);
  assert.ok(interaction.blocked,'closed door blocks submarine');assert.ok(interaction.opened,'visible reachable door operates');
  console.log(`PASS main-game authored level ${index+1}`,state.levelId,state.rooms,state.doors);
 }
 const gate=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;s.state.completed=true;const before=r.canDepart;r.campaign.record(6,'film');const after=r.canDepart;return{before,after};});
 assert.equal(gate.before,false);assert.equal(gate.after,true);assert.deepEqual(errors,[]);
 console.log('PASS seven actual worlds, location-dependent keyframes, film-gated departure, no page errors');
}finally{await browser.close();}
