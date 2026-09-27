import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await browser.newPage();await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5173/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 const result=await p.evaluate(async()=>{
  const {buildFootagePrompt}=await import('/src/pod/content/footage.ts');
  const r=window.__pod;r.receive();r.arrive();r.at='camera';const s=r.authoredSite;s.position.set(60,0,20);
  s.tick(.1);const noTimerSpawn=!r.threat;r.spawnThreat('cre.runner',55);s.tick(.05);const triggered=!!r.threat;
  const observation=buildFootagePrompt(r.captureFootage('survey'));
  const before=r.weaponAmmo.decoy,range=r.threat.range,bearing=r.threat.bearing;
  const debug={clock:r.clock,ready:r.weaponReadyAt,ammo:r.weaponAmmo,phase:r.threat.phase};
  const fired=r.fireWeapon('decoy');const blocked=!r.fireWeapon('pulse');
  const interrupted=s.runner?.stage==='recover';
  const captured=r.captureFootage('survey');const combat=buildFootagePrompt(captured);
  for(let i=0;i<150;i++)s.tick(.05);
  const resumed=r.lastCombat?.outcome==='returned';
  const resumedPrompt=buildFootagePrompt(r.captureFootage('survey')).includes('resuming directed approach');
  if(!r.lastCombat)return {triggered,fired,debug,at:r.at,outcome:r.outcome,room:s.room?.id,opening:r.openingReceived,arm:r.arm.phase};
  r.lastCombat.result='changed after capture';const frozen=buildFootagePrompt(captured)===combat;
  return {noTimerSpawn,triggered,fired,blocked,interrupted,frozen,resumed,resumedPrompt,spent:r.weaponAmmo.decoy===before-1,analysis:observation.includes('Template: monster-analysis'),combat:combat.includes('Template: combat-feedback'),range};
 });
 console.log(result);
 for(const [k,v] of Object.entries(result))if(k!=='range')assert.equal(v,true,k);
}finally{await browser.close();}
