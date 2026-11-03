import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const doc=fs.readFileSync('docs/video-prompts/level-03-abyssal-lab.md','utf8');
const strip=s=>s.replace(/^import .*;\r?\n/gm,'');
const code=[fs.readFileSync('src/pod/content/elias-video-atoms.ts','utf8'),strip(fs.readFileSync('src/pod/content/fixed-camera.ts','utf8')),fs.readFileSync('src/pod/net/no-video-mode.ts','utf8'),'const source='+JSON.stringify(doc)+';',strip(fs.readFileSync('src/pod/content/abyssal-media.ts','utf8')),strip(fs.readFileSync('src/pod/net/video.ts','utf8')).replaceAll('import.meta.env','({VITE_VIDEO_ENABLED:"1"})')].join('\n');
const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {composeAbyssMedia,requestVideo,ELIAS_TASK_PLATES,eliasTaskReference}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const previous={fetch:globalThis.fetch,window:globalThis.window};const bodies=[];
const events=new EventTarget();globalThis.window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval};
globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body);for(const field of ['first_frame','last_frame','first_frame_image','last_frame_image','input_reference'])assert.equal(Object.hasOwn(body,field),false,field+' must never be submitted');if(body.content){assert.equal(body.content.length,1);assert.equal(body.content[0].type,'image_url');assert.equal(body.content[0].role,'reference_image');}bodies.push(body);return new Response('{}',{status:400});};
try{
 let segments=0,max=0;
 for(const shot of Object.keys(ELIAS_TASK_PLATES)){
  const selected=new Map();
  for(const section of doc.replaceAll('\r\n','\n').split(/^## /m).filter(s=>s.match(/镜头：(L3-E\d{2}[A-Z]?)/)?.[1]===shot)){
   const slots=JSON.parse(section.match(/```slots\n([\s\S]*?)\n```/)?.[1]??'{}');
   for(const [slot,values] of Object.entries(slots))selected.set(slot,Object.keys(values)[0]);
  }
  const story={performance:()=>[...selected].map(([slot,key])=>({slot,hit:{key}}))};
  const parts=composeAbyssMedia(story,shot);assert.ok(parts.length);
  for(let i=0;i<parts.length;i++){
   const part=parts[i];assert.equal(part.plate,eliasTaskReference(shot,i));
   const png=fs.readFileSync('public'+part.plate);assert.equal(png.subarray(1,4).toString(),'PNG');
   const frame='data:image/png;base64,'+png.toString('base64');
   await requestVideo(part.prompt,undefined,frame,undefined,part.duration,part.cameraMode);
   const body=bodies.at(-1);assert.equal(body.content[0].image_url.url,frame);assert.equal(body.duration,10);
   assert.ok(body.prompt.length<=3600,part.id+' payload length '+body.prompt.length);
   if(part.cameraMode==='elias-selfie'){assert.match(body.prompt,/ELIAS SELFIE CAMERA/);assert.doesNotMatch(body.prompt,/CAMERA LOCK:|exact opening frame|Animate underwater particles/);}
   else {assert.match(part.id,/VP-31[345]/);assert.match(body.prompt,/CAMERA LOCK:/);}
   max=Math.max(max,body.prompt.length);segments++;
  }
 }
 assert.throws(()=>eliasTaskReference('unknown'),/Missing/);
 assert.match(fs.readFileSync('src/pod/view/deepsea/abyssal-media-player.ts','utf8'),/p.duration,p.cameraMode/);
 console.log('PASS Elias task compiler -> request payload: '+segments+' segments, max '+max+' chars; exact task PNGs, no external requests.');
}finally{globalThis.fetch=previous.fetch;globalThis.window=previous.window;}
