import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/harbor/art-2026-10-05/light-study';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:5174/');
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});
 await page.waitForFunction(()=>['rescue-blender-service-modules','rescue-blender-control-pod','rescue-blender-power-cabinet'].every(n=>window.__pod.authoredSite.visual.root.getObjectByName(n)?.userData.loaded),{},{timeout:60000});
 await page.waitForFunction(()=>{let ready=true;window.__pod.authoredSite.base.scene.traverse(o=>{for(const m of o.isMesh?(Array.isArray(o.material)?o.material:[o.material]):[])for(const k of ['map','normalMap','roughnessMap'])if(m[k]?.userData.scan&&!m[k].userData.ready)ready=false;});return ready;},{},{timeout:60000});
 for(const [label,env] of [['a',.09],['b',.20]])for(const [name,p,pitch]of [['observe',[60,0,27],0],['overview',[60,8,35],22]]){
  const data=await page.evaluate(({p,pitch,env})=>{
   const r=window.__pod,s=r.authoredSite;r.heading=r.camPan=r.camTilt=0;r.pitch=pitch;s.position.set(...p);s.tick(.01);s.base.scene.environmentIntensity=env;
   const c=document.createElement('canvas');c.width=1600;c.height=1000;const ctx=c.getContext('2d');for(let i=0;i<3;i++)s.draw(ctx,1600,1000,r.clock,true);return c.toDataURL();
  },{p,pitch,env});await writeFile(`${dir}/${name}-${label}.png`,Buffer.from(data.split(',')[1],'base64'));
 }
 console.log(dir);
}finally{await browser.close();}
