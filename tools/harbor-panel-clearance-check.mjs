import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod?.authoredSite);
 const result=await page.evaluate(async()=>{
  const {harborHullClear}=await import('/src/pod/sim/harbor-navigation.ts');const T=await import('/node_modules/.vite/deps/three.js');const s=window.__pod.authoredSite;
  const rows=[];s.world.root.updateMatrixWorld(true);
  for(const [name,x,z]of [['observe',60,27],['power',42,28],['lure',78,26]])for(const dx of [-.15,0,.15])for(const dz of [-.15,0,.15]){
   const position=new T.Vector3(x+dx,0,z+dz);let blocked=null;
   for(let heading=0;heading<=50;heading+=.5)if(!harborHullClear(position,heading,s.world.walkable,s.world.colliders)){blocked=heading;break;}
   const ray=new T.Raycaster(position,new T.Vector3(Math.SQRT1_2,0,-Math.SQRT1_2),0,8);
   const hit=ray.intersectObject(s.world.root,true).find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object.isMesh;});let o=hit?.object,id='';while(o){id=id||o.userData.interactionId;o=o.parent;}
   rows.push({name,dx,dz,blocked,id,distance:hit?.distance,reachable:blocked===null&&id==='harbor.rescue.'+name&&hit.distance<=3.4});
  }return {method:'Read-only hull sweep and actual visible mesh ray; ±0.15 m approach drift, 0–50° yaw in 0.5° steps',rows,passed:rows.every(r=>r.reachable)};
 });await mkdir('qa/harbor/player-playthrough',{recursive:true});await writeFile('qa/harbor/player-playthrough/panel-clearance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert(result.passed,'Panel approach lacks swept clearance or F reach');
}finally{await browser.close();}
