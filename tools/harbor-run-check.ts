import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import type {AuthoredSite} from '../src/pod/sim/authored-site';
import {ROUTE} from '../src/pod/content/route';

// Deliberately no renderer, environment credentials, or network sink.
function fixture(valid=true){
  const run=new PodRun(42);let analyzed=0;
  const source={target:'pod',valid:true};
  const site:AuthoredSite={index:0,complete:false,description:'harbor',hint:'shore power',
    managesThreats:true,noiseFloor:.6,canCounter:()=>false,
    get evidenceReady(){return valid && analyzed>0;},
    captureEvidence:()=>source,analyzeEvidence:s=>{const evidence=s as {capture:typeof source;media:{playable:boolean;source:string}};assert.equal(evidence.capture.target,'pod');assert.equal(evidence.media.playable,true);assert.equal(evidence.media.source,'controlled-video');analyzed++;return ['系泊结构已核验'];},
    move:()=>true,interact(){},draw(){},drawMap(){},snapshot:()=>({}),dispose(){}};
  run.phase='site';run.authoredSite=site;run.at='camera';run.power=1;
  run.captureKeyframe=()=>`data:image/png;base64,api-only`;
  let frame=0;run.captureSensorFrame=()=>`data:image/jpeg;base64,sensor-${frame++}`;
  const internal=run as unknown as {tickShot(dt:number):void;wakeSite(line:string):void;checkThreatBeats():void};
  return {run,source,internal,count:()=>analyzed};
}
{
  const {run,source,internal,count}=fixture();
  run.beginShoot();source.target='changed';
  assert.equal(run.tapes.length,0);
  for(let i=0;i<9;i++)internal.tickShot(.5);
  internal.tickShot(.4);assert.equal(run.tapes.length,0);
  internal.tickShot(.2);assert.equal(run.tapes.length,1);
  run.at='lab';run.analyzeTape();assert.equal(count(),0);
  internal.tickShot(11.9);run.analyzeTape();assert.equal(count(),0);
  internal.tickShot(.2);run.analyzeTape();assert.equal(count(),1);
  assert.equal(run.selectedTape?.videoResult,'failed');
  assert.equal(run.selectedTape?.sensorEvidence,true);
  assert.equal(run.campaign.has(0,'film'),true);
  assert.equal(run.selectedTape?.keyframe,'data:image/png;base64,api-only');
  assert.ok(run.selectedTape?.sensorFrames?.every(frame=>frame.startsWith('data:image/jpeg;')));
  run.analyzeTape();assert.equal(count(),1);
  internal.wakeSite('must not spawn');internal.checkThreatBeats();assert.equal(run.threat,null);
}
{
  const {run,internal,count}=fixture();
  run.footageSink=()=>{}; // pending remote job must not lock sensor evidence
  run.beginShoot();for(let i=0;i<10;i++)internal.tickShot(.5);internal.tickShot(12);
  run.at='lab';run.analyzeTape();assert.equal(count(),1);
  assert.notEqual(run.selectedTape?.videoResult,'video');
}
{
  const {run,internal,count}=fixture();
  run.beginShoot();run.at='lab';internal.tickShot(5);
  assert.equal(run.tapes.length,0);run.analyzeTape();assert.equal(count(),0);
}
assert.equal(ROUTE[0].depth,1012);
assert.equal(new PodRun(42).leg.depth,1012);
{
  const {run,internal}=fixture();
  run.beginShoot();
  assert.deepEqual(run.shot.sensorFrames,['data:image/jpeg;base64,sensor-0']);
  // Non-divisible frame intervals retain overshoot instead of slowly losing samples.
  for(let i=0;i<95;i++)internal.tickShot(.053);
  const frames=run.selectedTape!.sensorFrames!;
  assert.equal(frames.length,10);assert.equal(new Set(frames).size,10);
  assert.equal(frames[9],'data:image/jpeg;base64,sensor-9');
}
{
  const {run,internal}=fixture();run.beginShoot();
  internal.tickShot(5);
  assert.equal(run.selectedTape!.sensorFrames!.length,2,'one stalled update must not manufacture missed frames');
}
{
  const {run,internal}=fixture(false);
  run.authoredSite!.analyzeEvidence=()=>['取景无效：未拍到救生舱'];
  run.beginShoot();for(let i=0;i<10;i++)internal.tickShot(.5);internal.tickShot(12);
  run.at='lab';run.analyzeTape();
  assert.equal(run.selectedTape?.analyzed,true);
  assert.equal(run.campaign.has(0,'film'),false);
}
{
  const {run,internal,count}=fixture();
  run.captureSensorFrame=null;
  run.beginShoot();for(let i=0;i<10;i++)internal.tickShot(.5);internal.tickShot(12);
  run.at='lab';run.analyzeTape();
  assert.equal(count(),0);assert.equal(run.campaign.has(0,'film'),false);
  assert.equal(run.selectedTape?.sensorFrames?.length,0);
}
for(const policy of ['deny','throw','allow','null','later'] as const){
  const {run}=fixture();let disposed=0,calls=0;
  if(policy==='later')run.legIndex=1;
  const site:AuthoredSite={...run.authoredSite!,index:run.legIndex,complete:true,dispose(){disposed++;}};
  run.authoredSite=site;run.campaign.record(run.legIndex,'film');
  run.onBeforeDepart=policy==='null'?null:()=>{
    calls++;assert.equal(run.authoredSite,site);assert.equal(disposed,0);
    assert.equal(run.campaign.has(0,'departure'),false);
    if(policy==='throw')throw new Error('save failed');
    return policy==='allow';
  };
  const before=run.legIndex;run.depart();
  if(policy==='deny'||policy==='throw'){
    assert.equal(run.authoredSite,site);assert.equal(disposed,0);
    assert.equal(run.phase,'site');assert.equal(run.legIndex,before);
    assert.equal(run.campaign.has(0,'departure'),false);assert.equal(calls,1);
    run.onBeforeDepart=()=>true;run.depart();assert.equal(disposed,1);
  }else{
    assert.equal(disposed,1);assert.equal(run.authoredSite,null);
    assert.equal(run.legIndex,before+1);assert.equal(run.phase,'transit');
    assert.equal(calls,policy==='allow'?1:0);
  }
}
console.log('harbor-run: photography evidence and departure save barrier (deny, throw, retry, allow, null, later chapter) PASS');
