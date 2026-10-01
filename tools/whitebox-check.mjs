import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Real browser frames only: no teleport, injected grants, or synthetic frame(dt).
const base = process.env.WHITEBOX_URL ?? 'http://127.0.0.1:5174/whitebox.html';
const variant = process.env.WHITEBOX_NEGATIVE ? 'negative' : 'normal';
const dir = `qa/whitebox/${variant}`;
await mkdir(dir, { recursive: true });
const report = { method: 'Engineering regression, NOT blind play: Edge; known route coordinates; normal input API; real animation frames; isolated storage', url: base, passed: false, errors: [], steps: [], shots: [], blocked: [], navigations: [] };
report.startedAt=Date.now();report.negative=!!process.env.WHITEBOX_NEGATIVE;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
process.once('SIGINT',async()=>{await browser.close();process.exit(130);});
const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: 'block' });
await context.route('**/*', route => {
  const u = new URL(route.request().url());
  if (/^https?:$/.test(u.protocol) && (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.pathname.startsWith('/api/'))) {
    report.blocked.push(u.origin + u.pathname); return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
page.on('framenavigated', frame => { if (frame === page.mainFrame()) report.navigations.push({ url: frame.url(), time: Date.now() }); });

async function snapshot(label) {
  const value = await page.evaluate(() => ({ time: performance.now(), site: window.__whitebox?.site?.snapshot(), clock: window.__whitebox?.run.clock, resources: window.__whitebox ? {power:window.__whitebox.run.power,hull:window.__whitebox.run.hull,oxygen:window.__whitebox.run.vitals.vitals.oxygen}:null, shot: window.__whitebox?.run.shot.phase }));
  report.steps.push({ label, ...value }); console.log(label, JSON.stringify(value.site)); await writeFile(`${dir}/progress.json`,JSON.stringify(report,null,2)); return value;
}
async function screenshot(name) { await page.screenshot({ path: `${dir}/${name}.png` }); }
async function drive(x,z,heading=0){
 await page.evaluate(()=>window.__whitebox.run.walkTo('camera'));
 const pose=()=>page.evaluate(()=>{const {run:r,site:s}=window.__whitebox;return {p:s.position.toArray(),h:r.heading,block:r.driveBlock};});
 const delta=(a,b)=>((a-b+540)%360)-180;
 const path=[];
 async function input(action){await page.evaluate(action=>window.__whitebox.run.cameraDrive(action),action);await page.waitForTimeout(80);path.push(await pose());}
 async function face(h){for(let i=0;i<80;i++){const p=await pose();if(Math.abs(delta(h,p.h))<.05)return;if(Math.abs(delta(h,p.h))<5){await page.evaluate(d=>window.__whitebox.run.nudgeHeading(d),delta(h,p.h));await page.waitForTimeout(80);}else await input(delta(h,p.h)>0?'right':'left');const next=await pose();if(Math.abs(delta(next.h,p.h))<.1){await input('back');console.log('reverse-recovery',JSON.stringify(await pose()));}} throw Error('turn blocked '+JSON.stringify(await pose()));}
 let p=await pose();
 if(Math.abs(x-p.p[0])<.38&&z-p.p[2]>.38&&z-p.p[2]<1&&Math.abs(delta(0,p.h))<2.6){await input('back');p=await pose();}
 for(const axis of [0,2]){const goal=axis===0?x:z;const distance=goal-p.p[axis];if(Math.abs(distance)<.38)continue;await face(axis===0?(distance>0?90:270):(distance>0?180:0));
  for(let i=0;i<100;i++){p=await pose();if(Math.abs(goal-p.p[axis])<.38)break;const before=p.p[axis];await input('forward');p=await pose();if(Math.abs(p.p[axis]-before)<.01)throw Error('movement blocked '+JSON.stringify(p));}
 }
 await face(heading);report.steps.push({label:'drive',method:'normal cameraDrive 0.75m pulses, real frames between',target:[x,z,heading],path});console.log('drive',JSON.stringify(await pose()));
}
async function interact(){await page.evaluate(()=>{const r=window.__whitebox.run;r.walkTo('camera');r.extendArm();});await page.waitForTimeout(150);}
async function shoot(label,analyze=true){
  const start=await page.evaluate(()=>{const r=window.__whitebox.run;r.walkTo('camera');r.beginShoot();return {wall:performance.now(),clock:r.clock,phase:r.shot.phase,capture:r.shot.siteEvidence};});
  assert.equal(start.phase,'exposing',`${label}: exposure started`);
  await page.waitForFunction(()=>window.__whitebox.run.shot.phase==='developing',null,{timeout:20000});
  const exposed=await page.evaluate(()=>({wall:performance.now(),clock:window.__whitebox.run.clock}));
  await page.waitForFunction(()=>window.__whitebox.run.selectedTape?.ready===true,null,{timeout:35000});
  const ready=await page.evaluate(()=>{const r=window.__whitebox.run,t=r.selectedTape;return {wall:performance.now(),clock:r.clock,id:t.id,frames:t.sensorFrames?.length,distinct:new Set(t.sensorFrames).size,capture:t.siteEvidence,description:t.testDescription};});
  assert.ok(!report.shots.some(s=>s.ready.id===ready.id),`${label}: new tape id must not collide with an earlier recording`);
  assert.ok(exposed.clock-start.clock>=4.95,'five second exposure');assert.ok(ready.clock-exposed.clock>=11.8,'twelve second development');assert.equal(ready.frames,0,'description mode produces no video frames');assert.ok(ready.description?.startsWith('测试拍摄描述：'),'description derives from exposure snapshot');
  report.shots.push({label,start,exposed,ready});
  if(analyze)await page.evaluate(()=>{const r=window.__whitebox.run;r.walkTo('lab');r.analyzeTape();});
  await page.waitForTimeout(1200);await screenshot(label);const frames=await page.evaluate(()=>window.__whitebox.run.selectedTape.sensorFrames);for(const i of [0,Math.floor(frames.length/2),frames.length-1]){const data=frames[i];if(data)await writeFile(dir+'/'+label+'-frame-'+i+'.jpg',Buffer.from(data.split(',')[1],'base64'));}return ready;
}

try {
  await page.goto(new URL('/', base).href);
  await page.evaluate(() => localStorage.setItem('ironlung.qa.whitebox-main-save-sentinel', 'do-not-change'));
  report.storageBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.goto(base);
  await page.locator('#whitebox-start').click();
  await page.waitForFunction(() => !!window.__whitebox?.site, null, { timeout: 30000 });
  await page.keyboard.press('r');
  await page.keyboard.press('9');await page.keyboard.press('9');await page.keyboard.press('Tab');await page.keyboard.press('0');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__whitebox.site.navigationConsole.target),null);
  await screenshot('coordinate-keypad');
  await page.keyboard.press('Escape');await page.keyboard.press('r');
  await page.keyboard.press('0');await page.keyboard.press('Tab');await page.keyboard.press('4');await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>window.__whitebox.site.navigationConsole.target),[0,4]);
  assert.equal(await page.evaluate(()=>window.__whitebox.run.activeSonarEnabled),false);
  await page.keyboard.press('2');await page.keyboard.press('3');
  assert.equal(await page.evaluate(()=>window.__whitebox.run.activeSonarEnabled),true);
  await screenshot('sonar-active');await page.keyboard.press('2');
  await snapshot('entry'); await screenshot('entry');
  if(process.env.WHITEBOX_NEGATIVE){await drive(0,4,180);await shoot('wrong-direction');assert.equal((await snapshot('wrong-rejected')).site.identified,false);}
  await drive(0,4);
  await page.evaluate(()=>window.__whitebox.run.walkTo('nav'));
  await page.keyboard.press('1');
  await page.keyboard.press('p');assert.equal(await page.evaluate(()=>window.__whitebox.site.navigationConsole.heard),false);
  for(let i=0;i<6;i++)await page.keyboard.press('e');
  await page.keyboard.press('c');assert.equal(await page.evaluate(()=>window.__whitebox.site.navigationConsole.captured),true);
  await page.keyboard.press('p');await page.waitForFunction(()=>window.__whitebox.site.events.some(e=>e.event.startsWith('罗温：听见了')),null,{timeout:20000});
  await page.waitForFunction(()=>window.__whitebox.site.events.some(e=>e.event.startsWith('艾里亚斯：我没受伤')),null,{timeout:20000});
  await screenshot('radio-tuned');
  await shoot('threat');assert.equal((await snapshot('threat-confirmed')).site.identified,true);
  if(!process.env.WHITEBOX_NEGATIVE){
    await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ironlung.whitebox.checkpoint.v2')??'null')?.site?.identified===true,null,{timeout:10000});
    await page.reload();await page.locator('#whitebox-continue').click();
    await page.waitForFunction(()=>window.__whitebox?.site?.identified===true,null,{timeout:30000});
    assert.equal((await snapshot('mid-route-checkpoint-reloaded')).site.powered,false);
    report.midRouteCheckpointReloaded=true;
  }
  await drive(0,4.5);await drive(-12,4.5);await drive(-12,3.75);await interact();assert.equal((await snapshot('power')).site.powered,true);
  await drive(-12,4.5);
  await drive(12,4,90);await interact();
  if(process.env.WHITEBOX_NEGATIVE){await interact();await drive(12,4);
  assert.equal((await snapshot('early-close')).site.monsterInside,false);
  await shoot('early-close-result');assert.equal((await snapshot('early-close-not-verified')).site.verified,false);
  await drive(12,4,90);await interact();await interact();await drive(12,4);await page.waitForTimeout(10000);
  await shoot('lure-unanalysed',false);await drive(12,4,90);await interact();
  await page.evaluate(()=>{const r=window.__whitebox.run;r.walkTo('lab');r.analyzeTape();});
  assert.equal((await snapshot('stale-lure-rejected')).site.verified,false);
  assert.equal((await snapshot('stale-no-lure-grant')).site.lured,false);
  await drive(12,4,90);await interact();await interact();await drive(12,4);await page.waitForTimeout(10000);
  }else{await drive(12,4);await page.waitForTimeout(10000);}
  await shoot('lure');assert.equal((await snapshot('lure-confirmed')).site.lured,true);
  await drive(12,4,90);await interact();await drive(12,4);await shoot('gate');assert.equal((await snapshot('gate-confirmed')).site.verified,true);
  await drive(0,4);await drive(0,-8);await interact();assert.equal((await snapshot('rescued')).site.rescued,true);
  assert.equal((await snapshot('departure-not-yet-confirmed')).site.departureConfirmed,false,'rescue alone must not confirm the separated route');
  await page.waitForTimeout(4500);await shoot('departure');
  assert.equal((await snapshot('departure-confirmed')).site.departureConfirmed,true);
  await drive(0,-7.5);await drive(0,4);await drive(0,18.75);await drive(12,18.75);await drive(12,18);await interact();
  assert.equal((await snapshot('complete')).site.complete,true);await screenshot('complete');
  assert.deepEqual(report.errors,[]);
  const ending=await page.evaluate(()=>({outcome:window.__whitebox.run.outcome,power:window.__whitebox.run.power,oxygen:window.__whitebox.run.vitals.vitals.oxygen}));
  assert.equal(ending.outcome.kind,'alive','completion must leave player alive');
  assert.ok(ending.power>0.02,'completion retains usable power');
  assert.ok(ending.oxygen>0,'completion retains oxygen');
  report.ending=ending;
  // Separate persistence contract check after normal play is complete. This
  // never grants progress or supplies to the route above.
  report.restoreChecks=await page.evaluate(()=>{
    const s=window.__whitebox.site, saved=s.snapshot();
    const invalid=[null,{...saved,version:999},{...saved,position:[9999,2,9999]},
      {...saved,verified:false,rescued:true},{...saved,departureConfirmed:false,complete:true},
      {...saved,heading:NaN}];
    const rejected=invalid.map(value=>{const before=JSON.stringify(s.snapshot());const accepted=s.restore(value);return {accepted,unchanged:before===JSON.stringify(s.snapshot())};});
    const restored=s.restore(saved), after=s.snapshot();
    return {rejected,restored,roundTrip:['identified','powered','lured','gateClosed','monsterInside','verified','rescued','complete','departureConfirmed','epoch'].every(k=>saved[k]===after[k])};
  });
  assert.ok(report.restoreChecks.rejected.every(c=>!c.accepted&&c.unchanged),'invalid checkpoints must be rejected atomically');
  assert.ok(report.restoreChecks.restored&&report.restoreChecks.roundTrip,'completed checkpoint round trip');
  await page.waitForFunction(()=>{
    const saved=JSON.parse(sessionStorage.getItem('ironlung.whitebox.checkpoint.v2')??'null');
    return saved?.site?.complete===true;
  },null,{timeout:10000});
  await page.reload();await page.locator('#whitebox-continue').click();
  await page.waitForFunction(()=>window.__whitebox?.site?.complete===true,null,{timeout:30000});
  const resumed=await snapshot('checkpoint-reloaded');
  assert.equal(resumed.site.departureConfirmed,true);
  assert.equal(resumed.site.rescued,true);
  assert.ok(resumed.resources.power>0.02);
  report.checkpointReloaded=true;
  report.passed=true;
} catch (error) {
  report.failure = String(error?.stack ?? error);
  await screenshot('failure').catch(() => {});
} finally {
  report.storageAfter = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))).catch(() => null);
  report.storageUnchanged = JSON.stringify(report.storageBefore) === JSON.stringify(report.storageAfter);
  if(!report.storageUnchanged){report.passed=false;report.failure='Main localStorage changed';}
  report.wallSeconds=(Date.now()-report.startedAt)/1000;
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${dir}/report-${report.negative?'negative':'normal'}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, failure: report.failure, storageUnchanged: report.storageUnchanged }, null, 2));
if (!report.passed) process.exitCode = 1;


