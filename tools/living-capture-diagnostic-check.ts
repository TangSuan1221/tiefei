import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LivingSurvey} from '../src/pod/sim/living-survey';
// Exercise the exact small production formatter without importing browser/media modules.
const source=readFileSync('src/pod/view/deepsea/living-deck-site.ts','utf8');
const formatter=source.match(/ describeEvidence\(capture:unknown\)\{const c=capture as SurveyCapture&\{livingTask\?:LivingTaskId\};(.*)\}/)![1]!;
const site={describeEvidence:Function('capture','const c=capture;'+formatter) as (c:unknown)=>string,evidenceFailure:(c:any)=>c.diagnostic};
const e={survey:true as const,id:'diagnostic.test',target:0,valid:false,lit:true,diagnostic:'当前取景中的调查对象太小，无法辨认；适当变焦。'};
assert.match(site.describeEvidence(e),/未确认底片.*太小/);
assert.doesNotMatch(site.describeEvidence(e),/供水操作说明|生物调查 1/);
assert.equal(site.describeEvidence({...e,valid:true,diagnostic:''}),'生物调查 1');
assert.equal(site.describeEvidence({...e,target:'manual',valid:true,diagnostic:''}),'供水操作说明');
const s=new LivingSurvey();s.briefed=true;
const issued=s.issue(e)!;assert.deepEqual(issued,e);s.commit(issued);assert.equal(s.analyze(issued),false);
const good={...e,id:'good',valid:true,diagnostic:''},tampered={...good,diagnostic:'tampered'};s.commit(s.issue(good)!);assert.equal(s.analyze(tampered),false);assert.equal(s.analyze(good),true);
console.log('PASS unconfirmed naming, retained valid labels, diagnostic survives issue/commit and remains signed; invalid evidence grants no progress');
