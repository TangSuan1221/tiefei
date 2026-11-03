import {openLevelTwo,sit} from './living-browser-lib.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const dir=process.env.HELM_REVIEW_DIR??'qa/helm-reference-review';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
const failedRequests=[];page.on('requestfailed',request=>{const url=new URL(request.url());failedRequests.push({url:url.origin+url.pathname,failure:request.failure()?.errorText});});
try {
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});
 // Diagnostic-only bypass of the separately developed onboarding sequence.
 // Its new start already seats the operator at navigation, so walking-to-seat is invalid.
 const prologueBypassed=await page.evaluate(()=>{const p=window.__pod.prologue;if(p?.active){p.step=999;return true;}return false;});
 if(await page.evaluate(()=>!!window.__pod.at))await page.evaluate(()=>window.__pod.walkTo('camera'));else await sit(page);
 await page.evaluate(async()=>{await document.fonts.ready;window.__pod.power=1;});await page.waitForTimeout(2000);
 await page.waitForFunction(()=>{const maps=[];window.__podView.cabin.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.map?.userData.helmAuthoredAlbedo)maps.push(m.map);});return maps.every(m=>m.userData.loadState==='loaded'||m.userData.loadState==='error');},null,{timeout:30000});
 await page.screenshot({path:dir+'/helm.png'});
 await page.evaluate(()=>{const c=window.__podView.cabin;c.deviceZoom=null;c.manualLook=true;c.yaw=0;c.pitch=-.60;});await page.waitForTimeout(1400);
 await page.screenshot({path:dir+'/panel.png'});
 const probe=()=>page.evaluate(()=>{
  const c=window.__podView.cabin,found={};
  c.scene.traverse(o=>{let ancestor=o;while(ancestor&&!ancestor.userData.control)ancestor=ancestor.parent;if(!ancestor)return;const id=ancestor.userData.control;if(!/^(helm\.|camera\.|arm\.|drive\.|nav\.pitch)/.test(id)||found[id]?.hit)return;const p=o.getWorldPosition(c.camera.position.clone()).project(c.camera),x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;let picked=null;
   search:for(const dy of [0,-4,4,-12,12])for(const dx of [0,-4,4,-12,12]){const hit=window.__podView.pick(x+dx,y+dy);if(hit?.endsWith(':'+id)){picked={x:x+dx,y:y+dy,hit};break search;}}if(!found[id]||picked)found[id]=picked??{x,y,hit:null};
  });const authoredTextures=[];c.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.map?.userData.helmAuthoredAlbedo)authoredTextures.push({name:o.name,state:m.map.userData.loadState});});return {controls:found,render:c.renderer.info.render,memory:c.renderer.info.memory,authoredTextures};
 });
 const diagnostics=await probe();
 const shadow=await page.evaluate(async()=>{const c=window.__podView.cabin,run=window.__pod,snap=()=>({at:c.helmShadowAt,pose:{...c.helmShadowPose},gear:run.throttle}),delay=()=>new Promise(r=>setTimeout(r,200));const before=snap();await delay();const still=snap();c.helmInput.yaw=.5;await delay();const turned=snap();c.helmInput.yaw=0;await delay();const restored=snap(),originalGear=run.throttle;run.throttle=originalGear===1?2:1;await delay();const gearChanged=snap();run.throttle=originalGear;await delay();return {before,still,turned,restored,gearChanged,gearRestored:snap()};});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(600);
 const compact=await probe();await page.screenshot({path:dir+'/panel-1440.png'});
 await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(600);
 await writeFile(dir+'/diagnostics.json',JSON.stringify({errors,failedRequests,...diagnostics,shadow,compact,prologueBypassed},null,2));
}finally{await browser.close();}
