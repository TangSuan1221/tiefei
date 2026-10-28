import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/round10-valve';
const {browser,page}=await openLevelTwo(out);
try {
 await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
 const results=[];
 for(const [label,x,h,pitch] of [['near',157,150,30],['fixed',144,90,0]]) {
  await page.evaluate(({x,h,pitch})=>{if(!window.__living.diag.teleport(x,0,60,h))throw Error('blocked pose');window.__pod.lamp=true;window.__pod.pitch=pitch;},{x,h,pitch});
  for(const enabled of [false,true]) {
   const stats=await page.evaluate(enabled=>{const w=window.__living,root=w.world.root,a=root.getObjectByName('living-valve-r10-glb'),b=root.getObjectByName('living-valve-r10-fallback');if(!a||!b)throw Error('missing valve');a.visible=enabled;b.visible=!enabled;const count=o=>{let meshes=0,triangles=0;o.traverseVisible(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position?.count??0)/3;}});return {meshes,triangles};};return {enabled,asset:count(enabled?a:b),scene:count(root),profile:w.view.profile('live')};},enabled);
   await page.waitForTimeout(500);for(const film of [false,true])await siteShot(page,`${out}/${label}-${enabled?'after':'before'}-${film?'film':'live'}.png`,film);
   results.push({label,...stats});
  }
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
