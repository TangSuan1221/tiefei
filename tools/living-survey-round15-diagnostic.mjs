import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
const out='qa/living-survey/round15-diagnostic';const {browser,page}=await openLevelTwo(out);
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
await page.evaluate(()=>{window.qaObjects=[];window.__living.world.root.traverse(o=>{if(o.isMesh)window.qaObjects.push({o,visible:o.visible,receive:o.receiveShadow});});});
for(const [name,x,p]of[['fixed',56,0],['near',68,12]]){
 await page.evaluate(([x,p])=>{window.__living.diag.teleport(x,0,26,90);window.__pod.pitch=p;window.__pod.lamp=true;},[x,p]);
 for(const mode of ['baseline','no-decals','no-shadows','no-silt']){
 await page.evaluate(mode=>{for(const {o,visible,receive} of window.qaObjects){const mats=Array.isArray(o.material)?o.material:[o.material];o.visible=visible&&!(mode==='no-decals'&&mats.some(m=>m.name.startsWith('living.decals')))&&!(mode==='no-silt'&&mats.some(m=>m.color?.getHexString()==='6e675a'));o.receiveShadow=mode==='no-shadows'?false:receive;mats.forEach(m=>m.needsUpdate=true);}},mode);await page.waitForTimeout(700);
 for(const film of [false,true])await siteShot(page,`${out}/${name}-${mode}-${film?'film':'live'}.png`,film);
 }
}}finally{await browser.close();}
