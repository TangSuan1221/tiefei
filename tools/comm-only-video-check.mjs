import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5193/');
 const result=await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {labDeskAction,labDeskState,drawLabDesk}=await import('/src/pod/view/lab-desk.ts');
  const {drawLabRecording}=await import('/src/pod/view/footage.ts');
  const {incomingCall}=await import('/src/pod/view/comm-desk.ts');
  const {CabinThree}=await import('/src/pod/view/cabin-three.ts');
  const story={id:'harbor.task.old',ready:true,analyzed:false,siteName:'艾里亚斯 · 来电'};
  const photo={id:'tape.1',ready:true,analyzed:false,siteName:'摄影底片'};
  const run=Object.create(PodRun.prototype);Object.assign(run,{tapes:[story,photo],tapeCursor:0,at:'lab',hull:1,power:1,blackout:false,shot:{},onCue:null,pushLog(){},videoStatus:'',inventory:{},outcome:{kind:'alive'}});
  const incoming=incomingCall(run)?.id;
  labDeskAction(run,'lab.tab:tapes');const selected=run.selectedTape.id;
  run.cycleTape(1);const next=run.selectedTape.id;
  const rejected=!labDeskAction(run,'lab.select:0');
  run.tapeCursor=0;const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
  const blocked=drawLabRecording(ctx,run,640,360)==='视频通讯';
  const labels=[];ctx.fillText=(text)=>labels.push(text);
  drawLabDesk(ctx,run,0,0,1024,720,undefined,null,{controls:[],playback(){throw Error('story leaked');}});
  const cabin=Object.create(CabinThree.prototype);cabin.focusLab();
  return {incoming,selected,next,rejected,blocked,count:run.unanalyzedCount,labels,focus:cabin.deviceZoom,manual:cabin.manualLook};
 });
 assert.equal(result.incoming,'harbor.task.old');assert.equal(result.selected,'tape.1');assert.equal(result.next,'tape.1');assert.equal(result.count,1);assert.ok(result.rejected&&result.blocked);assert.ok(!result.labels.some(t=>t.includes('艾里亚斯')));assert.equal(result.focus,'lab');assert.equal(result.manual,false);
 console.log('PASS: legacy calls, archive filtering, cycling, playback guard, analysis count, right lab focus');
}finally{await browser.close();}
