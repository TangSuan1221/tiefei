import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const dir='qa/comm-early-answer';await mkdir(dir,{recursive:true});
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
  const {run,comm,draw,hits,labDeskAction}=window.fixture;
  run.tapes=[];run.tapeCursor=0;Object.defineProperty(run,'leg',{value:{id:'fixture'}});run.breaths=0;
  comm.announceGeneratingCall(run,'harbor.task.early','艾里亚斯');draw();
  const ringsBeforeMedia=!!hits.rectOf('lab.comm.answer')&&run.tapes.length===0;
  const answered=labDeskAction(run,'lab.comm.answer');draw();
  const connecting=comm.commUi(run).connecting&&comm.commUi(run).active==='harbor.task.early'&&!hits.rectOf('lab.comm.answer');
  run.tapes.push({id:'harbor.task.early',ready:false,videoResult:'video',cacheKey:'comm-layout-fixture',callSeen:false,analyzed:false,siteName:'艾里亚斯 · 视频通讯'});draw();
  const waitsForMedia=comm.commUi(run).connecting&&!run.tapes[0].callSeen&&!run.tapes[0].analyzed;
  run.tapes[0].ready=true;draw();
  const resumes=comm.commUi(run).active==='harbor.task.early'&&!comm.commUi(run).connecting&&run.tapes[0].callSeen&&!run.tapes[0].analyzed;
  comm.hangUp(run);comm.announceGeneratingCall(run,'living.task.cancelled','艾里亚斯');draw();
  labDeskAction(run,'lab.comm.answer');comm.cancelGeneratingCall(run);draw();
  const cancelled=!comm.commUi(run).active&&!comm.incomingCall(run);
  comm.announceGeneratingCall(run,'harbor.task.hungup','艾里亚斯');labDeskAction(run,'lab.comm.answer');comm.hangUp(run);
  run.tapes.push({...run.tapes[0],id:'harbor.task.hungup',callSeen:false});run.tapeCursor=1;draw();
  const hangupNeedsAnswer=!!hits.rectOf('lab.comm.answer')&&!run.tapes[1].callSeen;
  labDeskAction(run,'lab.comm.answer');comm.beginCommTransmission(run);
  comm.announceGeneratingCall(run,'harbor.task.reply','艾里亚斯');draw();
  const replyDoesNotRing=!hits.rectOf('lab.comm.answer')&&comm.commUi(run).connecting;
  run.tapes.push({...run.tapes[0],id:'harbor.task.reply',callSeen:false});run.tapeCursor=2;draw();
  const replyResumes=comm.commUi(run).active==='harbor.task.reply'&&!comm.commUi(run).connecting;
  comm.hangUp(run);comm.announceGeneratingCall(run,'living.task.waiting','艾里亚斯');labDeskAction(run,'lab.comm.answer');draw();
  return {ringsBeforeMedia,answered,connecting,waitsForMedia,resumes,cancelled,hangupNeedsAnswer,replyDoesNotRing,replyResumes};
 });
 assert(Object.values(result).every(Boolean),JSON.stringify(result));
 await page.screenshot({path:dir+'/connecting.png'});
 await writeFile(dir+'/result.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();await server.close();}

