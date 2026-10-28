import {openLevelTwo,startNew,sit,physicalClick} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const dir='qa/living-2026-10-27',out={method:'Legal diagnostic R2 positioning; physical shutter click and real exposure timer; exported runtime rectangular/circular draws plus actual cockpit screenshot; API blocked'};
const {browser,page,errors}=await openLevelTwo(dir);
try{await startNew(page);await sit(page);
out.setup=await page.evaluate(async()=>{const l=window.__living,r=window.__pod;await l.world.ready;r.lamp=true;r.power=1;r.camPan=0;r.camTilt=Math.atan2(.6,3);return{legal:l.diag.teleport(56,0,27.5,180),hint:l.interactionHint()};});
await physicalClick(page,'camera.shoot');await page.waitForTimeout(700);
out.shot=await page.evaluate(()=>({phase:window.__pod.shot.phase,left:window.__pod.shot.exposeLeft}));
if(out.shot.phase!=='exposing')throw Error('No real exposure');
const images=await page.evaluate(async()=>{const m=await import('/src/pod/view/stations.ts'),r=window.__pod,view={time:r.clock,hovered:null,sonar:null};const output=[];for(const shape of ['rectangle','circle']){const c=document.createElement('canvas');c.width=1024;c.height=720;const ctx=c.getContext('2d'),texts=[],base=ctx.fillText.bind(ctx);ctx.fillText=(t,x,y,...a)=>{const tr=ctx.getTransform();texts.push({text:String(t),x:tr.a*x+tr.c*y+tr.e,y:tr.b*x+tr.d*y+tr.f,font:ctx.font,baseline:ctx.textBaseline});return base(t,x,y,...a);};if(shape==='circle')m.drawObservationWindow(ctx,r,null,view,true);else m.drawStationScreen(ctx,r,'camera',1024,720,view);output.push({shape,texts,image:c.toDataURL()});}return output;});
out.draws=images.map(({image,...x})=>x);for(const i of images)writeFileSync(`${dir}/caption-${i.shape}-exposing.png`,Buffer.from(i.image.split(',')[1],'base64'));
await page.screenshot({path:`${dir}/caption-cockpit-exposing.png`});
await page.waitForFunction(()=>window.__pod.shot.phase!=='exposing',null,{timeout:12000});out.after=await page.evaluate(()=>({phase:window.__pod.shot.phase,frames:window.__pod.tapes.at(-1)?.sensorFrames?.length}));
}catch(e){out.failure=String(e);}finally{out.errors=errors;writeFileSync(`${dir}/independent-caption.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out));await browser.close();}
