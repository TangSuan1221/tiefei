import assert from 'node:assert/strict';
import {videoPolicy,slotPrompt,videoContextKey,type VideoContext} from '../src/pod/content/video-policy';
import {PodRun} from '../src/pod/sim/run';
const c:VideoContext={story:false,settled:false,stateKey:'gate-1',nearestMonster:31,scene:'harbor',actors:['Elias'],monsters:['pale limbed harbor creature'],outcome:'already isolated'};
assert.deepEqual(videoPolicy(c),{duration:5,allowed:false});assert.equal(videoPolicy({...c,nearestMonster:30}).allowed,true);
assert.deepEqual(videoPolicy({...c,story:true}),{duration:10,allowed:true});
assert(slotPrompt({...c,story:true}).includes('DURATION_SECONDS: 10'));assert(slotPrompt(c).includes('Never substitute sharks'));
assert.notEqual(videoContextKey(c,[0]),videoContextKey(c,[1]));assert.notEqual(videoContextKey(c,[0]),videoContextKey({...c,stateKey:'changed'},[0]));
const run=new PodRun(314),r=run as any,requests:any[]=[];
r.power=1;r.blackout=false;r.throttle=0;r.captureKeyframe=()=> 'data:image/png;base64,AA==';r.footageSink=(x:any)=>{requests.push(x);x.settle(-1,true);};
let context={...c,story:true,settled:false};r.authoredSite={index:0,position:{x:0,y:0,z:0},videoContext:()=>context};
r.warmStoryVideo(3);assert.equal(requests.length,0,'unresolved outcome was prepaid');
context={...context,settled:true};r.warmStoryVideo(.5);r.warmStoryVideo(3);assert.equal(requests.length,1);assert.equal(requests[0].duration,10);assert.equal(requests[0].prefetch,true);
r.warmStoryVideo(10);assert.equal(requests.length,1,'duplicate prepay');r.heading+=10;r.warmStoryVideo(.5);r.warmStoryVideo(3);assert.equal(requests.length,1,'camera motion prepaid same branch twice');
context={...context,stateKey:'gate-2'};r.warmStoryVideo(.5);r.warmStoryVideo(3);assert.equal(requests.length,2);assert.notEqual(requests[0].cacheKey,requests[1].cacheKey);
console.log('PASS video policy: 5/10 seconds, 30m billing gate, fixed monster slots, resolved-only prefetch, pose/state invalidation, branch dedup');
function expose(context:VideoContext){
 const r:any=new PodRun(818),sent:any[]=[];r.phase='site';r.at='camera';r.power=1;r.blackout=false;
 r.captureKeyframe=()=> 'data:image/png;base64,AA==';r.captureSensorFrame=()=> 'data:image/jpeg;base64,AA==';
 r.authoredSite={index:0,description:'harbor',position:{x:0,y:0,z:0},captureEvidence:()=>({id:'actual-shutter'}),videoContext:()=>context};
 r.footageSink=(req:any)=>sent.push(req);r.beginShoot();for(let i=0;i<55;i++)r.tickShot(.1);
 assert.equal(sent.length,1,'actual exposure did not dispatch one policy-bearing request');return sent[0];
}
const empty=expose(c);assert.equal(empty.allowed,false);assert.equal(empty.duration,5);
const observation=expose({...c,nearestMonster:10});assert.equal(observation.allowed,true);assert.equal(observation.duration,5);
const story=expose({...c,story:true,settled:true});assert.equal(story.duration,10);assert(story.prompt.includes('MONSTER_SUBJECTS: pale limbed harbor creature'));assert(!story.prompt.includes('five-second'));
assert.equal(story.prompt,story.fallbackPrompt,'authored monster must not be removed by a generic retry');
console.log('PASS actual shutter dispatch: empty scene skipped, observation 5s, story 10s, authored roster overrides old random encounter');
