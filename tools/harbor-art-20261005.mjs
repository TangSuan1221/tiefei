import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=process.env.HARBOR_ART_DIR||'qa/harbor/art-2026-10-05/final';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});
 await page.waitForFunction(()=>window.__pod.authoredSite.visual.root.getObjectByName('rescue-blender-service-modules')?.userData.loaded,{},{timeout:60000});
 await page.waitForFunction(()=>{const maps=[];window.__pod.authoredSite.base.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const key of ['map','normalMap','roughnessMap']){const t=m[key];if(t?.userData.scan)maps.push(t);}});return maps.length>0&&maps.every(t=>t.userData.ready);},{},{timeout:60000});
 await page.waitForFunction(()=>window.__pod.authoredSite.visual.root.getObjectByName('rescue-blender-control-pod')?.userData.loaded,{},{timeout:60000});
 await page.waitForFunction(()=>window.__pod.authoredSite.visual.root.getObjectByName('rescue-blender-power-cabinet')?.userData.loaded,{},{timeout:60000});
 const views=[['entry',[11,0,10],180],['maintenance',[11,0,40],90],['arrival',[34,0,35],35],['observe',[60,0,27],0],['lure',[78,0,26],0],['power',[42,0,28],45],['deep-shaft',[60,0,31],0,28],['layout-overview',[60,8,35],0,22]];
 const stats=[];
 for(const [name,position,heading,pitch=0] of views){
  const result=await page.evaluate(({position,heading,pitch})=>{
   const r=window.__pod,s=r.authoredSite;s.position.set(...position);r.heading=heading;r.pitch=pitch;r.camPan=r.camTilt=0;s.tick(.01);
   const c=document.createElement('canvas');c.width=1600;c.height=1000;const ctx=c.getContext('2d');
   const renderer=s.base.resources.renderer;renderer.info.autoReset=false;renderer.info.reset();
   const start=performance.now();s.draw(ctx,c.width,c.height,r.clock,true);renderer.getContext().finish();
   const ms=performance.now()-start;const info={...renderer.info.render};renderer.info.autoReset=true;
   const warmed=[];for(let i=0;i<3;i++){const t=performance.now();s.draw(ctx,c.width,c.height,r.clock,true);renderer.getContext().finish();warmed.push(performance.now()-t);}
   return{image:c.toDataURL(),milliseconds:ms,warmedMilliseconds:warmed,info,blenderLoaded:!!s.visual.root.getObjectByName('rescue-blender-service-modules')?.userData.loaded};
  },{position,heading,pitch});
  await writeFile(`${dir}/${name}.png`,Buffer.from(result.image.split(',')[1],'base64'));stats.push({name,...result,image:undefined});
 }
 // Capture normal live observation separately: creature concealment is preserved.
 const live=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;s.position.set(60,0,27);r.heading=r.pitch=r.camPan=r.camTilt=0;const c=document.createElement('canvas');c.width=1600;c.height=1000;s.draw(c.getContext('2d'),1600,1000,r.clock,false);return{image:c.toDataURL(),monsterVisible:s.visual.monster.visible};});
 assert.equal(live.monsterVisible,false);await writeFile(`${dir}/observe-live.png`,Buffer.from(live.image.split(',')[1],'base64'));
 // Export the authored rescue layer for an editable Blender handoff, not a replacement collider.
 const exported=await page.evaluate(async()=>{
  const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const {CanvasTexture}=await import('/node_modules/three/build/three.module.js');
  const s=window.__pod.authoredSite,copy=s.visual.root.clone(true),converted=new Map(),materials=[],materialCache=new Map();
  copy.traverse(o=>{if(!o.isMesh)return;const convert=m=>{if(materialCache.has(m))return materialCache.get(m);const c=m.clone();materials.push(c);materialCache.set(m,c);for(const [key,t] of Object.entries(c)){if(!t?.isDataTexture)continue;if(!converted.has(t)){const canvas=document.createElement('canvas');canvas.width=t.image.width;canvas.height=t.image.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.image.data),canvas.width,canvas.height),0,0);const tx=new CanvasTexture(canvas);tx.colorSpace=t.colorSpace;tx.wrapS=t.wrapS;tx.wrapT=t.wrapT;tx.repeat.copy(t.repeat);converted.set(t,tx);}c[key]=converted.get(t);}return c;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
  const bytes=new Uint8Array(await new GLTFExporter().parseAsync(copy,{binary:true,onlyVisible:false}));
  for(const m of materials)m.dispose();for(const t of converted.values())t.dispose();
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);
 });
 await mkdir('assets/blender',{recursive:true});await writeFile('assets/blender/rescue-harbor-layout.glb',Buffer.from(exported,'base64'));
 assert.deepEqual(errors,[]);await writeFile(`${dir}/results.json`,JSON.stringify({method:'Diagnostic fixed camera positions, actual main-game renderer; finish() timing includes GPU stall and is not player FPS. Recording frames show the existing recorded-only creature.',errors,stats,liveMonsterHidden:true},null,2));
 // Unlabelled old/new pairs for an independent preference comparison; key kept separate.
 const comparison=await browser.newPage({viewport:{width:1600,height:530}});
 for(const [name,reverse] of [['observe',true],['power',false],['lure',true]]){
  const old=(await readFile(`qa/harbor/art-2026-10-05/${name}.png`)).toString('base64'),current=(await readFile(`${dir}/${name}.png`)).toString('base64');
  const pair=reverse?[current,old]:[old,current];
  await comparison.setContent(`<style>body{margin:0;background:#111;color:#ccc;font:16px sans-serif}main{display:flex}figure{margin:0;width:800px}img{width:800px;height:500px}figcaption{padding:4px}</style><main>${pair.map((src,i)=>`<figure><img src="data:image/png;base64,${src}"><figcaption>${i?'B':'A'}</figcaption></figure>`).join('')}</main>`);
  await comparison.screenshot({path:`${dir}/pair-${name}.png`});
 }
 await writeFile(`${dir}/comparison-key.json`,JSON.stringify({observe:{A:'current',B:'baseline'},power:{A:'baseline',B:'current'},lure:{A:'current',B:'baseline'}},null,2));
 console.log(JSON.stringify({errors,stats,liveMonsterHidden:true},null,2));
}finally{await browser.close();}




