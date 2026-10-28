import {say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 await lib.drive(page,176,56,{creep:true});await lib.drive(page,188,52,{creep:true});await lib.turn(page,0);
 await lib.heave(page,-1.2);await tiltTo(page,0);
 await log('gate aim '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
 await page.keyboard.press('f');await page.waitForTimeout(500);await log('gate');
 await log('S07 '+await say(page,'诊断核验任务'));
 await lib.heave(page,0);
 await lib.drive(page,196,66,{creep:true});await lib.drive(page,208,68,{creep:true});await log('E shaft');
 await lib.heave(page,-11);await log('descended');
 await page.keyboard.press('b');await page.waitForTimeout(6000);
 return page.evaluate(()=>({legIndex:window.__pod.legIndex,site:window.__pod.authoredSite?.constructor?.name,living:!!window.__living,complete:window.__living?.complete}));
};
