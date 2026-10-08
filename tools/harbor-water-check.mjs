import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='qa/harbor/art-2026-10-05/water-regression';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await browser.newPage();await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 const result=await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.walkTo('camera');r.power=1;r.lamp=true;const s=r.authoredSite;s.position.set(60,0,27);r.heading=0;r.camPan=r.camTilt=r.pitch=0;const c=document.createElement('canvas');c.width=1280;c.height=800;for(let i=0;i<3;i++)s.draw(c.getContext('2d'),1280,800,r.clock,true);const b=s.base;return{sameDepthAttachment:b.water.pass.uniforms.tDepth.value===b.ao.normalRenderTarget.depthTexture,shadowReady:b.water.pass.uniforms.shadowReady.value.toArray(),hardwareDepthComparison:b.harborKeys.every(k=>k.shadow.map.depthTexture.compareFunction!==null),image:c.toDataURL()};});
 assert.equal(result.sameDepthAttachment,true,'ShaderPass must sample the actual render target attachment');assert.deepEqual(result.shadowReady,[1,1]);assert.equal(result.hardwareDepthComparison,true);
 await writeFile(`${dir}/normal.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;await writeFile(`${dir}/results.json`,JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
