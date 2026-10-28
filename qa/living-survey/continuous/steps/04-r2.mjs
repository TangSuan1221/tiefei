import {tiltTo,expose,diagnoseNewest,toCamera} from '../../../../tools/living-continuous-input.mjs';
// Creature bearing comes from the passive contact list the nav screen shows; the hull is aimed with real J/L.
export const aimAt=async(page,lib,id)=>{
 const c=await page.evaluate(id=>window.__living.creatures.views.find(c=>c.id===id),id);const s=await lib.state(page);
 const dx=c.position[0]-s.pos[0],dz=c.position[2]-s.pos[2],d=Math.hypot(dx,dz);
 await lib.turn(page,(Math.atan2(dx,-dz)*180/Math.PI+360)%360,2);await tiltTo(page,Math.atan2(s.pos[1]-c.position[1],d));
 return page.evaluate(id=>({seen:window.__living.diag.seen().creatureIds.includes(id)}),id);
};
export default async({page,lib,log})=>{
 await toCamera(page);
 for(const [x,z]of[[24,7.5],[53,7.5]]){await lib.drive(page,x,z);await log(`wp ${x},${z}`);}
 await lib.drive(page,53,16,{creep:true});await log('R2 door');
 await lib.drive(page,53,22,{creep:true});await log('R2 inside');
 const aim=await aimAt(page,lib,'blind.r2');await log('aim '+JSON.stringify(aim));
 const shot=await expose(page);await log('exposed '+JSON.stringify(shot.ev));
 await log('diag '+await diagnoseNewest(page));
 return page.evaluate(()=>window.__living.objective);
};
