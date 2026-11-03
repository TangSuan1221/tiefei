import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir='qa/helm-three-zones';const {browser,page,errors}=await openLevelTwo(dir,{query:''});
try{
 await page.setViewportSize({width:1920,height:900});await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});await sit(page);await page.evaluate(async()=>{await document.fonts.ready;window.__pod.power=1;window.__pod.activeSonarEnabled=true;});await page.waitForTimeout(1500);
 await page.screenshot({path:dir+'/helm.png'});
 await page.evaluate(()=>{const c=window.__podView.cabin;c.deviceZoom=null;c.manualLook=true;c.yaw=0;c.pitch=-.60;});await page.waitForTimeout(1500);
 await page.screenshot({path:dir+'/panel.png'});
 console.log(JSON.stringify({errors}));

}finally{await browser.close();}
