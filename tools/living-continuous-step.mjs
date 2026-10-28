// Runs one step module against the page held by living-continuous-host.mjs: node tools/living-continuous-step.mjs <step.mjs>
// A step exports default async ({page,lib,log})=>result. Steps must use real input; state reads are for assertions only.
import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';
import * as lib from './living-browser-lib.mjs';
const port=Number(process.env.CDP_PORT??9351),file=process.argv[2],trace=process.env.TRACE??'qa/living-survey/continuous/trace.jsonl';
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('level=2'));
if(!page)throw Error('no level-two page');
const log=async label=>{
 const s=await page.evaluate(()=>{const r=window.__pod,l=window.__living;if(!l)return {menu:true};const d=l.diag.state();return {pos:d.pos.map(v=>+v.toFixed(2)),heading:+r.heading.toFixed(1),hull:+r.hull.toFixed(3),power:+r.power.toFixed(4),cells:r.count('sup.cell'),plates:r.count('sup.plate'),at:r.at,arm:r.arm.phase,shot:r.shot.phase,survey:{camera:d.survey.camera,shared:d.survey.shared,photos:d.survey.photos,accepted:d.survey.accepted,manual:d.survey.manual,valve:d.survey.valve,unlocked:d.survey.unlocked,ballast:d.survey.ballast,reunion:d.survey.reunion,complete:d.survey.complete},
  creatures:d.creatures.map(c=>({id:c.id,mode:c.mode,pos:c.pos.map(v=>+v.toFixed(1))})),feedback:l.feedbackText,outcome:r.outcome.kind,legIndex:r.legIndex};});
 const row={label,time:new Date().toISOString(),...s};appendFileSync(trace,JSON.stringify(row)+'\n');const {creatures:_c,...brief}=row;console.log(JSON.stringify(brief).slice(0,700));return row;
};
try{const step=(await import(pathToFileURL(file).href+'?t='+Date.now())).default;const out=await step({page,lib,log});if(out!==undefined)console.log('result',JSON.stringify(out));}
catch(e){console.log('step error',String(e));await log('error').catch(()=>{});process.exitCode=1;}
finally{await browser.close();}
