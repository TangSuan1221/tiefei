import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const directory='qa/level-03/near-optics';
const {page,browser,errors}=await openLevelTwo(directory,{query:'?level=3'});
const failedRequests=[];page.on('requestfailed',request=>{const u=new URL(request.url());failedRequests.push({url:u.origin+u.pathname,error:request.failure()?.errorText});});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});await page.evaluate(()=>window.__abyss.materialsReady);
 const samples=[];
 for(const name of ['baseline','metered','near-lamp','shipping','far-baseline','far-shipping']){
  samples.push(await page.evaluate(async name=>{
   const s=window.__abyss,r=window.__pod;
   s.position.set(-91,0,-85.1);r.heading=306;r.pitch=17;r.camPan=0;r.camTilt=0;r.lamp=true;r.power=1;r.pilot.stop();
   const p=s.view.profile('live');if(name==='baseline')Object.assign(p,{meter:0,whiteKnee:0,lampNearFull:2.2,lampGain:6});if(name==='metered')Object.assign(p,{meter:1,meterKey:.032,meterRange:[.15,1],whiteKnee:2.5});
   if(name==='near-lamp')Object.assign(p,{lampGain:2.5});
   if(name==='shipping')Object.assign(p,{lampGain:6,lampNearFull:5.1});
   if(name.startsWith('far-')){
    const l=await import('/src/pod/content/abyssal-lab-layout.ts');s.position.set(...l.spiralPoint(.235));r.heading=l.spiralHeading(.235);r.pitch=0;
    Object.assign(p,{lampGain:6,meter:name==='far-baseline'?0:1,whiteKnee:name==='far-baseline'?0:2.5,lampNearFull:name==='far-baseline'?2.2:5.1});
   }
   s.world.setFocus(s.position.toArray());s.world.update({time:4,collected:[],sluiceOpen:false,pressOpen:true,drainOpen:false});
   let c=document.getElementById('optics-check');if(!c){c=document.createElement('canvas');c.id='optics-check';document.body.append(c);Object.assign(c.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:999999});}c.width=1280;c.height=800;
   s.draw(c.getContext('2d'),1280,800,4,false);
   return {name,profile:{...p},meter:s.view.meterValue?.()};
  },name));
  await page.locator('#optics-check').screenshot({path:`${directory}/${name}.png`});
 }
 await writeFile(`${directory}/result.json`,JSON.stringify({diagnostic:true,method:'Same near-box camera; local profile variation only, not a playthrough',samples,errors,failedRequests},null,2));console.log({samples,errors,failedRequests});
}finally{await browser.close();}
