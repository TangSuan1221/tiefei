import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5194/');
 await page.mouse.click(1200,20); // Match the user gesture that starts a game session.
 const result=await page.evaluate(async(gm)=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {HarborRescue}=await import('/src/pod/sim/harbor-rescue.ts');
  const {HarborSimpleFlow}=await import('/src/pod/sim/harbor-simple-flow.ts');
  const {HarborRescueSite}=await import('/src/pod/view/deepsea/harbor-rescue-site.ts');
  const {HarborTaskPlayer}=await import('/src/pod/view/deepsea/harbor-task-player.ts');
  const {drawLabRecording,pauseHarborCallAway,labCallInProgress}=await import('/src/pod/view/footage.ts');
  const {labDeskAction,labDeskState}=await import('/src/pod/view/lab-desk.ts');
  const {incomingCall,hangUp,commUi}=await import('/src/pod/view/comm-desk.ts');
  const {isHarborTaskMedia}=await import('/src/pod/sim/harbor-opening.ts');
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  sessionStorage.setItem('ironlung.gm.novideo',gm?'1':'0');
  // Automatic calls lack a user gesture: exercise the browser rejection fallback.
  HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new DOMException('User gesture required','NotAllowedError'));
  const run=new PodRun(17),rescue=new HarborRescue(),flow=new HarborSimpleFlow(rescue);
  const site=Object.create(HarborRescueSite.prototype);
  Object.assign(site,{run,rescue,simpleFlow:flow,simplified:true,debugNoVideo:false,index:0,navigationConsole:{recordDialogue(){}},feedback(){}});
  run.authoredSite=site;run.phase='site';run.at='lab';run.power=1;run.blackout=false;flow.world.firstDoor=true;
  const videos=[],create=document.createElement.bind(document);
  document.createElement=function(tag,...args){const el=create(tag,...args);if(tag==='video')videos.push(el);return el;};
  const player=new HarborTaskPlayer(run),canvas=create('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
  const objectives=[];
  for(const id of ['L1-R28-V01','L1-R28-V02']){
   await player.deliverFixed(id);const tape=run.tapes.find(t=>t.id==='harbor.task.'+id),video=videos.at(-1);
   run.tapeCursor=run.tapes.indexOf(tape);
   site.advanceStoryTask();run.analyzeTape();check(!flow.accepted.includes(id),'receipt/early analysis cannot advance');
   if(id==='L1-R28-V01'){
    // Reproduce the broken saved state: rejected analysis had set both flags.
    tape.analyzed=true;tape.callSeen=true;
    check(incomingCall(run)===tape,'rejected old call must become answerable again');
   }
   check(!commUi(run).active&&video.paused,'received movie waits for explicit reception');
   check(labDeskAction(run,'lab.comm.answer'),'answer via actual comm action');
   const fullscreen=document.getElementById('lab-fullscreen-player');

   const {drawLabDesk}=await import('/src/pod/view/lab-desk.ts');
   let size;drawLabDesk(ctx,run,0,0,1024,720,undefined,null,{controls:[],playback(_ctx,w,h){size=[w,h];return '';}});

   check(labCallInProgress(run),'queued call must not interrupt playback');
   video.muted=true;video.playbackRate=16;
   drawLabRecording(ctx,run,320,180);
   run.at='nav';pauseHarborCallAway(run);check(video.paused,'leaving lab pauses call');run.at='lab';
   check(!flow.accepted.includes(id),'interrupted call cannot advance');
   const deadline=performance.now()+20000;
   while(!flow.accepted.includes(id)&&performance.now()<deadline){drawLabRecording(ctx,run,320,180);site.advanceStoryTask();await new Promise(r=>setTimeout(r,25));}
   check(flow.accepted.includes(id),'natural end advances '+id+' '+JSON.stringify({time:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,accepted:flow.accepted,tab:labDeskState(run).tab,active:commUi(run).active,status:drawLabRecording(ctx,run,320,180),at:run.at,selected:run.selectedTape?.id}));
   check(video.ended&&video.paused,'movie holds at end');
   check(!labCallInProgress(run),'completed call releases queued calls');
   const n=flow.accepted.length;site.advanceStoryTask();run.analyzeTape();check(flow.accepted.length===n,'completion idempotent');
   objectives.push(site.objective);hangUp(run);
   if(id==='L1-R28-V01'){check(site.objective.includes('回应'),'first movie gives response objective');check(flow.identify(),'identity response available');}
   else if(gm){check(!flow.credential&&flow.pending===null,'code waits for the player to try the door');flow.requestCode();site.advanceStoryTask();check(flow.accepted.includes('L1-R28-V02-AUTH'),'missing authorization movie retains GM text progression');}
   else{check(!flow.credential&&flow.pending===null,'code waits for the player to try the door');flow.requestCode();check(flow.pending==='L1-R28-V02-AUTH','normal mode awaits authorization movie');}
  }
  const t=run.tapes[0];
  check(!isHarborTaskMedia({...t,videoResult:'prompt'},'L1-R28-V01'),'non-video rejected');
  check(!isHarborTaskMedia({...t,id:'harbor.task.L1-R28-V02-AUTH',siteEvidence:{harborTask:'L1-R28-V02-AUTH'},cacheKey:'harbor-fixed:L1-R28-V02-AUTH:2026-11-02'},'L1-R28-V02-AUTH'),'fixed key cannot grant authorization');
  player.dispose();return {accepted:flow.accepted,objectives};
 },process.env.TEST_NORMAL!=='1');
 assert.deepEqual(result.accepted.slice(0,2),['L1-R28-V01','L1-R28-V02']);console.log(JSON.stringify(result,null,2));
 console.log('PASS: actual local movies, natural accelerated playback, old rejected state recovery, early/away guards, idempotence, separate authorization. Diagnostic fixture; no provider requests or full playthrough.');
}finally{await browser.close();}




