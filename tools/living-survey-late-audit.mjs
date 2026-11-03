import {openLevelTwo,startNew} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const {browser,page,errors}=await openLevelTwo('qa/living-2026-10-27');
const out={method:'SYNTHETIC DIAGNOSTIC: isolated browser, direct state/capture/tape injection; API routes blocked; no genuine generated media; no blind-play claim.'};
try{
 await startNew(page);
 out.result=await page.evaluate(async()=>{
  const l=window.__living,r=window.__pod,s=l.survey,results=[];
  const note=(label,extra={})=>results.push({label,...extra});
  s.acceptVideo('L2-S01');s.operate('body');s.operate('transfer');s.acceptVideo('L2-S02');
  const photo=t=>{const e={survey:true,id:'late-audit-'+t,target:t,valid:true,lit:true};s.issue(e);s.commit(e);s.analyze(e);};
  photo(0);photo(1);s.acceptVideo('L2-S03');s.say('你先别动');
  note('manual required',{line:s.operate('valve-s'),valve:s.valve});
  photo('manual');note('wrong valve',{line:s.operate('valve-c'),valve:s.valve});s.operate('valve-s');s.tick(61);
  note('closed but not reported',{pending:s.pending,reported:s.reported,clearSeen:s.clearSeen});
  s.say('含硫支路已关闭');note('report preempts reminder',{pending:s.pending});s.acceptVideo('L2-S05');
  note('ask before door',{lines:s.say('请给我密码'),askedCode:s.askedCode});s.operate('door');
  const before=s.say('请给我密码');note('unknown code not leaked',{lines:before,leaked:before.join('').includes(s.code),typedCodeUnlocked:(s.say(s.code),s.unlocked)});
  r.at='lab';r.power=1;
  const tape={id:'living.task.L2-S06',legId:r.leg.id,siteName:'SYNTHETIC missing playlist',siteEvidence:{livingTask:'L2-S06',generated:true,code:s.code},videoResult:'video',cacheKey:'living-task:L2-S06:synthetic-missing',ready:true,analyzed:false,report:[],fauna:[],sensorFrames:[]};
  r.tapes.push(tape);r.tapeCursor=r.tapes.length-1;const powerBefore=r.power;r.analyzeTape();
  note('missing playlist rejection',{analyzed:tape.analyzed,report:[...tape.report],codeSeen:s.codeSeen,pending:s.pending,powerBefore,powerAfter:r.power});
  let calls=0;const original=l.analyzeEvidence.bind(l);l.analyzeEvidence=(...a)=>{calls++;return original(...a);};r.analyzeTape();l.analyzeEvidence=original;
  note('retry after rejection',{validatorCalls:calls,analyzed:tape.analyzed,pending:s.pending});
  tape.analyzed=true;
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/src/pod/view/footage.ts')).name;
  const m=await import(url),blob=await(await fetch('/qa/living-2026-10-27/qa-synthetic-playback.mp4')).blob();
  const frames=await m.installRemotePlaylist(tape.cacheKey,r.leg.id,[blob]);
  note('SYNTHETIC local test pattern playlist installed',{frames:frames.length});
  const originalCode=tape.siteEvidence.code;tape.siteEvidence.code=originalCode==='1111'?'2222':'1111';r.analyzeTape();
  note('wrong code rejected',{codeSeen:s.codeSeen,power:r.power});tape.siteEvidence.code=originalCode;
  const originalId=tape.id;tape.id='qa.wrong-task-id';r.analyzeTape();note('wrong ID rejected',{codeSeen:s.codeSeen,power:r.power});tape.id=originalId;
  r.analyzeTape();note('old analyzed true recovered with SYNTHETIC playlist',{codeSeen:s.codeSeen,analyzed:tape.analyzed,status:l.evidenceStatus(tape.siteEvidence),power:r.power});
  r.analyzeTape();note('repeat accepted not charged',{power:r.power,codeSeen:s.codeSeen});
  return results;
 });
}catch(e){out.error=String(e);}finally{out.errors=errors;writeFileSync('qa/living-2026-10-27/late-route-diagnostic-fixed.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));await browser.close();}
