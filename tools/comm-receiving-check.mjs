import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const dir='qa/comm-receiving';await mkdir(dir,{recursive:true});
const server=await createServer({server:{port:0,strictPort:false,hmr:false}});await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1792,height:1000}});
 await page.route('**/api/**',r=>r.abort());await page.goto(base);
 await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {drawLabDesk,labDeskState,labDeskAction}=await import('/src/pod/view/lab-desk.ts');
  const comm=await import('/src/pod/view/comm-desk.ts');
  const {HitMap}=await import('/src/pod/view/chrome.ts');
  const {RadioTransmit}=await import('/src/pod/view/radio-transmit.ts');
  const {installRemotePlaylist}=await import('/src/pod/view/footage.ts');
  const seed=document.createElement('canvas');seed.width=160;seed.height=90;
  const stream=seed.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),parts=[];
  const recorded=new Promise(resolve=>{recorder.ondataavailable=e=>parts.push(e.data);recorder.onstop=resolve;});
  recorder.start();seed.getContext('2d').fillRect(0,0,160,90);await new Promise(r=>setTimeout(r,220));recorder.stop();await recorded;stream.getTracks().forEach(t=>t.stop());
  await installRemotePlaylist('comm-layout-fixture','fixture',[new Blob(parts,{type:'video/webm'})]);
  const run=Object.create(PodRun.prototype);
  const tape=(id,seen)=>({id:'harbor.task.'+id,ready:true,videoResult:'video',cacheKey:'comm-layout-fixture',analyzed:seen,callSeen:seen,siteName:'艾里亚斯 · '+(seen?'通讯记录 '+id:'视频通讯')});
  Object.assign(run,{tapes:[tape('1',true),tape('2',true),tape('3',true),tape('4',false)],tapeCursor:3,at:'lab',power:1,hull:1,blackout:false,videoStatus:'',outcome:{kind:'alive'}});
  labDeskState(run).tab='comm';comm.commUi(run).spoken='密码是多少？';
  document.body.innerHTML='<canvas width="1792" height="1000"></canvas>';document.body.style.cssText='margin:0;overflow:hidden;background:black';
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),hits=new HitMap();
  const draw=()=>{hits.clear();drawLabDesk(ctx,run,0,0,1792,1000,hits,null,{controls:[],playback:(g,w,h)=>{g.fillStyle='#14251a';g.fillRect(0,0,w,h);return '';}});};
  window.fixture={run,comm,labDeskAction,hits,draw,RadioTransmit};draw();
 });


 const result=await page.evaluate(()=>{
   const {run,comm,draw,hits}=window.fixture;
   comm.answerCall(run,3);comm.beginCommTransmission(run);draw();
   const waiting=comm.commUi(run).connecting&&!hits.rectOf('lab.comm.answer');
   const c=document.querySelector('canvas'),ctx=c.getContext('2d');
   const render=time=>{ctx.clearRect(0,0,c.width,c.height);comm.drawCommTab(ctx,run,time,{text(){},button(){},playback:()=>'',videoHit(){}});return c.toDataURL();};
   const animated=render(1)!==render(1.5);
   const labels=[];let playbackCalls=0;
   run.videoStatus='远端生成中 · 生成进度 42%';
   comm.drawCommTab(ctx,run,2,{text:t=>labels.push(t),button(){},playback(){playbackCalls++;return '';},videoHit(){}});
   const realProgress=labels.some(t=>t.includes('信号接收中')&&t.includes('42%'))&&playbackCalls===0;
   run.videoStatus='远端生成中 · 请等待';labels.length=0;
   comm.drawCommTab(ctx,run,3,{text:t=>labels.push(t),button(){},playback:()=>'',videoHit(){}});
   const unknownProgress=labels.some(t=>t.includes('信号接收中'))&&!labels.some(t=>/准备素材|等待生成|生成视频|服务未提供百分比|已等待|%/.test(t));
   const next={...run.tapes[3],id:'harbor.task.reply',callSeen:false,analyzed:false,ready:false};run.tapes.push(next);run.tapeCursor=4;draw();
   const waitsForMedia=comm.commUi(run).active===run.tapes[3].id&&!next.callSeen;
   window.replyFixture={next};draw();
   return {waiting,animated,waitsForMedia,realProgress,unknownProgress};
 });
 await page.screenshot({path:dir+'/01-receiving.png'});
 const continuation=await page.evaluate(()=>{
   const {run,comm,draw,hits}=window.fixture,{next}=window.replyFixture;
   next.ready=true;draw();
   const resumed=comm.commUi(run).active===next.id&&next.callSeen&&!comm.commUi(run).connecting&&!hits.rectOf('lab.comm.answer')&&!!hits.rectOf('lab.tab:tapes');
   const noEarlyEvidence=!next.analyzed;
   comm.beginCommTransmission(run);comm.hangUp(run);
   run.tapes.push({...next,id:'harbor.task.independent',callSeen:false});draw();
   const hangupNeedsAnswer=!!hits.rectOf('lab.comm.answer')&&!run.tapes[5].callSeen;
   return {resumed,noEarlyEvidence,hangupNeedsAnswer};
 });
 assert(Object.values({...result,...continuation}).every(Boolean),JSON.stringify({result,continuation}));
 await writeFile(dir+'/result.json',JSON.stringify({result,continuation},null,2));console.log({result,continuation});
}finally{await browser.close();await server.close();}
