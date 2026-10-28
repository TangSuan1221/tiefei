import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
const {browser,page,errors}=await openLevelTwo('qa/living-survey/art');
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
for(const [name,x,y,z,h] of [['entry',7,0,6,145],['repair-link',56,0,26,90],['supply',134,0,13.5,90],['password',128.5,0,35,180],['atrium',144,0,60,90],['exit',193,0,68,90]]){await page.evaluate(([x,y,z,h])=>{window.__living.diag.teleport(x,y,z,h);window.__pod.lamp=true;},[x,y,z,h]);await page.waitForTimeout(500);await siteShot(page,`qa/living-survey/art/${name}.png`,true);await siteShot(page,`qa/living-survey/art/${name}-live.png`,false);}console.log(errors);}finally{await browser.close();}
