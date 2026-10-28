import {openLevelTwo,startNew} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/r4-damage';const {browser,page,errors}=await openLevelTwo(out);
try{await page.evaluate(()=>sessionStorage.setItem('ironlung.gm.novideo','1'));await startNew(page);await page.evaluate(()=>window.__living.world.ready);
const result=await page.evaluate(()=>{const r=window.__pod,l=window.__living;const rows=[];r.power=.71;r.hull=.64;r.lamp=true;r.activeSonarEnabled=false;r.sonarPulseEnabled=false;r.pilot.stop();l.position.set(109.5,0,27.1);r.heading=131;r.at='lab';r.shot.viewing=true;
const hurt=l.hurt.bind(l);l.hurt=(amount,shake)=>{rows.push({time:l.elapsed,amount,before:r.hull,pos:l.vec(),heading:r.heading,at:r.at});hurt(amount,shake);};
const start=l.elapsed;for(let t=0;t<65;t+=.05){l.tick(.05);if(r.hull<=0)break;}
const end={elapsed:l.elapsed-start,hull:r.hull,pos:l.vec(),heading:r.heading,at:r.at,viewing:r.shot.viewing,feedback:l.feedbackText,creatures:l.creatures.snapshot()};
// Independent retreat geometry probe from the same initial pose, not a continuation or claimed blind input.
l.position.set(109.5,0,27.1);r.heading=131;const reverse=[];for(let i=0;i<30;i++){const ok=l.move(-.1);reverse.push({ok,pos:l.vec()});if(!ok)break;}
const original=l.creatures.blockers.bind(l.creatures);l.creatures.blockers=()=>[];const without={clear:l.clear(l.position),reverse:l.move(-.1),pos:l.vec()};l.creatures.blockers=original;
l.position.set(109.5,0,27.1);const mob=l.creatures.mobs.find(m=>m.spawn.id==='shade.r4');Object.assign(mob,{mode:'recoil',pos:[117,-2,14],dark:24.9,cooldown:0});const returning=[];let lastClear;for(let t=0;t<30;t+=.05){l.creatures.tick(.05,{pod:l.vec(),heading:131,lampOn:true,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0});const clear=l.clear(l.position);if(clear!==lastClear){returning.push({t,clear,mode:mob.mode,mobPos:[...mob.pos],blockers:original()});lastClear=clear;}}
return {method:'Independent fixture; synchronous normal site.tick in .05s increments, real hurt/push/collision. Lab entered for interruption check. No full run clock/UI wall-time claim. Separate reverse and recoil-to-home geometry probes; QA-only blocker disable comparison restored immediately.',start,rows,end,reverse,without,returning};});writeFileSync(`${out}/browser.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));}finally{await browser.close();}
