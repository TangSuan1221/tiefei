import {say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 const s0=await lib.state(page);
 if(s0.pos[2]<30){await lib.turn(page,270);await lib.drive(page,128.5,17);await lib.drive(page,128.5,30,{creep:true});}
 await lib.drive(page,129.2,38,{creep:true});await lib.turn(page,90);
 for(let i=0;i<6;i++){const a=await page.evaluate(()=>window.__living.diag.aimed());if(a?.id==='living.survey.lock'&&a.distance<=3.35)break;await lib.hold(page,' ',300);await lib.hold(page,'Shift',900);}
 await log('lock aim '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
 await page.keyboard.press('f');await page.waitForTimeout(500);await log('door inspect');
 await log('ask '+await say(page,'门锁住了，请给我密码'));
 const clip=await say(page,'诊断核验任务');await log('S06 '+clip);
 // The code is read from the clip text the player sees, not from internal state.
 const code=clip.match(/\d{4}/)?.[0];if(!code)throw Error('no code in clip');
 await log('enter '+await say(page,code));await page.waitForTimeout(4000);
 return page.evaluate(()=>window.__living.objective);
};
