import {say,tiltTo,toCamera} from '../../../../tools/living-continuous-input.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);
 await lib.hold(page,' ',500);await lib.hold(page,'Shift',1200);
 await log('nudged '+await say(page,'传递移动摄像仪'));
 await log('S02 '+await say(page,'诊断核验任务'));
 await tiltTo(page,0);
 return page.evaluate(()=>window.__living.objective);
};
