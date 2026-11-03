import {openLevelTwo,sit} from '../../tools/living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir='qa/helm-reference-review/middle-response-debug';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
try {
 await page.setViewportSize({width:1920,height:1080});await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});
 await page.evaluate(()=>{if(window.__pod.prologue?.active)window.__pod.prologue.step=999;});
 if(await page.evaluate(()=>!!window.__pod.at))await page.evaluate(()=>window.__pod.walkTo('camera'));else await sit(page);
 await page.evaluate(()=>{window.__pod.power=1;const c=window.__podView.cabin;c.deviceZoom=null;c.manualLook=true;c.yaw=0;c.pitch=-.60;});
 await page.waitForTimeout(1800);
 const diagnostic=await page.evaluate(async()=>{
  const c=window.__podView.cabin,panel=c.scene.getObjectByName('helm-reference-panel');
  const meshes=panel.children.filter(o=>o.material?.name==='helm-authored-painted-steel');
  window.__middleDiagnostic=meshes.find(o=>Math.abs(o.position.x-.1405)<.01);window.__middleOriginal=window.__middleDiagnostic.material;
  window.__debugThree=await import('/node_modules/three/build/three.module.js');
  return meshes.map(o=>{const m=o.material,t=m.map;t.updateMatrix();return {position:o.position.toArray(),color:m.color.toArray(),metalness:m.metalness,roughness:m.roughness,env:m.envMapIntensity,map:{src:t.image?.src,width:t.image?.width,matrix:t.matrix.elements,repeat:t.repeat.toArray(),center:t.center.toArray(),offset:t.offset.toArray(),loaded:t.userData}};});
 });
 await page.screenshot({path:dir+'/original.png'});
 for(const variant of ['basic','no-environment','diffuse-only','diffuse-restored']){
  await page.evaluate(variant=>{
   const mesh=window.__middleDiagnostic,original=window.__middleOriginal,T=window.__debugThree;
   if(variant==='basic'){mesh.material=new T.MeshBasicMaterial({map:original.map,color:0xffffff});return;}
   const m=original.clone();m.onBeforeCompile=original.onBeforeCompile;m.customProgramCacheKey=original.customProgramCacheKey;
   m.envMapIntensity=0;
   if(variant!=='no-environment'){
    m.metalness=0;m.roughness=.9;m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=>variant;
   }
   if(variant==='diffuse-restored')m.color.multiplyScalar(2.3);
   mesh.material=m;
  },variant);
  await page.waitForTimeout(500);await page.screenshot({path:dir+'/'+variant+'.png'});
 }
 await writeFile(dir+'/diagnostics.json',JSON.stringify({materials:diagnostic,errors},null,2));console.log(JSON.stringify({dir,diagnostic,errors}));
}finally{await browser.close();}
