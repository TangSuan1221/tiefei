import {say} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await lib.startNew(page);await page.evaluate(()=>window.__living.world.ready);await log('new game');
 await lib.sit(page);await log('seated');
 // The GM toggle persists in sessionStorage across reloads; only flip it when the visible objective lacks the GM banner.
 if(!(await page.evaluate(()=>window.__living.objective)).startsWith('【GM无视频】')){await page.keyboard.press('F10');await page.locator('[data-gm="无视频模式"]').click();await page.locator('[data-close]').click();await page.waitForTimeout(300);}
 await log('gm no-video on');
 const f=await say(page,'诊断核验任务');await log('S01 '+f);
 return page.evaluate(()=>window.__living.objective);
};
