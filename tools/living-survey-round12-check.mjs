import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/round12';
const {browser,page}=await openLevelTwo(out);
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
const data=[];await page.evaluate(()=>{window.r12lamp=window.__living.world.moodLights.find(l=>l.position[0]===154&&l.position[1]===8.2);});
for(const [label,x] of [['fixed',144],['approach',151]]){
 await page.evaluate(x=>{if(!window.__living.diag.teleport(x,0,60,90))throw Error('blocked');window.__pod.pitch=0;window.__pod.lamp=true;},x);
 for(const candidate of ['before','edge']){
  data.push(await page.evaluate(candidate=>{const w=window.__living,l=window.r12lamp;if(!l)throw Error('lamp absent');l.position=candidate==='before'?[154,8.2,57]:[191,3,57];const aim=candidate==='before'?[155,-2,67]:[199,0,64];const d=aim.map((v,i)=>v-l.position[i]),len=Math.hypot(...d);l.dir=d.map(v=>v/len);return{candidate,dir:l.dir,lights:w.world.moodLights.length,profile:w.view.profile('live')};},candidate));
  await page.waitForTimeout(800);for(const film of [false,true])await siteShot(page,`${out}/${label}-${candidate}-${film?'film':'live'}.png`,film);
 }
}
writeFileSync(`${out}/report.json`,JSON.stringify(data,null,2));
}finally{await browser.close();}
