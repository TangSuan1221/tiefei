import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/round12-forced';const {browser,page}=await openLevelTwo(out);
try{
await page.route('**/src/pod/view/deepsea/living-render.ts*',async route=>{
 const response=await route.fetch();let body=await response.text();
 for(const token of ['const x = ranked[i];','!x || x.d > 40','keySource[i] = s;'])if(!body.includes(token))throw Error('QA hook missing: '+token);
 body=body.replace('const x = ranked[i];','const qaForced = !!globalThis.__qaFarEnabled; const x = qaForced ? {s:i===0?globalThis.__qaGroundSource:globalThis.__qaFarSource,d:i===0?19:47} : ranked[i];');
 body=body.replace('!x || x.d > 40','!x || (!qaForced && x.d > 40)');
 body=body.replace('keySource[i] = s;','keySource[i] = s; (globalThis.__qaKeySlots ??= [])[i]={position:[...s.position],rated:s.intensity,actual:k.intensity,range:s.range,forced:!!qaForced};');
 await route.fulfill({response,body,contentType:'application/javascript'});
});await page.reload();await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
await page.evaluate(()=>{const source=window.__living.world.moodLights.find(l=>l.position[0]===154&&l.position[1]===8.2);window.__qaGroundSource=window.__living.world.moodLights.find(l=>l.position[0]===163&&l.position[1]===3);const d=[8,-3,7],len=Math.hypot(...d);window.__qaFarSource={...source,position:[191,3,57],dir:d.map(v=>v/len)};});
const result=[];
for(const [name,x] of [['fixed',144],['approach',151]]){
 await page.evaluate(x=>{if(!window.__living.diag.teleport(x,0,60,90))throw Error('blocked');window.__pod.pitch=0;window.__pod.lamp=true;},x);
 for(const enabled of [false,true]){
  await page.evaluate(v=>window.__qaFarEnabled=v,enabled);await page.waitForTimeout(700);
  for(const film of [false,true]){await siteShot(page,`${out}/${name}-${enabled?'forced':'original'}-${film?'film':'live'}.png`,film);result.push(await page.evaluate(({name,enabled,film})=>({name,enabled,film,slots:window.__qaKeySlots,profile:window.__living.view.profile(film?'recording':'live')}),{name,enabled,film}));}
 }
}writeFileSync(`${out}/slots.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
