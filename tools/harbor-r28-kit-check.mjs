import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5190/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(async()=>{
  // Isolated engineering fixture: staged dialogue and position, real scene ray and arm events.
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;r.prologue=null;
  for(let i=0;i<200&&!s.world.root.getObjectByName('rescue-blender-power-cabinet')?.userData.loaded;i++)await new Promise(ok=>setTimeout(ok,50));
  s.base.state.opened.push('harbor.edge.A-C','harbor.edge.C-B');s.tick(.1);
  const f=s.simpleFlow;f.accept('L1-R28-V01');f.identify();f.accept('L1-R28-V02');f.requestCode();f.accept('L1-R28-V02-AUTH');f.backgroundRequested=true;f.accept('L1-R28-V02A');f.tick(3);f.tick(3);f.accept('L1-R28-V03');
  r.activeSonarEnabled=false;s.tick(.1);f.accept('L1-R28-V04');
  s.position.set(41,0,23.4);r.heading=0;r.pitch=8;r.camPan=r.camTilt=0;r.at='camera';r.lamp=true;r.power=1;r.blackout=false;r.pilot.stop();
  const hit=s.aimedInterface();
  s.interact();r.tickArm(4);const extended=r.arm.phase;
  s.interact();r.tickArm(2);const beforeStow=f.kitStored;
  r.retractArm();r.tickArm(3);s.tick(.1);
  const stored=f.kitStored,noCrate=!s.world.root.getObjectByName('港区维修工具箱');
  s.harborAction('repair');const repaired=f.repairCompleted,hull=r.hull;
  s.position.set(42,0,28);s.tick(.1);const snapshot=s.snapshot(),restored=s.restore(snapshot);
  return {hit,extended,beforeStow,stored,noCrate,repaired,hull,restored};
 });
 assert.equal(result.hit.id,'harbor.rescue.power');assert.ok(result.hit.distance<=3.4);
 assert.equal(result.extended,'aiming');assert.equal(result.beforeStow,false);assert.equal(result.stored,true);
 assert.equal(result.noCrate,true);assert.equal(result.repaired,true);assert.equal(result.hull,1);assert.equal(result.restored,true);
 console.log(JSON.stringify(result));console.log('PASS engineering fixture: shore-power station tool pickup, timed arm pickup/stow, repair and save. Staged position/dialogue; not navigation or blind play. No provider calls.');
}finally{await browser.close();}
