// Real-key R2 diagnostic for the survey eyeless hunter (blind.r2): lamp off and active sonar unpowered throughout.
// 1 creep (<0.45 m/s) to the hydraulic toolbox and wait; 2 full-speed run, then brake and hold still;
// 3 hold still in the workshop and watch the patrol. Starts from a GM teleport into C1, so it is a diagnostic, not a blind playthrough.
import {openLevelTwo,startNew,state,drive,hold} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';

const DIR='qa/living-hunter-stealth';
const {browser,page,errors}=await openLevelTwo(DIR);
const out={phases:[],errors};
const sample=()=>page.evaluate(()=>{const r=window.__pod,l=window.__living,c=l.creatures.views.find(v=>v.id==='blind.r2'),m=l.creatures.snapshot().mobs.find(m=>m.id==='blind.r2');
 return {t:+l.elapsed.toFixed(1),hull:+r.hull.toFixed(3),speed:+r.pilot.speed.toFixed(2),lit:r.lit,active:r.activeSonarEnabled,pos:l.diag.state().pos.map(v=>+v.toFixed(1)),mode:c.mode,alert:+m.alert.toFixed(2),r2:c.position.map(v=>+v.toFixed(1))};});
async function phase(label,fn){const before=await sample();const rows=[];const timer=setInterval(()=>{sample().then(r=>rows.push(r)).catch(()=>{});},500);
 let error=null;try{await fn(rows);}catch(e){error=String(e);}clearInterval(timer);const after=await sample();
 const modes=[...new Set(rows.map(r=>r.mode))];out.phases.push({label,before,after,hullLost:+(before.hull-after.hull).toFixed(3),modes,maxSpeed:Math.max(0,...rows.map(r=>Math.abs(r.speed))),error,rows});
 console.log(label,JSON.stringify({hullLost:+(before.hull-after.hull).toFixed(3),modes,end:after.mode,alert:after.alert,error}));}
try{
 await startNew(page);
 await page.evaluate(async()=>{const l=window.__living,r=window.__pod;await l.world.ready;r.at='camera';r.lamp=false;r.activeSonarEnabled=false;r.sonarPulseEnabled=false;r.power=1;r.hull=1;l.diag.teleport(53,0,8,180);});
 await phase('1 creep to toolbox, wait 20 s',async()=>{await drive(page,53,20,{creep:true});await drive(page,57,26,{creep:true});await page.waitForTimeout(20000);});
 await phase('2 full speed across workshop, then brake and hold still 35 s',async()=>{await drive(page,50,16);await drive(page,58,22);await hold(page,'Shift',1500);await page.waitForTimeout(35000);});
 await phase('3 hold still in workshop 60 s (patrol)',async()=>{await page.waitForTimeout(60000);});
 out.final=await state(page);
}catch(e){out.error=String(e);console.log('ERROR',e);}
finally{await writeFile(DIR+'/results.json',JSON.stringify(out,null,1));await page.screenshot({path:DIR+'/final.png'}).catch(()=>{});await browser.close();}
console.log('page errors',errors.length,errors.slice(0,3));
