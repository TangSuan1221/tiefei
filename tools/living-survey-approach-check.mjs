import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
const {browser,page,errors}=await openLevelTwo('qa/living-survey/approach-after');
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
for(const [name,x,y,z,h,pitch] of [['entry',10,0,8.5,180,22],['repair',68,0,26,90,12],['atrium',151,0,60,90,12]]){await page.evaluate(([x,y,z,h,p])=>{if(!window.__living.diag.teleport(x,y,z,h))throw Error('pose blocked');window.__pod.pitch=p;window.__pod.lamp=true;},[x,y,z,h,pitch]);await page.waitForTimeout(300);await siteShot(page,`qa/living-survey/approach-after/${name}-live.png`,false);}console.log(errors);}finally{await browser.close();}
