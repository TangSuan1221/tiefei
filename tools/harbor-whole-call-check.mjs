import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const server=await createServer({server:{port:5297,strictPort:true},define:{'import.meta.env.VITE_VIDEO_ENABLED':'"1"'}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage(),posts=[];
 page.on("console",m=>{if(m.text().startsWith("TEST"))console.log(m.text());});
 await page.route('**/api/video/**',async route=>{
  if(route.request().method()==='POST'){posts.push(route.request().postDataJSON());await route.fulfill({json:posts.at(-1).prompt.includes('FILTER_TEST')?{id:'mock-'+posts.length,status:'failed',error:{message:'content_policy'}}:{id:'mock-'+posts.length,status:'completed'}});}
  else await route.fulfill({contentType:'video/mp4',body:fs.readFileSync('public/assets/harbor/task-videos/L1-R28-V01.mp4')});
 });
 await page.route('**/src/pod/net/video.ts',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/const FIRST_POLL_DELAY = [^;]+;/,'const FIRST_POLL_DELAY = 0;')});});
 await page.route('http://localhost:5297/',route=>route.fulfill({contentType:'text/html',body:'<html><body>Isolated video test</body></html>'}));
 await page.goto('http://localhost:5297/');
 console.log('TEST browser ready');
 const result=await page.evaluate(async()=>{
  localStorage.clear();sessionStorage.clear();
  const {requestVideo}=await import('/src/pod/net/video.ts');
  const {storyVideoDuration}=await import('/src/pod/content/video-duration.ts');
  for(const duration of [6,7,8,9,11,12,13,14,15])await requestVideo('Complete story',undefined,undefined,undefined,duration,'fixed',undefined,[],'story');
  let rejected=0;for(const duration of [0,16,NaN,Infinity,7.5])try{await requestVideo('Invalid',undefined,undefined,undefined,duration,'fixed',undefined,[],'story');}catch{rejected++;}
  await requestVideo('Monster photography',undefined,undefined,undefined,15);
  console.log('TEST transport done');
  const {HarborTaskPlayer}=await import('/src/pod/view/deepsea/harbor-task-player.ts');
  const run={tapes:[],leg:{id:'test'},pushLog(){},videoStatus:'',receiveRemoteTape(t){this.tapes.push(t);return true;}};
  const player=new HarborTaskPlayer(run);
  console.log('TEST harbor');await player.deliver('L1-R28-V02A',false);console.log('TEST harbor');await player.deliver('L1-R28-V02A',false);
  console.log('TEST harbor');await player.deliver('L1-R28-V03',false,{id:'reply',line:'等一下，我在门边。'});player.dispose();
  console.log('TEST harbor done');
  const {LivingTaskPlayer}=await import('/src/pod/view/deepsea/living-task-player.ts');
  const living=new LivingTaskPlayer(run);living.wanted='L2-S04';living.prefetch('L2-S04','1234',false);await living.deliver('L2-S04','1234',false);living.dispose();
  const {installFootageSink}=await import('/src/pod/view/footage.ts');
  const filmRun={shot:{token:41},videoStatus:''};installFootageSink(filmRun);
  const fallback=await new Promise(resolve=>filmRun.footageSink({cacheKey:'fallback-fixture',legId:'test',token:41,allowed:true,duration:15,keyframe:'data:image/png;base64,AAAA',prompt:'FILTER_TEST creature',fallbackPrompt:'Empty scene',settle:(...args)=>resolve(args)}));
  if(!fallback[1])throw Error('Photography retry failed');
  return {rejected,tapes:run.tapes.map(t=>t.cacheKey),short:storyVideoDuration('等一下。'),long:storyVideoDuration('请保持安静。'.repeat(30))};
 });
 assert.equal(result.rejected,5);assert.deepEqual(posts.slice(0,9).map(p=>p.duration),[6,7,8,9,11,12,13,14,15]);assert.equal(posts[9].duration,5);
 assert.equal(posts.length,15,'one complete harbor job, one reply, one joined living prefetch, two photography retry requests');assert.deepEqual(posts.slice(-2).map(p=>p.duration),[5,5]);
 assert.equal(result.tapes.length,4);assert.equal(result.tapes[0],result.tapes[1]);assert(result.short<result.long);assert.equal(result.long,15);
 const composed=await page.evaluate(async doc=>{
  const {composeAbyssMedia}=await import('/src/pod/content/abyssal-media.ts');
  const sections=doc.replaceAll('\r\n','\n').split(/^## /m),ids=[...new Set([...doc.matchAll(/镜头：(L3-[EP]\d{2}[A-Z]?)/g)].map(m=>m[1]))];
  return ids.map(id=>{
   const selected=new Map();for(const section of sections.filter(s=>s.includes('镜头：'+id+' ·'))){const slots=JSON.parse(section.match(/```slots\n([\s\S]*?)\n```/)?.[1]??'{}');for(const [slot,values]of Object.entries(slots))selected.set(slot,Object.keys(values)[0]);}
   const parts=composeAbyssMedia({performance:()=>[...selected].map(([slot,key])=>({slot,hit:{key,dialogue:'保持安静。'}}))},id);
   return {id,count:parts.length,duration:parts[0].duration,length:parts[0].prompt.length,prompt:parts[0].prompt};
  });
 },fs.readFileSync('docs/video-prompts/level-03-abyssal-lab.md','utf8'));
 for(const p of composed){assert.equal(p.count,1,p.id);assert(p.duration<=15&&p.duration>0);if(p.id.startsWith('L3-P'))assert.equal(p.duration,5);assert(!/ten-second|\d+-\d+ s/.test(p.prompt));}
 assert.match(composed.find(p=>p.id==='L3-E10').prompt,/no bubbles/);
 console.log('PASS: 6–15s story payloads, invalid durations rejected, photography forced to 5s, whole harbor generation/cache/free reply, living prefetch joins one job, all '+composed.length+' third-chapter shots compile to one request. No external API calls.');
}finally{await browser.close();await server.close();}


