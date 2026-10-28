import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const results=[];
// Historical before/after benchmark is prewarm.json; this checks the shipping auto hook.
for(const warm of [true]){
const {browser,page,errors}=await openLevelTwo('qa/level-03/runtime',{query:'?level=3'});
try{await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});await page.evaluate(()=>window.__abyss.world.ready);
const result=await page.evaluate(async warm=>{
 const s=window.__abyss,r=window.__pod,{sharedExpeditionRenderer}=await import('/src/pod/view/deepsea/pod-expedition.ts'),renderer=sharedExpeditionRenderer().renderer;
 const signature=()=>JSON.stringify([s.position.toArray(),s.camera.position.toArray(),s.camera.quaternion.toArray(),r.heading,r.pitch,s.world.root.children.map(x=>x.visible),renderer.shadowMap.enabled,renderer.toneMapping,renderer.getRenderTarget()?.uuid]);
 const before=signature();let warmMs=0;
 if(warm){const t=performance.now();await s.materialsReady;warmMs=performance.now()-t;}
 const restored=signature()===before;
 r.lamp=true;r.power=1;r.pilot.stop();s.position.set(20,-4,10);r.heading=296.565;r.pitch=0;r.camPan=0;r.camTilt=0;s.world.setFocus([20,-4,10]);
 const c=document.createElement('canvas');c.width=1280;c.height=800;const samples=[];for(let i=0;i<8;i++){const t=performance.now();s.draw(c.getContext('2d'),1280,800,4,true);renderer.getContext().finish();samples.push(performance.now()-t);}
 return {warm,warmMs,restored,samples,programs:renderer.info.programs.length};
},warm);results.push({...result,errors});console.log(results.at(-1));}finally{await browser.close();}}
await writeFile('qa/level-03/runtime/prewarm-auto.json',JSON.stringify(results,null,2));
