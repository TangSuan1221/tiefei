import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage();await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView);
 await p.keyboard.down('w');await p.waitForTimeout(1600);await p.keyboard.up('w');await p.keyboard.press('e');
 const entered=await p.evaluate(()=>window.__pod.at);assert(entered,'E enters cockpit');
 for(const station of ['camera','nav','lab']){await p.evaluate(station=>window.__pod.walkTo(station),station);for(const key of ['w','a','s','d'])await p.keyboard.press(key);assert.equal(await p.evaluate(()=>window.__pod.at),station);}
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.__pod.at),null);
 const result=await p.evaluate(()=>{
 const r=window.__pod;r.receive();r.arrive();const s=r.authoredSite;r.activeSonarEnabled=true;r.gmInfinitePower=true;s.rescue.step(1,{nearB:true,zone:'observe',activeSonar:false});s.rescue.listen();s.rescue.reply();const e=s.rescue.capture('test','threat',true);s.rescue.commitCapture(e);s.rescue.analyze(e);
 const cues=[];const original=r.onCue;r.onCue=id=>cues.push(id);r.toggleSonarPulses();
 s.visual.monster.position.copy(s.position);s.visual.monster.position.x+=23;s.threatBeepLeft=0;s.tickThreatBeep(.01);const far=s.threatBeepLeft;
 s.visual.monster.position.x=s.position.x+2;s.threatBeepLeft=0;s.tickThreatBeep(.01);const near=s.threatBeepLeft;
 const c=document.createElement('canvas');c.width=c.height=400;const ctx=c.getContext('2d');s.drawThreat(ctx,400,400,0,true);const red=ctx.getImageData(0,0,400,400).data.some((v,i,a)=>i%4===0&&v>200&&a[i+1]<90&&a[i+3]>0);
 r.stopSonarPulses();ctx.clearRect(0,0,400,400);s.drawThreat(ctx,400,400,0,true);const cleared=!ctx.getImageData(0,0,400,400).data.some(v=>v!==0);const count=cues.length;s.tickThreatBeep(30);const silent=cues.length===count;r.onCue=original;return{far,near,red,cleared,silent,beeps:cues.filter(x=>x==='sonar.threat').length};
 });assert(result.near<result.far);assert(result.red&&result.cleared&&result.silent);assert.equal(result.beeps,2);console.log('PASS E/WASD/Esc on all cockpit stations; red threat marker, stop clears/silences, near beeps faster',result);
}finally{await b.close();}
