import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage(),errors=[];let apiCalls=0;page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('ironlung.gm.novideo','1'));await page.route('**/api/**',r=>{apiCalls++;return r.abort();});
await page.goto(process.env.HARBOR_TEST_URL??'http://127.0.0.1:5187/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
const result=await page.evaluate(async()=>{
 const r=window.__pod;r.receive();r.arrive();r.activeSonarEnabled=false;r.at='lab';const s=r.authoredSite;s.tick(.1);const fresh=s.snapshot();const {captureHarborSave,isHarborSave}=await import('/src/pod/sim/harbor-save.ts');const formalBefore=captureHarborSave(r);if(!formalBefore)throw Error('Formal baseline snapshot unavailable');
 const task=()=>{const id=s.simpleFlow.pending;if(!id)throw Error('No pending task');s.tick(.1);if(!s.simpleFlow.accepted.includes(id))throw Error('Task not auto-advanced '+id);};
 task();s.radioSay('你好');task();task();task();s.simpleFlow.takeImpact();task();
 if(!r.gmLevelSession||!s.snapshot().debugNoVideo)throw Error('Diagnostic taint missing');
 if(captureHarborSave(r)!==null)throw Error('Diagnostic run writable to official slot');
 const diagnostic=s.snapshot();sessionStorage.setItem('ironlung.gm.novideo','0');if(s.restore(diagnostic))throw Error('Diagnostic loaded into official mode');if(s.prepareCapture().ok)throw Error('Diagnostic disabled mode allowed paid capture');const before=JSON.stringify(s.rescue.state);s.tick(30);s.radioSay('搞定了');if(JSON.stringify(s.rescue.state)!==before)throw Error('Diagnostic advanced after disabling mode');sessionStorage.setItem('ironlung.gm.novideo','1');
 s.rescue.interact('power');s.rescue.interact('observe');s.pursuit.position.set(77,-1.2,7);s.rescue.step(.1,{nearB:true,zone:'lure',activeSonar:false,monsterInside:true});
 // Diagnostic fixture only: commit a snapshot to exercise local analysis, never declare generated media.
 const e=s.rescue.capture('qa-local-entry','lure',true,undefined,0,true);s.rescue.commitCapture(e);r.tapes.push({id:'qa-local-entry',legId:r.leg.id,siteEvidence:e,videoResult:'prompt',report:[],analyzed:false});r.tapeCursor=r.tapes.length-1;s.radioSay('诊断分析底片');if(!s.simpleFlow.entryAnalyzed)throw Error('Local diagnostic analysis failed');if(s.simpleFlow.pending!==null||!s.objective.includes('回01'))throw Error('Entry film overrode closing instructions');
 s.radioSay('搞定了');task();if(s.dialogueChoices.includes('关住了，可以走'))throw Error('Premature safe suggestion');s.radioSay('关住了，可以走');s.tick(.5);s.radioSay('先别走，我还没关声纳');if(s.rescue.state.departing)throw Error('Compound hold ignored');
 s.radioSay('关住了，可以走');let ticks=0,insideInjury=false;while(ticks++<280&&!s.rescue.state.injured){s.tick(.1);if(s.pursuit.inside&&s.rescue.state.injured)insideInjury=true;}
 if(!s.rescue.state.injured)throw Error('No injury after actual approach: '+JSON.stringify({position:s.pursuit.position.toArray(),distance:s.pursuit.position.distanceTo(new (await import('/node_modules/.vite/deps/three.js')).Vector3(57,-1.2,11)),threat:s.npcThreat(),state:s.rescue.state}));
 if(insideInjury)throw Error('Injured from inside cargo');if(r.narrativeMemory.trust!==-1)throw Error('Trust did not preserve honest hold then injury');task();for(let n=0;n<210;n++)s.tick(.1);task();s.rescue.interact('exit',false,true);if(!s.complete)throw Error('Diagnostic branch failed to complete');if(!s.restore(s.snapshot()))throw Error('Diagnostic restore rejected');
 if(isHarborSave({...formalBefore,site:s.snapshot()}))throw Error('Diagnostic snapshot accepted as official');
 return {diagnosticComplete:s.complete,injuryAfterSeconds:ticks/10,actualMonsterPosition:s.pursuit.position.toArray(),trust:r.narrativeMemory.trust,formalSaveBlocked:captureHarborSave(r)===null,normalRestoreRejected:true,entryGuidancePreserved:true};
});assert.deepEqual(errors,[]);assert.equal(apiCalls,0);console.log(JSON.stringify({...result,apiCalls},null,2));console.log('PASS: explicitly labelled GM diagnostics, no generated media or API calls; compound hold, entry guidance, spatial injury and official-save isolation. Diagnostic setup, not blind driving.');
}finally{await browser.close();}
