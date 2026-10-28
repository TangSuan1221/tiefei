import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync('src/pod/content/elias-video-atoms.ts','utf8')+'\n'+readFileSync('src/pod/net/no-video-mode.ts','utf8')+'\n'+readFileSync('src/pod/content/fixed-camera.ts','utf8').replace(/import \{ELIAS_SELFIE_CONTRACT\} from '[^']+';/,'')+'\n'+readFileSync('src/pod/net/video.ts','utf8').replace(/import \{lockVideoCamera\} from '[^']+';/,'').replace(/import \{isLocalNoVideoMode\} from '[^']+';/,'').replaceAll('import.meta.env','({VITE_VIDEO_ENABLED:"1"})');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {requestVideo}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;const bodies=[];
const events=new EventTarget();globalThis.window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval};
globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(init.body));return new Response('{"error":{"message":"local test"}}',{status:400});};
try{
 await requestVideo('A creature moves in a fixed harbor.',undefined,'data:image/png;base64,AAAA');
 await requestVideo('Only silt moves.');
 await requestVideo(bodies[1].prompt);
 for(const body of bodies){assert.match(body.prompt,/CAMERA LOCK:/);assert.match(body.prompt,/No pan, tilt, roll, dolly, tracking, orbit, zoom/);assert.match(body.prompt,/impact jolt/);assert.equal(body.prompt.split('CAMERA LOCK:').length-1,1);}
 const count=bodies.length;
 await requestVideo('Elias gives a task.',undefined,'data:image/png;base64,BBBB',undefined,10,'elias-selfie');
 const selfie=bodies.at(-1);assert.match(selfie.prompt,/ELIAS SELFIE CAMERA/);assert.doesNotMatch(selfie.prompt,/CAMERA LOCK:|exact opening frame/);assert.equal(selfie.first_frame,'data:image/png;base64,BBBB');
 await requestVideo('Elias gives a task.',undefined,undefined,undefined,10,'elias-selfie');assert.equal(bodies.length,count+1,'missing task reference must not submit');
 assert.equal(bodies[0].first_frame,'data:image/png;base64,AAAA');
 assert(!readFileSync('src/pod/content/footage.ts','utf8').includes('drifting a few degrees'));
 assert(!readFileSync('src/pod/content/footage-director.ts','utf8').includes('One short camera jolt'));
 console.log('PASS: fixed player camera, explicit Elias selfie, task reference payload, missing-reference rejection; fetch mocked, zero external requests.');
}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
