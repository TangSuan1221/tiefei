import {say,tiltTo,armCycle} from '../../../../tools/living-continuous-input.mjs';
export const lampOn=async page=>{for(let i=0;i<2&&!await page.evaluate(()=>window.__pod.lamp);i++){await page.keyboard.press('3');await page.waitForTimeout(300);}};
export default async({page,lib,log})=>{
 if(!await page.evaluate(()=>window.__living.survey.camera)){
  const s=await lib.state(page);if(Math.hypot(s.pos[0]-10,s.pos[2]-8.5)>.6){await lib.drive(page,10,7.4);await lib.drive(page,10,8.5);}
  await lib.turn(page,180);await tiltTo(page,Math.atan2(1.2,3));
  await lampOn(page);await log('at camera case aimed '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));await armCycle(page,log);await log('after arm');
 }
 await tiltTo(page,0);await lib.reverse(page,10,7.6);await lib.drive(page,12,9);await lib.turn(page,180);await tiltTo(page,Math.atan2(.5,3.45));
 await log('handoff pose '+await say(page,'传递移动摄像仪'));
 await log('S02 '+await say(page,'诊断核验任务'));
 await tiltTo(page,0);
 return page.evaluate(()=>window.__living.objective);
};
