import {expose,diagnoseNewest,say,toCamera,tiltTo,armCycle} from '../../../../tools/living-continuous-input.mjs';
import {aimAt} from './04-r2.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 for(const [x,z]of[[56,25.5],[64,26],[90,26]]){await lib.drive(page,x,z);await log(`wp ${x},${z}`);}
 await lib.drive(page,99,26,{creep:true});await log('R4 entry');
 const aim=await aimAt(page,lib,'shade.r4');await log('aim '+JSON.stringify(aim));
 const shot=await expose(page);await log('exposed '+JSON.stringify(shot.ev));
 await log('diag '+await diagnoseNewest(page));
 await log('S03 '+await say(page,'诊断核验任务'));
 await log('reply '+await say(page,'听得见，先别往前走，我来帮你。'));
 await tiltTo(page,0);
 await lib.drive(page,100,26);await lib.turn(page,180);await lib.drive(page,100,32.5);await lib.turn(page,90);await lib.drive(page,112.5,32.5,{creep:true});
 await tiltTo(page,Math.atan2(.6,3));await log('ballast aim '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
 await armCycle(page,log);await log('ballast done');await tiltTo(page,0);
 return page.evaluate(()=>window.__living.objective);
};
