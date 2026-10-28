import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 const result=await page.evaluate(async()=>{const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts');r.pilot.stop();r.lamp=true;
 s.position.set(...l.spiralPoint(7.25));s.position.y=-9;s.time=1;const open=s.clear(s.position.toArray());s.time=5;const closed=s.clear(s.position.toArray());
 s.position.set(l.PIT.centre[0]+20,-10,l.PIT.centre[2]);s.story.sync({'alarm.state':'off'});r.power=1;r.activeSonarEnabled=true;r.sonarPulseEnabled=true;const initialHull=r.hull;for(let i=0;i<40;i++)s.tick(.1);const loudHull=r.hull;r.stopSonarPulses();const pressure=s.acousticPressure;for(let i=0;i<40;i++)s.tick(.1);const quietPressure=s.acousticPressure;
 s.position.set(...l.spiralPoint(6.5,0,-9));r.vitals.restore({san:-100});s.tick(.1);const fake=s.fakeMessageShown;s.position.y=-13;s.tick(.1);const obeyed=s.story.state['san.fakeObeyed'];
 s.story.sync({'pod.sedatives':1});const sanBefore=r.vitals.vitals.san;s.radioSay('使用宁神剂');const recovered=r.vitals.vitals.san>sanBefore&&s.story.state['pod.sedatives']===0;
 s.position.set(...l.ABYSS_SPAWN.position);r.heading=l.ABYSS_SPAWN.heading;const snapshot=s.snapshot();snapshot.story.state['containment.captured']=3;const forgedSave=s.restore(snapshot);
 return {open,closed,loudDamage:initialHull-loudHull,pressure,quietPressure,fake,obeyed,recovered,forgedSave};});
 await writeFile('qa/level-03/runtime/hazards.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));assert(result.open&&!result.closed);assert(result.loudDamage>0);assert(result.quietPressure<result.pressure);assert(result.fake&&result.obeyed&&result.recovered);assert.equal(result.forgedSave,false);
}finally{await browser.close();}
