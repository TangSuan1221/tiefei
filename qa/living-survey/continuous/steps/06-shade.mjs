import {expose,diagnoseNewest,say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
import {aimAt} from './04-r2.mjs';
const lamp=async(page,on)=>{for(let i=0;i<2&&await page.evaluate(()=>window.__pod.lamp)!==on;i++){await page.keyboard.press('3');await page.waitForTimeout(250);}};
// Light-averse target: approach dark, aim, light it and open the shutter before its 3 s glare limit.
export default async({page,lib,log})=>{
 await toCamera(page);await lamp(page,false);
 const s=await lib.state(page);if(s.pos[0]>106){await lib.turn(page,90);await lib.reverse(page,104,32.4);}
 await lib.drive(page,102,28);
 const aim=await aimAt(page,lib,'shade.r4');await lamp(page,true);await page.waitForTimeout(200);
 await log('aim '+JSON.stringify(aim)+' '+JSON.stringify(await page.evaluate(()=>window.__living.diag.seen().creatureIds)));
 const shot=await expose(page);await log('exposed '+JSON.stringify(shot.ev));
 await log('diag '+await diagnoseNewest(page));
 await log('S03 '+await say(page,'诊断核验任务'));
 await log('reply '+await say(page,'听得见，先别往前走，我来帮你。'));
 await tiltTo(page,0);
 return page.evaluate(()=>({objective:window.__living.objective,early:window.__ctrace.filter(e=>e.t>200&&e.t<300)}));
};
