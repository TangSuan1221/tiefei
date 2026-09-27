import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {captureHarborSave,restoreHarborSave,writeHarborSave,readHarborSave,hasHarborSave,HARBOR_SAVE_KEY,type SaveStorage} from '../src/pod/sim/harbor-save';
import {newHarborProgress,captureHarborEvidence,resolveHarborEvidence,analyzeHarborEvidence,HARBOR_PHOTO_TARGET} from '../src/pod/sim/harbor-progress';
const data=new Map<string,string>();
const storage:SaveStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}};
function fixture(seed:number){
 const run=new PodRun(seed);run.phase='site';
 let snapshot={index:0,levelId:'harbor.1',state:{version:1,levelId:'harbor.1',inventory:['E01'],collected:[],opened:['C-B'],visited:[],recorded:[]},position:[1,-8,3],harbor:newHarborProgress()};
 const adapter={index:0,complete:false,description:'',hint:'',move:()=>true,interact:()=>{},draw:()=>{},drawMap:()=>{},dispose:()=>{},snapshot:()=>snapshot,
 restore:(s:unknown)=>{snapshot=structuredClone(s) as typeof snapshot;return true;},
 analyzeEvidence:(packet:unknown)=>{
  const p=packet as {capture:{id:string};media:Parameters<typeof resolveHarborEvidence>[2]};
  const resolved=resolveHarborEvidence(snapshot.harbor,p.capture.id,p.media);snapshot.harbor=resolved.state;
  const analyzed=analyzeHarborEvidence(snapshot.harbor,snapshot.state.inventory,p.capture.id);snapshot.harbor=analyzed.state;
  return [analyzed.message];
 }};
 run.authoredSite=adapter;run.createAuthoredSite=()=>adapter;return run;
}
const run=fixture(123);run.power=.43;run.heading=145;run.campaign.record(0,'arrival');
run.tapes.push({id:'test',legId:'harbor.1',siteName:'港口',purpose:'identify',atBreath:3,fauna:[],caughtThreat:null,creatureMissing:false,analyzed:false,report:[],keyframe:'x'.repeat(2_000_000)});
const save=captureHarborSave(run)!;assert.ok(save);assert.equal(save.run.tapes[0].keyframe,undefined);
writeHarborSave(storage,save);assert.equal(readHarborSave(storage)?.seed,123);assert.ok(hasHarborSave(storage));
const restored=fixture(123);assert.ok(restoreHarborSave(restored,save));assert.equal(restored.power,.43);assert.equal(restored.heading,145);
assert.ok(restored.campaign.has(0,'arrival'));assert.equal(restored.campaign.has(0,'film'),false);
assert.deepEqual(restored.authoredSite?.snapshot(),save.site);assert.equal(restored.tapes[0].analyzed,false);
const old=data.get(`${HARBOR_SAVE_KEY}.123`);writeHarborSave(storage,captureHarborSave(fixture(456))!);assert.equal(data.get(`${HARBOR_SAVE_KEY}.123`),old);
run.arm.phase='extending';assert.equal(captureHarborSave(run),null);run.arm.phase='stowed';
run.shot.phase='developing';assert.equal(captureHarborSave(run),null);run.shot.phase='idle';
run.outcome={kind:'dead',cause:'implosion',line:'test'};assert.equal(captureHarborSave(run),null);
const bad=structuredClone(save);bad.site.levelId='mining.1';assert.throws(()=>writeHarborSave(storage,bad));
const mismatch=structuredClone(save);mismatch.site.levelId='harbor.2';assert.equal(restoreHarborSave(fixture(123),mismatch),false);
const before=new Map(data);const full:SaveStorage={getItem:storage.getItem,setItem:()=>{throw new Error('QuotaExceededError');}};
assert.throws(()=>writeHarborSave(full,save));assert.deepEqual(data,before);
const pointerFail:SaveStorage={getItem:storage.getItem,setItem:(k,v)=>{if(k===HARBOR_SAVE_KEY)throw new Error('pointer failure');data.set(k,v);}};
const changed=structuredClone(save);changed.run.power=.2;assert.throws(()=>writeHarborSave(pointerFail,changed));assert.equal(data.get(`${HARBOR_SAVE_KEY}.123`),old);
data.set(HARBOR_SAVE_KEY,'{broken');assert.equal(hasHarborSave(storage),false);
// Finished exposure is still pending until explicit lab analysis; this is NOT a network job.
data.delete(HARBOR_SAVE_KEY);
const photographed=fixture(789);
const scene=photographed.authoredSite!.snapshot() as {harbor:ReturnType<typeof newHarborProgress>};
const capture={id:'harbor.exposure.1',roomId:'harbor.room.B',position:[1,0,3] as [number,number,number],direction:[0,0,-1] as [number,number,number],capturedAt:10,targetId:HARBOR_PHOTO_TARGET,targetVisible:true,unobstructed:true,distance:10,stableSeconds:1,lightOn:true,threat:'calm'};
scene.harbor=captureHarborEvidence(scene.harbor,capture).state;
const frames=Array.from({length:11},(_,i)=>`data:image/jpeg;base64,${String(i).repeat(5000)}`);
photographed.tapes.push({...run.tapes[0],id:capture.id,legId:photographed.leg.id,siteEvidence:capture,ready:true,sensorEvidence:true,sensorFrames:frames,videoResult:'failed'});
photographed.shot.phase='ready';
const pendingSave=captureHarborSave(photographed)!;assert.ok(pendingSave);
assert.equal(pendingSave.site.harbor.exposures[0].status,'pending');
assert.deepEqual(pendingSave.run.tapes[0].sensorFrames,frames);
assert.equal(pendingSave.run.shot,undefined);
writeHarborSave(storage,pendingSave);
const continued=fixture(789);let networkCalls=0;continued.footageSink=()=>{networkCalls++;};
assert.ok(restoreHarborSave(continued,readHarborSave(storage)!));
assert.equal(continued.shot.phase,'idle');assert.equal(continued.tapes[0].analyzed,false);
assert.deepEqual(continued.tapes[0].sensorFrames,frames);continued.at='lab';continued.analyzeTape();
assert.equal(continued.tapes[0].analyzed,true);
const progress=(continued.authoredSite!.snapshot() as typeof scene).harbor;
assert.equal(progress.exposures[0].status,'ready');assert.equal(progress.exposures[0].analyzed,true);
assert.equal(progress.exposures[0].source,'controlled-video');assert.equal(networkCalls,0);
// Invalid captures stay ungranted but must not prevent any future save.
scene.harbor=captureHarborEvidence(scene.harbor,{...capture,id:'harbor.exposure.2',targetVisible:false}).state;
assert.ok(captureHarborSave(photographed));
const savedBefore=data.get(`${HARBOR_SAVE_KEY}.789`);writeHarborSave(storage,captureHarborSave(photographed)!);
assert.notEqual(data.get(`${HARBOR_SAVE_KEY}.789`),savedBefore);assert.equal(networkCalls,0);
// Bounded storage samples actual successive frames; it never duplicates a still image.
photographed.tapes[0].sensorFrames=Array.from({length:11},(_,i)=>`data:image/jpeg;base64,${String(i).repeat(100000)}`);
const sampled=captureHarborSave(photographed)!;assert.equal(sampled.run.tapes[0].sensorFrames.length,3);
assert.equal(sampled.run.tapes[0].sensorFrames[1],photographed.tapes[0].sensorFrames[5]);
console.log('PASS harbor saves: round-trip, evidence, doors, campaign, keyframe budget, slot isolation, unsafe guards, legacy rejection, exact level, quota and pointer failure.');
console.log('PASS pending exposure -> save -> continue -> lab analysis, invalid exposure save, same-seed update, bounded sensor sequence; zero network tasks.');
