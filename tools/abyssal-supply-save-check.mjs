import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 await page.evaluate(async()=>{const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts'),item=l.ABYSS_ITEMS.find(x=>x.id==='abyss.box.serviceQ'),a=item.face*Math.PI/180;r.at='camera';r.lamp=true;r.power=1;r.pilot.stop();s.position.set(item.position[0]+Math.sin(a)*3.6,0,item.position[2]-Math.cos(a)*3.6);r.heading=(item.face+180)%360;r.pitch=-Math.atan2(item.position[1],3.6)*180/Math.PI;r.camTilt=0;s.world.root.updateMatrixWorld(true);});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='aiming',null,{timeout:15000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__abyss.cargo!==null,null,{timeout:15000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='stowed',null,{timeout:15000});
 const result=await page.evaluate(async()=>{const s=window.__abyss,r=window.__pod,m=await import('/src/pod/sim/abyssal-save.ts');const stockBefore=JSON.stringify([...r.stock]);const before=s.snapshot();const save=m.captureAbyssalSave(r);if(!save)return {error:'capture refused',before};m.writeAbyssalSave(localStorage,save);const read=m.readAbyssalSave(localStorage);s.position.y+=1;s.collected=[];const restored=m.restoreAbyssalSave(r,read);const stockRestored=JSON.stringify([...r.stock]);s.cargo='abyss.box.serviceQ';const duplicate=s.armEvent('stowed');const stockAfter=JSON.stringify([...r.stock]);return {stockBefore,stockRestored,stockAfter,duplicate,restored,collected:s.snapshot().collected,sedatives:s.story.state['pod.sedatives'],matches:JSON.stringify(s.snapshot().position)===JSON.stringify(before.position),saveSize:JSON.stringify(save).length};});
 await writeFile('qa/level-03/runtime/supply-save.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));assert(result.restored);assert(result.matches);assert(result.collected.includes('abyss.box.serviceQ'));assert.equal(result.sedatives,0);assert.equal(result.stockBefore,result.stockRestored);assert.equal(result.stockBefore,result.stockAfter);assert.equal(result.duplicate,false);
}finally{await browser.close();}

