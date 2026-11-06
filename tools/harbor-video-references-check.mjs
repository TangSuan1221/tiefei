import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{port:0},define:{'import.meta.env.VITE_VIDEO_ENABLED':'"1"'}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();const bodies=[];
 await page.route('**/api/video/**',async route=>{bodies.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:'{"error":{"message":"local test only"}}'});});
 await page.goto(server.resolvedUrls.local[0]);
 const result=await page.evaluate(async()=>{
  const {requestVideo}=await import('/src/pod/net/video.ts');
  const {loadVideoReference}=await import('/src/pod/net/video-references.ts');
  const {HARBOR_REFERENCES,HARBOR_TASK_REFERENCES,HARBOR_CREATURE_REFERENCES}=await import('/src/pod/content/harbor-video-references.ts');
  const {harborTaskPrompt}=await import('/src/pod/content/harbor-task-videos.ts');
  const frame=await loadVideoReference(HARBOR_REFERENCES.story);
  const task=await requestVideo(harborTaskPrompt('L1-R28-V02-AUTH'),undefined,frame,undefined,10,'elias-selfie',undefined,HARBOR_TASK_REFERENCES);
  const {videoCreatureSubject}=await import('/src/pod/content/video-creatures.ts');
  const creature=await requestVideo('MONSTER_SUBJECTS: '+videoCreatureSubject('harbor','one harbor creature'),undefined,frame,undefined,5,'fixed',undefined,HARBOR_CREATURE_REFERENCES);
  const fallback=await requestVideo('No creature visible',undefined,frame);
  const missing=await requestVideo('Missing asset test',undefined,frame,undefined,5,'fixed',undefined,[{url:'/missing-reference.png',description:'missing'}]);
  return {task:task.fail?.kind,creature:creature.fail?.kind,fallback:fallback.fail?.kind,missing:missing.fail?.kind};
 });
 assert.deepEqual(result,{task:'submit',creature:'submit',fallback:'submit',missing:'network'});
 assert.deepEqual(bodies.map(b=>b.content.length),[3,2,1]);
 for(const b of bodies)for(const ref of b.content){assert.equal(ref.role,'reference_image');assert.match(ref.image_url.url,/^data:image\/png;base64,/);}
 assert.match(bodies[0].prompt,/Image 2: Elias identity/);assert.match(bodies[0].prompt,/Image 3: Central dispatch/);
 assert.match(bodies[1].prompt,/fused mass of multiple human-like heads/);assert.doesNotMatch(bodies[1].prompt,/Twisted narrow torso|Ragged translucent fin rays/);
 assert.match(bodies[1].prompt,/Harbor creature anatomy/);assert.doesNotMatch(bodies[2].prompt,/Harbor creature anatomy/);
 console.log('PASS: task 3 references, creature 2, fallback 1, missing asset blocks submit; all POSTs intercepted, no paid calls.');
}finally{await browser.close();await server.close();}
