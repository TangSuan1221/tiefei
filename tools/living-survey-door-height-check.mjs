import {openLevelTwo,startNew} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const {browser,page,errors}=await openLevelTwo('qa/living-2026-10-27');
const out={method:'Diagnostic legal teleport and normal site.move/moveVertical with actual hull/colliders; not keyboard or blind play; API blocked',cases:[]};
try{
 await startNew(page);
 out.cases=await page.evaluate(async()=>{
  const l=window.__living,r=window.__pod;await l.world.ready;r.at='camera';r.pitch=0;
  const results=[];
  function reset(x,y,z){l.feedbackText='';l.moveBlockedAt=-1e9;return l.diag.teleport(x,y,z,180);}
  function drive(n=70){let moved=0;for(let i=0;i<n;i++)if(l.move(.1))moved++;return {moved,pos:l.diag.state().pos,feedback:l.feedbackText};}
  for(const x of [50.3,53]){
   const legal=reset(x,1.3,7.5),high=drive();
   const descended=l.moveVertical(-1.3);l.feedbackText='';l.moveBlockedAt=-1e9;
   const low=drive();let realigned=null;
   if(x===50.3){const reverse=l.move(-2);r.heading=l.turn(-90);const across=l.move(2.7);r.heading=l.turn(90);l.feedbackText='';realigned={reverse,across,heading:r.heading,...drive(90)};}
   results.push({name:'high_then_descend',x,legal,high,descended,low,realigned});
  }
  const legal=reset(53,0,9.2);results.push({name:'centerline',legal,...drive()});
  const gateLegal=reset(128.5,0,37);results.push({name:'closed_survey_gate',legal:gateLegal,lift:l.surveyGateLift,bounds:{min:l.world.surveyGate.bounds.min.toArray(),max:l.world.surveyGate.bounds.max.toArray()},...drive(90)});
  return results;
 });
}catch(e){out.failure=String(e);}finally{out.errors=errors;writeFileSync('qa/living-2026-10-27/independent-door-height.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));await browser.close();}

