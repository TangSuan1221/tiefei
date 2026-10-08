import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const before=await page.evaluate(async()=>{
  const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;
  if(s.snapshot().adapter!=='harbor-rescue')throw Error('Formal rescue adapter missing');
  const elapsedBefore=s.snapshot().elapsed;s.tick(-3);s.tick(NaN);if(s.snapshot().elapsed!==elapsedBefore)throw Error('Invalid dt moved rescue clock');
  // Diagnostic approach placement; state transitions still use actual receiver callbacks.
  const n=s.navigationConsole;n.setWaypoint([11,0,16]);s.position.set(11,0,16);s.tick(.1);s.position.set(35,0,30);s.tick(.1);
  n.setFrequency(38.4);s.tick(.5);for(let i=0;i<500&&s.dialogue.busy;i++)s.tick(.25);if(!n.heard||!n.reply())throw Error('Automatic radio handshake failed');s.tick(.1);
  n.setWaypoint([60,0,27]);s.position.set(11,0,10);r.heading=180;r.pilot.stop();r.activeSonarEnabled=false;
  const api=await import('/src/pod/sim/harbor-save.ts');const save=api.captureHarborSave(r);if(!save)throw Error('Safe save rejected');
  // Exercise UI-record restoration without depending on Vite's HMR WeakMap identity.
  save.site.sonarDesk.records=[{text:'已录存求救',kind:'固定水声通信 / 人声',frequency:38.4}];
  save.site.sonarDesk.selected=0;save.site.sonarDesk.page='result';
  if(!s.restore(save.site))throw Error('Valid diagnostic record restore rejected '+JSON.stringify({elapsed:save.site.elapsed,position:save.site.position,heading:save.site.heading}));
  api.writeHarborSave(localStorage,save);
  const read=api.readHarborSave(localStorage);
  const old=structuredClone(save);delete old.site.adapter;delete old.site.adapterVersion;
  let rejection='';const legacy={getItem:()=>JSON.stringify(old),setItem(){throw Error('Must preserve old save')}};
  try{api.readHarborSave(legacy);}catch(e){rejection=e.message;}
  if(!rejection.includes('旧版'))throw Error('Legacy save not explicitly rejected');
  return {seed:r.seed,navigation:read.site.navigation,rescue:read.site.rescue,dialogue:read.site.dialogue,sonarDesk:read.site.sonarDesk,legacy:rejection};
 });
 await page.reload();await page.locator('[data-id="continue"]').click();await page.waitForFunction(()=>!!window.__pod);
 const after=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite.snapshot();return {seed:r.seed,navigation:s.navigation,rescue:s.rescue,dialogue:s.dialogue,caption:r.storyCaption,sonarDesk:s.sonarDesk};});
 assert.equal(after.seed,before.seed);assert.deepEqual(after.navigation,before.navigation);
 for(const k of ['heard','replied','signal'])assert.equal(after.rescue[k],before.rescue[k]);
 assert.equal(after.dialogue.stage,before.dialogue.stage);assert.deepEqual(after.dialogue.pending,before.dialogue.pending);assert.deepEqual(after.dialogue.active,before.dialogue.active);assert.equal(after.caption,before.dialogue.active.text);
 assert.deepEqual(after.sonarDesk.records,before.sonarDesk.records);assert.equal(after.sonarDesk.page,'result');assert.deepEqual(errors,[]);
 console.log('PASS actual / new → receiver handshake → save → reload Continue: navigation, rescue, sonar records restored; legacy rejected without write');
} finally {await browser.close();}
