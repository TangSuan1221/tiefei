import {openLevelTwo,sit} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir=process.env.HELM_PROFILE_DIR??'qa/helm-reference-review/shadow-profile';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
try {
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});await sit(page);
 const result=await page.evaluate(async()=>{const c=window.__podView.cabin,rows=[],render=c.renderer.render.bind(c.renderer);c.manualLook=true;c.yaw=0;c.pitch=-.60;c.renderer.render=(scene,camera)=>{const shadow=!!c.helmTaskLight?.shadow.needsUpdate,start=performance.now();render(scene,camera);rows.push({shadow,ms:performance.now()-start,calls:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles});};const delay=ms=>new Promise(r=>setTimeout(r,ms));await delay(500);rows.length=0;await delay(700);const stationary=rows.splice(0);for(let i=0;i<12;i++){c.helmInput.yaw=Math.sin(i*.7)*.7;await delay(85);}const moving=rows.splice(0);c.helmInput.yaw=0;await delay(200);return {stationary,moving,note:'CPU submission wall time only; not GPU timer, FPS benchmark or isolated model cost.'};});
 await writeFile(dir+'/profile.json',JSON.stringify({errors,...result},null,2));console.log(JSON.stringify({errors,stationary:result.stationary,moving:result.moving}));
} finally {await browser.close();}
