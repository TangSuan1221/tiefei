import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});await page.evaluate(()=>window.__abyss.materialsReady);
 const start=await page.evaluate(async()=>{const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts'),item=l.ABYSS_ITEMS.find(x=>x.id==='abyss.box.med1');r.at='camera';r.lamp=true;r.power=1;r.pilot.stop();r.heading=24;r.pitch=0;r.camPan=0;r.camTilt=0;s.world.root.updateMatrixWorld(true);const original=[-95.8,0,-81.2];s.position.set(...original);const originalClear=s.clear(s.vec());const offsets=[];for(let x=-15;x<=15;x++)for(let z=-15;z<=15;z++)offsets.push([x*.1,z*.1]);offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));let pan,tilt;
 for(const [x,z] of offsets){s.position.set(original[0]+x,0,original[2]+z);if(!s.clear(s.vec()))continue;const dx=item.position[0]-s.position.x,dz=item.position[2]-s.position.z;pan=((Math.atan2(dx,-dz)*180/Math.PI-24+540)%360-180)*Math.PI/180;tilt=Math.atan2(-item.position[1],Math.hypot(dx,dz));r.camPan=pan;r.camTilt=tilt;if(s.aim()?.id==='abyss.box.med1')break;}
 r.camPan=0;r.camTilt=0;return {original,originalClear,position:s.position.toArray(),heading:r.heading,clear:s.clear(s.vec()),pan,tilt,aim:s.aim()?.id??null};});assert(start.clear,'nearby fallback must be legal');
 await page.keyboard.press('f');
 await page.keyboard.down('ArrowLeft');await page.waitForFunction(pan=>window.__pod.camPan<=pan,start.pan,{timeout:10000});await page.keyboard.up('ArrowLeft');
 await page.keyboard.down('ArrowDown');await page.waitForFunction(tilt=>window.__pod.camTilt>=tilt,start.tilt,{timeout:10000});await page.keyboard.up('ArrowDown');
 const aimed=await page.evaluate(()=>({id:window.__abyss.aim()?.id,distance:window.__abyss.aim()?.distance,pan:window.__pod.camPan,tilt:window.__pod.camTilt}));assert.equal(aimed.id,'abyss.box.med1');
 // Recording calls the actual authored draw directly, never the station overlay.
 const recording=await page.evaluate(()=>{const s=window.__abyss;let interactionCalls=0;const original=s.drawInteraction;s.drawInteraction=function(...a){interactionCalls++;return original.apply(this,a);};const image=window.__pod.captureKeyframe();s.drawInteraction=original;return {interactionCalls,image,helpActive:s.time<s.aimHelpUntil};});assert.equal(recording.interactionCalls,0);assert(recording.helpActive);await writeFile('qa/level-03/runtime/gimbal-recording.png',Buffer.from(recording.image.split(',')[1],'base64'));delete recording.image;
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='aiming',null,{timeout:15000});
 await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>window.__pod.camPan>=-.1,null,{timeout:10000});await page.keyboard.up('ArrowRight');await page.keyboard.press('f');
 const lostTarget=await page.evaluate(()=>({hint:window.__abyss.hint,cargo:window.__abyss.cargo,phase:window.__pod.arm.phase}));assert.equal(lostTarget.cargo,null);assert.equal(lostTarget.phase,'aiming');assert(lostTarget.hint.includes('C'));
 await page.keyboard.press('c');await page.waitForFunction(()=>window.__pod.arm.phase==='stowed',null,{timeout:15000});
 const cancelled=await page.evaluate(()=>({selected:window.__abyss.selected,cargo:window.__abyss.cargo,collected:window.__abyss.snapshot().collected,sedatives:window.__abyss.story.state['pod.sedatives'],safe:window.__abyss.saveSafe}));assert.equal(cancelled.selected,null);assert.equal(cancelled.cargo,null);assert.equal(cancelled.sedatives,0);assert.deepEqual(cancelled.collected,[]);assert(cancelled.safe);
 await page.keyboard.down('ArrowLeft');await page.waitForFunction(pan=>window.__pod.camPan<=pan,start.pan,{timeout:10000});await page.keyboard.up('ArrowLeft');
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='aiming',null,{timeout:15000});await page.keyboard.press('f');await page.waitForFunction(()=>window.__abyss.cargo!==null,null,{timeout:15000});await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='stowed',null,{timeout:15000});
 const end=await page.evaluate(()=>({position:window.__abyss.position.toArray(),heading:window.__pod.heading,collected:window.__abyss.snapshot().collected,sedatives:window.__abyss.story.state['pod.sedatives']}));assert.deepEqual(end.position,start.position);assert.equal(end.heading,start.heading);assert(end.collected.includes('abyss.box.med1'));assert.equal(end.sedatives,1);
 await writeFile('qa/level-03/runtime/empty-arm-cancel.json',JSON.stringify({start,aimed,lostTarget,cancelled,recording,end,errors},null,2));console.log({start,aimed,lostTarget,cancelled,recording,end,errors});
}finally{await browser.close();}
