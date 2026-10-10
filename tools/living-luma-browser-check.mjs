// Level two optics through the shared living-render pipeline: live vs film luma at fixed stations (diagnostic
// teleports, lamp on/off), and every frame of rendered probe footage for the remote tapes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,state,siteShot,saveFrame} from './living-browser-lib.mjs';

const dir=process.env.LIVING_LUMA_DIR??'qa/living/flow-r2/luma';
const {browser,page,errors}=await openLevelTwo(dir);
const out={stations:[],tapes:{}};
const STATIONS=[
 ['shaft-bottom',7,0,7,90],
 ['c1-corridor',40,0,7.5,90],
 ['r4-door',107,0,7.5,180],
 ['r3-corpse',72,0,-52,23],
 ['valve-room',130,0,-29,90],
 ['atrium',128.5,-1,52,90],
];
const TAPES={
 alexIntro:['alex-glass','pipe-bands','slime-wall','cocoon'],
 securityLog:['security-console','pipe-bands'],
 slimeCleared:['slime-floor','pipe-bands'],
 gateOpened:['gate-inner'],
};
try{
 await startNew(page);await sit(page);await page.waitForTimeout(1500);
 await page.evaluate(()=>window.__living.world.ready);
 for(const [name,x,y,z,h] of process.env.LIVING_LUMA_TAPES_ONLY?[]:STATIONS){
  const ok=await page.evaluate(([x,y,z,h])=>window.__living.diag.teleport(x,y,z,h),[x,y,z,h]);
  assert(ok,'diagnostic teleport blocked: '+name);
  const row={name,pos:[x,y,z],heading:h};
  for(const lamp of [true,false]){
   await page.evaluate(on=>{window.__pod.lamp=on;},lamp);await page.waitForTimeout(400);
   const l=await page.evaluate(()=>({live:window.__living.diag.luma(false),film:window.__living.diag.luma(true)}));
   row[lamp?'lampOn':'lampOff']={live:+l.live.toFixed(2),film:+l.film.toFixed(2)};
   if(lamp){await siteShot(page,`${dir}/${name}-live.png`,false);await siteShot(page,`${dir}/${name}-film.png`,true);}
  }
  out.stations.push(row);console.log(JSON.stringify(row));
 }
 await page.evaluate(()=>{window.__pod.lamp=true;});
 for(const [kind,shots] of Object.entries(TAPES)){
  const frames=await page.evaluate(([kind,shots])=>window.__living.renderTape({id:'diag.'+kind,kind,lines:[],shots,facts:[]}),[kind,shots]);
  out.tapes[kind]=frames.length;
  for(let i=0;i<frames.length;i++)await saveFrame(page,`${dir}/tape-${kind}-${String(i).padStart(2,'0')}.jpg`,frames[i]);
 }
 const s=await state(page);out.hull=s.hull;
 out.errors=errors.filter(e=>!/favicon|ERR_FAILED|net::/.test(e));
 assert.deepEqual(out.errors,[],'console errors');
 out.passed=true;console.log('PASS living luma',JSON.stringify(out.tapes));
}catch(e){out.passed=false;out.failure=String(e?.stack??e);console.error('FAIL living luma',e);process.exitCode=1;}
finally{await writeFile(dir+'/results.json',JSON.stringify(out,null,2));await browser.close();}
