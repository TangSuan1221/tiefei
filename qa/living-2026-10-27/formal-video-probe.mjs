import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {startNew,sit,click} from '../../tools/living-browser-lib.mjs';
const dir='qa/living-2026-10-27', result={scope:'L2-S01 only; diagnostic browser reads; no mission acceptance',events:[],errors:[],audio:'NOT_VERIFIED'};
const context=await chromium.launchPersistentContext(dir+'/formal-video-profile',{channel:'msedge',headless:true,viewport:{width:1600,height:900},args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Native(url,protocols);};window.WebSocket.prototype=Native.prototype;Object.assign(window.WebSocket,{OPEN:1,CLOSED:3,CONNECTING:0,CLOSING:2});});
const page=await context.newPage();
page.on('pageerror',e=>result.errors.push(e.message));
page.on('response',async r=>{if(!r.url().includes('/api/video/'))return;let e={method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()};try{if(e.path.endsWith('/content')&&r.ok()){const b=await r.body();await writeFile(dir+'/formal-S01.mp4',b);e.bytes=b.length;}else {const j=await r.json();e.body=j;}}catch{}result.events.push(e);await writeFile(dir+'/formal-video-network.json',JSON.stringify(result.events,null,2));});
try{
 await page.goto('http://127.0.0.1:5180/?level=2');
 result.existingCache=await page.evaluate(()=>JSON.parse(localStorage.getItem('ironlung.living.task-v1')??'{}'));
 await writeFile(dir+'/formal-video-cache-before.json',JSON.stringify(result.existingCache,null,2));
 await startNew(page); await sit(page);
 for(let i=0;i<80;i++){
  await page.waitForTimeout(10000);
  const s=await page.evaluate(()=>({status:window.__pod.videoStatus,tapes:window.__pod.tapes.map(t=>({id:t.id,ready:t.ready,cacheKey:t.cacheKey})),state:window.__living.diag.state()}));
  result.latest=s;await writeFile(dir+'/formal-video-probe.json',JSON.stringify(result,null,2));
  if(i%5===0)console.log(JSON.stringify({seconds:(i+1)*10,status:s.status,tapes:s.tapes.length}));
  if(s.status.includes('任务录像未完成')){result.outcome='API_FAILED';break;}
  if(s.tapes.some(t=>t.id==='living.task.L2-S01'&&t.ready)){result.outcome='RECEIVED';break;}
 }
 result.cache=await page.evaluate(()=>JSON.parse(localStorage.getItem('ironlung.living.task-v1')??'{}'));
 await page.screenshot({path:dir+'/formal-video-state.png'});
 if(result.outcome==='RECEIVED'){
  await sit(page);await page.keyboard.press('m');await page.waitForTimeout(1000);
  result.ui=await page.evaluate(()=>({at:window.__pod.at,hits:window.__podView.cabin.screens.map(s=>({id:s.id,hits:s.hits}))}));
  await page.screenshot({path:dir+'/formal-video-ui.png'});
 }
}catch(e){result.errors.push(String(e));result.outcome??='HARNESS_ERROR';}
await writeFile(dir+'/formal-video-probe.json',JSON.stringify(result,null,2));
await writeFile(dir+'/formal-video-probe.md',`# 第二关 S01 正式录像验证\n\n结果：${result.outcome}. 仅新开局，不驾驶、不接受 S01、不提交 S02/玩家摄影，不触及第三关。\n\n音频：未验。画面/播放：需按结果核查，收到文件不代表台词正确。\n\nRAG query/check 初始 stale: living-world.ts / living-survey-fixtures.ts（并行修改）。\n\n错误：${result.errors.join('; ')}\n`);
console.log(JSON.stringify({outcome:result.outcome,errors:result.errors,events:result.events.map(e=>({method:e.method,status:e.status,bytes:e.bytes}))}));
await context.close();

