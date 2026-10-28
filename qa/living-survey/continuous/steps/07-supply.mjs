import {expose,diagnoseNewest,say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 for(const [x,z]of[[104,17],[118,17],[126,15]]){await lib.drive(page,x,z);await log(`wp ${x},${z}`);}
 await lib.drive(page,137.8,13.5,{creep:true});await lib.turn(page,90);await tiltTo(page,Math.atan2(-1.65,3.5));
 await log('sign pose '+JSON.stringify(await page.evaluate(()=>window.__living.diag.seen().targets)));
 const shot=await expose(page);await log('exposed '+JSON.stringify(shot.ev));
 await log('diag '+await diagnoseNewest(page));
 await tiltTo(page,0);await log('valve aim '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
 await page.keyboard.press('f');await page.waitForTimeout(500);await log('valve');
 await log('report '+await say(page,'含硫支路已关闭'));
 await log('S05 '+await say(page,'诊断核验任务'));
 return page.evaluate(()=>window.__living.objective);
};
