import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/video/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();r.at='camera';r.footageSink=null;
  const s=r.authoredSite,failures=[],routes=[];
  // Connectivity fixture opens doors but never disables physical collision.
  s.state.opened.push(...s.level.edges.map(e=>e.id));s.epoch=100;s.world.update(s.state,100);
  for(const e of s.level.edges){
   const a=s.level.rooms.find(x=>x.id===e.from),b=s.level.rooms.find(x=>x.id===e.to);
   const path=[[a.x,a.elevation,a.z],...e.path,[b.x,b.elevation,b.z]];
   s.position.set(...path[0]);let ok=true;
   for(let j=1;j<path.length;j++){
    const p=path[j],dx=p[0]-s.position.x,dy=p[1]-s.position.y,dz=p[2]-s.position.z;
    const distance=Math.hypot(dx,dy,dz);r.heading=Math.atan2(dx,-dz)*180/Math.PI;r.pitch=-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI;
    if(!s.move(distance)){failures.push({edge:e.id,segment:j,at:s.position.toArray(),target:p});ok=false;break;}
   }
   routes.push({edge:e.id,ok});
  }
  return{routes,failures,method:'Door-unlocked physical movement probes, room centres via authored paths; not unassisted playthrough'};
 });
 await mkdir('qa/harbor',{recursive:true});await writeFile('qa/harbor/drive.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));assert.equal(result.failures.length,0);
}finally{await browser.close();}
