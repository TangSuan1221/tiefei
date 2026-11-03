import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir='qa/cabin-symmetric-crt';const {browser,page,errors}=await openLevelTwo(dir,{query:''});
try{
 await page.setViewportSize({width:1920,height:900});await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});await sit(page);await page.evaluate(async()=>{await document.fonts.ready;window.__pod.power=1;window.__pod.activeSonarEnabled=true;});await page.waitForTimeout(1500);
 await page.screenshot({path:dir+'/helm.png'});
 const geometry=await page.evaluate(()=>window.__podView.cabin.screens.filter(s=>['nav','lab'].includes(s.id)).map(s=>({id:s.id,position:s.group.position.toArray(),yaw:s.group.rotation.y,width:s.mesh.geometry.parameters.width,height:s.mesh.geometry.parameters.height})));
 for(const id of ['nav','lab']){await page.evaluate(id=>{window.__podView.cabin.deviceZoom=id;window.__pod.at=id;},id);await page.waitForTimeout(1500);await page.screenshot({path:dir+'/'+id+'.png'});}
 await writeFile(dir+'/result.json',JSON.stringify({geometry,errors},null,2));console.log(JSON.stringify({geometry,errors}));
}finally{await browser.close();}
