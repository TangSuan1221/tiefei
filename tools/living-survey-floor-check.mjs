import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
const out=`qa/living-survey/round13-${process.env.QA_PHASE??'before'}`;
const {browser,page}=await openLevelTwo(out);try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
for(const [name,x,h,p] of [['fixed',56,90,0],['near',68,90,12]]){await page.evaluate(([x,h,p])=>{if(!window.__living.diag.teleport(x,0,26,h))throw Error('blocked pose');window.__pod.pitch=p;window.__pod.lamp=true;},[x,h,p]);await page.waitForTimeout(600);for(const film of [false,true])await siteShot(page,`${out}/${name}-${film?'film':'live'}.png`,film);}}finally{await browser.close();}
