// Live-view auto-iris captures on the level-1 harbor: close pale door vs. longer views.
// Usage: node tools/harbor-iris-capture.mjs [dir]   (dev server at http://127.0.0.1:5174)
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/porthole-crt-hud/iris';await mkdir(dir,{recursive:true});
const views=[
 {name:'door-2.7m',x:41,z:23.6,heading:0},
 {name:'door-5.8m',x:41,z:26.7,heading:0},
 {name:'harbor-long',x:41,z:26.7,heading:90},
 {name:'harbor-back',x:41,z:26.7,heading:180},
];
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const p=await b.newPage({viewport:{width:1600,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/**',r=>r.abort());await p.goto(process.env.GAME_URL??'http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();
 await p.waitForFunction(()=>!!window.__pod);
 await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});await p.waitForTimeout(6000);
 const rows=[];
 for(const v of views){
  await p.evaluate(v=>{const r=window.__pod;r.authoredSite.position.set(v.x,0,v.z);r.heading=v.heading;r.pitch=r.camPan=r.camTilt=0;r.power=1;r.lamp=true;},v);
  await p.waitForTimeout(3000);
  const iris=await p.evaluate(()=>window.__pod.authoredSite.base.iris);
  await p.screenshot({path:`${dir}/${v.name}.png`});rows.push({...v,iris});
 }
 await writeFile(`${dir}/result.json`,JSON.stringify({rows,errors},null,2));console.log({rows,errors});
}finally{await b.close();}
