import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{port:5199,strictPort:true},define:{'import.meta.env.VITE_VIDEO_ENABLED':'"1"'}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage(),bodies=[],dialogues=[];
 await page.route('**/api/video/**',async route=>{bodies.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:'{"error":{"message":"test failure"}}'});});
 await page.route('**/api/dialogue/**',async route=>{dialogues.push(route.request().postDataJSON());if(dialogues.length===1){await route.fulfill({status:401,body:'{}'});return;}await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'我看不清它的样子，不能确定是什么生物。先停止主动声纳脉冲，再修好艇身。'}}]})});});
 await page.goto('http://localhost:5199/');
 const result=await page.evaluate(async()=>{
  localStorage.clear();
  const {HarborTaskPlayer}=await import('/src/pod/view/deepsea/harbor-task-player.ts');
  const {HarborSimpleFlow}=await import('/src/pod/sim/harbor-simple-flow.ts');
  const {HarborRescue}=await import('/src/pod/sim/harbor-rescue.ts');
  const {freshNarrative}=await import('/src/pod/sim/narrative-memory.ts');
  const flow=new HarborSimpleFlow(new HarborRescue());flow.accepted.push('L1-R28-V01','L1-R28-V02');
  const {HarborRescueSite}=await import('/src/pod/view/deepsea/harbor-rescue-site.ts');
  const queued=[],visible=[];
  const site={simplified:true,debugNoVideo:false,simpleFlow:flow,run:{narrativeMemory:freshNarrative(),tapes:[]},activeNoise:false,elapsed:0,navigationConsole:{radioRecords:[],recordDialogue(line){visible.push(line);}},feedback(line){visible.push(line);},rescue:flow.rescue,taskPlayer:{queueReply(...args){queued.push(args);}}};
  flow.world.firstDoor=true;flow.greeted=true;flow.requestCode();
  HarborRescueSite.prototype.radioSay.call(site,'门怎么开');
  HarborRescueSite.prototype.radioSay.call(site,'能告诉我通行码吗');
  if(queued.length!==0||flow.pending!=='L1-R28-V02-AUTH')throw Error('Mainline input also queued a free reply');
  flow.codeAsked=false;
  HarborRescueSite.prototype.radioSay.call(site,'你在哪里');
  if(queued.length!==1)throw Error('Side question did not queue exactly one reply');
  if(visible.some(line=>/艾里亚斯：|总调度室|X42/.test(line)))throw Error('Pending reply leaked into player feedback or navigation history');
  if(!queued[0][0].includes('总调度室'))throw Error('Reply speech missing from generation queue');
  const lines=flow.say('你在哪里',freshNarrative(),false,0);
  const run={tapes:[],leg:{id:'test'},pushLog(){},videoStatus:''};
  const player=new HarborTaskPlayer(run);
  player.queueReply(lines[1].replace(/^[^：]+：/,''),'L1-R28-V02',false,{...queued[0][3],player:'刚才撞我的是什么'});player.tick(null);
  const wait=async()=>{for(let i=0;i<200&&!player.retryable;i++)await new Promise(r=>setTimeout(r,50));};
  await wait();const inferenceFailed=player.retryable;if(!inferenceFailed)throw Error("Inference failure not retryable");player.retry();player.tick(null);await wait();const failed=player.retryable;player.retry();player.tick(null);await wait();
  const result={lines,failed,retried:player.retryable,status:run.videoStatus,accepted:flow.accepted.length};player.dispose();return result;
 });
 assert.match(result.lines[1],/总调度室/);assert.match(result.lines[1],/X42、Y28，深度1012米/);assert.match(result.lines[1],/第二道压力门/);assert.equal(result.failed,true);assert.equal(result.retried,true);assert.equal(result.accepted,2);
 assert.equal(bodies.length,2);for(const body of bodies){assert.equal(body.model,'minimax-h3-max');assert.match(body.prompt,/我看不清它的样子/);assert.doesNotMatch(body.prompt,/听见了，频道留着/);assert.equal(body.content.length,3);}
 assert.equal(dialogues.length,2);assert.match(dialogues[0].messages[1].content,/刚才撞我的是什么/);
 console.log('PASS: context inference, HTTP401 retry, inferred speech reaches H3 with 3 references, video retry reuses speech, no story advancement. All API requests mocked.');
}finally{await browser.close();await server.close();}
