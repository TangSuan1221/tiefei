import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:5178/');
 const result=await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {commUi,answerCall,beginCommTransmission,drawCommTab,hangUp,syncCommView}=await import('/src/pod/view/comm-desk.ts');
  const {CabinThree}=await import('/src/pod/view/cabin-three.ts');
  const run=Object.create(PodRun.prototype);const tape=id=>({id,ready:true,analyzed:true,callSeen:false,siteName:'艾里亚斯 · 视频通讯'});
  Object.assign(run,{tapes:[tape('harbor.task.a')],tapeCursor:0,at:'lab',power:1,blackout:false});
  const ctx=document.createElement('canvas').getContext('2d');const labels=[],buttons=[];
  const draw=()=>{labels.length=buttons.length=0;drawCommTab(ctx,run,0,{text:t=>labels.push(t),button:id=>buttons.push(id),playback:()=>'',videoHit(){}});};
  answerCall(run,0);beginCommTransmission(run);draw();
  const held=commUi(run).active==='harbor.task.a'&&labels.includes('信号重连中')&&!buttons.includes('lab.comm.answer');
  run.tapes.push(tape('harbor.task.b'));run.tapeCursor=1;draw();
  const continued=commUi(run).active==='harbor.task.b'&&run.tapes[1].callSeen&&!commUi(run).connecting;
  beginCommTransmission(run);hangUp(run);run.tapes.push(tape('harbor.task.c'));run.tapeCursor=2;draw();
  const hungUp=!commUi(run).active&&buttons.includes('lab.comm.answer')&&!run.tapes[2].callSeen;
  answerCall(run,2);syncCommView(run,true);beginCommTransmission(run);syncCommView(run,false);syncCommView(run,true);run.tapes.push(tape('harbor.task.d'));run.tapeCursor=3;draw();
  const leftView=!commUi(run).active&&buttons.includes('lab.comm.answer')&&!run.tapes[3].callSeen;
  return {held,continued,hungUp,leftView};
 });assert.deepEqual(result,{held:true,continued:true,hungUp:true,leftView:true});console.log(result);
}finally{await browser.close();}
