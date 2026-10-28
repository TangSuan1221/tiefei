import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts');r.pilot.stop();r.lamp=true;s.analyzed=['L3-E04','L3-E06','L3-E09']; // Diagnostic framing prerequisites; never counted as a playthrough.
  const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');const frames=[];
  for(const p of l.ABYSS_PHOTO_STATIONS){s.position.set(...p.position);r.heading=p.heading;r.pitch=-p.pitch;r.camPan=0;r.camTilt=0;s.tick(.01);s.world.root.updateMatrixWorld(true);s.draw(ctx,1280,720,0,true);frames.push({id:p.id,accepted:s.captureEvidence().shotId,image:c.toDataURL('image/png')});}
  const item=l.ABYSS_ITEMS[0],a=item.face*Math.PI/180;s.position.set(item.position[0]+Math.sin(a)*3.6,0,item.position[2]-Math.cos(a)*3.6);r.heading=(item.face+180)%360;r.pitch=-Math.atan2(item.position[1],3.6)*180/Math.PI;r.camTilt=0;s.world.root.updateMatrixWorld(true);
  const aim=s.aim();const items=l.ABYSS_ITEMS.map(item=>{const a=item.face*Math.PI/180;let best=null;for(const d of [3.2,3.4,3.6,3.8,4.0]){s.position.set(item.position[0]+Math.sin(a)*d,item.position[1]+1.2,item.position[2]-Math.cos(a)*d);r.heading=(item.face+180)%360;r.pitch=-Math.atan2(-1.2,d)*180/Math.PI;s.world.root.updateMatrixWorld(true);const hit=s.aim();best={id:item.id,clear:s.clear(s.position.toArray()),park:s.position.toArray(),hit:hit?.id??null,distance:hit?.distance};if(best.clear&&best.hit===item.id)break;}return best;});return {frames,items,aim:aim?{id:aim.id,distance:aim.distance}:null};
 });
 for(const frame of result.frames){await writeFile(`qa/level-03/runtime/${frame.id}.png`,Buffer.from(frame.image.split(',')[1],'base64'));delete frame.image;}
 await writeFile('qa/level-03/runtime/framing.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));assert.equal(result.aim?.id,'abyss.box.serviceQ');for(const item of result.items){assert(item.clear,item.id+' hull');assert.equal(item.hit,item.id);}
}finally{await browser.close();}







