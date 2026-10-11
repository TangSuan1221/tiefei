import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew} from './living-browser-lib.mjs';
const dir='qa/living/threat-fix';
const {browser,page,errors}=await openLevelTwo(dir);
try{
 await startNew(page);
 const result=await page.evaluate(()=>{
  const s=window.__living,r=window.__pod;
  r.pilot.stop();r.lamp=false;r.activeSonarEnabled=true;r.sonarPulseEnabled=true;
  // Diagnostic poses, actual production sonar renderer and actual creature blockers.
  const canvas=document.createElement('canvas');canvas.width=775;canvas.height=720;
  const ctx=canvas.getContext('2d');
  const pixels=()=>{const d=ctx.getImageData(0,0,775,720).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>150&&d[i]>d[i+1]*1.4&&d[i]>d[i+2]*1.4)n++;return n;};
  const checks=[];
  for(const [id,pod] of [['shade.r4',[107,0,8]],['lumen.r1',[40,0,-7]],['blind.a1',[120,0,64]]]){
   s.position.set(...pod);r.heading=0;
   const contacts=s.threatContacts().map(x=>x.c.id);
   ctx.clearRect(0,0,775,720);s.navigationConsole.drawActive(ctx,775,720,false);
   checks.push({id,contacts,red:pixels()});
  }
  // A wall between C1 and R1 must still hide the resident.
  s.position.set(40,0,7.5);
  const wallHidden=!s.threatContacts().some(x=>x.c.id==='lumen.r1');
  // Acquire the resident again after the preceding diagnostic teleport beyond range.
  s.position.set(40,0,-7);s.retainedThreatContacts();s.position.set(40,0,7.5);
  r.stopSonarPulses();ctx.clearRect(0,0,775,720);s.drawThreats(ctx,775,720,0,true);
  const offRed=pixels();
  r.activeSonarEnabled=false;ctx.clearRect(0,0,775,720);s.navigationConsole.drawActive(ctx,775,720,false);const powerOffRed=pixels();
  s.position.set(7,30,7);s.retainedThreatContacts();
  s.position.set(40,0,-7);ctx.clearRect(0,0,775,720);s.drawThreats(ctx,775,720,0,true);const returnedRed=pixels();
  r.activeSonarEnabled=true;
  // One real ping reaches the simulation once, even with periodic mode held on.
  const original=s.creatures.tick.bind(s.creatures),pulses=[];
  s.creatures.tick=(dt,input)=>{pulses.push(input.pulse);return original(dt,input);};
  r.sonarPulseEnabled=true;r.ping(1,true);s.tick(.05);s.tick(.05);s.tick(.05);
  s.creatures.tick=original;
  s.position.set(107,0,8);ctx.clearRect(0,0,775,720);s.navigationConsole.drawActive(ctx,775,720,false);
  return {checks,wallHidden,offRed,powerOffRed,returnedRed,pulses,image:canvas.toDataURL('image/png')};
 });
 for(const c of result.checks){assert(c.contacts.includes(c.id),`${c.id} missing from sonar`);assert(c.red>20,`${c.id} has no visible red pixels`);}
 assert(result.wallHidden,'solid wall must occlude new contacts');assert(result.offRed>20,'stopping pulses retains acquired red contacts');
 assert(result.powerOffRed>20,'transducer power off retains contacts on the powered CRT');assert.equal(result.returnedRed,0,'leaving 24m clears contacts; returning silently must not reacquire');
 assert.deepEqual(result.pulses,[true,false,false],'one ping must not turn into continuous acoustic tracking');
 await writeFile(dir+'/radar.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 assert.deepEqual(errors.filter(e=>!/favicon|ERR_FAILED|net::/.test(e)),[]);
 await writeFile(dir+'/results.json',JSON.stringify(result,null,2));console.log('PASS living threat sonar',JSON.stringify(result));
}finally{await browser.close();}
