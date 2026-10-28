import {say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 for(let i=0;i<6;i++){const a=await page.evaluate(()=>window.__living.diag.aimed());if(a&&a.distance<=3.35)break;await lib.hold(page,' ',300);await lib.hold(page,'Shift',900);}
 await log('valve aim '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
 await page.keyboard.press('f');await page.waitForTimeout(500);await log('valve');
 await log('report '+await say(page,'含硫支路已关闭'));
 await log('S05 '+await say(page,'诊断核验任务'));
 return page.evaluate(()=>window.__living.objective);
};
