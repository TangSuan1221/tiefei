import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.goto('http://127.0.0.1:5197/');
 const result=await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {labDeskAction,labDeskState,drawLabDesk}=await import('/src/pod/view/lab-desk.ts');
  const {commUi}=await import('/src/pod/view/comm-desk.ts');
  const {HitMap}=await import('/src/pod/view/chrome.ts');
  const run=Object.create(PodRun.prototype);
  Object.assign(run,{tapes:[{id:'harbor.task.ui',ready:true,siteName:'艾里亚斯 · 来电',analyzed:true}],tapeCursor:0,at:'lab',hull:1,power:1,blackout:false,videoStatus:'',inventory:{},outcome:{kind:'alive'}});
  labDeskState(run).tab='comm';commUi(run).active=run.tapes[0].id;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;
  document.body.replaceChildren(canvas);document.body.style.cssText='margin:0;background:#000';
  const ctx=canvas.getContext('2d'),hits=new HitMap(),labels=[];
  const original=ctx.fillText.bind(ctx);ctx.fillText=(s,...args)=>{labels.push(s);original(s,...args)};
  const render={controls:[],playback(c,w,h){c.fillStyle='#11231b';c.fillRect(0,0,w,h);return '等比放大';}};
  const draw=()=>{hits.clear();drawLabDesk(ctx,run,0,0,1024,720,hits,null,render)};
  draw();const click=hits.pick(512,360),removed=!labels.some(s=>/接收波形|通讯记录|等比放大|发送身份资料/.test(s));
  labDeskAction(run,click);draw();const expanded=run.labVideoExpanded,close=hits.pick(48,48);
  labDeskAction(run,close);draw();
  return {click,removed,expanded,close,restored:!run.labVideoExpanded};
 });
 assert.deepEqual(result,{click:'lab.fullscreen',removed:true,expanded:true,close:'lab.restore',restored:true});
 console.log('PASS',result);
} finally {await browser.close()}
