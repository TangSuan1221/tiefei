import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/harbor/elias-skin';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.walkTo('camera');r.lamp=true;});
 await page.waitForFunction(()=>window.__pod?.authoredSite?.visual?.elias?.userData.skinStatus==='ready',{},{timeout:90000});
 const results=[];
 for(const beat of ['watching','trust_wave','palm_stay','hidden','walking','glance_back']){
 const result=await page.evaluate(async beat=>{const T=await import('/node_modules/.vite/deps/three.js');const r=window.__pod,s=r.authoredSite;r.lamp=true;r.heading=0;r.pitch=0;r.camPan=r.camTilt=0;s.position.set(57,.0,15.5);s.visual.update({powered:true,gateOpen:false,bridgeExtended:false,eliasPosition:[57,-1.2,11],eliasBeat:beat,walking:beat==='walking'||beat==='glance_back',monsterVisible:false},performance.now()/1000+10);const c=document.createElement('canvas');c.width=1000;c.height=800;s.base.draw(c.getContext('2d'),1000,800,r.clock,true);const skin=s.visual.elias.getObjectByName('harbor-elias-blender-skin');return {frame:c.toDataURL(),status:s.visual.elias.userData.skinStatus,bounds:new T.Box3().setFromObject(skin).getSize(new T.Vector3()).toArray(),bones:[]};},beat);
 await writeFile(`${dir}/${beat}.png`,Buffer.from(result.frame.split(',')[1],'base64'));delete result.frame;results.push({beat,...result});
 }
 assert.deepEqual(errors,[]);
 for(const result of results){assert.equal(result.status,'ready');assert.ok(result.bounds.every(Number.isFinite));}
 await writeFile(`${dir}/check.json`,JSON.stringify({errors,results},null,2));console.log(JSON.stringify({errors,results}));
}finally{await browser.close();}
