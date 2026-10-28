import {mkdir,writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
const dir='qa/living-survey/atrium-medium-diagnosis';await mkdir(dir,{recursive:true});
const {browser,context,page,errors}=await openLevelTwo(dir);
await context.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)&&!u.pathname.startsWith('/api/')?r.continue():r.abort();});
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
const setup=await page.evaluate(()=>{const l=window.__living; l.diag.teleport(144,0,60,90);window.__pod.lamp=true;
const frame=l.view.frame.bind(l.view);l.view.frame=f=>{frame(f);const v=l.view.composer.passes.find(p=>p.compositeMat&&p.scatterMat);const variant=window.qaVariant;v.compositeMat.uniforms.absorb.value=1;
 if(variant==='clear-water'){l.scene.fog.density=-.00001;v.compositeMat.uniforms.absorb.value=0;}
 else if(variant==='half-absorption'){v.compositeMat.uniforms.absorb.value=.5;}
 else if(variant==='half-medium'){l.scene.fog.density*=.5;v.compositeMat.uniforms.absorb.value=.5;}
 else if(variant==='double-exposure'){v.compositeMat.uniforms.exposure.value*=2;}
 else if(variant==='environment'){l.scene.environmentIntensity*=4;}
 else v.compositeMat.uniforms.absorb.value=1;
};return {fog:l.world.fogAt([144,0,60]),profiles:{live:l.view.profile('live'),film:l.view.profile('recording')}};});
const records=[];for(const variant of ['baseline','clear-water','half-absorption','half-medium','double-exposure','environment']){await page.evaluate(v=>window.qaVariant=v,variant);for(const film of [false,true]){await siteShot(page,`${dir}/${variant}-${film?'film':'live'}.png`,film);records.push(await page.evaluate(()=>{const l=window.__living;return{variant:window.qaVariant,fog:l.scene.fog.density,keys:l.view.keys.map(k=>({position:k.position.toArray(),power:k.intensity,distance:k.distance})),env:l.scene.environmentIntensity};}));}}
await writeFile(dir+'/capture.json',JSON.stringify({setup,records,errors,diagnostic:true},null,2));console.log(dir);
}finally{await browser.close();}

