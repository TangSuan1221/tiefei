import assert from 'node:assert/strict';
import {harborGuide,harborGuideMedia} from '../src/pod/sim/harbor-guidance';
import {HARBOR} from '../src/pod/content/harbor-level';
import type {HarborExposure} from '../src/pod/sim/harbor-progress';
const tokens=[HARBOR.permit,HARBOR.tool,HARBOR.power,HARBOR.photo,HARBOR.module,HARBOR.discrepancy,HARBOR.searchComplete,HARBOR.card,HARBOR.cardAnalyzed,HARBOR.routeRecord,HARBOR.route,HARBOR.exitReady,HARBOR.depthReady];
const stages=['report','tools','power','photo','module','compare','search','card','card-review','diversion','route','exit','reserve','depart'];
for(let i=0;i<=tokens.length;i++){
 const held=Object.freeze(tokens.slice(0,i));
 assert.equal(harborGuide(held,'idle').id,stages[i]);
 assert(harborGuide(held,'idle').action.length>10);
}
assert.equal(harborGuide(tokens.slice(0,3),'developing').id,'develop');
assert.equal(harborGuide(tokens.slice(0,3),'ready').id,'review');
assert.equal(harborGuide([HARBOR.card],'ready').id,'report');
const shot=(valid:boolean,status:HarborExposure['status'],mediaId?:string)=>({valid,status,mediaId,analyzed:false} as HarborExposure);
assert.equal(harborGuideMedia([shot(false,'ready','other-video')]),'idle');
assert.equal(harborGuideMedia([shot(true,'failed')]),'idle');
assert.equal(harborGuideMedia([shot(true,'pending')]),'developing');
assert.equal(harborGuideMedia([shot(true,'ready','video')]),'ready');
assert.equal(harborGuideMedia([shot(true,'ready')]),'idle');
assert.equal(harborGuideMedia([{...shot(true,'ready','video'),analyzed:true}]),'idle');
console.log('PASS: 14 progression stages, processing/review, out-of-order evidence, unrelated/failed/non-video footage; no inventory mutation.');
