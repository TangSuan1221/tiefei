// Video before task: an unwatched story call shows only its caller; full playback advances it and then names its subject.
// Uses a supplied local movie as stand-in media for both chapters; all API traffic is blocked, no generation is requested.
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5197/');await page.mouse.click(1200,20);
 const result=await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {HarborRescue}=await import('/src/pod/sim/harbor-rescue.ts');
  const {HarborSimpleFlow}=await import('/src/pod/sim/harbor-simple-flow.ts');
  const {HarborRescueSite}=await import('/src/pod/view/deepsea/harbor-rescue-site.ts');
  const {HarborTaskPlayer}=await import('/src/pod/view/deepsea/harbor-task-player.ts');
  const {LivingSurvey,SURVEY_CALL_X}=await import('/src/pod/sim/living-survey.ts');
  const {LivingDeckSite}=await import('/src/pod/view/deepsea/living-deck-site.ts');
  const {LIVING_TASKS,livingTaskSubtitles}=await import('/src/pod/content/living-task-videos.ts');
  const {HARBOR_TASKS}=await import('/src/pod/content/harbor-task-videos.ts');
  const {drawLabRecording,installRemotePlaylist}=await import('/src/pod/view/footage.ts');
  const {labDeskAction}=await import('/src/pod/view/lab-desk.ts');
  const {incomingCall,callParts,hangUp}=await import('/src/pod/view/comm-desk.ts');
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  sessionStorage.setItem('ironlung.gm.novideo','0');
  const videos=[],create=document.createElement.bind(document);
  document.createElement=function(tag,...args){const el=create(tag,...args);if(tag==='video')videos.push(el);return el;};
  const canvas=create('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
  const play=async(run,tape,advance,done)=>{
   check(labDeskAction(run,'lab.comm.answer'),'answer via comm action');const video=videos.at(-1);video.muted=true;video.playbackRate=16;
   const deadline=performance.now()+20000;
   while(!done()&&performance.now()<deadline){drawLabRecording(ctx,run,320,180);advance();await new Promise(r=>setTimeout(r,25));}
   check(done(),'full playback advances '+tape.id);hangUp(run);
  };
  const out={};
  // Chapter one: V01 is a supplied local movie.
  {
   const run=new PodRun(17),rescue=new HarborRescue(),flow=new HarborSimpleFlow(rescue);
   const site=Object.create(HarborRescueSite.prototype);
   Object.assign(site,{run,rescue,simpleFlow:flow,simplified:true,debugNoVideo:false,index:0,navigationConsole:{recordDialogue(){}},feedback(){}});
   run.authoredSite=site;run.phase='site';run.at='lab';run.power=1;run.blackout=false;flow.world.firstDoor=true;
   const player=new HarborTaskPlayer(run);await player.deliverFixed('L1-R28-V01');
   const tape=run.tapes.find(t=>t.id==='harbor.task.L1-R28-V01');run.tapeCursor=run.tapes.indexOf(tape);
   const before={name:tape.siteName,call:callParts(incomingCall(run)),objective:site.objective,log:run.log?.slice?.(-1)};
   check(!tape.siteName.includes(HARBOR_TASKS['L1-R28-V01'].title),'chapter one archive hides title: '+tape.siteName);
   check(!site.objective.includes(HARBOR_TASKS['L1-R28-V01'].title)&&!site.objective.includes('艾里亚斯'),'chapter one objective neutral: '+site.objective);
   site.advanceStoryTask();run.analyzeTape();check(!flow.accepted.includes('L1-R28-V01'),'receipt cannot advance chapter one');
   await play(run,tape,()=>site.advanceStoryTask(),()=>flow.accepted.includes('L1-R28-V01'));
   check(tape.siteName.endsWith(HARBOR_TASKS['L1-R28-V01'].title),'watched call shows its subject: '+tape.siteName);
   out.chapterOne={before,after:tape.siteName,objective:site.objective};
  }
  // Chapter two: the same local movie stands in for a generated S02 call.
  {
   const run=new PodRun(18),survey=new LivingSurvey();survey.operate('body');survey.tick(1,SURVEY_CALL_X);survey.acceptVideo('L2-S01');survey.operate('transfer');
   check(survey.pending==='L2-S02','S02 pending');
   const site=Object.create(LivingDeckSite.prototype);
   Object.assign(site,{run,survey,debugNoVideo:false,index:1,navigationConsole:{recordDialogue(){}},feedback(){},refresh(){}});Object.defineProperty(site,'objective',{get:()=>survey.objective});
   run.authoredSite=site;run.phase='site';run.at='lab';run.power=1;run.blackout=false;
   const blob=await (await fetch('/assets/harbor/task-videos/L1-R28-V01.mp4')).blob(),key='living-task:L2-S02:qa';
   const frames=await installRemotePlaylist(key,run.leg.id,[blob]);
   check(run.receiveRemoteTape({id:'living.task.L2-S02',siteName:'艾里亚斯 · 视频通讯',frames,siteEvidence:{livingTask:'L2-S02',generated:true},videoResult:'video',cacheKey:key,subtitles:livingTaskSubtitles('L2-S02','')}),'receive S02');
   const tape=run.tapes.find(t=>t.id==='living.task.L2-S02');run.tapeCursor=run.tapes.indexOf(tape);
   const before={name:tape.siteName,objective:survey.objective,describe:site.describeEvidence(tape.siteEvidence)};
   check(!before.describe.includes(LIVING_TASKS['L2-S02'].title),'chapter two describe hides title');
   check(!survey.objective.includes(LIVING_TASKS['L2-S02'].title),'chapter two objective neutral: '+survey.objective);
   const power=run.power;site.advanceStoryTask();check(!survey.accepted.includes('L2-S02'),'download alone no longer advances chapter two');
   await play(run,tape,()=>site.advanceStoryTask(),()=>survey.accepted.includes('L2-S02'));
   check(tape.siteName==='艾里亚斯 · '+LIVING_TASKS['L2-S02'].title,'chapter two watched name: '+tape.siteName);
   check(run.power===power,'finishing a story call spends no analysis power');
   check(incomingCall(run)===null,'finished call stops ringing');
   out.chapterTwo={before,after:tape.siteName,objective:survey.objective};
  }
  return out;
 });
 console.log(JSON.stringify(result,null,1));
 console.log('PASS story calls: neutral caller name before playback, no advance on receipt, full playback advances and names the subject (both chapters). Local stand-in media only.');
}finally{await browser.close();}
