import {openLevelTwo,startNew} from './living-browser-lib.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const dir='qa/living-2026-10-27';mkdirSync(dir,{recursive:true});
const {browser,page,errors}=await openLevelTwo(dir);let report;
try{await startNew(page);report=await page.evaluate(async()=>{
 const l=window.__living,r=window.__pod;const results=[];const check=(name,pass,detail)=>results.push({name,pass,detail});
 const initial=l.snapshot();check('initial_snapshot_restores',l.restore(initial));
 const before=JSON.stringify(l.snapshot()),bad=structuredClone(initial);bad.survey.code='x';check('invalid_restore_rejected_atomic',!l.restore(bad)&&JSON.stringify(l.snapshot())===before);
 const mod=await import('/src/pod/sim/living-survey.ts');const s=new mod.LivingSurvey();s.acceptVideo('L2-S01');s.operate('body');s.operate('transfer');s.acceptVideo('L2-S02');
 const dark={survey:true,id:'dark',target:0,valid:true,lit:false};s.issue(dark);s.commit(dark);check('dark_capture_rejected',!s.analyze(dark)&&s.photos.length===0);
 const fabricated={survey:true,id:'fabricated',target:0,valid:true,lit:true};check('unissued_capture_rejected',!s.analyze(fabricated));
 const prev=JSON.stringify(l.survey.snapshot());l.analyzeEvidence({capture:{livingTask:'L2-S01',generated:true},media:{playable:true,source:'generated-video',mediaId:'fake'}});check('fabricated_task_media_rejected',JSON.stringify(l.survey.snapshot())===prev);
 check('typed_code_cannot_unlock',(s.say(s.code),!s.unlocked)&&typeof s.enterCode==='undefined');
 check('scene_personnel_absent',!l.world.root.getObjectByName('living.personnel'),l.world.root.children.map(o=>o.name));
 const inv0=r.stowedCount('sup.plate');l.armObject='living.box.tools';l.pendingCargo='living.box.tools';l.armEvent('stowed');const inv1=r.stowedCount('sup.plate');l.armObject='living.box.tools';l.pendingCargo='living.box.tools';l.armEvent('stowed');const inv2=r.stowedCount('sup.plate');check('repair_awarded_once',inv1===inv0+2&&inv2===inv1,{inv0,inv1,inv2,note:'direct arm callback injection, not physical pickup'});
 return {results,position:l.diag.state().pos,errors:[],method:'Runtime diagnostic integration; direct state/callback mutations; no physical playthrough; API blocked'};
 });report.errors=errors;writeFileSync(dir+'/independent-logic.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}
