import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=process.env.HARBOR_ART_DIR||'qa/harbor/visual-iteration';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.lamp=true;r.heading=90;r.walkTo('camera');});
 await page.waitForFunction(()=>window.__cabinPose?.().seatEye[2]<-.40,{},{timeout:60000});
 await page.screenshot({path:`${dir}/driver.png`});
 const views=[['airlock',[11,0,10],90],['airlock-oblique',[14,0,6],115],['airlock-side',[15,0,10],180],['curve-ac',[11,0,21],155],['curve-eg',[90,-8,63],110]];
 for(const [name,position,heading] of views){
  for(const lit of [true,false]){
   const frame=await page.evaluate(({position,heading,lit})=>{const r=window.__pod,s=r.authoredSite;s.position.set(...position);r.heading=heading;r.pitch=0;r.camPan=r.camTilt=0;r.lamp=lit;const c=document.createElement('canvas');c.width=1280;c.height=800;s.draw(c.getContext('2d'),1280,800,r.clock);return c.toDataURL();},{position,heading,lit});
   await writeFile(`${dir}/${name}-${lit?'on':'off'}.png`,Buffer.from(frame.split(',')[1],'base64'));
  }
 }
 const ids=['harbor.item.tools','harbor.item.cargo-near','harbor.item.cargo-deep'];
 for(const id of ids){
  const frame=await page.evaluate(id=>{const r=window.__pod,s=r.authoredSite,o=s.world.interactables.get(id);s.position.set(...o.userData.approach);r.heading=o.userData.approachYaw;r.pitch=0;r.camPan=r.camTilt=0;r.lamp=true;const c=document.createElement('canvas');c.width=1280;c.height=800;s.draw(c.getContext('2d'),1280,800,r.clock);return c.toDataURL();},id);
  await writeFile(`${dir}/${id}.png`,Buffer.from(frame.split(',')[1],'base64'));
 }
 for(let i=0;i<9;i++){
  const frame=await page.evaluate(i=>{const r=window.__pod,s=r.authoredSite,a=s.world.anchors[i];s.position.set(...a.view);r.heading=-a.yaw*180/Math.PI;r.pitch=-a.pitch*180/Math.PI;r.camPan=r.camTilt=0;r.lamp=true;const c=document.createElement('canvas');c.width=1280;c.height=800;s.draw(c.getContext('2d'),1280,800,r.clock);return c.toDataURL();},i);
  await writeFile(`${dir}/room-${String.fromCharCode(65+i)}.png`,Buffer.from(frame.split(',')[1],'base64'));
 }
 const doors=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite,id='harbor.edge.A-B',door=s.world.doors.get(id),before=door.mesh.position.y;s.state.opened.push(id);for(let i=1;i<=40;i++)s.world.update(s.state,r.clock+i*.05);return {before,after:door.mesh.position.y};});
 assert.ok(doors.after-doors.before>6.5,'powered gate clears passage when opened');
 assert.deepEqual(errors,[]);await writeFile(`${dir}/results.json`,JSON.stringify({errors,doors,diagnosticPlacement:true},null,2));
 console.log(`PASS captured actual game renderer to ${dir}`);
}finally{await browser.close();}
