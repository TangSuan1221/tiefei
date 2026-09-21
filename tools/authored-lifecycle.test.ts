import test from 'node:test';
import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import type {AuthoredSite} from '../src/pod/sim/authored-site';
test('every site entry initializes authored world once and chapter mismatch rebuilds',()=>{
 const r=new PodRun(42);let created=0,disposed=0;
 r.createAuthoredSite=index=>({index,complete:false,description:'actual room',hint:'',move:()=>true,interact(){},draw(){},drawMap(){},snapshot(){return{};},dispose(){disposed++;}} satisfies AuthoredSite);
 const factory=r.createAuthoredSite;r.createAuthoredSite=i=>{created++;return factory(i);};
 r.frame(.01);assert.equal(created,0);
 r.phase='site';r.frame(.01);assert.equal(created,1);assert.equal(r.authoredSite?.index,0);
 r.frame(.01);assert.equal(created,1);
 r.legIndex=1;r.frame(.01);assert.equal(created,2);assert.equal(disposed,1);assert.equal(r.authoredSite?.index,1);
});
test('local archived tape owns the exact exposure image after live image changes',()=>{
 const r=new PodRun(42);r.walkTo('camera');r.phase='site';
 r.captureKeyframe=()=> 'data:image/png;base64,original';r.beginShoot();
 const captured=r.shot.keyframe;r.captureKeyframe=()=> 'data:image/png;base64,later';
 r.shot.exposeLeft=.001;r.frame(.02);
 assert.equal(r.tapes.at(-1)?.keyframe,captured);assert.equal(r.shot.phase,'ready');
 assert.match(r.videoStatus,/非生成视频/);
 assert.match(r.shot.reason,/未提交生成任务/);
 assert.equal(r.shot.viewing,false);
 r.toggleFootageView();assert.equal(r.at,'lab');assert.equal(r.shot.viewing,false);
});
