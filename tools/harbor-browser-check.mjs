import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const dir=process.env.HARBOR_QA_DIR||'qa/harbor/pass-2';await mkdir(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/video/**',route=>route.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 // Diagnostic scene placement; not claimed as an unassisted playthrough.
 const snapshot=await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.walkTo('camera');r.lamp=true;return r.authoredSite.snapshot();});
 assert.equal(snapshot.levelId,'harbor.1');assert.equal(snapshot.rooms,9);
 await page.waitForTimeout(2200);await page.screenshot({path:`${dir}/entry.png`});
 const probes=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;
  return [...s.world.interactables].map(([id,obj])=>({id,tag:obj.userData.interactionId,position:obj.position.toArray(),approach:obj.userData.approach}));
 });
 for(const p of probes)assert.equal(p.id,p.tag,'all interactables tagged');
 await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite,a=s.world.anchors.find(a=>a.room==='harbor.room.B');s.position.set(...a.view);r.heading=-a.yaw*180/Math.PI;r.pitch=-a.pitch*180/Math.PI;r.camPan=r.camTilt=0;});
 await page.waitForTimeout(1000);await page.screenshot({path:`${dir}/harbor.png`});
 const capture=await page.evaluate(async()=>{const T=await import('/node_modules/.vite/deps/three.js');const r=window.__pod,s=r.authoredSite;const c=document.createElement('canvas');c.width=1024;c.height=640;s.draw(c.getContext('2d'),1024,640,r.clock);const hero=s.world.root.getObjectByName('harbor.asset.rescue-pod'),center=new T.Box3().setFromObject(hero).getCenter(new T.Vector3());const ray=new T.Raycaster(s.position,center.clone().sub(s.position).normalize());return {frame:c.toDataURL(),evidence:s.captureEvidence(),center:center.toArray(),projected:center.clone().project(s.camera).toArray(),hits:ray.intersectObject(s.world.root,true).slice(0,4).map(h=>[h.object.name,h.object.parent?.name,h.distance]),snapshot:s.snapshot()};});
 await writeFile(`${dir}/harbor-feed.png`,Buffer.from(capture.frame.split(',')[1],'base64'));
 await writeFile(`${dir}/diagnostic.json`,JSON.stringify({snapshot,probes,evidence:capture.evidence,center:capture.center,projected:capture.projected,hits:capture.hits,errors},null,2));
 for(let i=0;i<9;i++){
  const frame=await page.evaluate(i=>{const r=window.__pod,s=r.authoredSite,a=s.world.anchors[i];s.position.set(...a.view);r.heading=-a.yaw*180/Math.PI;r.pitch=-a.pitch*180/Math.PI;r.camPan=r.camTilt=0;const c=document.createElement('canvas');c.width=1024;c.height=640;s.draw(c.getContext('2d'),1024,640,r.clock);return c.toDataURL();},i);
  await writeFile(`${dir}/poi-${i+1}.png`,Buffer.from(frame.split(',')[1],'base64'));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({snapshot,evidence:capture.evidence,errors}));
}finally{await browser.close();}
