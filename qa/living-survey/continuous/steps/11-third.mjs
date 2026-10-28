import {expose,diagnoseNewest,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
import {aimAt} from './04-r2.mjs';
// Patrolling target: close in along its bearing at creep speed, re-aim, and expose once the framing check accepts it.
export default async({page,lib,log})=>{
 await toCamera(page);
 for(let k=0;k<6;k++){
  const aim=await aimAt(page,lib,'blind.a2');
  const why=await page.evaluate(()=>window.__living.diag.seen().rejected.find(r=>r.id==='blind.a2')?.reason??'');
  const c=await page.evaluate(()=>window.__living.creatures.views.find(c=>c.id==='blind.a2'));const s=await lib.state(page);
  const d=Math.hypot(c.position[0]-s.pos[0],c.position[2]-s.pos[2]);await log(`try ${k} d=${d.toFixed(1)} seen=${aim.seen} ${why}`);
  if(aim.seen){const shot=await expose(page);await log('exposed '+JSON.stringify(shot.ev));if(shot.ev.valid){await log('diag '+await diagnoseNewest(page));break;}continue;}
  const f=Math.max(0,d-9)/d;await tiltTo(page,0);
  await lib.drive(page,s.pos[0]+(c.position[0]-s.pos[0])*f,s.pos[2]+(c.position[2]-s.pos[2])*f,{creep:true});
 }
 await tiltTo(page,0);
 return page.evaluate(()=>window.__living.objective);
};
