import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync('src/pod/content/fixed-camera.ts','utf8')+'\n'+readFileSync('src/pod/net/video.ts','utf8').replace(/import \{lockVideoCamera\} from '[^']+';/,'').replaceAll('import.meta.env','({VITE_VIDEO_ENABLED:"1"})');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {requestVideo}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const originalFetch=globalThis.fetch;const bodies=[];
globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(init.body));return new Response('{"error":{"message":"local test"}}',{status:400});};
try{
 await requestVideo('A creature moves in a fixed harbor.',undefined,'data:image/png;base64,AAAA');
 await requestVideo('Only silt moves.');
 await requestVideo(bodies[1].prompt);
 for(const body of bodies){assert.match(body.prompt,/CAMERA LOCK:/);assert.match(body.prompt,/No pan, tilt, roll, dolly, tracking, orbit, zoom/);assert.match(body.prompt,/impact jolt/);assert.equal(body.prompt.split('CAMERA LOCK:').length-1,1);}
 assert.equal(bodies[0].first_frame,'data:image/png;base64,AAAA');
 assert(!readFileSync('src/pod/content/footage.ts','utf8').includes('drifting a few degrees'));
 assert(!readFileSync('src/pod/content/footage-director.ts','utf8').includes('One short camera jolt'));
 console.log('PASS: actual request payload locks camera, preserves reference, idempotent; fetch mocked, zero external requests.');
}finally{globalThis.fetch=originalFetch;}
