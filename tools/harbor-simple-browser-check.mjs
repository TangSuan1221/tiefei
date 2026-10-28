import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5186/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const report=await page.evaluate(async()=>{const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;s.tick(.1);
 if(s.navigationConsole.target!==null)throw Error('Waypoint was auto-written');
 const initial={hidden:!s.visual.elias.visible,objective:s.objective,heard:s.rescue.state.heard,replied:s.rescue.state.replied,simple:s.snapshot().simpleFlow};
 const forged=s.analyzeEvidence({capture:{harborTask:'L1-E01',generated:true},media:{playable:true,source:'generated-video',mediaId:'fake'}});if(s.rescue.state.replied)throw Error('Forged remote accepted');
 const local=s.analyzeEvidence({capture:{harborTask:'L1-E01',generated:false},media:{playable:true,source:'controlled-video'}});if(s.rescue.state.replied)throw Error('Local remote accepted');
 s.radioSay('你可以出来了');if(s.rescue.state.departing)throw Error('Text bypassed evidence');
 const snapshot=s.snapshot();if(!s.restore(snapshot))throw Error('Fresh simplified save rejected');
 const bad=structuredClone(snapshot);bad.simpleFlow.accepted=['L1-E03'];if(s.restore(bad))throw Error('Invalid sequence accepted');
 // Local renderer visibility checks only, no generated media or official completion.
 r.lamp=true;r.activeSonarEnabled=true;r.sonarPulseEnabled=false;r.sonarPulseLeft=0;r.power=1;r.blackout=false;
 const powered=s.activeNoise;r.activeSonarEnabled=false;const off=s.activeNoise;
 const response=await fetch('/assets/harbor/elias-task-reference.png');
 const restored=s.snapshot().simpleFlow;
 // Synthetic protocol fixtures exercise adapter transitions only; never write a save or claim genuine media.
 const {openHarborCall,finishHarborCall}=await import('/src/pod/sim/harbor-opening.ts');
 const remote=id=>{const c=document.createElement('canvas');c.width=c.height=4;const frame=c.toDataURL();const key='harbor-task:'+id+':synthetic-test';r.receiveRemoteTape({id:'harbor.task.'+id,siteName:'DIAGNOSTIC SYNTHETIC FIXTURE',frames:[frame,frame,frame],siteEvidence:{harborTask:id,generated:true},videoResult:'video',cacheKey:key});if(id==='L1-E01'){openHarborCall(r.selectedTape);finishHarborCall(r.selectedTape);}return s.analyzeEvidence({capture:{harborTask:id,generated:true},media:{playable:true,source:'generated-video',mediaId:'harbor.task.'+id}});};
 remote('L1-E01');if(!s.simpleFlow.canPhotograph)throw Error('Valid fixture did not unlock first task');
 const film=(id,kind)=>{const e=s.rescue.capture(id,kind,true,undefined,0,true);s.rescue.commitCapture(e);s.analyzeEvidence({capture:e,media:{playable:true,source:'generated-video'}});};
 s.radioSay('你好，收到');for(const id of ['L1-E04','L1-E05','L1-E06'])remote(id);s.simpleFlow.takeImpact();remote('L1-E02');s.rescue.interact('power');s.rescue.interact('observe');s.rescue.step(.1,{nearB:true,zone:'lure',activeSonar:true,monsterInside:true});film('fixture-entry','lure');
 s.rescue.interact('observe',false);remote('L1-E07');s.radioSay('关住了吗？');if(s.rescue.state.departing)throw Error('Question authorized departure');film('fixture-gate','gate');s.radioSay('关住了，可以走');s.rescue.step(11,{nearB:true,zone:'observe',activeSonar:false,monsterInside:true});s.base.state.opened.push('harbor.edge.C-B');s.tick(.01);
 if(s.base.state.opened.includes('harbor.edge.C-B'))throw Error('Return route not closed');if(s.evidenceReady)throw Error('Escape clock bypassed safety video');
 remote('L1-E03');if(!s.evidenceReady)throw Error('Safety fixture not accepted');s.rescue.interact('exit');if(!s.complete)throw Error('Exit remained locked');
 const end=s.snapshot();if(!s.restore(end))throw Error('Completed simplified save rejected');
 const normalComplete=s.complete;
 if(!s.restore(snapshot))throw Error('Reset fixture failed');remote('L1-E01');s.radioSay('你好');for(const id of ['L1-E04','L1-E05','L1-E06'])remote(id);s.simpleFlow.takeImpact();remote('L1-E02');s.rescue.interact('power');s.radioSay('搞定了');remote('L1-E07');s.radioSay('关住了，可以走');for(let n=0;n<240&&!s.rescue.state.injured;n++)s.tick(.25);
 if(!s.rescue.state.injured||r.narrativeMemory.trust!==-2||r.narrativeMemory.partner!=='elias')throw Error('Injury consequence or partner wrong');remote('L1-E08');s.tick(20);remote('L1-E03');s.rescue.interact('exit');if(!s.complete||!s.restore(s.snapshot()))throw Error('Injury escape/save failed');
 return {initial,forged,local,powered,off,referenceStatus:response.status,restored,complete:normalComplete,injuryComplete:s.complete,injuredTrust:r.narrativeMemory.trust,syntheticAdapterOnly:true};
 });
 assert.equal(report.initial.hidden,true);assert.equal(report.initial.heard,true);assert.equal(report.initial.replied,false);assert.equal(report.powered,true);assert.equal(report.off,false);assert.equal(report.referenceStatus,200);assert.equal(report.complete,true);assert.deepEqual(report.initial.simple,report.restored);assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));console.log('PASS browser: new-game adapter, hidden Elias, invalid media/text rejection, save/restore, active power without pulse, reference HTTP. Synthetic protocol fixtures also verified task acceptance, actual rescue state, return closure, safety-result exit and completed save. All provider requests blocked; not genuine video or playthrough.');
}finally{await browser.close();}
