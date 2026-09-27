import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await browser.newPage();await p.route('**/api/**',r=>r.abort());await p.goto('http://127.0.0.1:5173/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 const result=await p.evaluate(()=>{const r=window.__pod;r.arrive();r.at='camera';const s=r.authoredSite;r.spawnThreat('cre.runner',55);s.tick(.05);if(!s.runner)return {spawn:false};const distance=s.runner.position.distanceTo(s.position),before=r.hull,states=new Set();for(let i=0;i<180;i++){s.tick(.05);states.add(s.runner?.stage);}return {spawn:true,distance,states:[...states],damage:before-r.hull,spatial:s.spatialThreat};});
 console.log(result);assert(result.spawn);assert(result.spatial);assert(result.states.includes('chase'));assert(result.states.includes('charge'));
}finally{await browser.close();}
