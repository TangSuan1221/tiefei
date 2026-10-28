import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='qa/living-2026-10-27/objective-layout';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&!r.request().url().includes('/api/')?r.continue():r.abort());
 await page.goto((process.env.LIVING_URL??'http://127.0.0.1:5180')+'/');
 const results=await page.evaluate(async()=>{
  const {LivingSurvey}=await import('/src/pod/sim/living-survey.ts');const {drawTacticalObjective}=await import('/src/pod/view/tactical-objective.ts');
  const s=new LivingSurvey();s.acceptVideo('L2-S01');s.operate('body');s.operate('transfer');s.acceptVideo('L2-S02');
  const results=[];
  for(const [w,h] of [[1600,900],[1280,720],[1024,576]]){
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
   const panels=[];const fill=ctx.fillRect.bind(ctx);ctx.fillRect=(...a)=>{panels.push(a);fill(...a);};
   const run={authoredSite:{index:1,objective:'【GM无视频】剧情自动推进；怪物底片在分析台按 3 诊断\n'+s.objective+'\n导航坐标 X53 Y24 深度1040m\n下一段：机修间'},clock:0,hull:.5,power:.18,powered:true,activeSonarEnabled:true};
   drawTacticalObjective(ctx,run,w,h);const p=panels[0];results.push({w,h,panel:p,bottom:p[1]+p[3],withinViewport:p[1]+p[3]<=h});
  }return results;
 });
 writeFileSync(dir+'/results.json',JSON.stringify({method:'Actual canvas text metrics and production HUD renderer with worst-case diagnostic/status text; not screenshot or gameplay verification.',results},null,2));console.log(JSON.stringify(results));if(results.some(r=>!r.withinViewport))process.exitCode=1;
}finally{await browser.close();}
