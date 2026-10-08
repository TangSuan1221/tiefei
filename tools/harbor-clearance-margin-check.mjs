import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod?.authoredSite);
 const report=await page.evaluate(async()=>{
  const {harborHullClear}=await import('/src/pod/sim/harbor-navigation.ts');
  const {Vector3}=await import('/node_modules/.vite/deps/three.js');
  const site=window.__pod.authoredSite,world=site.world;
  const paths=site.base.level.edges.filter(e=>['harbor.edge.A-C','harbor.edge.C-B'].includes(e.id)).map(e=>({id:e.id,path:e.path}));
  paths.push({id:'B south working lane',path:[[32,0,35],[60,0,35],[60,0,32],[42,0,32],[78,0,32]]});
  const results=[];let samples=0;
  for(const {id,path} of paths){const failures=[];
   for(let i=1;i<path.length;i++){
    const a=new Vector3(...path[i-1]),b=new Vector3(...path[i]),d=b.clone().sub(a),heading=Math.atan2(d.x,-d.z)*180/Math.PI;
    const right=new Vector3(-d.z,0,d.x).normalize(),steps=Math.ceil(a.distanceTo(b)/.2);
    for(const offset of [-.6,0,.6])for(let j=0;j<=steps;j++)for(const reverse of [0,180]){
     const p=a.clone().lerp(b,j/steps).addScaledVector(right,offset);samples++;
     if(!harborHullClear(p,heading+reverse,world.walkable,world.colliders)&&failures.length<12)failures.push({position:p.toArray(),offset,heading:heading+reverse});
    }
   }
   results.push({id,passed:failures.length===0,failures});
  }
  return {passed:results.every(r=>r.passed),hullMetres:[2.8,5,3],lateralMarginMetres:.6,samples,doorState:'Static environment only; operable door leaves excluded',scope:'Actual formal world including rescue solids. Geometry audit, not a keyboard playthrough.',results};
 });
 await mkdir('qa/harbor/clearance-margin',{recursive:true});await writeFile('qa/harbor/clearance-margin/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(report.passed,true);
}finally{await browser.close();}
