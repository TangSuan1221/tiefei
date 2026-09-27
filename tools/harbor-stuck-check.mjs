import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();r.at='camera';r.footageSink=null;
  const s=r.authoredSite;let found=false;
  for(let x=1.5;x<21&&!found;x+=.5)for(let z=3;z<18;z+=.5){s.position.set(x,0,z);if(s.canMove(s.position,0)&&!s.canMove(s.position,56)){found=true;break;}}
  if(!found)throw Error('No wall-contact fixture');
  const fixture=s.position.toArray();r.heading=0;r.nudgeHeading(56);
  if(!s.canMove(s.position))throw Error('Nudge embedded hull');
  const limited=r.heading;r.heading=56; // Reproduce a save made by the old unswept rotation.
  s.move(0);if(!s.canMove(s.position))throw Error('Legacy heading not recovered');
  if(JSON.stringify(s.position.toArray())!==JSON.stringify(fixture))throw Error('Recovery teleported the boat');
  const recovered=r.heading;
  // Face parallel to the wall and confirm a collision cooldown does not lock reverse.
  r.heading=0;r.pilot.stop();r.pilotImpactUntil=r.clock+10;
  const before=s.position.clone();
  for(let i=0;i<20;i++){r.holdPilot(-1,0,0);r.frame(.05);}
  const moved=s.position.distanceTo(before);if(moved<.05)throw Error('Reverse still locked '+moved);
  return{fixture,limited,recovered,moved,clear:s.canMove(s.position)};
 });assert.ok(result.clear);console.log('PASS browser wall turn, legacy in-place recovery and reverse during contact',result);
}finally{await browser.close();}
