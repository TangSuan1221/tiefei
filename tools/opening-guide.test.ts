import test from 'node:test';
import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {OPENING_CALL} from '../src/pod/content/campaign-story';
test('opening persists until actual reception and advances only on successful actions',()=>{
 const r=new PodRun(42);
 assert.match(r.openingGuide!,/按 3/);assert.equal(r.radioWaiting,true);
 for(let i=0;i<500;i++)r.frame(.05);
 assert.match(r.openingGuide!,/按 3/);
 r.walkTo('radio');assert.match(r.openingGuide!,/按 1/);
 assert.equal(r.receive()?.text,OPENING_CALL);assert.equal(r.openingReceived,true);
 assert.equal(r.storyCaption,OPENING_CALL);assert.match(r.openingGuide!,/按 6/);
 r.walkTo('nav');assert.match(r.openingGuide!,/按 2/);
 r.ping(0);assert.equal(r.openingScanned,false);
 r.ping(1);assert.equal(r.openingScanned,true);assert.match(r.openingGuide!,/接通推进/);
});
test('no power does not complete scan; opening hints end with source film',()=>{
 const r=new PodRun(42);r.power=0;r.ping(1);assert.equal(r.openingScanned,false);
 r.campaign.record(0,'film');assert.equal(r.openingGuide,null);
});
