import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/harbor/visual-2026-10-11/baseline';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try {
 const p=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 // Freeze this page's module graph for a coherent capture while art agents edit.
 await p.addInitScript(()=>{const WS=window.WebSocket;window.WebSocket=class extends WS{constructor(url,protocols){super(String(url).includes('token=')?'ws://127.0.0.1:1':url,protocols);}};});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))errors.push(m.text());});
 await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5173/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
 await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});
 await p.waitForFunction(()=>window.__pod.authoredSite.visual.root.getObjectByName('rescue-blender-power-cabinet')?.userData.loaded,null,{timeout:60000});
 await p.waitForFunction(()=>{const s=window.__pod.authoredSite,d=s.world.root.getObjectByName('harbor-accident-dressing')?.userData;return d?.loaded&&d?.damageLoaded&&s.visual.elias.userData.skinStatus==='ready';},null,{timeout:60000});
 await p.waitForFunction(()=>window.__pod.authoredSite.visual.monster.getObjectByName('harbor-creature-continuous-skin')?.userData.loaded,null,{timeout:60000});
 await p.waitForTimeout(2000);
 const views=[['arrival',[33,0,34.8],35],['power',[42,0,28],0]];
 const stats=[];
 for(const [name,pos,heading]of views.filter(v=>!process.env.HARBOR_VIEW||v[0]===process.env.HARBOR_VIEW))for(const recording of [false,true]){
  const result=await p.evaluate(({pos,heading,recording})=>{
   const r=window.__pod,s=r.authoredSite;s.position.set(...pos);r.heading=heading;r.pitch=r.camPan=r.camTilt=0;r.lamp=true;r.power=1;s.tick(.001);
   const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d'),renderer=s.base.resources.renderer;
   const timing=[],autoReset=renderer.info.autoReset;let info;
   renderer.info.autoReset=false;
   // Distinct timestamps intentionally bypass the same-frame live-screen copy cache.
   try{for(let i=0;i<2;i++){renderer.info.reset();const start=performance.now();s.draw(ctx,c.width,c.height,r.clock+i*.001,recording);renderer.getContext().finish();timing.push(performance.now()-start);info={...renderer.info.render};}}finally{renderer.info.autoReset=autoReset;}
   return{image:c.toDataURL(),timing,info,infoScope:'all passes of last diagnostic draw',monsterVisible:s.visual.monster.visible};
  },{pos,heading,recording});
  await writeFile(`${dir}/${name}-${recording?'film':'live'}.png`,Buffer.from(result.image.split(',')[1],'base64'));stats.push({name,recording,...result,image:undefined});
 }
 await p.screenshot({path:`${dir}/cockpit.png`});
 await writeFile(`${dir}/results.json`,JSON.stringify({errors,stats,method:'Fixed diagnostic viewpoints in actual main renderer. GPU finish timings are not player FPS.'},null,2));
 console.log(JSON.stringify({dir,errors,stats:stats.map(s=>({name:s.name,recording:s.recording,timing:s.timing}))}));
}finally{await browser.close();}
